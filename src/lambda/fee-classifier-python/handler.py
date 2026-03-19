"""
Fee Classifier Lambda Handler

Exposes JSON-RPC tools:
- classify_fees: Classify fee names into accounting codes using DSPy
- optimize_model: Run MIPROv2 optimization on accumulated fee corrections
- classify_bank_transaction: Classify bank transactions into GL accounts
- optimize_bank_recon_model: Run MIPROv2 optimization for bank recon
- match_orders: Match sales orders to candidate invoices (AR reconciliation)
- optimize_ar_match_model: Run MIPROv2 optimization for AR order-invoice matching

Invoked from Convex via MCP client pattern.
"""

import json
import os
import logging
import boto3
from typing import Any

import dspy
from dspy.teleprompt import BootstrapFewShot

from fee_module import (
    FeeClassifier,
    BatchFeeClassifier,
    ClassifyFee,
    VALID_ACCOUNT_CODES,
    create_training_examples,
    classification_metric,
    configure_lm,
    create_refined_fee_classifier,
    fee_reward_fn,
)
from bank_recon_module import (
    BankTransactionClassifier,
    create_bank_recon_training_examples,
    bank_recon_classification_metric,
    create_refined_bank_classifier,
    bank_recon_reward_fn,
)
from po_matching_module import (
    POMatchingModule,
    VarianceDiagnoser,
    create_po_matching_training_examples,
    po_matching_metric,
    create_refined_po_matcher,
    create_refined_variance_diagnoser,
)
from ar_match_module import (
    OrderInvoiceMatcher,
    create_training_examples as create_ar_match_training_examples,
    matching_metric as ar_matching_metric,
    create_refined_ar_matcher,
    ar_match_reward_fn,
)

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Module-level state (persists across warm invocations)
_classifier: FeeClassifier | None = None
_bank_recon_classifier: BankTransactionClassifier | None = None
_po_matcher: POMatchingModule | None = None
_variance_diagnoser: VarianceDiagnoser | None = None
_ar_matcher: OrderInvoiceMatcher | None = None
_s3_client = None
S3_BUCKET = "finanseal-bucket"
DSPY_MODELS_PREFIX = "dspy-models"
MIN_CORRECTIONS_FOR_DSPY = 20
FALLBACK_CONFIDENCE_CAP = 0.80


def _get_s3_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client("s3", region_name="us-west-2")
    return _s3_client


def _load_classifier(s3_key: str | None = None) -> FeeClassifier:
    """Load classifier, optionally restoring optimized state from S3.

    Returns the raw FeeClassifier (not Refine-wrapped) so handler can
    wrap it with dspy.Refine after BootstrapFewShot compilation.
    """
    global _classifier

    classifier = FeeClassifier()

    if s3_key:
        try:
            s3 = _get_s3_client()
            response = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
            state_json = response["Body"].read().decode("utf-8")
            # Write to temp file for DSPy load
            tmp_path = f"/tmp/model_{s3_key.replace('/', '_')}.json"
            with open(tmp_path, "w") as f:
                f.write(state_json)
            classifier.load(tmp_path)
            logger.info(f"Loaded DSPy model from s3://{S3_BUCKET}/{s3_key}")
        except Exception as e:
            logger.warning(f"Failed to load model from S3: {e}. Using base classifier.")

    _classifier = classifier
    return classifier


def _classify_fees(params: dict) -> dict:
    """Classify a batch of fee names into accounting codes."""
    platform = params.get("platform", "unknown")
    fees = params.get("fees", [])
    gross_amount = params.get("grossAmount")
    net_amount = params.get("netAmount")
    corrections = params.get("businessCorrections", [])
    model_s3_key = params.get("modelS3Key")

    if not fees:
        return {"classifications": [], "balanceCheck": None, "usedDspy": False}

    # Configure LM
    api_key = os.environ.get("GEMINI_API_KEY", "")
    configure_lm(api_key)

    # Decide: DSPy (optimized) vs fallback (raw prompting)
    use_dspy = len(corrections) >= MIN_CORRECTIONS_FOR_DSPY
    confidence_cap = 1.0

    if use_dspy and model_s3_key:
        classifier = _load_classifier(model_s3_key)
    elif use_dspy:
        # Enough corrections but no pre-trained model — run BootstrapFewShot inline
        classifier = FeeClassifier()
        try:
            training_examples = create_training_examples(corrections)
            optimizer = BootstrapFewShot(
                metric=classification_metric,
                max_bootstrapped_demos=4,
                max_labeled_demos=min(8, len(training_examples)),
            )
            classifier = optimizer.compile(classifier, trainset=training_examples)
            logger.info(f"Compiled BootstrapFewShot with {len(training_examples)} examples")
        except Exception as e:
            logger.warning(f"BootstrapFewShot failed: {e}. Using base classifier.")
            classifier = FeeClassifier()
            confidence_cap = FALLBACK_CONFIDENCE_CAP
    else:
        # Below threshold — use raw classifier with corrections as context
        classifier = FeeClassifier()
        confidence_cap = FALLBACK_CONFIDENCE_CAP

    # Wrap with dspy.Refine for constraint enforcement (retries on invalid account codes)
    classifier = dspy.Refine(module=classifier, N=3, reward_fn=fee_reward_fn, threshold=1.0)

    # Track known fee names from corrections for "NEW" detection
    known_fee_names = {c.get("feeName", "").lower() for c in corrections}

    # Classify fees using BatchFeeClassifier (includes balance validation)
    # BatchFeeClassifier wraps FeeClassifier with balance check
    batch_classifier = BatchFeeClassifier()
    batch_classifier.classifier = classifier  # Use the optimized/compiled classifier

    classifications = []
    try:
        batch_results = batch_classifier(
            fees=fees,
            platform_name=platform,
            gross_amount=gross_amount,
            net_amount=net_amount,
        )
        for r in batch_results:
            account_code = r["accountCode"]
            if account_code not in VALID_ACCOUNT_CODES:
                account_code = "5800"
            classifications.append({
                "feeName": r["feeName"],
                "accountCode": account_code,
                "accountName": VALID_ACCOUNT_CODES.get(account_code, "Platform Fees (General)"),
                "confidence": round(min(r["confidence"], confidence_cap), 2),
                "isNew": r["feeName"].lower() not in known_fee_names,
                "reasoning": r.get("reasoning", ""),
            })
    except Exception as e:
        # If batch classification fails (e.g., Assert backtracking exhausted),
        # fall back to per-fee classification without Assert
        logger.warning(f"Batch classification failed: {e}. Falling back to per-fee.")
        for fee in fees:
            fee_name = fee.get("feeName", "")
            try:
                result = classifier(fee_name=fee_name, platform_name=platform)
                account_code = str(result.account_code).strip()
                if account_code not in VALID_ACCOUNT_CODES:
                    account_code = "5800"
                classifications.append({
                    "feeName": fee_name,
                    "accountCode": account_code,
                    "accountName": VALID_ACCOUNT_CODES.get(account_code, "Platform Fees (General)"),
                    "confidence": round(min(float(result.confidence), confidence_cap), 2),
                    "isNew": fee_name.lower() not in known_fee_names,
                    "reasoning": str(getattr(result, "reasoning", "")),
                })
            except Exception as e2:
                logger.error(f"Per-fee classification failed for '{fee_name}': {e2}")
                classifications.append({
                    "feeName": fee_name,
                    "accountCode": "5800",
                    "accountName": "Platform Fees (General)",
                    "confidence": 0.0,
                    "isNew": True,
                    "reasoning": f"Classification error: {str(e2)[:100]}",
                })

    # Post-hoc balance check (for response — Assert already validated during classification)
    balance_check = None
    if gross_amount is not None and net_amount is not None:
        fee_amounts = [fee.get("amount", 0) for fee in fees]
        total_fees = sum(abs(a) for a in fee_amounts)
        expected_fees = gross_amount - net_amount
        discrepancy = round(expected_fees - total_fees, 2)
        balance_check = {
            "balanced": abs(discrepancy) <= 0.01,
            "totalFees": round(total_fees, 2),
            "expectedFees": round(expected_fees, 2),
            "discrepancy": discrepancy,
        }

    return {
        "classifications": classifications,
        "balanceCheck": balance_check,
        "modelVersion": model_s3_key or ("fallback_gemini" if not use_dspy else "inline_bootstrap"),
        "usedDspy": use_dspy,
    }


def _load_bank_recon_classifier(s3_key: str | None = None) -> BankTransactionClassifier:
    """Load bank recon classifier, optionally restoring optimized state from S3."""
    global _bank_recon_classifier

    classifier = BankTransactionClassifier()

    if s3_key:
        try:
            s3 = _get_s3_client()
            response = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
            state_json = response["Body"].read().decode("utf-8")
            tmp_path = f"/tmp/bank_recon_model_{s3_key.replace('/', '_')}.json"
            with open(tmp_path, "w") as f:
                f.write(state_json)
            classifier.load(tmp_path)
            logger.info(f"Loaded bank recon DSPy model from s3://{S3_BUCKET}/{s3_key}")
        except Exception as e:
            logger.warning(f"Failed to load bank recon model from S3: {e}. Using base classifier.")

    _bank_recon_classifier = classifier
    return classifier


def _classify_bank_transactions(params: dict) -> dict:
    """Classify bank transactions into GL debit/credit accounts using DSPy."""
    transactions = params.get("transactions", [])
    bank_name = params.get("bankName", "unknown")
    available_accounts = params.get("availableAccounts", "[]")
    bank_gl_account_code = params.get("bankGLAccountCode", "1010")
    corrections = params.get("businessCorrections", [])
    model_s3_key = params.get("modelS3Key")

    if not transactions:
        return {"classifications": [], "usedDspy": False}

    # Configure LM
    api_key = os.environ.get("GEMINI_API_KEY", "")
    configure_lm(api_key)

    # Build valid account codes set from available accounts
    import json as _json
    valid_codes = set()
    try:
        accounts = _json.loads(available_accounts) if isinstance(available_accounts, str) else available_accounts
        valid_codes = {a["code"] for a in accounts if "code" in a}
    except Exception:
        pass

    # Decide: DSPy (optimized) vs fallback
    use_dspy = len(corrections) >= MIN_CORRECTIONS_FOR_DSPY
    confidence_cap = 1.0

    if use_dspy and model_s3_key:
        classifier = _load_bank_recon_classifier(model_s3_key)
    elif use_dspy:
        # Enough corrections but no pre-trained model — run BootstrapFewShot inline
        classifier = BankTransactionClassifier()
        try:
            training_examples = create_bank_recon_training_examples(corrections)
            optimizer = BootstrapFewShot(
                metric=bank_recon_classification_metric,
                max_bootstrapped_demos=4,
                max_labeled_demos=min(8, len(training_examples)),
            )
            classifier = optimizer.compile(classifier, trainset=training_examples)
            logger.info(f"Compiled bank recon BootstrapFewShot with {len(training_examples)} examples")
        except Exception as e:
            logger.warning(f"Bank recon BootstrapFewShot failed: {e}. Using base classifier.")
            classifier = BankTransactionClassifier()
            confidence_cap = FALLBACK_CONFIDENCE_CAP
    else:
        classifier = BankTransactionClassifier()
        confidence_cap = FALLBACK_CONFIDENCE_CAP

    # Wrap with dspy.Refine for COA validation (retries on invalid account codes)
    classifier = dspy.Refine(module=classifier, N=3, reward_fn=bank_recon_reward_fn, threshold=1.0)

    classifications = []
    for txn in transactions:
        desc = txn.get("description", "")
        amount = txn.get("amount", 0)
        direction = txn.get("direction", "debit")
        txn_id = txn.get("id", "")

        try:
            result = classifier(
                description=desc,
                amount=float(amount),
                direction=direction,
                bank_name=bank_name,
                available_accounts=available_accounts,
                bank_gl_account_code=bank_gl_account_code,
                valid_account_codes=valid_codes if valid_codes else None,
            )
            classifications.append({
                "id": txn_id,
                "debitAccountCode": str(result.debit_account_code).strip(),
                "creditAccountCode": str(result.credit_account_code).strip(),
                "confidence": round(min(float(result.confidence), confidence_cap), 2),
                "reasoning": str(getattr(result, "reasoning", "")),
            })
        except Exception as e:
            logger.error(f"Bank recon classification failed for '{desc}': {e}")
            # Fallback: for debits (money leaving), debit expense, credit bank
            # For credits (money arriving), debit bank, credit revenue
            if direction == "debit":
                fallback_debit = "6100"  # Bank Charges
                fallback_credit = bank_gl_account_code
            else:
                fallback_debit = bank_gl_account_code
                fallback_credit = "4200"  # Interest Income
            classifications.append({
                "id": txn_id,
                "debitAccountCode": fallback_debit,
                "creditAccountCode": fallback_credit,
                "confidence": 0.0,
                "reasoning": f"Classification error: {str(e)[:100]}",
            })

    return {
        "classifications": classifications,
        "modelVersion": model_s3_key or ("fallback_gemini" if not use_dspy else "inline_bootstrap"),
        "usedDspy": use_dspy,
    }


def _optimize_model(params: dict) -> dict:
    """Run MIPROv2 optimization and save the result to S3."""
    from optimizer import run_optimization
    return run_optimization(params)


def _optimize_bank_recon_model(params: dict) -> dict:
    """Run MIPROv2 optimization for bank recon and save the result to S3."""
    from optimizer import run_bank_recon_optimization
    return run_bank_recon_optimization(params)


def _load_ar_matcher(s3_key: str | None = None) -> OrderInvoiceMatcher:
    """Load AR order-invoice matcher, optionally restoring optimized state from S3."""
    global _ar_matcher

    matcher = OrderInvoiceMatcher()

    if s3_key:
        try:
            s3 = _get_s3_client()
            response = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
            state_json = response["Body"].read().decode("utf-8")
            tmp_path = f"/tmp/ar_match_model_{s3_key.replace('/', '_')}.json"
            with open(tmp_path, "w") as f:
                f.write(state_json)
            matcher.load(tmp_path)
            logger.info(f"Loaded AR match DSPy model from s3://{S3_BUCKET}/{s3_key}")
        except Exception as e:
            logger.warning(f"Failed to load AR match model from S3: {e}. Using base matcher.")

    _ar_matcher = matcher
    return matcher


def _match_orders(params: dict) -> dict:
    """Match sales orders to candidate invoices using DSPy."""
    order = params.get("order", {})
    candidate_invoices = params.get("candidateInvoices", [])
    corrections = params.get("businessCorrections", [])
    model_s3_key = params.get("modelS3Key")
    amount_tolerance_percent = params.get("amountTolerancePercent", 1.5)
    amount_tolerance_absolute = params.get("amountToleranceAbsolute", 5.0)
    max_split_invoices = params.get("maxSplitInvoices", 5)

    if not order or not candidate_invoices:
        return {"matches": [], "usedDspy": False}

    # Configure LM
    api_key = os.environ.get("GEMINI_API_KEY", "")
    configure_lm(api_key)

    # Decide: DSPy (optimized) vs fallback
    use_dspy = len(corrections) >= MIN_CORRECTIONS_FOR_DSPY
    confidence_cap = 1.0

    if use_dspy and model_s3_key:
        matcher = _load_ar_matcher(model_s3_key)
    elif use_dspy:
        # Enough corrections but no pre-trained model — run BootstrapFewShot inline
        matcher = OrderInvoiceMatcher()
        try:
            training_examples = create_ar_match_training_examples(corrections)
            optimizer = BootstrapFewShot(
                metric=ar_matching_metric,
                max_bootstrapped_demos=4,
                max_labeled_demos=min(8, len(training_examples)),
            )
            matcher = optimizer.compile(matcher, trainset=training_examples)
            logger.info(f"Compiled AR match BootstrapFewShot with {len(training_examples)} examples")
        except Exception as e:
            logger.warning(f"AR match BootstrapFewShot failed: {e}. Using base matcher.")
            matcher = OrderInvoiceMatcher()
            confidence_cap = FALLBACK_CONFIDENCE_CAP
    else:
        matcher = OrderInvoiceMatcher()
        confidence_cap = FALLBACK_CONFIDENCE_CAP

    # Wrap with dspy.Refine for AR constraint enforcement
    matcher = dspy.Refine(module=matcher, N=3, reward_fn=ar_match_reward_fn, threshold=1.0)

    # Build candidate invoices JSON
    candidate_invoices_json = json.dumps(candidate_invoices)

    order_ref = order.get("orderReference", order.get("reference", ""))
    customer_name = order.get("customerName", "")
    order_amount = float(order.get("amount", order.get("orderAmount", 0)))
    order_date = order.get("orderDate", order.get("date", ""))

    try:
        result = matcher(
            order_reference=order_ref,
            customer_name=customer_name,
            order_amount=order_amount,
            order_date=order_date,
            candidate_invoices_json=candidate_invoices_json,
            max_split_invoices=max_split_invoices,
            amount_tolerance_percent=amount_tolerance_percent,
            amount_tolerance_absolute=amount_tolerance_absolute,
        )

        # Parse matched invoices
        try:
            matched_invoices = json.loads(result.matched_invoices_json) if isinstance(result.matched_invoices_json, str) else result.matched_invoices_json
        except (json.JSONDecodeError, TypeError):
            matched_invoices = []

        confidence = float(result.confidence) if result.confidence else 0.0
        confidence = round(min(confidence, confidence_cap), 2)

        return {
            "matches": matched_invoices,
            "totalAllocated": float(result.total_allocated) if result.total_allocated else 0.0,
            "confidence": confidence,
            "reasoning": str(getattr(result, "reasoning", "")),
            "modelVersion": model_s3_key or ("fallback_gemini" if not use_dspy else "inline_bootstrap"),
            "usedDspy": use_dspy,
        }
    except Exception as e:
        logger.error(f"AR match failed for order '{order_ref}': {e}")
        return {
            "matches": [],
            "totalAllocated": 0.0,
            "confidence": 0.0,
            "reasoning": f"Match error: {str(e)[:200]}",
            "modelVersion": "error",
            "usedDspy": use_dspy,
        }


def _optimize_ar_match_model(params: dict) -> dict:
    """Run MIPROv2 optimization for AR order-invoice matching and save the result to S3."""
    from ar_match_optimizer import run_ar_match_optimization
    return run_ar_match_optimization(params)


def lambda_handler(event: dict, context: Any) -> dict:
    """Lambda entry point — handles JSON-RPC requests."""
    try:
        # Parse body (API Gateway wraps in body string)
        if isinstance(event.get("body"), str):
            body = json.loads(event["body"])
        else:
            body = event

        method = body.get("method", "")
        params = body.get("params", {})
        request_id = body.get("id", 1)

        # Extract tool name from params
        tool_name = params.get("name", "")
        arguments = params.get("arguments", params)

        # Verify internal service key
        headers = event.get("headers", {})
        expected_key = os.environ.get("MCP_INTERNAL_SERVICE_KEY", "")
        provided_key = headers.get("x-internal-key", headers.get("X-Internal-Key", ""))

        if expected_key and provided_key != expected_key:
            return _error_response(request_id, -32001, "Unauthorized")

        # Route to handler
        if tool_name == "classify_fees":
            result = _classify_fees(arguments)
        elif tool_name == "optimize_model":
            result = _optimize_model(arguments)
        elif tool_name == "classify_bank_transaction":
            result = _classify_bank_transactions(arguments)
        elif tool_name == "optimize_bank_recon_model":
            result = _optimize_bank_recon_model(arguments)
        elif tool_name == "match_po_invoice":
            result = _match_po_invoice(arguments)
        elif tool_name == "diagnose_variance":
            result = _diagnose_variance(arguments)
        elif tool_name == "optimize_po_matching_model":
            result = _optimize_po_matching_model(arguments)
        elif tool_name == "match_orders":
            result = _match_orders(arguments)
        elif tool_name == "optimize_ar_match_model":
            result = _optimize_ar_match_model(arguments)
        elif tool_name == "match_vendor_items":
            result = _match_vendor_items(arguments)
        elif tool_name == "optimize_vendor_item_model":
            result = _optimize_vendor_item_model(arguments)
        else:
            return _error_response(request_id, -32601, f"Unknown tool: {tool_name}")

        return _success_response(request_id, result)

    except Exception as e:
        logger.exception("Handler error")
        return _error_response(body.get("id", 1) if isinstance(body, dict) else 1, -32000, str(e))


def _success_response(request_id: int, result: dict) -> dict:
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({
            "jsonrpc": "2.0",
            "id": request_id,
            "result": result,
        }),
    }


def _error_response(request_id: int, code: int, message: str) -> dict:
    return {
        "statusCode": 200,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": code, "message": message},
        }),
    }


# ============================================
# PO-Invoice Matching Handlers
# ============================================

MIN_CORRECTIONS_FOR_PO_DSPY = 20
DSPY_MODELS_PREFIX = "dspy-models"


def _get_s3_client():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client("s3", region_name="us-west-2")
    return _s3_client


def _load_po_matcher(s3_key: str | None = None) -> POMatchingModule:
    """Load PO matcher, optionally from a pre-trained S3 model."""
    matcher = POMatchingModule()
    if s3_key:
        try:
            s3 = _get_s3_client()
            response = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
            state_json = response["Body"].read().decode("utf-8")
            tmp_path = f"/tmp/po_matcher_{s3_key.replace('/', '_')}.json"
            with open(tmp_path, "w") as f:
                f.write(state_json)
            matcher.load(tmp_path)
            logger.info(f"Loaded PO matcher from s3://{S3_BUCKET}/{s3_key}")
        except Exception as e:
            logger.warning(f"Failed to load PO matcher from S3: {e}. Using base module.")
    return matcher


def _match_po_invoice(arguments: dict) -> dict:
    """Tier 2 AI matching for PO-Invoice line items."""
    global _po_matcher

    api_key = os.environ.get("GEMINI_API_KEY", "")
    configure_lm(api_key)

    po_lines = arguments.get("po_line_items", [])
    invoice_lines = arguments.get("invoice_line_items", [])
    grn_lines = arguments.get("grn_line_items", [])
    vendor_name = arguments.get("vendor_name", "Unknown")
    tier1_pairings = arguments.get("tier1_pairings", [])
    corrections = arguments.get("corrections", [])
    model_s3_key = arguments.get("model_s3_key")

    # Determine which DSPy approach to use
    use_pretrained = model_s3_key is not None
    use_dspy = len(corrections) >= MIN_CORRECTIONS_FOR_PO_DSPY
    model_version = "baseline"

    if use_pretrained:
        _po_matcher = _load_po_matcher(model_s3_key)
        model_version = model_s3_key
        logger.info(f"Using pre-trained PO matcher: {model_s3_key}")
    elif use_dspy:
        # Enough corrections but no pre-trained model — run BootstrapFewShot inline
        _po_matcher = POMatchingModule()
        try:
            training_examples = create_po_matching_training_examples(corrections)
            optimizer = BootstrapFewShot(
                metric=po_matching_metric,
                max_bootstrapped_demos=4,
                max_labeled_demos=min(8, len(training_examples)),
            )
            _po_matcher = optimizer.compile(_po_matcher, trainset=training_examples)
            model_version = "bootstrap_fewshot_inline"
            logger.info(f"Compiled PO matcher BootstrapFewShot with {len(training_examples)} examples")
        except Exception as e:
            logger.warning(f"PO matcher BootstrapFewShot failed: {e}. Using base module.")
            _po_matcher = POMatchingModule()
    else:
        _po_matcher = POMatchingModule()

    # Wrap with dspy.Refine for PO constraint enforcement
    from po_matching_module import po_matching_reward_fn
    _po_matcher = dspy.Refine(module=_po_matcher, N=3, reward_fn=po_matching_reward_fn, threshold=1.0)

    try:
        result = _po_matcher(
            po_lines=json.dumps(po_lines) if isinstance(po_lines, list) else po_lines,
            invoice_lines=json.dumps(invoice_lines) if isinstance(invoice_lines, list) else invoice_lines,
            grn_lines=json.dumps(grn_lines) if isinstance(grn_lines, list) else grn_lines,
            vendor_name=vendor_name,
            tier1_pairings=json.dumps(tier1_pairings) if isinstance(tier1_pairings, list) else tier1_pairings,
        )

        # Parse pairings
        try:
            pairings = json.loads(result.pairings) if isinstance(result.pairings, str) else result.pairings
        except (json.JSONDecodeError, TypeError):
            pairings = []

        # Parse constraint violations
        try:
            violations = json.loads(result.constraint_violations) if isinstance(result.constraint_violations, str) else result.constraint_violations
        except (json.JSONDecodeError, TypeError):
            violations = []

        # Cap confidence when using base model (no optimized model)
        confidence_cap = 1.0 if use_pretrained else 0.80
        for p in pairings:
            try:
                conf = float(p.get("confidence", 0))
            except (ValueError, TypeError):
                conf = 0.5
            p["confidence"] = min(conf, confidence_cap)

        overall_confidence = sum(float(p.get("confidence", 0)) for p in pairings) / max(len(pairings), 1)

        return {
            "pairings": pairings,
            "overall_reasoning": result.overall_reasoning,
            "overall_confidence": round(overall_confidence, 4),
            "model_version": model_version,
            "used_dspy": use_pretrained or use_dspy,
            "constraint_violations": violations,
        }

    except Exception as e:
        logger.exception("PO matching failed")
        return {"error": str(e), "fallback": True}


def _diagnose_variance(arguments: dict) -> dict:
    """AI-powered variance diagnosis for matched line items."""
    global _variance_diagnoser

    api_key = os.environ.get("GEMINI_API_KEY", "")
    configure_lm(api_key)

    if _variance_diagnoser is None:
        from po_matching_module import variance_reward_fn
        _variance_diagnoser = dspy.Refine(
            module=VarianceDiagnoser(), N=3, reward_fn=variance_reward_fn, threshold=1.0
        )

    try:
        result = _variance_diagnoser(
            po_line=json.dumps(arguments.get("po_line", {})),
            invoice_line=json.dumps(arguments.get("invoice_line", {})),
            grn_line=json.dumps(arguments.get("grn_line")) if arguments.get("grn_line") else "null",
            vendor_name=arguments.get("vendor_name", "Unknown"),
            variance_type=arguments.get("variance_type", "unknown"),
            variance_amount=str(arguments.get("variance_amount", 0)),
        )

        return {
            "diagnosis": result.diagnosis,
            "suggested_action": result.suggested_action,
            "confidence": float(result.confidence) if result.confidence else 0.5,
        }
    except Exception as e:
        logger.exception("Variance diagnosis failed")
        return {"diagnosis": f"AI diagnosis unavailable: {str(e)}", "suggested_action": "investigate", "confidence": 0.0}


def _optimize_po_matching_model(arguments: dict) -> dict:
    """MIPROv2 optimization for PO matching model."""
    from optimizer import optimize_po_matching
    return optimize_po_matching(arguments)


# ============================================
# VENDOR ITEM MATCHING (#320 DSPy Tier 2)
# ============================================

VENDOR_ITEM_MIN_CORRECTIONS = 20
VENDOR_ITEM_FALLBACK_CONFIDENCE_CAP = 0.80


def _match_vendor_items(arguments: dict) -> dict:
    """Match items across vendors using DSPy ChainOfThought reasoning.

    Loads pre-trained model from S3 if available, otherwise uses inline
    BootstrapFewShot with corrections, or base model with 80% confidence cap.
    """
    from vendor_item_matcher import (
        VendorItemMatcher,
        create_training_examples,
        matching_metric,
        vendor_item_reward_fn,
    )

    items = arguments.get("items", [])
    corrections = arguments.get("businessCorrections", [])
    model_s3_key = arguments.get("modelS3Key")
    max_suggestions = arguments.get("maxSuggestions", 20)
    rejected_pair_keys = set(arguments.get("rejectedPairKeys", []))

    if len(items) < 2:
        return {"suggestions": [], "modelVersion": "none", "usedDspy": False, "confidenceCapped": True}

    # Determine matching strategy (tiered)
    use_dspy = len(corrections) >= VENDOR_ITEM_MIN_CORRECTIONS or model_s3_key
    confidence_cap = 1.0

    # Load or compile matcher
    matcher = VendorItemMatcher()

    if model_s3_key:
        # Pre-trained model from S3
        try:
            import boto3
            s3 = boto3.client("s3", region_name="us-west-2")
            bucket = os.environ.get("S3_BUCKET_NAME", "finanseal-bucket")
            response = s3.get_object(Bucket=bucket, Key=model_s3_key)
            state_json = response["Body"].read().decode("utf-8")
            tmp_path = f"/tmp/vendor_match_{model_s3_key.replace('/', '_')}.json"
            with open(tmp_path, "w") as f:
                f.write(state_json)
            matcher.load(tmp_path)
            logger.info(f"[VendorItemMatcher] Loaded optimized model from S3: {model_s3_key}")
        except Exception as e:
            logger.warning(f"[VendorItemMatcher] Failed to load S3 model: {e}. Using base.")
            confidence_cap = VENDOR_ITEM_FALLBACK_CONFIDENCE_CAP
    elif use_dspy and corrections:
        # Inline BootstrapFewShot
        try:
            from dspy.teleprompt import BootstrapFewShot
            examples = create_training_examples(corrections)
            optimizer = BootstrapFewShot(
                metric=matching_metric,
                max_bootstrapped_demos=4,
                max_labeled_demos=min(8, len(examples)),
            )
            matcher = optimizer.compile(matcher, trainset=examples)
            logger.info(f"[VendorItemMatcher] Inline BootstrapFewShot with {len(examples)} examples")
        except Exception as e:
            logger.warning(f"[VendorItemMatcher] BootstrapFewShot failed: {e}. Using base.")
            confidence_cap = VENDOR_ITEM_FALLBACK_CONFIDENCE_CAP
    else:
        confidence_cap = VENDOR_ITEM_FALLBACK_CONFIDENCE_CAP

    # Wrap with dspy.Refine for spec conflict detection
    matcher = dspy.Refine(module=matcher, N=3, reward_fn=vendor_item_reward_fn, threshold=1.0)

    # Generate pairwise comparisons (different vendors only)
    suggestions = []
    seen_pairs = set()

    for i, item_a in enumerate(items):
        for j, item_b in enumerate(items):
            if i >= j:
                continue  # Avoid duplicates
            if item_a["vendorId"] == item_b["vendorId"]:
                continue  # Same vendor — skip

            # Generate normalized pair key for dedup
            norm_a = item_a["itemDescription"].lower().strip().replace("  ", " ")
            norm_b = item_b["itemDescription"].lower().strip().replace("  ", " ")
            pair_key = "||".join(sorted([norm_a, norm_b]))

            if pair_key in rejected_pair_keys:
                continue  # Previously rejected
            if pair_key in seen_pairs:
                continue  # Already evaluated
            seen_pairs.add(pair_key)

            try:
                result = matcher(
                    item_a_description=item_a["itemDescription"],
                    item_b_description=item_b["itemDescription"],
                    item_a_vendor=item_a.get("vendorName", "Vendor A"),
                    item_b_vendor=item_b.get("vendorName", "Vendor B"),
                )

                if result.is_match:
                    conf = min(float(result.confidence), confidence_cap)
                    suggestions.append({
                        "itemDescriptionA": item_a["itemDescription"],
                        "itemDescriptionB": item_b["itemDescription"],
                        "vendorIdA": item_a["vendorId"],
                        "vendorIdB": item_b["vendorId"],
                        "confidence": round(conf, 2),
                        "reasoning": result.reasoning,
                        "suggestedGroupName": result.suggested_group_name,
                    })
            except Exception as e:
                logger.warning(f"[VendorItemMatcher] Match failed for pair: {e}")
                continue

    # Sort by confidence descending, limit results
    suggestions.sort(key=lambda x: x["confidence"], reverse=True)
    suggestions = suggestions[:max_suggestions]

    return {
        "suggestions": suggestions,
        "modelVersion": model_s3_key or "base",
        "usedDspy": use_dspy,
        "confidenceCapped": confidence_cap < 1.0,
    }


def _optimize_vendor_item_model(arguments: dict) -> dict:
    """Run MIPROv2 optimization for vendor item matching model."""
    from vendor_item_optimizer import run_optimization
    return run_optimization(arguments)

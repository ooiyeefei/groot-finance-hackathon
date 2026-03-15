"""
Fee Classifier Lambda Handler

Exposes two JSON-RPC tools:
- classify_fees: Classify fee names into accounting codes using DSPy
- optimize_model: Run MIPROv2 optimization on accumulated corrections

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
)

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Module-level state (persists across warm invocations)
_classifier: FeeClassifier | None = None
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
    """Load classifier, optionally restoring optimized state from S3."""
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

    # Track known fee names from corrections for "NEW" detection
    known_fee_names = {c.get("feeName", "").lower() for c in corrections}

    # Classify fees using BatchFeeClassifier (includes dspy.Assert for balance)
    # BatchFeeClassifier wraps FeeClassifier with balance assertion backtracking
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


def _optimize_model(params: dict) -> dict:
    """Run MIPROv2 optimization and save the result to S3."""
    from optimizer import run_optimization
    return run_optimization(params)


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

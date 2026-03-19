"""
AR Order-to-Invoice Matcher — DSPy module for Tier 2 AI matching.

Uses ChainOfThought reasoning to match sales orders to invoices,
with dspy.Refine constraints for reconciliation integrity.

Pattern: Same as bank_recon_module.py (ChainOfThought + Refine + BootstrapFewShot)
"""

import json
import logging
import dspy

logger = logging.getLogger(__name__)


class MatchOrderToInvoice(dspy.Signature):
    """Match a sales order to the best candidate invoice(s) from a list.

    Consider customer name similarity (including aliases/nicknames),
    amount proximity (accounting for bank fees), date proximity,
    and any patterns learned from prior corrections.
    """
    order_reference: str = dspy.InputField(desc="Sales order reference number")
    customer_name: str = dspy.InputField(desc="Customer name on the sales order")
    order_amount: float = dspy.InputField(desc="Gross amount on the sales order")
    order_date: str = dspy.InputField(desc="Order date (YYYY-MM-DD)")
    candidate_invoices_json: str = dspy.InputField(desc="JSON array of candidate invoices with invoiceId, invoiceNumber, customerName, totalAmount, invoiceDate")
    max_split_invoices: int = dspy.InputField(desc="Maximum number of invoices in a split match (default 5)")
    amount_tolerance_percent: float = dspy.InputField(desc="Amount tolerance as percentage (e.g., 1.5 for 1.5%)")
    amount_tolerance_absolute: float = dspy.InputField(desc="Amount tolerance as absolute value (e.g., 5.00)")

    matched_invoices_json: str = dspy.OutputField(desc="JSON array of matched invoices: [{invoiceId, invoiceNumber, allocatedAmount, matchType}]. matchType is 'single' or 'split'. Empty array [] if no match found.")
    total_allocated: float = dspy.OutputField(desc="Sum of all allocated amounts across matched invoices")
    confidence: float = dspy.OutputField(desc="Match confidence score 0.0-1.0")
    reasoning: str = dspy.OutputField(desc="Detailed explanation of why this match was chosen, including customer similarity analysis, amount comparison, and any learned patterns from corrections")


class OrderInvoiceMatcher(dspy.Module):
    def __init__(self):
        super().__init__()
        self.match = dspy.ChainOfThought(MatchOrderToInvoice)

    def forward(self, order_reference, customer_name, order_amount, order_date,
                candidate_invoices_json, max_split_invoices=5,
                amount_tolerance_percent=1.5, amount_tolerance_absolute=5.0):

        result = self.match(
            order_reference=order_reference,
            customer_name=customer_name,
            order_amount=order_amount,
            order_date=order_date,
            candidate_invoices_json=candidate_invoices_json,
            max_split_invoices=max_split_invoices,
            amount_tolerance_percent=amount_tolerance_percent,
            amount_tolerance_absolute=amount_tolerance_absolute,
        )

        # Parse the matched invoices JSON
        try:
            matched_invoices = json.loads(result.matched_invoices_json)
        except (json.JSONDecodeError, TypeError):
            matched_invoices = []

        # Parse total_allocated
        try:
            total_allocated = float(result.total_allocated)
        except (ValueError, TypeError):
            total_allocated = sum(m.get("allocatedAmount", 0) for m in matched_invoices)

        # Parse confidence
        try:
            confidence = float(result.confidence)
            confidence = max(0.0, min(1.0, confidence))
        except (ValueError, TypeError):
            confidence = 0.5

        return dspy.Prediction(
            matched_invoices_json=json.dumps(matched_invoices),
            total_allocated=total_allocated,
            confidence=confidence,
            reasoning=result.reasoning,
        )


def create_training_examples(corrections):
    """Convert correction records into DSPy training examples."""
    examples = []
    for c in corrections:
        # Build a synthetic example from the correction
        example = dspy.Example(
            order_reference=c.get("orderReference", ""),
            customer_name=c.get("orderCustomerName", ""),
            order_amount=float(c.get("orderAmount", 0)),
            order_date=c.get("orderDate", ""),
            # For training, we create a minimal candidate list with the correct answer
            candidate_invoices_json=json.dumps([{
                "invoiceId": "correct_invoice",
                "invoiceNumber": c.get("correctedInvoiceNumber", ""),
                "customerName": c.get("correctedInvoiceCustomerName", ""),
                "totalAmount": float(c.get("correctedInvoiceAmount", 0)),
                "invoiceDate": c.get("orderDate", ""),
            }]),
            max_split_invoices=5,
            amount_tolerance_percent=1.5,
            amount_tolerance_absolute=5.0,
            # Expected output
            matched_invoices_json=json.dumps([{
                "invoiceId": "correct_invoice",
                "invoiceNumber": c.get("correctedInvoiceNumber", ""),
                "allocatedAmount": float(c.get("correctedInvoiceAmount", 0)),
                "matchType": "single",
            }]),
            total_allocated=float(c.get("correctedInvoiceAmount", 0)),
            confidence=0.95,
            reasoning=f"Matched based on correction: {c.get('correctionType', 'unknown')}",
        ).with_inputs(
            "order_reference", "customer_name", "order_amount", "order_date",
            "candidate_invoices_json", "max_split_invoices",
            "amount_tolerance_percent", "amount_tolerance_absolute"
        )
        examples.append(example)

    return examples


def matching_metric(gold, pred, trace=None):
    """Metric for evaluating match accuracy — checks if correct invoice was selected."""
    try:
        gold_matches = json.loads(gold.matched_invoices_json) if isinstance(gold.matched_invoices_json, str) else gold.matched_invoices_json
        pred_matches = json.loads(pred.matched_invoices_json) if isinstance(pred.matched_invoices_json, str) else pred.matched_invoices_json

        gold_ids = {m.get("invoiceId", "") for m in gold_matches}
        pred_ids = {m.get("invoiceId", "") for m in pred_matches}

        if not gold_ids:
            return float(not pred_ids)  # Both empty = correct

        return float(gold_ids == pred_ids)
    except (json.JSONDecodeError, TypeError):
        return 0.0


def ar_match_reward_fn(args: dict, pred) -> float:
    """Reward function for dspy.Refine: scores OrderInvoiceMatcher output.

    Hard constraints (0.0): invalid invoice IDs, over-allocation, too many splits.
    Soft constraints (0.7-0.9): customer name mismatch, partial payment.
    """
    try:
        matched = json.loads(pred.matched_invoices_json) if isinstance(pred.matched_invoices_json, str) else pred.matched_invoices_json
    except (json.JSONDecodeError, TypeError):
        return 0.0  # Unparseable output

    if not matched:
        return 1.0  # No match is a valid result

    # Hard: matched invoices must exist in candidates
    try:
        candidates = json.loads(args["candidate_invoices_json"])
        candidate_ids = {c["invoiceId"] for c in candidates}
    except (json.JSONDecodeError, TypeError, KeyError):
        candidate_ids = set()

    for m in matched:
        if m.get("invoiceId", "") not in candidate_ids:
            return 0.0  # Hallucinated invoice ID

    # Hard: no over-allocation
    order_amount = float(args.get("order_amount", 0))
    total_allocated = float(pred.total_allocated) if pred.total_allocated else 0
    tol_pct = float(args.get("amount_tolerance_percent", 1.5))
    tol_abs = float(args.get("amount_tolerance_absolute", 5.0))
    tolerance = max(order_amount * (tol_pct / 100.0), tol_abs)

    if total_allocated > 0 and (total_allocated - order_amount) > tolerance:
        return 0.0  # Over-allocation

    # Hard: max split invoices
    max_split = int(args.get("max_split_invoices", 5))
    if len(matched) > max_split:
        return 0.0

    # Soft: customer name alignment
    score = 1.0
    customer_name = args.get("customer_name", "")
    if customer_name and candidate_ids:
        try:
            cmap = {c["invoiceId"]: c for c in candidates}
            for m in matched:
                inv = cmap.get(m.get("invoiceId", ""), {})
                inv_cust = inv.get("customerName", "")
                if inv_cust and customer_name.lower() not in inv_cust.lower() and inv_cust.lower() not in customer_name.lower():
                    score = min(score, 0.8)  # Name mismatch penalty
        except (json.JSONDecodeError, TypeError):
            pass

    return score


def create_refined_ar_matcher(N: int = 3) -> dspy.Refine:
    """Create an OrderInvoiceMatcher wrapped with dspy.Refine."""
    return dspy.Refine(
        module=OrderInvoiceMatcher(),
        N=N,
        reward_fn=ar_match_reward_fn,
        threshold=1.0,
    )

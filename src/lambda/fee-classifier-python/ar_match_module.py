"""
AR Order-to-Invoice Matcher — DSPy module for Tier 2 AI matching.

Uses ChainOfThought reasoning to match sales orders to invoices,
with Assert/Suggest constraints for reconciliation integrity.

Pattern: Same as bank_recon_module.py (ChainOfThought + Assert + BootstrapFewShot)
"""

import json
import dspy
from dspy.primitives.assertions import assert_transform_module, backtrack_handler


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

        # ASSERT: Each matched invoice must exist in the candidate list
        if matched_invoices:
            candidate_ids = set()
            try:
                candidates = json.loads(candidate_invoices_json)
                candidate_ids = {c["invoiceId"] for c in candidates}
            except (json.JSONDecodeError, TypeError):
                pass

            for m in matched_invoices:
                dspy.Assert(
                    m.get("invoiceId", "") in candidate_ids,
                    f"Matched invoice {m.get('invoiceId', 'unknown')} not found in candidate list. Only match invoices from the provided candidates."
                )

        # ASSERT: Amount balance — total allocated must not EXCEED order amount (prevents over-allocation)
        # Allows partial payments: allocated can be LESS than order amount (residual is fine)
        if matched_invoices and total_allocated > 0:
            tolerance = max(
                order_amount * (amount_tolerance_percent / 100.0),
                amount_tolerance_absolute
            )
            # Only fail if allocated EXCEEDS order (over-allocation is invalid)
            # Under-allocation is valid (partial payment — residual applied to another invoice)
            over_allocation = total_allocated - order_amount
            dspy.Assert(
                over_allocation <= tolerance,
                f"Total allocated ({total_allocated:.2f}) exceeds order amount ({order_amount:.2f}) by {over_allocation:.2f}. Reduce allocation or remove an invoice from the split."
            )

        # ASSERT: Max split invoices
        if matched_invoices:
            dspy.Assert(
                len(matched_invoices) <= max_split_invoices,
                f"Too many invoices in split match ({len(matched_invoices)}). Maximum allowed is {max_split_invoices}."
            )

        # SUGGEST: Customer name alignment
        if matched_invoices and customer_name:
            try:
                candidates = json.loads(candidate_invoices_json)
                candidate_map = {c["invoiceId"]: c for c in candidates}
                for m in matched_invoices:
                    inv = candidate_map.get(m.get("invoiceId", ""), {})
                    inv_customer = inv.get("customerName", "")
                    if inv_customer and customer_name.lower() not in inv_customer.lower() and inv_customer.lower() not in customer_name.lower():
                        dspy.Suggest(
                            False,
                            f"Customer name mismatch: order has '{customer_name}' but invoice has '{inv_customer}'. If this is a known alias, proceed with reduced confidence."
                        )
            except (json.JSONDecodeError, TypeError):
                pass

        # SUGGEST: Partial payment residual — nudge AI to explain the residual
        if matched_invoices and total_allocated > 0 and total_allocated < order_amount * 0.95:
            residual = order_amount - total_allocated
            dspy.Suggest(
                False,
                f"Partial payment detected: allocated {total_allocated:.2f} of {order_amount:.2f} (residual {residual:.2f}). Explain in reasoning which invoices are fully paid and where the remaining RM{residual:.2f} applies."
            )

        # SUGGEST: Overpayment check
        if matched_invoices and total_allocated > 0 and order_amount > total_allocated * 1.1:
            dspy.Suggest(
                False,
                f"Order amount ({order_amount:.2f}) significantly exceeds matched invoices ({total_allocated:.2f}). Consider looking for additional related orders or treating excess as advance payment."
            )

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

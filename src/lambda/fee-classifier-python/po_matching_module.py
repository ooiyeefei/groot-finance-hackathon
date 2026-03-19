"""
PO-Invoice Line Item Matching — DSPy Module

Tier 2 AI matching for AP 3-way reconciliation. Semantically matches PO line items
to invoice line items when Tier 1 deterministic matching (word-overlap, exact codes)
fails. Uses ChainOfThought for reasoning traces and dspy.Refine for constraint
enforcement with automatic retry.

Mirrors the architecture of bank_recon_module.py and fee_module.py.
"""

import json
import logging
import dspy

logger = logging.getLogger(__name__)


# ============================================
# DSPy Signatures
# ============================================

class MatchPOInvoiceLines(dspy.Signature):
    """Match purchase order line items to invoice line items for AP 3-way reconciliation.

    Given PO line items and invoice line items from the same vendor, determine which
    invoice lines correspond to which PO lines. Vendor-specific product codes, abbreviations,
    and alternate descriptions are common — use semantic understanding to match items
    that have different descriptions but refer to the same product/service.

    Output a JSON array of pairings. Each PO line may match multiple invoice lines
    (partial deliveries). Each invoice line matches at most one PO line.
    """

    po_lines: str = dspy.InputField(desc="JSON array of PO line items [{index, description, item_code, quantity, unit_price, unit_of_measure}]")
    invoice_lines: str = dspy.InputField(desc="JSON array of invoice line items [{index, description, item_code, quantity, unit_price, unit_of_measure}]")
    grn_lines: str = dspy.InputField(desc="JSON array of GRN line items (may be empty) [{index, description, received_quantity, rejected_quantity}]")
    vendor_name: str = dspy.InputField(desc="Vendor/supplier name for context")
    tier1_pairings: str = dspy.InputField(desc="JSON array of Tier 1 deterministic pairings (low confidence) [{po_line_index, invoice_line_index, confidence, method}]")

    pairings: str = dspy.OutputField(desc="JSON array of matched pairings [{po_line_index, invoice_line_index, confidence, reasoning}]. Each invoice line appears at most once.")
    overall_reasoning: str = dspy.OutputField(desc="Brief summary of matching strategy and any notable observations")
    constraint_violations: str = dspy.OutputField(desc="JSON array of constraint violations found (empty [] if none)")


class DiagnoseVariance(dspy.Signature):
    """Diagnose the cause of a price or quantity variance between a PO line and invoice line.

    Examine the descriptions, amounts, and any notes to identify why the values differ.
    Common causes: delivery surcharges, UOM conversions, rounding, discounts, tax adjustments,
    or genuinely incorrect pricing.
    """

    po_line: str = dspy.InputField(desc="JSON object: {description, quantity, unit_price, unit_of_measure}")
    invoice_line: str = dspy.InputField(desc="JSON object: {description, quantity, unit_price, unit_of_measure, notes}")
    grn_line: str = dspy.InputField(desc="JSON object: {received_quantity, rejected_quantity} or 'null' if no GRN")
    vendor_name: str = dspy.InputField(desc="Vendor name")
    variance_type: str = dspy.InputField(desc="Type: price_higher, price_lower, quantity_over_invoiced, quantity_under_invoiced")
    variance_amount: str = dspy.InputField(desc="Absolute variance value")

    diagnosis: str = dspy.OutputField(desc="Human-readable explanation of the likely cause of the variance")
    suggested_action: str = dspy.OutputField(desc="One of: approve (within normal tolerance), investigate (needs human check), reject (likely error)")
    confidence: float = dspy.OutputField(desc="Confidence in the diagnosis (0.0-1.0)")


# ============================================
# DSPy Modules
# ============================================

class POMatchingModule(dspy.Module):
    """PO-Invoice line item matcher with chain-of-thought reasoning.

    Use create_refined_po_matcher() to wrap with dspy.Refine for
    automatic retry on constraint violations.
    """

    def __init__(self):
        self.match = dspy.ChainOfThought(MatchPOInvoiceLines)

    def forward(self, po_lines, invoice_lines, grn_lines, vendor_name, tier1_pairings):
        result = self.match(
            po_lines=po_lines,
            invoice_lines=invoice_lines,
            grn_lines=grn_lines,
            vendor_name=vendor_name,
            tier1_pairings=tier1_pairings,
        )
        return result


class VarianceDiagnoser(dspy.Module):
    """Variance diagnoser with chain-of-thought reasoning.

    Use create_refined_variance_diagnoser() to wrap with dspy.Refine for
    automatic retry when suggested_action is invalid.
    """

    def __init__(self):
        self.diagnose = dspy.ChainOfThought(DiagnoseVariance)

    def forward(self, po_line, invoice_line, grn_line, vendor_name, variance_type, variance_amount):
        result = self.diagnose(
            po_line=po_line,
            invoice_line=invoice_line,
            grn_line=grn_line,
            vendor_name=vendor_name,
            variance_type=variance_type,
            variance_amount=variance_amount,
        )
        return result


def po_matching_reward_fn(args: dict, pred) -> float:
    """Reward function for dspy.Refine: scores POMatchingModule output.

    Hard constraints (0.0): duplicate invoice lines, empty pairings.
    Soft constraints (0.8): UOM mismatch without explanation.
    """
    try:
        pairings = json.loads(pred.pairings) if isinstance(pred.pairings, str) else pred.pairings
    except (json.JSONDecodeError, TypeError):
        return 0.0  # Unparseable pairings

    # Hard: at least one pairing
    if not pairings:
        return 0.0

    # Hard: each invoice line appears at most once
    seen = set()
    for p in pairings:
        inv_idx = p.get("invoice_line_index")
        if inv_idx is not None:
            if inv_idx in seen:
                return 0.0  # Duplicate invoice line
            seen.add(inv_idx)

    # Soft: UOM conversion should be explained in reasoning
    score = 1.0
    try:
        po_data = json.loads(args["po_lines"]) if isinstance(args["po_lines"], str) else args["po_lines"]
        inv_data = json.loads(args["invoice_lines"]) if isinstance(args["invoice_lines"], str) else args["invoice_lines"]
        for p in pairings:
            po_idx = p.get("po_line_index")
            inv_idx = p.get("invoice_line_index")
            if po_idx is not None and inv_idx is not None and po_idx < len(po_data) and inv_idx < len(inv_data):
                po_uom = po_data[po_idx].get("unit_of_measure", "")
                inv_uom = inv_data[inv_idx].get("unit_of_measure", "")
                if po_uom and inv_uom and po_uom.lower() != inv_uom.lower():
                    reasoning = p.get("reasoning", "").lower()
                    if "convert" not in reasoning and "unit" not in reasoning:
                        score = min(score, 0.8)
    except (json.JSONDecodeError, TypeError, KeyError):
        pass

    return score


def variance_reward_fn(args: dict, pred) -> float:
    """Reward function for dspy.Refine: scores VarianceDiagnoser output."""
    valid_actions = {"approve", "investigate", "reject"}
    if pred.suggested_action not in valid_actions:
        return 0.0
    return 1.0


def create_refined_po_matcher(N: int = 3) -> dspy.Refine:
    """Create a POMatchingModule wrapped with dspy.Refine."""
    return dspy.Refine(
        module=POMatchingModule(),
        N=N,
        reward_fn=po_matching_reward_fn,
        threshold=1.0,
    )


def create_refined_variance_diagnoser(N: int = 3) -> dspy.Refine:
    """Create a VarianceDiagnoser wrapped with dspy.Refine."""
    return dspy.Refine(
        module=VarianceDiagnoser(),
        N=N,
        reward_fn=variance_reward_fn,
        threshold=1.0,
    )


# ============================================
# Training Data Helpers
# ============================================

def create_po_matching_training_examples(corrections: list[dict]) -> list[dspy.Example]:
    """Convert user corrections into DSPy training examples."""
    examples = []
    for c in corrections:
        # Skip rejections where no corrected pairing was provided
        if c.get("correctedPoLineDescription") == "REJECTED":
            continue

        ex = dspy.Example(
            po_lines=json.dumps([{
                "index": 0,
                "description": c.get("correctedPoLineDescription", ""),
                "item_code": "",
                "quantity": 1,
                "unit_price": 0,
                "unit_of_measure": "",
            }]),
            invoice_lines=json.dumps([{
                "index": 0,
                "description": c.get("correctedInvoiceLineDescription", ""),
                "item_code": "",
                "quantity": 1,
                "unit_price": 0,
                "unit_of_measure": "",
            }]),
            grn_lines="[]",
            vendor_name=c.get("vendorName", "unknown"),
            tier1_pairings="[]",
            pairings=json.dumps([{
                "po_line_index": 0,
                "invoice_line_index": 0,
                "confidence": 1.0,
                "reasoning": f"User correction: '{c.get('originalInvoiceLineDescription', '')}' matches '{c.get('correctedPoLineDescription', '')}'",
            }]),
            overall_reasoning=f"Corrected match from user override",
            constraint_violations="[]",
        ).with_inputs("po_lines", "invoice_lines", "grn_lines", "vendor_name", "tier1_pairings")
        examples.append(ex)
    return examples


# ============================================
# Metric
# ============================================

def po_matching_metric(gold, pred, trace=None) -> float:
    """Metric: check if predicted pairings match gold pairings."""
    try:
        gold_pairings = json.loads(gold.pairings) if isinstance(gold.pairings, str) else gold.pairings
        pred_pairings = json.loads(pred.pairings) if isinstance(pred.pairings, str) else pred.pairings
    except (json.JSONDecodeError, TypeError):
        return 0.0

    if not gold_pairings or not pred_pairings:
        return 0.0

    # Score: fraction of gold pairings that appear in predicted
    gold_pairs = {(p["po_line_index"], p["invoice_line_index"]) for p in gold_pairings}
    pred_pairs = {(p["po_line_index"], p["invoice_line_index"]) for p in pred_pairings}

    if not gold_pairs:
        return 1.0 if not pred_pairs else 0.0

    matches = gold_pairs & pred_pairs
    return len(matches) / len(gold_pairs)

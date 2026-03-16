"""
PO-Invoice Line Item Matching — DSPy Module

Tier 2 AI matching for AP 3-way reconciliation. Semantically matches PO line items
to invoice line items when Tier 1 deterministic matching (word-overlap, exact codes)
fails. Uses ChainOfThought for reasoning traces, Assert for constraint validation,
and Suggest for UOM conversion explanations.

Mirrors the architecture of bank_recon_module.py and fee_module.py.
"""

import json
import dspy


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
    """PO-Invoice line item matcher with chain-of-thought and assertion validation."""

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

        # Parse pairings to validate
        try:
            pairings = json.loads(result.pairings)
        except (json.JSONDecodeError, TypeError):
            pairings = []

        # Hard constraint: each invoice line appears at most once
        seen_invoice_indices = set()
        for p in pairings:
            inv_idx = p.get("invoice_line_index")
            if inv_idx is not None:
                dspy.Assert(
                    inv_idx not in seen_invoice_indices,
                    f"Invoice line {inv_idx} matched to multiple PO lines. Each invoice line must match at most one PO line.",
                )
                seen_invoice_indices.add(inv_idx)

        # Hard constraint: pairings JSON must be valid
        dspy.Assert(
            len(pairings) > 0,
            "At least one pairing must be produced. If no matches found, output a pairing with confidence 0.0.",
        )

        # Soft constraint: explain UOM conversions if present
        po_data = json.loads(po_lines) if isinstance(po_lines, str) else po_lines
        inv_data = json.loads(invoice_lines) if isinstance(invoice_lines, str) else invoice_lines
        for p in pairings:
            po_idx = p.get("po_line_index")
            inv_idx = p.get("invoice_line_index")
            if po_idx is not None and inv_idx is not None:
                po_uom = po_data[po_idx].get("unit_of_measure", "") if po_idx < len(po_data) else ""
                inv_uom = inv_data[inv_idx].get("unit_of_measure", "") if inv_idx < len(inv_data) else ""
                if po_uom and inv_uom and po_uom.lower() != inv_uom.lower():
                    dspy.Suggest(
                        "convert" in p.get("reasoning", "").lower() or "unit" in p.get("reasoning", "").lower(),
                        f"PO uses '{po_uom}' but invoice uses '{inv_uom}'. Explain the UOM conversion in reasoning.",
                    )

        return result


class VarianceDiagnoser(dspy.Module):
    """Variance diagnoser with chain-of-thought reasoning."""

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

        # Validate suggested_action is one of the allowed values
        valid_actions = {"approve", "investigate", "reject"}
        dspy.Assert(
            result.suggested_action in valid_actions,
            f"suggested_action must be one of {valid_actions}, got '{result.suggested_action}'",
        )

        return result


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

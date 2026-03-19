"""
DSPy Vendor Item Matcher Module

Matches equivalent items across different vendors for cross-vendor price comparison.
Uses ChainOfThought for semantic reasoning and dspy.Refine for constraint enforcement.

DSPy Components:
1. Signature: MatchVendorItems — input/output contract
2. Module: VendorItemMatcher — orchestrates reasoning
3. ChainOfThought: Generates reasoning traces for WHY items match/don't
4. Refine: Retries with feedback when specs conflict or constraints fail
5. BootstrapFewShot: Training from user corrections

Feature: 001-dspy-vendor-item-matcher (#320)
"""

import dspy
import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ============================================
# Component 1: SIGNATURE (input/output contract)
# ============================================

class MatchVendorItems(dspy.Signature):
    """Determine if two items from different vendors are the same product.

    Compare item descriptions from two different vendors and determine if they
    refer to the same physical product or service. Consider:
    - Different naming conventions (e.g., "M8 STEEL BOLT" vs "BOLT-M8-SS")
    - Semantic equivalence (e.g., "A4 Paper 80gsm" vs "A4 Copy Paper 80g/m2")
    - Specification differences that make items NOT equivalent (e.g., M8 vs M10)
    - Cross-language matching (e.g., "Kertas A4" = "A4 Paper")
    - Domain-specific distinctions (e.g., ink cartridge ≠ toner cartridge)
    """

    item_a_description: str = dspy.InputField(
        desc="Item description from Vendor A (e.g., 'M8 STEEL BOLT 304SS')"
    )
    item_b_description: str = dspy.InputField(
        desc="Item description from Vendor B (e.g., 'BOLT-M8-SS STAINLESS')"
    )
    item_a_vendor: str = dspy.InputField(
        desc="Name of Vendor A"
    )
    item_b_vendor: str = dspy.InputField(
        desc="Name of Vendor B"
    )

    is_match: str = dspy.OutputField(
        desc="'true' if items are the same product, 'false' if different. Must be exactly 'true' or 'false'."
    )
    confidence: float = dspy.OutputField(
        desc="Confidence between 0.0 and 1.0 that the items match (or don't match)"
    )
    reasoning: str = dspy.OutputField(
        desc="Brief explanation of why items do or don't match, noting specific features compared"
    )
    suggested_group_name: str = dspy.OutputField(
        desc="If items match, suggest a short canonical name for the item group (e.g., 'M8 Steel Bolt'). If no match, return 'N/A'."
    )


# ============================================
# Component 2+3: MODULE (ChainOfThought reasoning)
# ============================================

class VendorItemMatcher(dspy.Module):
    """Vendor item matcher with chain-of-thought reasoning.

    Use create_refined_vendor_matcher() to wrap with dspy.Refine for
    automatic retry when spec conflicts are detected.
    """

    def __init__(self):
        super().__init__()
        self.match = dspy.ChainOfThought(MatchVendorItems)

    def forward(
        self,
        item_a_description: str,
        item_b_description: str,
        item_a_vendor: str,
        item_b_vendor: str,
    ):
        # Input validation (programmer error, not LLM quality) — keep as ValueError
        if item_a_vendor.strip().lower() == item_b_vendor.strip().lower():
            raise ValueError(
                f"Cannot match items from the same vendor: '{item_a_vendor}' and '{item_b_vendor}'"
            )

        result = self.match(
            item_a_description=item_a_description,
            item_b_description=item_b_description,
            item_a_vendor=item_a_vendor,
            item_b_vendor=item_b_vendor,
        )

        # Parse is_match to boolean
        is_match_str = str(result.is_match).strip().lower()
        is_match = is_match_str in ("true", "yes", "1")

        # Validate and clamp confidence
        try:
            conf = float(result.confidence)
            conf = max(0.0, min(1.0, conf))
        except (ValueError, TypeError):
            conf = 0.5

        return dspy.Prediction(
            is_match=is_match,
            confidence=conf,
            reasoning=str(result.reasoning),
            suggested_group_name=str(result.suggested_group_name) if is_match else "N/A",
        )


# ============================================
# HELPER: Specification extraction and conflict detection
# ============================================

def _extract_specifications(description: str) -> list[str]:
    """Extract numeric specifications from item descriptions.

    Examples:
        "M8 STEEL BOLT" → ["M8"]
        "A4 Paper 80gsm" → ["A4", "80gsm"]
        "Toner HP 26A" → ["26A"]
    """
    import re
    # Match patterns like M8, M10, A4, 80gsm, 26A, HP123
    specs = re.findall(r'\b([A-Z]?\d+[A-Z]*(?:gsm|mm|cm|kg|ml|g/m2)?)\b', description, re.IGNORECASE)
    return [s.upper() for s in specs]


def _check_spec_conflict(specs_a: list[str], specs_b: list[str]) -> bool:
    """Check if specifications conflict (same type but different value).

    e.g., M8 vs M10 = conflict (both M-series, different size)
          A4 vs A3 = conflict (both A-series, different size)
          M8 vs 80gsm = no conflict (different spec types)
    """
    import re

    for sa in specs_a:
        for sb in specs_b:
            # Same prefix, different number → conflict
            match_a = re.match(r'^([A-Z]+)(\d+)', sa, re.IGNORECASE)
            match_b = re.match(r'^([A-Z]+)(\d+)', sb, re.IGNORECASE)
            if match_a and match_b:
                prefix_a, num_a = match_a.group(1).upper(), match_a.group(2)
                prefix_b, num_b = match_b.group(1).upper(), match_b.group(2)
                if prefix_a == prefix_b and num_a != num_b:
                    return True  # Same type, different value = conflict

    return False


# ============================================
# Component 5: BOOTSTRAPFEWSHOT (training examples)
# ============================================

def create_training_examples(corrections: list[dict]) -> list[dspy.Example]:
    """Convert user corrections into DSPy training examples.

    Each correction becomes a ground-truth example for BootstrapFewShot.
    """
    examples = []
    for c in corrections:
        is_match = c.get("isMatch", False)
        ex = dspy.Example(
            item_a_description=c["itemDescriptionA"],
            item_b_description=c["itemDescriptionB"],
            item_a_vendor=c.get("vendorNameA", "Vendor A"),
            item_b_vendor=c.get("vendorNameB", "Vendor B"),
            is_match="true" if is_match else "false",
            confidence=1.0,  # Ground truth = 100% confidence
            reasoning=f"User {'confirmed' if is_match else 'rejected'} this match.",
            suggested_group_name=c.get("suggestedGroupName", "N/A") if is_match else "N/A",
        ).with_inputs("item_a_description", "item_b_description", "item_a_vendor", "item_b_vendor")
        examples.append(ex)
    return examples


def matching_metric(gold, pred, trace=None) -> float:
    """Metric for DSPy optimization: exact match on is_match boolean."""
    gold_match = str(gold.is_match).strip().lower() in ("true", "yes", "1")
    pred_match = str(pred.is_match).strip().lower() in ("true", "yes", "1")
    return float(gold_match == pred_match)


def vendor_item_reward_fn(args: dict, pred) -> float:
    """Reward function for dspy.Refine: scores VendorItemMatcher output.

    Hard constraint (0.0): spec conflict when match is claimed.
    Soft constraint (0.8): missing group name on match.
    """
    is_match = str(pred.is_match).strip().lower() in ("true", "yes", "1") if hasattr(pred, "is_match") else pred.is_match

    if is_match:
        # Hard: specs must not conflict
        specs_a = _extract_specifications(args["item_a_description"])
        specs_b = _extract_specifications(args["item_b_description"])
        if specs_a and specs_b and _check_spec_conflict(specs_a, specs_b):
            return 0.0  # Conflicting specs — retry

        # Soft: group name should be meaningful
        group_name = str(getattr(pred, "suggested_group_name", "N/A"))
        if group_name == "N/A":
            return 0.8

    return 1.0


def create_refined_vendor_matcher(N: int = 3) -> dspy.Refine:
    """Create a VendorItemMatcher wrapped with dspy.Refine."""
    return dspy.Refine(
        module=VendorItemMatcher(),
        N=N,
        reward_fn=vendor_item_reward_fn,
        threshold=1.0,
    )

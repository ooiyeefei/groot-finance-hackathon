"""
ChainOfThought buyer profile matching for account-gated merchants.

Multi-step reasoning: TIN exact match -> fuzzy name match -> recency disambiguation.
"""

import dspy


class BuyerProfileMatcher(dspy.Signature):
    """Select the correct buyer profile from a list of saved profiles
    for an account-gated merchant (e.g., 7-Eleven).

    Matching rules (in priority order):
    1. TIN exact match is required — name alone is NOT sufficient
    2. If multiple TIN matches, use fuzzy name matching to narrow
    3. If still ambiguous, select the most recently used profile
    4. If no TIN matches, recommend creating a new profile

    Common name variations to handle:
    - "Groot Finance" vs "Groot Finance Sdn Bhd"
    - "ABC Corp" vs "ABC Corporation (M) Berhad"
    - Branch suffixes: "HQ", "Branch 1", "Kuala Lumpur"
    """

    available_profiles: str = dspy.InputField(
        desc="JSON list of buyer profiles: [{name, tin, lastUsed, id}, ...]"
    )
    buyer_tin: str = dspy.InputField(desc="Target buyer's TIN (Tax Identification Number)")
    buyer_name: str = dspy.InputField(desc="Target buyer's company name")

    reasoning: str = dspy.OutputField(
        desc="Step-by-step matching logic explaining the selection"
    )
    selected_profile_id: str = dspy.OutputField(
        desc="ID of the selected profile, or 'create_new' if no match"
    )
    match_type: str = dspy.OutputField(
        desc="One of: tin_exact, fuzzy_name, recency, create_new"
    )
    confidence: float = dspy.OutputField(
        desc="Confidence in the match (0.0-1.0)"
    )


class BuyerMatcherModule(dspy.Module):
    """ChainOfThought buyer profile matcher."""

    def __init__(self):
        super().__init__()
        self.match = dspy.ChainOfThought(BuyerProfileMatcher)

    def forward(self, available_profiles: str, buyer_tin: str, buyer_name: str):
        return self.match(
            available_profiles=available_profiles,
            buyer_tin=buyer_tin,
            buyer_name=buyer_name,
        )


def match_buyer_profile(
    profiles: list,
    buyer_tin: str,
    buyer_name: str,
) -> dict:
    """Match a buyer to the best available profile.

    Args:
        profiles: List of dicts with {name, tin, lastUsed, id}
        buyer_tin: Buyer's TIN
        buyer_name: Buyer's company name

    Returns:
        {
            "profileSelected": "profile_id" or None,
            "reasoning": "Step-by-step matching logic",
            "matchType": "tin_exact" | "fuzzy_name" | "recency" | "create_new",
            "confidence": 0.95
        }
    """
    import json

    if not profiles:
        return {
            "profileSelected": None,
            "reasoning": "No profiles available — create new buyer profile",
            "matchType": "create_new",
            "confidence": 1.0,
        }

    matcher = BuyerMatcherModule()

    try:
        result = matcher(
            available_profiles=json.dumps(profiles),
            buyer_tin=buyer_tin,
            buyer_name=buyer_name,
        )

        profile_id = result.selected_profile_id
        if profile_id == "create_new":
            profile_id = None

        try:
            confidence = float(result.confidence)
            confidence = max(0.0, min(1.0, confidence))
        except (ValueError, TypeError):
            confidence = 0.5

        print(
            f"[DSPy] Buyer match: tin={buyer_tin}, name={buyer_name}, "
            f"selected={profile_id}, match_type={result.match_type}, "
            f"confidence={confidence:.2f}"
        )

        return {
            "profileSelected": profile_id,
            "reasoning": result.reasoning,
            "matchType": result.match_type,
            "confidence": confidence,
        }

    except Exception as e:
        print(f"[DSPy] Buyer matcher failed: {e}, falling back to TIN-only match")
        # Fallback: simple TIN exact match
        for profile in profiles:
            if profile.get("tin") == buyer_tin:
                return {
                    "profileSelected": profile.get("id"),
                    "reasoning": f"Fallback TIN exact match (DSPy failed: {e})",
                    "matchType": "tin_exact",
                    "confidence": 0.9,
                }
        return {
            "profileSelected": None,
            "reasoning": f"No TIN match found (DSPy failed: {e})",
            "matchType": "create_new",
            "confidence": 1.0,
        }

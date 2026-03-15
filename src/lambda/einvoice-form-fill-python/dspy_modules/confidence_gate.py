"""
Tier 1 confidence gate — predicts whether saved CSS selectors
will work on the current page. Skips Tier 1 if confidence < threshold.
"""

import dspy
from typing import Tuple


class Tier1ConfidencePrediction(dspy.Signature):
    """Predict whether saved CSS selectors will successfully fill
    the current merchant form.

    Compare the saved selectors against a snippet of the current
    page HTML to detect form layout changes.

    Output a confidence score (0.0 to 1.0):
    - 1.0: All selectors present and form structure matches
    - 0.7+: Most selectors present, minor changes only
    - 0.3-0.7: Significant changes detected, some selectors may fail
    - <0.3: Form has changed substantially, selectors will likely fail
    """

    saved_selectors: str = dspy.InputField(
        desc="JSON list of saved CSS selectors from formConfig.fields"
    )
    page_html_snippet: str = dspy.InputField(
        desc="First 2KB of the current page HTML (enough to detect structure changes)"
    )
    merchant_name: str = dspy.InputField(desc="Merchant name for context")
    success_count: int = dspy.InputField(desc="Number of previous Tier 1 successes")

    confidence: float = dspy.OutputField(
        desc="Confidence score 0.0-1.0 that Tier 1 will succeed"
    )
    reasoning: str = dspy.OutputField(
        desc="Brief explanation of confidence assessment (1-2 sentences)"
    )


class ConfidenceGate(dspy.Module):
    """Confidence gate module for Tier 1 skip decision."""

    def __init__(self, threshold: float = 0.7):
        super().__init__()
        self.predict = dspy.Predict(Tier1ConfidencePrediction)
        self.threshold = threshold

    def forward(self, saved_selectors: str, page_html_snippet: str,
                merchant_name: str, success_count: int = 0) -> Tuple[float, str, bool]:
        result = self.predict(
            saved_selectors=saved_selectors,
            page_html_snippet=page_html_snippet,
            merchant_name=merchant_name,
            success_count=success_count,
        )

        try:
            confidence = float(result.confidence)
            confidence = max(0.0, min(1.0, confidence))  # Clamp to [0, 1]
        except (ValueError, TypeError):
            confidence = 0.5  # Default if parsing fails

        should_proceed = confidence >= self.threshold
        return confidence, result.reasoning, should_proceed


def evaluate_tier1_confidence(
    saved_selectors: str,
    page_html_snippet: str,
    merchant_name: str,
    success_count: int = 0,
    threshold: float = 0.7,
) -> dict:
    """Evaluate whether Tier 1 should proceed or be skipped.

    Returns:
        {
            "confidence": 0.85,
            "reasoning": "All 5 saved selectors found in page HTML",
            "decision": "proceed" | "skip",
            "threshold": 0.7
        }
    """
    gate = ConfidenceGate(threshold=threshold)

    try:
        confidence, reasoning, should_proceed = gate(
            saved_selectors=saved_selectors,
            page_html_snippet=page_html_snippet,
            merchant_name=merchant_name,
            success_count=success_count,
        )

        decision = "proceed" if should_proceed else "skip"
        print(
            f"[DSPy] Confidence gate: merchant={merchant_name}, "
            f"confidence={confidence:.2f}, decision={decision}, "
            f"reasoning={reasoning[:80]}"
        )

        return {
            "confidence": confidence,
            "reasoning": reasoning,
            "decision": decision,
            "threshold": threshold,
        }

    except Exception as e:
        print(f"[DSPy] Confidence gate error: {e}, defaulting to proceed")
        return {
            "confidence": 0.8,
            "reasoning": f"Gate evaluation failed ({e}), defaulting to proceed",
            "decision": "proceed",
            "threshold": threshold,
        }

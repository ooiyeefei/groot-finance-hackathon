"""
Cascading Confidence Gate — Tier 0 (HTML) → Tier 0.5 (Visual).

Tier 0: Lightweight HTML structure check. Fast (~1-2s), cheap (~$0.001).
         Runs on EVERY invocation with saved formConfig.

Tier 0.5: Visual pre-check via Gemini Flash screenshot analysis.
          ONLY triggers when Tier 0 is uncertain (confidence 0.4-0.7),
          merchant is high-volatility, or it's been >30 days since last fill.
          Costs ~$0.02-0.03 but protects session integrity.

Decision matrix:
  Tier 0 confidence >= 0.7  →  Proceed to Tier 1 (no visual check needed)
  Tier 0 confidence 0.4-0.7 →  Escalate to Tier 0.5 visual check
  Tier 0 confidence < 0.4   →  Skip Tier 1 entirely (go straight to Tier 2)

Tier 0.5 overrides:
  Visual confidence >= 0.7  →  Proceed to Tier 1 (page looks right)
  Visual confidence < 0.7   →  Skip Tier 1 (page has changed)
"""

import dspy
import time
from typing import Tuple


# ── Tier 0: HTML Structure Check ──────────────────────────────

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
            confidence = max(0.0, min(1.0, confidence))
        except (ValueError, TypeError):
            confidence = 0.5

        should_proceed = confidence >= self.threshold
        return confidence, result.reasoning, should_proceed


# ── Tier 0.5: Visual Pre-Check ────────────────────────────────

class VisualFormAssessment(dspy.Signature):
    """Visually assess a merchant's e-invoice form page to determine
    if saved CSS selectors are likely to work.

    You are looking at a screenshot of the CURRENT page state.
    Compare it against the known merchant pattern to detect:
    - Modal overlays or popups blocking the form
    - Form layout changes (new tabs, moved fields, redesigned UI)
    - Error states, login walls, or CAPTCHA challenges
    - Shadow DOM or canvas elements that prevent selector access
    - Loading spinners or incomplete page renders

    Be conservative: if anything looks "off", lower your confidence.
    A false negative (skipping Tier 1 when it would work) costs ~5s.
    A false positive (attempting Tier 1 on a changed form) can poison
    the session with half-filled fields and trigger anti-bot measures.
    """

    screenshot_description: str = dspy.InputField(
        desc="Gemini Flash vision description of the current page screenshot"
    )
    merchant_name: str = dspy.InputField(desc="Name of the merchant")
    saved_field_count: int = dspy.InputField(
        desc="Number of CSS selectors we have saved for this merchant"
    )
    last_success_age_days: int = dspy.InputField(
        desc="Days since last successful Tier 1 fill for this merchant (0 = today)"
    )
    known_cua_hints: str = dspy.InputField(
        desc="Existing cuaHints for this merchant (may mention overlays, tabs, etc.)"
    )

    visual_confidence: float = dspy.OutputField(
        desc="Confidence 0.0-1.0 that the page is in a 'clean' state ready for Tier 1 selector fills. "
             "Score <0.7 if ANY visual anomaly detected (overlays, layout changes, error states)."
    )
    page_state: str = dspy.OutputField(
        desc="One of: 'clean_form' (ready for selectors), 'overlay_blocked' (modal/popup covering form), "
             "'layout_changed' (form structure different from expected), 'error_state' (error page, login wall), "
             "'loading' (page not fully rendered), 'captcha_wall' (CAPTCHA blocking access)"
    )
    visual_reasoning: str = dspy.OutputField(
        desc="What you observed about the page state (2-3 sentences). "
             "Mention specific visual elements that influenced your confidence."
    )


class VisualGate(dspy.Module):
    """Tier 0.5: Visual pre-check using Gemini Flash screenshot analysis."""

    def __init__(self):
        super().__init__()
        self.assess = dspy.ChainOfThought(VisualFormAssessment)

    def forward(self, screenshot_description: str, merchant_name: str,
                saved_field_count: int, last_success_age_days: int = 0,
                known_cua_hints: str = ""):
        return self.assess(
            screenshot_description=screenshot_description,
            merchant_name=merchant_name,
            saved_field_count=saved_field_count,
            last_success_age_days=last_success_age_days,
            known_cua_hints=known_cua_hints,
        )


# ── Thresholds for cascading logic ──

# Tier 0 HTML confidence bands
TIER0_HIGH = 0.7       # >= this: proceed to Tier 1 (no visual needed)
TIER0_UNCERTAIN = 0.4  # 0.4-0.7: escalate to Tier 0.5 visual check
                        # < 0.4: skip Tier 1 entirely

# Tier 0.5 Visual confidence threshold
TIER05_THRESHOLD = 0.7  # Visual must be >= this to override uncertain HTML

# Days since last fill before mandatory visual check
STALE_MERCHANT_DAYS = 30


def evaluate_tier1_confidence(
    saved_selectors: str,
    page_html_snippet: str,
    merchant_name: str,
    success_count: int = 0,
    threshold: float = TIER0_HIGH,
) -> dict:
    """Tier 0: Lightweight HTML structure check.

    Returns:
        {
            "confidence": 0.85,
            "reasoning": "All selectors found in page HTML",
            "decision": "proceed" | "skip" | "uncertain",
            "tier": "0",
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

        if confidence >= TIER0_HIGH:
            decision = "proceed"
        elif confidence >= TIER0_UNCERTAIN:
            decision = "uncertain"  # Needs Tier 0.5 visual check
        else:
            decision = "skip"

        print(
            f"[Tier 0] HTML gate: merchant={merchant_name}, "
            f"confidence={confidence:.2f}, decision={decision}, "
            f"reasoning={reasoning[:80]}"
        )

        return {
            "confidence": confidence,
            "reasoning": reasoning,
            "decision": decision,
            "tier": "0",
            "threshold": threshold,
        }

    except Exception as e:
        print(f"[Tier 0] HTML gate error: {e}, defaulting to proceed")
        return {
            "confidence": 0.8,
            "reasoning": f"Gate evaluation failed ({e}), defaulting to proceed",
            "decision": "proceed",
            "tier": "0",
            "threshold": threshold,
        }


def should_escalate_to_visual(
    tier0_result: dict,
    last_fill_timestamp: float = 0,
    tier1_failure_count: int = 0,
) -> bool:
    """Determine if Tier 0.5 visual check should run.

    Triggers when:
    a) Tier 0 confidence is uncertain (0.4-0.7)
    b) Merchant is high-volatility (3+ consecutive Tier 1 failures)
    c) Last successful fill was >30 days ago
    """
    decision = tier0_result.get("decision", "proceed")

    # (a) Tier 0 is uncertain
    if decision == "uncertain":
        return True

    # (b) High volatility merchant
    if tier1_failure_count >= 3:
        print(f"[Tier 0.5] Escalating: {tier1_failure_count} consecutive Tier 1 failures (high volatility)")
        return True

    # (c) Stale merchant (>30 days since last fill)
    if last_fill_timestamp > 0:
        days_since = (time.time() * 1000 - last_fill_timestamp) / (1000 * 86400)
        if days_since > STALE_MERCHANT_DAYS:
            print(f"[Tier 0.5] Escalating: {days_since:.0f} days since last fill (>{STALE_MERCHANT_DAYS}d threshold)")
            return True

    return False


def evaluate_visual_confidence(
    screenshot_description: str,
    merchant_name: str,
    saved_field_count: int,
    last_success_age_days: int = 0,
    known_cua_hints: str = "",
) -> dict:
    """Tier 0.5: Visual pre-check via Gemini Flash screenshot analysis.

    Returns:
        {
            "confidence": 0.65,
            "page_state": "overlay_blocked",
            "reasoning": "Modal popup covering form fields",
            "decision": "proceed" | "skip",
            "tier": "0.5"
        }
    """
    gate = VisualGate()

    try:
        result = gate(
            screenshot_description=screenshot_description,
            merchant_name=merchant_name,
            saved_field_count=saved_field_count,
            last_success_age_days=last_success_age_days,
            known_cua_hints=known_cua_hints,
        )

        try:
            confidence = float(result.visual_confidence)
            confidence = max(0.0, min(1.0, confidence))
        except (ValueError, TypeError):
            confidence = 0.5

        page_state = getattr(result, "page_state", "unknown")
        reasoning = getattr(result, "visual_reasoning", "")
        decision = "proceed" if confidence >= TIER05_THRESHOLD else "skip"

        print(
            f"[Tier 0.5] Visual gate: merchant={merchant_name}, "
            f"confidence={confidence:.2f}, state={page_state}, decision={decision}"
        )

        return {
            "confidence": confidence,
            "page_state": page_state,
            "reasoning": reasoning,
            "decision": decision,
            "tier": "0.5",
        }

    except Exception as e:
        print(f"[Tier 0.5] Visual gate error: {e}, defaulting to skip (conservative)")
        return {
            "confidence": 0.5,
            "page_state": "unknown",
            "reasoning": f"Visual assessment failed ({e}), conservative skip",
            "decision": "skip",
            "tier": "0.5",
        }

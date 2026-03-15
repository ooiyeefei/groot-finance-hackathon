"""
MIPROv2-optimized troubleshooter for CUA form fill failures.

Generates cuaHints from failure context. Can be optimized offline
using MIPROv2 with hint_effectiveness as the metric function.
"""

import dspy
from typing import Optional


class FormDiagnosis(dspy.Signature):
    """Diagnose why an e-invoice form fill attempt failed and generate
    actionable remediation hints for the CUA agent's next attempt.

    Focus on SPECIFIC, ACTIONABLE instructions — not generic advice.
    Examples of good hints:
    - "Click the Company tab before filling fields"
    - "Phone field uses react-phone-input with +60 prefix — enter 9-digit number without leading 0"
    - "cloudflare_managed: Use Browserbase for residential IP"
    - "manual_only: persistent CAPTCHA blocker, cannot automate"
    """

    error_message: str = dspy.InputField(desc="Error message or failure description from the CUA attempt")
    merchant_name: str = dspy.InputField(desc="Name of the merchant whose form was being filled")
    screenshot_description: str = dspy.InputField(desc="Description of what the page looked like at failure")
    previous_hints: str = dspy.InputField(desc="Any previously saved cuaHints for this merchant (empty if none)")
    tier_reached: str = dspy.InputField(desc="Which tier failed: tier1, tier2, tier2b, or tier3")

    diagnosis: str = dspy.OutputField(desc="What went wrong (1-2 sentences)")
    cua_hints: str = dspy.OutputField(desc="Specific actionable instruction for CUA on next attempt (max 200 chars)")
    failure_category: str = dspy.OutputField(desc="One of: connectivity, form_validation, session, captcha, unknown")
    is_fixable: bool = dspy.OutputField(desc="True if the hint can fix this on retry, False if manual-only")


class OptimizedTroubleshooter(dspy.Module):
    """Troubleshooter module that can be optimized with MIPROv2.

    In baseline mode, uses a simple dspy.Predict.
    When optimized, uses the saved prompts/demos from MIPROv2.
    """

    def __init__(self):
        super().__init__()
        self.diagnose = dspy.Predict(FormDiagnosis)

    def forward(self, error_message: str, merchant_name: str,
                screenshot_description: str, previous_hints: str = "",
                tier_reached: str = "tier2"):
        result = self.diagnose(
            error_message=error_message,
            merchant_name=merchant_name,
            screenshot_description=screenshot_description,
            previous_hints=previous_hints,
            tier_reached=tier_reached,
        )
        return result


def create_troubleshooter(optimized_state: Optional[dict] = None) -> OptimizedTroubleshooter:
    """Create a troubleshooter module, optionally loading optimized state.

    Args:
        optimized_state: Dict from S3 module cache (module_loader.load_optimized_module).
                         If None, returns baseline (non-optimized) module.
    """
    module = OptimizedTroubleshooter()

    if optimized_state and "dspy_state" in optimized_state:
        try:
            # DSPy modules can load state from a dict
            import tempfile
            import json
            with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
                json.dump(optimized_state["dspy_state"], f)
                tmp_path = f.name
            module.load(tmp_path)
            import os
            os.unlink(tmp_path)
            print(f"[DSPy] Troubleshooter loaded optimized state (version={optimized_state.get('version', '?')})")
        except Exception as e:
            print(f"[DSPy] Failed to load optimized troubleshooter state: {e}, using baseline")

    return module


def hint_effectiveness_metric(example, pred, trace=None):
    """Metric for MIPROv2: did the generated hint lead to success on the next attempt?

    Used during offline optimization training. The training dataset contains:
    - example.next_attempt_succeeded: bool (ground truth from feedback loop)
    - pred.cua_hints: str (generated hint)
    - pred.is_fixable: bool (prediction of fixability)

    Returns True if:
    1. The hint led to success on the next attempt (ground truth)
    2. OR the hint correctly identified an unfixable issue (is_fixable=False and indeed failed)
    """
    if not hasattr(example, "next_attempt_succeeded"):
        return False

    # Reward hints that actually helped
    if example.next_attempt_succeeded:
        return True

    # Reward correct identification of unfixable issues
    if not pred.is_fixable and not example.next_attempt_succeeded:
        return True

    return False

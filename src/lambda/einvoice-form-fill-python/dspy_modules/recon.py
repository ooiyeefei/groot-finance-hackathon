"""
BootstrapFewShot-compatible recon-to-instructions module.

Learns from successful form fill patterns across merchants.
New merchants benefit from cross-merchant intelligence.
"""

import dspy
from typing import Optional


class ReconToInstructions(dspy.Signature):
    """Given a recon description of a merchant's form layout,
    generate specific CUA instructions for filling the form.

    The recon description lists form fields with their types,
    labels, and current state (empty/pre-filled).

    Generate instructions that tell the CUA agent exactly how
    to fill each field, in what order, and what to watch out for.

    IMPORTANT: Consider the runtime_environment when generating instructions.
    - "lambda": Running in AWS Lambda with limited memory (2GB) and no persistent
      browser state. Avoid memory-heavy operations like opening multiple tabs,
      loading large images, or extended scrolling. Prefer direct CSS selectors.
    - "browserbase": Running in Browserbase with residential IP and full browser.
      Can handle more complex interactions (multiple tabs, popups, longer sessions).
      Has anti-detection features but may be slower.
    """

    recon_description: str = dspy.InputField(
        desc="Form field descriptions from vision recon, e.g. '1. Company Name — text input — empty'"
    )
    merchant_name: str = dspy.InputField(desc="Name of the merchant")
    buyer_details: str = dspy.InputField(
        desc="JSON of buyer details to fill: {companyName, tin, brn, email, phone, address}"
    )
    previous_cua_hints: str = dspy.InputField(
        desc="Previously learned cuaHints for this merchant (empty if new merchant)"
    )
    runtime_environment: str = dspy.InputField(
        desc="Runtime environment: 'lambda' (AWS Lambda, 2GB RAM, no anti-detect) or "
             "'browserbase' (residential IP, anti-detect, full browser). "
             "Tailor instructions to the environment's capabilities and limitations."
    )

    cua_instructions: str = dspy.OutputField(
        desc="Step-by-step CUA instructions for filling this specific form. "
             "Include field order, special handling (dropdowns, phone prefixes, tabs), "
             "and submit button location. "
             "Adapt strategy to the runtime_environment constraints."
    )


class ReconModule(dspy.Module):
    """Recon-to-instructions module that can be optimized with BootstrapFewShot.

    In baseline mode, uses dspy.ChainOfThought for reasoning.
    When optimized, includes proven few-shot examples from successful fills.
    """

    def __init__(self):
        super().__init__()
        self.generate = dspy.ChainOfThought(ReconToInstructions)

    def forward(self, recon_description: str, merchant_name: str,
                buyer_details: str, previous_cua_hints: str = "",
                runtime_environment: str = "lambda"):
        return self.generate(
            recon_description=recon_description,
            merchant_name=merchant_name,
            buyer_details=buyer_details,
            previous_cua_hints=previous_cua_hints,
            runtime_environment=runtime_environment,
        )


def create_recon_module(optimized_state: Optional[dict] = None) -> ReconModule:
    """Create a recon module, optionally loading optimized state."""
    module = ReconModule()

    if optimized_state and "dspy_state" in optimized_state:
        try:
            import tempfile, json, os
            with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
                json.dump(optimized_state["dspy_state"], f)
                tmp_path = f.name
            module.load(tmp_path)
            os.unlink(tmp_path)
            print(f"[DSPy] Recon module loaded optimized state")
        except Exception as e:
            print(f"[DSPy] Failed to load optimized recon state: {e}, using baseline")

    return module


def recon_success_metric(example, pred, trace=None):
    """Metric for BootstrapFewShot: did the recon instructions lead to
    a successful form fill with low CUA turn count?

    Training dataset contains:
    - example.succeeded: bool
    - example.cua_turns: int (number of CUA actions taken)
    """
    if not hasattr(example, "succeeded"):
        return False

    # Must have succeeded
    if not example.succeeded:
        return False

    # Prefer low turn count (efficient fills)
    if hasattr(example, "cua_turns") and example.cua_turns <= 20:
        return True

    return example.succeeded

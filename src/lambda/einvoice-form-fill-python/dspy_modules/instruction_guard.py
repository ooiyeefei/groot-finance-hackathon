"""
CUA instruction guard with Assert/Suggest constraints.

Enforces that all required buyer fields are present in CUA instructions.
Suggests using CSS selectors when formConfig is available.
Auto-backtracks and retries on constraint violations (up to 3 times).
"""

import dspy


class CUAInstructionGenerator(dspy.Signature):
    """Generate CUA (Computer Use Agent) instructions for filling a
    merchant's e-invoice buyer information form.

    CRITICAL: All required buyer fields MUST appear in the instructions.
    Required fields: email, company name, TIN (Tax Identification Number).

    When CSS selectors are available from formConfig, prefer using them
    for faster, more reliable form filling.
    """

    form_description: str = dspy.InputField(
        desc="Description of the merchant's form (from recon or formConfig)"
    )
    buyer_details: str = dspy.InputField(
        desc="JSON of buyer details: {companyName, tin, brn, email, phone, address}"
    )
    form_selectors: str = dspy.InputField(
        desc="CSS selectors from formConfig (empty string if none available)"
    )
    cua_hints: str = dspy.InputField(
        desc="Learned cuaHints for this merchant (empty if none)"
    )

    instructions: str = dspy.OutputField(
        desc="Complete CUA instructions including ALL required fields (email, company, TIN)"
    )


class InstructionGuard(dspy.Module):
    """Wraps CUA instruction generation with Assert/Suggest constraints.

    Assert (hard): All required buyer fields must be addressed
    Suggest (soft): Prefer CSS selectors when available
    """

    REQUIRED_FIELDS = ["email", "company", "tin"]

    def __init__(self):
        super().__init__()
        self.generate = dspy.Predict(CUAInstructionGenerator)

    def forward(self, form_description: str, buyer_details: str,
                form_selectors: str = "", cua_hints: str = ""):
        result = self.generate(
            form_description=form_description,
            buyer_details=buyer_details,
            form_selectors=form_selectors,
            cua_hints=cua_hints,
        )

        instructions_lower = result.instructions.lower()

        # Hard constraint: All required fields must be mentioned
        for field in self.REQUIRED_FIELDS:
            dspy.Assert(
                field in instructions_lower,
                f"Instructions MUST address the '{field}' field. "
                f"The buyer's {field} information must be filled in the form.",
                target_module=self.generate,
            )

        # Soft constraint: Prefer CSS selectors when available
        if form_selectors and form_selectors.strip():
            dspy.Suggest(
                "input[" in result.instructions or "#" in result.instructions
                or "select[" in result.instructions or "." in result.instructions,
                "When CSS selectors are available, reference them in instructions "
                "for faster, more reliable form filling (e.g., 'Fill input#email with...')",
                target_module=self.generate,
            )

        return result


def create_instruction_guard() -> InstructionGuard:
    """Create an instruction guard module.

    This module doesn't need offline optimization — it uses runtime
    Assert/Suggest constraints that are evaluated on every call.
    """
    return InstructionGuard()


def generate_guarded_instructions(
    form_description: str,
    buyer_details: str,
    form_selectors: str = "",
    cua_hints: str = "",
    max_retries: int = 3,
) -> dict:
    """Generate CUA instructions with constraint enforcement.

    Returns:
        {"instructions": str, "retries": int, "fallback": bool}
    """
    guard = create_instruction_guard()

    try:
        with dspy.settings.context(backtrack_to=guard.generate, max_backtracks=max_retries):
            result = guard(
                form_description=form_description,
                buyer_details=buyer_details,
                form_selectors=form_selectors,
                cua_hints=cua_hints,
            )
            return {
                "instructions": result.instructions,
                "retries": 0,  # DSPy handles retries internally
                "fallback": False,
            }
    except Exception as e:
        print(f"[DSPy] Instruction guard failed after {max_retries} retries: {e}")
        # Fallback: return unguarded instructions
        return {
            "instructions": (
                f"Fill the form with buyer details. "
                f"Company: extract from buyer_details. "
                f"Email: extract from buyer_details. "
                f"TIN: extract from buyer_details. "
                f"Additional hints: {cua_hints}"
            ),
            "retries": max_retries,
            "fallback": True,
        }

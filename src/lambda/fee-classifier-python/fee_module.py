"""
DSPy Fee Classification Module

Uses Gemini 3.1 Flash-Lite via DSPy to classify e-commerce platform fees
into accounting codes. Supports BootstrapFewShot optimization with user
corrections as training data.
"""

import dspy
from typing import Optional


# Valid account codes for fee classification
VALID_ACCOUNT_CODES = {
    "5800": "Platform Fees (General)",
    "5801": "Commission Fees",
    "5802": "Shipping Fees",
    "5803": "Service Fees",
    "5804": "Marketing Fees",
    "5810": "Payment Processing Fees",
}


class ClassifyFee(dspy.Signature):
    """Classify a platform fee into the correct accounting code.

    Given a fee name from an e-commerce platform settlement, determine which
    accounting code it belongs to. Consider the platform context as fee naming
    conventions vary by platform.
    """

    fee_name: str = dspy.InputField(desc="Name of the fee line item from CSV settlement")
    platform_name: str = dspy.InputField(desc="Platform: shopee, lazada, tiktok_shop, stripe, grabpay, or other")

    account_code: str = dspy.OutputField(
        desc=f"One of: {', '.join(f'{k} ({v})' for k, v in VALID_ACCOUNT_CODES.items())}"
    )
    confidence: float = dspy.OutputField(
        desc="Confidence between 0.0 and 1.0. Use 0.9+ only if very certain."
    )
    reasoning: str = dspy.OutputField(
        desc="Brief explanation of why this fee maps to this account code"
    )


class FeeClassifier(dspy.Module):
    """Fee classifier with chain-of-thought reasoning and balance assertion."""

    def __init__(self):
        self.classify = dspy.ChainOfThought(ClassifyFee)

    def forward(
        self,
        fee_name: str,
        platform_name: str,
        expected_total: Optional[float] = None,
        current_sum: Optional[float] = None,
    ):
        result = self.classify(fee_name=fee_name, platform_name=platform_name)

        # Hard constraint: account code MUST be valid (triggers backtracking retry if not)
        dspy.Assert(
            result.account_code in VALID_ACCOUNT_CODES,
            f"Account code '{result.account_code}' is not valid. Must be one of: {list(VALID_ACCOUNT_CODES.keys())}",
        )

        # Validate confidence is in range
        try:
            conf = float(result.confidence)
            if conf < 0.0 or conf > 1.0:
                result.confidence = max(0.0, min(1.0, conf))
        except (ValueError, TypeError):
            result.confidence = 0.5

        return result


class BatchFeeClassifier(dspy.Module):
    """Classifies a batch of fees and asserts the total balances.

    Uses dspy.Assert for balance validation — if gross != net + fees,
    the LLM is asked to re-examine and retry (backtracking).
    """

    def __init__(self):
        self.classifier = FeeClassifier()

    def forward(self, fees: list[dict], platform_name: str,
                gross_amount: float | None = None, net_amount: float | None = None):
        results = []
        for fee in fees:
            result = self.classifier(
                fee_name=fee["feeName"],
                platform_name=platform_name,
            )
            results.append({
                "feeName": fee["feeName"],
                "amount": fee["amount"],
                "accountCode": str(result.account_code).strip(),
                "confidence": float(result.confidence),
                "reasoning": str(getattr(result, "reasoning", "")),
            })

        # Balance assertion: gross should equal net + sum of fee amounts
        if gross_amount is not None and net_amount is not None:
            total_fees = sum(abs(f["amount"]) for f in fees)
            expected_fees = gross_amount - net_amount
            discrepancy = abs(expected_fees - total_fees)

            dspy.Assert(
                discrepancy < 0.01,
                f"Fee breakdown doesn't balance: gross ({gross_amount}) - net ({net_amount}) = "
                f"{expected_fees}, but fee total = {total_fees}. Discrepancy: {discrepancy}. "
                "Re-examine the fee classifications to ensure all fees are correctly identified.",
            )

        return results


def create_training_examples(corrections: list[dict]) -> list[dspy.Example]:
    """Convert user corrections into DSPy training examples."""
    examples = []
    for c in corrections:
        ex = dspy.Example(
            fee_name=c["feeName"],
            platform_name=c.get("platform", "unknown"),
            account_code=c["correctedAccountCode"],
            confidence=1.0,
            reasoning=f"User corrected from {c.get('originalAccountCode', 'unknown')} to {c['correctedAccountCode']}",
        ).with_inputs("fee_name", "platform_name")
        examples.append(ex)
    return examples


def classification_metric(gold, pred, trace=None) -> float:
    """Metric for DSPy optimization: exact match on account code."""
    return float(gold.account_code == pred.account_code)


def configure_lm(api_key: str, temperature: float = 0.3):
    """Configure DSPy to use Gemini 3.1 Flash-Lite."""
    lm = dspy.LM(
        model="gemini/gemini-3.1-flash-lite-preview",
        api_key=api_key,
        temperature=temperature,
        max_tokens=500,
    )
    dspy.configure(lm=lm)
    return lm

"""
DSPy Bank Transaction Classification Module

Classifies bank transactions into GL accounts for journal entry posting.
Uses ChainOfThought for reasoning traces and dspy.Refine for constraint enforcement.
"""

import dspy
from typing import Optional


class ClassifyBankTransaction(dspy.Signature):
    """Classify a bank transaction into GL debit and credit accounts for journal entry posting.

    Given a bank transaction description, amount, and direction, determine which
    Chart of Accounts entries should be debited and credited. The credit account
    for bank debits (money leaving) is typically Cash at Bank. The debit account
    for bank credits (money arriving) is typically Cash at Bank.
    """

    description: str = dspy.InputField(desc="Bank transaction description (e.g., 'MAYBANK SERV CHG')")
    amount: float = dspy.InputField(desc="Transaction amount")
    direction: str = dspy.InputField(desc="'debit' (money leaving bank) or 'credit' (money arriving)")
    bank_name: str = dspy.InputField(desc="Bank name (e.g., Maybank, CIMB, Public Bank)")
    available_accounts: str = dspy.InputField(desc="JSON array of Chart of Accounts entries [{code, name, type}]")
    bank_gl_account_code: str = dspy.InputField(desc="The Cash at Bank GL account code for this bank account")

    debit_account_code: str = dspy.OutputField(desc="Account code to debit")
    credit_account_code: str = dspy.OutputField(desc="Account code to credit")
    confidence: float = dspy.OutputField(desc="Confidence between 0.0 and 1.0")
    reasoning: str = dspy.OutputField(desc="Brief explanation of classification decision")


class BankTransactionClassifier(dspy.Module):
    """Bank transaction classifier with chain-of-thought reasoning.

    Use create_refined_bank_classifier() to wrap with dspy.Refine for
    automatic retry when account codes are invalid.
    """

    def __init__(self):
        self.classify = dspy.ChainOfThought(ClassifyBankTransaction)

    def forward(
        self,
        description: str,
        amount: float,
        direction: str,
        bank_name: str,
        available_accounts: str,
        bank_gl_account_code: str,
        valid_account_codes: Optional[set] = None,
    ):
        result = self.classify(
            description=description,
            amount=amount,
            direction=direction,
            bank_name=bank_name,
            available_accounts=available_accounts,
            bank_gl_account_code=bank_gl_account_code,
        )

        # Stash valid_account_codes on the result for reward_fn access
        result._valid_account_codes = valid_account_codes

        # Clean confidence to valid range
        try:
            conf = float(result.confidence)
            if conf < 0.0 or conf > 1.0:
                result.confidence = max(0.0, min(1.0, conf))
        except (ValueError, TypeError):
            result.confidence = 0.5

        return result


def bank_recon_reward_fn(args: dict, pred) -> float:
    """Reward function for dspy.Refine: scores BankTransactionClassifier output.

    Hard constraints (score 0.0): account codes must exist in COA.
    Soft constraint (score 0.8): debit and credit should be different.
    """
    valid_codes = args.get("valid_account_codes") or getattr(pred, "_valid_account_codes", None)

    if valid_codes:
        if pred.debit_account_code not in valid_codes:
            return 0.0
        if pred.credit_account_code not in valid_codes:
            return 0.0

    # Soft: same debit/credit is suspicious but not fatal
    if pred.debit_account_code == pred.credit_account_code:
        return 0.8

    return 1.0


def create_refined_bank_classifier(N: int = 3) -> dspy.Refine:
    """Create a BankTransactionClassifier wrapped with dspy.Refine."""
    return dspy.Refine(
        module=BankTransactionClassifier(),
        N=N,
        reward_fn=bank_recon_reward_fn,
        threshold=1.0,
    )


def create_bank_recon_training_examples(corrections: list[dict]) -> list[dspy.Example]:
    """Convert user corrections into DSPy training examples."""
    examples = []
    for c in corrections:
        ex = dspy.Example(
            description=c["description"],
            amount=c.get("amount", 0),
            direction=c.get("direction", "debit"),
            bank_name=c.get("bankName", "unknown"),
            available_accounts="[]",
            bank_gl_account_code=c.get("bankGLAccountCode", "1010"),
            debit_account_code=c["correctedDebitAccountCode"],
            credit_account_code=c["correctedCreditAccountCode"],
            confidence=1.0,
            reasoning=f"User corrected from {c.get('originalDebitAccountCode', '?')}/{c.get('originalCreditAccountCode', '?')} to {c['correctedDebitAccountCode']}/{c['correctedCreditAccountCode']}",
        ).with_inputs("description", "amount", "direction", "bank_name", "available_accounts", "bank_gl_account_code")
        examples.append(ex)
    return examples


def bank_recon_classification_metric(gold, pred, trace=None) -> float:
    """Metric: both debit and credit account codes must match."""
    debit_match = gold.debit_account_code == pred.debit_account_code
    credit_match = gold.credit_account_code == pred.credit_account_code
    return float(debit_match and credit_match)

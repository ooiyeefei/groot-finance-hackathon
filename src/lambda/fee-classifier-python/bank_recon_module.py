"""
DSPy Bank Transaction Classification Module

Classifies bank transactions into GL accounts for journal entry posting.
Uses ChainOfThought for reasoning traces and Assert for double-entry validation.
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
    """Bank transaction classifier with chain-of-thought and assertion validation."""

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

        # Validate: account codes must exist in COA
        if valid_account_codes:
            if result.debit_account_code not in valid_account_codes:
                raise ValueError(
                    f"Debit account '{result.debit_account_code}' not in Chart of Accounts. Choose from: {sorted(valid_account_codes)[:20]}"
                )
            if result.credit_account_code not in valid_account_codes:
                raise ValueError(
                    f"Credit account '{result.credit_account_code}' not in Chart of Accounts. Choose from: {sorted(valid_account_codes)[:20]}"
                )

        # Soft constraint: debit and credit should be different accounts
        if result.debit_account_code == result.credit_account_code:
            import logging
            logging.getLogger(__name__).warning(
                "Debit and credit accounts should be different for a valid journal entry."
            )

        # Validate confidence range
        try:
            conf = float(result.confidence)
            if conf < 0.0 or conf > 1.0:
                result.confidence = max(0.0, min(1.0, conf))
        except (ValueError, TypeError):
            result.confidence = 0.5

        return result


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

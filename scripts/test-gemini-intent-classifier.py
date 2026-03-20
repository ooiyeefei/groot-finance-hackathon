"""
Test: Can Gemini handle intent classification for financial queries?

Tests whether Gemini's safety filters block simple query classification
(personal_data vs general_knowledge) for financial/accounting questions.

Run: GEMINI_API_KEY=xxx python scripts/test-gemini-intent-classifier.py
"""

import os
import dspy

API_KEY = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_AI_API_KEY")
MODEL = "gemini/gemini-2.0-flash"

if not API_KEY:
    print("ERROR: Set GEMINI_API_KEY environment variable")
    exit(1)


class IntentClassifier(dspy.Signature):
    """Classify a user's chat query into one of two categories:

    personal_data: The user is asking about THEIR OWN business financial data.
    Examples: revenue, expenses, invoices, cash flow, aging reports, vendor costs,
    employee spending, team expenses, outstanding receivables, payables.

    general_knowledge: The user is asking about regulations, tax rules, compliance
    requirements, or how things work in general — NOT about their specific data.
    Examples: GST rules, tax rates, how to register a business, OVR requirements.

    IMPORTANT: Queries about "our revenue", "our invoices", "how much do we owe"
    are personal_data — they ask about the user's business, not general concepts.
    """
    query: str = dspy.InputField(desc="The user's chat message")
    category: str = dspy.OutputField(desc="Must be exactly: personal_data OR general_knowledge")
    confidence: float = dspy.OutputField(desc="Confidence 0.0-1.0")
    reasoning: str = dspy.OutputField(desc="One sentence explanation")


class ClassifierModule(dspy.Module):
    def __init__(self):
        self.classify = dspy.ChainOfThought(IntentClassifier)

    def forward(self, query: str):
        result = self.classify(query=query)
        # Normalize category
        cat = result.category.strip().lower().replace(" ", "_")
        if "personal" in cat or "data" in cat:
            cat = "personal_data"
        elif "general" in cat or "knowledge" in cat:
            cat = "general_knowledge"
        result.category = cat
        return result


TEST_CASES = [
    # Personal data queries
    ("What's our total revenue this month?", "personal_data"),
    ("How much do we owe suppliers?", "personal_data"),
    ("Show me invoices from Teo Hin this quarter", "personal_data"),
    ("What's our cash flow runway?", "personal_data"),
    ("Show me my expenses this month", "personal_data"),
    ("How much did the team spend on meals?", "personal_data"),
    ("Any overdue invoices?", "personal_data"),
    ("What's the AP aging report?", "personal_data"),
    ("Show me all office supply expenses", "personal_data"),
    ("How much did Kate claim for petrol from Jan to May?", "personal_data"),
    ("Who spent the most on travel this quarter?", "personal_data"),
    ("What's our outstanding receivables?", "personal_data"),
    ("Compare vendor costs", "personal_data"),
    ("Show me the P&L summary", "personal_data"),
    ("Total business spending this quarter", "personal_data"),

    # General knowledge queries
    ("What are the GST registration requirements in Singapore?", "general_knowledge"),
    ("How does Overseas Vendor Registration work?", "general_knowledge"),
    ("Explain the SST rules in Malaysia", "general_knowledge"),
    ("What's the corporate tax rate in Thailand?", "general_knowledge"),
    ("How to register a business in Indonesia?", "general_knowledge"),
]


def main():
    print(f"Testing intent classification with {MODEL}")
    print("=" * 80)

    lm = dspy.LM(model=MODEL, api_key=API_KEY, temperature=0.1, max_tokens=200)
    dspy.configure(lm=lm)

    classifier = ClassifierModule()
    correct = 0
    blocked = 0
    wrong = 0

    for query, expected in TEST_CASES:
        try:
            result = classifier(query=query)
            is_correct = result.category == expected
            if is_correct:
                correct += 1
                status = "PASS"
            else:
                wrong += 1
                status = "FAIL"
            print(f"{status} | {query}")
            print(f"  Expected: {expected} | Got: {result.category} | Conf: {result.confidence}")
            print(f"  Reasoning: {str(result.reasoning)[:120]}")
        except Exception as e:
            blocked += 1
            err = str(e)
            is_safety = any(w in err.upper() for w in ["SAFETY", "BLOCKED", "HARM", "RECITATION"])
            print(f"{'SAFETY_BLOCK' if is_safety else 'ERROR'} | {query}")
            print(f"  {err[:150]}")

    total = len(TEST_CASES)
    print("\n" + "=" * 80)
    print(f"RESULTS: {correct}/{total} correct, {wrong} wrong, {blocked} blocked/error")
    print(f"Accuracy: {correct/total*100:.1f}%  |  Block rate: {blocked/total*100:.1f}%")

    if blocked > 0:
        print("\n⚠️  Gemini blocked/errored on some queries — check if safety or API issue")
    elif correct == total:
        print("\n✅ PERFECT — Gemini classifies all financial queries correctly!")
        print("   Safe to use for DSPy intent classifier. No safety filter issues.")
    elif correct >= total - 2:
        print(f"\n✅ GOOD — {wrong} misclassification(s). BootstrapFewShot training will fix these.")
    else:
        print(f"\n⚠️  {wrong} misclassifications — needs more training data or prompt tuning")


if __name__ == "__main__":
    main()

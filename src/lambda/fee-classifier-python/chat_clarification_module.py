"""
DSPy Clarification Judge Module for Chat Agent

Determines when a query is ambiguous and generates targeted clarification questions.
Uses Predict (simple, fast) since this is a binary decision + question generation.

Training data: user corrections (correctionType="clarification" — future).
"""

import dspy


class JudgeClarification(dspy.Signature):
    """Determine if a user query needs clarification before it can be answered.

    Only ask for clarification when the query is genuinely ambiguous (e.g., single-word
    query like "invoices" that could mean the user's invoices OR a general question).
    NEVER ask for clarification on queries that clearly refer to the user's own data.
    """

    query: str = dspy.InputField(desc="The user's chat message")
    conversation_context: str = dspy.InputField(desc="Recent conversation history")

    needs_clarification: bool = dspy.OutputField(
        desc="True ONLY if the query is genuinely ambiguous"
    )
    clarification_question: str = dspy.OutputField(
        desc="A specific question to disambiguate (empty string if not needed)"
    )
    reasoning: str = dspy.OutputField(desc="Brief explanation")


class ClarificationJudge(dspy.Module):
    """Clarification judge using simple Predict (fast, no chain-of-thought needed)."""

    def __init__(self):
        self.judge = dspy.Predict(JudgeClarification)

    def forward(self, query: str, conversation_context: str = ""):
        result = self.judge(
            query=query,
            conversation_context=conversation_context,
        )
        return result


def create_clarification_training_examples(corrections: list[dict]) -> list[dspy.Example]:
    """Convert clarification corrections into DSPy training examples."""
    examples = []
    for c in corrections:
        ex = dspy.Example(
            query=c.get("query", ""),
            conversation_context=c.get("conversationContext", ""),
            needs_clarification=c.get("shouldHaveClarified", False),
            clarification_question=c.get("suggestedQuestion", ""),
            reasoning="Training example from user correction",
        ).with_inputs("query", "conversation_context")
        examples.append(ex)
    return examples


def clarification_metric(gold, pred, trace=None) -> float:
    """Metric: correct clarification decision (ask or don't ask)."""
    return float(gold.needs_clarification == pred.needs_clarification)

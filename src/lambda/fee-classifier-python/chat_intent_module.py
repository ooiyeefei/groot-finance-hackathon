"""
DSPy Intent Classifier Module for Chat Agent

Classifies user queries into intent categories (personal_data vs general_knowledge)
and primary intent types. Uses ChainOfThought for explainable classification.

Training data: user corrections from chat_agent_corrections table (correctionType="intent").
"""

import dspy
from typing import Optional


# Valid intent categories and primary intents
VALID_CATEGORIES = {"personal_data", "general_knowledge", "other"}
VALID_INTENTS = {
    "regulatory_knowledge", "business_setup", "transaction_analysis",
    "document_search", "compliance_check", "general_inquiry",
}


class ClassifyIntent(dspy.Signature):
    """Classify a user query into an intent category for a financial assistant.

    Determine whether the user is asking about their own business data (personal_data),
    general financial/regulatory knowledge, or something else.
    """

    query: str = dspy.InputField(desc="The user's chat message")
    conversation_context: str = dspy.InputField(
        desc="Recent conversation history for context (may be empty)"
    )

    query_category: str = dspy.OutputField(
        desc="One of: personal_data, general_knowledge, other"
    )
    primary_intent: str = dspy.OutputField(
        desc="One of: regulatory_knowledge, business_setup, transaction_analysis, "
             "document_search, compliance_check, general_inquiry"
    )
    confidence: float = dspy.OutputField(
        desc="Confidence between 0.0 and 1.0"
    )
    reasoning: str = dspy.OutputField(
        desc="Brief explanation of why this classification was chosen"
    )


class IntentClassifier(dspy.Module):
    """Intent classifier with chain-of-thought reasoning."""

    def __init__(self):
        self.classify = dspy.ChainOfThought(ClassifyIntent)

    def forward(self, query: str, conversation_context: str = ""):
        result = self.classify(
            query=query,
            conversation_context=conversation_context,
        )

        # Soft constraint: category must be valid
        dspy.Suggest(
            result.query_category in VALID_CATEGORIES,
            f"Category '{result.query_category}' is not valid. Must be one of: {VALID_CATEGORIES}",
        )

        # Soft constraint: intent must be valid
        dspy.Suggest(
            result.primary_intent in VALID_INTENTS,
            f"Intent '{result.primary_intent}' is not valid. Must be one of: {VALID_INTENTS}",
        )

        # Clamp confidence
        try:
            conf = float(result.confidence)
            result.confidence = max(0.0, min(1.0, conf))
        except (ValueError, TypeError):
            result.confidence = 0.5

        return result


def create_intent_training_examples(corrections: list[dict]) -> list[dspy.Example]:
    """Convert user corrections into DSPy training examples."""
    examples = []
    for c in corrections:
        ex = dspy.Example(
            query=c["originalQuery"],
            conversation_context="",
            query_category=c.get("correctedIntent", "personal_data"),
            primary_intent=c.get("correctedPrimaryIntent", "transaction_analysis"),
            confidence=1.0,
            reasoning=f"User corrected from {c.get('originalIntent', 'unknown')} to {c.get('correctedIntent', 'unknown')}",
        ).with_inputs("query", "conversation_context")
        examples.append(ex)
    return examples


def intent_classification_metric(gold, pred, trace=None) -> float:
    """Metric: exact match on query_category (the critical routing decision)."""
    return float(gold.query_category == pred.query_category)

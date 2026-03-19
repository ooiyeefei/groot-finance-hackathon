"""
DSPy Response Quality Module for Chat Agent

Evaluates and improves response quality for data-heavy queries.
Runs selectively — only on multi-tool or complex data queries.
Uses ChainOfThought for quality evaluation.

Training data: user corrections (correctionType="response_quality" — future).
"""

import dspy


class EvaluateResponse(dspy.Signature):
    """Evaluate whether an AI response is high-quality for a financial query.

    Check that the response: uses actual numbers from the tool result (no fabrication),
    is well-formatted (tables for multi-row data), clearly answers the question,
    and doesn't include hallucinated information.
    """

    query: str = dspy.InputField(desc="The original user query")
    tool_result: str = dspy.InputField(desc="The raw data returned by the tool")
    candidate_response: str = dspy.InputField(desc="The AI-generated response to evaluate")

    quality_score: float = dspy.OutputField(
        desc="Quality score 0.0-1.0 (1.0 = perfect, 0.0 = hallucinated or wrong)"
    )
    has_hallucination: bool = dspy.OutputField(
        desc="True if the response contains numbers/facts NOT in the tool result"
    )
    improved_response: str = dspy.OutputField(
        desc="Improved version of the response (or same if already good)"
    )
    reasoning: str = dspy.OutputField(desc="Brief explanation of quality assessment")


class ResponseQualityEvaluator(dspy.Module):
    """Response quality evaluator with chain-of-thought reasoning."""

    def __init__(self):
        self.evaluate = dspy.ChainOfThought(EvaluateResponse)

    def forward(self, query: str, tool_result: str, candidate_response: str):
        result = self.evaluate(
            query=query,
            tool_result=tool_result,
            candidate_response=candidate_response,
        )

        # Clamp quality score
        try:
            result.quality_score = max(0.0, min(1.0, float(result.quality_score)))
        except (ValueError, TypeError):
            result.quality_score = 0.5

        return result


def create_response_quality_training_examples(corrections: list[dict]) -> list[dspy.Example]:
    """Convert response quality corrections into DSPy training examples."""
    examples = []
    for c in corrections:
        ex = dspy.Example(
            query=c.get("query", ""),
            tool_result=c.get("toolResult", ""),
            candidate_response=c.get("originalResponse", ""),
            quality_score=0.0,  # User corrected = original was bad
            has_hallucination=True,
            improved_response=c.get("correctedResponse", ""),
            reasoning="User correction indicates quality issue",
        ).with_inputs("query", "tool_result", "candidate_response")
        examples.append(ex)
    return examples


def response_quality_metric(gold, pred, trace=None) -> float:
    """Metric: hallucination detection accuracy."""
    return float(gold.has_hallucination == pred.has_hallucination)

"""
DSPy Parameter Extractor Module for Chat Agent

Extracts structured parameters (dates, names, categories) from user queries
for the selected tool. Uses ChainOfThought for step-by-step extraction.

Training data: user corrections from chat_agent_corrections table (correctionType="parameter_extraction").
"""

import dspy


class ExtractParameters(dspy.Signature):
    """Extract structured parameters from a user query for a specific tool.

    Given the query and the target tool, extract dates, names, categories,
    amounts, and other parameters as a JSON object.
    """

    query: str = dspy.InputField(desc="The user's chat message")
    tool_name: str = dspy.InputField(desc="The tool that will be called")
    tool_schema_json: str = dspy.InputField(desc="JSON schema of the tool's expected parameters")

    parameters_json: str = dspy.OutputField(
        desc="JSON object of extracted parameters matching the tool schema"
    )
    confidence: float = dspy.OutputField(desc="Confidence between 0.0 and 1.0")
    reasoning: str = dspy.OutputField(desc="Brief explanation of parameter extraction logic")


class ParameterExtractor(dspy.Module):
    """Parameter extractor with chain-of-thought reasoning."""

    def __init__(self):
        self.extract = dspy.ChainOfThought(ExtractParameters)

    def forward(self, query: str, tool_name: str, tool_schema_json: str = "{}"):
        result = self.extract(
            query=query,
            tool_name=tool_name,
            tool_schema_json=tool_schema_json,
        )

        # Validate JSON output
        import json
        try:
            json.loads(result.parameters_json)
        except (json.JSONDecodeError, TypeError):
            dspy.Suggest(
                False,
                f"parameters_json must be valid JSON, got: {result.parameters_json[:100]}",
            )

        # Clamp confidence
        try:
            result.confidence = max(0.0, min(1.0, float(result.confidence)))
        except (ValueError, TypeError):
            result.confidence = 0.5

        return result


def create_param_training_examples(corrections: list[dict]) -> list[dspy.Example]:
    """Convert parameter extraction corrections into DSPy training examples."""
    examples = []
    for c in corrections:
        ex = dspy.Example(
            query=c["originalQuery"],
            tool_name=c.get("originalToolName", "unknown"),
            tool_schema_json=c.get("toolSchemaJson", "{}"),
            parameters_json=c.get("correctedParameters", "{}"),
            confidence=1.0,
            reasoning=f"User corrected parameters from {c.get('originalParameters', '{}')} to {c.get('correctedParameters', '{}')}",
        ).with_inputs("query", "tool_name", "tool_schema_json")
        examples.append(ex)
    return examples


def param_extraction_metric(gold, pred, trace=None) -> float:
    """Metric: JSON key overlap between gold and predicted parameters."""
    import json
    try:
        gold_params = json.loads(gold.parameters_json) if isinstance(gold.parameters_json, str) else gold.parameters_json
        pred_params = json.loads(pred.parameters_json) if isinstance(pred.parameters_json, str) else pred.parameters_json
        if not gold_params or not pred_params:
            return 0.0
        gold_keys = set(gold_params.keys())
        pred_keys = set(pred_params.keys())
        if not gold_keys:
            return 1.0 if not pred_keys else 0.0
        overlap = gold_keys & pred_keys
        return len(overlap) / len(gold_keys)
    except (json.JSONDecodeError, TypeError, AttributeError):
        return 0.0

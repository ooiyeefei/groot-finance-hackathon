"""
DSPy Tool Selector Module for Chat Agent

Selects the appropriate tool based on classified intent, user role, and available tools.
Uses ChainOfThought for explainable tool selection.

Training data: user corrections from chat_agent_corrections table (correctionType="tool_selection").
"""

import dspy


class SelectTool(dspy.Signature):
    """Select the best tool to answer a user's financial query.

    Given the user's query, their intent category, role-based available tools,
    determine which tool to call (or 'none' for direct response).
    """

    query: str = dspy.InputField(desc="The user's chat message")
    intent_category: str = dspy.InputField(desc="personal_data, general_knowledge, or other")
    available_tools_json: str = dspy.InputField(desc="JSON array of available tool names for this user's role")
    user_role: str = dspy.InputField(desc="User role: employee, manager, finance_admin, or owner")

    tool_name: str = dspy.OutputField(
        desc="Name of the tool to call, or 'none' if no tool needed"
    )
    confidence: float = dspy.OutputField(desc="Confidence between 0.0 and 1.0")
    reasoning: str = dspy.OutputField(desc="Brief explanation of tool selection")


class ToolSelector(dspy.Module):
    """Tool selector with chain-of-thought reasoning."""

    def __init__(self):
        self.select = dspy.ChainOfThought(SelectTool)

    def forward(self, query: str, intent_category: str,
                available_tools_json: str, user_role: str = "employee"):
        result = self.select(
            query=query,
            intent_category=intent_category,
            available_tools_json=available_tools_json,
            user_role=user_role,
        )

        # Clamp confidence
        try:
            result.confidence = max(0.0, min(1.0, float(result.confidence)))
        except (ValueError, TypeError):
            result.confidence = 0.5

        return result


def create_tool_training_examples(corrections: list[dict]) -> list[dspy.Example]:
    """Convert tool selection corrections into DSPy training examples."""
    examples = []
    for c in corrections:
        ex = dspy.Example(
            query=c["originalQuery"],
            intent_category=c.get("originalIntent", "personal_data"),
            available_tools_json=c.get("availableToolsJson", "[]"),
            user_role=c.get("userRole", "employee"),
            tool_name=c["correctedToolName"],
            confidence=1.0,
            reasoning=f"User corrected from {c.get('originalToolName', 'unknown')} to {c['correctedToolName']}",
        ).with_inputs("query", "intent_category", "available_tools_json", "user_role")
        examples.append(ex)
    return examples


def tool_selection_metric(gold, pred, trace=None) -> float:
    """Metric: exact match on tool_name."""
    return float(gold.tool_name == pred.tool_name)

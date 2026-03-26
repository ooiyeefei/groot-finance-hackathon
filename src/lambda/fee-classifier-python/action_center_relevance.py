"""
Action Center Relevance Classifier (033-ai-action-center-dspy)

DSPy module that learns per-business insight relevance preferences.
Acts as a post-filter: existing detection algorithms generate candidates,
this module classifies each as relevant or noise for the specific business.

5-component pattern:
1. Corrections captured in actionCenterInsights.updateStatus
2. Readiness gate in actionCenterOptimization.checkReadiness
3. Training here via BootstrapFewShot
4. Quality gate comparison (candidate vs previous accuracy)
5. Model promotion in actionCenterOptimization.prepareAndRun
"""

import json
import logging
import os
import time
from typing import Any

import boto3
import dspy

logger = logging.getLogger(__name__)


# --- DSPy Signature ---

class ActionCenterRelevanceSignature(dspy.Signature):
    """Classify whether an Action Center insight is relevant or noise for a specific business.

    Given the insight's type, category, priority, title, description, and affected entities,
    determine if this insight would be useful for the business to see.
    """
    insight_type: str = dspy.InputField(desc="Algorithm identifier (e.g., 'statistical_anomaly', 'employee_expense_spike')")
    category: str = dspy.InputField(desc="Insight category (anomaly, compliance, deadline, cashflow, optimization, categorization)")
    priority: str = dspy.InputField(desc="Priority level (critical, high, medium, low)")
    title: str = dspy.InputField(desc="Short insight title")
    description: str = dspy.InputField(desc="Detailed insight description (truncated to 200 chars)")
    affected_entities: str = dspy.InputField(desc="Comma-separated list of affected entity names")

    relevant: bool = dspy.OutputField(desc="True if this insight is useful to the business, False if noise")
    confidence: float = dspy.OutputField(desc="Confidence score between 0.0 and 1.0")


# --- DSPy Module ---

class ActionCenterRelevanceClassifier(dspy.Module):
    """Predict whether an insight is relevant for a specific business."""

    def __init__(self):
        super().__init__()
        self.predict = dspy.ChainOfThought(ActionCenterRelevanceSignature)

    def forward(self, insight_type, category, priority, title, description, affected_entities):
        result = self.predict(
            insight_type=insight_type,
            category=category,
            priority=priority,
            title=title,
            description=description[:200],
            affected_entities=affected_entities,
        )
        return result


# --- Training Example Creation ---

def create_action_center_training_examples(corrections: list[dict]) -> list[dspy.Example]:
    """Convert correction records into DSPy training examples."""
    examples = []
    for c in corrections:
        ctx = c.get("originalContext", {})
        affected = ", ".join(ctx.get("affectedEntities", [])[:5])  # Limit to 5 entities

        example = dspy.Example(
            insight_type=c.get("insightType", "unknown"),
            category=c.get("category", "unknown"),
            priority=c.get("priority", "medium"),
            title=ctx.get("title", ""),
            description=(ctx.get("description", ""))[:200],
            affected_entities=affected or "none",
            relevant=c.get("isUseful", True),
            confidence=1.0 if c.get("feedbackText") else 0.8,
        ).with_inputs("insight_type", "category", "priority", "title", "description", "affected_entities")

        examples.append(example)

    return examples


# --- Evaluation Metric ---

def action_center_relevance_metric(example, prediction, trace=None) -> float:
    """Score prediction: 1.0 if relevant matches, 0.0 otherwise."""
    predicted = prediction.relevant
    expected = example.relevant

    # Normalize booleans (DSPy sometimes returns strings)
    if isinstance(predicted, str):
        predicted = predicted.lower() in ("true", "yes", "1")
    if isinstance(expected, str):
        expected = expected.lower() in ("true", "yes", "1")

    return 1.0 if predicted == expected else 0.0


# --- Optimization Entry Point ---

def run_action_center_optimization(params: dict) -> dict:
    """Run BootstrapFewShot optimization for action center relevance.

    Args:
        params: {
            module: str,
            businessId: str,
            train: list[dict],
            validation: list[dict],
            previousS3Key: optional str,
            previousAccuracy: optional float,
        }

    Returns:
        dict with accuracy, s3Key, qualityGateResult, optimizedPrompt
    """
    start_time = time.time()

    module_name = params.get("module", "action-center-relevance")
    business_id = params.get("businessId", "unknown")
    train_data = params.get("train", [])
    validation_data = params.get("validation", [])
    previous_s3_key = params.get("previousS3Key")
    previous_accuracy = params.get("previousAccuracy")

    logger.info(
        f"[ActionCenterRelevance] Starting optimization for business {business_id}: "
        f"{len(train_data)} train, {len(validation_data)} validation"
    )

    # Configure DSPy with Gemini
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    lm = dspy.LM(
        model="gemini/gemini-3.1-flash-lite-preview",
        api_key=gemini_key,
        temperature=0.3,
        max_tokens=500,
    )
    dspy.configure(lm=lm)

    # Create training examples
    train_examples = create_action_center_training_examples(train_data)
    val_examples = create_action_center_training_examples(validation_data)

    if not train_examples:
        return {
            "success": False,
            "error": "No training examples after conversion",
        }

    # Initialize module
    classifier = ActionCenterRelevanceClassifier()

    # Evaluate previous model (if exists)
    actual_previous_accuracy = None
    if previous_s3_key and val_examples:
        try:
            s3 = boto3.client("s3")
            bucket = os.environ.get("S3_BUCKET", "finanseal-bucket")
            obj = s3.get_object(Bucket=bucket, Key=previous_s3_key)
            prev_state = json.loads(obj["Body"].read().decode("utf-8"))

            prev_module = ActionCenterRelevanceClassifier()
            prev_module.load_state(prev_state)

            correct = sum(
                action_center_relevance_metric(ex, prev_module(**ex.inputs()))
                for ex in val_examples
            )
            actual_previous_accuracy = correct / len(val_examples) if val_examples else 0
            logger.info(f"[ActionCenterRelevance] Previous model accuracy: {actual_previous_accuracy:.3f}")
        except Exception as e:
            logger.warning(f"[ActionCenterRelevance] Could not load previous model: {e}")
            actual_previous_accuracy = previous_accuracy

    # Run BootstrapFewShot optimization
    optimizer = dspy.BootstrapFewShot(
        metric=action_center_relevance_metric,
        max_bootstrapped_demos=4,
        max_labeled_demos=min(8, len(train_examples)),
    )

    optimized = optimizer.compile(classifier, trainset=train_examples)

    # Evaluate candidate on validation set
    if val_examples:
        correct = sum(
            action_center_relevance_metric(ex, optimized(**ex.inputs()))
            for ex in val_examples
        )
        candidate_accuracy = correct / len(val_examples)
    else:
        candidate_accuracy = 1.0  # No validation = auto-pass

    logger.info(f"[ActionCenterRelevance] Candidate accuracy: {candidate_accuracy:.3f}")

    # Quality gate
    effective_previous = actual_previous_accuracy or previous_accuracy
    if effective_previous is not None:
        passed = candidate_accuracy > effective_previous
        accuracy_delta = candidate_accuracy - effective_previous
    else:
        passed = True  # First run auto-pass
        accuracy_delta = None

    quality_gate_result = {
        "passed": passed,
        "candidateAccuracy": candidate_accuracy,
        "previousAccuracy": effective_previous,
        "accuracyDelta": accuracy_delta,
        "evalSetSize": len(val_examples),
    }

    # Save model to S3 (only if passed)
    s3_key = None
    optimized_prompt = None

    if passed:
        s3 = boto3.client("s3")
        bucket = os.environ.get("S3_BUCKET", "finanseal-bucket")
        model_state = optimized.save_state()

        s3_key = f"dspy-models/{module_name}/{business_id}/v{int(time.time())}.json"
        s3.put_object(
            Bucket=bucket,
            Key=s3_key,
            Body=json.dumps(model_state).encode("utf-8"),
            ContentType="application/json",
        )

        # Also serialize as optimized prompt for TypeScript consumption
        optimized_prompt = json.dumps({
            "module": module_name,
            "businessId": business_id,
            "trainedAt": int(time.time()),
            "accuracy": candidate_accuracy,
            "modelState": model_state,
        })

        logger.info(f"[ActionCenterRelevance] Model saved to s3://{bucket}/{s3_key}")

    duration_ms = int((time.time() - start_time) * 1000)

    return {
        "success": True,
        "accuracy": candidate_accuracy,
        "s3Key": s3_key,
        "qualityGateResult": quality_gate_result,
        "optimizedPrompt": optimized_prompt,
        "trainingExamples": len(train_examples),
        "validationExamples": len(val_examples),
        "durationMs": duration_ms,
    }

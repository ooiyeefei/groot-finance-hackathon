"""
Chat Module Optimization Runner

Runs DSPy optimization for chat agent modules (intent, tool selector,
parameter extractor, response quality, clarification judge).

Called by Lambda handler via `optimize_chat_module` tool route.
Follows the same pattern as existing fee/bank recon/PO/AR optimizers.
"""

import json
import logging
import os
import boto3
from typing import Any

import dspy
from ssm_secrets import get_gemini_api_key
from dspy.teleprompt import BootstrapFewShot

from fee_module import configure_lm

logger = logging.getLogger()

S3_BUCKET = "finanseal-bucket"
DSPY_MODELS_PREFIX = "dspy-models"


def _get_module_and_metric(module_type: str):
    """Load the appropriate DSPy module and metric for the given type."""
    if module_type == "intent":
        from chat_intent_module import (
            IntentClassifier, create_intent_training_examples,
            intent_classification_metric,
        )
        return IntentClassifier(), create_intent_training_examples, intent_classification_metric

    elif module_type == "tool_selector":
        from chat_tool_selector_module import (
            ToolSelector, create_tool_training_examples,
            tool_selection_metric,
        )
        return ToolSelector(), create_tool_training_examples, tool_selection_metric

    elif module_type == "param_extractor":
        from chat_param_extractor_module import (
            ParameterExtractor, create_param_training_examples,
            param_extraction_metric,
        )
        return ParameterExtractor(), create_param_training_examples, param_extraction_metric

    elif module_type == "response_quality":
        from chat_response_quality_module import (
            ResponseQualityEvaluator, create_response_quality_training_examples,
            response_quality_metric,
        )
        return ResponseQualityEvaluator(), create_response_quality_training_examples, response_quality_metric

    elif module_type == "clarification":
        from chat_clarification_module import (
            ClarificationJudge, create_clarification_training_examples,
            clarification_metric,
        )
        return ClarificationJudge(), create_clarification_training_examples, clarification_metric

    else:
        raise ValueError(f"Unknown chat module type: {module_type}")


def run_chat_module_optimization(params: dict) -> dict:
    """Run DSPy optimization for a chat agent module.

    Args:
        params: {
            moduleType: "intent" | "tool_selector" | "param_extractor" | "response_quality" | "clarification",
            corrections: [...],
            currentModelS3Key: str | None,
            optimizerType: "miprov2" | "bootstrap_fewshot" | ...,
            validationSplit: float (default 0.2),
        }

    Returns:
        {
            success: bool,
            optimizedPrompt: str (JSON),
            accuracy: float,
            previousAccuracy: float,
            trainingExamples: int,
            validationAccuracy: float,
            rejected: bool,
            s3Key: str,
        }
    """
    module_type = params.get("moduleType", "intent")
    corrections = params.get("corrections", [])
    current_s3_key = params.get("currentModelS3Key")
    optimizer_type = params.get("optimizerType", "bootstrap_fewshot")
    validation_split = params.get("validationSplit", 0.2)

    if not corrections:
        return {"success": False, "error": "No corrections provided"}

    # Configure LM
    api_key = get_gemini_api_key()
    configure_lm(api_key)

    # Load module, training example creator, and metric
    module, create_examples_fn, metric_fn = _get_module_and_metric(module_type)

    # Create training examples from corrections
    all_examples = create_examples_fn(corrections)
    if len(all_examples) < 10:
        return {"success": False, "error": f"Too few examples ({len(all_examples)}), need at least 10"}

    # Split into train/validation
    split_idx = max(1, int(len(all_examples) * (1 - validation_split)))
    train_examples = all_examples[:split_idx]
    val_examples = all_examples[split_idx:]

    logger.info(f"[ChatOptimizer] Module: {module_type}, Train: {len(train_examples)}, Val: {len(val_examples)}")

    # Load previous model if available (for accuracy comparison)
    previous_accuracy = 0.0
    if current_s3_key:
        try:
            s3 = boto3.client("s3", region_name="us-west-2")
            response = s3.get_object(Bucket=S3_BUCKET, Key=current_s3_key)
            state_json = response["Body"].read().decode("utf-8")
            tmp_path = f"/tmp/prev_model_{module_type}.json"
            with open(tmp_path, "w") as f:
                f.write(state_json)

            prev_module, _, _ = _get_module_and_metric(module_type)
            prev_module.load(tmp_path)

            # Evaluate previous model on validation set
            correct = sum(metric_fn(ex, prev_module(**ex.inputs())) for ex in val_examples)
            previous_accuracy = correct / len(val_examples) if val_examples else 0.0
            logger.info(f"[ChatOptimizer] Previous model accuracy: {previous_accuracy:.3f}")
        except Exception as e:
            logger.warning(f"[ChatOptimizer] Could not load previous model: {e}")

    # Run optimization
    try:
        if optimizer_type == "bootstrap_fewshot":
            optimizer = BootstrapFewShot(
                metric=metric_fn,
                max_bootstrapped_demos=4,
                max_labeled_demos=min(8, len(train_examples)),
            )
        else:
            # Default to BootstrapFewShot for safety (MIPROv2 requires more setup)
            optimizer = BootstrapFewShot(
                metric=metric_fn,
                max_bootstrapped_demos=4,
                max_labeled_demos=min(8, len(train_examples)),
            )

        optimized_module = optimizer.compile(module, trainset=train_examples)

        # Evaluate new model on validation set
        correct = sum(metric_fn(ex, optimized_module(**ex.inputs())) for ex in val_examples)
        new_accuracy = correct / len(val_examples) if val_examples else 0.0
        logger.info(f"[ChatOptimizer] New model accuracy: {new_accuracy:.3f} (prev: {previous_accuracy:.3f})")

        # AUTOMATIC QUALITY GATING: reject if new model is worse
        if new_accuracy < previous_accuracy and previous_accuracy > 0:
            logger.warning(f"[ChatOptimizer] REJECTED: new accuracy {new_accuracy:.3f} < previous {previous_accuracy:.3f}")
            return {
                "success": True,
                "rejected": True,
                "accuracy": new_accuracy,
                "previousAccuracy": previous_accuracy,
                "trainingExamples": len(train_examples),
                "validationAccuracy": new_accuracy,
                "reason": f"New model ({new_accuracy:.3f}) worse than previous ({previous_accuracy:.3f})",
            }

        # Save to S3
        version_num = params.get("nextVersion", 1)
        s3_key = f"{DSPY_MODELS_PREFIX}/chat_{module_type}/v{version_num}.json"

        tmp_save_path = f"/tmp/chat_{module_type}_v{version_num}.json"
        optimized_module.save(tmp_save_path)

        with open(tmp_save_path, "r") as f:
            model_state = f.read()

        s3 = boto3.client("s3", region_name="us-west-2")
        s3.put_object(Bucket=S3_BUCKET, Key=s3_key, Body=model_state)
        logger.info(f"[ChatOptimizer] Saved model to s3://{S3_BUCKET}/{s3_key}")

        return {
            "success": True,
            "rejected": False,
            "optimizedPrompt": model_state,
            "accuracy": new_accuracy,
            "previousAccuracy": previous_accuracy,
            "trainingExamples": len(train_examples),
            "validationAccuracy": new_accuracy,
            "s3Key": s3_key,
        }

    except Exception as e:
        logger.exception(f"[ChatOptimizer] Optimization failed for {module_type}")
        return {
            "success": False,
            "error": str(e),
            "trainingExamples": len(train_examples),
        }

"""
MIPROv2 Optimization for Fee Classification

Runs batch optimization using accumulated corrections.
Called weekly via Convex cron → Lambda.
"""

import json
import logging
import os
import time

import boto3
import dspy
from dspy.teleprompt import MIPROv2

from fee_module import (
    FeeClassifier,
    create_training_examples,
    classification_metric,
    configure_lm,
)

logger = logging.getLogger()
S3_BUCKET = "finanseal-bucket"
DSPY_MODELS_PREFIX = "dspy-models"


def run_optimization(params: dict) -> dict:
    """Run MIPROv2 optimization and save results to S3."""
    platform = params.get("platform", "unknown")
    corrections = params.get("corrections", [])
    current_model_s3_key = params.get("currentModelS3Key")
    optimizer_type = params.get("optimizerType", "miprov2")

    start_time = time.time()

    if len(corrections) < 20:
        return {
            "success": False,
            "errorMessage": f"Insufficient corrections ({len(corrections)}). Need ≥20.",
        }

    # Configure LM
    api_key = os.environ.get("GEMINI_API_KEY", "")
    configure_lm(api_key, temperature=0.3)

    # Prepare training data
    all_examples = create_training_examples(corrections)

    # Split 80/20 train/test
    split_idx = max(1, int(len(all_examples) * 0.8))
    trainset = all_examples[:split_idx]
    testset = all_examples[split_idx:]

    # Evaluate baseline (current model)
    baseline_classifier = FeeClassifier()
    if current_model_s3_key:
        try:
            s3 = boto3.client("s3", region_name="us-west-2")
            response = s3.get_object(Bucket=S3_BUCKET, Key=current_model_s3_key)
            state_json = response["Body"].read().decode("utf-8")
            tmp_path = "/tmp/current_model.json"
            with open(tmp_path, "w") as f:
                f.write(state_json)
            baseline_classifier.load(tmp_path)
        except Exception as e:
            logger.warning(f"Could not load current model: {e}")

    # Evaluate baseline accuracy
    before_accuracy = _evaluate(baseline_classifier, testset)
    logger.info(f"Baseline accuracy: {before_accuracy:.2f} on {len(testset)} test examples")

    # Run MIPROv2 optimization
    try:
        optimizer = MIPROv2(
            metric=classification_metric,
            auto="medium",
        )
        optimized = optimizer.compile(
            FeeClassifier(),
            trainset=trainset,
            requires_permission_to_run=False,
        )

        after_accuracy = _evaluate(optimized, testset)
        logger.info(f"Optimized accuracy: {after_accuracy:.2f}")

        if after_accuracy <= before_accuracy:
            return {
                "success": False,
                "beforeAccuracy": round(before_accuracy, 4),
                "afterAccuracy": round(after_accuracy, 4),
                "trainingExamples": len(trainset),
                "testSetSize": len(testset),
                "errorMessage": "Optimization did not improve accuracy. Keeping current model.",
                "durationMs": int((time.time() - start_time) * 1000),
            }

        # Determine new version number
        version = 1
        if current_model_s3_key:
            # Extract version from key: dspy-models/shopee/v2.json → 2
            try:
                v_str = current_model_s3_key.split("/")[-1].replace(".json", "").replace("v", "")
                version = int(v_str) + 1
            except (ValueError, IndexError):
                version = 1

        # Save optimized model to S3
        new_s3_key = f"{DSPY_MODELS_PREFIX}/{platform}/v{version}.json"
        tmp_save_path = f"/tmp/optimized_v{version}.json"
        optimized.save(tmp_save_path, save_program=False)

        with open(tmp_save_path, "r") as f:
            model_state = f.read()

        s3 = boto3.client("s3", region_name="us-west-2")
        s3.put_object(
            Bucket=S3_BUCKET,
            Key=new_s3_key,
            Body=model_state,
            ContentType="application/json",
        )
        logger.info(f"Saved optimized model to s3://{S3_BUCKET}/{new_s3_key}")

        return {
            "success": True,
            "newModelS3Key": new_s3_key,
            "beforeAccuracy": round(before_accuracy, 4),
            "afterAccuracy": round(after_accuracy, 4),
            "trainingExamples": len(trainset),
            "testSetSize": len(testset),
            "optimizerType": optimizer_type,
            "durationMs": int((time.time() - start_time) * 1000),
        }

    except Exception as e:
        logger.exception("MIPROv2 optimization failed")
        return {
            "success": False,
            "beforeAccuracy": round(before_accuracy, 4),
            "trainingExamples": len(trainset),
            "testSetSize": len(testset),
            "errorMessage": str(e)[:500],
            "durationMs": int((time.time() - start_time) * 1000),
        }


def _evaluate(classifier: FeeClassifier, testset: list) -> float:
    """Evaluate classifier accuracy on a test set."""
    if not testset:
        return 0.0

    correct = 0
    for example in testset:
        try:
            result = classifier(
                fee_name=example.fee_name,
                platform_name=example.platform_name,
            )
            if str(result.account_code).strip() == str(example.account_code).strip():
                correct += 1
        except Exception:
            pass  # Count as incorrect

    return correct / len(testset)

"""
DSPy Vendor Item Matcher — MIPROv2 Optimization Pipeline

Trains optimized models from user corrections using MIPROv2.
Follows the same pattern as optimizer.py (fee classification) and
ar_match_optimizer.py (AR reconciliation).

Feature: 001-dspy-vendor-item-matcher (#320)
"""

import json
import logging
import os
import tempfile
from typing import Optional

import boto3
import dspy

from vendor_item_matcher import (
    VendorItemMatcher,
    create_training_examples,
    matching_metric,
)

logger = logging.getLogger(__name__)

S3_BUCKET = os.environ.get("S3_BUCKET_NAME", "finanseal-bucket")
DSPY_MODEL_PREFIX = "dspy-models/vendor_item_match_"

# Thresholds
MIN_CORRECTIONS_FOR_OPTIMIZATION = 20
MIN_UNIQUE_PAIRS = 10
TRAIN_TEST_SPLIT = 0.8


def run_optimization(params: dict) -> dict:
    """Run MIPROv2 optimization on vendor item matching corrections.

    Args:
        params: {
            "businessId": str,
            "corrections": list[dict],  # Training data from user corrections
            "currentModelS3Key": str | None,  # Current active model for comparison
            "optimizerType": "bootstrap_fewshot" | "miprov2"
        }

    Returns:
        {
            "success": bool,
            "s3Key": str,
            "accuracy": float,
            "trainingExamples": int,
            "previousAccuracy": float | None,
            "modelAccepted": bool
        }
    """
    business_id = params["businessId"]
    corrections = params["corrections"]
    current_s3_key = params.get("currentModelS3Key")
    optimizer_type = params.get("optimizerType", "miprov2")

    logger.info(
        f"[VendorItemOptimizer] Starting {optimizer_type} optimization for "
        f"business {business_id} with {len(corrections)} corrections"
    )

    # Validate minimum thresholds
    if len(corrections) < MIN_CORRECTIONS_FOR_OPTIMIZATION:
        return {
            "success": False,
            "s3Key": "",
            "accuracy": 0.0,
            "trainingExamples": len(corrections),
            "previousAccuracy": None,
            "modelAccepted": False,
            "error": f"Insufficient corrections ({len(corrections)}/{MIN_CORRECTIONS_FOR_OPTIMIZATION})",
        }

    # Check unique pair diversity
    unique_pairs = set()
    for c in corrections:
        pair = tuple(sorted([
            c["itemDescriptionA"].lower().strip(),
            c["itemDescriptionB"].lower().strip(),
        ]))
        unique_pairs.add(pair)

    if len(unique_pairs) < MIN_UNIQUE_PAIRS:
        return {
            "success": False,
            "s3Key": "",
            "accuracy": 0.0,
            "trainingExamples": len(corrections),
            "previousAccuracy": None,
            "modelAccepted": False,
            "error": f"Insufficient diversity ({len(unique_pairs)}/{MIN_UNIQUE_PAIRS} unique pairs)",
        }

    # Create training examples
    examples = create_training_examples(corrections)

    # Train/test split
    split_idx = int(len(examples) * TRAIN_TEST_SPLIT)
    train_set = examples[:split_idx]
    test_set = examples[split_idx:] if split_idx < len(examples) else examples[-3:]

    logger.info(
        f"[VendorItemOptimizer] Train: {len(train_set)}, Test: {len(test_set)}"
    )

    # Create base matcher
    matcher = VendorItemMatcher()

    # Run optimizer
    try:
        if optimizer_type == "miprov2":
            from dspy.teleprompt import MIPROv2
            optimizer = MIPROv2(
                metric=matching_metric,
                num_candidates=5,
                init_temperature=0.7,
            )
            optimized_matcher = optimizer.compile(
                matcher,
                trainset=train_set,
                max_bootstrapped_demos=4,
                max_labeled_demos=min(8, len(train_set)),
            )
        else:
            # BootstrapFewShot fallback
            from dspy.teleprompt import BootstrapFewShot
            optimizer = BootstrapFewShot(
                metric=matching_metric,
                max_bootstrapped_demos=4,
                max_labeled_demos=min(8, len(train_set)),
            )
            optimized_matcher = optimizer.compile(matcher, trainset=train_set)

    except Exception as e:
        logger.error(f"[VendorItemOptimizer] Optimization failed: {e}")
        return {
            "success": False,
            "s3Key": "",
            "accuracy": 0.0,
            "trainingExamples": len(corrections),
            "previousAccuracy": None,
            "modelAccepted": False,
            "error": str(e),
        }

    # Evaluate on test set
    correct = 0
    for example in test_set:
        try:
            pred = optimized_matcher(
                item_a_description=example.item_a_description,
                item_b_description=example.item_b_description,
                item_a_vendor=example.item_a_vendor,
                item_b_vendor=example.item_b_vendor,
            )
            if matching_metric(example, pred) > 0.5:
                correct += 1
        except Exception:
            pass  # Count as incorrect

    new_accuracy = correct / max(len(test_set), 1)
    logger.info(f"[VendorItemOptimizer] New model accuracy: {new_accuracy:.2f}")

    # Compare with current active model accuracy
    previous_accuracy = _get_current_accuracy(current_s3_key)

    # Accuracy gating: only accept if improvement
    if previous_accuracy is not None and new_accuracy <= previous_accuracy:
        logger.info(
            f"[VendorItemOptimizer] New model rejected: {new_accuracy:.2f} <= {previous_accuracy:.2f}"
        )
        return {
            "success": True,
            "s3Key": "",
            "accuracy": new_accuracy,
            "trainingExamples": len(corrections),
            "previousAccuracy": previous_accuracy,
            "modelAccepted": False,
        }

    # Save optimized model to S3
    s3_key = f"{DSPY_MODEL_PREFIX}{business_id}/v{len(corrections)}.json"
    try:
        tmp_path = tempfile.mktemp(suffix=".json")
        optimized_matcher.save(tmp_path)

        with open(tmp_path, "r") as f:
            model_state = f.read()

        s3 = boto3.client("s3", region_name="us-west-2")
        s3.put_object(
            Bucket=S3_BUCKET,
            Key=s3_key,
            Body=model_state,
            ContentType="application/json",
        )
        logger.info(f"[VendorItemOptimizer] Saved model to s3://{S3_BUCKET}/{s3_key}")

    except Exception as e:
        logger.error(f"[VendorItemOptimizer] Failed to save model to S3: {e}")
        return {
            "success": False,
            "s3Key": "",
            "accuracy": new_accuracy,
            "trainingExamples": len(corrections),
            "previousAccuracy": previous_accuracy,
            "modelAccepted": False,
            "error": f"S3 save failed: {e}",
        }

    return {
        "success": True,
        "s3Key": s3_key,
        "accuracy": new_accuracy,
        "trainingExamples": len(corrections),
        "previousAccuracy": previous_accuracy,
        "modelAccepted": True,
    }


def _get_current_accuracy(s3_key: Optional[str]) -> Optional[float]:
    """Load current model from S3 and return its accuracy metadata."""
    if not s3_key:
        return None

    try:
        s3 = boto3.client("s3", region_name="us-west-2")
        response = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
        state_json = response["Body"].read().decode("utf-8")
        state = json.loads(state_json)
        return state.get("_metadata", {}).get("accuracy")
    except Exception:
        return None

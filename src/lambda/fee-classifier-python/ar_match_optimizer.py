"""
AR Match DSPy Optimizer — MIPROv2 optimization for order-to-invoice matching.

Follows the same pattern as optimizer.py (fee classification).
"""

import json
import logging
import os
import time
from ssm_secrets import get_gemini_api_key

import boto3
import dspy
from dspy.teleprompt import MIPROv2

from ar_match_module import (
    OrderInvoiceMatcher,
    create_training_examples,
    matching_metric,
)
from fee_module import configure_lm

logger = logging.getLogger()
S3_BUCKET = "finanseal-bucket"
DSPY_MODELS_PREFIX = "dspy-models"


def run_ar_match_optimization(params: dict) -> dict:
    """
    Run MIPROv2 optimization on the AR matching model.

    Args:
        params: dict with corrections, currentModelS3Key, force, optimizerType

    Returns:
        dict with success, newModelS3Key, beforeAccuracy, afterAccuracy, etc.
    """
    corrections = params.get("corrections", [])
    current_model_s3_key = params.get("currentModelS3Key")
    optimizer_type = params.get("optimizerType", "miprov2")
    force = params.get("force", False)

    start_time = time.time()

    # Safeguard: minimum unique order references
    unique_refs = set()
    for c in corrections:
        ref = c.get("orderReference", "").lower().strip()
        if ref:
            unique_refs.add(ref)

    if len(unique_refs) < 10 and not force:
        return {
            "success": False,
            "errorMessage": f"Insufficient unique order references ({len(unique_refs)}). Need >= 10 unique references.",
        }

    if len(corrections) < 20 and not force:
        return {
            "success": False,
            "errorMessage": f"Insufficient corrections ({len(corrections)}). Need >= 20.",
        }

    # Configure LM
    api_key = get_gemini_api_key()
    configure_lm(api_key, temperature=0.3)

    # Prepare training data
    all_examples = create_training_examples(corrections)

    # Split 80/20 train/test
    split_idx = max(1, int(len(all_examples) * 0.8))
    trainset = all_examples[:split_idx]
    testset = all_examples[split_idx:]

    # Evaluate baseline
    baseline = OrderInvoiceMatcher()
    if current_model_s3_key:
        try:
            s3 = boto3.client("s3", region_name="us-west-2")
            response = s3.get_object(Bucket=S3_BUCKET, Key=current_model_s3_key)
            state_json = response["Body"].read().decode("utf-8")
            tmp_path = "/tmp/ar_match_current_model.json"
            with open(tmp_path, "w") as f:
                f.write(state_json)
            baseline.load(tmp_path)
        except Exception as e:
            logger.warning(f"Could not load current AR match model: {e}")

    before_accuracy = _evaluate_ar_match(baseline, testset)
    logger.info(f"AR match baseline accuracy: {before_accuracy:.2f} on {len(testset)} test examples")

    # Run MIPROv2 optimization
    try:
        optimizer = MIPROv2(
            metric=matching_metric,
            auto="medium",
        )
        optimized = optimizer.compile(
            OrderInvoiceMatcher(),
            trainset=trainset,
            requires_permission_to_run=False,
        )

        after_accuracy = _evaluate_ar_match(optimized, testset)
        logger.info(f"AR match optimized accuracy: {after_accuracy:.2f}")

        # Accuracy gating: must improve
        if after_accuracy <= before_accuracy and not force:
            return {
                "success": False,
                "beforeAccuracy": round(before_accuracy, 4),
                "afterAccuracy": round(after_accuracy, 4),
                "trainingExamples": len(trainset),
                "testSetSize": len(testset),
                "errorMessage": "Optimization did not improve accuracy. Keeping current model.",
                "durationMs": int((time.time() - start_time) * 1000),
            }

        # Determine version number
        version = 1
        if current_model_s3_key:
            try:
                v_str = current_model_s3_key.split("/")[-1].replace(".json", "").replace("v", "")
                version = int(v_str) + 1
            except (ValueError, IndexError):
                version = 1

        # Save to S3
        new_s3_key = f"{DSPY_MODELS_PREFIX}/ar_match/v{version}.json"
        tmp_save_path = f"/tmp/ar_match_optimized_v{version}.json"
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
        logger.info(f"Saved AR match model to s3://{S3_BUCKET}/{new_s3_key}")

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
        logger.exception("AR match MIPROv2 optimization failed")
        return {
            "success": False,
            "beforeAccuracy": round(before_accuracy, 4),
            "trainingExamples": len(trainset),
            "testSetSize": len(testset),
            "errorMessage": str(e)[:500],
            "durationMs": int((time.time() - start_time) * 1000),
        }


def _evaluate_ar_match(matcher, testset: list) -> float:
    """Evaluate AR match accuracy on a test set."""
    if not testset:
        return 0.0

    correct = 0
    for example in testset:
        try:
            result = matcher(
                order_reference=example.order_reference,
                customer_name=example.customer_name,
                order_amount=float(example.order_amount),
                order_date=example.order_date,
                candidate_invoices_json=example.candidate_invoices_json,
                max_split_invoices=int(example.max_split_invoices),
                amount_tolerance_percent=float(example.amount_tolerance_percent),
                amount_tolerance_absolute=float(example.amount_tolerance_absolute),
            )
            if matching_metric(example, result) > 0.5:
                correct += 1
        except Exception:
            pass

    return correct / len(testset)

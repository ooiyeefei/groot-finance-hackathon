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


def run_bank_recon_optimization(params: dict) -> dict:
    """Run MIPROv2 optimization for bank recon classification and save results to S3."""
    from bank_recon_module import (
        BankTransactionClassifier,
        create_bank_recon_training_examples,
        bank_recon_classification_metric,
    )

    corrections = params.get("corrections", [])
    current_model_s3_key = params.get("currentModelS3Key")
    optimizer_type = params.get("optimizerType", "miprov2")
    force = params.get("force", False)

    start_time = time.time()

    # Safeguard: minimum 10 unique descriptions
    unique_descriptions = set()
    for c in corrections:
        desc = c.get("description", "").lower().strip()
        if desc:
            unique_descriptions.add(desc)

    if len(unique_descriptions) < 10 and not force:
        return {
            "success": False,
            "errorMessage": f"Insufficient unique descriptions ({len(unique_descriptions)}). Need >= 10 unique descriptions.",
        }

    if len(corrections) < 20 and not force:
        return {
            "success": False,
            "errorMessage": f"Insufficient corrections ({len(corrections)}). Need >= 20.",
        }

    # Configure LM
    api_key = os.environ.get("GEMINI_API_KEY", "")
    configure_lm(api_key, temperature=0.3)

    # Prepare training data
    all_examples = create_bank_recon_training_examples(corrections)

    # Split 80/20 train/test
    split_idx = max(1, int(len(all_examples) * 0.8))
    trainset = all_examples[:split_idx]
    testset = all_examples[split_idx:]

    # Evaluate baseline
    baseline_classifier = BankTransactionClassifier()
    if current_model_s3_key:
        try:
            s3 = boto3.client("s3", region_name="us-west-2")
            response = s3.get_object(Bucket=S3_BUCKET, Key=current_model_s3_key)
            state_json = response["Body"].read().decode("utf-8")
            tmp_path = "/tmp/bank_recon_current_model.json"
            with open(tmp_path, "w") as f:
                f.write(state_json)
            baseline_classifier.load(tmp_path)
        except Exception as e:
            logger.warning(f"Could not load current bank recon model: {e}")

    before_accuracy = _evaluate_bank_recon(baseline_classifier, testset, bank_recon_classification_metric)
    logger.info(f"Bank recon baseline accuracy: {before_accuracy:.2f} on {len(testset)} test examples")

    # Run MIPROv2 optimization
    try:
        optimizer = MIPROv2(
            metric=bank_recon_classification_metric,
            auto="medium",
        )
        optimized = optimizer.compile(
            BankTransactionClassifier(),
            trainset=trainset,
            requires_permission_to_run=False,
        )

        after_accuracy = _evaluate_bank_recon(optimized, testset, bank_recon_classification_metric)
        logger.info(f"Bank recon optimized accuracy: {after_accuracy:.2f}")

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
        new_s3_key = f"{DSPY_MODELS_PREFIX}/bank_recon/v{version}.json"
        tmp_save_path = f"/tmp/bank_recon_optimized_v{version}.json"
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
        logger.info(f"Saved bank recon model to s3://{S3_BUCKET}/{new_s3_key}")

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
        logger.exception("Bank recon MIPROv2 optimization failed")
        return {
            "success": False,
            "beforeAccuracy": round(before_accuracy, 4),
            "trainingExamples": len(trainset),
            "testSetSize": len(testset),
            "errorMessage": str(e)[:500],
            "durationMs": int((time.time() - start_time) * 1000),
        }


def _evaluate_bank_recon(classifier, testset: list, metric_fn) -> float:
    """Evaluate bank recon classifier accuracy on a test set."""
    if not testset:
        return 0.0

    correct = 0
    for example in testset:
        try:
            result = classifier(
                description=example.description,
                amount=float(example.amount),
                direction=example.direction,
                bank_name=example.bank_name,
                available_accounts=example.available_accounts,
                bank_gl_account_code=example.bank_gl_account_code,
            )
            if metric_fn(example, result) > 0.5:
                correct += 1
        except Exception:
            pass

    return correct / len(testset)


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

"""
Offline DSPy optimization pipeline.

Runs MIPROv2 on troubleshooter + BootstrapFewShot on recon.
Serializes optimized modules to S3.
"""

import json
import os
import time

S3_BUCKET = os.environ.get("S3_BUCKET_NAME", "finanseal-bucket")
S3_PREFIX = "dspy-modules"
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
MIN_TRAINING_EXAMPLES = 10
MIN_RECON_EXAMPLES = 5


def _upload_module_to_s3(module_name: str, state_dict: dict, score: float):
    """Upload optimized module state to S3."""
    import boto3
    s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-west-2"))

    version = time.strftime("%Y-%m-%dT%H:%M:%S")
    payload = {
        "version": version,
        "optimized_at": version,
        "baseline_score": score,
        "dspy_state": state_dict,
    }
    body = json.dumps(payload, indent=2)

    # Upload as timestamped version
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=f"{S3_PREFIX}/{module_name}/{version}.json",
        Body=body,
        ContentType="application/json",
    )

    # Upload as latest.json (overwrite)
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=f"{S3_PREFIX}/{module_name}/latest.json",
        Body=body,
        ContentType="application/json",
    )

    print(f"[Optimizer] Uploaded {module_name} module to S3 (version={version}, score={score:.2f})")


def optimize_troubleshooter(training_data: list) -> dict:
    """Run MIPROv2 optimization on the troubleshooter module.

    Returns: {"optimized": bool, "score": float, "baseline_score": float}
    """
    if len(training_data) < MIN_TRAINING_EXAMPLES:
        print(f"[Optimizer] Insufficient training data ({len(training_data)}/{MIN_TRAINING_EXAMPLES}), skipping troubleshooter optimization")
        return {"optimized": False, "reason": "insufficient_data", "count": len(training_data)}

    import dspy
    from dspy_modules.troubleshooter import OptimizedTroubleshooter, hint_effectiveness_metric

    # Configure DSPy
    lm = dspy.LM("gemini/gemini-3.1-flash-lite-preview", api_key=GEMINI_KEY, max_tokens=2048, temperature=0.1)
    dspy.settings.configure(lm=lm, adapter=dspy.JSONAdapter())

    # Build training examples
    trainset = []
    for item in training_data:
        example = dspy.Example(
            error_message=item["error_message"],
            merchant_name=item["merchant_name"],
            screenshot_description=item.get("screenshot_description", ""),
            previous_hints=item.get("previous_hints", ""),
            tier_reached=item.get("tier_reached", "tier2"),
            next_attempt_succeeded=item["next_attempt_succeeded"],
        ).with_inputs("error_message", "merchant_name", "screenshot_description", "previous_hints", "tier_reached")
        trainset.append(example)

    # Baseline evaluation
    baseline = OptimizedTroubleshooter()
    evaluate = dspy.Evaluate(devset=trainset, metric=hint_effectiveness_metric, num_threads=2)
    baseline_score = evaluate(baseline)
    print(f"[Optimizer] Troubleshooter baseline score: {baseline_score:.2f}")

    # MIPROv2 optimization
    optimizer = dspy.MIPROv2(metric=hint_effectiveness_metric, auto="light")
    optimized = optimizer.compile(baseline, trainset=trainset)
    optimized_score = evaluate(optimized)
    print(f"[Optimizer] Troubleshooter optimized score: {optimized_score:.2f}")

    if optimized_score > baseline_score:
        # Save optimized module
        import tempfile
        tmp_path = tempfile.mktemp(suffix=".json")
        optimized.save(tmp_path)
        with open(tmp_path, "r") as f:
            state_dict = json.load(f)
        os.unlink(tmp_path)

        _upload_module_to_s3("troubleshooter", state_dict, optimized_score)
        return {"optimized": True, "score": optimized_score, "baseline_score": baseline_score}
    else:
        print(f"[Optimizer] Optimized score ({optimized_score:.2f}) not better than baseline ({baseline_score:.2f}), retaining baseline")
        return {"optimized": False, "score": optimized_score, "baseline_score": baseline_score, "reason": "no_improvement"}


def optimize_recon(training_data: list) -> dict:
    """Run BootstrapFewShot optimization on the recon module."""
    if len(training_data) < MIN_RECON_EXAMPLES:
        print(f"[Optimizer] Insufficient recon data ({len(training_data)}/{MIN_RECON_EXAMPLES}), skipping")
        return {"optimized": False, "reason": "insufficient_data", "count": len(training_data)}

    import dspy
    from dspy_modules.recon import ReconModule, recon_success_metric

    lm = dspy.LM("gemini/gemini-3.1-flash-lite-preview", api_key=GEMINI_KEY, max_tokens=2048, temperature=0.1)
    dspy.settings.configure(lm=lm, adapter=dspy.JSONAdapter())

    trainset = []
    for item in training_data:
        example = dspy.Example(
            recon_description=item["recon_description"],
            merchant_name=item["merchant_name"],
            buyer_details=item.get("buyer_details", "{}"),
            previous_cua_hints=item.get("previous_cua_hints", ""),
            succeeded=item["succeeded"],
            cua_turns=item.get("cua_turns", 50),
        ).with_inputs("recon_description", "merchant_name", "buyer_details", "previous_cua_hints")
        trainset.append(example)

    baseline = ReconModule()
    evaluate = dspy.Evaluate(devset=trainset, metric=recon_success_metric, num_threads=2)
    baseline_score = evaluate(baseline)

    optimizer = dspy.BootstrapFewShot(metric=recon_success_metric, max_bootstrapped_demos=4)
    optimized = optimizer.compile(baseline, trainset=trainset)
    optimized_score = evaluate(optimized)

    print(f"[Optimizer] Recon: baseline={baseline_score:.2f}, optimized={optimized_score:.2f}")

    if optimized_score > baseline_score:
        import tempfile
        tmp_path = tempfile.mktemp(suffix=".json")
        optimized.save(tmp_path)
        with open(tmp_path, "r") as f:
            state_dict = json.load(f)
        os.unlink(tmp_path)

        _upload_module_to_s3("recon", state_dict, optimized_score)
        return {"optimized": True, "score": optimized_score, "baseline_score": baseline_score}
    else:
        return {"optimized": False, "score": optimized_score, "baseline_score": baseline_score, "reason": "no_improvement"}

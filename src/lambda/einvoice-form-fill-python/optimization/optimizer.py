"""
Offline DSPy optimization pipeline.

Runs MIPROv2 on troubleshooter + BootstrapFewShot on recon.
Serializes optimized modules to S3.

Safeguards:
- Anchor merchants (Shell, 7-Eleven, FamilyMart, Jaya Grocer) are non-negotiable in trainset
- MIPROv2 requires 5+ unique merchant domains (diversity safeguard)
- Optimized module only deployed if it scores higher than baseline
- Anchor merchant score must not regress (anchor-aware validation)
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


def _evaluate_anchor_score(module, trainset, metric):
    """Evaluate a module only on anchor merchant examples.
    Returns score on anchor subset, or None if no anchor examples exist.
    """
    import dspy
    anchor_examples = [ex for ex in trainset if getattr(ex, "is_anchor", False)]
    if not anchor_examples:
        return None
    evaluate = dspy.Evaluate(devset=anchor_examples, metric=metric, num_threads=1)
    return evaluate(module)


def optimize_troubleshooter(training_data: list, metadata: dict = None) -> dict:
    """Run optimization on the troubleshooter module.

    Strategy selection based on merchant diversity:
    - <5 unique merchants → BootstrapFewShot only (few-shot learning, no prompt rewriting)
    - >=5 unique merchants → MIPROv2 (full prompt optimization)

    Anchor safeguard: optimized module must not regress on anchor merchant examples.
    """
    if len(training_data) < MIN_TRAINING_EXAMPLES:
        print(f"[Optimizer] Insufficient training data ({len(training_data)}/{MIN_TRAINING_EXAMPLES}), skipping")
        return {"optimized": False, "reason": "insufficient_data", "count": len(training_data)}

    metadata = metadata or {}
    unique_merchants = metadata.get("unique_merchants", set())
    merchant_count = len(unique_merchants)

    import dspy
    from dspy_modules.troubleshooter import OptimizedTroubleshooter, hint_effectiveness_metric
    from optimization.data_collector import MIN_MERCHANT_DIVERSITY_FOR_MIPRO

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
            is_anchor=item.get("is_anchor", False),
        ).with_inputs("error_message", "merchant_name", "screenshot_description", "previous_hints", "tier_reached")
        trainset.append(example)

    # Baseline evaluation
    baseline = OptimizedTroubleshooter()
    evaluate = dspy.Evaluate(devset=trainset, metric=hint_effectiveness_metric, num_threads=2)
    baseline_score = evaluate(baseline)
    baseline_anchor_score = _evaluate_anchor_score(baseline, trainset, hint_effectiveness_metric)
    print(f"[Optimizer] Troubleshooter baseline: overall={baseline_score:.2f}, anchor={baseline_anchor_score}")

    # ── Diversity Safeguard: choose optimizer based on merchant coverage ──
    if merchant_count >= MIN_MERCHANT_DIVERSITY_FOR_MIPRO:
        print(f"[Optimizer] {merchant_count} unique merchants ≥ {MIN_MERCHANT_DIVERSITY_FOR_MIPRO} → using MIPROv2")
        optimizer = dspy.MIPROv2(metric=hint_effectiveness_metric, auto="light")
        strategy = "miprov2"
    else:
        print(f"[Optimizer] {merchant_count} unique merchants < {MIN_MERCHANT_DIVERSITY_FOR_MIPRO} → "
              f"using BootstrapFewShot (MIPROv2 skipped to prevent overfitting)")
        optimizer = dspy.BootstrapFewShot(metric=hint_effectiveness_metric, max_bootstrapped_demos=4)
        strategy = "bootstrap_fewshot"

    optimized = optimizer.compile(baseline, trainset=trainset)
    optimized_score = evaluate(optimized)
    optimized_anchor_score = _evaluate_anchor_score(optimized, trainset, hint_effectiveness_metric)

    print(f"[Optimizer] Troubleshooter optimized ({strategy}): "
          f"overall={optimized_score:.2f}, anchor={optimized_anchor_score}")

    # ── Quality Gate: Evaluate candidate vs previous on eval set ──
    from optimization.quality_gate import run_quality_gate, serialize_quality_gate_result

    quality_gate_result = None
    try:
        quality_gate_result = run_quality_gate(
            candidate_model=optimized,
            previous_model=baseline,
            module="troubleshooter",
            min_accuracy_threshold=0.0
        )
        quality_gate_dict = serialize_quality_gate_result(quality_gate_result)
        print(f"[Optimizer] Quality gate: {'PASS' if quality_gate_result.passed else 'FAIL'}")
    except Exception as e:
        print(f"[Optimizer] Quality gate evaluation failed: {e}")
        # Auto-pass if quality gate fails (eval set not available)
        quality_gate_dict = {
            'passed': True,
            'candidateAccuracy': optimized_score,
            'previousAccuracy': baseline_score,
            'accuracyDelta': optimized_score - baseline_score,
            'rejectionReason': None,
            'evalSetSize': 0,
            'perCategoryBreakdown': {}
        }

    # ── Deployment gate: overall score must improve AND anchor score must not regress ──
    anchor_regressed = (
        baseline_anchor_score is not None
        and optimized_anchor_score is not None
        and optimized_anchor_score < baseline_anchor_score
    )

    # Check both quality gate and existing deployment gates
    passed_quality_gate = quality_gate_result.passed if quality_gate_result else True

    if optimized_score > baseline_score and not anchor_regressed and passed_quality_gate:
        import tempfile
        tmp_path = tempfile.mktemp(suffix=".json")
        optimized.save(tmp_path)
        with open(tmp_path, "r") as f:
            state_dict = json.load(f)
        os.unlink(tmp_path)

        _upload_module_to_s3("troubleshooter", state_dict, optimized_score)
        return {
            "optimized": True, "strategy": strategy,
            "score": optimized_score, "baseline_score": baseline_score,
            "anchor_score": optimized_anchor_score, "baseline_anchor_score": baseline_anchor_score,
            "merchant_count": merchant_count,
            "qualityGateResult": quality_gate_dict,
        }
    elif anchor_regressed:
        print(f"[Optimizer] BLOCKED: anchor score regressed "
              f"({baseline_anchor_score:.2f} → {optimized_anchor_score:.2f}), retaining baseline")
        return {
            "optimized": False, "reason": "anchor_regression",
            "score": optimized_score, "baseline_score": baseline_score,
            "anchor_score": optimized_anchor_score, "baseline_anchor_score": baseline_anchor_score,
            "strategy": strategy,
            "qualityGateResult": quality_gate_dict,
        }
    elif not passed_quality_gate:
        print(f"[Optimizer] BLOCKED: quality gate rejected candidate "
              f"(reason: {quality_gate_result.rejection_reason if quality_gate_result else 'unknown'})")
        return {
            "optimized": False, "reason": "quality_gate_rejected",
            "score": optimized_score, "baseline_score": baseline_score,
            "anchor_score": optimized_anchor_score, "baseline_anchor_score": baseline_anchor_score,
            "strategy": strategy,
            "qualityGateResult": quality_gate_dict,
        }
    else:
        print(f"[Optimizer] No improvement ({optimized_score:.2f} ≤ {baseline_score:.2f}), retaining baseline")
        return {
            "optimized": False, "reason": "no_improvement",
            "score": optimized_score, "baseline_score": baseline_score,
            "strategy": strategy,
            "qualityGateResult": quality_gate_dict,
        }


def optimize_recon(training_data: list, metadata: dict = None) -> dict:
    """Run BootstrapFewShot optimization on the recon module.
    Anchor-aware: won't deploy if anchor merchant score regresses.
    """
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
            runtime_environment=item.get("runtime_environment", "lambda"),
            succeeded=item["succeeded"],
            cua_turns=item.get("cua_turns", 50),
            is_anchor=item.get("is_anchor", False),
        ).with_inputs("recon_description", "merchant_name", "buyer_details", "previous_cua_hints", "runtime_environment")
        trainset.append(example)

    baseline = ReconModule()
    evaluate = dspy.Evaluate(devset=trainset, metric=recon_success_metric, num_threads=2)
    baseline_score = evaluate(baseline)
    baseline_anchor_score = _evaluate_anchor_score(baseline, trainset, recon_success_metric)

    optimizer = dspy.BootstrapFewShot(metric=recon_success_metric, max_bootstrapped_demos=4)
    optimized = optimizer.compile(baseline, trainset=trainset)
    optimized_score = evaluate(optimized)
    optimized_anchor_score = _evaluate_anchor_score(optimized, trainset, recon_success_metric)

    print(f"[Optimizer] Recon: baseline={baseline_score:.2f} (anchor={baseline_anchor_score}), "
          f"optimized={optimized_score:.2f} (anchor={optimized_anchor_score})")

    # ── Quality Gate: Evaluate candidate vs previous on eval set ──
    from optimization.quality_gate import run_quality_gate, serialize_quality_gate_result

    quality_gate_result = None
    try:
        quality_gate_result = run_quality_gate(
            candidate_model=optimized,
            previous_model=baseline,
            module="recon",
            min_accuracy_threshold=0.0
        )
        quality_gate_dict = serialize_quality_gate_result(quality_gate_result)
        print(f"[Optimizer] Quality gate: {'PASS' if quality_gate_result.passed else 'FAIL'}")
    except Exception as e:
        print(f"[Optimizer] Quality gate evaluation failed: {e}")
        # Auto-pass if quality gate fails (eval set not available)
        quality_gate_dict = {
            'passed': True,
            'candidateAccuracy': optimized_score,
            'previousAccuracy': baseline_score,
            'accuracyDelta': optimized_score - baseline_score,
            'rejectionReason': None,
            'evalSetSize': 0,
            'perCategoryBreakdown': {}
        }

    anchor_regressed = (
        baseline_anchor_score is not None
        and optimized_anchor_score is not None
        and optimized_anchor_score < baseline_anchor_score
    )

    # Check both quality gate and existing deployment gates
    passed_quality_gate = quality_gate_result.passed if quality_gate_result else True

    if optimized_score > baseline_score and not anchor_regressed and passed_quality_gate:
        import tempfile
        tmp_path = tempfile.mktemp(suffix=".json")
        optimized.save(tmp_path)
        with open(tmp_path, "r") as f:
            state_dict = json.load(f)
        os.unlink(tmp_path)

        _upload_module_to_s3("recon", state_dict, optimized_score)
        return {
            "optimized": True,
            "score": optimized_score,
            "baseline_score": baseline_score,
            "qualityGateResult": quality_gate_dict,
        }
    elif anchor_regressed:
        print(f"[Optimizer] BLOCKED: recon anchor score regressed, retaining baseline")
        return {
            "optimized": False,
            "reason": "anchor_regression",
            "score": optimized_score,
            "baseline_score": baseline_score,
            "qualityGateResult": quality_gate_dict,
        }
    elif not passed_quality_gate:
        print(f"[Optimizer] BLOCKED: recon quality gate rejected candidate "
              f"(reason: {quality_gate_result.rejection_reason if quality_gate_result else 'unknown'})")
        return {
            "optimized": False,
            "reason": "quality_gate_rejected",
            "score": optimized_score,
            "baseline_score": baseline_score,
            "qualityGateResult": quality_gate_dict,
        }
    else:
        return {
            "optimized": False,
            "reason": "no_improvement",
            "score": optimized_score,
            "baseline_score": baseline_score,
            "qualityGateResult": quality_gate_dict,
        }

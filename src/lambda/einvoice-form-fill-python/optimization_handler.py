"""
Optimizer Lambda handler — triggered by EventBridge every 3 days.

Runs MIPROv2 optimization on troubleshooter + BootstrapFewShot on recon.
Evaluates optimized vs baseline and uploads to S3 if improved.
"""

import json
import os
import time


def handler(event: dict, context=None) -> dict:
    """EventBridge-triggered optimization pipeline."""
    start = time.time()
    print(f"[Optimizer] Starting optimization pipeline (trigger: {event.get('source', 'manual')})")

    # Lazy imports to avoid cold start penalty on form fill Lambda
    os.environ["DSPY_CACHEDIR"] = "/tmp/dspy_cache"

    results = {
        "troubleshooter": {"optimized": False, "reason": "not_run"},
        "recon": {"optimized": False, "reason": "not_run"},
        "evaluation": {},
    }

    try:
        from optimization.data_collector import (
            collect_hint_effectiveness_pairs,
            collect_recon_success_pairs,
        )
        from optimization.optimizer import optimize_troubleshooter, optimize_recon
        from optimization.evaluator import run_evaluation

        # Step 1: Collect training data
        hint_pairs = collect_hint_effectiveness_pairs()
        recon_pairs = collect_recon_success_pairs()

        # Step 2: Run optimizations
        if hint_pairs:
            results["troubleshooter"] = optimize_troubleshooter(hint_pairs)
        else:
            results["troubleshooter"] = {"optimized": False, "reason": "no_training_data"}
            print("[Optimizer] No hint-effectiveness pairs yet — troubleshooter optimization skipped")

        if recon_pairs:
            results["recon"] = optimize_recon(recon_pairs)
        else:
            results["recon"] = {"optimized": False, "reason": "no_training_data"}
            print("[Optimizer] No recon-success pairs yet — recon optimization skipped")

        # Step 3: Run evaluation
        results["evaluation"] = run_evaluation(min_attempts=3)

    except Exception as e:
        print(f"[Optimizer] Pipeline error: {e}")
        import traceback
        traceback.print_exc()
        results["error"] = str(e)

    dur = int((time.time() - start) * 1000)
    results["durationMs"] = dur
    print(f"[Optimizer] Pipeline complete in {dur}ms: {json.dumps(results, default=str)[:500]}")

    return results

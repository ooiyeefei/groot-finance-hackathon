"""
Optimizer Lambda handler — triggered by EventBridge every 3 days.

Runs MIPROv2 optimization on troubleshooter + BootstrapFewShot on recon.
Evaluates optimized vs baseline and uploads to S3 if improved.

Refinements:
- Incremental data collection (only new corrections since last optimization)
- Anchor merchant protection (Shell, 7-Eleven, FamilyMart, Jaya Grocer)
- Diversity-gated MIPROv2 (requires 5+ merchant domains)
- Failure category analysis in evaluation
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
            save_optimization_timestamp,
            _get_last_optimized_timestamp,
        )
        from optimization.optimizer import optimize_troubleshooter, optimize_recon
        from optimization.evaluator import run_evaluation
        from optimization.quality_gate import run_quality_gate, serialize_quality_gate_result

        # ── Step 0: Get last optimization checkpoint (Refinement 5) ──
        last_ts = _get_last_optimized_timestamp()
        current_ts = time.time() * 1000  # ms for Convex compatibility
        print(f"[Optimizer] Last optimization timestamp: {last_ts} "
              f"({'never' if last_ts == 0 else time.strftime('%Y-%m-%d', time.gmtime(last_ts / 1000))})")

        # ── Step 1: Collect training data (incremental + anchor-prioritized) ──
        hint_pairs, hint_metadata = collect_hint_effectiveness_pairs(since_timestamp=last_ts)
        recon_pairs, recon_metadata = collect_recon_success_pairs(since_timestamp=last_ts)

        # Check if there's actually new data to optimize on
        new_hint_count = hint_metadata.get("new_count", 0)
        new_recon_count = recon_metadata.get("new_count", 0)
        if new_hint_count == 0 and new_recon_count == 0 and last_ts > 0:
            print(f"[Optimizer] No new corrections since last optimization — skipping redundant run")
            results["troubleshooter"] = {"optimized": False, "reason": "no_new_data"}
            results["recon"] = {"optimized": False, "reason": "no_new_data"}
            # Still run evaluation for latest metrics
            results["evaluation"] = run_evaluation(min_attempts=3)
            dur = int((time.time() - start) * 1000)
            results["durationMs"] = dur
            return results

        # ── Step 2: Run optimizations (with metadata for diversity gating) ──
        if hint_pairs:
            results["troubleshooter"] = optimize_troubleshooter(hint_pairs, metadata=hint_metadata)
        else:
            results["troubleshooter"] = {"optimized": False, "reason": "no_training_data"}
            print("[Optimizer] No hint-effectiveness pairs yet — troubleshooter optimization skipped")

        if recon_pairs:
            results["recon"] = optimize_recon(recon_pairs, metadata=recon_metadata)
        else:
            results["recon"] = {"optimized": False, "reason": "no_training_data"}
            print("[Optimizer] No recon-success pairs yet — recon optimization skipped")

        # ── Step 3: Run evaluation (now includes failure category analysis) ──
        results["evaluation"] = run_evaluation(min_attempts=3)

        # ── Step 4: Save optimization timestamp (Refinement 5) ──
        # Only update if optimization actually ran (not skipped)
        if hint_pairs or recon_pairs:
            save_optimization_timestamp(current_ts)
            print(f"[Optimizer] Updated optimization checkpoint to {current_ts}")

    except Exception as e:
        print(f"[Optimizer] Pipeline error: {e}")
        import traceback
        traceback.print_exc()
        results["error"] = str(e)

    dur = int((time.time() - start) * 1000)
    results["durationMs"] = dur
    print(f"[Optimizer] Pipeline complete in {dur}ms: {json.dumps(results, default=str)[:500]}")

    return results

"""
DSPy Evaluate framework for per-merchant performance measurement.
"""

import json
import os
from typing import Optional
from urllib.request import Request, urlopen


CONVEX_URL = os.environ.get("NEXT_PUBLIC_CONVEX_URL", "https://kindhearted-lynx-129.convex.cloud")


def _convex_query(function_path: str, args: dict = None):
    """Query Convex."""
    payload = {"path": function_path, "args": args or {}, "format": "json"}
    req = Request(
        f"{CONVEX_URL}/api/query",
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())
        if result.get("status") == "success":
            return result.get("value")
        raise RuntimeError(f"Convex query failed: {result}")


def run_evaluation(business_id: Optional[str] = None, min_attempts: int = 1) -> dict:
    """Run per-merchant evaluation and return scorecard.

    Returns:
    {
        "merchants": [...per-merchant scorecards...],
        "overall": {
            "totalMerchants": int,
            "avgSuccessRate": float,
            "avgCostUsd": float,
            "avgHintEffectiveness": float | None,
        },
        "flags": [...merchants needing attention...]
    }
    """
    args = {"minAttempts": min_attempts}
    if business_id:
        args["businessId"] = business_id

    merchants = _convex_query("functions/system:getEinvoiceMetricsByMerchant", args) or []

    # Overall statistics
    if merchants:
        avg_success = sum(m["successRate"] for m in merchants) / len(merchants)
        costs = [m["avgCostUsd"] for m in merchants if m["avgCostUsd"] > 0]
        avg_cost = sum(costs) / len(costs) if costs else 0
        hint_rates = [m["hintEffectivenessRate"] for m in merchants if m["hintEffectivenessRate"] is not None]
        avg_hint = sum(hint_rates) / len(hint_rates) if hint_rates else None
    else:
        avg_success = 0
        avg_cost = 0
        avg_hint = None

    # Flag merchants needing attention
    flags = []
    for m in merchants:
        if m["successRate"] < 50 and m["completedAttempts"] >= 3:
            flags.append({
                "merchantName": m["merchantName"],
                "reason": f"Low success rate ({m['successRate']}%)",
                "failureBreakdown": m.get("failureCategoryBreakdown", {}),
                "recommendation": "Review failure categories and cuaHints",
            })

    result = {
        "merchants": merchants,
        "overall": {
            "totalMerchants": len(merchants),
            "avgSuccessRate": round(avg_success, 1),
            "avgCostUsd": round(avg_cost, 4),
            "avgHintEffectiveness": round(avg_hint, 1) if avg_hint is not None else None,
        },
        "flags": flags,
    }

    print(f"[Evaluator] {len(merchants)} merchants, avg success={avg_success:.1f}%, "
          f"avg cost=${avg_cost:.4f}, {len(flags)} flagged")

    return result

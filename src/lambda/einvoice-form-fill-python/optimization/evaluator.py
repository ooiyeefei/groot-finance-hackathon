"""
DSPy Evaluate framework for per-merchant performance measurement.

Includes failure category analysis to distinguish between:
- Prompt-fixable failures (form_validation, session) → improve DSPy prompts
- Infrastructure failures (connectivity, captcha) → switch to Browserbase
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


def _analyze_failure_categories(merchants: list) -> dict:
    """Aggregate failure categories across all merchants and produce actionable analysis.

    Groups failures into two buckets:
    - prompt_fixable: failures that better DSPy prompts could solve (form_validation, session, unknown)
    - infra_fixable: failures that need infrastructure changes (connectivity → Browserbase, captcha → CapSolver)

    Returns:
    {
        "byCategory": { "connectivity": {"count": N, "rate": %, "merchants": [...]}, ... },
        "promptFixable": {"count": N, "rate": %, "categories": [...]},
        "infraFixable": {"count": N, "rate": %, "categories": [...]},
        "recommendations": [...]
    }
    """
    PROMPT_FIXABLE = {"form_validation", "session", "unknown"}
    INFRA_FIXABLE = {"connectivity", "captcha"}

    # Aggregate failure categories across all merchants
    category_totals: dict[str, dict] = {}
    total_failures = 0

    for m in merchants:
        breakdown = m.get("failureCategoryBreakdown", {})
        for cat, count in breakdown.items():
            if cat not in category_totals:
                category_totals[cat] = {"count": 0, "merchants": []}
            category_totals[cat]["count"] += count
            category_totals[cat]["merchants"].append(m["merchantName"])
            total_failures += count

    # Build per-category stats
    by_category = {}
    for cat, data in category_totals.items():
        by_category[cat] = {
            "count": data["count"],
            "rate": round(data["count"] / total_failures * 100, 1) if total_failures > 0 else 0,
            "merchants": list(set(data["merchants"])),
        }

    # Aggregate into prompt-fixable vs infra-fixable
    prompt_count = sum(d["count"] for c, d in category_totals.items() if c in PROMPT_FIXABLE)
    infra_count = sum(d["count"] for c, d in category_totals.items() if c in INFRA_FIXABLE)

    prompt_fixable = {
        "count": prompt_count,
        "rate": round(prompt_count / total_failures * 100, 1) if total_failures > 0 else 0,
        "categories": [c for c in category_totals if c in PROMPT_FIXABLE],
    }
    infra_fixable = {
        "count": infra_count,
        "rate": round(infra_count / total_failures * 100, 1) if total_failures > 0 else 0,
        "categories": [c for c in category_totals if c in INFRA_FIXABLE],
    }

    # Generate recommendations
    recommendations = []
    if prompt_fixable["rate"] > 50:
        recommendations.append(
            f"Prompt-fixable failures dominate ({prompt_fixable['rate']}%). "
            f"Focus on DSPy optimization — MIPROv2 and better cuaHints should reduce these."
        )
    if infra_fixable["rate"] > 30:
        connectivity_merchants = by_category.get("connectivity", {}).get("merchants", [])
        captcha_merchants = by_category.get("captcha", {}).get("merchants", [])
        if connectivity_merchants:
            recommendations.append(
                f"Connectivity failures ({by_category.get('connectivity', {}).get('rate', 0)}%) — "
                f"merchants [{', '.join(connectivity_merchants[:5])}] likely need Browserbase."
            )
        if captcha_merchants:
            recommendations.append(
                f"Captcha failures ({by_category.get('captcha', {}).get('rate', 0)}%) — "
                f"merchants [{', '.join(captcha_merchants[:5])}] may need manual-only flag or better CapSolver config."
            )
    if not recommendations:
        recommendations.append("Failure distribution is balanced. Continue DSPy optimization cycle.")

    return {
        "byCategory": by_category,
        "promptFixable": prompt_fixable,
        "infraFixable": infra_fixable,
        "totalFailures": total_failures,
        "recommendations": recommendations,
    }


def run_evaluation(business_id: Optional[str] = None, min_attempts: int = 1) -> dict:
    """Run per-merchant evaluation and return scorecard with failure category analysis.

    Returns:
    {
        "merchants": [...per-merchant scorecards...],
        "overall": { totalMerchants, avgSuccessRate, avgCostUsd, avgHintEffectiveness },
        "failureAnalysis": { byCategory, promptFixable, infraFixable, recommendations },
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

    # Failure category analysis (Refinement 4)
    failure_analysis = _analyze_failure_categories(merchants)

    # Flag merchants needing attention — now includes category-aware recommendations
    flags = []
    for m in merchants:
        if m["successRate"] < 50 and m["completedAttempts"] >= 3:
            breakdown = m.get("failureCategoryBreakdown", {})
            top_failure = max(breakdown, key=breakdown.get, default="unknown") if breakdown else "unknown"

            # Category-specific recommendation
            if top_failure in ("connectivity",):
                rec = "Switch to Browserbase — site likely blocks Lambda IP"
            elif top_failure in ("captcha",):
                rec = "Mark as manual_only or improve CapSolver integration"
            elif top_failure in ("form_validation",):
                rec = "Review cuaHints and DSPy troubleshooter output — prompt improvement likely"
            elif top_failure in ("session",):
                rec = "Check if merchant requires login/OTP — may need account-based flow"
            else:
                rec = "Review failure logs and cuaHints for patterns"

            flags.append({
                "merchantName": m["merchantName"],
                "reason": f"Low success rate ({m['successRate']}%)",
                "topFailureCategory": top_failure,
                "failureBreakdown": breakdown,
                "recommendation": rec,
            })

    result = {
        "merchants": merchants,
        "overall": {
            "totalMerchants": len(merchants),
            "avgSuccessRate": round(avg_success, 1),
            "avgCostUsd": round(avg_cost, 4),
            "avgHintEffectiveness": round(avg_hint, 1) if avg_hint is not None else None,
        },
        "failureAnalysis": failure_analysis,
        "flags": flags,
    }

    print(f"[Evaluator] {len(merchants)} merchants, avg success={avg_success:.1f}%, "
          f"avg cost=${avg_cost:.4f}, {len(flags)} flagged")
    print(f"[Evaluator] Failure analysis: {failure_analysis['totalFailures']} total failures — "
          f"prompt-fixable={failure_analysis['promptFixable']['rate']}%, "
          f"infra-fixable={failure_analysis['infraFixable']['rate']}%")
    for rec in failure_analysis["recommendations"]:
        print(f"[Evaluator] Recommendation: {rec}")

    return result

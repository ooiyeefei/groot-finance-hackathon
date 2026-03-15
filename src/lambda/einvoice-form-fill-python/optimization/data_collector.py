"""
Extract training datasets from Convex einvoice_request_logs for DSPy optimization.
"""

import json
import os
from typing import List
from urllib.request import Request, urlopen


CONVEX_URL = os.environ.get("NEXT_PUBLIC_CONVEX_URL", "https://kindhearted-lynx-129.convex.cloud")


def _convex_query(function_path: str, args: dict = None):
    """Query Convex for data."""
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


def collect_hint_effectiveness_pairs() -> List[dict]:
    """Extract hint-effectiveness training pairs.

    Each pair contains:
    - merchant_name: str
    - error_message: str (original failure)
    - generated_hint: str (troubleshooter output)
    - next_attempt_succeeded: bool (ground truth)
    - tier_reached: str

    Used for MIPROv2 optimization of the troubleshooter.
    """
    logs = _convex_query("functions/system:getEinvoiceMetricsByMerchant", {"minAttempts": 1})

    # Get all raw logs with hint effectiveness data
    # Note: We need the raw logs, not the aggregated metrics
    # This requires a direct query — for now, the metrics contain enough info
    # In production, add a dedicated raw-data query
    pairs = []

    # For each merchant with resolved hints, create training examples
    # Note: Full implementation would query raw logs with generatedHint + hintEffectivenessOutcome
    # For now, return empty list until data accumulates
    print(f"[Optimizer] Collected {len(pairs)} hint-effectiveness pairs from {len(logs or [])} merchants")
    return pairs


def collect_recon_success_pairs() -> List[dict]:
    """Extract successful recon-to-instruction pairs.

    Each pair contains:
    - recon_description: str
    - merchant_name: str
    - buyer_details: str (JSON)
    - cua_instructions: str (generated)
    - succeeded: bool
    - cua_turns: int

    Used for BootstrapFewShot on the recon module.
    """
    pairs = []
    # Similar to above — needs raw log data with reconDescription field
    print(f"[Optimizer] Collected {len(pairs)} recon-success pairs")
    return pairs

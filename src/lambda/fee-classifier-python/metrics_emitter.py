"""
DSPy Metrics Emitter (027-dspy-dash)

Sends classification metrics to Convex HTTP endpoint after each tool invocation.
Fire-and-forget: metrics emission failures are logged but never block classification results.
"""

import json
import os
import logging
import urllib.request
import urllib.error
from ssm_secrets import get_mcp_service_key

logger = logging.getLogger(__name__)

# Convex deployment URL — same as CONVEX_URL but for HTTP endpoints
CONVEX_HTTP_URL = os.environ.get("CONVEX_HTTP_URL", "")


def emit_metric(
    tool: str,
    business_id: str,
    used_dspy: bool,
    confidence: float,
    refine_retries: int,
    latency_ms: int,
    input_tokens: int = 0,
    output_tokens: int = 0,
    success: bool = True,
) -> None:
    """Send a classification metric to Convex. Fire-and-forget."""
    if not CONVEX_HTTP_URL:
        logger.debug("CONVEX_HTTP_URL not set, skipping metrics emission")
        return

    url = f"{CONVEX_HTTP_URL}/ingest-dspy-metrics"
    payload = json.dumps({
        "businessId": business_id,
        "tool": tool,
        "usedDspy": used_dspy,
        "confidence": confidence,
        "refineRetries": refine_retries,
        "latencyMs": latency_ms,
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "success": success,
    }).encode("utf-8")

    headers = {
        "Content-Type": "application/json",
        "X-Internal-Key": get_mcp_service_key(),
    }

    try:
        req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=5) as resp:
            if resp.status != 200:
                logger.warning("Metrics emission returned status %d", resp.status)
    except urllib.error.URLError as e:
        logger.warning("Metrics emission failed (URLError): %s", e)
    except Exception as e:
        logger.warning("Metrics emission failed: %s", e)

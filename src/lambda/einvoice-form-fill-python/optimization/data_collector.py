"""
Extract training datasets from Convex einvoice_request_logs for DSPy optimization.
Calls getEinvoiceRawTrainingData query which returns resolved hint-effectiveness
pairs and recon-success pairs.

Implements:
- Anchor merchant prioritization (Shell, 7-Eleven, FamilyMart, Jaya Grocer)
- Incremental collection via sinceTimestamp (skip already-optimized data)
- Merchant diversity metadata for MIPROv2 gating
"""

import json
import os
from typing import List, Tuple
from urllib.request import Request, urlopen


CONVEX_URL = os.environ.get("NEXT_PUBLIC_CONVEX_URL", "https://kindhearted-lynx-129.convex.cloud")

# Verified "Gold" merchants whose successful patterns must never be broken.
# Successful runs from these merchants are prioritized as non-negotiable anchor examples.
ANCHOR_MERCHANTS = {"shell", "7-eleven", "familymart", "jaya grocer"}

# Minimum distinct merchant domains required before MIPROv2 prompt rewriting is allowed.
# Below this threshold, only BootstrapFewShot (few-shot learning) runs.
MIN_MERCHANT_DIVERSITY_FOR_MIPRO = 5


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


def _is_anchor_merchant(merchant_name: str) -> bool:
    """Check if a merchant is an anchor (Gold) merchant."""
    return merchant_name.strip().lower() in ANCHOR_MERCHANTS


def _get_last_optimized_timestamp() -> float:
    """Read the last optimization timestamp from S3 metadata.
    Returns 0 if no previous optimization has run (process all data).
    """
    try:
        import boto3
        s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-west-2"))
        bucket = os.environ.get("S3_BUCKET_NAME", "finanseal-bucket")
        resp = s3.get_object(Bucket=bucket, Key="dspy-modules/optimization-state.json")
        state = json.loads(resp["Body"].read())
        return state.get("last_optimized_timestamp", 0)
    except Exception:
        return 0


def save_optimization_timestamp(timestamp: float):
    """Save the current optimization timestamp to S3 for incremental collection."""
    try:
        import boto3
        s3 = boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-west-2"))
        bucket = os.environ.get("S3_BUCKET_NAME", "finanseal-bucket")
        s3.put_object(
            Bucket=bucket,
            Key="dspy-modules/optimization-state.json",
            Body=json.dumps({"last_optimized_timestamp": timestamp}),
            ContentType="application/json",
        )
        print(f"[Optimizer] Saved optimization timestamp: {timestamp}")
    except Exception as e:
        print(f"[Optimizer] Failed to save optimization timestamp: {e}")


def collect_hint_effectiveness_pairs(since_timestamp: float = 0) -> Tuple[List[dict], dict]:
    """Extract hint-effectiveness training pairs from Convex.

    Args:
        since_timestamp: Only include pairs created after this timestamp (ms).
                         Anchor merchant examples are ALWAYS included regardless.

    Returns:
        Tuple of (pairs, metadata) where metadata contains:
        - unique_merchants: set of distinct merchant names
        - anchor_count: number of anchor merchant examples
        - new_count: number of examples newer than since_timestamp
    """
    try:
        data = _convex_query("functions/system:getEinvoiceRawTrainingData", {"minAttempts": 1})
        raw_pairs = data.get("hintPairs", []) if data else []

        anchor_pairs = []
        new_pairs = []
        unique_merchants = set()

        for pair in raw_pairs:
            merchant = pair.get("merchantName", "unknown")
            unique_merchants.add(merchant.strip().lower())
            created_at = pair.get("createdAt", 0)

            normalized = {
                "merchant_name": merchant,
                "error_message": pair.get("errorMessage", ""),
                "screenshot_description": pair.get("screenshotDescription", ""),
                "previous_hints": pair.get("previousHints", ""),
                "tier_reached": pair.get("tierReached", "tier2"),
                "next_attempt_succeeded": pair.get("nextAttemptSucceeded", False),
                "is_anchor": _is_anchor_merchant(merchant),
            }

            # Anchor merchant examples are ALWAYS included (non-negotiable)
            if _is_anchor_merchant(merchant):
                anchor_pairs.append(normalized)
            # Non-anchor examples: only include if newer than last optimization
            elif created_at > since_timestamp or since_timestamp == 0:
                new_pairs.append(normalized)

        # Anchors first, then new examples — anchors are non-negotiable in the trainset
        all_pairs = anchor_pairs + new_pairs

        metadata = {
            "unique_merchants": unique_merchants,
            "anchor_count": len(anchor_pairs),
            "new_count": len(new_pairs),
            "total_count": len(all_pairs),
        }

        print(f"[Optimizer] Hint pairs: {len(anchor_pairs)} anchor + {len(new_pairs)} new "
              f"= {len(all_pairs)} total, {len(unique_merchants)} unique merchants")
        return all_pairs, metadata

    except Exception as e:
        print(f"[Optimizer] Failed to collect hint pairs: {e}")
        return [], {"unique_merchants": set(), "anchor_count": 0, "new_count": 0, "total_count": 0}


def collect_recon_success_pairs(since_timestamp: float = 0) -> Tuple[List[dict], dict]:
    """Extract successful recon-to-instruction pairs from Convex.

    Same anchor/incremental logic as hint pairs.
    """
    try:
        data = _convex_query("functions/system:getEinvoiceRawTrainingData", {"minAttempts": 1})
        raw_pairs = data.get("reconPairs", []) if data else []

        anchor_pairs = []
        new_pairs = []
        unique_merchants = set()

        for pair in raw_pairs:
            merchant = pair.get("merchantName", "unknown")
            unique_merchants.add(merchant.strip().lower())
            created_at = pair.get("createdAt", 0)

            normalized = {
                "recon_description": pair.get("reconDescription", ""),
                "merchant_name": merchant,
                "buyer_details": pair.get("buyerDetails", "{}"),
                "succeeded": pair.get("succeeded", False),
                "cua_turns": pair.get("cuaTurns", 50),
                "is_anchor": _is_anchor_merchant(merchant),
            }

            if _is_anchor_merchant(merchant):
                anchor_pairs.append(normalized)
            elif created_at > since_timestamp or since_timestamp == 0:
                new_pairs.append(normalized)

        all_pairs = anchor_pairs + new_pairs
        metadata = {
            "unique_merchants": unique_merchants,
            "anchor_count": len(anchor_pairs),
            "new_count": len(new_pairs),
            "total_count": len(all_pairs),
        }

        print(f"[Optimizer] Recon pairs: {len(anchor_pairs)} anchor + {len(new_pairs)} new "
              f"= {len(all_pairs)} total, {len(unique_merchants)} unique merchants")
        return all_pairs, metadata

    except Exception as e:
        print(f"[Optimizer] Failed to collect recon pairs: {e}")
        return [], {"unique_merchants": set(), "anchor_count": 0, "new_count": 0, "total_count": 0}


def collect_doc_classification_corrections(since_timestamp: float = 0) -> Tuple[List[dict], dict]:
    """Extract document classification corrections for DSPy training.

    Each correction represents a case where AI classified a document wrong
    (e.g., called a receipt an invoice) and the user corrected it.

    Returns:
        Tuple of (corrections, metadata) for optimizer consumption.
    """
    try:
        data = _convex_query(
            "functions/documentInbox:getClassificationCorrections",
            {"sinceTimestamp": since_timestamp}
        )
        raw_corrections = data.get("corrections", []) if data else []

        training_pairs = []
        new_count = 0

        for correction in raw_corrections:
            corrected_at = correction.get("correctedAt", 0)
            is_new = corrected_at > since_timestamp or since_timestamp == 0
            if is_new:
                new_count += 1

            # The AI reasoning from Gemini serves as the "document description"
            # This is what the vision model saw — the DSPy module learns to
            # re-classify based on these descriptions
            ai_reasoning = correction.get("aiReasoning", "")

            training_pairs.append({
                "document_description": ai_reasoning,
                "filename": correction.get("fileHash", "unknown"),
                "email_subject": "",  # Not stored in corrections yet
                "original_type": correction["originalType"],
                "corrected_type": correction["correctedType"],
                "ai_confidence": correction.get("aiConfidence", 0),
            })

        metadata = {
            "total_count": len(training_pairs),
            "new_count": new_count,
        }

        print(f"[Optimizer] Doc classification corrections: {new_count} new, "
              f"{len(training_pairs)} total")
        return training_pairs, metadata

    except Exception as e:
        print(f"[Optimizer] Failed to collect doc classification corrections: {e}")
        return [], {"total_count": 0, "new_count": 0}

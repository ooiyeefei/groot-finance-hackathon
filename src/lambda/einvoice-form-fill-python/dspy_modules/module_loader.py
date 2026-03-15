"""
S3 module cache loader for optimized DSPy modules.

Downloads latest.json from S3 on cold start, caches in /tmp/.
Falls back to baseline (non-optimized) if S3 fails or module missing.
"""

import json
import os
from typing import Optional

# Module cache (survives across warm Lambda invocations)
_module_cache: dict = {}

S3_BUCKET = os.environ.get("S3_BUCKET_NAME", "finanseal-bucket")
S3_PREFIX = "dspy-modules"


def _get_s3_client():
    """Lazy-init S3 client to avoid cold start penalty."""
    import boto3
    return boto3.client("s3", region_name=os.environ.get("AWS_REGION", "us-west-2"))


def load_optimized_module(module_name: str) -> Optional[dict]:
    """Load an optimized DSPy module from S3 cache.

    Args:
        module_name: One of "troubleshooter", "recon", "instruction_guard"

    Returns:
        Dict with optimized module config, or None if not available.
        The dict contains DSPy-serialized state that can be loaded with module.load().
    """
    # Check in-memory cache first
    if module_name in _module_cache:
        return _module_cache[module_name]

    # Check /tmp/ file cache (persists across warm invocations in same container)
    tmp_path = f"/tmp/dspy_module_{module_name}.json"
    if os.path.exists(tmp_path):
        try:
            with open(tmp_path, "r") as f:
                data = json.load(f)
                _module_cache[module_name] = data
                print(f"[DSPy] Loaded {module_name} module from /tmp/ cache")
                return data
        except Exception as e:
            print(f"[DSPy] Failed to load {module_name} from /tmp/ cache: {e}")

    # Download from S3
    s3_key = f"{S3_PREFIX}/{module_name}/latest.json"
    try:
        s3 = _get_s3_client()
        response = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
        body = response["Body"].read().decode("utf-8")
        data = json.loads(body)

        # Cache in /tmp/ and in-memory
        with open(tmp_path, "w") as f:
            f.write(body)
        _module_cache[module_name] = data

        version = data.get("version", "unknown")
        print(f"[DSPy] Loaded {module_name} module from S3 (version={version})")
        return data

    except Exception as e:
        print(f"[DSPy] Could not load {module_name} from S3 ({e}), using baseline")
        return None


def get_module_version(module_name: str) -> str:
    """Get the version string of the currently loaded module."""
    data = _module_cache.get(module_name)
    if data:
        return data.get("version", "optimized-unknown")
    return "baseline"


def invalidate_cache(module_name: Optional[str] = None):
    """Clear cached modules (useful for testing or forced refresh)."""
    global _module_cache
    if module_name:
        _module_cache.pop(module_name, None)
        tmp_path = f"/tmp/dspy_module_{module_name}.json"
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    else:
        _module_cache.clear()

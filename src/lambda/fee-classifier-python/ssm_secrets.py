"""
SSM-backed secret reader with cold-start caching.

Reads secrets from AWS SSM Parameter Store at Lambda runtime instead of
relying on environment variables baked in at CDK synth time. This prevents
keys from being silently stripped when CDK redeploys without the right
env vars exported.

Usage:
    from ssm_secrets import get_gemini_api_key, get_mcp_service_key
    api_key = get_gemini_api_key()
"""

import os
import logging
import boto3

logger = logging.getLogger(__name__)

_cache: dict[str, str | None] = {}
_ssm_client = None


def _get_ssm_client():
    global _ssm_client
    if _ssm_client is None:
        _ssm_client = boto3.client("ssm")
    return _ssm_client


def _read_ssm_param(param_name: str) -> str | None:
    """Read a SecureString from SSM, cached for Lambda lifetime."""
    if param_name in _cache:
        return _cache[param_name]

    try:
        client = _get_ssm_client()
        result = client.get_parameter(Name=param_name, WithDecryption=True)
        value = result["Parameter"]["Value"]
        _cache[param_name] = value
        return value
    except Exception as e:
        logger.error(f"Failed to read SSM param {param_name}: {e}")
        _cache[param_name] = None
        return None


def get_gemini_api_key() -> str:
    """Get Gemini API key: env var (local dev) → SSM param (production)."""
    # Direct env var for local dev / testing
    direct = os.environ.get("GEMINI_API_KEY", "")
    if direct:
        return direct

    # SSM param name set by CDK
    param_name = os.environ.get("GEMINI_API_KEY_SSM_PARAM", "")
    if param_name:
        return _read_ssm_param(param_name) or ""

    return ""


def get_mcp_service_key() -> str:
    """Get MCP internal service key: env var (local dev) → SSM param (production)."""
    direct = os.environ.get("MCP_INTERNAL_SERVICE_KEY", "")
    if direct:
        return direct

    param_name = os.environ.get("MCP_SERVICE_KEY_SSM_PARAM", "")
    if param_name:
        return _read_ssm_param(param_name) or ""

    return ""

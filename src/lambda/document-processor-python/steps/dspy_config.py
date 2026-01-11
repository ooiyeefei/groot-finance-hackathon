"""
DSPy Configuration Module

Configures DSPy once at module-level to avoid threading issues with
AWS Durable Execution SDK.

IMPORTANT: This module must be imported BEFORE any extraction steps run.
DSPy's settings can only be changed by the thread that initially configured it.
By configuring at import time (Lambda cold start), we ensure consistent
thread ownership.

Usage:
    from steps.dspy_config import ensure_dspy_configured, get_lm

    # In extraction function:
    ensure_dspy_configured()  # No-op if already configured
    lm = get_lm()  # Get configured LM for token usage logging
"""

import os
import threading
import dspy

# Module-level state
_configured = False
_configured_lock = threading.Lock()
_lm_instance = None


def _configure_dspy():
    """
    Internal function to configure DSPy with Gemini.
    Called once at module initialization.
    """
    global _configured, _lm_instance

    gemini_api_key = os.environ.get("GEMINI_API_KEY")
    if not gemini_api_key:
        print("[DSPy Config] WARNING: GEMINI_API_KEY not set - deferring configuration")
        return False

    print("[DSPy Config] Configuring DSPy with Gemini 3 Flash...")

    # Create LM instance
    _lm_instance = dspy.LM(
        "gemini/gemini-3-flash-preview",
        api_key=gemini_api_key,
        temperature=0.1,
        max_tokens=16384,  # Max for full extraction; fast mode uses less
    )

    # Configure DSPy settings ONCE
    dspy.settings.configure(
        lm=_lm_instance,
        adapter=dspy.JSONAdapter(),
        track_usage=True
    )

    _configured = True
    print("[DSPy Config] DSPy configured successfully")
    return True


def ensure_dspy_configured():
    """
    Ensure DSPy is configured. Thread-safe, no-op if already configured.

    Call this at the start of extraction functions to ensure DSPy is ready.
    """
    global _configured

    if _configured:
        return True

    with _configured_lock:
        # Double-check after acquiring lock
        if _configured:
            return True

        return _configure_dspy()


def get_lm():
    """
    Get the configured DSPy LM instance for token usage logging.

    Returns:
        The dspy.LM instance, or None if not configured
    """
    return _lm_instance


def is_configured():
    """
    Check if DSPy is configured.

    Returns:
        True if DSPy has been configured, False otherwise
    """
    return _configured


# Auto-configure on import if API key is available
# This happens at Lambda cold start, establishing thread ownership
if os.environ.get("GEMINI_API_KEY"):
    _configure_dspy()
else:
    print("[DSPy Config] GEMINI_API_KEY not set at import - will configure on first use")

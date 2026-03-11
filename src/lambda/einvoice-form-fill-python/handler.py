"""
E-Invoice Form Fill Lambda (Python + Playwright + Gemini CUA)

3-tier self-evolving system:
  Tier 1 (~5s):   Saved formConfig → Playwright fills with CSS selectors
  Tier 2 (~120s): Gemini CUA explores → fills → saves formConfig on success
  Tier 2B (~15s): Gemini Flash multi-pass fill (fallback when CUA 429 rate-limited)
  Tier 3 (~10s):  On failure → Gemini Flash diagnoses → updates formConfig
"""

import json
import os
import base64
import time
import traceback
import re
from typing import Any, Optional
from urllib.request import Request, urlopen

# Fix: Playwright sync API fails if an asyncio loop already exists (from DSPy/litellm warm start)
import nest_asyncio
nest_asyncio.apply()

from playwright.sync_api import sync_playwright, Page, Browser

# DSPy imported lazily in troubleshoot() — avoids 10s cold start penalty on every invocation
dspy = None  # type: ignore

# ── Config ──────────────────────────────────────────────────

SCREEN_W, SCREEN_H = 1440, 900
MAX_TURNS = 50
CONVEX_URL = os.environ.get("NEXT_PUBLIC_CONVEX_URL", "")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
BU_LAMBDA_ARN = os.environ.get("EINVOICE_FORM_FILL_BU_LAMBDA_ARN", "")
BB_API_KEY_SSM = os.environ.get("BROWSERBASE_API_KEY_SSM_PARAM", "/finanseal/browserbase-api-key")
BB_PROJECT_ID_SSM = os.environ.get("BROWSERBASE_PROJECT_ID_SSM_PARAM", "/finanseal/browserbase-project-id")

STATE_CODES = {
    "JHR": "Johor", "KDH": "Kedah", "KTN": "Kelantan", "MLK": "Melaka",
    "NSN": "Negeri Sembilan", "PHG": "Pahang", "PRK": "Perak", "PLS": "Perlis",
    "PNG": "Pulau Pinang", "SBH": "Sabah", "SWK": "Sarawak", "SGR": "Selangor",
    "TRG": "Terengganu", "KUL": "Kuala Lumpur", "LBN": "Labuan", "PJY": "Putrajaya",
}


# ── HTTP helpers ────────────────────────────────────────────

def _http_post(url: str, body: dict, timeout: int = 10) -> dict:
    req = Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read())


def convex_mutation(path: str, args: dict) -> Any:
    r = _http_post(f"{CONVEX_URL}/api/mutation", {"path": path, "args": args, "format": "json"})
    if r.get("status") == "error":
        raise RuntimeError(f"Convex: {r.get('errorMessage')}")
    return r.get("value")


def convex_query(path: str, args: dict) -> Any:
    try:
        r = _http_post(f"{CONVEX_URL}/api/query", {"path": path, "args": args, "format": "json"})
        return r.get("value") if r.get("status") == "success" else None
    except Exception:
        return None


# ── Browserbase credentials (SSM, cached) ────────────────────

_bb_api_key_cache: str | None = None
_bb_project_id_cache: str | None = None

def _get_bb_credentials() -> tuple[str, str]:
    """Read Browserbase API key + project ID from SSM (cached for Lambda warm starts)."""
    global _bb_api_key_cache, _bb_project_id_cache
    if _bb_api_key_cache and _bb_project_id_cache:
        return _bb_api_key_cache, _bb_project_id_cache
    try:
        import boto3
        ssm_client = boto3.client("ssm")
        resp = ssm_client.get_parameters(
            Names=[BB_API_KEY_SSM, BB_PROJECT_ID_SSM], WithDecryption=True
        )
        params = {p["Name"]: p["Value"] for p in resp.get("Parameters", [])}
        _bb_api_key_cache = params.get(BB_API_KEY_SSM, "")
        _bb_project_id_cache = params.get(BB_PROJECT_ID_SSM, "")
        return _bb_api_key_cache, _bb_project_id_cache
    except Exception as e:
        print(f"[BB] SSM read failed: {e}")
        return "", ""


# ── CAPTCHA Solver (CapSolver) ──────────────────────────────

_capsolver_key_cache: str | None = None

def _get_capsolver_key() -> str:
    """Read CapSolver API key from SSM (cached for Lambda warm starts)."""
    global _capsolver_key_cache
    if _capsolver_key_cache:
        return _capsolver_key_cache
    param_name = os.environ.get("CAPSOLVER_SSM_PARAM", "")
    if not param_name:
        return ""
    try:
        import boto3
        ssm_client = boto3.client("ssm")
        resp = ssm_client.get_parameter(Name=param_name, WithDecryption=True)
        _capsolver_key_cache = resp["Parameter"]["Value"]
        return _capsolver_key_cache
    except Exception as e:
        print(f"[CAPTCHA] SSM read failed: {e}")
        return ""


def solve_captcha(page: Page, url: str, max_retries: int = 2) -> bool:
    """Detect reCAPTCHA v2 or Cloudflare Turnstile on page and solve via CapSolver API.
    Returns True if solved or no CAPTCHA present. Retries on transient failures."""
    for retry in range(max_retries):
        result = _solve_captcha_once(page, url)
        if result:
            return True
        if retry < max_retries - 1:
            print(f"[CAPTCHA] Retry {retry + 1}/{max_retries - 1} in 3s...")
            time.sleep(3)
    return False


def _solve_captcha_once(page: Page, url: str) -> bool:
    """Single attempt to detect and solve CAPTCHA."""
    try:
        # Detect CAPTCHA type — checks DOM elements, hidden inputs, scripts, AND network requests
        captcha_info = page.evaluate(r"""() => {
            // reCAPTCHA v2
            const recaptcha = document.querySelector('iframe[src*="recaptcha"], .g-recaptcha, #g-recaptcha');
            if (recaptcha) {
                const el = document.querySelector('.g-recaptcha, [data-sitekey]');
                let key = el ? el.getAttribute('data-sitekey') : null;
                if (!key) {
                    const iframe = document.querySelector('iframe[src*="recaptcha"]');
                    if (iframe) { const m = iframe.src.match(/[?&]k=([^&]+)/); key = m ? m[1] : null; }
                }
                return { type: 'recaptcha', siteKey: key };
            }

            // Cloudflare Turnstile — check multiple detection methods
            // Method 1: DOM elements
            const turnstileEl = document.querySelector('iframe[src*="challenges.cloudflare"], .cf-turnstile, [data-sitekey*="0x4"]');
            // Method 2: Hidden input (Angular/React programmatic render)
            const turnstileInput = document.querySelector('input[name="cf-turnstile-response"]');
            // Method 3: Turnstile script loaded
            const turnstileScript = document.querySelector('script[src*="turnstile"]');

            if (turnstileEl || turnstileInput || turnstileScript) {
                let key = null;
                // Try data-sitekey attribute
                const el = document.querySelector('.cf-turnstile, [data-sitekey*="0x4"]');
                if (el) key = el.getAttribute('data-sitekey');
                // Try iframe src
                if (!key) {
                    const iframe = document.querySelector('iframe[src*="challenges.cloudflare"]');
                    if (iframe) { const m = iframe.src.match(/[?&]k=([^&]+)/); key = m ? m[1] : null; }
                }
                // Try extracting from network requests (programmatic render — sitekey is in URL path)
                if (!key) {
                    const entries = performance.getEntriesByType('resource');
                    for (const e of entries) {
                        const m = e.name.match(/turnstile.*?\/(0x4[A-Za-z0-9_-]+)/);
                        if (m) { key = m[1]; break; }
                    }
                }
                return { type: 'turnstile', siteKey: key };
            }

            // hCaptcha (future support)
            const hcaptcha = document.querySelector('iframe[src*="hcaptcha"], .h-captcha');
            if (hcaptcha) {
                const el = document.querySelector('.h-captcha, [data-sitekey]');
                return { type: 'hcaptcha', siteKey: el ? el.getAttribute('data-sitekey') : null };
            }
            return { type: null };
        }""")

        if not captcha_info or not captcha_info.get("type"):
            return True  # No CAPTCHA — continue normally

        captcha_type = captcha_info["type"]
        site_key = captcha_info.get("siteKey")
        print(f"[CAPTCHA] {captcha_type} detected, siteKey: {(site_key or 'unknown')[:25]}...")

        # Turnstile managed challenge: check if widget actually rendered via JS API
        # If no iframes and no .cf-turnstile elements, it's managed mode — CapSolver can't help
        if captcha_type == "turnstile":
            is_managed = page.evaluate("""() => {
                const hasIframe = document.querySelectorAll('iframe[src*="challenges.cloudflare"]').length > 0;
                const hasWidget = document.querySelectorAll('.cf-turnstile').length > 0;
                const hasDataSitekey = document.querySelectorAll('[data-sitekey]').length > 0;
                return !hasIframe && !hasWidget && !hasDataSitekey;
            }""")
            if is_managed:
                print("[CAPTCHA] Turnstile managed challenge (no widget rendered) — skipping CapSolver, CUA will click")
                return True  # Don't block — let CUA handle it

        api_key = _get_capsolver_key()
        if not api_key:
            print("[CAPTCHA] No CapSolver API key — cannot solve")
            return False

        if not site_key:
            print(f"[CAPTCHA] Could not extract {captcha_type} site key")
            return False

        # Map CAPTCHA type to CapSolver task type
        task_config = {
            "recaptcha": {"type": "ReCaptchaV2TaskProxyLess", "websiteURL": url, "websiteKey": site_key},
            "turnstile": {"type": "AntiTurnstileTaskProxyLess", "websiteURL": url, "websiteKey": site_key},
            "hcaptcha":  {"type": "HCaptchaTaskProxyLess", "websiteURL": url, "websiteKey": site_key},
        }.get(captcha_type)

        if not task_config:
            print(f"[CAPTCHA] Unsupported type: {captcha_type}")
            return False

        # Step 1: Create task
        create_resp = _http_post("https://api.capsolver.com/createTask", {
            "clientKey": api_key,
            "task": task_config,
        }, timeout=15)

        if create_resp.get("errorId", 0) != 0:
            print(f"[CAPTCHA] CapSolver createTask error: {create_resp.get('errorDescription', 'unknown')}")
            return False

        task_id = create_resp.get("taskId")
        if not task_id:
            print(f"[CAPTCHA] No taskId returned: {create_resp}")
            return False

        print(f"[CAPTCHA] Task created: {task_id}, polling...")

        # Step 2: Poll for result (max ~30s)
        for attempt in range(15):
            time.sleep(2)
            result = _http_post("https://api.capsolver.com/getTaskResult", {
                "clientKey": api_key,
                "taskId": task_id,
            }, timeout=10)

            status = result.get("status")
            if status == "ready":
                solution = result.get("solution", {})
                # Token key varies by type
                token = solution.get("gRecaptchaResponse") or solution.get("token") or solution.get("text") or ""
                if not token:
                    print(f"[CAPTCHA] Solution ready but no token: {list(solution.keys())}")
                    return False

                # Step 3: Inject token based on CAPTCHA type
                if captcha_type == "recaptcha":
                    page.evaluate("""(token) => {
                        const el = document.getElementById('g-recaptcha-response');
                        if (el) { el.value = token; }
                        document.querySelectorAll('textarea[name="g-recaptcha-response"]').forEach(t => { t.value = token; });
                        if (typeof ___grecaptcha_cfg !== 'undefined') {
                            const clients = ___grecaptcha_cfg.clients || {};
                            for (const cid of Object.keys(clients)) {
                                const client = clients[cid];
                                for (const key of Object.keys(client)) {
                                    const val = client[key];
                                    if (val && typeof val === 'object') {
                                        for (const k2 of Object.keys(val)) {
                                            if (val[k2] && typeof val[k2].callback === 'function') { val[k2].callback(token); return; }
                                        }
                                    }
                                }
                            }
                        }
                    }""", token)
                elif captcha_type == "turnstile":
                    cb_result = page.evaluate("""(token) => {
                        let callbackInvoked = false;

                        // 1. Use the intercepted callback (captured via addInitScript)
                        if (window.__turnstileCallbacks && window.__turnstileCallbacks.length > 0) {
                            for (const cb of window.__turnstileCallbacks) {
                                try { cb(token); callbackInvoked = true; } catch(e) {}
                            }
                        }

                        // 2. Set hidden input with native setter (Angular/React change detection)
                        document.querySelectorAll('input[name="cf-turnstile-response"]').forEach(el => {
                            const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                            if (setter) setter.call(el, token);
                            else el.value = token;
                            el.dispatchEvent(new Event('input', { bubbles: true }));
                            el.dispatchEvent(new Event('change', { bubbles: true }));
                        });

                        // 3. Monkey-patch turnstile API for any subsequent getResponse() calls
                        if (typeof turnstile !== 'undefined') {
                            turnstile.getResponse = function() { return token; };
                            turnstile.isExpired = function() { return false; };
                        }

                        return { callbackInvoked, callbackCount: (window.__turnstileCallbacks || []).length };
                    }""", token)
                    print(f"[CAPTCHA] Turnstile callback: {cb_result}")
                elif captcha_type == "hcaptcha":
                    page.evaluate("""(token) => {
                        document.querySelectorAll('textarea[name="h-captcha-response"], [name="g-recaptcha-response"]').forEach(el => { el.value = token; });
                    }""", token)

                cost_tracker.record_capsolver()
                print(f"[CAPTCHA] {captcha_type} solved in {(attempt + 1) * 2}s, token injected")
                time.sleep(1)
                return True

            elif status == "failed":
                print(f"[CAPTCHA] CapSolver task failed: {result.get('errorDescription', 'unknown')}")
                return False

        print("[CAPTCHA] CapSolver timeout after 30s")
        return False

    except Exception as e:
        print(f"[CAPTCHA] Error: {e}")
        traceback.print_exc()
        return False


# ── Cost Tracker ────────────────────────────────────────────

# Pricing per million tokens (USD)
_PRICING = {
    "gemini-2.5-computer-use": {"input": 1.25, "output": 10.00},
    "gemini-3.1-flash-lite-preview":  {"input": 0.25, "output": 1.50},
}

class CostTracker:
    """Tracks Gemini API token usage and cost across a single Lambda invocation."""
    def __init__(self):
        self.cua_input_tokens = 0
        self.cua_output_tokens = 0
        self.cua_calls = 0
        self.flash_input_tokens = 0
        self.flash_output_tokens = 0
        self.flash_calls = 0
        self.capsolver_solves = 0

    def record_cua(self, usage: dict):
        self.cua_input_tokens += usage.get("promptTokenCount", 0)
        self.cua_output_tokens += usage.get("candidatesTokenCount", 0)
        self.cua_calls += 1

    def record_flash(self, usage: dict):
        self.flash_input_tokens += usage.get("promptTokenCount", 0)
        self.flash_output_tokens += usage.get("candidatesTokenCount", 0)
        self.flash_calls += 1

    def record_capsolver(self):
        self.capsolver_solves += 1

    @property
    def cua_cost(self) -> float:
        p = _PRICING["gemini-2.5-computer-use"]
        return (self.cua_input_tokens * p["input"] + self.cua_output_tokens * p["output"]) / 1_000_000

    @property
    def flash_cost(self) -> float:
        p = _PRICING["gemini-3.1-flash-lite-preview"]
        return (self.flash_input_tokens * p["input"] + self.flash_output_tokens * p["output"]) / 1_000_000

    @property
    def capsolver_cost(self) -> float:
        return self.capsolver_solves * 0.0012  # ~$1.20/1000 solves (Turnstile=$1.20, reCAPTCHA=$0.80, avg=$1.00)

    @property
    def total_cost(self) -> float:
        return self.cua_cost + self.flash_cost + self.capsolver_cost

    def summary(self) -> str:
        parts = []
        if self.cua_calls:
            parts.append(f"CUA: {self.cua_calls} calls, {self.cua_input_tokens}in/{self.cua_output_tokens}out tokens, ${self.cua_cost:.4f}")
        if self.flash_calls:
            parts.append(f"Flash: {self.flash_calls} calls, {self.flash_input_tokens}in/{self.flash_output_tokens}out tokens, ${self.flash_cost:.4f}")
        if self.capsolver_solves:
            parts.append(f"CapSolver: {self.capsolver_solves} solves, ${self.capsolver_cost:.4f}")
        parts.append(f"TOTAL: ${self.total_cost:.4f}")
        return " | ".join(parts)

    def to_dict(self) -> dict:
        return {
            "cuaInputTokens": self.cua_input_tokens, "cuaOutputTokens": self.cua_output_tokens, "cuaCalls": self.cua_calls,
            "flashInputTokens": self.flash_input_tokens, "flashOutputTokens": self.flash_output_tokens, "flashCalls": self.flash_calls,
            "capsolverSolves": self.capsolver_solves,
            "cuaCostUsd": round(self.cua_cost, 6), "flashCostUsd": round(self.flash_cost, 6),
            "capsolverCostUsd": round(self.capsolver_cost, 6), "totalCostUsd": round(self.total_cost, 6),
        }

# Global tracker — reset per invocation
cost_tracker = CostTracker()


# Per-invocation state for debug reporting
_run_state: dict = {}

def _debug_fields() -> dict:
    """Build debug fields dict for Convex reportEinvoiceFormFillResult."""
    fields: dict = {}
    if _run_state.get("merchant"):
        fields["merchantName"] = _run_state["merchant"]
    if _run_state.get("tier"):
        fields["tierReached"] = _run_state["tier"]
    if _run_state.get("browser_type"):
        fields["browserType"] = _run_state["browser_type"]
    if _run_state.get("cua_actions") is not None:
        fields["cuaActions"] = _run_state["cua_actions"]
    if _run_state.get("evidence"):
        fields["verifyEvidence"] = _run_state["evidence"][:500]
    if _run_state.get("merchant_slug"):
        fields["merchantSlug"] = _run_state["merchant_slug"]
    cost_data = cost_tracker.to_dict()
    if cost_data.get("totalCostUsd", 0) > 0:
        fields["cost"] = cost_data
    return fields


# ── Gemini API ──────────────────────────────────────────────

def gemini_cua(contents: list[dict]) -> dict:
    """Call Gemini CUA model (computer use agent)."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-computer-use-preview-10-2025:generateContent?key={GEMINI_KEY}"
    payload = {
        "contents": contents,
        "tools": [{"computerUse": {"environment": "ENVIRONMENT_BROWSER"}}],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 8192},
    }
    for attempt in range(3):
        req = Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
        try:
            with urlopen(req, timeout=60) as resp:
                r = json.loads(resp.read())
            usage = r.get("usageMetadata", {})
            if usage:
                cost_tracker.record_cua(usage)
            return r
        except Exception as e:
            if attempt < 2 and ("503" in str(e) or "429" in str(e)):
                print(f"[Form Fill] Gemini retry {attempt+1}: {e}")
                time.sleep(3 * (attempt + 1))
                continue
            raise


def gemini_flash(prompt: str, image_b64: str) -> str:
    """Call Gemini Flash for vision analysis (recon / troubleshooting)."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key={GEMINI_KEY}"
    payload = {
        "contents": [{"role": "user", "parts": [
            {"text": prompt},
            {"inlineData": {"mimeType": "image/png", "data": image_b64}},
        ]}],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 2048},
    }
    req = Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=30) as resp:
        r = json.loads(resp.read())
    usage = r.get("usageMetadata", {})
    if usage:
        cost_tracker.record_flash(usage)
    return r.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")


# ── Merchant credentials (SSM) ──────────────────────────────

_merchant_creds_cache: dict = {}

def _read_merchant_credentials(merchant_slug: str) -> dict | None:
    """Read login credentials for a merchant from SSM Parameter Store.
    Convention: /finanseal/{slug}-einvoice-email and /finanseal/{slug}-einvoice-password.
    Returns {"email": "...", "password": "..."} or None if not configured.
    """
    if merchant_slug in _merchant_creds_cache:
        return _merchant_creds_cache[merchant_slug]
    try:
        import boto3 as _boto3
        ssm = _boto3.client("ssm")
        email_param = f"/finanseal/{merchant_slug}-einvoice-email"
        pw_param = f"/finanseal/{merchant_slug}-einvoice-password"
        resp = ssm.get_parameters(Names=[email_param, pw_param], WithDecryption=True)
        params = {p["Name"]: p["Value"] for p in resp.get("Parameters", [])}
        if email_param in params and pw_param in params:
            creds = {"email": params[email_param], "password": params[pw_param]}
            _merchant_creds_cache[merchant_slug] = creds
            print(f"[Creds] Loaded credentials for {merchant_slug} from SSM")
            return creds
        print(f"[Creds] Missing SSM params for {merchant_slug}: found {list(params.keys())}")
        return None
    except Exception as e:
        print(f"[Creds] SSM read failed for {merchant_slug}: {e}")
        return None


# Mapping from merchant name (lowercase) to SSM slug
_MERCHANT_NAME_SLUGS = {
    "7-eleven": "7eleven",
    "7-eleven malaysia": "7eleven",
    "7-eleven malaysia sdn. bhd.": "7eleven",
    "7-eleven malaysia sdn bhd": "7eleven",
}

# Mapping from e-invoice URL domain to SSM slug (platform-based detection).
# Multiple merchants may use the same e-invoice platform (e.g. vizmyinvoice).
_URL_DOMAIN_SLUGS = {
    "vizmyinvoice.com": "vizmyinvoice",
}


def _get_merchant_slug(merchant_name: str, einvoice_url: str = "") -> str | None:
    """Get the SSM slug for a merchant that requires login credentials.
    Checks URL domain first (platform-based), then merchant name."""
    # 1. URL-based: any merchant using a known e-invoice platform
    url_lower = (einvoice_url or "").lower()
    for domain, slug in _URL_DOMAIN_SLUGS.items():
        if domain in url_lower:
            return slug
    # 2. Name-based: specific merchant names
    name_lower = (merchant_name or "").lower().strip()
    for pattern, slug in _MERCHANT_NAME_SLUGS.items():
        if pattern in name_lower or name_lower in pattern:
            return slug
    return None


def _poll_otp_from_s3(otp_email: str, timeout_seconds: int = 90) -> str | None:
    """Poll S3 for an OTP email sent to the given address. Returns the OTP code or None.
    SES stores emails to *@einv.hellogroot.com in s3://finanseal-bucket/ses-emails/einvoice/.
    """
    import boto3 as _boto3
    s3 = _boto3.client("s3")
    bucket = "finanseal-bucket"
    prefix = "ses-emails/einvoice/"
    start_time = time.time()
    seen_keys: set = set()

    # Record objects that existed BEFORE we started polling (to ignore old emails)
    try:
        pre_resp = s3.list_objects_v2(Bucket=bucket, Prefix=prefix, MaxKeys=50)
        for obj in pre_resp.get("Contents", []):
            seen_keys.add(obj["Key"])
        print(f"[OTP] Pre-existing emails: {len(seen_keys)}, polling for new OTP to {otp_email}...")
    except Exception as e:
        print(f"[OTP] Failed to list pre-existing emails: {e}")

    while time.time() - start_time < timeout_seconds:
        time.sleep(5)
        try:
            resp = s3.list_objects_v2(Bucket=bucket, Prefix=prefix, MaxKeys=50)
            for obj in sorted(resp.get("Contents", []), key=lambda x: x.get("LastModified", ""), reverse=True):
                key = obj["Key"]
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                # Download and check if it's an OTP email for our address
                try:
                    email_resp = s3.get_object(Bucket=bucket, Key=key)
                    email_body = email_resp["Body"].read().decode("utf-8", errors="replace")
                    # Check if this email is addressed to our OTP email
                    if otp_email.lower() not in email_body.lower():
                        continue
                    # Extract OTP code (4-8 digit number near OTP/TAC/verification keywords)
                    otp_match = re.search(
                        r'(?:otp|tac|verification\s*code|one.time\s*password)[^0-9]{0,50}(\d{4,8})',
                        email_body, re.IGNORECASE
                    )
                    if not otp_match:
                        # Try reverse: digits followed by OTP keyword
                        otp_match = re.search(
                            r'(\d{4,8})[^0-9]{0,50}(?:otp|tac|verification|one.time)',
                            email_body, re.IGNORECASE
                        )
                    if not otp_match:
                        # Broadest: standalone 4-8 digit number in a short email
                        if len(email_body) < 5000:
                            otp_match = re.search(r'\b(\d{4,8})\b', email_body)
                    if otp_match:
                        otp_code = otp_match.group(1)
                        elapsed = int(time.time() - start_time)
                        print(f"[OTP] Found OTP: {otp_code} (from {key}, {elapsed}s)")
                        return otp_code
                    print(f"[OTP] Email found but no OTP code extracted: {key}")
                except Exception as parse_err:
                    print(f"[OTP] Failed to parse {key}: {parse_err}")
        except Exception as list_err:
            print(f"[OTP] S3 list failed: {list_err}")

    elapsed = int(time.time() - start_time)
    print(f"[OTP] Timeout after {elapsed}s — no OTP received at {otp_email}")
    return None


def _run_login_flow(page: Page, url: str, creds: dict, merchant_slug: str, email_ref: str) -> None:
    """Handle merchant login (email + password + OTP) before the buyer form.
    Detects login page, fills credentials, solves CAPTCHA, handles OTP via email polling.
    """
    # Check if we're on a login page
    is_login = page.evaluate(r"""() => {
        const src = document.documentElement.innerHTML.toLowerCase();
        const hasLogin = src.includes('log in') || src.includes('login') || src.includes('sign in');
        const hasPassword = !!document.querySelector('input[type="password"]');
        const hasEmail = !!document.querySelector('input[type="email"], input[name*="email" i], input[placeholder*="email" i]');
        return hasLogin && (hasPassword || hasEmail);
    }""")

    if not is_login:
        print(f"[Login] No login page detected for {merchant_slug} — skipping login flow")
        return

    print(f"[Login] Login page detected for {merchant_slug} — filling credentials")
    login_email = creds["email"]
    login_password = creds["password"]

    # Fill email field
    email_filled = False
    for selector in ['input[type="email"]', 'input[name*="email" i]', 'input[placeholder*="email" i]',
                     'input[id*="email" i]', 'input[id*="user" i]', 'input[name*="user" i]']:
        try:
            el = page.locator(selector).first
            if el.count() > 0 and el.is_visible():
                el.click()
                el.fill(login_email)
                email_filled = True
                print(f"[Login] Email filled via {selector}")
                break
        except Exception:
            continue

    if not email_filled:
        print("[Login] Could not find email field — will rely on CUA")

    # Fill password field
    pw_filled = False
    try:
        pw_el = page.locator('input[type="password"]').first
        if pw_el.count() > 0 and pw_el.is_visible():
            pw_el.click()
            pw_el.fill(login_password)
            pw_filled = True
            print("[Login] Password filled")
    except Exception:
        print("[Login] Could not find password field — will rely on CUA")

    # Wait for reCAPTCHA to load, then solve before clicking login
    time.sleep(3)
    captcha_solved = solve_captcha(page, url)
    if captcha_solved:
        print("[Login] CAPTCHA solved before login click")
    else:
        print("[Login] No CAPTCHA detected (or solve failed) — proceeding with login")

    # Click login/submit button
    login_clicked = False
    for selector in ['button:has-text("Log In")', 'button:has-text("Login")', 'button:has-text("Sign In")',
                     'button[type="submit"]', 'input[type="submit"]']:
        try:
            btn = page.locator(selector).first
            if btn.count() > 0 and btn.is_visible():
                btn.click(timeout=5000)
                login_clicked = True
                print(f"[Login] Clicked login button: {selector}")
                break
        except Exception:
            continue

    if not login_clicked:
        print("[Login] Could not find login button — will rely on CUA")
        return

    # Wait for page response after login
    time.sleep(5)

    # Check if login failed (auth error) — might be CAPTCHA not solved or bad credentials
    login_failed = page.evaluate(r"""() => {
        const src = document.documentElement.innerHTML.toLowerCase();
        return src.includes('authentication failed') || src.includes('invalid credentials')
            || src.includes('login failed') || src.includes('incorrect password');
    }""")
    if login_failed:
        print("[Login] ⚠ Authentication failed — may need CAPTCHA or credentials are wrong")
        # Try dismissing error modal and re-solving CAPTCHA
        try:
            # Close modal (common patterns: OK button, X button, backdrop click)
            for dismiss in ['button:has-text("OK")', 'button:has-text("Close")', '.modal button',
                           'button[aria-label="Close"]', '.close']:
                try:
                    el = page.locator(dismiss).first
                    if el.count() > 0 and el.is_visible():
                        el.click(timeout=3000)
                        print(f"[Login] Dismissed error modal via {dismiss}")
                        time.sleep(1)
                        break
                except Exception:
                    continue
        except Exception:
            pass

        # Re-attempt: solve CAPTCHA (it may have reset after failed login)
        time.sleep(2)
        if solve_captcha(page, url):
            print("[Login] CAPTCHA solved after failed attempt — retrying login")
            # Re-fill password (some forms clear it on failed login)
            try:
                pw_el = page.locator('input[type="password"]').first
                if pw_el.count() > 0 and pw_el.is_visible():
                    pw_el.fill(login_password)
            except Exception:
                pass
            # Click login again
            for selector in ['button:has-text("Log In")', 'button:has-text("Login")',
                             'button[type="submit"]']:
                try:
                    btn = page.locator(selector).first
                    if btn.count() > 0 and btn.is_visible():
                        btn.click(timeout=5000)
                        print(f"[Login] Re-clicked login: {selector}")
                        break
                except Exception:
                    continue
            time.sleep(5)
        else:
            print("[Login] CAPTCHA still not detected — login may require manual CAPTCHA interaction")
            return

    # Check if OTP/TAC verification is needed — look for a visible OTP input field, not just page text
    otp_needed = page.evaluate(r"""() => {
        // Must have a visible input field for OTP (not just text mentioning OTP in scripts/CSS)
        const otpInput = document.querySelector(
            'input[id*="otp" i], input[name*="otp" i], input[id*="tac" i], input[name*="tac" i], '
            + 'input[placeholder*="otp" i], input[placeholder*="tac" i], input[placeholder*="verification" i]'
        );
        if (otpInput && otpInput.offsetParent !== null) return true;
        // Also check for visible text labels near input fields
        const labels = Array.from(document.querySelectorAll('label, .label, h2, h3, p'));
        const hasOtpLabel = labels.some(l => {
            const t = l.textContent.toLowerCase();
            return (t.includes('otp') || t.includes('tac') || t.includes('verification code'))
                && l.offsetParent !== null;
        });
        return hasOtpLabel;
    }""")

    if otp_needed:
        print(f"[Login] OTP/TAC input field detected — polling S3 for OTP email to {login_email}")
        otp_code = _poll_otp_from_s3(login_email, timeout_seconds=90)

        if otp_code:
            # Fill OTP field
            otp_filled = False
            for selector in ['input[id*="otp" i]', 'input[name*="otp" i]', 'input[id*="tac" i]',
                             'input[name*="tac" i]', 'input[placeholder*="otp" i]',
                             'input[placeholder*="tac" i]', 'input[placeholder*="verification" i]',
                             'input[type="tel"]', 'input[maxlength="6"]', 'input[maxlength="4"]']:
                try:
                    el = page.locator(selector).first
                    if el.count() > 0 and el.is_visible():
                        el.click()
                        el.fill(otp_code)
                        otp_filled = True
                        print(f"[Login] OTP filled via {selector}: {otp_code}")
                        break
                except Exception:
                    continue

            if not otp_filled:
                # Try filling all visible short inputs (OTP fields are often unlabeled)
                try:
                    inputs = page.locator('input:visible').all()
                    for inp in inputs:
                        input_type = inp.get_attribute("type") or ""
                        maxlen = inp.get_attribute("maxlength") or ""
                        if input_type not in ("hidden", "password", "email", "checkbox", "radio"):
                            if maxlen and int(maxlen) <= 8:
                                inp.click()
                                inp.fill(otp_code)
                                otp_filled = True
                                print(f"[Login] OTP filled via short input (maxlength={maxlen})")
                                break
                except Exception as e:
                    print(f"[Login] OTP field search failed: {e}")

            if otp_filled:
                # Click verify/submit button
                for selector in ['button:has-text("Verify")', 'button:has-text("Submit")',
                                 'button:has-text("Confirm")', 'button[type="submit"]']:
                    try:
                        btn = page.locator(selector).first
                        if btn.count() > 0 and btn.is_visible():
                            btn.click(timeout=5000)
                            print(f"[Login] Clicked verify button: {selector}")
                            break
                    except Exception:
                        continue
                time.sleep(5)
                print(f"[Login] Login + OTP complete for {merchant_slug}, current URL: {page.url}")
            else:
                print(f"[Login] Could not find OTP field — CUA will need to handle it")
        else:
            print(f"[Login] OTP not received — CUA will need to handle it manually")
    else:
        # Check if login succeeded (no OTP needed)
        time.sleep(3)
        print(f"[Login] Login submitted for {merchant_slug}, current URL: {page.url}")


# ── Browser launch helpers ──────────────────────────────────

def launch_browserbase(pw, use_proxy: bool = False) -> tuple:
    """Launch a cloud browser via Browserbase (real fingerprint, Singapore region).
    Returns (browser, page, session_id). Used for WAF-blocked/geo-blocked merchants.
    Args:
        use_proxy: Enable residential proxy for sites that block datacenter IPs.
    """
    from browserbase import Browserbase
    bb_key, bb_proj = _get_bb_credentials()
    bb = Browserbase(api_key=bb_key)
    create_params = {
        "project_id": bb_proj,
        "region": "ap-southeast-1",  # Singapore — closest to Malaysia, avoids geo-blocking
        "api_timeout": 420,  # 7 minutes — complex flows (login + buyer profile + form fill) need more time
    }
    if use_proxy:
        create_params["proxies"] = True
    session = bb.sessions.create(**create_params)
    print(f"[Browser] Browserbase session: {session.id} (region=ap-southeast-1, proxy={use_proxy})")
    browser = pw.chromium.connect_over_cdp(session.connect_url)
    context = browser.contexts[0]
    page = context.pages[0]
    # Set viewport to match CUA's coordinate system (critical for coordinate-based actions)
    page.set_viewport_size({"width": SCREEN_W, "height": SCREEN_H})
    return browser, page, session.id


def launch_local(pw) -> tuple:
    """Launch local headless Chromium (Lambda Docker). Returns (browser, page, None)."""
    browser = pw.chromium.launch(
        headless=True,
        args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
              "--disable-gpu", "--headless=new", "--single-process"],
    )
    page = browser.new_page(viewport={"width": SCREEN_W, "height": SCREEN_H})
    return browser, page, None


def needs_browserbase(merchant_hints: str) -> bool:
    """Check if merchant requires Browserbase (Cloudflare managed challenge, WAF blocking, connection issues, etc.)."""
    bb_key, bb_proj = _get_bb_credentials()
    if not bb_key or not bb_proj:
        return False
    hints_lower = (merchant_hints or "").lower()
    return any(k in hints_lower for k in [
        "browserbase", "cloudflare_managed", "cloudflare managed", "waf block",
        "connection_error", "socket_not_connected", "use_browserbase",
    ])


# Network errors that indicate Lambda can't reach the site but Browserbase might
_RETRYABLE_NETWORK_ERRORS = [
    "ERR_SOCKET_NOT_CONNECTED",
    "ERR_CONNECTION_REFUSED",
    "ERR_CONNECTION_RESET",
    "ERR_CONNECTION_TIMED_OUT",
    "ERR_SSL_PROTOCOL_ERROR",
    "ERR_TIMED_OUT",
]


def _is_retryable_network_error(error_msg: str) -> bool:
    """Check if a page.goto error is a network-level failure that Browserbase might fix."""
    return any(code in error_msg for code in _RETRYABLE_NETWORK_ERRORS)


def detect_managed_turnstile(page) -> bool:
    """Detect Cloudflare managed challenge (Turnstile loaded but no widget rendered)."""
    return page.evaluate("""() => {
        const hasScript = !!document.querySelector('script[src*="turnstile"]');
        const hasInput = !!document.querySelector('input[name="cf-turnstile-response"]');
        const hasWidget = document.querySelectorAll('.cf-turnstile, [data-sitekey], iframe[src*="challenges.cloudflare"]').length > 0;
        return (hasScript || hasInput) && !hasWidget;
    }""")


# ── Playwright helpers ──────────────────────────────────────

def handle_validate_gate(page: Page, buyer: dict) -> bool:
    """Detect and handle two-phase forms with a Validate/Verify button that gates field access.
    Some merchant forms (e.g. invoice2e.my) require BRN + TIN validation before enabling the rest.
    Returns True if a validate gate was found and handled."""
    try:
        # Detect: look for a Validate/Verify button AND mostly disabled fields
        validate_btn = page.locator('button:has-text("Validate"), button:has-text("Verify"), button:has-text("Check")').first
        if validate_btn.count() == 0 or not validate_btn.is_visible():
            return False

        disabled_count = page.evaluate("""() => {
            return document.querySelectorAll('input[disabled], select[disabled], textarea[disabled], [role="combobox"][aria-disabled="true"]').length;
        }""")
        if disabled_count < 3:
            return False  # Not a gated form

        print(f"[Validate Gate] Detected: {disabled_count} disabled fields + Validate button")

        # Fill BRN field (the only enabled text field with "business registration" or "brn" label)
        brn_filled = page.evaluate("""(brn) => {
            const inputs = document.querySelectorAll('input[type="text"]:not([disabled]), input:not([type]):not([disabled])');
            for (const el of inputs) {
                const label = (el.closest('label')?.textContent || document.querySelector('label[for="'+el.id+'"]')?.textContent || el.placeholder || el.name || '').toLowerCase();
                if (label.includes('business registration') || label.includes('brn') || label.includes('registration no')) {
                    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                    if (setter) { setter.call(el, brn); el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); }
                    return true;
                }
            }
            return false;
        }""", buyer["brn"])
        if brn_filled:
            print(f"[Validate Gate] Filled BRN: {buyer['brn']}")

        # Fill TIN field
        tin_filled = page.evaluate("""(tin) => {
            const inputs = document.querySelectorAll('input[type="text"]:not([disabled]), input:not([type]):not([disabled])');
            for (const el of inputs) {
                const label = (el.closest('label')?.textContent || document.querySelector('label[for="'+el.id+'"]')?.textContent || el.placeholder || el.name || '').toLowerCase();
                if (label.includes('tax identification') || label.includes('tin') || label.includes('tax id')) {
                    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                    if (setter) { setter.call(el, tin); el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); }
                    return true;
                }
            }
            return false;
        }""", buyer["tin"])
        if tin_filled:
            print(f"[Validate Gate] Filled TIN: {buyer['tin']}")

        # Click Validate
        validate_btn.click(timeout=5000)
        print("[Validate Gate] Clicked Validate, waiting for fields to unlock...")

        # Wait for fields to become enabled (poll for up to 10s)
        for attempt in range(20):
            time.sleep(0.5)
            still_disabled = page.evaluate("""() => {
                const email = document.querySelector('input[type="email"]:not([disabled]), input[placeholder*="@"]:not([disabled])');
                const name = Array.from(document.querySelectorAll('input:not([disabled])')).find(
                    el => (el.closest('label')?.textContent || '').toLowerCase().includes('name')
                );
                return !email && !name;  // True if still gated
            }""")
            if not still_disabled:
                new_disabled = page.evaluate("() => document.querySelectorAll('input[disabled]').length")
                print(f"[Validate Gate] Fields unlocked after {(attempt + 1) * 0.5}s ({new_disabled} still disabled)")
                time.sleep(1)  # Let React settle
                return True

        # Check for error messages (TIN not found, etc.)
        error_msg = page.evaluate("""() => {
            const err = document.querySelector('.error, [class*="error"], [class*="alert"], p[style*="color: red"], p[style*="color:red"]');
            return err ? err.textContent?.trim() : null;
        }""")
        if error_msg:
            print(f"[Validate Gate] Validation error: {error_msg}")
        else:
            print("[Validate Gate] Fields did not unlock after 10s")
        return True  # We handled the gate, even if validation failed

    except Exception as e:
        print(f"[Validate Gate] Error: {e}")
        return False


def prefill_all(page: Page, buyer: dict, receipt: dict):
    """Pre-fill phone, native selects, and text inputs via label matching."""
    state = buyer["state"]
    city = buyer["city"]

    # 0. Select "Company" if Individual/Company toggle exists (B2B — always Company)
    # Must run FIRST because toggling reveals company-specific fields (Company Name, BRN, etc.)
    try:
        # Radio buttons or toggle (text-based: "Company", "Syarikat")
        for label_text in ["Company", "Syarikat", "Business"]:
            radio = page.locator(f'label:has-text("{label_text}") input[type="radio"], input[type="radio"][value*="company" i], input[type="radio"][value*="Company"]').first
            if radio.count() > 0 and not radio.is_checked():
                radio.click(timeout=3000)
                print(f"[Pre-fill] Selected '{label_text}' radio")
                time.sleep(1)  # Wait for company fields to appear
                break
        # Also try clickable div/button toggles (e.g. FamilyMart "Claim as" toggle)
        for toggle_text in ["Company", "Syarikat", "Business"]:
            toggle = page.locator(f'button:has-text("{toggle_text}"), [role="tab"]:has-text("{toggle_text}"), [class*="toggle"]:has-text("{toggle_text}"), [class*="tab"]:has-text("{toggle_text}")').first
            if toggle.count() > 0 and toggle.is_visible():
                # Only click if not already active/selected
                is_active = toggle.evaluate("""el => {
                    return el.classList.contains('active') || el.classList.contains('selected')
                        || el.getAttribute('aria-selected') === 'true' || el.getAttribute('data-state') === 'active'
                        || el.closest('[class*="active"]') !== null;
                }""")
                if not is_active:
                    toggle.click(timeout=3000)
                    print(f"[Pre-fill] Clicked '{toggle_text}' toggle")
                    time.sleep(1)
                break
    except Exception as e:
        print(f"[Pre-fill] Company toggle: {e}")

    # 1. Phone — tel inputs + text inputs with phone labels
    # Detect react-phone-input: if tel input is inside a container with a flag/country code dropdown,
    # use phoneShort (no leading 0) since the widget adds +60 prefix.
    for inp in page.locator('input[type="tel"]').all():
        is_phone_widget = page.evaluate("""(el) => {
            const container = el.closest('[class*="phone"], [class*="tel"], [class*="intl"]') || el.parentElement;
            return !!(container && (container.querySelector('.flag, [class*="flag"], [class*="country"], .selected-flag, [class*="dial"]')));
        }""", inp.element_handle())
        phone_val = buyer.get("phoneShort", buyer["phone"]) if is_phone_widget else buyer["phone"]
        inp.click(click_count=3, timeout=3000)
        page.keyboard.type(phone_val, delay=20)
        print(f"[Pre-fill] Phone (tel{'—widget' if is_phone_widget else ''}): {phone_val}")
        break

    phone_ids = page.evaluate("""() => {
        return Array.from(document.querySelectorAll('input[type="text"], input:not([type])'))
            .filter(i => {
                const l = (i.closest('label')?.textContent || document.querySelector('label[for="'+i.id+'"]')?.textContent || i.name || '').toLowerCase();
                return (l.includes('phone') || l.includes('mobile')) && !i.value;
            }).map(i => i.id || i.name).filter(Boolean);
    }""")
    for pid in phone_ids:
        try:
            page.locator(f"#{pid}, input[name='{pid}']").first.click(click_count=3, timeout=2000)
            page.keyboard.type(buyer["phone"], delay=20)
            print(f"[Pre-fill] Phone (text): {pid}")
        except Exception:
            pass

    # 2. Native <select> dropdowns
    selects = page.evaluate("""(args) => {
        return Array.from(document.querySelectorAll('select')).map(s => ({
            name: s.name || s.id || '',
            label: (s.closest('label')?.textContent || document.querySelector('label[for="'+s.id+'"]')?.textContent || s.name || '').toLowerCase(),
            value: s.value,
            options: Array.from(s.options).map(o => ({v: o.value, t: o.textContent?.trim() || ''})),
        })).filter(s => s.options.length > 1);
    }""", {"state": state, "city": city})

    select_rules = [
        (["state", "negeri"], state), (["city", "bandar"], city),
        (["country", "negara", "billing country"], "Malaysia"),
        (["industry", "sector"], "Others"),
        (["salut"], "Mr"),
        (["contact method", "preferred"], "Email"),
    ]
    for sel in selects:
        if sel["value"] and sel["value"] not in ("", "-None-"):
            continue
        matched = False
        selector = f"select[name='{sel['name']}'], select[id='{sel['name']}']"
        for keywords, target in select_rules:
            if any(k in sel["label"] for k in keywords):
                opt = next((o for o in sel["options"] if target.lower() in o["t"].lower()), None)
                if not opt:
                    opt = next((o for o in sel["options"][1:] if o["v"]), None)
                if opt:
                    page.select_option(selector, opt["v"])
                    print(f"[Pre-fill] Select '{sel['name']}' → '{opt['t']}'")
                    matched = True
                break
        # Catch-all: any unfilled required select → pick first non-empty option
        if not matched and sel["options"]:
            fallback = next((o for o in sel["options"] if o["v"] and o["v"] != "-None-"), None)
            if fallback:
                page.select_option(selector, fallback["v"])
                print(f"[Pre-fill] Select '{sel['name']}' → '{fallback['t']}' (catch-all)")

    # 3. Bulk text inputs via label matching
    # Keys that must overwrite even if field already has a value (e.g. form defaults like abc@example.com)
    force_overwrite_keys = {"email", "e-invoice email", "einvoice email", "email address", "your company email", "confirm email"}
    label_map = {
        "company name": buyer["name"], "business name": buyer["name"],
        "personal / company name": buyer["name"], "personal/company name": buyer["name"],
        "tax identification": buyer["tin"], "tin": buyer["tin"],
        "business registration": buyer["brn"], "new business": buyer["brn"],
        "e-invoice email": buyer["email"], "einvoice email": buyer["email"],
        "email address": buyer["email"], "your company email": buyer["email"],
        "email": buyer["email"], "confirm email": buyer["email"],
        "full name": buyer["userName"], "first name": buyer["userName"].split()[0],
        "last name": " ".join(buyer["userName"].split()[1:]) or "",
        "company address": buyer["address"], "address": buyer["address"],
        "address line 1": buyer["address"],
        "city": city, "postcode": "47100", "postal": "47100",
        "state": state, "country": "Malaysia",
        "invoice no": receipt.get("referenceNumber", ""),
        "order number": receipt.get("referenceNumber", ""),
        "receipt number": receipt.get("referenceNumber", ""),
        "payment date": receipt.get("date", ""),
        "invoice amount": str(receipt.get("totalAmount", "")),
    }
    force_keys_json = json.dumps(list(force_overwrite_keys))
    count = page.evaluate("""([mapping, forceKeys]) => {
        const forceSet = new Set(forceKeys);
        let n = 0;
        document.querySelectorAll('input[type="text"], input[type="email"], input[type="number"], input:not([type]), textarea').forEach(el => {
            if (el.type === 'hidden' || !el.offsetParent || el.disabled) return;
            const label = (el.closest('label')?.textContent || document.querySelector('label[for="'+el.id+'"]')?.textContent || el.placeholder || el.name || '').toLowerCase();
            for (const [key, value] of Object.entries(mapping)) {
                if (value && label.includes(key)) {
                    // Skip non-empty fields UNLESS the key is in forceSet (e.g. email must overwrite defaults)
                    if (el.value && !forceSet.has(key)) break;
                    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
                              || Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
                    if (setter) { setter.call(el, value); el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); n++; }
                    break;
                }
            }
        });
        return n;
    }""", [label_map, json.loads(force_keys_json)])
    print(f"[Pre-fill] Bulk filled {count} text inputs")


def prefill_radix_dropdown(page: Page, trigger_text: str, target: str) -> bool:
    """Select a value in a Radix UI Select dropdown via keyboard navigation."""
    trigger = page.get_by_role("combobox", name=trigger_text).first
    if trigger.count() == 0:
        return False

    page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
    time.sleep(0.5)
    trigger.scroll_into_view_if_needed(timeout=5000)
    time.sleep(0.5)

    for attempt in range(2):
        trigger.focus(timeout=5000)
        page.keyboard.press("Space")
        time.sleep(1)

        options = page.evaluate("() => Array.from(document.querySelectorAll('[role=\"option\"]')).map(e => e.textContent?.trim() || '')")
        idx = next((i for i, t in enumerate(options) if target.lower() in t.lower()), -1)
        if idx < 0:
            page.keyboard.press("Escape")
            continue

        presses = idx + attempt  # +attempt for off-by-one retry
        for _ in range(presses):
            page.keyboard.press("ArrowDown")
            time.sleep(0.08)
        page.keyboard.press("Space")
        time.sleep(1.5)

        # Verify with page.evaluate (locator becomes stale after text change)
        texts = page.evaluate("() => Array.from(document.querySelectorAll('[role=\"combobox\"]')).map(e => e.textContent?.trim() || '')")
        if any(target.lower() in t.lower() for t in texts):
            print(f"[Pre-fill] Radix '{trigger_text}' → '{target}' ✓")
            return True
        page.keyboard.press("Escape")
        time.sleep(0.3)
    return False


def prefill_custom_dropdowns(page: Page, buyer: dict):
    """Handle non-native, non-Radix cascading dropdowns (Country → State → City).
    Strategy: find dropdown trigger by label, click to open, type to filter, then select.
    Must be done top-down: Country FIRST → State → City (each parent populates child)."""

    cascading_fields = [
        ("country", "Malaysia"),
        ("state", buyer["state"]),
        ("city", buyer["city"]),
    ]

    for label_hint, target_value in cascading_fields:
        if not target_value:
            continue
        try:
            # 1. Find clickable dropdown trigger near the label
            #    Handles: div-based custom dropdowns, react-select, ant-select, etc.
            opened = page.evaluate("""([hint, targetVal]) => {
                // Find all elements whose associated label matches the hint
                const labels = Array.from(document.querySelectorAll('label'));
                const matchLabel = labels.find(l => l.textContent?.toLowerCase().includes(hint));
                if (!matchLabel) return { found: false };

                // Check sibling/nearby elements for dropdown trigger
                const container = matchLabel.closest('.form-group, .field, [class*="field"], [class*="form-row"]')
                                || matchLabel.parentElement;
                if (!container) return { found: false };

                // Try: native <select> (already handled by prefill_all, but re-check in cascade context)
                const sel = container.querySelector('select');
                if (sel) {
                    const opt = Array.from(sel.options).find(o => o.textContent?.toLowerCase().includes(targetVal.toLowerCase()));
                    if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', {bubbles:true})); return { found: true, type: 'native_select', value: opt.textContent }; }
                }

                // Try: clickable div/span/button that acts as dropdown trigger
                const triggers = container.querySelectorAll('[class*="select"], [class*="dropdown"], [role="combobox"], [role="listbox"], button, [class*="trigger"]');
                for (const t of triggers) {
                    if (t.offsetParent) { t.click(); return { found: true, type: 'custom_trigger', element: t.tagName }; }
                }

                return { found: false };
            }""", [label_hint, target_value])

            if not opened or not opened.get("found"):
                continue

            if opened.get("type") == "native_select":
                print(f"[Pre-fill] Cascade select '{label_hint}' → '{opened.get('value', target_value)}' ✓")
                time.sleep(1)  # Wait for child dropdown to populate
                continue

            # 2. Dropdown opened — type to filter
            time.sleep(0.5)
            page.keyboard.type(target_value, delay=30)
            time.sleep(0.8)

            # 3. Select the matching option (try multiple patterns)
            selected = page.evaluate("""(targetVal) => {
                // Look for visible option/listitem matching the target
                const candidates = document.querySelectorAll('[role="option"], [role="listbox"] li, .option, [class*="option"], [class*="menu-item"], li');
                for (const c of candidates) {
                    if (!c.offsetParent) continue;
                    if (c.textContent?.toLowerCase().includes(targetVal.toLowerCase())) {
                        c.click();
                        return true;
                    }
                }
                return false;
            }""", target_value)

            if selected:
                print(f"[Pre-fill] Cascade dropdown '{label_hint}' → '{target_value}' ✓")
            else:
                # Fallback: press Enter to select first filtered result
                page.keyboard.press("Enter")
                print(f"[Pre-fill] Cascade dropdown '{label_hint}' → '{target_value}' (Enter fallback)")

            time.sleep(1.5)  # Wait for child dropdown to populate before next cascade level

        except Exception as e:
            print(f"[Pre-fill] Cascade dropdown '{label_hint}' failed: {e}")


# ── Receipt image upload ──────────────────────────────────

def upload_receipt_image(page: Page, local_path: str) -> bool:
    """Find file input on the page and upload the receipt image via Playwright.
    Handles both visible and hidden <input type="file"> elements.
    Returns True if upload was performed."""
    try:
        # Find all file inputs (visible or hidden — many forms hide the real input behind a styled button)
        file_inputs = page.locator('input[type="file"]')
        count = file_inputs.count()
        if count == 0:
            print("[Upload] No file input found on page")
            return False

        # Use the first file input (most forms have just one)
        file_input = file_inputs.first
        file_input.set_input_files(local_path)
        print(f"[Upload] Receipt image uploaded via input[type=file] ({local_path})")
        time.sleep(1)  # Wait for upload preview/processing
        return True
    except Exception as e:
        print(f"[Upload] Failed: {e}")
        return False


# ── CUA action executor ────────────────────────────────────

def execute_action(page: Page, name: str, args: dict):
    """Execute a single Gemini CUA action on the page."""
    def d(val, dim):
        return round((val / 1000) * dim)

    if name == "click_at":
        page.mouse.click(d(args["x"], SCREEN_W), d(args["y"], SCREEN_H))
    elif name == "type_text_at":
        x, y = d(args["x"], SCREEN_W), d(args["y"], SCREEN_H)
        page.mouse.click(x, y)
        if args.get("clear_before_typing", True):
            page.keyboard.press("Control+A")
            page.keyboard.press("Backspace")
        page.keyboard.type(args.get("text", ""), delay=30)
        if args.get("press_enter"):
            page.keyboard.press("Enter")
    elif name == "scroll_document":
        page.mouse.wheel(0, -300 if args.get("direction") == "up" else 300)
    elif name == "scroll_at":
        page.mouse.move(d(args["x"], SCREEN_W), d(args["y"], SCREEN_H))
        mag = d(args.get("magnitude", 800), SCREEN_H)
        page.mouse.wheel(0, -mag if args.get("direction") == "up" else mag)
    elif name == "hover_at":
        page.mouse.move(d(args["x"], SCREEN_W), d(args["y"], SCREEN_H))
    elif name == "key_combination":
        raw = args.get("keys", "")
        # Normalize CUA key names → Playwright format (e.g. "control+a" → "Control+A", "backspace" → "Backspace")
        key_map = {"control": "Control", "ctrl": "Control", "shift": "Shift", "alt": "Alt", "meta": "Meta",
                   "backspace": "Backspace", "delete": "Delete", "enter": "Enter", "escape": "Escape",
                   "tab": "Tab", "space": "Space", "arrowup": "ArrowUp", "arrowdown": "ArrowDown",
                   "arrowleft": "ArrowLeft", "arrowright": "ArrowRight", "home": "Home", "end": "End"}
        parts = [key_map.get(p.strip().lower(), p.strip()) for p in raw.split("+")]
        normalized = "+".join(parts)
        page.keyboard.press(normalized)
    elif name in ("open_web_browser", "wait_5_seconds"):
        if name == "wait_5_seconds":
            time.sleep(5)
    elif name == "go_back":
        page.go_back(timeout=10000)
    try:
        page.wait_for_load_state("networkidle", timeout=3000)
    except Exception:
        pass
    time.sleep(0.5)


# ── Post-submit verification ────────────────────────────────

def verify_submission(page: Page) -> bool:
    """After clicking Submit, verify the form was accepted (not validation error)."""
    try:
        shot = base64.b64encode(page.screenshot(type="png")).decode()
        result = gemini_flash(
            "Look at this page after a form was submitted. Classify the result:\n"
            "- SUCCESS: Page shows a thank you/confirmation message, or redirected to a success page\n"
            "- VALIDATION_ERROR: Page shows form validation errors (red text, required fields, etc.)\n"
            "- UNKNOWN: Can't determine\n\n"
            "Respond with just one word: SUCCESS, VALIDATION_ERROR, or UNKNOWN",
            shot,
        )
        status = result.strip().upper().split()[0] if result else "UNKNOWN"
        print(f"[Verify] Post-submit: {status}")
        if status == "VALIDATION_ERROR":
            # Log what errors are visible
            errors = gemini_flash("List any validation error messages visible on this form page. Be brief.", shot)
            print(f"[Verify] Errors: {errors[:200]}")
        return status == "SUCCESS"
    except Exception as e:
        print(f"[Verify] Failed: {e}")
        return True  # Optimistic — assume success if verification fails


def verify_submission_dom(page: Page) -> bool:
    """DOM-based post-submit verification for DevExtreme forms.

    Checks the actual DOM for validation errors, success messages, and page changes.
    More reliable than screenshot + Gemini for forms with known UI frameworks.
    """
    try:
        time.sleep(2)  # let page settle after submit

        result = page.evaluate("""() => {
            const errors = [];
            const successes = [];

            // DevExtreme validation errors
            document.querySelectorAll('.dx-invalid-message, .dx-validation-summary-item').forEach(el => {
                const t = el.textContent?.trim();
                if (t) errors.push(t);
            });

            // Generic toast/alert errors (short text only — long text is likely dropdown lists)
            document.querySelectorAll('[role="alert"], .toast-error, .error-message').forEach(el => {
                const t = el.textContent?.trim();
                if (t && t.length < 100) {
                    const tl = t.toLowerCase();
                    if (tl.includes('error') || tl.includes('cannot') || tl.includes('invalid') || tl.includes('required') || tl.includes('failed'))
                        errors.push(t);
                }
            });

            // DevExtreme-specific visible validation errors (red text under fields)
            document.querySelectorAll('.dx-invalid-message-content, .dx-validationsummary .dx-item-content').forEach(el => {
                const t = el.textContent?.trim();
                if (t && t.length < 100) errors.push(t);
            });

            // Success indicators
            const bodyText = document.body.innerText.toLowerCase();
            const successKeywords = ['thank you', 'successfully', 'submitted', 'confirmed', 'request received', 'invoice request'];
            for (const kw of successKeywords) {
                if (bodyText.includes(kw)) successes.push(kw);
            }

            // Check if form is still visible (if form gone → likely redirected to success)
            const formVisible = !!document.querySelector('form:not([style*="display: none"])');

            // Check URL change (some forms redirect on success)
            const url = window.location.href;

            return { errors, successes, formVisible, url };
        }""")

        errors = result.get("errors", [])
        successes = result.get("successes", [])
        form_visible = result.get("formVisible", True)

        print(f"[Verify DOM] errors={errors[:3]}, successes={successes}, formVisible={form_visible}")

        # Clear-cut cases: don't need Gemini
        if errors and not successes:
            print(f"[Verify DOM] FAILED — validation errors: {errors[:3]}")
            return False

        if successes and not errors and not form_visible:
            print(f"[Verify DOM] SUCCESS — success keywords + form gone")
            return True

        # Ambiguous: combine DOM context + screenshot for Gemini to judge
        try:
            shot = base64.b64encode(page.screenshot(type="png", full_page=True)).decode()
            dom_context = (
                f"DOM errors: {errors[:3] if errors else 'none'}\n"
                f"DOM success keywords: {successes if successes else 'none'}\n"
                f"Form still visible: {form_visible}"
            )
            result = gemini_flash(
                f"A form was just submitted. Determine if it succeeded.\n\n"
                f"DOM ANALYSIS:\n{dom_context}\n\n"
                f"RULES:\n"
                f"- SUCCESS: Page shows thank you / confirmation / receipt number, OR page redirected away from form\n"
                f"- FAILED: Validation errors visible (red text, 'cannot be empty', 'required', 'invalid')\n"
                f"- If the page still shows the same form with all fields but NO error messages, it likely succeeded (form may stay visible after submit)\n\n"
                f"Respond in JSON: {{\"success\": true/false, \"reason\": \"brief explanation\"}}",
                shot,
            )
            json_match = re.search(r'\{[\s\S]*?\}', result)
            if json_match:
                vdata = json.loads(json_match.group())
                success = vdata.get("success", False)
                reason = vdata.get("reason", "")
                print(f"[Verify DOM+Flash] success={success}, reason={reason[:100]}")
                return success
        except Exception as flash_e:
            print(f"[Verify DOM+Flash] Gemini failed: {flash_e}")

        # Last resort: if we have success signals from DOM, trust them
        if successes:
            return True
        # If DOM found errors, trust that
        if errors:
            return False
        # Truly unknown — optimistic (OTP was accepted, submit clicked)
        print("[Verify DOM] No signals at all — optimistic success")
        return True

    except Exception as e:
        print(f"[Verify DOM] Failed: {e}")
        return verify_submission(page)


# ── OTP email helpers ──────────────────────────────────────
# Future: For SMS OTP merchants, use AWS Pinpoint (MY supports 2-way SMS via short codes)
# Architecture: Pinpoint → SNS → Lambda → same poll pattern, different S3 prefix

def extract_otp_code(raw_email: str) -> Optional[str]:
    """Extract 6-digit OTP/TAC code from raw email content."""
    # Priority 1: Labeled codes (OTP, TAC, verification code)
    m = re.search(r'(?:OTP|TAC|verification\s+code|one.time\s+password)[:\s]*(\d{6})', raw_email, re.IGNORECASE)
    if m:
        return m.group(1)

    # Priority 2: HTML-wrapped standalone 6-digit (e.g. <b>123456</b> or <span>123456</span>)
    m = re.search(r'>\s*(\d{6})\s*<', raw_email)
    if m:
        return m.group(1)

    # Priority 3: 6-digit near verification keywords
    for keyword in ['verify', 'code', 'access', 'confirm', 'enter', 'submit']:
        pattern = rf'(?:{keyword}).{{0,80}}(\d{{6}})|(\d{{6}}).{{0,80}}(?:{keyword})'
        m = re.search(pattern, raw_email, re.IGNORECASE | re.DOTALL)
        if m:
            return m.group(1) or m.group(2)

    return None


def poll_otp_email(email_ref: str, timeout: int = 60) -> Optional[str]:
    """Poll S3 for OTP email matching the given email_ref. Returns OTP code or None."""
    import boto3 as _boto3
    from email import message_from_bytes

    s3 = _boto3.client("s3")
    bucket = "finanseal-bucket"
    prefix = "ses-emails/einvoice/"
    cutoff = time.time() - 120  # only check emails from last 2 minutes

    print(f"[OTP] Polling for OTP email: einvoice[+.]{email_ref}@... (timeout={timeout}s)")

    for attempt in range(timeout // 5):
        try:
            resp = s3.list_objects_v2(Bucket=bucket, Prefix=prefix, MaxKeys=20)
            objects = sorted(
                [o for o in resp.get("Contents", []) if o["LastModified"].timestamp() > cutoff],
                key=lambda o: o["LastModified"],
                reverse=True,  # newest first
            )

            for obj in objects:
                try:
                    email_bytes = s3.get_object(Bucket=bucket, Key=obj["Key"])["Body"].read()
                    msg = message_from_bytes(email_bytes)

                    # Check To: header contains our emailRef
                    to_header = msg.get("To", "")
                    # Match both + and . formats: einvoice+ref@ or einvoice.ref@
                    to_lower = to_header.lower()
                    if f"einvoice+{email_ref}@" not in to_lower and f"einvoice.{email_ref}@" not in to_lower:
                        continue

                    # Extract body text
                    body = ""
                    if msg.is_multipart():
                        for part in msg.walk():
                            ct = part.get_content_type()
                            if ct in ("text/plain", "text/html"):
                                payload = part.get_payload(decode=True)
                                if payload:
                                    body += payload.decode("utf-8", errors="ignore")
                    else:
                        payload = msg.get_payload(decode=True)
                        if payload:
                            body = payload.decode("utf-8", errors="ignore")

                    code = extract_otp_code(body)
                    if code:
                        print(f"[OTP] Found OTP code: {code} (from {obj['Key']})")
                        return code
                    else:
                        print(f"[OTP] Email matched ref but no OTP found in body")
                except Exception as inner_e:
                    print(f"[OTP] Error reading {obj['Key']}: {inner_e}")
                    continue

        except Exception as e:
            print(f"[OTP] S3 list error: {e}")

        if attempt < (timeout // 5) - 1:
            print(f"[OTP] No OTP yet, retrying in 5s... ({(attempt+1)*5}/{timeout}s)")
            time.sleep(5)

    print(f"[OTP] Timeout — no OTP email found after {timeout}s")
    return None


# ── Tier 1: Fast path with saved formConfig ────────────────

def _infer_buyer_key(selector: str, label: str) -> str:
    """Infer buyerDetailKey from CSS selector name or label when formConfig doesn't have one.
    This fixes stale defaultValues saved by extract_form_config."""
    # Extract the field name from CSS selector (e.g. input[name="idNumber"] → "idnumber")
    import re as _re
    field_name_match = _re.search(r'name=.([^"\'\]]+)', selector)
    field_name = field_name_match.group(1).lower() if field_name_match else ""
    hint = (field_name + " " + label).lower()

    # Order matters: more specific patterns first to avoid false positives
    if "idnumber" in hint or ("brn" in hint and "old" not in hint) or "registrationnumber" in hint:
        return "brn"
    if "tin" in hint or "taxidentif" in hint:
        return "tin"
    if "email" in hint and "confirm" not in hint:
        return "email"
    if "companyname" in hint or "company_name" in hint:
        return "name"
    if "fullname" in hint or "full_name" in hint:
        return "userName"
    if "companyaddress" in hint or ("address" in hint and "line" not in hint):
        return "address"
    if "phone" in hint or "mobile" in hint:
        return "phone"
    return ""


def run_tier1(page: Page, config: dict, buyer: dict) -> bool:
    """Fill form using saved CSS selectors. Returns True only if enough fields filled + submitted."""
    fields = config.get("fields", [])
    filled = 0
    for f in fields:
        # Prefer explicit buyerDetailKey; if missing, infer from selector/label
        key = f.get("buyerDetailKey", "")
        if not key:
            key = _infer_buyer_key(f.get("selector", ""), f.get("label", ""))
        val = buyer.get(key, "") if key else ""
        # Fall back to defaultValue only if buyer key doesn't resolve
        if not val:
            val = f.get("defaultValue", "")
        if not val:
            continue
        try:
            el = page.locator(f["selector"]).first
            if el.count() == 0:
                print(f"[Tier 1] Selector not found: {f['selector']}")
                continue
            ftype = f.get("type", "text")
            if ftype == "text":
                el.fill(val, timeout=5000)
            elif ftype == "select":
                page.select_option(f["selector"], label=val)
            elif ftype == "checkbox":
                el.click(timeout=3000)
            filled += 1
            print(f"[Tier 1] {f.get('label', '?')} → '{val[:60]}'")
        except Exception as e:
            print(f"[Tier 1] Failed '{f.get('label', '?')}': {e}")

    min_required = max(3, len(fields) // 2)
    if filled < min_required:
        print(f"[Tier 1] Only filled {filled}/{len(fields)} (need {min_required}) — falling back")
        return False

    # Submit + verify
    sel = config.get("submitSelector", "")
    if sel:
        try:
            page.locator(sel).first.click(timeout=5000)
            print(f"[Tier 1] Clicked Submit ({filled} fields)")
            time.sleep(5)
            return verify_submission(page)
        except Exception:
            pass
    return False


# ── 99 Speed Mart dedicated flow ──────────────────────────

def _dx_select_option(page: Page, combobox_name: str, option_text: str) -> bool:
    """Open a DevExtreme combobox by accessible name, select option containing text."""
    try:
        # Open dropdown via the "Select" button adjacent to the combobox
        cb = page.get_by_role("combobox", name=re.compile(combobox_name, re.IGNORECASE)).first
        if cb.count() == 0:
            print(f"[99SM] Combobox '{combobox_name}' not found")
            return False
        cb.click(timeout=5000)
        time.sleep(0.8)

        # Click matching option from listbox
        option = page.get_by_role("option", name=re.compile(option_text, re.IGNORECASE)).first
        if option.count() > 0:
            option.click(timeout=3000)
            print(f"[99SM] Selected '{combobox_name}' → '{option_text}'")
            time.sleep(0.5)
            return True

        # Fallback: type to filter then click
        page.keyboard.type(option_text[:4], delay=50)
        time.sleep(0.8)
        option = page.get_by_role("option", name=re.compile(option_text, re.IGNORECASE)).first
        if option.count() > 0:
            option.click(timeout=3000)
            print(f"[99SM] Selected '{combobox_name}' → '{option_text}' (typed)")
            time.sleep(0.5)
            return True

        page.keyboard.press("Escape")
        print(f"[99SM] Option '{option_text}' not found in '{combobox_name}'")
        return False
    except Exception as e:
        print(f"[99SM] Dropdown '{combobox_name}' failed: {e}")
        try:
            page.keyboard.press("Escape")
        except Exception:
            pass
        return False


def _dx_fill_textbox(page: Page, label_name: str, value: str) -> bool:
    """Fill a DevExtreme textbox by accessible name using keyboard typing.

    DevExtreme widgets ignore Playwright's .fill() because they bind to keyboard
    events, not the native DOM value property. Must use click → select all → type.
    """
    try:
        tb = page.get_by_role("textbox", name=re.compile(label_name, re.IGNORECASE)).first
        if tb.count() == 0:
            # Also try spinbutton (DevExtreme numeric fields like OTP)
            tb = page.get_by_role("spinbutton", name=re.compile(label_name, re.IGNORECASE)).first
        if tb.count() == 0:
            print(f"[99SM] Textbox '{label_name}' not found")
            return False
        if tb.is_disabled():
            print(f"[99SM] Textbox '{label_name}' is disabled — skipping")
            return False
        tb.click(timeout=3000)
        page.keyboard.press("Control+A")
        page.keyboard.press("Backspace")
        page.keyboard.type(value, delay=30)
        # Tab out to trigger DevExtreme's onValueChanged
        page.keyboard.press("Tab")
        time.sleep(0.3)
        print(f"[99SM] Filled '{label_name}' → '{value[:60]}'")
        return True
    except Exception as e:
        print(f"[99SM] Fill '{label_name}' failed: {e}")
        return False


def run_99speedmart_flow(page: Page, buyer: dict, email_ref: str) -> bool:
    """Dedicated form fill for 99 Speed Mart (99einvoice.com). Returns True on success.

    Form structure (from live DOM inspection):
    - Page 1: Receipt Details (pre-filled, read-only) + "Next" button
    - Page 2: Customer Details form with DevExtreme widgets:
        - Customer Identification Type (combobox): "_ Business registration number"
        - Customer Identification Number (textbox): BRN
        - Customer TIN (textbox): TIN
        - [Validate] button → unlocks remaining fields
        - Customer Name (auto-filled after validate), SST, Email, Contact,
          Address 1/2/3, Postal Zone, City, State (combobox), Country (combobox)
        - OTP (spinbutton), [Request OTP] button, [Submit] button
    """
    # Use dot instead of + in email — many merchant forms reject + as invalid character
    system_email = f"einvoice.{email_ref}@einv.hellogroot.com"
    print(f"[99SM] Starting 99 Speed Mart flow, email={system_email}")

    try:
        # Step 1: Receipt page — click "Next" button
        print("[99SM] Step 1: Click Next on receipt page")
        next_btn = page.get_by_role("button", name="Next")
        if next_btn.count() > 0:
            next_btn.click(timeout=10000)
            time.sleep(2)
            try:
                page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                pass
        else:
            print("[99SM] No Next button found — may already be on form page")
        time.sleep(1)

        # Step 2: Validate identity (BRN + TIN)
        print("[99SM] Step 2: Validate identity (BRN + TIN)")

        # Select ID Type: "Business registration number" (option text has "_ " prefix in DOM)
        _dx_select_option(page, "Customer Identification Type", "Business registration")

        # Fill ID Number (BRN) and TIN
        _dx_fill_textbox(page, "Customer Identification Number", buyer["brn"])
        _dx_fill_textbox(page, "Customer TIN", buyer["tin"])

        # Click Validate → wait for fields to unlock
        validate_btn = page.get_by_role("button", name="Validate")
        if validate_btn.count() > 0:
            validate_btn.click(timeout=5000)
            print("[99SM] Clicked Validate")
            time.sleep(3)

            # Wait for Customer Email field to become enabled (up to 15s)
            for i in range(15):
                email_field = page.get_by_role("textbox", name=re.compile("Customer Email", re.IGNORECASE)).first
                if email_field.count() > 0 and not email_field.is_disabled():
                    print(f"[99SM] Fields enabled after {i+1}s")
                    break
                time.sleep(1)
            else:
                print("[99SM] Warning: Fields still disabled after 15s — validation may have failed")
                # Take screenshot for debugging
                try:
                    shot = base64.b64encode(page.screenshot(type="png", full_page=True)).decode()
                    desc = gemini_flash("Describe what you see on this form page. Any error messages? Is there a validation failure?", shot)
                    print(f"[99SM] Debug screenshot: {desc[:200]}")
                except Exception:
                    pass
                return False

        # Step 3: Fill customer details (fields now enabled)
        print("[99SM] Step 3: Fill customer details")

        # Customer Name — unlocked by validation but not auto-populated
        _dx_fill_textbox(page, "Customer Name", buyer["name"])
        _dx_fill_textbox(page, "Customer Email", system_email)
        _dx_fill_textbox(page, "Customer Contact Number", buyer["phone"])
        _dx_fill_textbox(page, "Customer Address 1", buyer["address"])
        _dx_fill_textbox(page, "Customer Postal Zone", "47100")
        _dx_fill_textbox(page, "Customer City", buyer["city"])

        # State + Country are combobox dropdowns
        _dx_select_option(page, "Customer State", buyer["state"])
        _dx_select_option(page, "Customer Country", "Malaysia")

        # Step 4: OTP flow — retry up to 3 times (99SM email delivery can be slow/flaky)
        print("[99SM] Step 4: Request OTP")
        otp_code = None
        for otp_attempt in range(3):
            otp_btn = page.get_by_role("button", name="Request OTP")
            if otp_btn.count() == 0 or otp_btn.is_disabled():
                print(f"[99SM] Request OTP button not found or disabled (attempt {otp_attempt+1})")
                if otp_attempt == 0:
                    return False
                break

            otp_btn.click(timeout=5000)
            print(f"[99SM] Clicked Request OTP (attempt {otp_attempt+1}/3) — polling for email...")
            time.sleep(3)

            otp_code = poll_otp_email(email_ref, timeout=45)
            if otp_code:
                break
            print(f"[99SM] OTP not received on attempt {otp_attempt+1} — will retry")
            time.sleep(5)  # brief pause before retry

        if not otp_code:
            print("[99SM] OTP polling failed after 3 attempts — no code received")
            return False

        # OTP field is a spinbutton in this form
        _dx_fill_textbox(page, "OTP", otp_code)

        # Click Submit
        submit_btn = page.get_by_role("button", name="Submit")
        if submit_btn.count() > 0:
            submit_btn.click(timeout=5000)
            print("[99SM] Clicked Submit")
            time.sleep(5)
        else:
            print("[99SM] Submit button not found!")
            return False

        # Verify submission — DOM-based check first, Gemini Flash fallback
        return verify_submission_dom(page)

    except Exception as e:
        print(f"[99SM] Flow failed: {e}")
        traceback.print_exc()
        return False


# ── Tier 2: Gemini CUA exploration ─────────────────────────

def run_tier2(page: Page, buyer: dict, receipt: dict, receipt_image_b64: str | None = None, merchant_hints: str = "") -> int:
    """CUA fills the form visually. Returns action count."""
    # Recon: Gemini Flash scouts the full page
    recon = ""
    try:
        full_b64 = base64.b64encode(page.screenshot(type="png", full_page=True)).decode()
        recon = gemini_flash(
            "List EVERY visible form field top-to-bottom:\n"
            "Format: N. [label] — [type: text/dropdown/radio/checkbox/date] — [status: empty/pre-filled]\n"
            "Be thorough. Include pre-filled fields.",
            full_b64,
        )
        print(f"[Recon] {recon[:200]}...")
    except Exception as e:
        print(f"[Recon] Failed: {e}")

    # Build CUA instruction
    instruction = f"""You are filling a merchant e-invoice buyer details form for a MALAYSIAN B2B (business-to-business) transaction.
This is an LHDN (Lembaga Hasil Dalam Negeri) e-invoice request — the buyer is always a COMPANY, never an individual.
Many fields are ALREADY PRE-FILLED. Only fill empty or incorrect fields.

CONTEXT:
- Always select "Company" / "Syarikat" / "Business" if there is an Individual/Company choice. NEVER select "Individual" / "Peribadi".
- ID Type should be "BRN" (Business Registration Number) or "TIN" (Tax Identification Number), not NRIC/Passport.
- Country is always Malaysia.

BUYER DETAILS (use for buyer/customer fields):
- Full Name: {buyer["userName"]}
- Email: {buyer["email"]}
- Phone: {buyer["phoneRaw"]} (international) / {buyer["phoneLocal"]} (local with 0) / {buyer["phoneShort"]} (without 0, for fields with country code +60 prefix)
- Company: {buyer["name"]}
- BRN: {buyer["brn"]}  |  TIN: {buyer["tin"]}
- Address: {buyer["address"]}, {buyer["city"]}, 47100, {buyer["state"]}, Malaysia

RECEIPT DATA (use for receipt/bill/store fields):
- Store Code / Shop Number: {receipt.get("storeCode", "N/A")}
- Bill Number / Tax Invoice No: {receipt.get("referenceNumber", "N/A")}
- Total Amount: {receipt.get("totalAmount", "N/A")}
- Currency: {receipt.get("currency", "MYR")}
- Date: {receipt.get("transactionDate", "N/A")}
- Vendor/Store Name: {receipt.get("vendorName", "N/A")}

{f"FORM FIELDS (from page analysis):\\n{recon}" if recon else ""}

{f"MERCHANT-SPECIFIC INSTRUCTIONS (learned from previous submissions):\\n{merchant_hints}" if merchant_hints else ""}

BUYER PROFILE SELECTION (CRITICAL — saves 5+ minutes):
- If the form has a "Select Buyer" dropdown or "Buyer Profile" list/table, FIRST look for an EXISTING profile that matches.
- Match by TIN "{buyer["tin"]}" (most reliable — check the TIN column). The profile name may differ from the company name above (e.g. user may have registered as "Groot Test Account" instead of "{buyer["name"]}").
- If a profile with matching TIN exists: SELECT it. Do NOT create a new one. Skip straight to filling receipt details.
- Only create a new buyer profile if NO existing profile has a matching TIN.
- After selecting or creating the buyer profile, proceed to fill the receipt/form fields.

TASK:
1. If the form asks for Store Code / Shop Number, use the Store Code from RECEIPT DATA.
2. Fill Bill Number / Receipt Number with the Tax Invoice No from RECEIPT DATA.
3. Fill amount fields with the Total Amount from RECEIPT DATA.
4. Fill date fields with the Date from RECEIPT DATA.
5. Select "Company" if Individual/Company choice exists.
6. Fill buyer/customer detail fields with BUYER DETAILS above.
7. CRITICAL — Email field: If the email field shows a default/placeholder (e.g. abc@example.com), you MUST overwrite it with the Email from BUYER DETAILS. Click the field, select all (Ctrl+A), then type the correct email.
8. IMPORTANT — Cascading dropdowns (Country/State/City): Always fill top-down — Country FIRST, then State, then City. Each parent populates the child options. NEVER go back to re-select a parent after filling children (it resets them).
9. For ANY dropdown that won't respond to typing: try these approaches IN ORDER:
   a. Click the dropdown trigger/arrow → wait for list → click the matching option
   b. If no list appears, click the field → type the first few letters to filter → press Enter or click the match
   c. If still stuck, try clicking different parts of the dropdown area (the text area vs. the arrow icon)
   d. LAST RESORT: use key_combination "ArrowDown" repeatedly to cycle through options
10. For Country dropdown: click the dropdown, then TYPE "Malaysia" to filter — do NOT scroll through the entire list.
11. For any long dropdown: TYPE the first few letters to filter/jump instead of scrolling.
12. KEYBOARD KEYS: Use correct capitalized names — "Backspace" (not "backspace"), "Control+A" (not "control+a"), "Delete" (not "delete"), "Enter" (not "enter"), "ArrowDown" (not "arrowdown").
13. For any field not covered above, check the RECEIPT IMAGE for the answer.
14. RECEIPT IMAGE UPLOAD: If the form has a "Upload Receipt" or "Choose File" button, the receipt image has ALREADY been uploaded automatically by the system. Do NOT click any file upload buttons or try to upload again. If you see a thumbnail/preview of the uploaded image, that confirms it's done.
15. Check consent checkbox → click Submit.
16. Fix validation errors if any (only the specific field mentioned).
17. CAPTCHA handling:
   - reCAPTCHA (Google — shows image puzzles like "select all buses"): Do NOT interact. It is handled automatically by the system. Skip completely.
   - Cloudflare "Verify you are human" checkbox: DO click it and wait 3-5 seconds. It usually auto-verifies after clicking. If it shows "Verification failed", click it again.
18. For forms requiring OTP/TAC: Use the system email ({buyer["email"]}) for the email field. After filling all fields, click "Request OTP" or "Send OTP". The OTP will be handled automatically — just wait for the code to appear and then submit."""

    shot = base64.b64encode(page.screenshot(type="png")).decode()
    # Build CUA context: receipt image (reference) + form screenshot (current page)
    parts: list[dict] = [{"text": instruction}]
    if receipt_image_b64:
        parts.append({"text": "RECEIPT IMAGE (reference — read Store Code, dates, amounts from this):"})
        parts.append({"inlineData": {"mimeType": "image/png", "data": receipt_image_b64}})
        parts.append({"text": "FORM PAGE (current — fill the fields below):"})
    parts.append({"inlineData": {"mimeType": "image/png", "data": shot}})
    contents = [{"role": "user", "parts": parts}]

    actions = 0
    for turn in range(MAX_TURNS):
        resp = gemini_cua(contents)
        candidate = resp.get("candidates", [{}])[0]
        parts = candidate.get("content", {}).get("parts", [])
        if not parts:
            break

        contents.append(candidate["content"])
        fn_calls = [p["functionCall"] for p in parts if "functionCall" in p]
        text_parts = [p["text"] for p in parts if "text" in p]

        if text_parts:
            print(f"[CUA {turn+1}] {' '.join(text_parts)[:120]}")
        if not fn_calls:
            print(f"[CUA] Done after {actions} actions")
            break

        fn_responses = []
        for fc in fn_calls:
            action_name = fc["name"]
            action_args = fc.get("args", {})
            safety = action_args.pop("safety_decision", None)
            label = f"{action_name}"
            if action_args.get("text"):
                label += f' "{action_args["text"][:35]}"'
            print(f"[CUA]   {label}")

            try:
                execute_action(page, action_name, action_args)
                actions += 1
            except Exception as e:
                print(f"[CUA]   Error: {e}")

            new_shot = base64.b64encode(page.screenshot(type="png")).decode()
            resp_data: dict[str, Any] = {"url": page.url}
            if safety:
                resp_data["safety_acknowledgement"] = "true"
            fn_responses.append({"functionResponse": {
                "name": action_name, "response": resp_data,
                "parts": [{"inlineData": {"mimeType": "image/png", "data": new_shot}}],
            }})
        contents.append({"role": "user", "parts": fn_responses})

    return actions


# ── Tier 2B: Gemini Flash multi-pass fill (when CUA rate-limited) ──

def run_tier2_flash(page: Page, buyer: dict, receipt: dict) -> int:
    """Fallback: Gemini Flash identifies empty fields from screenshot, then fills via Playwright.
    Two-pass: 1) recon screenshot → Flash maps buyer details to fields, 2) Playwright fills."""
    print("[Tier 2B] Gemini Flash fallback — CUA rate-limited")

    full_b64 = base64.b64encode(page.screenshot(type="png", full_page=True)).decode()

    # Pass 1: Flash identifies empty fields and maps buyer details
    prompt = f"""Analyze this e-invoice form screenshot. Many fields are ALREADY PRE-FILLED.

BUYER DETAILS:
- Full Name: {buyer["userName"]}
- Email: {buyer["email"]}
- Phone: {buyer["phoneRaw"]} (international) / {buyer["phoneLocal"]} (local with 0) / {buyer["phoneShort"]} (without 0, for fields with country code +60 prefix)
- Company: {buyer["name"]}
- BRN: {buyer["brn"]}  |  TIN: {buyer["tin"]}
- Address: {buyer["address"]}, {buyer["city"]}, 47100, {buyer["state"]}, Malaysia

Return a JSON array of ONLY the empty fields that need filling.
Each entry: {{"label": "field label text", "value": "value to fill", "type": "text"|"select"|"checkbox"}}

Rules:
- SKIP all pre-filled fields (receipt number, date, amount)
- For Individual/Company choice, set value to "Company"
- For state dropdown, value should be "{buyer["state"]}"
- For city dropdown, value should be "{buyer["city"]}"
- Include consent checkbox if unchecked (type "checkbox", value "true")
- Do NOT include the submit button

Return ONLY the JSON array, no markdown."""

    try:
        response = gemini_flash(prompt, full_b64)
        json_match = re.search(r'\[[\s\S]*?\]', response)
        if not json_match:
            print(f"[Tier 2B] No JSON in Flash response: {response[:200]}")
            return 0

        fields = json.loads(json_match.group())
        print(f"[Tier 2B] Flash identified {len(fields)} empty fields to fill")

        # Pass 2: Use Playwright to fill each field by label matching
        filled = 0
        for field in fields:
            label = field.get("label", "")
            value = field.get("value", "")
            ftype = field.get("type", "text")

            if not label or not value:
                continue

            try:
                if ftype == "checkbox":
                    # Find checkbox near the label text
                    cb = page.locator(f'input[type="checkbox"]').first
                    if cb.count() > 0 and not cb.is_checked():
                        cb.click(timeout=3000)
                        print(f"[Tier 2B]   Check: {label}")
                        filled += 1
                    # Also try Radix checkbox
                    radix_cb = page.locator('button[role="checkbox"]')
                    if radix_cb.count() > 0 and radix_cb.get_attribute("data-state") != "checked":
                        radix_cb.click(timeout=3000)
                        print(f"[Tier 2B]   Check (Radix): {label}")
                        filled += 1
                    continue

                if ftype == "select":
                    # Try native select by label
                    sel = page.get_by_label(label, exact=False)
                    if sel.count() > 0 and sel.first.evaluate("el => el.tagName") == "SELECT":
                        try:
                            sel.first.select_option(label=value, timeout=3000)
                            print(f"[Tier 2B]   Select: {label} = {value}")
                            filled += 1
                            continue
                        except Exception:
                            pass
                    # Try Radix combobox
                    radix = page.get_by_role("combobox").filter(has_text=re.compile(label, re.IGNORECASE))
                    if radix.count() > 0:
                        radix.first.click(timeout=3000)
                        time.sleep(0.5)
                        option = page.get_by_role("option").filter(has_text=re.compile(value, re.IGNORECASE))
                        if option.count() > 0:
                            option.first.click(timeout=3000)
                            print(f"[Tier 2B]   Radix select: {label} = {value}")
                            filled += 1
                            continue

                # Default: text input by label
                inp = page.get_by_label(label, exact=False)
                if inp.count() > 0:
                    inp.first.click(click_count=3, timeout=3000)
                    page.keyboard.type(value, delay=20)
                    print(f"[Tier 2B]   Fill: {label} = {value[:30]}")
                    filled += 1
                else:
                    # Fallback: try placeholder text
                    inp2 = page.get_by_placeholder(re.compile(label, re.IGNORECASE))
                    if inp2.count() > 0:
                        inp2.first.click(click_count=3, timeout=3000)
                        page.keyboard.type(value, delay=20)
                        print(f"[Tier 2B]   Fill (placeholder): {label} = {value[:30]}")
                        filled += 1

            except Exception as e:
                print(f"[Tier 2B]   Error on '{label}': {e}")

        # Submit
        if filled > 0:
            time.sleep(1)
            sub = page.locator('button:has-text("Submit"), input[type="submit"]').first
            if sub.count() > 0:
                sub.click(timeout=5000)
                print(f"[Tier 2B]   Clicked Submit")
                filled += 1

        print(f"[Tier 2B] Flash filled {filled} fields")
        return filled

    except Exception as e:
        print(f"[Tier 2B] Flash fallback failed: {e}")
        traceback.print_exc()
        return 0


# ── Tier 3: Troubleshooter ──────────────────────────────────

# ── DSPy Signatures for structured troubleshooting ──────────

def troubleshoot(screenshot_b64: str, error: str, merchant: str) -> dict:
    """DSPy-structured troubleshooting: diagnoses failure → saves fix suggestions.
    Returns diagnosis dict with keys: fixable, diagnosis, infra_action, cua_hints, fields."""
    print(f"[Troubleshoot] Diagnosing '{merchant}': {error[:80]}")
    result_info: dict = {"fixable": False, "infra_action": None, "diagnosis": "", "cua_hints": "", "fields": []}
    try:
        # Lazy import DSPy (avoids 10s cold start on every invocation)
        os.environ["DSPY_CACHEDIR"] = "/tmp/dspy_cache"
        import dspy as _dspy
        from pydantic import BaseModel as PydanticBaseModel, Field as PydanticField

        class UnfilledField(PydanticBaseModel):
            label: str = PydanticField(description="Field label, e.g. 'Company Industry'")
            css_selector: str = PydanticField(description="CSS selector, e.g. 'select[name=industry]'")
            field_type: str = PydanticField(description="One of: text, select, radio, checkbox")
            suggested_default: str = PydanticField(default="", description="Default value")

        class FormDiagnosis(_dspy.Signature):
            """Analyze a failed e-invoice form and diagnose the root cause.
            You handle BOTH form-level issues (unfilled fields, validation errors) AND
            infrastructure-level issues (network errors, IP blocking, bot detection).

            Infrastructure issues you MUST recognize:
            - ERR_SOCKET_NOT_CONNECTED, ERR_CONNECTION_REFUSED, ERR_CONNECTION_RESET → site blocks Lambda IP → infra_action: 'use_browserbase'
            - ERR_TIMED_OUT, timeout → site unreachable from Lambda region → infra_action: 'use_browserbase'
            - 403/401 status, WAF, bot detection → IP/fingerprint blocked → infra_action: 'use_browserbase'
            - ERR_NAME_NOT_RESOLVED → domain doesn't exist → infra_action: 'invalid_url'
            - Login page, password field required → not a buyer form → infra_action: 'wrong_url'
            - CAPTCHA persistent after solving → infra_action: 'manual_only'

            Set fixable=True for BOTH form fixes AND infra fixes. Only set fixable=False if truly unfixable (e.g. domain doesn't exist)."""
            error_message: str = _dspy.InputField(desc="Error that caused the form fill to fail")
            merchant_name: str = _dspy.InputField(desc="Merchant name")
            screenshot_description: str = _dspy.InputField(desc="Description of the screenshot")
            diagnosis: str = _dspy.OutputField(desc="What went wrong — be specific about root cause")
            unfilled_fields: list[UnfilledField] = _dspy.OutputField(desc="Fields needing fixes (empty list for infra issues)")
            fixable: bool = _dspy.OutputField(desc="True if fixable by form changes OR infrastructure changes (Browserbase, URL fix). False only if truly unfixable.")
            infra_action: str = _dspy.OutputField(desc="Infrastructure fix action. One of: 'use_browserbase' (IP/geo/WAF block), 'invalid_url' (domain doesn't exist), 'wrong_url' (login page, not buyer form), 'manual_only' (persistent CAPTCHA), 'none' (form-level issue only)")
            cua_hints: str = _dspy.OutputField(desc="Merchant-specific instructions for the CUA agent on next attempt. E.g. 'Click Company tab before filling fields', 'Phone field uses react-phone-input with +60 prefix — use 9-digit number without 0', 'Must click Validate button first to unlock fields'. For infra issues: 'use_browserbase: Site blocks Lambda IP, requires residential proxy'. Be specific and actionable.")

        # Configure DSPy
        lm = _dspy.LM("gemini/gemini-3.1-flash-lite-preview", api_key=GEMINI_KEY, max_tokens=2048, temperature=0.1)
        _dspy.settings.configure(lm=lm, adapter=_dspy.JSONAdapter())

        # Gemini Flash describes the screenshot (DSPy doesn't handle images natively)
        # If no real screenshot (e.g. network error before page loaded), skip vision call
        if screenshot_b64 and len(screenshot_b64) > 100:
            description = gemini_flash(
                "Describe this screenshot. Focus on:\n"
                "1. Is this an e-invoice form? Or a login page, error page, blank page, or CAPTCHA?\n"
                "2. Which fields are filled vs empty\n"
                "3. Any validation error messages visible\n"
                "4. The state of dropdowns and checkboxes\n"
                "5. Any signs of bot detection, WAF blocks, or network errors",
                screenshot_b64,
            )
        else:
            description = "No screenshot available — page never loaded (network error before rendering)"
        print(f"[Troubleshoot] Screenshot: {description[:150]}...")

        # DSPy structured diagnosis
        result = _dspy.Predict(FormDiagnosis)(
            error_message=error[:500],
            merchant_name=merchant,
            screenshot_description=description[:2000],
        )
        infra_action = getattr(result, "infra_action", "none") or "none"
        print(f"[Troubleshoot] Diagnosis: {result.diagnosis}")
        print(f"[Troubleshoot] Fixable: {result.fixable}, Fields: {len(result.unfilled_fields)}, Infra: {infra_action}")

        result_info["fixable"] = result.fixable
        result_info["diagnosis"] = result.diagnosis
        result_info["infra_action"] = infra_action if infra_action != "none" else None
        result_info["cua_hints"] = getattr(result, "cua_hints", "") or ""

        # Save infra-level hints (Browserbase, manual-only, wrong URL)
        if infra_action == "use_browserbase":
            hint = "connection_error: Use Browserbase (site blocks Lambda IP — diagnosed by troubleshooter)"
            config_update: dict[str, Any] = {
                "fields": (fc or {}).get("fields", []) if 'fc' in dir() else [],
                "cuaHints": hint,
                "lastFailureReason": result.diagnosis[:200],
            }
            convex_mutation("functions/system:saveMerchantFormConfig", {
                "merchantName": merchant,
                "formConfig": config_update,
            })
            print(f"[Troubleshoot] Saved Browserbase hint for {merchant}")
        elif infra_action == "manual_only":
            hint = "manual_only: This merchant requires manual form fill (persistent CAPTCHA or other blocker)"
            convex_mutation("functions/system:saveMerchantFormConfig", {
                "merchantName": merchant,
                "formConfig": {"fields": [], "cuaHints": hint, "lastFailureReason": result.diagnosis[:200]},
            })
            print(f"[Troubleshoot] Marked {merchant} as manual-only")
        elif infra_action == "wrong_url":
            print(f"[Troubleshoot] ⚠ URL appears to be a login/merchant portal, not a buyer form")

        # Save form-level fixes
        if result.fixable and result.unfilled_fields:
            valid_types = {"text", "select", "radix_select", "radio", "checkbox"}
            fields = []
            for uf in result.unfilled_fields:
                ftype = uf.field_type if uf.field_type in valid_types else "text"
                field: dict[str, Any] = {"label": uf.label, "selector": uf.css_selector,
                                          "type": ftype, "required": True}
                if uf.suggested_default:
                    field["defaultValue"] = uf.suggested_default
                fields.append(field)
            result_info["fields"] = fields

            config_update = {"fields": fields, "lastFailureReason": result.diagnosis[:200]}
            if result.cua_hints:
                config_update["cuaHints"] = result.cua_hints[:500]
                print(f"[Troubleshoot] Learned CUA hints: {result.cua_hints[:150]}")
            convex_mutation("functions/system:saveMerchantFormConfig", {
                "merchantName": merchant,
                "formConfig": config_update,
            })
            print(f"[Troubleshoot] Saved {len(fields)} fix suggestions")

    except Exception as e:
        print(f"[Troubleshoot] Failed: {e}")
        traceback.print_exc()

    return result_info


# ── Extract formConfig from filled page (post-success) ─────

def extract_form_config(page: Page) -> Optional[dict]:
    """Scrape all filled fields with their CSS selectors for Tier 1 reuse."""
    try:
        raw = page.evaluate("""() => {
            const fields = [];
            document.querySelectorAll('input[type="text"], input[type="email"], input:not([type]), textarea').forEach(el => {
                if (!el.value || el.type === 'hidden') return;
                const label = el.closest('label')?.textContent?.trim() || document.querySelector('label[for="'+el.id+'"]')?.textContent?.trim() || el.placeholder || el.name || '';
                const sel = el.id ? '#'+el.id : el.name ? (el.tagName === 'TEXTAREA' ? 'textarea' : 'input')+'[name="'+el.name+'"]' : '';
                if (sel) fields.push({label: label.substring(0,60), selector: sel, type: 'text', value: el.value, required: el.required});
            });
            document.querySelectorAll('select').forEach(el => {
                if (el.selectedIndex <= 0) return;
                const label = el.closest('label')?.textContent?.trim() || document.querySelector('label[for="'+el.id+'"]')?.textContent?.trim() || el.name || '';
                const sel = el.id ? '#'+el.id : el.name ? 'select[name="'+el.name+'"]' : '';
                if (sel) fields.push({label: label.substring(0,60), selector: sel, type: 'select', value: el.options[el.selectedIndex]?.textContent?.trim() || '', required: el.required});
            });
            const sub = document.querySelector('button[type="submit"], input[type="submit"]');
            const con = document.querySelector('input[type="checkbox"][name*="agree"], button[role="checkbox"]');
            return {fields, submitSelector: sub?.id ? '#'+sub.id : 'button[type="submit"]',
                    consentSelector: con?.getAttribute('role') === 'checkbox' ? 'button[role="checkbox"]' : con ? 'input[type="checkbox"]' : ''};
        }""")
        if not raw or not raw.get("fields"):
            return None

        # Map labels → buyerDetailKeys
        key_map = {
            "company name": "name", "tax identification": "tin", "tin": "tin",
            "business registration": "brn", "email": "email", "full name": "userName",
            "first name": "userName", "address": "address", "city": "city",
            "state": "state", "postcode": "postcode", "country": "country",
            "phone": "phone", "order": "referenceNumber", "receipt": "referenceNumber",
            "date": "date", "payment": "date",
        }
        clean_fields = []
        for f in raw["fields"]:
            ll = f["label"].lower()
            mapped_key = next((v for k, v in key_map.items() if k in ll), None)
            clean = {
                "label": f["label"],
                "selector": f["selector"],
                "type": f["type"],
                "required": bool(f.get("required", False)),
            }
            if mapped_key:
                clean["buyerDetailKey"] = mapped_key
            else:
                clean["defaultValue"] = f.get("value", "")
            clean_fields.append(clean)

        result: dict[str, Any] = {"fields": clean_fields}
        if raw.get("submitSelector"):
            result["submitSelector"] = raw["submitSelector"]
        if raw.get("consentSelector"):
            result["consentSelector"] = raw["consentSelector"]
        return result
    except Exception as e:
        print(f"[Extract] Failed: {e}")
        return None


# ── Download e-invoice PDF via Playwright ────────────────────

def download_einvoice(event: dict) -> dict:
    """Navigate to a download URL with Playwright, capture the PDF, save to S3.

    For SPA-based download pages (like 99SM's e-engage), the PDF is generated
    client-side and loaded into an iframe as a blob: URL. Strategy:
    1. Navigate to the page, wait for #pdfIframe to appear
    2. Extract the blob URL from the iframe src
    3. Fetch the blob via page.evaluate and return as base64
    """
    download_url = event["downloadUrl"]
    s3_key = event["s3Key"]
    s3_bucket = event.get("s3Bucket", "finanseal-bucket")

    print(f"[Download] Starting PDF download: {download_url[:80]}")

    try:
        pw = sync_playwright().start()
        browser = pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
                   "--disable-gpu", "--headless=new", "--single-process"],
        )
        page = browser.new_page(viewport={"width": 1280, "height": 900})

        pdf_bytes = None

        # Navigate — use domcontentloaded (SPA pages never reach networkidle)
        page.goto(download_url, wait_until="domcontentloaded", timeout=45000)

        # Strategy 1: Wait for iframe with blob: PDF (SPA pattern — 99SM, etc.)
        for i in range(30):
            time.sleep(1)
            blob_result = page.evaluate("""() => {
                const iframe = document.querySelector('#pdfIframe, iframe[src^="blob:"]');
                if (iframe && iframe.src && iframe.src.startsWith('blob:')) {
                    return iframe.src;
                }
                return null;
            }""")
            if blob_result:
                print(f"[Download] Found PDF blob iframe after {i+1}s: {blob_result[:60]}")
                # Fetch the blob content as base64
                b64_pdf = page.evaluate("""async (blobUrl) => {
                    const resp = await fetch(blobUrl);
                    const blob = await resp.blob();
                    return new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(reader.result.split(',')[1]);
                        reader.readAsDataURL(blob);
                    });
                }""", blob_result)
                if b64_pdf:
                    pdf_bytes = base64.b64decode(b64_pdf)
                    print(f"[Download] Extracted PDF from blob: {len(pdf_bytes)} bytes")
                break

        # Strategy 2: Look for download button if no blob found
        if not pdf_bytes:
            dl_btn = page.locator('a:has-text("Download"), button:has-text("Download"), a[href*=".pdf"]').first
            if dl_btn.count() > 0:
                try:
                    with page.expect_download(timeout=15000) as download_info:
                        dl_btn.click()
                    download = download_info.value
                    dl_path = download.path()
                    if dl_path:
                        with open(dl_path, "rb") as f:
                            pdf_bytes = f.read()
                        print(f"[Download] Got PDF via download button: {len(pdf_bytes)} bytes")
                except Exception as dl_err:
                    print(f"[Download] Download button failed: {dl_err}")

        # Strategy 3: Print rendered page as PDF (last resort)
        if not pdf_bytes:
            body_len = page.evaluate("() => document.body.innerText.length")
            print(f"[Download] No PDF found — printing page as PDF (body: {body_len} chars)")
            if body_len > 50:
                pdf_bytes = page.pdf(format="A4", print_background=True)
                print(f"[Download] Printed page as PDF: {len(pdf_bytes)} bytes")
            else:
                print("[Download] Page is blank — cannot generate PDF")

        browser.close()

        # Save to S3
        import boto3 as _boto3
        _boto3.client("s3").put_object(
            Bucket=s3_bucket, Key=s3_key, Body=pdf_bytes, ContentType="application/pdf"
        )
        print(f"[Download] Saved to S3: {s3_key} ({len(pdf_bytes)} bytes)")
        return {"success": True, "s3Key": s3_key, "size": len(pdf_bytes)}

    except Exception as e:
        print(f"[Download] Failed: {e}")
        traceback.print_exc()
        try:
            if browser:
                browser.close()
        except Exception:
            pass
        return {"success": False, "error": str(e)}


# ── Main handler ────────────────────────────────────────────

def handler(event: dict, context=None) -> dict:
    # Dispatch: download-einvoice mode (invoked by email processor)
    if event.get("action") == "download-einvoice":
        return download_einvoice(event)

    start = time.time()
    global cost_tracker, _run_state
    cost_tracker = CostTracker()
    _run_state = {"tier": "prefill", "browser_type": "local", "cua_actions": 0}
    browser: Optional[Browser] = None
    claim_id = event["expenseClaimId"]
    url = event["merchantFormUrl"]
    merchant = event.get("extractedData", {}).get("vendorName", "")
    _run_state["merchant"] = merchant

    print(f"[Form Fill] Start: claim={claim_id}, url={url[:80]}")
    receipt_image_local: str | None = None  # Temp file path for form upload (cleaned up in finally)

    try:
        if not GEMINI_KEY:
            raise RuntimeError("GEMINI_API_KEY not configured")

        # Report starting
        convex_mutation("functions/system:reportEinvoiceFormFillResult", {
            "expenseClaimId": claim_id, "emailRef": event["emailRef"],
            "merchantFormUrl": url, "status": "in_progress",
        })

        # Build buyer details
        bd = event["buyerDetails"]
        state = STATE_CODES.get(bd.get("stateCode", ""), bd.get("stateCode", "Selangor"))
        buyer = {
            "name": bd["name"], "userName": bd.get("userName", bd["name"]),
            "tin": bd["tin"], "brn": bd["brn"], "email": bd["email"],
            "phone": "0" + (bd.get("phone") or "+60132201176").replace("+", "").replace("-", "").replace(" ", "").removeprefix("60"),
            "phoneRaw": (bd.get("phone") or "+60132201176").replace(" ", ""),  # +60132201176
            "phoneLocal": "0" + (bd.get("phone") or "+60132201176").replace("+", "").replace("-", "").replace(" ", "").removeprefix("60"),  # 0132201176
            "phoneShort": (bd.get("phone") or "+60132201176").replace("+", "").replace("-", "").replace(" ", "").removeprefix("60"),  # 132201176 (no leading 0, for react-phone-input with +60 prefix)
            "address": bd.get("addressLine1") or bd["address"].split(",")[0],
            "city": bd.get("city", "Puchong"), "state": state,
        }
        raw_receipt = event.get("extractedData", {})
        # Normalize field names (auto-trigger uses amount/date, manual retry uses totalAmount/transactionDate)
        receipt = {
            "referenceNumber": raw_receipt.get("referenceNumber") or raw_receipt.get("receipt_number"),
            "totalAmount": raw_receipt.get("totalAmount") or raw_receipt.get("amount"),
            "currency": raw_receipt.get("currency", "MYR"),
            "transactionDate": raw_receipt.get("transactionDate") or raw_receipt.get("date"),
            "vendorName": raw_receipt.get("vendorName") or raw_receipt.get("vendor_name"),
        }
        print(f"[Form Fill] Buyer: {buyer['userName']}, {buyer['email']}, {state}")
        print(f"[Form Fill] Receipt: ref={receipt['referenceNumber']}, amt={receipt['totalAmount']}, date={receipt['transactionDate']}, vendor={receipt['vendorName']}")

        # Pre-fetch merchant config (needed for Browserbase decision before browser launch)
        merchant_hints = ""
        fc = None
        lookup = None
        if merchant:
            lookup = convex_query("functions/system:lookupMerchantEinvoiceUrl", {"vendorName": merchant, "country": "MY"})
            fc = (lookup or {}).get("formConfig")
            merchant_hints = (fc or {}).get("cuaHints", "") or (lookup or {}).get("notes", "") or ""
            if merchant_hints:
                print(f"[Form Fill] Merchant hints: {merchant_hints[:100]}...")

        # Download receipt image from S3 for CUA vision + file upload
        receipt_image_b64 = None
        receipt_image_path = event.get("receiptImagePath")
        if receipt_image_path:
            try:
                import boto3 as _boto3
                s3 = _boto3.client("s3")
                s3_key = receipt_image_path if receipt_image_path.startswith("expense_claims/") else f"expense_claims/{receipt_image_path}"
                presigned = s3.generate_presigned_url("get_object", Params={"Bucket": "finanseal-bucket", "Key": s3_key}, ExpiresIn=300)
                req = Request(presigned)
                with urlopen(req, timeout=15) as resp:
                    image_bytes = resp.read()
                receipt_image_b64 = base64.b64encode(image_bytes).decode()
                # Save to temp file for Playwright file upload
                import tempfile
                ext = ".jpeg" if receipt_image_path.endswith((".jpeg", ".jpg")) else ".png"
                tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False, dir="/tmp")
                tmp.write(image_bytes)
                tmp.close()
                receipt_image_local = tmp.name
                print(f"[Form Fill] Receipt image loaded: {receipt_image_path} ({len(receipt_image_b64)//1024}KB) → {receipt_image_local}")

                # Pre-extract store code from receipt image via Gemini Flash
                if not receipt.get("storeCode"):
                    try:
                        code = gemini_flash(
                            "Extract the Store Code, Shop Number, or Branch Code from this receipt. "
                            "Look for labels like 'Shop No.', 'Store Code', 'Branch', 'Outlet'. "
                            "Return ONLY the code (e.g. KK9219), nothing else. If not found, return N/A.",
                            receipt_image_b64,
                        ).strip()
                        if code and code != "N/A" and len(code) < 20:
                            receipt["storeCode"] = code
                            print(f"[Form Fill] Extracted store code: {code}")
                    except Exception as se:
                        print(f"[Form Fill] Store code extraction failed: {se}")
            except Exception as e:
                print(f"[Form Fill] Receipt image download failed: key={receipt_image_path}, error={e}")

        # 99SM: Construct full URL with ReceiptDetails if QR scan only got the base URL
        if "99einvoice.com" in url and "ReceiptDetails" not in url and receipt.get("referenceNumber"):
            ref = receipt["referenceNumber"]
            date_str = (receipt.get("transactionDate") or "").replace("-", "")
            amt_str = f"{float(receipt.get('totalAmount') or 0):.2f}"
            receipt_payload = f"{ref}|{date_str}|{amt_str}|{ref}"
            receipt_b64 = base64.b64encode(receipt_payload.encode()).decode()
            url = f"https://99einvoice.com/?ReceiptDetails={receipt_b64}"
            print(f"[Form Fill] 99SM: Constructed URL from receipt data: {receipt_payload}")

        # Launch browser — Browserbase for Cloudflare-managed merchants, local for everything else
        pw = sync_playwright().start()
        use_bb = needs_browserbase(merchant_hints)
        bb_session_id = None

        if use_bb:
            print("[Browser] Using Browserbase (merchant requires it)")
            _run_state["browser_type"] = "browserbase"
            browser, page, bb_session_id = launch_browserbase(pw)
        else:
            browser, page, _ = launch_local(pw)

        # Navigate (with Browserbase fallback on network errors)
        try:
            resp = page.goto(url, wait_until="domcontentloaded", timeout=45000)
            status = resp.status if resp else 0
            print(f"[Form Fill] Navigated: {page.url}, status={status}")
        except Exception as nav_err:
            nav_error_str = str(nav_err)
            bb_key, _ = _get_bb_credentials()
            if _is_retryable_network_error(nav_error_str) and bb_key:
                print(f"[Browser] Navigation failed: {nav_error_str.split(chr(10))[0]}")
                try:
                    browser.close()
                except Exception:
                    pass
                if not use_bb:
                    # Local browser failed — retry with Browserbase (Singapore region)
                    print("[Browser] Retrying with Browserbase (Singapore region)")
                    _run_state["browser_type"] = "browserbase"
                    browser, page, bb_session_id = launch_browserbase(pw)
                    use_bb = True
                    try:
                        resp = page.goto(url, wait_until="domcontentloaded", timeout=45000)
                        status = resp.status if resp else 0
                        print(f"[Form Fill] Navigated via Browserbase: {page.url}, status={status}")
                    except Exception as bb_nav_err:
                        bb_nav_str = str(bb_nav_err)
                        if _is_retryable_network_error(bb_nav_str):
                            # Browserbase Singapore also blocked — retry with proxy
                            print(f"[Browser] Browserbase (no proxy) also blocked: {bb_nav_str.split(chr(10))[0]}")
                            print("[Browser] Retrying with Browserbase + residential proxy")
                            try:
                                browser.close()
                            except Exception:
                                pass
                            browser, page, bb_session_id = launch_browserbase(pw, use_proxy=True)
                            resp = page.goto(url, wait_until="domcontentloaded", timeout=45000)
                            status = resp.status if resp else 0
                            print(f"[Form Fill] Navigated via Browserbase+proxy: {page.url}, status={status}")
                        else:
                            raise
                else:
                    # Already on Browserbase but failed — retry with proxy
                    print("[Browser] Browserbase failed — retrying with residential proxy")
                    browser, page, bb_session_id = launch_browserbase(pw, use_proxy=True)
                    resp = page.goto(url, wait_until="domcontentloaded", timeout=45000)
                    status = resp.status if resp else 0
                    print(f"[Form Fill] Navigated via Browserbase+proxy: {page.url}, status={status}")
                # Save hint so future runs use Browserbase from the start
                if merchant:
                    new_hint = (merchant_hints + "\n" if merchant_hints else "") + "connection_error: Use Browserbase (site blocks Lambda/datacenter IPs)"
                    try:
                        existing_fields = (fc or {}).get("fields", [])
                        convex_mutation("functions/system:saveMerchantFormConfig", {
                            "merchantName": merchant,
                            "formConfig": {"fields": existing_fields, "cuaHints": new_hint[:500]},
                        })
                        print(f"[Form Fill] Saved Browserbase hint for {merchant}")
                    except Exception as hint_err:
                        print(f"[Form Fill] Failed to save Browserbase hint: {hint_err}")
                    merchant_hints = new_hint
            else:
                raise  # Non-retryable error — propagate

        # Runtime detection: if managed Turnstile found and we're on local browser → switch to Browserbase
        if not use_bb and status == 200:
            time.sleep(3)  # Let Turnstile script load
            bb_key_check, _ = _get_bb_credentials()
            if detect_managed_turnstile(page) and bb_key_check:
                print("[Browser] Managed Turnstile detected — switching to Browserbase")
                _run_state["browser_type"] = "browserbase"
                browser.close()
                browser, page, bb_session_id = launch_browserbase(pw)
                resp = page.goto(url, wait_until="domcontentloaded", timeout=45000)
                status = resp.status if resp else 0
                print(f"[Form Fill] Re-navigated via Browserbase: {page.url}, status={status}")
                use_bb = True
                # Save hint so next run uses Browserbase from the start
                if merchant:
                    new_hint = (merchant_hints + "\n" if merchant_hints else "") + "cloudflare_managed: Use Browserbase (Cloudflare managed challenge blocks headless Lambda)"
                    try:
                        existing_fields = (fc or {}).get("fields", [])
                        convex_mutation("functions/system:saveMerchantFormConfig", {
                            "merchantName": merchant,
                            "formConfig": {"fields": existing_fields, "cuaHints": new_hint[:500]},
                        })
                        print(f"[Form Fill] Saved Browserbase hint for {merchant}")
                    except Exception as e:
                        print(f"[Form Fill] Failed to save Browserbase hint: {e}")
                    merchant_hints = new_hint

        if status in (403, 401):
            raise RuntimeError(f"BOT_BLOCKED: Merchant returned {status} (Cloudflare/WAF)")
        if status == 503 and ("just a moment" in page.title().lower() or "attention" in page.title().lower()):
            raise RuntimeError("BOT_BLOCKED: Cloudflare challenge page")

        try:
            page.wait_for_load_state("networkidle", timeout=10000)
        except Exception:
            pass
        time.sleep(2)

        # ── 99 Speed Mart: dedicated Tier 1 flow (short-circuits CUA) ──
        if "99einvoice.com" in url:
            print("[Form Fill] 🏪 99 Speed Mart detected — using dedicated flow")
            success = run_99speedmart_flow(page, buyer, event.get("emailRef", ""))
            dur = int((time.time() - start) * 1000)
            status_str = "success" if success else "failed"
            browser.close()
            error_msg = None if success else "99SM dedicated flow failed"
            convex_mutation("functions/system:reportEinvoiceFormFillResult", {
                "expenseClaimId": claim_id, "emailRef": event["emailRef"],
                "status": status_str, "durationMs": dur,
                **({"errorMessage": error_msg} if error_msg else {}),
            })
            return {"success": success, "durationMs": dur, "tier": "99sm"}

        # ── Tier 0: Detect OTP/CAPTCHA — attempt automation if emailRef exists ──
        try:
            # Check visible text AND full page source (catches hidden/multi-step OTP fields)
            otp_detected = page.evaluate("""() => {
                const src = document.documentElement.innerHTML.toLowerCase();
                const buttons = Array.from(document.querySelectorAll('button'));
                const hasRequestOtp = buttons.some(b => b.textContent.toLowerCase().includes('request otp'));
                const hasOtpLabel = !!document.querySelector('[id*="otp" i], [name*="otp" i], label[for*="otp" i]');
                const srcHasOtp = src.includes('request otp') || src.includes('otp:') || src.includes('one-time password');
                return hasRequestOtp || (hasOtpLabel && srcHasOtp);
            }""")
            if otp_detected:
                email_ref = event.get("emailRef", "")
                if email_ref:
                    print(f"[Form Fill] OTP detected — emailRef exists ({email_ref}), will attempt automated OTP via email")
                    # Don't fail fast — let CUA fill the form, then we'll intercept the OTP email
                else:
                    print("[Form Fill] ⛔ OTP detected — no emailRef, cannot automate")
                    raise RuntimeError("MANUAL_ONLY: This merchant requires OTP verification. Please fill the form manually using your company details and the system email.")
        except RuntimeError:
            raise
        except Exception as e:
            print(f"[Form Fill] OTP detection check failed (non-fatal): {e}")

        # ── Phase 0: Solve CAPTCHA early (some forms like McDonald's trigger reCAPTCHA on any interaction) ──
        time.sleep(3)  # Wait for reCAPTCHA/Turnstile to fully load
        solve_captcha(page, url)

        # ── Login flow for merchants that require authentication ──
        merchant_slug = _get_merchant_slug(merchant or "", einvoice_url=url)
        if merchant_slug:
            _run_state["merchant_slug"] = merchant_slug
        merchant_creds = _read_merchant_credentials(merchant_slug) if merchant_slug else None
        if merchant_creds:
            _run_login_flow(page, url, merchant_creds, merchant_slug, event.get("emailRef", ""))
            # Add CUA hint: login done, navigate to form, use correct buyer email (NOT login email)
            merchant_hints += (
                "\nIMPORTANT: Login has already been completed automatically. You are now on the merchant dashboard."
                "\n- Navigate to the e-invoice request form (e.g. click 'E-Invoice' menu → 'Request E-Invoice')."
                "\n- If a guideline/info popup appears, dismiss it."
                "\n- For DATE PICKER fields: Do NOT try to click individual dates in the calendar popup."
                "  Instead, click the date input field, then use keyboard: select all text (Ctrl+A), "
                "  then type the date in DD/MM/YYYY format. If that doesn't work, try clearing the field first."
                f"\n- CRITICAL: For the buyer EMAIL field, you MUST use: {buyer['email']}"
                f"  Do NOT use the login email ({merchant_creds['email']}). They are different."
                "  If the email field is pre-filled with the login email, CLEAR it and type the correct buyer email."
                f"\n- BUYER PROFILE: If the form has a buyer profile list/dropdown/table, look for an existing profile with TIN '{buyer['tin']}'. The name might be different (e.g. '{buyer['name']}' or another alias). If a profile with matching TIN exists, SELECT it — do NOT create a new one."
                "\n- Fill all receipt detail fields, then submit."
                "\n- Do NOT try to log in again."
            )

        # ── Pre-fill with Playwright (runs BEFORE Tier 1 so phone/dropdowns are ready) ──
        # Phase 0b: Handle validate-gated forms (BRN+TIN → Validate → fields unlock)
        handle_validate_gate(page, buyer)
        # Phase 1: Fill all text inputs, selects, phone, custom dropdowns
        prefill_all(page, buyer, receipt)
        prefill_custom_dropdowns(page, buyer)

        # Phase 2: Upload receipt image if a file input exists on the page
        receipt_uploaded = False
        if receipt_image_local:
            receipt_uploaded = upload_receipt_image(page, receipt_image_local)

        # ── Tier 1: Check for saved formConfig (merchant config already fetched above) ──
        if merchant and fc and fc.get("fields") and (fc.get("successCount", 0) > 0):
            _run_state["tier"] = "tier1"
            print(f"[Form Fill] ⚡ Tier 1: {len(fc['fields'])} fields, {fc['successCount']} successes")
            if run_tier1(page, fc, buyer):
                dur = int((time.time() - start) * 1000)
                print(f"[Form Fill] ⚡ Tier 1 done in {dur}ms")
                print(f"[Cost] {cost_tracker.summary()}")
                browser.close()
                convex_mutation("functions/system:reportEinvoiceFormFillResult", {
                    "expenseClaimId": claim_id, "emailRef": event["emailRef"],
                    "status": "success", "durationMs": dur,
                    **_debug_fields(),
                })
                convex_mutation("functions/system:saveMerchantFormConfig", {"merchantName": merchant, "formConfig": fc})
                return {"success": True, "durationMs": dur}
            print("[Form Fill] Tier 1 failed — falling back to Tier 2")
            try:
                shot = base64.b64encode(page.screenshot(type="png")).decode()
                troubleshoot(shot, "Tier 1 validation failed after submit", merchant)
            except Exception:
                pass

        # Phase 2: Solve reCAPTCHA BEFORE CUA (CapSolver API, ~5-12s)
        # This prevents CUA from wasting turns clicking CAPTCHA images
        solve_captcha(page, url)

        # ── Tier 2: CUA exploration (with merchant-specific hints) ──
        _run_state["tier"] = "tier2"
        try:
            actions = run_tier2(page, buyer, receipt, receipt_image_b64, merchant_hints=merchant_hints)
        except Exception as tier2_err:
            if "429" in str(tier2_err):
                if BU_LAMBDA_ARN:
                    # Tier 2B: invoke separate browser-use Lambda (fully async, no nest_asyncio conflicts)
                    print(f"[Form Fill] CUA rate-limited, invoking browser-use Lambda: {tier2_err}")
                    browser.close()
                    browser = None  # prevent double-close
                    import boto3
                    from botocore.config import Config
                    # browser-use Lambda can take 2-3 min — increase read timeout to avoid boto3 retries
                    lambda_client = boto3.client("lambda", config=Config(
                        read_timeout=300, retries={"max_attempts": 0}
                    ))
                    bu_resp = lambda_client.invoke(
                        FunctionName=BU_LAMBDA_ARN,
                        InvocationType="RequestResponse",  # sync — wait for result
                        Payload=json.dumps(event).encode(),
                    )
                    bu_result = json.loads(bu_resp["Payload"].read())
                    dur = int((time.time() - start) * 1000)
                    success = bu_result.get("success", False)
                    print(f"[Form Fill] Tier 2B result: {bu_result}, total {dur}ms")
                    # browser-use Lambda already reported to Convex
                    return {"success": success, "durationMs": dur, "tier": "2b"}
                else:
                    # No browser-use Lambda configured — fall back to Flash
                    print(f"[Form Fill] CUA rate-limited, Flash fallback: {tier2_err}")
                    actions = run_tier2_flash(page, buyer, receipt)
            else:
                raise

        # ── Post-CUA: Radix dropdown fix ──
        has_radix = page.get_by_role("combobox").filter(has_text="Select state").count() > 0
        state_ok = True
        if has_radix:
            print("[Form Fill] Radix dropdowns detected")
            page.evaluate("() => window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(1)
            state_ok = prefill_radix_dropdown(page, "Select state", state)
            if state_ok:
                time.sleep(2)
                prefill_radix_dropdown(page, "Select city", buyer["city"])
            # Radix consent + submit
            cb = page.locator('button[role="checkbox"]')
            if cb.count() > 0 and cb.get_attribute("data-state") != "checked":
                cb.click()
            sub = page.locator('button:has-text("Submit")')
            if sub.count() > 0:
                sub.click()
                print("[Form Fill] Submitted (Playwright)")
                time.sleep(5)
        else:
            time.sleep(3)  # CUA already submitted

        # ── Post-CUA: Upload receipt image if not done during pre-fill ──
        # (e.g. 7-Eleven: CUA navigates from dashboard to form, file input wasn't available during pre-fill)
        if receipt_image_local and not receipt_uploaded:
            receipt_uploaded = upload_receipt_image(page, receipt_image_local)

        # ── Post-CUA: Solve any CAPTCHA (may have loaded lazily after scroll/CUA) ──
        captcha_ok = solve_captcha(page, url)
        if captcha_ok:
            # Re-submit if CAPTCHA was solved and form is still visible
            submit_btn = page.locator('button[type="submit"], button:has-text("Submit"), input[type="submit"]').first
            if submit_btn.count() > 0 and submit_btn.is_visible():
                try:
                    submit_btn.click(timeout=5000)
                    print("[Form Fill] Re-submitted after post-CUA CAPTCHA solve")
                    time.sleep(5)
                except Exception:
                    pass

        # ── Phase 2: Save formConfig on success (preserve merchant_hints) ──
        if state_ok and merchant:
            try:
                new_fc = extract_form_config(page)
                if new_fc and new_fc.get("fields"):
                    # Preserve existing cuaHints — they're learned from troubleshooting
                    if merchant_hints:
                        new_fc["cuaHints"] = merchant_hints
                    convex_mutation("functions/system:saveMerchantFormConfig", {"merchantName": merchant, "formConfig": new_fc})
                    print(f"[Form Fill] 📝 Saved formConfig: {len(new_fc['fields'])} fields")
            except Exception as e:
                print(f"[Form Fill] formConfig save failed: {e}")

        # ── Post-submit: Gemini Flash verification ──
        verified_success = state_ok  # default to Radix state
        evidence = ""
        try:
            time.sleep(2)  # let page settle after submit
            shot = base64.b64encode(page.screenshot(type="png", full_page=True)).decode()
            vresult = gemini_flash(
                "Analyze this page AFTER a form submit attempt. Classify:\n"
                "- submitted=true ONLY if you see a clear success message (thank you, confirmation, receipt number, green checkmark, or redirected to a different/blank page)\n"
                "- submitted=false if: the SAME form is still visible, OR there are ANY validation errors (red text, 'required', 'invalid'), OR the form fields are still editable\n"
                "IMPORTANT: Validation errors = NOT submitted (submitted=false)\n\n"
                "Respond in JSON only: {\"submitted\": true/false, \"confidence\": 0.0-1.0, \"evidence\": \"what you see\"}",
                shot,
            )
            json_match = re.search(r'\{[\s\S]*?\}', vresult)
            if json_match:
                vdata = json.loads(json_match.group())
                submitted = vdata.get("submitted", False)
                confidence = vdata.get("confidence", 0.0)
                evidence = vdata.get("evidence", "")
                print(f"[Verify] submitted={submitted}, confidence={confidence}, evidence={evidence[:100]}")
                if confidence >= 0.7:
                    verified_success = submitted
        except Exception as ve:
            print(f"[Verify] Failed: {ve}")

        # ── Tier 3: Troubleshoot on verified failure (self-evolving) ──
        if not verified_success and merchant:
            try:
                shot = base64.b64encode(page.screenshot(type="png")).decode()
                troubleshoot(shot, f"Verification failed: {evidence[:300]}", merchant)
            except Exception:
                pass

        browser.close()
        dur = int((time.time() - start) * 1000)
        status_str = "success" if verified_success else "failed"
        print(f"[Form Fill] Done in {dur}ms, {actions} CUA actions, verified={status_str}, evidence={evidence[:80]}")
        print(f"[Cost] {cost_tracker.summary()}")

        error_msg = None if verified_success else f"Verification: {evidence[:200]}"
        _run_state["evidence"] = evidence
        _run_state["cua_actions"] = actions
        convex_mutation("functions/system:reportEinvoiceFormFillResult", {
            "expenseClaimId": claim_id, "emailRef": event["emailRef"],
            "status": status_str, "durationMs": dur,
            **({"errorMessage": error_msg} if error_msg else {}),
            **_debug_fields(),
        })
        return {"success": verified_success, "verified": True, "evidence": evidence, "durationMs": dur, "cost": cost_tracker.to_dict()}

    except Exception as e:
        dur = int((time.time() - start) * 1000)
        error = str(e)
        print(f"[Form Fill] FAILED in {dur}ms: {error}")
        print(f"[Cost] {cost_tracker.summary()}")
        traceback.print_exc()

        # ── Tier 3: Troubleshoot on failure → diagnose + retry if fixable ──
        ts_result: dict = {"fixable": False, "infra_action": None}
        if merchant and not error.startswith("BOT_BLOCKED"):
            try:
                shot = None
                if browser:
                    pages = browser.contexts[0].pages if browser.contexts else []
                    if pages:
                        shot = base64.b64encode(pages[0].screenshot(type="png")).decode()
                if not shot:
                    # No browser/page available (e.g. network error) — use a blank placeholder
                    shot = base64.b64encode(b"blank").decode()
                ts_result = troubleshoot(shot, error, merchant)
            except Exception:
                pass

        # ── Retry with Browserbase if troubleshooter says so (same invocation) ──
        _bb_retry_key, _bb_retry_proj = _get_bb_credentials()
        if (ts_result.get("infra_action") == "use_browserbase"
                and not _run_state.get("browserbase_retry_attempted")
                and _bb_retry_key and _bb_retry_proj):
            _run_state["browserbase_retry_attempted"] = True
            print("[Retry] Troubleshooter recommended Browserbase — retrying in same invocation")

            # Close existing browser if still open
            if browser:
                try:
                    browser.close()
                except Exception:
                    pass

            try:
                _run_state["browser_type"] = "browserbase"
                # Use proxy if original failure was already on Browserbase (means geo-blocking)
                retry_with_proxy = "socket_not_connected" in error.lower() or "connection_refused" in error.lower()
                browser2, page2, bb_sid = launch_browserbase(pw, use_proxy=retry_with_proxy)
                try:
                    resp2 = page2.goto(url, wait_until="domcontentloaded", timeout=45000)
                    status2 = resp2.status if resp2 else 0
                except Exception as retry_nav:
                    # If Browserbase without proxy failed, try with proxy
                    if not use_proxy and _is_retryable_network_error(str(retry_nav)):
                        print(f"[Retry] Browserbase (no proxy) failed: {str(retry_nav).split(chr(10))[0]}")
                        print("[Retry] Retrying with Browserbase + residential proxy")
                        try:
                            browser2.close()
                        except Exception:
                            pass
                        browser2, page2, bb_sid = launch_browserbase(pw, use_proxy=True)
                        resp2 = page2.goto(url, wait_until="domcontentloaded", timeout=45000)
                        status2 = resp2.status if resp2 else 0
                    else:
                        raise
                print(f"[Retry] Browserbase navigated: {page2.url}, status={status2}")

                if status2 in (403, 401, 0):
                    raise RuntimeError(f"Browserbase retry also failed: status={status2}")

                # Run pre-fill + CUA on the Browserbase page
                time.sleep(2)
                solve_captcha(page2, url)
                handle_validate_gate(page2, buyer)
                prefill_all(page2, buyer, receipt)
                prefill_custom_dropdowns(page2, buyer)
                if receipt_image_local:
                    upload_receipt_image(page2, receipt_image_local)
                solve_captcha(page2, url)

                _run_state["tier"] = "tier2"
                actions = run_tier2(page2, buyer, receipt, receipt_image_b64, merchant_hints=ts_result.get("cua_hints", ""))
                time.sleep(3)

                # Post-CUA: upload if not done during pre-fill (e.g. CUA navigated to form)
                if receipt_image_local:
                    upload_receipt_image(page2, receipt_image_local)

                # Post-CUA CAPTCHA + submit
                if solve_captcha(page2, url):
                    submit_btn = page2.locator('button[type="submit"], button:has-text("Submit"), input[type="submit"]').first
                    if submit_btn.count() > 0 and submit_btn.is_visible():
                        try:
                            submit_btn.click(timeout=5000)
                            print("[Retry] Re-submitted after CAPTCHA")
                            time.sleep(5)
                        except Exception:
                            pass

                # Verify
                time.sleep(2)
                shot2 = base64.b64encode(page2.screenshot(type="png", full_page=True)).decode()
                vresult = gemini_flash(
                    "Analyze this page AFTER a form submit attempt. Classify:\n"
                    "- submitted=true ONLY if you see a clear success message\n"
                    "- submitted=false if: the SAME form is still visible, OR validation errors\n\n"
                    "Respond in JSON only: {\"submitted\": true/false, \"confidence\": 0.0-1.0, \"evidence\": \"what you see\"}",
                    shot2,
                )
                retry_success = False
                retry_evidence = ""
                json_match = re.search(r'\{[\s\S]*?\}', vresult)
                if json_match:
                    vdata = json.loads(json_match.group())
                    retry_success = vdata.get("submitted", False) and vdata.get("confidence", 0) >= 0.7
                    retry_evidence = vdata.get("evidence", "")
                    print(f"[Retry Verify] submitted={vdata.get('submitted')}, confidence={vdata.get('confidence')}, evidence={retry_evidence[:100]}")

                # Save formConfig on success
                if retry_success and merchant:
                    try:
                        new_fc = extract_form_config(page2)
                        if new_fc and new_fc.get("fields"):
                            new_fc["cuaHints"] = ts_result.get("cua_hints", "")
                            convex_mutation("functions/system:saveMerchantFormConfig", {"merchantName": merchant, "formConfig": new_fc})
                    except Exception:
                        pass

                browser2.close()
                dur = int((time.time() - start) * 1000)
                status_str = "success" if retry_success else "failed"
                print(f"[Retry] Done in {dur}ms, verified={status_str}")
                print(f"[Cost] {cost_tracker.summary()}")
                _run_state["evidence"] = retry_evidence
                _run_state["cua_actions"] = actions
                convex_mutation("functions/system:reportEinvoiceFormFillResult", {
                    "expenseClaimId": claim_id, "emailRef": event["emailRef"],
                    "status": status_str, "durationMs": dur,
                    **({"errorMessage": f"Browserbase retry: {retry_evidence[:200]}"} if not retry_success else {}),
                    **_debug_fields(),
                })
                return {"success": retry_success, "retry": "browserbase", "durationMs": dur, "cost": cost_tracker.to_dict()}

            except Exception as retry_err:
                print(f"[Retry] Browserbase retry failed: {retry_err}")
                traceback.print_exc()
                try:
                    browser2.close()
                except Exception:
                    pass

        # Close browser if still open
        if browser:
            try:
                browser.close()
            except Exception:
                pass

        try:
            convex_mutation("functions/system:reportEinvoiceFormFillResult", {
                "expenseClaimId": claim_id, "emailRef": event["emailRef"],
                "status": "failed", "errorMessage": error, "durationMs": dur,
                **_debug_fields(),
            })
        except Exception:
            pass

        return {"success": False, "error": error, "durationMs": dur, "cost": cost_tracker.to_dict()}

    finally:
        # Clean up temp receipt image file
        if receipt_image_local:
            try:
                os.remove(receipt_image_local)
            except Exception:
                pass

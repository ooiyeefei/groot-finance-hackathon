"""
E-Invoice Form Fill — browser-use + Gemini Flash (Tier 2B)

Dedicated async Lambda for form filling via browser-use agent.
Called by the main form-fill Lambda when Gemini CUA hits 429 rate limit.

Fully async — no nest_asyncio, no sync Playwright conflicts.
"""

import asyncio
import json
import os
import time
import traceback
from urllib.request import Request, urlopen

# ── Config ──────────────────────────────────────────────────

SCREEN_W, SCREEN_H = 1440, 900
CONVEX_URL = os.environ.get("NEXT_PUBLIC_CONVEX_URL", "")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
os.environ["GOOGLE_API_KEY"] = GEMINI_KEY  # langchain-google-genai convention

STATE_CODES = {
    "01": "Johor", "02": "Kedah", "03": "Kelantan", "04": "Melaka",
    "05": "Negeri Sembilan", "06": "Pahang", "07": "Pulau Pinang", "08": "Perak",
    "09": "Perlis", "10": "Selangor", "11": "Terengganu", "12": "Sabah",
    "13": "Sarawak", "14": "Kuala Lumpur", "15": "Labuan", "16": "Putrajaya",
}


# ── Convex helpers ──────────────────────────────────────────

def _http_post(url: str, body: dict) -> dict:
    req = Request(url, data=json.dumps(body).encode(), headers={"Content-Type": "application/json"})
    with urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def convex_mutation(path: str, args: dict):
    try:
        _http_post(f"{CONVEX_URL}/api/mutation", {"path": path, "args": args, "format": "json"})
    except Exception as e:
        print(f"[BU] Convex mutation failed: {e}")


# ── Gemini Flash verification ───────────────────────────────

def gemini_flash_verify(screenshot_b64: str) -> dict:
    """Ask Gemini Flash to verify if the form was submitted successfully."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_KEY}"
    prompt = """Analyze this screenshot of a web form page AFTER a submit attempt. Classify:

- submitted=true ONLY if you see a clear success message (thank you, confirmation, receipt number, green checkmark, or redirected to a different/blank page)
- submitted=false if: the SAME form is still visible, OR there are ANY validation errors (red text, 'required', 'invalid'), OR the form fields are still editable

IMPORTANT: Validation errors visible on page = NOT submitted (submitted=false). The form showing with fields still editable = NOT submitted.

Respond in JSON only:
{"submitted": true/false, "confidence": 0.0-1.0, "evidence": "brief description of what you see"}"""

    payload = {
        "contents": [{"role": "user", "parts": [
            {"text": prompt},
            {"inlineData": {"mimeType": "image/png", "data": screenshot_b64}},
        ]}],
        "generationConfig": {"temperature": 0.0, "maxOutputTokens": 512},
    }
    req = Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    try:
        with urlopen(req, timeout=30) as resp:
            r = json.loads(resp.read())
        text = r.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        import re
        match = re.search(r'\{[\s\S]*?\}', text)
        if match:
            return json.loads(match.group())
    except Exception as e:
        print(f"[BU] Verification call failed: {e}")
    return {"submitted": False, "confidence": 0.0, "evidence": "verification failed"}


# ── Async form fill ─────────────────────────────────────────

async def fill_form(url: str, buyer: dict, receipt: dict) -> dict:
    """Use browser-use agent to fill the form. Returns {success, evidence, confidence}."""
    from browser_use import Agent, BrowserProfile, ChatGoogle

    llm = ChatGoogle(model="gemini-2.0-flash")

    browser_profile = BrowserProfile(
        headless=True,
        disable_security=True,
        extra_chromium_args=[
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--single-process",
        ],
        minimum_wait_page_load_time=1.0,
        wait_between_actions=0.5,
        viewport={"width": SCREEN_W, "height": SCREEN_H},
        user_data_dir="/tmp/bu-user-data",
        downloads_path="/tmp/bu-downloads",
    )

    task = f"""Navigate to {url} and fill the e-invoice buyer details form.
Many fields are ALREADY PRE-FILLED (receipt number, date, amount) — DO NOT change them.

Fill ONLY the empty fields with these BUYER DETAILS:
- Full Name: {buyer["userName"]}
- Email: {buyer["email"]}
- Phone: {buyer["phone"]}
- Company Name: {buyer["name"]}
- Business Registration Number (BRN): {buyer["brn"]}
- Tax Identification Number (TIN): {buyer["tin"]}
- Address: {buyer["address"]}
- City: {buyer["city"]}
- Postcode: 47100
- State: {buyer["state"]}
- Country: Malaysia

RULES:
1. DO NOT modify pre-filled fields (receipt number, date, amount).
2. If there is an Individual/Company toggle or radio, select "Company".
3. For state/city dropdowns, select the matching option. Scroll through the list if needed.
4. Check any consent/agreement/terms checkbox.
5. After all fields are filled, click the Submit button.
6. If you see validation errors after submit, fix ONLY the specific field and re-submit.
7. When you see a success/thank-you message, you are done."""

    agent = Agent(
        task=task,
        llm=llm,
        browser_profile=browser_profile,
        use_vision=True,
        max_steps=25,
        max_actions_per_step=3,
        max_failures=5,
    )

    history = await agent.run()
    agent_done = history.is_done() if hasattr(history, "is_done") else bool(history)
    steps = len(history.history) if hasattr(history, "history") else "?"
    print(f"[BU] Agent completed: agent_done={agent_done}, steps={steps}")

    # ── Post-submission verification with Gemini Flash ──
    # Extract the last screenshot from agent history and verify with Flash
    verification = {"submitted": False, "confidence": 0.0, "evidence": "no verification"}
    try:
        import base64 as b64mod
        last_screenshot = None

        # Method 1: Get screenshot from agent history (most reliable)
        if hasattr(history, "history") and history.history:
            for step in reversed(history.history):
                state = getattr(step, "state", None) or getattr(step, "browser_state", None)
                if state:
                    screenshot_b64 = getattr(state, "screenshot", None)
                    if screenshot_b64:
                        last_screenshot = screenshot_b64
                        break

        # Method 2: Try to take a fresh screenshot if browser is still open
        if not last_screenshot:
            for attr in ("browser", "_browser", "browser_session", "_browser_session"):
                session = getattr(agent, attr, None)
                if session:
                    try:
                        page = await session.get_current_page()
                        if page:
                            raw = await page.screenshot(type="png", full_page=True)
                            last_screenshot = b64mod.b64encode(raw).decode()
                            break
                    except Exception:
                        continue

        if last_screenshot:
            verification = gemini_flash_verify(last_screenshot)
            print(f"[BU] Verification: submitted={verification.get('submitted')}, "
                  f"confidence={verification.get('confidence')}, "
                  f"evidence={verification.get('evidence', '')[:100]}")
        else:
            print("[BU] No screenshot available for verification")
    except Exception as e:
        print(f"[BU] Verification failed: {e}")

    # Definitive success = agent thinks done AND Flash confirms submission
    submitted = verification.get("submitted", False)
    confidence = verification.get("confidence", 0.0)
    evidence = verification.get("evidence", "")

    if submitted and confidence >= 0.7:
        print(f"[BU] VERIFIED SUCCESS: {evidence}")
        return {"success": True, "verified": True, "confidence": confidence, "evidence": evidence}
    elif agent_done and not submitted and confidence >= 0.7:
        print(f"[BU] VERIFIED FAILURE: agent said done but Flash says not submitted: {evidence}")
        return {"success": False, "verified": True, "confidence": confidence, "evidence": evidence}
    else:
        # Low confidence or verification failed — trust agent's assessment but flag it
        print(f"[BU] UNVERIFIED: agent_done={agent_done}, submitted={submitted}, confidence={confidence}")
        return {"success": agent_done, "verified": False, "confidence": confidence, "evidence": evidence}


# ── Lambda handler ──────────────────────────────────────────

def handler(event: dict, context=None) -> dict:
    """Sync Lambda entry point — runs async fill_form via asyncio.run()."""
    start = time.time()
    claim_id = event.get("expenseClaimId", "unknown")
    url = event.get("merchantFormUrl", "")
    email_ref = event.get("emailRef", "")

    print(f"[BU] Start: claim={claim_id}, url={url[:80]}")

    if not GEMINI_KEY:
        return {"success": False, "error": "GEMINI_API_KEY not configured"}

    try:
        # Build buyer details
        bd = event.get("buyerDetails", {})
        state = STATE_CODES.get(bd.get("stateCode", ""), bd.get("stateCode", "Selangor"))
        buyer = {
            "name": bd.get("name", ""),
            "userName": bd.get("userName", bd.get("name", "")),
            "tin": bd.get("tin", ""),
            "brn": bd.get("brn", ""),
            "email": bd.get("email", ""),
            "phone": (bd.get("phone") or "").replace("+", "").replace("-", "").removeprefix("60"),
            "address": bd.get("addressLine1") or bd.get("address", "").split(",")[0],
            "city": bd.get("city", "Puchong"),
            "state": state,
        }
        receipt = event.get("extractedData", {})

        print(f"[BU] Buyer: {buyer['userName']}, {buyer['email']}, {state}")

        # Run async agent + verify submission
        result = asyncio.run(fill_form(url, buyer, receipt))

        dur = int((time.time() - start) * 1000)
        success = result.get("success", False)
        verified = result.get("verified", False)
        evidence = result.get("evidence", "")
        status_str = "success" if success else "failed"
        print(f"[BU] Done in {dur}ms, status={status_str}, verified={verified}, evidence={evidence[:80]}")

        # Report result to Convex
        error_msg = None if success else f"Form fill {'verified' if verified else 'unverified'} failure: {evidence[:200]}"
        convex_mutation("functions/system:reportEinvoiceFormFillResult", {
            "expenseClaimId": claim_id,
            "emailRef": email_ref,
            "status": status_str,
            "durationMs": dur,
            **({"errorMessage": error_msg} if error_msg else {}),
        })

        return {"success": success, "verified": verified, "evidence": evidence, "durationMs": dur}

    except Exception as e:
        dur = int((time.time() - start) * 1000)
        error = str(e)
        print(f"[BU] FAILED in {dur}ms: {error}")
        traceback.print_exc()

        convex_mutation("functions/system:reportEinvoiceFormFillResult", {
            "expenseClaimId": claim_id,
            "emailRef": email_ref,
            "status": "failed",
            "errorMessage": error[:500],
            "durationMs": dur,
        })

        return {"success": False, "error": error, "durationMs": dur}

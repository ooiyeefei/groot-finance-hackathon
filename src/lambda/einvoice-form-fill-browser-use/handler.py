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


# ── Async form fill ─────────────────────────────────────────

async def fill_form(url: str, buyer: dict, receipt: dict) -> bool:
    """Use browser-use agent to fill the merchant e-invoice form."""
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
    success = history.is_done() if hasattr(history, "is_done") else bool(history)
    print(f"[BU] Agent completed: success={success}, steps={len(history.history) if hasattr(history, 'history') else '?'}")
    return success


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

        # Run async agent
        success = asyncio.run(fill_form(url, buyer, receipt))

        dur = int((time.time() - start) * 1000)
        status_str = "success" if success else "failed"
        print(f"[BU] Done in {dur}ms, status={status_str}")

        # Report result to Convex
        convex_mutation("functions/system:reportEinvoiceFormFillResult", {
            "expenseClaimId": claim_id,
            "emailRef": email_ref,
            "status": status_str,
            "durationMs": dur,
        })

        return {"success": success, "durationMs": dur}

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

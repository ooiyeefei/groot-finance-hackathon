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

    task = f"""Navigate to {url} and fill the e-invoice form.
Some fields may be PRE-FILLED — do NOT change pre-filled fields.

BUYER DETAILS (for buyer/customer fields):
- Full Name: {buyer["userName"]}
- Email: {buyer["email"]}
- Phone: {buyer["phone"]}
- Company Name: {buyer["name"]}
- BRN: {buyer["brn"]}  |  TIN: {buyer["tin"]}
- Address: {buyer["address"]}, {buyer["city"]}, 47100, {buyer["state"]}, Malaysia

RECEIPT DATA (for receipt/bill/store fields):
- Store Code / Shop Number: {receipt.get("storeCode", "N/A")}
- Bill Number / Tax Invoice No: {receipt.get("referenceNumber", "N/A")}
- Total Amount: {receipt.get("totalAmount", "N/A")}
- Currency: {receipt.get("currency", "MYR")}
- Date: {receipt.get("transactionDate", "N/A")}
- Vendor/Store Name: {receipt.get("vendorName", "N/A")}

RULES:
1. If form asks for Store Code / Shop Number, use the code from Vendor/Store Name or the URL.
2. Fill Bill Number / Receipt Number with the Tax Invoice No from RECEIPT DATA.
3. Fill amount fields with the Total Amount from RECEIPT DATA.
4. Fill date/time fields with the Date from RECEIPT DATA.
5. If there is an Individual/Company toggle, select "Company".
6. Fill buyer/customer fields with BUYER DETAILS above.
7. IMPORTANT — Cascading dropdowns (Country/State/City): Always fill top-down — Country FIRST, then State, then City. Each parent populates the child options. NEVER go back to re-select a parent after filling children (it resets them).
8. For state/city dropdowns, select the matching option. For long dropdowns, TYPE the first few letters to filter instead of scrolling.
9. Check any consent/agreement checkbox.
10. Click the Submit button when all fields are filled.
11. If you see validation errors, fix the specific field and re-submit.
12. When you see a success/thank-you message, you are done.
13. For forms requiring OTP/TAC: The system email (einvoice+{ref}@einv.hellogroot.com) is used for receiving the OTP. After filling all fields, click "Request OTP". The OTP will be handled automatically — just wait."""

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
        raw_receipt = event.get("extractedData", {})
        receipt = {
            "referenceNumber": raw_receipt.get("referenceNumber") or raw_receipt.get("receipt_number"),
            "totalAmount": raw_receipt.get("totalAmount") or raw_receipt.get("amount"),
            "currency": raw_receipt.get("currency", "MYR"),
            "transactionDate": raw_receipt.get("transactionDate") or raw_receipt.get("date"),
            "vendorName": raw_receipt.get("vendorName") or raw_receipt.get("vendor_name"),
        }

        # Pre-extract store code from receipt image if available
        receipt_image_path = event.get("receiptImagePath")
        if receipt_image_path and not receipt.get("storeCode"):
            try:
                import boto3 as _boto3
                import base64 as _b64
                s3 = _boto3.client("s3")
                s3_key = receipt_image_path if receipt_image_path.startswith("expense_claims/") else f"expense_claims/{receipt_image_path}"
                resp = s3.get_object(Bucket="finanseal-bucket", Key=s3_key)
                img_b64 = _b64.b64encode(resp["Body"].read()).decode()
                # Use raw Gemini Flash to extract store code
                extract_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_KEY}"
                payload = {
                    "contents": [{"role": "user", "parts": [
                        {"text": "Extract the Store Code / Shop Number / Branch Code from this receipt. Return ONLY the code (e.g. KK9219), nothing else. If not found, return N/A."},
                        {"inlineData": {"mimeType": "image/png", "data": img_b64}},
                    ]}],
                    "generationConfig": {"temperature": 0.0, "maxOutputTokens": 50},
                }
                req = Request(extract_url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
                with urlopen(req, timeout=15) as resp:
                    r = json.loads(resp.read())
                code = r.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
                if code and code != "N/A":
                    receipt["storeCode"] = code
                    print(f"[BU] Extracted store code from receipt: {code}")
            except Exception as e:
                print(f"[BU] Store code extraction failed: {e}")

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

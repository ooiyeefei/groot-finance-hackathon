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
MAX_TURNS = 40
CONVEX_URL = os.environ.get("NEXT_PUBLIC_CONVEX_URL", "")
GEMINI_KEY = os.environ.get("GEMINI_API_KEY", "")
BU_LAMBDA_ARN = os.environ.get("EINVOICE_FORM_FILL_BU_LAMBDA_ARN", "")

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
                return json.loads(resp.read())
        except Exception as e:
            if attempt < 2 and ("503" in str(e) or "429" in str(e)):
                print(f"[Form Fill] Gemini retry {attempt+1}: {e}")
                time.sleep(3 * (attempt + 1))
                continue
            raise


def gemini_flash(prompt: str, image_b64: str) -> str:
    """Call Gemini Flash for vision analysis (recon / troubleshooting)."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={GEMINI_KEY}"
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
    return r.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")


# ── Playwright helpers ──────────────────────────────────────

def prefill_all(page: Page, buyer: dict, receipt: dict):
    """Pre-fill phone, native selects, and text inputs via label matching."""
    state = buyer["state"]
    city = buyer["city"]

    # 1. Phone — tel inputs + text inputs with phone labels
    for inp in page.locator('input[type="tel"]').all():
        inp.click(click_count=3, timeout=3000)
        page.keyboard.type(buyer["phone"], delay=20)
        print(f"[Pre-fill] Phone (tel): {buyer['phone']}")
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
    label_map = {
        "company name": buyer["name"], "business name": buyer["name"],
        "tax identification": buyer["tin"], "tin": buyer["tin"],
        "business registration": buyer["brn"], "new business": buyer["brn"],
        "e-invoice email": buyer["email"], "einvoice email": buyer["email"],
        "email address": buyer["email"], "your company email": buyer["email"],
        "full name": buyer["userName"], "first name": buyer["userName"].split()[0],
        "last name": " ".join(buyer["userName"].split()[1:]) or "",
        "company address": buyer["address"], "address": buyer["address"],
        "city": city, "postcode": "47100", "postal": "47100",
        "state": state, "country": "Malaysia",
        "order number": receipt.get("referenceNumber", ""),
        "receipt number": receipt.get("referenceNumber", ""),
        "payment date": receipt.get("date", ""),
    }
    count = page.evaluate("""(mapping) => {
        let n = 0;
        document.querySelectorAll('input[type="text"], input[type="email"], input:not([type]), textarea').forEach(el => {
            if (el.value || el.type === 'hidden' || !el.offsetParent) return;
            const label = (el.closest('label')?.textContent || document.querySelector('label[for="'+el.id+'"]')?.textContent || el.placeholder || el.name || '').toLowerCase();
            for (const [key, value] of Object.entries(mapping)) {
                if (value && label.includes(key)) {
                    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                    if (setter) { setter.call(el, value); el.dispatchEvent(new Event('input', {bubbles:true})); el.dispatchEvent(new Event('change', {bubbles:true})); n++; }
                    break;
                }
            }
        });
        return n;
    }""", label_map)
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
        page.keyboard.press(args.get("keys", ""))
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


# ── Tier 1: Fast path with saved formConfig ────────────────

def run_tier1(page: Page, config: dict, buyer: dict) -> bool:
    """Fill form using saved CSS selectors. Returns True only if enough fields filled + submitted."""
    fields = config.get("fields", [])
    filled = 0
    for f in fields:
        val = buyer.get(f.get("buyerDetailKey", ""), "") or f.get("defaultValue", "")
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


# ── Tier 2: Gemini CUA exploration ─────────────────────────

def run_tier2(page: Page, buyer: dict, receipt: dict, receipt_image_b64: str | None = None) -> int:
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
    instruction = f"""You are filling a merchant e-invoice form. Many fields are ALREADY PRE-FILLED.

BUYER DETAILS (use for buyer/customer fields):
- Full Name: {buyer["userName"]}
- Email: {buyer["email"]}
- Phone: {buyer["phone"]}
- Company: {buyer["name"]}
- BRN: {buyer["brn"]}  |  TIN: {buyer["tin"]}
- Address: {buyer["address"]}, {buyer["city"]}, 47100, {buyer["state"]}, Malaysia

RECEIPT DATA (use for receipt/bill/store fields):
- Bill Number / Tax Invoice No: {receipt.get("referenceNumber", "N/A")}
- Total Amount: {receipt.get("totalAmount", "N/A")}
- Currency: {receipt.get("currency", "MYR")}
- Date: {receipt.get("transactionDate", "N/A")}
- Vendor/Store Name: {receipt.get("vendorName", "N/A")}

{f"FORM FIELDS (from page analysis):\\n{recon}" if recon else ""}

TASK:
1. If the form asks for Store Code / Shop Number, check the RECEIPT IMAGE for "Shop No." or similar.
2. Fill Bill Number / Receipt Number with the Tax Invoice No from RECEIPT DATA.
3. Fill amount fields with the Total Amount from RECEIPT DATA.
4. Fill date fields with the Date from RECEIPT DATA.
5. Select "Company" if Individual/Company choice exists.
6. Fill buyer/customer detail fields with BUYER DETAILS above.
7. For any field not covered above, check the RECEIPT IMAGE for the answer.
8. Check consent checkbox → click Submit.
9. Fix validation errors if any (only the specific field mentioned)."""

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
- Phone: {buyer["phone"]}
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

def troubleshoot(screenshot_b64: str, error: str, merchant: str):
    """DSPy-structured troubleshooting: diagnoses failure → saves fix suggestions."""
    print(f"[Troubleshoot] Diagnosing '{merchant}': {error[:80]}")
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
            """Analyze a failed e-invoice form and diagnose the root cause."""
            error_message: str = _dspy.InputField(desc="Error that caused the form fill to fail")
            merchant_name: str = _dspy.InputField(desc="Merchant name")
            screenshot_description: str = _dspy.InputField(desc="Description of the screenshot")
            diagnosis: str = _dspy.OutputField(desc="What went wrong")
            unfilled_fields: list[UnfilledField] = _dspy.OutputField(desc="Fields needing fixes")
            fixable: bool = _dspy.OutputField(desc="Can this be fixed by filling fields?")

        # Configure DSPy
        lm = _dspy.LM("gemini/gemini-2.0-flash", api_key=GEMINI_KEY, max_tokens=2048, temperature=0.1)
        _dspy.settings.configure(lm=lm, adapter=_dspy.JSONAdapter())

        # Gemini Flash describes the screenshot (DSPy doesn't handle images natively)
        description = gemini_flash(
            "Describe this e-invoice form screenshot. Focus on:\n"
            "1. Which fields are filled vs empty\n"
            "2. Any validation error messages visible\n"
            "3. The state of dropdowns and checkboxes",
            screenshot_b64,
        )
        print(f"[Troubleshoot] Screenshot: {description[:150]}...")

        # DSPy structured diagnosis
        result = _dspy.Predict(FormDiagnosis)(
            error_message=error[:500],
            merchant_name=merchant,
            screenshot_description=description[:2000],
        )
        print(f"[Troubleshoot] Diagnosis: {result.diagnosis}")
        print(f"[Troubleshoot] Fixable: {result.fixable}, Fields: {len(result.unfilled_fields)}")

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

            convex_mutation("functions/system:saveMerchantFormConfig", {
                "merchantName": merchant,
                "formConfig": {"fields": fields, "lastFailureReason": result.diagnosis[:200]},
            })
            print(f"[Troubleshoot] Saved {len(fields)} fix suggestions")

    except Exception as e:
        print(f"[Troubleshoot] Failed: {e}")
        traceback.print_exc()


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


# ── Main handler ────────────────────────────────────────────

def handler(event: dict, context=None) -> dict:
    start = time.time()
    browser: Optional[Browser] = None
    claim_id = event["expenseClaimId"]
    url = event["merchantFormUrl"]
    merchant = event.get("extractedData", {}).get("vendorName", "")

    print(f"[Form Fill] Start: claim={claim_id}, url={url[:80]}")

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
            "phone": (bd.get("phone") or "+60132201176").replace("+", "").replace("-", "").removeprefix("60"),
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

        # Download receipt image from S3 for CUA vision (to read Store Code, etc.)
        receipt_image_b64 = None
        receipt_image_path = event.get("receiptImagePath")
        if receipt_image_path:
            try:
                import boto3 as _boto3
                s3 = _boto3.client("s3")
                # storagePath may omit the domain prefix — ensure it starts with expense_claims/
                s3_key = receipt_image_path if receipt_image_path.startswith("expense_claims/") else f"expense_claims/{receipt_image_path}"
                resp = s3.get_object(Bucket="finanseal-bucket", Key=s3_key)
                receipt_image_b64 = base64.b64encode(resp["Body"].read()).decode()
                print(f"[Form Fill] Receipt image loaded: {receipt_image_path} ({len(receipt_image_b64)//1024}KB)")
            except Exception as e:
                print(f"[Form Fill] Receipt image download failed: key={receipt_image_path}, error={e}")

        # Launch browser (Lambda needs --no-sandbox + --disable-dev-shm-usage)
        pw = sync_playwright().start()
        browser = pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--headless=new",
                "--single-process",
            ],
        )
        page = browser.new_page(viewport={"width": SCREEN_W, "height": SCREEN_H})

        # Navigate
        resp = page.goto(url, wait_until="domcontentloaded", timeout=45000)
        status = resp.status if resp else 0
        print(f"[Form Fill] Navigated: {page.url}, status={status}")

        if status in (403, 401):
            raise RuntimeError(f"BOT_BLOCKED: Merchant returned {status} (Cloudflare/WAF)")
        if status == 503 and ("just a moment" in page.title().lower() or "attention" in page.title().lower()):
            raise RuntimeError("BOT_BLOCKED: Cloudflare challenge page")

        try:
            page.wait_for_load_state("networkidle", timeout=10000)
        except Exception:
            pass
        time.sleep(2)

        # ── Tier 1: Check for saved formConfig ──
        if merchant:
            lookup = convex_query("functions/system:lookupMerchantEinvoiceUrl", {"vendorName": merchant, "country": "MY"})
            fc = (lookup or {}).get("formConfig")
            if fc and fc.get("fields") and (fc.get("successCount", 0) > 0):
                print(f"[Form Fill] ⚡ Tier 1: {len(fc['fields'])} fields, {fc['successCount']} successes")
                if run_tier1(page, fc, buyer):
                    dur = int((time.time() - start) * 1000)
                    print(f"[Form Fill] ⚡ Tier 1 done in {dur}ms")
                    browser.close()
                    convex_mutation("functions/system:reportEinvoiceFormFillResult", {
                        "expenseClaimId": claim_id, "emailRef": event["emailRef"],
                        "status": "success", "durationMs": dur,
                    })
                    convex_mutation("functions/system:saveMerchantFormConfig", {"merchantName": merchant, "formConfig": fc})
                    return {"success": True, "durationMs": dur}
                print("[Form Fill] Tier 1 failed — falling back to Tier 2")

        # ── Pre-fill with Playwright ──
        prefill_all(page, buyer, receipt)

        # ── Tier 2: CUA exploration (with browser-use Lambda fallback on 429) ──
        try:
            actions = run_tier2(page, buyer, receipt, receipt_image_b64)
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

        # ── Phase 2: Save formConfig on success ──
        if state_ok and merchant:
            try:
                fc = extract_form_config(page)
                if fc and fc.get("fields"):
                    convex_mutation("functions/system:saveMerchantFormConfig", {"merchantName": merchant, "formConfig": fc})
                    print(f"[Form Fill] 📝 Saved formConfig: {len(fc['fields'])} fields")
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

        browser.close()
        dur = int((time.time() - start) * 1000)
        status_str = "success" if verified_success else "failed"
        print(f"[Form Fill] Done in {dur}ms, {actions} CUA actions, verified={status_str}, evidence={evidence[:80]}")

        error_msg = None if verified_success else f"Verification: {evidence[:200]}"
        convex_mutation("functions/system:reportEinvoiceFormFillResult", {
            "expenseClaimId": claim_id, "emailRef": event["emailRef"],
            "status": status_str, "durationMs": dur,
            **({"errorMessage": error_msg} if error_msg else {}),
        })
        return {"success": verified_success, "verified": True, "evidence": evidence, "durationMs": dur}

    except Exception as e:
        dur = int((time.time() - start) * 1000)
        error = str(e)
        print(f"[Form Fill] FAILED in {dur}ms: {error}")
        traceback.print_exc()

        # ── Tier 3: Troubleshoot on failure ──
        if merchant and not error.startswith("BOT_BLOCKED") and browser:
            try:
                pages = browser.contexts[0].pages if browser.contexts else []
                if pages:
                    shot = base64.b64encode(pages[0].screenshot(type="png")).decode()
                    troubleshoot(shot, error, merchant)
            except Exception:
                pass

        if browser:
            try:
                browser.close()
            except Exception:
                pass

        try:
            convex_mutation("functions/system:reportEinvoiceFormFillResult", {
                "expenseClaimId": claim_id, "emailRef": event["emailRef"],
                "status": "failed", "errorMessage": error, "durationMs": dur,
            })
        except Exception:
            pass

        return {"success": False, "error": error, "durationMs": dur}

"""
QR Code Detection Step (019-lhdn-einv-flow-2)

Multi-tier detection with image preprocessing and fallback detectors.
Tier 1: zxingcpp (fast, primary)
Tier 2: pyzbar with preprocessing (robust fallback)
Tier 3: Gemini Vision direct extraction (last resort)
"""

import re
import os
import json
from typing import List, Optional, Tuple
from PIL import Image, ImageEnhance, ImageFilter
from io import BytesIO
import numpy as np

# LHDN validation QR — these are verification links, not submission forms
LHDN_QR_PATTERN = re.compile(r"myinvois\.hasil\.gov\.my", re.IGNORECASE)

# 024-einv-buyer-reject-pivot: Extract long ID from LHDN validation URL
# Format: https://myinvois.hasil.gov.my/{longId}/share
LHDN_LONG_ID_PATTERN = re.compile(
    r"myinvois\.hasil\.gov\.my/([A-Za-z0-9_-]+)/share",
    re.IGNORECASE
)

# Valid URL pattern
URL_PATTERN = re.compile(r"^https?://", re.IGNORECASE)

# Known e-invoice form URL patterns (high confidence — skip LLM classification)
KNOWN_EINVOICE_PATTERNS = [
    re.compile(r"einvoice|e-invoice|einvois", re.IGNORECASE),
    re.compile(r"fmeinvoice\.ql\.com", re.IGNORECASE),       # FamilyMart
    re.compile(r"mrdiy\.com.*einvoice", re.IGNORECASE),       # MR. D.I.Y.
]

# Known NON-einvoice URL patterns (app downloads, payment, social media, etc.)
NON_EINVOICE_PATTERNS = [
    re.compile(r"(play\.google|apps\.apple|itunes\.apple)\.com", re.IGNORECASE),  # App stores
    re.compile(r"(facebook|instagram|twitter|tiktok|youtube)\.com", re.IGNORECASE),  # Social
    re.compile(r"/qrcode\?.*orderId=", re.IGNORECASE),        # Order lookup / app QR (e.g. Luckin)
    re.compile(r"(wa\.me|whatsapp\.com|t\.me|telegram)", re.IGNORECASE),  # Messaging
    re.compile(r"(maps\.google|goo\.gl/maps|waze\.com)", re.IGNORECASE),  # Maps
    re.compile(r"(wifi|password|ssid)", re.IGNORECASE),        # WiFi QR codes
]

# Known URL shortener domains — resolve before classifying
URL_SHORTENERS = re.compile(
    r"^https?://(ron\.ac|bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rb\.gy|cutt\.ly|short\.io|shrtco\.de)",
    re.IGNORECASE,
)


def _preprocess_image_for_qr(image: Image.Image) -> List[Image.Image]:
    """Generate multiple preprocessed versions of the image to improve QR detection."""
    variants = [image]  # Original

    try:
        # Variant 1: Increase contrast
        enhancer = ImageEnhance.Contrast(image)
        variants.append(enhancer.enhance(1.5))

        # Variant 2: High contrast + sharpening
        high_contrast = enhancer.enhance(2.0)
        sharpener = ImageEnhance.Sharpness(high_contrast)
        variants.append(sharpener.enhance(2.0))

        # Variant 3: Brightness adjustment (for dark photos)
        brightness = ImageEnhance.Brightness(image)
        variants.append(brightness.enhance(1.3))

        # Variant 4: Grayscale (sometimes helps with colored backgrounds)
        variants.append(image.convert('L').convert('RGB'))

    except Exception as e:
        print(f"Warning: Image preprocessing failed: {e}")

    return variants


def _detect_qr_zxingcpp(image_variants: List[Image.Image], document_id: str) -> List[str]:
    """Try zxingcpp on multiple image variants."""
    try:
        import zxingcpp
        all_qr_data = []
        seen_data = set()

        for idx, img in enumerate(image_variants):
            results = zxingcpp.read_barcodes(img)
            qr_results = [r for r in results if r.format.name == "QRCode"]

            for qr in qr_results:
                data = qr.text.strip()
                if data and data not in seen_data:
                    seen_data.add(data)
                    all_qr_data.append(data)
                    if idx > 0:
                        print(f"[{document_id}] QR Detection: zxingcpp found QR in variant #{idx}: {data[:80]}")

        return all_qr_data
    except ImportError:
        print(f"[{document_id}] QR Detection: zxingcpp not available")
        return []
    except Exception as e:
        print(f"[{document_id}] QR Detection: zxingcpp error - {e}")
        return []


def _detect_qr_pyzbar(image_variants: List[Image.Image], document_id: str) -> List[str]:
    """Fallback to pyzbar (more robust, different algorithm)."""
    try:
        from pyzbar import pyzbar
        all_qr_data = []
        seen_data = set()

        for idx, img in enumerate(image_variants):
            img_array = np.array(img)
            results = pyzbar.decode(img_array, symbols=[pyzbar.ZBarSymbol.QRCODE])

            for qr in results:
                data = qr.data.decode('utf-8', errors='ignore').strip()
                if data and data not in seen_data:
                    seen_data.add(data)
                    all_qr_data.append(data)
                    print(f"[{document_id}] QR Detection: pyzbar found QR (variant #{idx}): {data[:80]}")

        return all_qr_data
    except ImportError:
        print(f"[{document_id}] QR Detection: pyzbar not available")
        return []
    except Exception as e:
        print(f"[{document_id}] QR Detection: pyzbar error - {e}")
        return []


def _resolve_short_url(url: str, document_id: str) -> str:
    """Follow redirects on shortened URLs to get the final destination URL."""
    try:
        from urllib.request import Request, urlopen
        req = Request(url, method="HEAD", headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(req, timeout=5) as resp:
            final_url = resp.url
            if final_url != url:
                print(f"[{document_id}] QR: Resolved short URL: {url[:50]} → {final_url[:80]}")
                return final_url
    except Exception as e:
        # HEAD might not be supported — try GET with no body read
        try:
            from urllib.request import Request, urlopen
            req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urlopen(req, timeout=5) as resp:
                final_url = resp.url
                if final_url != url:
                    print(f"[{document_id}] QR: Resolved short URL (GET): {url[:50]} → {final_url[:80]}")
                    return final_url
        except Exception as e2:
            print(f"[{document_id}] QR: Failed to resolve short URL {url[:50]}: {e2}")
    return url


def _classify_url(url: str, document_id: str) -> str:
    """Classify a QR URL as 'einvoice', 'lhdn', or 'non_einvoice'."""
    # Resolve shortened URLs first (ron.ac, bit.ly, etc.)
    if URL_SHORTENERS.match(url):
        url = _resolve_short_url(url, document_id)

    if LHDN_QR_PATTERN.search(url):
        return "lhdn"

    # Check known e-invoice patterns
    for pattern in KNOWN_EINVOICE_PATTERNS:
        if pattern.search(url):
            return "einvoice"

    # Check known non-einvoice patterns
    for pattern in NON_EINVOICE_PATTERNS:
        if pattern.search(url):
            print(f"[{document_id}] QR: Filtered non-einvoice URL: {url[:80]}")
            return "non_einvoice"

    # Unknown URL — fetch the page and analyze content (much more reliable than URL guessing)
    return _fetch_and_classify_page(url, document_id)


# Keywords that indicate an e-invoice form page (checked against page HTML)
_EINVOICE_PAGE_KEYWORDS = [
    "e-invoice", "einvoice", "e invoice", "einvois",
    "buyer details", "buyer information", "buyer info",
    "tax identification", "tin number", "business registration",
    "request invoice", "request e-invoice", "claim invoice",
    "ic number", "identification number",
    "company name", "company registration",
    "submit request", "next", "proceed",
]

# Keywords that indicate NOT an e-invoice form
_NON_EINVOICE_PAGE_KEYWORDS = [
    "download the app", "download now", "get the app", "install app",
    "app store", "google play", "play store",
    "sign in with google", "login with facebook",
    "page not found", "404 error",
]


def _fetch_and_classify_page(url: str, document_id: str) -> str:
    """Actually visit the URL and analyze the page content to classify it.
    Much more reliable than guessing from URL string alone."""
    try:
        from urllib.request import Request, urlopen
        req = Request(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        })
        with urlopen(req, timeout=10) as resp:
            # Check final URL after redirects (might have resolved to a known pattern)
            final_url = resp.url
            if final_url != url:
                print(f"[{document_id}] QR: URL redirected: {url[:50]} → {final_url[:80]}")
                # Re-check known patterns on the resolved URL
                if LHDN_QR_PATTERN.search(final_url):
                    return "lhdn"
                for pattern in KNOWN_EINVOICE_PATTERNS:
                    if pattern.search(final_url):
                        return "einvoice"
                for pattern in NON_EINVOICE_PATTERNS:
                    if pattern.search(final_url):
                        return "non_einvoice"

            # Read page content (first 50KB is enough for classification)
            raw_bytes = resp.read(50000)
            content = raw_bytes.decode("utf-8", errors="ignore").lower()
            http_status = resp.status

            # WAF/challenge pages return empty or near-empty body — can't classify from content
            if len(content.strip()) < 100 or http_status in (202, 403, 503):
                print(f"[{document_id}] QR: Page returned empty/WAF response (status={http_status}, len={len(content)}), treating as potential einvoice")
                return "einvoice"

            page_title = ""
            title_match = re.search(r"<title[^>]*>(.*?)</title>", content, re.DOTALL)
            if title_match:
                page_title = title_match.group(1).strip()

            # Score based on keyword presence
            einvoice_score = sum(1 for kw in _EINVOICE_PAGE_KEYWORDS if kw in content)
            non_einvoice_score = sum(1 for kw in _NON_EINVOICE_PAGE_KEYWORDS if kw in content)

            print(f"[{document_id}] QR: Page analysis — title='{page_title[:60]}', einvoice_keywords={einvoice_score}, non_einvoice_keywords={non_einvoice_score}, status={http_status}")

            if einvoice_score >= 2:
                print(f"[{document_id}] QR: Page content confirms e-invoice form (score={einvoice_score})")
                return "einvoice"
            if non_einvoice_score >= 2 and einvoice_score == 0:
                print(f"[{document_id}] QR: Page content confirms non-einvoice (score={non_einvoice_score})")
                return "non_einvoice"

            # Low confidence from keywords — fall back to LLM with page context
            return _llm_classify_with_content(url, page_title, content[:2000], document_id)

    except Exception as e:
        print(f"[{document_id}] QR: Page fetch failed ({e}), treating as potential einvoice")
        return "einvoice"  # Conservative — if we can't fetch, assume it might be einvoice


def _llm_classify_with_content(url: str, title: str, content_snippet: str, document_id: str) -> str:
    """Ask Gemini to classify based on actual page content (not just URL)."""
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if not gemini_key:
        print(f"[{document_id}] QR: No GEMINI_API_KEY, treating as potential einvoice")
        return "einvoice"

    try:
        from urllib.request import Request, urlopen
        # Strip HTML tags for cleaner text
        text_content = re.sub(r"<[^>]+>", " ", content_snippet)
        text_content = re.sub(r"\s+", " ", text_content).strip()[:1000]

        api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key={gemini_key}"
        payload = {
            "contents": [{"role": "user", "parts": [{"text":
                f"I visited this URL from a QR code on a Malaysian receipt. "
                f"Is this page an e-invoice request/submission form where buyers can request an e-invoice?\n\n"
                f"URL: {url}\n"
                f"Page title: {title}\n"
                f"Page content excerpt: {text_content}\n\n"
                f"Signs of e-invoice form: buyer details fields, TIN/BRN inputs, company name, email, phone, submit/next button.\n"
                f"Signs of non-einvoice: app download, social media, payment page, login-only portal, 404 error.\n\n"
                f"IMPORTANT: If the page has a form with fields for buyer information, it IS an e-invoice form.\n"
                f"If unsure, reply EINVOICE to be safe.\n\n"
                f"Reply with ONLY one word: EINVOICE or OTHER"
            }]}],
            "generationConfig": {"temperature": 0.0, "maxOutputTokens": 10},
        }
        req = Request(api_url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
        with urlopen(req, timeout=10) as resp:
            r = json.loads(resp.read())
            answer = r.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip().upper()
            result = "einvoice" if "EINVOICE" in answer else "non_einvoice"
            print(f"[{document_id}] QR: LLM classified (with page content) {url[:60]} → {result}")
            return result
    except Exception as e:
        print(f"[{document_id}] QR: LLM classification failed ({e}), treating as potential einvoice")
        return "einvoice"


def _vision_classify_qr_codes(image_bytes: bytes, qr_data_list: list, document_id: str) -> dict:
    """Use Gemini vision to look at the receipt and identify which QR codes are for e-invoice.
    Reads the labels printed next to QR codes (e.g. 'Scan for E-Invoice', 'Download App')."""
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if not gemini_key:
        return {}

    try:
        import base64
        from urllib.request import Request, urlopen

        image_b64 = base64.b64encode(image_bytes).decode()
        qr_list_str = "\n".join(f"QR #{i}: {d[:100]}" for i, d in enumerate(qr_data_list))

        api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key={gemini_key}"
        payload = {
            "contents": [{"role": "user", "parts": [
                {"text":
                    f"Look at this receipt image. There are {len(qr_data_list)} QR codes on it.\n"
                    f"For EACH QR code, read the text/label printed near it on the receipt.\n\n"
                    f"QR codes found:\n{qr_list_str}\n\n"
                    f"For each QR code, classify it as:\n"
                    f"- 'einvoice' if the label says anything about e-invoice, einvoice, einvois, invoice request, claim invoice\n"
                    f"- 'lhdn' if the label mentions LHDN, MyInvois, or tax validation\n"
                    f"- 'app' if the label says download app, install, or similar\n"
                    f"- 'other' for anything else\n\n"
                    f"Respond in JSON ONLY: {{\"0\": \"einvoice\", \"1\": \"app\"}} (use QR index as key)"
                },
                {"inlineData": {"mimeType": "image/jpeg", "data": image_b64}},
            ]}],
            "generationConfig": {"temperature": 0.0, "maxOutputTokens": 200},
        }
        req = Request(api_url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
        with urlopen(req, timeout=15) as resp:
            r = json.loads(resp.read())
            answer = r.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
            # Extract JSON from response
            json_match = re.search(r'\{[^}]+\}', answer)
            if json_match:
                result = json.loads(json_match.group())
                print(f"[{document_id}] QR Vision: {result}")
                return result
    except Exception as e:
        print(f"[{document_id}] QR Vision classification failed: {e}")
    return {}


def _vision_locate_qr_regions(image_bytes: bytes, dimensions: Tuple[int, int], document_id: str) -> dict:
    """Ask Gemini vision to count and locate QR code regions on the receipt.
    Used only in Tier 3 to rescue QR codes that zxingcpp/pyzbar missed
    (e.g. Shell receipts with 2 QRs side-by-side where only 1 was decoded).

    Returns: {"count": N, "regions": [{"bbox": {"x", "y", "width", "height"}}, ...]}
    """
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if not gemini_key:
        return {"count": 0, "regions": []}

    try:
        import base64
        from urllib.request import Request, urlopen

        image_b64 = base64.b64encode(image_bytes).decode()
        w, h = dimensions

        api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key={gemini_key}"
        payload = {
            "contents": [{"role": "user", "parts": [
                {"text":
                    f"Look at this receipt image ({w}x{h} pixels). "
                    f"Count how many QR codes are visible. "
                    f"For each QR code, estimate its bounding box in pixels.\n\n"
                    f"Respond in JSON ONLY: "
                    f'{{\"count\": N, \"regions\": [{{\"bbox\": {{\"x\": 0, \"y\": 0, \"width\": 100, \"height\": 100}}}}, ...]}}'
                },
                {"inlineData": {"mimeType": "image/jpeg", "data": image_b64}},
            ]}],
            "generationConfig": {"temperature": 0.0, "maxOutputTokens": 300},
        }
        req = Request(api_url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
        with urlopen(req, timeout=15) as resp:
            r = json.loads(resp.read())
            answer = r.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
            json_match = re.search(r'\{.*\}', answer, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
                print(f"[{document_id}] QR Vision locate: {result.get('count', 0)} QR regions found")
                return result
    except Exception as e:
        print(f"[{document_id}] QR Vision locate failed: {e}")
    return {"count": 0, "regions": []}


def detect_qr_step(
    document_id: str,
    image_bytes: bytes,
    mime_type: str = "image/png",
) -> dict:
    """
    Detect QR codes in a receipt image and extract e-invoice / LHDN URLs.

    Architecture: DETECT → CLASSIFY (always, regardless of QR count)

    Detection tiers (find QR codes):
      Tier 1: zxingcpp on original image (fast)
      Tier 2: zxingcpp on preprocessed variants + pyzbar fallback
      Tier 3: Gemini Vision crop+decode rescue (only for multi-QR edge cases
              like Shell where library can only decode 1 of 2 side-by-side QRs)

    Classification (determine what each QR is):
      - Single QR: URL pattern matching → page fetch → LLM (no vision needed)
      - Multiple QRs: Gemini vision reads labels to disambiguate which is e-invoice
    """
    print(f"[{document_id}] QR Detection: Starting multi-tier detection")

    detected_qr_codes: List[str] = []
    merchant_form_urls: List[str] = []
    lhdn_validation_urls: List[str] = []

    try:
        image = Image.open(BytesIO(image_bytes))
        if image.mode != "RGB":
            image = image.convert("RGB")

        w, h = image.size
        print(f"[{document_id}] QR Detection: Image {w}x{h}")

        # ===================================================================
        # PHASE 1: DETECTION — find all QR codes in the image
        # ===================================================================

        # Tier 1: zxingcpp on original image (fast path)
        qr_data_list = _detect_qr_zxingcpp([image], document_id)
        print(f"[{document_id}] QR Detection: Tier 1 (zxingcpp on original) found {len(qr_data_list)} QR codes")

        # Tier 2: Only if <2 QRs found, try preprocessing + fallback detectors
        if len(qr_data_list) < 2:
            print(f"[{document_id}] QR Detection: Activating Tier 2 (preprocessing + fallback detectors)")

            image_variants = _preprocess_image_for_qr(image)
            print(f"[{document_id}] QR Detection: Created {len(image_variants)} image variants")

            for variant in image_variants[1:]:
                variant_results = _detect_qr_zxingcpp([variant], document_id)
                for data in variant_results:
                    if data not in qr_data_list:
                        qr_data_list.append(data)

            print(f"[{document_id}] QR Detection: Tier 2a (zxingcpp on variants) total={len(qr_data_list)} QR codes")

            if len(qr_data_list) < 2:
                pyzbar_results = _detect_qr_pyzbar(image_variants, document_id)
                for data in pyzbar_results:
                    if data not in qr_data_list:
                        qr_data_list.append(data)
                print(f"[{document_id}] QR Detection: Tier 2b (pyzbar) total={len(qr_data_list)} QR codes")

        # Tier 3: Vision crop+decode rescue
        # Handles two cases:
        #   - 0 QRs decoded: library failed but there IS a QR (blurry/damaged)
        #   - 1 QR decoded: Shell-type receipt where library missed the 2nd QR
        # If we already have 2+ QRs, no rescue needed — go straight to classification.
        if len(qr_data_list) < 2:
            # We have 0-1 QRs — check if Gemini vision sees MORE QRs we missed
            try:
                vision_locate_result = _vision_locate_qr_regions(image_bytes, (w, h), document_id)
                vision_qr_count = vision_locate_result.get("count", 0)

                if vision_qr_count > len(qr_data_list):
                    print(f"[{document_id}] QR Detection: Tier 3 — Vision sees {vision_qr_count} QRs but library decoded {len(qr_data_list)}, cropping missing regions...")
                    for region in vision_locate_result.get("regions", []):
                        bbox = region.get("bbox", {})
                        if bbox.get("x") is not None and bbox.get("y") is not None:
                            x, y = bbox["x"], bbox["y"]
                            w_bbox = bbox.get("width", 150)
                            h_bbox = bbox.get("height", 150)
                            padding = int(max(w_bbox, h_bbox) * 0.2)
                            x1, y1 = max(0, x - padding), max(0, y - padding)
                            x2, y2 = min(w, x + w_bbox + padding), min(h, y + h_bbox + padding)

                            cropped = image.crop((x1, y1, x2, y2))
                            print(f"[{document_id}] QR Detection: Cropped region ({x1},{y1}) to ({x2},{y2})")

                            cropped_variants = _preprocess_image_for_qr(cropped)
                            cropped_data = _detect_qr_zxingcpp(cropped_variants, document_id)
                            if not cropped_data:
                                cropped_data = _detect_qr_pyzbar(cropped_variants, document_id)

                            for data in (cropped_data or []):
                                if data not in qr_data_list:
                                    qr_data_list.append(data)
                                    print(f"[{document_id}] QR Detection: Decoded from crop: {data[:80]}")
                else:
                    print(f"[{document_id}] QR Detection: Vision confirms {vision_qr_count} QR(s) — no hidden QRs to rescue")
            except Exception as e:
                print(f"[{document_id}] QR Detection: Tier 3 vision rescue skipped ({e})")

        # Auto-prepend https:// for www. URLs
        for i in range(len(qr_data_list)):
            if qr_data_list[i].lower().startswith("www."):
                qr_data_list[i] = "https://" + qr_data_list[i]
                print(f"[{document_id}] QR Detection: Added https:// prefix to QR #{i}")

        detected_qr_codes = qr_data_list.copy()

        # ===================================================================
        # PHASE 2: CLASSIFICATION — determine what each QR code is
        # Always runs, regardless of how many QRs were found.
        # ===================================================================

        if not qr_data_list:
            print(f"[{document_id}] QR Detection: No QR codes to classify")
        elif len(qr_data_list) == 1:
            # SINGLE QR — common case (Din Tai Fung, FamilyMart, MR.DIY, etc.)
            # No ambiguity about "which QR" — classify directly via URL analysis.
            # No vision call needed — saves cost and latency.
            data = qr_data_list[0]
            print(f"[{document_id}] QR Detection: Single QR — classifying: {data[:100]}")

            if URL_PATTERN.match(data):
                classification = _classify_url(data, document_id)
                if classification == "lhdn":
                    lhdn_validation_urls.append(data)
                    print(f"[{document_id}] QR Detection: LHDN validation QR ✓")
                elif classification == "einvoice":
                    merchant_form_urls.append(data)
                    print(f"[{document_id}] QR Detection: E-invoice form URL ✓ {data[:80]}")
                else:
                    print(f"[{document_id}] QR Detection: Non-einvoice URL (skipped)")
            else:
                print(f"[{document_id}] QR Detection: Non-URL QR data: {data[:50]}...")
        else:
            # MULTIPLE QRs — edge case (Shell, some restaurants with loyalty + e-invoice)
            # Use Gemini vision to read labels next to each QR for disambiguation.
            print(f"[{document_id}] QR Detection: {len(qr_data_list)} QRs — using vision to disambiguate...")
            vision_labels = _vision_classify_qr_codes(image_bytes, qr_data_list, document_id)

            for i, data in enumerate(qr_data_list):
                vision_label = vision_labels.get(str(i), "").lower()

                # Vision-based classification (highest priority — reads actual receipt text)
                if vision_label == "einvoice":
                    if URL_PATTERN.match(data):
                        merchant_form_urls.append(data)
                        print(f"[{document_id}] QR Detection: E-invoice form URL (vision confirmed) ✓ {data[:80]}")
                    else:
                        print(f"[{document_id}] QR Detection: Vision says einvoice but not a URL: {data[:50]}")
                    continue
                elif vision_label == "lhdn":
                    if URL_PATTERN.match(data):
                        lhdn_validation_urls.append(data)
                        print(f"[{document_id}] QR Detection: LHDN validation QR (vision confirmed)")
                    continue
                elif vision_label in ("app", "other"):
                    print(f"[{document_id}] QR Detection: Skipped QR #{i} (vision: {vision_label})")
                    continue

                # Fallback: URL-based classification (if vision didn't classify this QR)
                if URL_PATTERN.match(data):
                    classification = _classify_url(data, document_id)
                    if classification == "lhdn":
                        lhdn_validation_urls.append(data)
                        print(f"[{document_id}] QR Detection: LHDN validation QR")
                    elif classification == "einvoice":
                        merchant_form_urls.append(data)
                        print(f"[{document_id}] QR Detection: E-invoice form URL ✓")
                    else:
                        print(f"[{document_id}] QR Detection: Skipped non-einvoice URL")
                else:
                    print(f"[{document_id}] QR Detection: Non-URL QR data: {data[:50]}...")

    except ImportError as e:
        print(f"[{document_id}] QR Detection: Import error - {str(e)}")
    except Exception as e:
        print(f"[{document_id}] QR Detection: Error - {str(e)}")

    # 024-einv-buyer-reject-pivot: Extract LHDN long ID from validation URL
    lhdn_long_id = None
    if lhdn_validation_urls:
        for url in lhdn_validation_urls:
            match = LHDN_LONG_ID_PATTERN.search(url)
            if match:
                lhdn_long_id = match.group(1)
                print(f"[{document_id}] QR Detection: Extracted LHDN long ID: {lhdn_long_id}")
                break

    result = {
        "detected_qr_codes": detected_qr_codes,
        "merchant_form_urls": merchant_form_urls,
        "lhdn_validation_urls": lhdn_validation_urls,
        "merchant_form_url": merchant_form_urls[0] if merchant_form_urls else None,
        "lhdn_long_id": lhdn_long_id,
    }

    print(f"[{document_id}] QR Detection: Complete - {len(merchant_form_urls)} merchant URLs, {len(lhdn_validation_urls)} LHDN URLs, LHDN long ID: {lhdn_long_id or 'none'}")
    return result

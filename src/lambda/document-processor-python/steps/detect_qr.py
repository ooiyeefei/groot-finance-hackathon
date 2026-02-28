"""
QR Code Detection Step (019-lhdn-einv-flow-2)

Detects QR codes in receipt images using zxing-cpp.
Classifies URLs as: LHDN validation, e-invoice form, or non-einvoice (app download, payment, etc.)
"""

import re
import os
import json
from typing import List, Optional
from PIL import Image
from io import BytesIO

# LHDN validation QR — these are verification links, not submission forms
LHDN_QR_PATTERN = re.compile(r"myinvois\.hasil\.gov\.my", re.IGNORECASE)

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
    re.compile(r"/(download|app|install|referral)", re.IGNORECASE),  # App downloads
    re.compile(r"(wa\.me|whatsapp\.com|t\.me|telegram)", re.IGNORECASE),  # Messaging
    re.compile(r"(maps\.google|goo\.gl/maps|waze\.com)", re.IGNORECASE),  # Maps
    re.compile(r"(wifi|password|ssid)", re.IGNORECASE),        # WiFi QR codes
]


def _classify_url(url: str, document_id: str) -> str:
    """Classify a QR URL as 'einvoice', 'lhdn', or 'non_einvoice'."""
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

    # Unknown URL — use Gemini Flash to classify
    return _llm_classify_url(url, document_id)


def _llm_classify_url(url: str, document_id: str) -> str:
    """Ask Gemini Flash whether this URL is likely an e-invoice submission form."""
    gemini_key = os.environ.get("GEMINI_API_KEY", "")
    if not gemini_key:
        # No API key — be conservative, treat as potential einvoice
        print(f"[{document_id}] QR: No GEMINI_API_KEY, treating unknown URL as potential einvoice")
        return "einvoice"

    try:
        from urllib.request import Request, urlopen
        api_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={gemini_key}"
        payload = {
            "contents": [{"role": "user", "parts": [{"text":
                f"Is this URL an e-invoice request/submission form for Malaysian buyers? "
                f"Or is it something else (app download, payment page, order lookup, social media, etc.)?\n\n"
                f"URL: {url}\n\n"
                f"Reply with ONLY one word: EINVOICE or OTHER"
            }]}],
            "generationConfig": {"temperature": 0.0, "maxOutputTokens": 10},
        }
        req = Request(api_url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
        with urlopen(req, timeout=10) as resp:
            r = json.loads(resp.read())
            answer = r.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip().upper()
            result = "einvoice" if "EINVOICE" in answer else "non_einvoice"
            print(f"[{document_id}] QR: LLM classified {url[:60]} → {result}")
            return result
    except Exception as e:
        print(f"[{document_id}] QR: LLM classification failed ({e}), treating as potential einvoice")
        return "einvoice"  # Conservative fallback


def detect_qr_step(
    document_id: str,
    image_bytes: bytes,
    mime_type: str = "image/png",
) -> dict:
    """
    Detect QR codes in a receipt image and extract URLs.
    Classifies each URL as einvoice form, LHDN validation, or non-einvoice.
    """
    print(f"[{document_id}] QR Detection: Starting")

    detected_qr_codes: List[str] = []
    merchant_form_urls: List[str] = []
    lhdn_validation_urls: List[str] = []

    try:
        import zxingcpp

        image = Image.open(BytesIO(image_bytes))
        if image.mode != "RGB":
            image = image.convert("RGB")

        w, h = image.size
        print(f"[{document_id}] QR Detection: Image {w}x{h}")

        results = zxingcpp.read_barcodes(image)
        qr_results = [r for r in results if r.format.name == "QRCode"]

        if not qr_results:
            print(f"[{document_id}] QR Detection: No QR codes found")
        else:
            print(f"[{document_id}] QR Detection: Found {len(qr_results)} QR codes")

            for i, qr in enumerate(qr_results):
                data = qr.text.strip()
                print(f"[{document_id}] QR Detection: Code #{i} data: {data[:150]}")
                detected_qr_codes.append(data)

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

    result = {
        "detected_qr_codes": detected_qr_codes,
        "merchant_form_urls": merchant_form_urls,
        "lhdn_validation_urls": lhdn_validation_urls,
        "merchant_form_url": merchant_form_urls[0] if merchant_form_urls else None,
    }

    print(f"[{document_id}] QR Detection: Complete - {len(merchant_form_urls)} merchant URLs, {len(lhdn_validation_urls)} LHDN URLs")
    return result

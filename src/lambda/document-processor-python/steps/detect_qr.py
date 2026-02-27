"""
QR Code Detection Step (019-lhdn-einv-flow-2)

Detects QR codes in receipt images using:
1. Gemini Vision (primary) — reads QR code URLs from photos reliably
2. OpenCV QR detector (fallback) — works on clean/straight images

Extracts URLs and filters out LHDN validation QR codes.
Returns merchant buyer-info form URLs.
"""

import re
import os
import json
import base64
from typing import List
import numpy as np
import httpx

# LHDN validation QR pattern — these are NOT merchant form URLs
LHDN_QR_PATTERN = re.compile(r"myinvois\.hasil\.gov\.my", re.IGNORECASE)

# Valid URL pattern
URL_PATTERN = re.compile(r"^https?://", re.IGNORECASE)

# Extract URLs from Gemini response text
URL_EXTRACT_PATTERN = re.compile(r"https?://[^\s\"'<>\]\)]+")


def _detect_with_gemini(image_bytes: bytes, mime_type: str, document_id: str) -> List[str]:
    """Use Gemini Vision to read QR code URLs from receipt image."""
    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print(f"[{document_id}] QR Detection [gemini]: No API key available")
        return []

    b64_image = base64.b64encode(image_bytes).decode("utf-8")

    # Use Gemini Flash for speed — this is a simple visual task
    model = "gemini-2.0-flash"
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"

    payload = {
        "contents": [{
            "parts": [
                {
                    "inlineData": {
                        "mimeType": mime_type if mime_type.startswith("image/") else "image/jpeg",
                        "data": b64_image,
                    }
                },
                {
                    "text": (
                        "This is a receipt image. Look for any QR codes in the image. "
                        "If you find a QR code, tell me the exact URL it encodes. "
                        "Return ONLY the URL(s), one per line. If no QR code or no URL found, return 'NONE'. "
                        "Do not explain, just return the URL(s) or NONE."
                    )
                }
            ]
        }],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 256,
        }
    }

    try:
        response = httpx.post(url, json=payload, timeout=15.0)
        response.raise_for_status()
        result = response.json()

        text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        print(f"[{document_id}] QR Detection [gemini]: response: {text[:200]}")

        if "NONE" in text.upper() and len(text.strip()) < 10:
            return []

        # Extract URLs from the response
        urls = URL_EXTRACT_PATTERN.findall(text)
        # Clean trailing punctuation
        urls = [u.rstrip(".,;:)") for u in urls]
        print(f"[{document_id}] QR Detection [gemini]: extracted {len(urls)} URLs")
        return urls

    except Exception as e:
        print(f"[{document_id}] QR Detection [gemini]: error - {str(e)}")
        return []


def _detect_with_opencv(image_bytes: bytes, document_id: str) -> List[str]:
    """Fallback: OpenCV QR detector with image pre-processing."""
    try:
        import cv2
    except ImportError:
        return []

    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        return []

    detector = cv2.QRCodeDetector()
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    variants = [
        ("original", image),
        ("grayscale", gray),
    ]
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants.append(("otsu", otsu))

    for label, variant in variants:
        try:
            retval, decoded_info, _, _ = detector.detectAndDecodeMulti(variant)
            if retval and decoded_info:
                results = [d for d in decoded_info if d]
                if results:
                    print(f"[{document_id}] QR Detection [opencv/{label}]: decoded {len(results)} codes")
                    return results
        except Exception:
            pass

    return []


def detect_qr_step(
    document_id: str,
    image_bytes: bytes,
    mime_type: str = "image/png",
) -> dict:
    """
    Detect QR codes in a receipt image and extract URLs.
    Primary: Gemini Vision. Fallback: OpenCV.
    """
    print(f"[{document_id}] QR Detection: Starting")

    detected_qr_codes: List[str] = []
    merchant_form_urls: List[str] = []
    lhdn_validation_urls: List[str] = []

    try:
        # Try Gemini Vision first (best for camera photos)
        decoded_data = _detect_with_gemini(image_bytes, mime_type, document_id)

        # Fallback to OpenCV if Gemini returned nothing
        if not decoded_data:
            decoded_data = _detect_with_opencv(image_bytes, document_id)

        if not decoded_data:
            print(f"[{document_id}] QR Detection: No QR codes decoded")
        else:
            for i, data in enumerate(decoded_data):
                print(f"[{document_id}] QR Detection: Code #{i} raw data: {data[:150]}")
                detected_qr_codes.append(data)

                if URL_PATTERN.match(data):
                    if LHDN_QR_PATTERN.search(data):
                        lhdn_validation_urls.append(data)
                        print(f"[{document_id}] QR Detection: LHDN validation QR")
                    else:
                        merchant_form_urls.append(data)
                        print(f"[{document_id}] QR Detection: Merchant form URL found")
                else:
                    print(f"[{document_id}] QR Detection: Non-URL QR data: {data[:50]}...")

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

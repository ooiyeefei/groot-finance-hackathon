"""
QR Code Detection Step (019-lhdn-einv-flow-2)

Detects QR codes in receipt images using pyzbar.
Extracts URLs and filters out LHDN validation QR codes.
Returns merchant buyer-info form URLs.
"""

import re
from typing import List, Optional
from PIL import Image
from io import BytesIO


# LHDN validation QR pattern — these are NOT merchant form URLs
LHDN_QR_PATTERN = re.compile(r"myinvois\.hasil\.gov\.my", re.IGNORECASE)

# Valid URL pattern
URL_PATTERN = re.compile(r"^https?://", re.IGNORECASE)


def detect_qr_step(
    document_id: str,
    image_bytes: bytes,
    mime_type: str = "image/png",
) -> dict:
    """
    Detect QR codes in a receipt image and extract URLs.

    Args:
        document_id: Document ID for logging
        image_bytes: Raw image bytes
        mime_type: Image MIME type

    Returns:
        Dict with:
        - detected_qr_codes: List of all detected QR code data
        - merchant_form_urls: List of non-LHDN URLs (merchant buyer-info forms)
        - lhdn_validation_urls: List of LHDN validation QR URLs
        - merchant_form_url: First non-LHDN URL (primary candidate) or None
    """
    print(f"[{document_id}] QR Detection: Starting")

    detected_qr_codes: List[str] = []
    merchant_form_urls: List[str] = []
    lhdn_validation_urls: List[str] = []

    try:
        # Import pyzbar — may not be available in all environments
        from pyzbar import pyzbar

        # Open image with Pillow
        image = Image.open(BytesIO(image_bytes))

        # Convert to RGB if needed (pyzbar works best with RGB)
        if image.mode != "RGB":
            image = image.convert("RGB")

        # Detect QR codes
        decoded_objects = pyzbar.decode(image)
        print(f"[{document_id}] QR Detection: Found {len(decoded_objects)} codes")

        for obj in decoded_objects:
            if obj.type == "QRCODE":
                data = obj.data.decode("utf-8", errors="replace")
                detected_qr_codes.append(data)

                # Check if it's a URL
                if URL_PATTERN.match(data):
                    if LHDN_QR_PATTERN.search(data):
                        lhdn_validation_urls.append(data)
                        print(f"[{document_id}] QR Detection: LHDN validation QR: {data[:80]}...")
                    else:
                        merchant_form_urls.append(data)
                        print(f"[{document_id}] QR Detection: Merchant form URL: {data[:80]}...")
                else:
                    print(f"[{document_id}] QR Detection: Non-URL QR data: {data[:50]}...")

    except ImportError:
        print(f"[{document_id}] QR Detection: pyzbar not available, skipping")
    except Exception as e:
        # QR detection failure should not fail the entire pipeline
        print(f"[{document_id}] QR Detection: Error - {str(e)}")

    result = {
        "detected_qr_codes": detected_qr_codes,
        "merchant_form_urls": merchant_form_urls,
        "lhdn_validation_urls": lhdn_validation_urls,
        "merchant_form_url": merchant_form_urls[0] if merchant_form_urls else None,
    }

    print(f"[{document_id}] QR Detection: Complete - {len(merchant_form_urls)} merchant URLs, {len(lhdn_validation_urls)} LHDN URLs")
    return result

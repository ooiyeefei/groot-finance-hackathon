"""
QR Code Detection Step (019-lhdn-einv-flow-2)

Detects QR codes in receipt images using OpenCV's built-in QR detector.
Extracts URLs and filters out LHDN validation QR codes.
Returns merchant buyer-info form URLs.
"""

import re
from typing import List
import numpy as np
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

    Uses OpenCV's built-in QRCodeDetector — no system library dependencies.

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
        import cv2

        # Decode image bytes to OpenCV format
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if image is None:
            print(f"[{document_id}] QR Detection: Failed to decode image")
            return _empty_result()

        # Use OpenCV's QR code detector
        detector = cv2.QRCodeDetector()
        retval, decoded_info, points, straight_qrcode = detector.detectAndDecodeMulti(image)

        if retval and decoded_info:
            print(f"[{document_id}] QR Detection: Found {len(decoded_info)} codes")

            for data in decoded_info:
                if not data:
                    continue

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
        else:
            print(f"[{document_id}] QR Detection: No QR codes found")

    except ImportError:
        print(f"[{document_id}] QR Detection: opencv not available, skipping")
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


def _empty_result() -> dict:
    return {
        "detected_qr_codes": [],
        "merchant_form_urls": [],
        "lhdn_validation_urls": [],
        "merchant_form_url": None,
    }

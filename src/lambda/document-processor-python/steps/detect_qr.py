"""
QR Code Detection Step (019-lhdn-einv-flow-2)

Detects QR codes in receipt images using qreader (deep learning based).
Falls back to OpenCV's built-in QR detector if qreader unavailable.
Extracts URLs and filters out LHDN validation QR codes.
Returns merchant buyer-info form URLs.
"""

import re
from typing import List
import numpy as np

# LHDN validation QR pattern — these are NOT merchant form URLs
LHDN_QR_PATTERN = re.compile(r"myinvois\.hasil\.gov\.my", re.IGNORECASE)

# Valid URL pattern
URL_PATTERN = re.compile(r"^https?://", re.IGNORECASE)


def _detect_with_qreader(image_bytes: bytes, document_id: str) -> List[str]:
    """Primary: use qreader (deep learning based, handles camera photos well)."""
    from qreader import QReader
    import cv2

    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        return []

    reader = QReader()
    decoded = reader.detect_and_decode(image=image)
    results = [d for d in decoded if d]
    print(f"[{document_id}] QR Detection [qreader]: decoded {len(results)} codes from {len(decoded)} detected")
    return results


def _detect_with_opencv(image_bytes: bytes, document_id: str) -> List[str]:
    """Fallback: OpenCV QR detector with image pre-processing passes."""
    import cv2

    nparr = np.frombuffer(image_bytes, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        return []

    detector = cv2.QRCodeDetector()
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

    # Try multiple variants
    variants = [
        ("original", image),
        ("grayscale", gray),
    ]
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants.append(("otsu", otsu))
    adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 51, 10)
    variants.append(("adaptive", adaptive))

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

    print(f"[{document_id}] QR Detection [opencv]: tried {len(variants)} variants, none decoded")
    return []


def detect_qr_step(
    document_id: str,
    image_bytes: bytes,
    mime_type: str = "image/png",
) -> dict:
    """
    Detect QR codes in a receipt image and extract URLs.
    Primary: qreader (deep learning). Fallback: OpenCV multi-pass.
    """
    print(f"[{document_id}] QR Detection: Starting")

    detected_qr_codes: List[str] = []
    merchant_form_urls: List[str] = []
    lhdn_validation_urls: List[str] = []

    try:
        # Try qreader first (deep learning — best for camera photos)
        decoded_data: List[str] = []
        try:
            decoded_data = _detect_with_qreader(image_bytes, document_id)
        except Exception as e:
            print(f"[{document_id}] QR Detection: qreader failed ({e}), falling back to OpenCV")

        # Fallback to OpenCV if qreader returned nothing
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
                        print(f"[{document_id}] QR Detection: LHDN validation QR: {data[:80]}...")
                    else:
                        merchant_form_urls.append(data)
                        print(f"[{document_id}] QR Detection: Merchant form URL: {data[:80]}...")
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

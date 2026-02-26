"""
QR Code Detection Step (019-lhdn-einv-flow-2)

Detects QR codes in receipt images using OpenCV's built-in QR detector
with multiple image pre-processing passes for reliability on phone photos.
Extracts URLs and filters out LHDN validation QR codes.
Returns merchant buyer-info form URLs.
"""

import re
from typing import List, Tuple
import numpy as np

# LHDN validation QR pattern — these are NOT merchant form URLs
LHDN_QR_PATTERN = re.compile(r"myinvois\.hasil\.gov\.my", re.IGNORECASE)

# Valid URL pattern
URL_PATTERN = re.compile(r"^https?://", re.IGNORECASE)


def _try_decode(detector, image, label: str, document_id: str) -> List[str]:
    """Try to detect and decode QR codes from a single image variant."""
    try:
        retval, decoded_info, points, _ = detector.detectAndDecodeMulti(image)
        if retval and decoded_info:
            results = [d for d in decoded_info if d]
            if results:
                print(f"[{document_id}] QR Detection [{label}]: decoded {len(results)} codes")
            return results
    except Exception:
        pass
    return []


def _prepare_variants(image) -> List[Tuple[str, any]]:
    """Generate multiple pre-processed image variants for QR detection."""
    import cv2

    variants = []

    # 1. Original color image
    variants.append(("original", image))

    # 2. Grayscale
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    variants.append(("grayscale", gray))

    # 3. Grayscale + OTSU threshold (best for printed receipts)
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants.append(("otsu", otsu))

    # 4. Adaptive threshold (handles uneven lighting from photos)
    adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 51, 10)
    variants.append(("adaptive", adaptive))

    # 5. Sharpened (helps with slightly blurry photos)
    kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    sharpened = cv2.filter2D(gray, -1, kernel)
    variants.append(("sharpened", sharpened))

    # 6. Upscaled 2x (helps with small QR codes)
    h, w = gray.shape[:2]
    if max(h, w) < 2000:
        upscaled = cv2.resize(gray, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
        _, upscaled_otsu = cv2.threshold(upscaled, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        variants.append(("upscaled_otsu", upscaled_otsu))

    return variants


def detect_qr_step(
    document_id: str,
    image_bytes: bytes,
    mime_type: str = "image/png",
) -> dict:
    """
    Detect QR codes in a receipt image and extract URLs.

    Uses OpenCV QRCodeDetector with multiple pre-processing passes
    for reliability on phone camera photos.
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

        h, w = image.shape[:2]
        print(f"[{document_id}] QR Detection: Image size {w}x{h}")

        detector = cv2.QRCodeDetector()

        # Try multiple image variants — stop at first successful decode
        decoded_data: List[str] = []
        variants = _prepare_variants(image)

        for label, variant in variants:
            decoded_data = _try_decode(detector, variant, label, document_id)
            if decoded_data:
                break

        if not decoded_data:
            print(f"[{document_id}] QR Detection: Tried {len(variants)} variants, no QR decoded")
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

    except ImportError:
        print(f"[{document_id}] QR Detection: opencv not available, skipping")
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


def _empty_result() -> dict:
    return {
        "detected_qr_codes": [],
        "merchant_form_urls": [],
        "lhdn_validation_urls": [],
        "merchant_form_url": None,
    }

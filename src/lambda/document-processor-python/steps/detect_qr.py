"""
QR Code Detection Step (019-lhdn-einv-flow-2)

Detects QR codes in receipt images using pyzbar with OpenCV pre-processing.
Multiple image variants tried for reliability on camera photos.
Extracts URLs and filters out LHDN validation QR codes.
Returns merchant buyer-info form URLs.
"""

import re
from typing import List, Tuple
import numpy as np
from PIL import Image
from io import BytesIO

# LHDN validation QR pattern — these are NOT merchant form URLs
LHDN_QR_PATTERN = re.compile(r"myinvois\.hasil\.gov\.my", re.IGNORECASE)

# Valid URL pattern
URL_PATTERN = re.compile(r"^https?://", re.IGNORECASE)


def _try_pyzbar(image: Image.Image, label: str, document_id: str) -> List[str]:
    """Try to decode QR codes from a PIL Image using pyzbar."""
    from pyzbar import pyzbar as pyzbar_decode

    decoded = pyzbar_decode.decode(image)
    results = []
    for obj in decoded:
        if obj.type == "QRCODE":
            data = obj.data.decode("utf-8", errors="replace")
            if data:
                results.append(data)

    if results:
        print(f"[{document_id}] QR Detection [pyzbar/{label}]: decoded {len(results)} QR codes")
    return results


def _prepare_variants(image_bytes: bytes) -> List[Tuple[str, Image.Image]]:
    """Generate multiple pre-processed image variants for QR detection."""
    import cv2

    # Original PIL image
    pil_image = Image.open(BytesIO(image_bytes))
    if pil_image.mode != "RGB":
        pil_image = pil_image.convert("RGB")

    variants: List[Tuple[str, Image.Image]] = [("original", pil_image)]

    # OpenCV variants
    nparr = np.frombuffer(image_bytes, np.uint8)
    cv_image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if cv_image is None:
        return variants

    gray = cv2.cvtColor(cv_image, cv2.COLOR_BGR2GRAY)

    # Grayscale
    variants.append(("grayscale", Image.fromarray(gray)))

    # OTSU threshold
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants.append(("otsu", Image.fromarray(otsu)))

    # Adaptive threshold
    adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 51, 10)
    variants.append(("adaptive", Image.fromarray(adaptive)))

    # Sharpened
    kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
    sharpened = cv2.filter2D(gray, -1, kernel)
    variants.append(("sharpened", Image.fromarray(sharpened)))

    # Upscaled 2x (helps with small QR codes)
    h, w = gray.shape[:2]
    if max(h, w) < 2000:
        upscaled = cv2.resize(gray, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
        _, up_otsu = cv2.threshold(upscaled, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        variants.append(("upscaled_otsu", Image.fromarray(up_otsu)))

    return variants


def detect_qr_step(
    document_id: str,
    image_bytes: bytes,
    mime_type: str = "image/png",
) -> dict:
    """
    Detect QR codes in a receipt image and extract URLs.
    Uses pyzbar with multiple OpenCV pre-processing passes.
    """
    print(f"[{document_id}] QR Detection: Starting")

    detected_qr_codes: List[str] = []
    merchant_form_urls: List[str] = []
    lhdn_validation_urls: List[str] = []

    try:
        variants = _prepare_variants(image_bytes)
        print(f"[{document_id}] QR Detection: Trying {len(variants)} image variants")

        decoded_data: List[str] = []
        for label, pil_img in variants:
            decoded_data = _try_pyzbar(pil_img, label, document_id)
            if decoded_data:
                break

        if not decoded_data:
            print(f"[{document_id}] QR Detection: No QR codes decoded after {len(variants)} variants")
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

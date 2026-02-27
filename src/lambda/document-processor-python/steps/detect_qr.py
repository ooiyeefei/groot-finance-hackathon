"""
QR Code Detection Step (019-lhdn-einv-flow-2)

Detects QR codes in receipt images using pyzbar with Pillow pre-processing.
Multiple image variants tried for reliability on camera photos.
Extracts URLs and filters out LHDN validation QR codes.
Returns merchant buyer-info form URLs.
"""

import re
from typing import List, Tuple
from PIL import Image, ImageFilter, ImageEnhance
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
    """Generate multiple pre-processed image variants using Pillow only (no OpenCV)."""
    pil_image = Image.open(BytesIO(image_bytes))
    if pil_image.mode != "RGB":
        pil_image = pil_image.convert("RGB")

    variants: List[Tuple[str, Image.Image]] = []

    # 1. Original
    variants.append(("original", pil_image))

    # 2. Grayscale
    gray = pil_image.convert("L")
    variants.append(("grayscale", gray))

    # 3. High contrast grayscale (threshold at midpoint)
    threshold = gray.point(lambda p: 255 if p > 128 else 0)
    variants.append(("threshold_128", threshold))

    # 4. Sharpened
    sharpened = gray.filter(ImageFilter.SHARPEN)
    variants.append(("sharpened", sharpened))

    # 5. Enhanced contrast
    enhancer = ImageEnhance.Contrast(gray)
    high_contrast = enhancer.enhance(2.0)
    variants.append(("high_contrast", high_contrast))

    # 6. Upscaled 2x
    w, h = gray.size
    upscaled_2x = gray.resize((w * 2, h * 2), Image.LANCZOS)
    variants.append(("upscaled_2x", upscaled_2x))

    # 7. Upscaled 2x + threshold
    up_threshold = upscaled_2x.point(lambda p: 255 if p > 128 else 0)
    variants.append(("upscaled_threshold", up_threshold))

    # 8. Upscaled 3x + sharpen (aggressive — for small/angled QR codes)
    upscaled_3x = gray.resize((w * 3, h * 3), Image.LANCZOS)
    up3_sharp = upscaled_3x.filter(ImageFilter.SHARPEN)
    variants.append(("upscaled_3x_sharp", up3_sharp))

    # 9. Lower threshold (catches darker QR codes)
    threshold_low = gray.point(lambda p: 255 if p > 96 else 0)
    variants.append(("threshold_96", threshold_low))

    # 10. High threshold (catches lighter QR codes)
    threshold_high = gray.point(lambda p: 255 if p > 160 else 0)
    variants.append(("threshold_160", threshold_high))

    return variants


def detect_qr_step(
    document_id: str,
    image_bytes: bytes,
    mime_type: str = "image/png",
) -> dict:
    """
    Detect QR codes in a receipt image and extract URLs.
    Uses pyzbar with multiple Pillow pre-processing passes.
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

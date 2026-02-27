"""
QR Code Detection Step (019-lhdn-einv-flow-2)

Detects QR codes in receipt images using zxing-cpp.
Pure Python wheel — zero system library dependencies, decodes camera photos reliably.
Extracts URLs and filters out LHDN validation QR codes.
Returns merchant buyer-info form URLs.
"""

import re
from typing import List
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
    Uses zxing-cpp — handles camera photos with glare/angles out of the box.
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
                data = qr.text
                print(f"[{document_id}] QR Detection: Code #{i} data: {data[:150]}")
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

"""
QR Code Detection Library Comparison Test

Tests multiple QR detection libraries against the FamilyMart receipt image.
Expected result: https://fmeinvoice.ql.com.my/?storeCode=0346&receiptNo=00000P1331000531809&transDate=2026-02-26
"""

import sys
import time
from pathlib import Path
from PIL import Image, ImageFilter, ImageEnhance
from io import BytesIO

TEST_IMAGE = Path(__file__).parent / "WhatsApp Image 2026-02-26 at 19.41.08.jpeg"
EXPECTED_URL = "fmeinvoice.ql.com.my"


def test_pyzbar():
    """Test 1: pyzbar (requires libzbar.so system library)"""
    try:
        from pyzbar import pyzbar
    except ImportError as e:
        return f"SKIP - {e}"

    img = Image.open(TEST_IMAGE).convert("RGB")

    # Try multiple variants
    variants = {
        "original": img,
        "grayscale": img.convert("L"),
        "threshold_128": img.convert("L").point(lambda p: 255 if p > 128 else 0),
        "sharpen": img.convert("L").filter(ImageFilter.SHARPEN),
        "contrast_2x": ImageEnhance.Contrast(img.convert("L")).enhance(2.0),
    }

    # Add upscaled variants
    gray = img.convert("L")
    w, h = gray.size
    for scale in [2, 3, 4]:
        up = gray.resize((w * scale, h * scale), Image.LANCZOS)
        variants[f"upscaled_{scale}x"] = up
        variants[f"upscaled_{scale}x_thresh"] = up.point(lambda p: 255 if p > 128 else 0)
        variants[f"upscaled_{scale}x_sharp"] = up.filter(ImageFilter.SHARPEN)

    for name, variant in variants.items():
        decoded = pyzbar.decode(variant)
        qr_results = [obj.data.decode("utf-8") for obj in decoded if obj.type == "QRCODE"]
        if qr_results:
            return f"OK [{name}] → {qr_results[0][:100]}"

    return f"FAIL - tried {len(variants)} variants, none decoded"


def test_opencv_qr():
    """Test 2: OpenCV QRCodeDetector (built-in, no system deps)"""
    try:
        import cv2
        import numpy as np
    except ImportError as e:
        return f"SKIP - {e}"

    img = cv2.imread(str(TEST_IMAGE))
    if img is None:
        return "FAIL - could not read image"

    detector = cv2.QRCodeDetector()
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    variants = {
        "original": img,
        "gray": gray,
    }
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    variants["otsu"] = otsu
    adaptive = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 51, 10)
    variants["adaptive"] = adaptive

    # Upscaled
    h, w = gray.shape[:2]
    for scale in [2, 3]:
        up = cv2.resize(gray, (w * scale, h * scale), interpolation=cv2.INTER_CUBIC)
        variants[f"upscaled_{scale}x"] = up

    for name, variant in variants.items():
        retval, decoded_info, _, _ = detector.detectAndDecodeMulti(variant)
        if retval and decoded_info:
            results = [d for d in decoded_info if d]
            if results:
                return f"OK [{name}] → {results[0][:100]}"

    return f"FAIL - tried {len(variants)} variants, none decoded"


def test_opencv_wechat_qr():
    """Test 3: OpenCV WeChat QRCode detector (more robust, uses CNN)"""
    try:
        import cv2
        import numpy as np
    except ImportError as e:
        return f"SKIP - {e}"

    # Check if wechat_qrcode is available
    try:
        detector = cv2.wechat_qrcode.WeChatQRCode()
    except AttributeError:
        return "SKIP - cv2.wechat_qrcode not available (need opencv-contrib-python)"
    except Exception as e:
        return f"SKIP - {e}"

    img = cv2.imread(str(TEST_IMAGE))
    if img is None:
        return "FAIL - could not read image"

    results, points = detector.detectAndDecode(img)
    if results:
        decoded = [r for r in results if r]
        if decoded:
            return f"OK → {decoded[0][:100]}"

    return "FAIL - no QR decoded"


def test_qreader():
    """Test 4: QReader (deep learning based - YOLOv8 + decoder)"""
    try:
        from qreader import QReader
        import cv2
        import numpy as np
    except ImportError as e:
        return f"SKIP - {e}"

    img = cv2.imread(str(TEST_IMAGE))
    if img is None:
        return "FAIL - could not read image"

    reader = QReader()
    decoded = reader.detect_and_decode(image=img)
    results = [d for d in decoded if d]
    if results:
        return f"OK → {results[0][:100]}"

    return "FAIL - no QR decoded"


def test_zxingcpp():
    """Test 5: zxing-cpp (C++ port, pip install zxing-cpp)"""
    try:
        import zxingcpp
    except ImportError as e:
        return f"SKIP - {e}"

    img = Image.open(TEST_IMAGE).convert("RGB")

    # Try original
    results = zxingcpp.read_barcodes(img)
    qr_results = [r.text for r in results if r.format.name == "QRCode"]
    if qr_results:
        return f"OK [original] → {qr_results[0][:100]}"

    # Try grayscale
    gray = img.convert("L")
    results = zxingcpp.read_barcodes(gray)
    qr_results = [r.text for r in results if r.format.name == "QRCode"]
    if qr_results:
        return f"OK [grayscale] → {qr_results[0][:100]}"

    # Try upscaled
    w, h = gray.size
    for scale in [2, 3]:
        up = gray.resize((w * scale, h * scale), Image.LANCZOS)
        results = zxingcpp.read_barcodes(up)
        qr_results = [r.text for r in results if r.format.name == "QRCode"]
        if qr_results:
            return f"OK [upscaled_{scale}x] → {qr_results[0][:100]}"

    return "FAIL - no QR decoded"


if __name__ == "__main__":
    if not TEST_IMAGE.exists():
        print(f"ERROR: Test image not found at {TEST_IMAGE}")
        sys.exit(1)

    print(f"Test image: {TEST_IMAGE}")
    print(f"Expected URL contains: {EXPECTED_URL}")
    print(f"Image size: {Image.open(TEST_IMAGE).size}")
    print("=" * 70)

    tests = [
        ("pyzbar", test_pyzbar),
        ("OpenCV QR", test_opencv_qr),
        ("OpenCV WeChat QR", test_opencv_wechat_qr),
        ("QReader (DL)", test_qreader),
        ("zxing-cpp", test_zxingcpp),
    ]

    for name, test_fn in tests:
        start = time.time()
        try:
            result = test_fn()
        except Exception as e:
            result = f"ERROR - {e}"
        elapsed = time.time() - start

        status = "✅" if "OK" in result else "⏭️" if "SKIP" in result else "❌"
        match = "📎" if EXPECTED_URL in result else ""
        print(f"{status} {name:20s} ({elapsed:.2f}s): {result} {match}")

"""
PDF Conversion Step

Converts PDF documents to images for OCR processing using pdf2image (Poppler).
Integrates directly with the Lambda Layer that provides Poppler libraries.
"""

import io
import os
from typing import Dict, Any, List, Tuple, Optional

from pdf2image import convert_from_bytes
from PIL import Image

from utils.s3_client import S3Client, ConvertedImageInfo


def convert_pdf_step(
    document_id: str,
    storage_path: str,
    domain: str,
    s3: S3Client,
    dpi: int = 200,
    max_pages: int = 10,
) -> Dict[str, Any]:
    """
    Convert PDF to images for OCR processing.

    Args:
        document_id: Document ID for logging
        storage_path: S3 path to PDF (without domain prefix)
        domain: 'invoices' or 'expense_claims'
        s3: S3 client instance
        dpi: DPI for image conversion (default 200 for OCR balance)
        max_pages: Maximum pages to convert

    Returns:
        Dict with:
        - status: 'success' or 'failed'
        - images: List of ConvertedImageInfo (if successful)
        - error: Error message (if failed)
        - total_pages: Number of pages in PDF
    """
    print(f"[{document_id}] Converting PDF to images (DPI: {dpi})")

    try:
        # Build full S3 key
        s3_key = s3.get_full_s3_key(storage_path, domain)
        print(f"[{document_id}] Reading PDF from S3: {s3_key}")

        # Read PDF from S3
        pdf_bytes = s3.read_document(s3_key)
        print(f"[{document_id}] PDF size: {len(pdf_bytes)} bytes")

        # Configure Poppler path for Lambda Layer
        # The Layer provides Poppler at /opt/bin/
        poppler_path = os.environ.get("POPPLER_PATH", "/opt/bin")

        # Convert PDF to images
        print(f"[{document_id}] Converting with pdf2image...")
        pil_images = convert_from_bytes(
            pdf_bytes,
            dpi=dpi,
            fmt="png",
            first_page=1,
            last_page=max_pages,
            poppler_path=poppler_path if os.path.exists(poppler_path) else None,
        )

        total_pages = len(pil_images)
        print(f"[{document_id}] Converted {total_pages} page(s)")

        # Convert PIL images to bytes and collect metadata
        images_data: List[Tuple[bytes, int, int]] = []
        for page_num, pil_image in enumerate(pil_images, start=1):
            # Convert to PNG bytes
            img_buffer = io.BytesIO()
            pil_image.save(img_buffer, format="PNG", optimize=True)
            img_bytes = img_buffer.getvalue()

            width, height = pil_image.size
            images_data.append((img_bytes, width, height))
            print(f"[{document_id}] Page {page_num}: {width}x{height} ({len(img_bytes)} bytes)")

        # Write converted images to S3
        print(f"[{document_id}] Writing converted images to S3...")
        converted_images = s3.write_converted_images(
            images=images_data,
            document_id=document_id,
            domain=domain,
            storage_path=storage_path,
        )

        # Build images as dicts for SDK serialization (not dataclass objects)
        # AWS Durable SDK can only serialize JSON-compatible types
        images_list = [
            {
                "page_number": img.page_number,
                "s3_key": img.s3_key,
                "width": img.width,
                "height": img.height,
                "mime_type": img.mime_type,
            }
            for img in converted_images
        ]

        # Page metadata for Convex (camelCase)
        page_metadata = [
            {
                "pageNumber": img.page_number,
                "s3Key": img.s3_key,
                "width": img.width,
                "height": img.height,
            }
            for img in converted_images
        ]

        print(f"[{document_id}] PDF conversion complete")
        return {
            "status": "success",
            "images": images_list,  # List of dicts, not ConvertedImageInfo objects
            "total_pages": total_pages,
            "page_metadata": page_metadata,
            "first_image_path": converted_images[0].s3_key if converted_images else None,
        }

    except Exception as e:
        error_msg = f"PDF conversion failed: {str(e)}"
        print(f"[{document_id}] {error_msg}")
        return {
            "status": "failed",
            "error": error_msg,
            "images": None,
        }


def get_image_from_s3(
    s3: S3Client,
    storage_path: str,
    domain: str,
) -> Tuple[bytes, str]:
    """
    Read an image directly from S3.

    Used when the original document is already an image (not PDF).

    Args:
        s3: S3 client
        storage_path: S3 path (without domain prefix)
        domain: 'invoices' or 'expense_claims'

    Returns:
        Tuple of (image_bytes, mime_type)
    """
    s3_key = s3.get_full_s3_key(storage_path, domain)
    image_bytes = s3.read_document(s3_key)

    # Detect MIME type from file extension
    mime_type = "image/png"
    lower_path = storage_path.lower()
    if lower_path.endswith(".jpg") or lower_path.endswith(".jpeg"):
        mime_type = "image/jpeg"
    elif lower_path.endswith(".webp"):
        mime_type = "image/webp"
    elif lower_path.endswith(".gif"):
        mime_type = "image/gif"

    return image_bytes, mime_type

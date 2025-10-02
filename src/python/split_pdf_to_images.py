#!/usr/bin/env python3
"""
PDF Page Splitting Engine
Converts multi-page PDFs into individual page images with signed URLs
Compatible with FinanSeal's standardized storage architecture
"""

import sys
import json
import os
import tempfile
import requests
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

# PDF and image processing imports
try:
    from pdf2image import convert_from_bytes, convert_from_path
    from PIL import Image
    import fitz  # PyMuPDF as fallback
    PDF_LIBRARIES_AVAILABLE = True
except ImportError as e:
    print(f"[SplitPDF] PDF processing libraries not available: {e}", file=sys.stderr)
    PDF_LIBRARIES_AVAILABLE = False

# Supabase client import
try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    print(f"[SplitPDF] Supabase client not available, using mock mode", file=sys.stderr)
    SUPABASE_AVAILABLE = False

def setup_supabase_client() -> Client:
    """Initialize Supabase client for storage operations"""
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_ANON_KEY")

    if not supabase_url or not supabase_key:
        raise ValueError("Missing Supabase credentials: SUPABASE_URL and SUPABASE_ANON_KEY required")

    return create_client(supabase_url, supabase_key)

def download_pdf_from_storage(pdf_storage_path: str) -> bytes:
    """Download PDF from Supabase storage using storage path"""
    try:
        print(f"[SplitPDF] Downloading PDF from storage path: {pdf_storage_path}", file=sys.stderr)

        if not SUPABASE_AVAILABLE:
            raise ValueError("Supabase client not available")

        supabase = setup_supabase_client()

        # Create signed URL for PDF access (10 minute expiry)
        response = supabase.storage.from_('documents').create_signed_url(
            pdf_storage_path,
            expires_in=600
        )

        if not response or 'signedURL' not in response:
            raise ValueError("Failed to create signed URL for PDF")

        signed_url = response['signedURL']
        print(f"[SplitPDF] Created signed URL for PDF download", file=sys.stderr)

        # Download PDF content
        pdf_response = requests.get(signed_url, timeout=60)
        pdf_response.raise_for_status()

        pdf_bytes = pdf_response.content
        print(f"[SplitPDF] Downloaded PDF: {len(pdf_bytes)} bytes", file=sys.stderr)

        return pdf_bytes

    except Exception as e:
        print(f"[SplitPDF] Error downloading PDF: {str(e)}", file=sys.stderr)
        raise

def convert_pdf_to_page_images(pdf_bytes: bytes, dpi: int = 150) -> List[Image.Image]:
    """Convert PDF bytes to list of PIL Images using pdf2image with PyMuPDF fallback"""
    try:
        if not PDF_LIBRARIES_AVAILABLE:
            raise ValueError("PDF processing libraries not available")

        print(f"[SplitPDF] Converting PDF to images (DPI: {dpi})", file=sys.stderr)

        # Primary method: pdf2image (more reliable)
        try:
            images = convert_from_bytes(
                pdf_bytes,
                dpi=dpi,
                fmt='RGB',
                thread_count=2  # Limit threads for stability
            )
            print(f"[SplitPDF] Successfully converted {len(images)} pages using pdf2image", file=sys.stderr)
            return images

        except Exception as pdf2image_error:
            print(f"[SplitPDF] pdf2image failed, trying PyMuPDF: {pdf2image_error}", file=sys.stderr)

            # Fallback method: PyMuPDF
            with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as temp_pdf:
                temp_pdf.write(pdf_bytes)
                temp_pdf_path = temp_pdf.name

            try:
                pdf_doc = fitz.open(temp_pdf_path)
                images = []

                for page_num in range(pdf_doc.page_count):
                    page = pdf_doc[page_num]
                    # Convert to image with scaling for quality
                    mat = fitz.Matrix(dpi/72.0, dpi/72.0)  # Scale factor for DPI
                    pix = page.get_pixmap(matrix=mat)
                    img_data = pix.tobytes("ppm")

                    # Convert to PIL Image
                    from io import BytesIO
                    pil_image = Image.open(BytesIO(img_data))
                    images.append(pil_image)

                pdf_doc.close()
                print(f"[SplitPDF] Successfully converted {len(images)} pages using PyMuPDF", file=sys.stderr)
                return images

            finally:
                # Clean up temp file
                if os.path.exists(temp_pdf_path):
                    os.unlink(temp_pdf_path)

    except Exception as e:
        print(f"[SplitPDF] Error converting PDF to images: {str(e)}", file=sys.stderr)
        raise

def upload_page_image_to_storage(page_image: Image.Image, document_id: str, page_number: int, pdf_storage_path: str) -> str:
    """Upload page image to Supabase storage and return signed URL"""
    try:
        if not SUPABASE_AVAILABLE:
            raise ValueError("Supabase client not available")

        supabase = setup_supabase_client()

        # Convert PIL Image to bytes
        from io import BytesIO
        img_buffer = BytesIO()
        page_image.save(img_buffer, format='JPEG', quality=85, optimize=True)
        img_bytes = img_buffer.getvalue()

        # Generate storage path for this page using standardized documentId-based structure
        # Extract directory from original PDF path to maintain proper structure
        pdf_dir = '/'.join(pdf_storage_path.split('/')[:-1])  # Remove filename, keep directory structure
        storage_path = f"{pdf_dir}/{document_id}/converted/page_{page_number}.jpg"

        print(f"[SplitPDF] Uploading page {page_number} to storage: {storage_path}", file=sys.stderr)

        # Upload to Supabase storage
        upload_response = supabase.storage.from_('documents').upload(
            storage_path,
            img_bytes,
            file_options={
                'content-type': 'image/jpeg',
                'upsert': True  # Replace if exists
            }
        )

        if not upload_response:
            raise ValueError(f"Failed to upload page {page_number} to storage")

        # Create signed URL for the uploaded image (24 hour expiry for processing)
        signed_url_response = supabase.storage.from_('documents').create_signed_url(
            storage_path,
            expires_in=86400  # 24 hours
        )

        if not signed_url_response or 'signedURL' not in signed_url_response:
            raise ValueError(f"Failed to create signed URL for page {page_number}")

        signed_url = signed_url_response['signedURL']
        print(f"[SplitPDF] Successfully uploaded and created signed URL for page {page_number}", file=sys.stderr)

        return signed_url

    except Exception as e:
        print(f"[SplitPDF] Error uploading page {page_number}: {str(e)}", file=sys.stderr)
        raise

def split_pdf_to_page_urls(pdf_storage_path: str, document_id: str) -> Dict[str, Any]:
    """
    Main function to split PDF into page images and return signed URLs

    Args:
        pdf_storage_path: Storage path of the PDF in Supabase
        document_id: Document ID for organizing page storage

    Returns:
        Dict with success status and page URLs or error message
    """
    try:
        print(f"[SplitPDF] Starting PDF splitting for document {document_id}", file=sys.stderr)
        start_time = datetime.now()

        # Step 1: Download PDF from storage
        print(f"[SplitPDF] Step 1: Downloading PDF", file=sys.stderr)
        pdf_bytes = download_pdf_from_storage(pdf_storage_path)

        # Step 2: Convert PDF to page images
        print(f"[SplitPDF] Step 2: Converting PDF to page images", file=sys.stderr)
        page_images = convert_pdf_to_page_images(pdf_bytes)

        if not page_images:
            raise ValueError("No pages found in PDF")

        print(f"[SplitPDF] Found {len(page_images)} pages in PDF", file=sys.stderr)

        # Step 3: Upload each page and collect signed URLs
        print(f"[SplitPDF] Step 3: Uploading page images to storage", file=sys.stderr)
        page_urls = []

        for page_num, page_image in enumerate(page_images, start=1):
            print(f"[SplitPDF] Processing page {page_num}/{len(page_images)}", file=sys.stderr)

            signed_url = upload_page_image_to_storage(page_image, document_id, page_num, pdf_storage_path)
            page_urls.append(signed_url)

            print(f"[SplitPDF] Page {page_num} completed", file=sys.stderr)

        # Calculate processing time
        end_time = datetime.now()
        processing_time = (end_time - start_time).total_seconds()

        print(f"[SplitPDF] PDF splitting completed in {processing_time:.2f} seconds", file=sys.stderr)
        print(f"[SplitPDF] Successfully processed {len(page_urls)} pages", file=sys.stderr)

        return {
            'success': True,
            'page_urls': page_urls,
            'total_pages': len(page_urls),
            'processing_time_seconds': processing_time,
            'document_id': document_id
        }

    except Exception as e:
        error_msg = str(e)
        print(f"[SplitPDF] PDF splitting failed: {error_msg}", file=sys.stderr)

        return {
            'success': False,
            'error': error_msg,
            'document_id': document_id,
            'error_type': type(e).__name__
        }

def main():
    """Main entry point for CLI usage"""
    try:
        if len(sys.argv) != 3:
            error_result = {
                'success': False,
                'error': 'Invalid arguments. Usage: python split_pdf_to_images.py <pdf_storage_path> <document_id>',
                'error_type': 'ArgumentError'
            }
            print(json.dumps(error_result, indent=2))
            sys.exit(1)

        pdf_storage_path = sys.argv[1]
        document_id = sys.argv[2]

        print(f"[SplitPDF] Starting PDF splitting process", file=sys.stderr)
        print(f"[SplitPDF] PDF storage path: {pdf_storage_path}", file=sys.stderr)
        print(f"[SplitPDF] Document ID: {document_id}", file=sys.stderr)

        result = split_pdf_to_page_urls(pdf_storage_path, document_id)

        # Output result as clean JSON to stdout
        print(json.dumps(result, indent=2))

    except Exception as e:
        error_result = {
            'success': False,
            'error': f"Main function error: {str(e)}",
            'error_type': type(e).__name__
        }
        print(json.dumps(error_result, indent=2))
        sys.exit(1)

if __name__ == "__main__":
    main()
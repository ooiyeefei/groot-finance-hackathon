#!/usr/bin/env python3
"""
General PDF to Images Conversion Script
Compatible with FinanSeal's standardized storage architecture

Usage: python convert_pdf_to_images.py <pdf_signed_url> <target_storage_folder>
Returns: JSON with success status and page information
"""

import sys
import json
import os
import tempfile
import requests
from typing import List, Dict, Any
from datetime import datetime

# PDF and image processing imports
try:
    from pdf2image import convert_from_bytes
    from PIL import Image
    import fitz  # PyMuPDF as fallback
    PDF_LIBRARIES_AVAILABLE = True
except ImportError as e:
    print(f"[ConvertPDF] PDF processing libraries not available: {e}", file=sys.stderr)
    PDF_LIBRARIES_AVAILABLE = False

# Supabase client import
try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    print(f"[ConvertPDF] Supabase client not available", file=sys.stderr)
    SUPABASE_AVAILABLE = False

def setup_supabase_client() -> Client:
    """Initialize Supabase client for storage operations"""
    supabase_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or supabase_key:
        raise ValueError("Missing Supabase credentials: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")

    return create_client(supabase_url, supabase_key)

def download_pdf_from_signed_url(pdf_signed_url: str) -> bytes:
    """Download PDF from signed URL"""
    try:
        print(f"[ConvertPDF] Downloading PDF from signed URL", file=sys.stderr)

        # Download PDF content
        pdf_response = requests.get(pdf_signed_url, timeout=60)
        pdf_response.raise_for_status()

        pdf_bytes = pdf_response.content
        print(f"[ConvertPDF] Downloaded PDF: {len(pdf_bytes)} bytes", file=sys.stderr)

        return pdf_bytes

    except Exception as e:
        print(f"[ConvertPDF] Error downloading PDF: {str(e)}", file=sys.stderr)
        raise

def convert_pdf_to_page_images(pdf_bytes: bytes, dpi: int = 150) -> List[Image.Image]:
    """Convert PDF bytes to list of PIL Images using pdf2image with PyMuPDF fallback"""
    try:
        if not PDF_LIBRARIES_AVAILABLE:
            raise ValueError("PDF processing libraries not available")

        print(f"[ConvertPDF] Converting PDF to images (DPI: {dpi})", file=sys.stderr)

        # Primary method: pdf2image (more reliable)
        try:
            images = convert_from_bytes(
                pdf_bytes,
                dpi=dpi,
                fmt='PNG',  # Use PNG for better quality
                thread_count=2  # Limit threads for stability
            )
            print(f"[ConvertPDF] Successfully converted {len(images)} pages using pdf2image", file=sys.stderr)
            return images

        except Exception as pdf2image_error:
            print(f"[ConvertPDF] pdf2image failed, trying PyMuPDF: {pdf2image_error}", file=sys.stderr)

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
                print(f"[ConvertPDF] Successfully converted {len(images)} pages using PyMuPDF", file=sys.stderr)
                return images

            finally:
                # Clean up temp file
                if os.path.exists(temp_pdf_path):
                    os.unlink(temp_pdf_path)

    except Exception as e:
        print(f"[ConvertPDF] Error converting PDF to images: {str(e)}", file=sys.stderr)
        raise

def upload_page_images_to_folder(page_images: List[Image.Image], target_folder: str, document_id: str) -> List[Dict[str, Any]]:
    """Upload page images to target storage folder and return page information"""
    try:
        if not SUPABASE_AVAILABLE:
            raise ValueError("Supabase client not available")

        supabase = setup_supabase_client()
        page_info = []

        for page_num, image in enumerate(page_images, start=1):
            # Convert PIL Image to PNG bytes
            from io import BytesIO
            img_buffer = BytesIO()
            image.save(img_buffer, format='PNG', optimize=True)
            img_bytes = img_buffer.getvalue()

            # Generate storage path for this page
            page_filename = f"{document_id[:8]}_page_{page_num}.png"
            storage_path = f"{target_folder}/{page_filename}"

            print(f"[ConvertPDF] Uploading page {page_num} to: {storage_path}", file=sys.stderr)

            # Upload to Supabase storage
            upload_response = supabase.storage.from_('documents').upload(
                storage_path,
                img_bytes,
                file_options={
                    'content-type': 'image/png',
                    'upsert': True  # Replace if exists
                }
            )

            if upload_response.data is None:
                raise ValueError(f"Failed to upload page {page_num} to storage")

            # Record page information
            page_info.append({
                "page_number": page_num,
                "path": storage_path,
                "width": image.width,
                "height": image.height,
                "file_size": len(img_bytes)
            })

            print(f"[ConvertPDF] Page {page_num} uploaded successfully", file=sys.stderr)

        return page_info

    except Exception as e:
        print(f"[ConvertPDF] Error uploading pages: {str(e)}", file=sys.stderr)
        raise

def convert_pdf_to_images_main(pdf_signed_url: str, target_folder: str, document_id: str) -> Dict[str, Any]:
    """
    Main function to convert PDF to individual page images

    Args:
        pdf_signed_url: Signed URL of the PDF to convert
        target_folder: Target storage folder path
        document_id: Document ID for organizing files

    Returns:
        Dict with success status and page information
    """
    try:
        print(f"[ConvertPDF] Starting PDF conversion for document {document_id}", file=sys.stderr)
        start_time = datetime.now()

        # Step 1: Download PDF from signed URL
        print(f"[ConvertPDF] Step 1: Downloading PDF", file=sys.stderr)
        pdf_bytes = download_pdf_from_signed_url(pdf_signed_url)

        # Step 2: Convert PDF to page images
        print(f"[ConvertPDF] Step 2: Converting PDF to page images", file=sys.stderr)
        page_images = convert_pdf_to_page_images(pdf_bytes)

        if not page_images:
            raise ValueError("No pages found in PDF")

        print(f"[ConvertPDF] Found {len(page_images)} pages in PDF", file=sys.stderr)

        # Step 3: Upload pages to target folder
        print(f"[ConvertPDF] Step 3: Uploading page images to folder: {target_folder}", file=sys.stderr)
        page_info = upload_page_images_to_folder(page_images, target_folder, document_id)

        # Calculate processing time
        end_time = datetime.now()
        processing_time = (end_time - start_time).total_seconds()

        print(f"[ConvertPDF] PDF conversion completed in {processing_time:.2f} seconds", file=sys.stderr)
        print(f"[ConvertPDF] Successfully processed {len(page_info)} pages", file=sys.stderr)

        return {
            'success': True,
            'pages': page_info,
            'total_pages': len(page_info),
            'processing_time_seconds': processing_time,
            'document_id': document_id,
            'target_folder': target_folder
        }

    except Exception as e:
        error_msg = str(e)
        print(f"[ConvertPDF] PDF conversion failed: {error_msg}", file=sys.stderr)

        return {
            'success': False,
            'error': error_msg,
            'document_id': document_id,
            'error_type': type(e).__name__
        }

def main():
    """Main entry point for CLI usage"""
    try:
        if len(sys.argv) != 4:
            error_result = {
                'success': False,
                'error': 'Invalid arguments. Usage: python convert_pdf_to_images.py <pdf_signed_url> <target_folder> <document_id>',
                'error_type': 'ArgumentError'
            }
            print(json.dumps(error_result, indent=2))
            sys.exit(1)

        pdf_signed_url = sys.argv[1]
        target_folder = sys.argv[2]
        document_id = sys.argv[3]

        print(f"[ConvertPDF] Starting PDF conversion process", file=sys.stderr)
        print(f"[ConvertPDF] Target folder: {target_folder}", file=sys.stderr)
        print(f"[ConvertPDF] Document ID: {document_id}", file=sys.stderr)

        result = convert_pdf_to_images_main(pdf_signed_url, target_folder, document_id)

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
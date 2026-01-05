#!/usr/bin/env python3
"""
PDF to Image Conversion Script for Lambda Layer

This script is invoked by the Node.js Lambda handler via child_process.
It reads a base64-encoded PDF from stdin and outputs base64-encoded images
as JSON to stdout.

Usage (from Node.js):
    const { spawn } = require('child_process');
    const proc = spawn('python3', ['/opt/python/convert_pdf.py']);
    proc.stdin.write(base64EncodedPdf);
    proc.stdin.end();
    // Read JSON from stdout
"""

import sys
import json
import base64
import io
import os
from typing import List, Dict, Any

# Ensure poppler is in PATH for Lambda environment
os.environ['PATH'] = '/usr/bin:' + os.environ.get('PATH', '')

try:
    from pdf2image import convert_from_bytes
    from PIL import Image
except ImportError as e:
    print(json.dumps({
        'success': False,
        'error': f'Import error: {str(e)}',
        'pages': []
    }))
    sys.exit(1)


def convert_pdf_to_images(pdf_bytes: bytes, dpi: int = 150) -> List[Dict[str, Any]]:
    """
    Convert PDF bytes to a list of base64-encoded PNG images.

    Args:
        pdf_bytes: Raw PDF file bytes
        dpi: Resolution for conversion (default 150 for balance of quality/size)

    Returns:
        List of dicts with page info and base64 image data
    """
    try:
        # Convert PDF to PIL Images
        images = convert_from_bytes(
            pdf_bytes,
            dpi=dpi,
            fmt='png',
            thread_count=2,  # Lambda has limited CPU
            use_pdftocairo=True  # Better quality
        )

        result = []
        for page_num, image in enumerate(images, start=1):
            # Convert PIL Image to bytes
            buffer = io.BytesIO()
            image.save(buffer, format='PNG', optimize=True)
            image_bytes = buffer.getvalue()

            # Get dimensions
            width, height = image.size

            result.append({
                'pageNumber': page_num,
                'width': width,
                'height': height,
                'sizeBytes': len(image_bytes),
                'imageBase64': base64.b64encode(image_bytes).decode('utf-8')
            })

        return result

    except Exception as e:
        raise RuntimeError(f'PDF conversion failed: {str(e)}')


def main():
    """Main entry point - reads base64 PDF from stdin, outputs JSON to stdout."""
    try:
        # Read base64-encoded PDF from stdin
        input_data = sys.stdin.read().strip()

        if not input_data:
            raise ValueError('No input received on stdin')

        # Decode base64 to bytes
        pdf_bytes = base64.b64decode(input_data)

        # Validate it looks like a PDF
        if not pdf_bytes.startswith(b'%PDF'):
            raise ValueError('Input does not appear to be a valid PDF')

        # Convert PDF to images
        pages = convert_pdf_to_images(pdf_bytes)

        # Output success response
        response = {
            'success': True,
            'pageCount': len(pages),
            'pages': pages
        }

        print(json.dumps(response))
        sys.exit(0)

    except Exception as e:
        # Output error response
        response = {
            'success': False,
            'error': str(e),
            'pages': []
        }
        print(json.dumps(response))
        sys.exit(1)


if __name__ == '__main__':
    main()

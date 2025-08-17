/**
 * Shared PDF to Image Conversion Utility
 * 
 * This utility provides a centralized function for converting PDF documents
 * to PNG images using pdf2pic library. Used across multiple API routes
 * in the two-stage hybrid document processing architecture.
 */

import { fromBuffer } from 'pdf2pic';

/**
 * Convert a PDF buffer to a PNG image buffer
 * 
 * @param pdfBuffer - Buffer containing the PDF data
 * @returns Promise<Buffer> - PNG image buffer
 * @throws Error if conversion fails
 */
export async function convertPdfToImage(pdfBuffer: Buffer): Promise<Buffer> {
  try {
    console.log(`[PDF Converter] Starting PDF to image conversion`);
    
    // Create pdf2pic converter with standardized options
    // These settings ensure consistent output across all routes
    const convert = fromBuffer(pdfBuffer, {
      density: 200,           // DPI for output image (high quality)
      saveFilename: "page",   // Base filename for temporary files
      savePath: "./temp",     // Temporary directory
      format: "png",          // Output format (PNG for best OCR compatibility)
      width: 1024,           // Max width (standardized for OCR processing)
      height: 1400,          // Max height (matches coordinateReference in OCR)
      quality: 95            // High quality for better OCR accuracy
    });

    // Convert first page only (financial documents are typically single page)
    console.log(`[PDF Converter] Converting PDF page 1 to PNG`);
    const result = await convert(1, { responseType: "buffer" });
    
    if (!result.buffer) {
      throw new Error('PDF conversion failed: No image buffer returned');
    }

    console.log(`[PDF Converter] PDF converted successfully, image size: ${result.buffer.length} bytes`);
    return result.buffer;
    
  } catch (error) {
    console.error('[PDF Converter] PDF conversion failed:', error);
    
    // Enhanced error message with common troubleshooting
    let errorMessage = `PDF to image conversion failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    
    if (error instanceof Error) {
      if (error.message.includes('GraphicsMagick') || error.message.includes('ImageMagick')) {
        errorMessage += '. Install GraphicsMagick: brew install graphicsmagick';
      } else if (error.message.includes('density')) {
        errorMessage += '. PDF may be corrupted or have invalid density settings';
      } else if (error.message.includes('permission')) {
        errorMessage += '. Check file permissions for PDF processing';
      }
    }
    
    throw new Error(errorMessage);
  }
}
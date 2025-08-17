/**
 * Shared PDF to Image Conversion Utility
 * 
 * This utility provides a centralized function for converting PDF documents
 * to PNG images using pdf2pic library. Used across multiple API routes
 * in the two-stage hybrid document processing architecture.
 */

import { fromBuffer } from 'pdf2pic';
import { tmpdir } from 'os';

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
    console.log(`[PDF Converter] Input PDF size: ${pdfBuffer.length} bytes`);
    
    // Validate PDF buffer
    if (pdfBuffer.length === 0) {
      throw new Error('PDF buffer is empty');
    }
    
    // Check if buffer starts with PDF signature
    const pdfSignature = pdfBuffer.subarray(0, 4).toString();
    if (!pdfSignature.includes('%PDF')) {
      console.warn(`[PDF Converter] Warning: Buffer doesn't start with PDF signature, got: ${pdfSignature}`);
    }
    
    // Create pdf2pic converter with system temp directory
    const tempDir = tmpdir();
    const convert = fromBuffer(pdfBuffer, {
      density: 150,           // Reduced DPI to avoid memory issues
      saveFilename: "page",   // Base filename for temporary files
      savePath: tempDir,      // Use system temporary directory (works in Vercel)
      format: "png",          // Output format (PNG for best OCR compatibility)
      width: 800,            // Reduced width for better compatibility
      height: 1200,          // Reduced height for better compatibility
      quality: 85            // Slightly lower quality but more stable
    });
    
    console.log(`[PDF Converter] Using temp directory: ${tempDir}`);

    // Convert first page only (financial documents are typically single page)
    console.log(`[PDF Converter] Converting PDF page 1 to PNG`);
    let result;
    
    try {
      result = await convert(1, { responseType: "buffer" });
    } catch (conversionError) {
      console.error(`[PDF Converter] Primary conversion failed:`, conversionError);
      
      // Try with different settings as fallback
      console.log(`[PDF Converter] Attempting fallback conversion with reduced settings`);
      const fallbackConvert = fromBuffer(pdfBuffer, {
        density: 100,           // Lower DPI
        saveFilename: "page",   
        savePath: tempDir,      
        format: "png",          
        width: 600,            // Smaller dimensions
        height: 800,           
        quality: 75            // Lower quality
      });
      
      result = await fallbackConvert(1, { responseType: "buffer" });
    }
    
    if (!result || !result.buffer) {
      throw new Error('PDF conversion failed: No image buffer returned from primary or fallback conversion');
    }

    // Validate the resulting buffer
    if (result.buffer.length === 0) {
      throw new Error('PDF conversion produced empty buffer');
    }

    // Check PNG signature (first 8 bytes) but don't fail if it's different format
    const signature = result.buffer.subarray(0, Math.min(8, result.buffer.length));
    const expectedPngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    
    console.log(`[PDF Converter] Buffer signature: ${signature.toString('hex')} (length: ${result.buffer.length})`);
    
    if (signature.length >= 8 && signature.equals(expectedPngSignature)) {
      console.log(`[PDF Converter] Valid PNG signature detected`);
    } else {
      console.warn(`[PDF Converter] Unexpected signature, but proceeding with conversion. Expected PNG: ${expectedPngSignature.toString('hex')}, Got: ${signature.toString('hex')}`);
      // Don't throw error, just log warning - the buffer might still be valid image data
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
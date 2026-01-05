/**
 * PDF Conversion Step
 *
 * Converts PDF documents to images using the Python Lambda Layer.
 * Uses child_process to invoke Python script with poppler/pdf2image.
 *
 * Storage Path Pattern: {business_id}/{user_id}/{document_type}/{document_id}/converted/{filename}
 */

import { spawn } from 'child_process';
import * as path from 'path';
import type { ConvertedImageInfo } from '../types';
import {
  readDocument,
  writeConvertedImages,
  type DocumentType,
} from '../utils/s3-client';

/**
 * Error thrown when PDF conversion fails
 */
export class PdfConversionError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'PdfConversionError';
  }
}

/**
 * Python conversion result structure
 */
interface PythonConversionResult {
  success: boolean;
  pageCount?: number;
  pages?: Array<{
    pageNumber: number;
    width: number;
    height: number;
    sizeBytes: number;
    imageBase64: string;
  }>;
  error?: string;
}

/**
 * Convert a PDF document to images using the Python Lambda Layer.
 *
 * @param documentId - Document ID for S3 key generation
 * @param storagePath - S3 key for the PDF document
 * @param businessId - Business ID for storage path hierarchy
 * @param userId - User ID for storage path hierarchy
 * @param documentType - Document type (invoice/receipt) for storage path
 * @returns Array of converted image info with S3 keys
 */
export async function convertPdfToImages(
  documentId: string,
  storagePath: string,
  businessId?: string,
  userId?: string,
  documentType?: DocumentType
): Promise<ConvertedImageInfo[]> {
  // Read PDF from S3
  const pdfBuffer = await readDocument(storagePath);

  // Validate PDF header
  if (!pdfBuffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new PdfConversionError(
      'Document does not appear to be a valid PDF',
      'PDF_CORRUPTED'
    );
  }

  // Convert using Python script
  const pythonResult = await invokePythonConversion(pdfBuffer);

  if (!pythonResult.success || !pythonResult.pages) {
    throw new PdfConversionError(
      pythonResult.error || 'PDF conversion failed',
      'PDF_CONVERSION_FAILED'
    );
  }

  // Check page count limit
  if (pythonResult.pageCount && pythonResult.pageCount > 100) {
    throw new PdfConversionError(
      `PDF has ${pythonResult.pageCount} pages, exceeds maximum of 100`,
      'PDF_TOO_LARGE'
    );
  }

  // Prepare images for upload
  const images = pythonResult.pages.map((page) => ({
    pageNumber: page.pageNumber,
    imageBuffer: Buffer.from(page.imageBase64, 'base64'),
    width: page.width,
    height: page.height,
  }));

  // Build path config if all required params provided
  const pathConfig = businessId && userId && documentType
    ? { businessId, userId, documentType }
    : undefined;

  // Upload converted images to S3 using proper storage path hierarchy
  const uploadedImages = await writeConvertedImages(documentId, images, pathConfig);

  return uploadedImages;
}

/**
 * Invoke the Python PDF conversion script via child process.
 *
 * @param pdfBuffer - PDF file content as Buffer
 * @returns Conversion result from Python script
 */
async function invokePythonConversion(
  pdfBuffer: Buffer
): Promise<PythonConversionResult> {
  return new Promise((resolve) => {
    // Path to Python script in Lambda Layer
    const pythonScript = '/opt/python/convert_pdf.py';
    const pythonPath = '/opt/python';

    // Spawn Python process (use childProcess to avoid shadowing global process)
    const childProcess = spawn('python3', [pythonScript], {
      env: {
        ...process.env,
        PYTHONPATH: pythonPath,
        PATH: `/usr/bin:${process.env.PATH}`,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    childProcess.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    childProcess.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    // Send base64-encoded PDF to stdin
    childProcess.stdin.write(pdfBuffer.toString('base64'));
    childProcess.stdin.end();

    childProcess.on('close', (code) => {
      if (code !== 0) {
        console.error('Python stderr:', stderr);
        resolve({
          success: false,
          error: stderr || `Python process exited with code ${code}`,
        });
        return;
      }

      try {
        const result = JSON.parse(stdout) as PythonConversionResult;
        resolve(result);
      } catch (parseError) {
        resolve({
          success: false,
          error: `Failed to parse Python output: ${stdout.substring(0, 500)}`,
        });
      }
    });

    childProcess.on('error', (err) => {
      resolve({
        success: false,
        error: `Failed to spawn Python process: ${err.message}`,
      });
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      childProcess.kill();
      resolve({
        success: false,
        error: 'PDF conversion timed out after 5 minutes',
      });
    }, 5 * 60 * 1000);
  });
}

/**
 * Check if a document requires PDF conversion.
 *
 * @param fileType - Document file type
 * @returns true if PDF conversion is needed
 */
export function needsPdfConversion(fileType: 'pdf' | 'image'): boolean {
  return fileType === 'pdf';
}

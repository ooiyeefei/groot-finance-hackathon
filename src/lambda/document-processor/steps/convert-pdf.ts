/**
 * PDF Conversion Step
 *
 * Converts PDF documents to images using the Python Lambda Layer.
 * Uses child_process to invoke Python script with poppler/pdf2image.
 *
 * Storage Path Pattern: {domain}/{business_id}/{user_id}/{document_id}/converted/{filename}
 * Example: invoices/biz123/user456/doc789/converted/page-001.png
 *
 * IMPORTANT: User ID is extracted from storagePath to ensure converted images
 * are stored in the same folder as the raw upload. This prevents the mismatch
 * between Clerk user ID (in storagePath from upload) and Convex user ID (in document record).
 */

import { spawn } from 'child_process';
import type { ConvertedImageInfo } from '../types';
import {
  readDocument,
  writeConvertedImages,
  type StorageDomain,
} from '../utils/s3-client';

/**
 * Extract user ID from storage path.
 *
 * Storage path pattern: {businessId}/{userId}/{documentId}/{stage}/{filename}
 * Example: kh7c75c0bwz3qmhqvgxh7x6x217y0tda/user_36y7i2nfev1q9jcuqbhu22mok94/kg76hc7/raw/invoice.pdf
 *
 * @param storagePath - The full storage path without domain prefix
 * @returns The userId from the path, or undefined if pattern doesn't match
 */
function extractUserIdFromPath(storagePath: string): string | undefined {
  // Split path: [businessId, userId, documentId, stage, filename]
  const segments = storagePath.split('/');
  if (segments.length >= 2) {
    return segments[1]; // userId is second segment
  }
  return undefined;
}

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
 * @param storagePath - S3 key for the PDF document (without domain prefix)
 * @param businessId - Business ID for storage path hierarchy
 * @param userId - User ID for storage path hierarchy
 * @param domain - Domain for S3 prefix (invoices or expense_claims)
 * @returns Array of converted image info with S3 keys
 */
export async function convertPdfToImages(
  documentId: string,
  storagePath: string,
  businessId?: string,
  userId?: string,
  domain?: StorageDomain
): Promise<ConvertedImageInfo[]> {
  // Build full S3 key by prepending domain prefix
  // Database stores path without prefix, S3 needs full key with prefix
  const s3Key = domain ? `${domain}/${storagePath}` : storagePath;

  // Read PDF from S3
  const pdfBuffer = await readDocument(s3Key);

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

  // CRITICAL: Extract userId from storagePath to ensure consistency
  // The storagePath contains the Clerk user ID from the original upload,
  // which may differ from the Convex user ID passed as the userId parameter.
  // We must use the same userId for converted images as the raw upload.
  const extractedUserId = extractUserIdFromPath(storagePath);

  // Log the user ID extraction for debugging
  if (extractedUserId && userId && extractedUserId !== userId) {
    console.log(`[PDF Convert] User ID mismatch detected - using extracted: ${extractedUserId} (passed: ${userId})`);
  }

  // Build path config using extracted userId (not the passed one!)
  const effectiveUserId = extractedUserId || userId;
  const pathConfig = businessId && effectiveUserId && domain
    ? { domain, businessId, userId: effectiveUserId }
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
    // Paths for Lambda Layer
    const pythonBinary = '/opt/bin/python3';  // Python interpreter from layer
    const pythonScript = '/opt/python/convert_pdf.py';
    const pythonPath = '/opt/python';
    const libPath = '/opt/lib';
    const binPath = '/opt/bin';

    // Spawn Python process (use childProcess to avoid shadowing global process)
    const childProcess = spawn(pythonBinary, [pythonScript], {
      env: {
        ...process.env,
        PYTHONHOME: '/opt',  // Tell Python where to find its stdlib (lib64/python3.11/)
        PYTHONPATH: pythonPath,
        PATH: `${binPath}:/usr/bin:${process.env.PATH || ''}`,
        LD_LIBRARY_PATH: `${libPath}:${process.env.LD_LIBRARY_PATH || ''}`,
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

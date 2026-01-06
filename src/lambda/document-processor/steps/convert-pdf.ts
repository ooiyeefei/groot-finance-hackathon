/**
 * PDF Conversion Step
 *
 * Converts PDF documents to images using the Python Lambda Layer.
 * Uses child_process to invoke Python script with poppler/pdf2image.
 *
 * Storage Path Pattern: {domain}/{business_id}/{user_id}/{document_id}/converted/{filename}
 * Example: invoices/biz123/user456/doc789/converted/page-001.png
 *
 * NOTE: User ID consistency is handled at upload time (createInvoice/createExpenseClaim)
 * where we query Convex for the user's internal ID before generating storage paths.
 * This ensures both raw uploads and converted images use Convex user IDs.
 */

import { spawn } from 'child_process';
import type { ConvertedImageInfo } from '../types';
import {
  readDocument,
  writeConvertedImages,
  type StorageDomain,
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

  // Build path config using the userId passed from Lambda handler
  // NOTE: userId consistency is ensured at upload time (createInvoice/createExpenseClaim)
  // where we query Convex for the user's internal ID before generating storage paths.
  const pathConfig = businessId && userId && domain
    ? { domain, businessId, userId }
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

/**
 * S3 Client Utilities for Document Processing
 *
 * Provides S3 operations for reading source documents and writing
 * converted images. Uses presigned URLs for secure access.
 *
 * Storage Path Pattern: {business_id}/{user_id}/{document_type}/{document_id}/{stage}/{filename}
 * Processing stages: raw, converted, processed
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ConvertedImageInfo } from '../types';

// Storage path types
export type DocumentType = 'invoice' | 'receipt' | 'other';
export type ProcessingStage = 'raw' | 'converted' | 'processed';

// S3 client singleton (reused across warm invocations)
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-west-2',
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME || 'finanseal-bucket';
const PRESIGNED_URL_EXPIRY = 3600; // 1 hour

/**
 * Error thrown when S3 operations fail
 */
export class S3OperationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly key?: string
  ) {
    super(message);
    this.name = 'S3OperationError';
  }
}

/**
 * Read a document from S3 as a Buffer.
 *
 * @param key - S3 object key (e.g., 'invoices/doc-123.pdf')
 * @returns Document content as Buffer
 * @throws {S3OperationError} If read fails
 */
export async function readDocument(key: string): Promise<Buffer> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
      throw new S3OperationError(
        'Empty response body from S3',
        'S3_READ_ERROR',
        key
      );
    }

    // Convert readable stream to Buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  } catch (error) {
    if (error instanceof S3OperationError) throw error;

    const awsError = error as Error & { name?: string };
    if (awsError.name === 'NoSuchKey') {
      throw new S3OperationError(
        `Document not found in S3: ${key}`,
        'S3_NOT_FOUND',
        key
      );
    }

    throw new S3OperationError(
      `Failed to read document from S3: ${awsError.message}`,
      'S3_READ_ERROR',
      key
    );
  }
}

/**
 * Get document metadata without downloading content.
 *
 * @param key - S3 object key
 * @returns Object metadata including content type and size
 */
export async function getDocumentMetadata(key: string): Promise<{
  contentType: string;
  contentLength: number;
  lastModified?: Date;
}> {
  try {
    const command = new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const response = await s3Client.send(command);

    return {
      contentType: response.ContentType || 'application/octet-stream',
      contentLength: response.ContentLength || 0,
      lastModified: response.LastModified,
    };
  } catch (error) {
    const awsError = error as Error & { name?: string };
    if (awsError.name === 'NotFound' || awsError.name === 'NoSuchKey') {
      throw new S3OperationError(
        `Document not found in S3: ${key}`,
        'S3_NOT_FOUND',
        key
      );
    }

    throw new S3OperationError(
      `Failed to get document metadata: ${awsError.message}`,
      'S3_READ_ERROR',
      key
    );
  }
}

/**
 * Generate standardized storage path for converted images.
 *
 * Pattern: {business_id}/{user_id}/{document_type}/{document_id}/converted/{filename}
 *
 * @param config - Storage path configuration
 * @returns S3 key following the standardized pattern
 */
export function generateStoragePath(config: {
  businessId: string;
  userId: string;
  documentType: DocumentType;
  documentId: string;
  stage: ProcessingStage;
  filename: string;
}): string {
  const { businessId, userId, documentType, documentId, stage, filename } = config;
  return `${businessId}/${userId}/${documentType}/${documentId}/${stage}/${filename}`;
}

/**
 * Write a converted image to S3.
 *
 * @param documentId - Original document ID
 * @param pageNumber - Page number (1-indexed)
 * @param imageBuffer - PNG image data
 * @param metadata - Image dimensions
 * @param pathConfig - Optional storage path configuration for proper hierarchy
 * @returns S3 key for the uploaded image
 */
export async function writeConvertedImage(
  documentId: string,
  pageNumber: number,
  imageBuffer: Buffer,
  metadata: { width: number; height: number },
  pathConfig?: {
    businessId: string;
    userId: string;
    documentType: DocumentType;
  }
): Promise<string> {
  const filename = `page-${pageNumber.toString().padStart(3, '0')}.png`;

  // Use proper hierarchical path if config provided, otherwise fallback to legacy
  const key = pathConfig
    ? generateStoragePath({
        businessId: pathConfig.businessId,
        userId: pathConfig.userId,
        documentType: pathConfig.documentType,
        documentId,
        stage: 'converted',
        filename,
      })
    : `converted/${documentId}/${filename}`; // Legacy fallback

  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: imageBuffer,
      ContentType: 'image/png',
      Metadata: {
        documentId,
        pageNumber: pageNumber.toString(),
        width: metadata.width.toString(),
        height: metadata.height.toString(),
      },
    });

    await s3Client.send(command);
    return key;
  } catch (error) {
    const awsError = error as Error;
    throw new S3OperationError(
      `Failed to write converted image: ${awsError.message}`,
      'S3_WRITE_ERROR',
      key
    );
  }
}

/**
 * Write multiple converted images to S3.
 *
 * @param documentId - Original document ID
 * @param images - Array of image data with metadata
 * @param pathConfig - Optional storage path configuration for proper hierarchy
 * @returns Array of ConvertedImageInfo with S3 keys
 */
export async function writeConvertedImages(
  documentId: string,
  images: Array<{
    pageNumber: number;
    imageBuffer: Buffer;
    width: number;
    height: number;
  }>,
  pathConfig?: {
    businessId: string;
    userId: string;
    documentType: DocumentType;
  }
): Promise<ConvertedImageInfo[]> {
  const results: ConvertedImageInfo[] = [];

  // Process images in parallel (up to 5 concurrent)
  const batchSize = 5;
  for (let i = 0; i < images.length; i += batchSize) {
    const batch = images.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (img) => {
        const s3Key = await writeConvertedImage(
          documentId,
          img.pageNumber,
          img.imageBuffer,
          { width: img.width, height: img.height },
          pathConfig // Pass path config for proper hierarchy
        );

        return {
          pageNumber: img.pageNumber,
          s3Key,
          width: img.width,
          height: img.height,
          sizeBytes: img.imageBuffer.length,
        };
      })
    );
    results.push(...batchResults);
  }

  return results;
}

/**
 * Generate a presigned URL for reading a document.
 *
 * @param key - S3 object key
 * @param expiresIn - URL expiry in seconds (default 1 hour)
 * @returns Presigned URL for GET operation
 */
export async function getPresignedReadUrl(
  key: string,
  expiresIn: number = PRESIGNED_URL_EXPIRY
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  return getSignedUrl(s3Client, command, { expiresIn });
}

/**
 * Generate presigned URLs for multiple converted images.
 *
 * @param images - Array of ConvertedImageInfo
 * @returns Array of presigned URLs in same order
 */
export async function getPresignedImageUrls(
  images: ConvertedImageInfo[]
): Promise<string[]> {
  return Promise.all(
    images.map((img) => getPresignedReadUrl(img.s3Key))
  );
}

/**
 * Determine file type from content type or extension.
 *
 * @param key - S3 object key
 * @param contentType - Optional content type from metadata
 * @returns 'pdf' or 'image'
 */
export function determineFileType(
  key: string,
  contentType?: string
): 'pdf' | 'image' {
  if (contentType) {
    if (contentType === 'application/pdf') return 'pdf';
    if (contentType.startsWith('image/')) return 'image';
  }

  const extension = key.split('.').pop()?.toLowerCase();
  if (extension === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'tiff'].includes(extension || '')) {
    return 'image';
  }

  // Default to image if unknown
  return 'image';
}

/**
 * AWS S3 Public Bucket Utility
 *
 * Provides utilities for the public assets bucket (finanseal-public).
 * This bucket is for publicly accessible assets like business logos.
 *
 * Bucket structure:
 * - finanseal-public/favicon.svg                           (global favicon)
 * - finanseal-public/business-logos/{businessId}/logo.{ext} (business logos)
 *
 * Authentication:
 * - Read: Public (no auth needed)
 * - Write: Vercel OIDC role or AWS credentials
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { fromWebToken } from '@aws-sdk/credential-providers';
import type { AwsCredentialIdentityProvider } from '@smithy/types';

// Configuration
const AWS_REGION = process.env.AWS_REGION || 'us-west-2';
const PUBLIC_BUCKET = 'finanseal-public';
const AWS_ROLE_ARN = process.env.AWS_ROLE_ARN;

// Public bucket URL (direct access, no presigned URLs needed for reads)
export const PUBLIC_BUCKET_URL = `https://${PUBLIC_BUCKET}.s3.${AWS_REGION}.amazonaws.com`;

// Storage prefixes
export const PUBLIC_PREFIXES = {
  business_logos: 'business-logos',
  brand: 'brand',
} as const;

export type PublicPrefix = keyof typeof PUBLIC_PREFIXES;

/**
 * Build public URL for an asset
 * No presigned URL needed - bucket is public read
 */
export function getPublicAssetUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${PUBLIC_BUCKET_URL}/${cleanPath}`;
}

/**
 * Build public URL for a business logo
 *
 * Structure: business-logos/{businessId}/{uploaderId}/logo.{ext}
 * The uploaderId tracks who uploaded/last modified the logo for audit purposes
 */
export function getBusinessLogoUrl(
  businessId: string,
  uploaderId: string,
  extension: string = 'png'
): string {
  return `${PUBLIC_BUCKET_URL}/${PUBLIC_PREFIXES.business_logos}/${businessId}/${uploaderId}/logo.${extension}`;
}

/**
 * Build S3 key for a business logo
 */
export function buildBusinessLogoKey(
  businessId: string,
  uploaderId: string,
  extension: string = 'png'
): string {
  return `${PUBLIC_PREFIXES.business_logos}/${businessId}/${uploaderId}/logo.${extension}`;
}

// ============================================================================
// S3 Client for Write Operations (uploads still need auth)
// ============================================================================

/**
 * Create Vercel OIDC credential provider
 */
function createVercelOidcCredentialProvider(
  roleArn: string
): AwsCredentialIdentityProvider {
  return async () => {
    const { getVercelOidcToken } = await import('@vercel/oidc');
    const token = await getVercelOidcToken();

    const provider = fromWebToken({
      roleArn,
      webIdentityToken: token,
      roleSessionName: `groot-public-${Date.now()}`,
      durationSeconds: 3600,
    });

    return provider();
  };
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
      region: AWS_REGION,
    };

    if (AWS_ROLE_ARN) {
      console.log('[S3-Public] Using Vercel OIDC federation');
      clientConfig.credentials = createVercelOidcCredentialProvider(AWS_ROLE_ARN);
    } else {
      console.log('[S3-Public] Using default credential provider chain');
    }

    s3Client = new S3Client(clientConfig);
  }

  return s3Client;
}

// ============================================================================
// Business Logo Operations
// ============================================================================

/**
 * Upload a business logo
 *
 * @param businessId - The business ID
 * @param uploaderId - The user ID who uploaded (for audit trail)
 * @param file - The logo file (Buffer, Uint8Array, Blob, or File)
 * @param contentType - MIME type (e.g., 'image/png', 'image/jpeg')
 * @returns Public URL of the uploaded logo
 */
export async function uploadBusinessLogo(
  businessId: string,
  uploaderId: string,
  file: Buffer | Uint8Array | Blob | File,
  contentType: string
): Promise<{ success: boolean; url: string; key: string; error?: string }> {
  const client = getS3Client();

  // Determine extension from content type
  const extension = contentType === 'image/jpeg' ? 'jpg' :
                    contentType === 'image/png' ? 'png' :
                    contentType === 'image/webp' ? 'webp' :
                    contentType === 'image/svg+xml' ? 'svg' : 'png';

  const key = buildBusinessLogoKey(businessId, uploaderId, extension);
  const url = getBusinessLogoUrl(businessId, uploaderId, extension);

  try {
    // Convert File/Blob to Buffer if needed
    let body: Buffer | Uint8Array;
    if (file instanceof Blob || file instanceof File) {
      const arrayBuffer = await file.arrayBuffer();
      body = Buffer.from(arrayBuffer);
    } else {
      body = file;
    }

    const command = new PutObjectCommand({
      Bucket: PUBLIC_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      // Cache for 1 year (logos don't change often)
      CacheControl: 'public, max-age=31536000, immutable',
      Metadata: {
        'business-id': businessId,
        'uploaded-at': new Date().toISOString(),
      },
    });

    await client.send(command);
    console.log(`[S3-Public] Uploaded business logo: ${key}`);
    return { success: true, url, key };
  } catch (error) {
    console.error(`[S3-Public] Upload failed for ${key}:`, error);
    return {
      success: false,
      url: '',
      key: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Delete a business logo by its S3 key
 *
 * @param key - The S3 key (e.g., "business-logos/{businessId}/{uploaderId}/logo.png")
 */
export async function deleteBusinessLogo(
  key: string
): Promise<{ success: boolean; error?: string }> {
  const client = getS3Client();

  try {
    const command = new DeleteObjectCommand({
      Bucket: PUBLIC_BUCKET,
      Key: key,
    });

    await client.send(command);
    console.log(`[S3-Public] Deleted business logo: ${key}`);
    return { success: true };
  } catch (error) {
    console.error(`[S3-Public] Delete failed for ${key}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if a business logo exists by key
 */
export async function businessLogoExists(key: string): Promise<boolean> {
  const client = getS3Client();

  try {
    const command = new HeadObjectCommand({
      Bucket: PUBLIC_BUCKET,
      Key: key,
    });

    await client.send(command);
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Generic Public Asset Operations
// ============================================================================

/**
 * Upload a generic public asset
 */
export async function uploadPublicAsset(
  path: string,
  file: Buffer | Uint8Array | Blob | File,
  contentType: string,
  cacheControl: string = 'public, max-age=86400'
): Promise<{ success: boolean; url: string; error?: string }> {
  const client = getS3Client();
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const url = getPublicAssetUrl(cleanPath);

  try {
    let body: Buffer | Uint8Array;
    if (file instanceof Blob || file instanceof File) {
      const arrayBuffer = await file.arrayBuffer();
      body = Buffer.from(arrayBuffer);
    } else {
      body = file;
    }

    const command = new PutObjectCommand({
      Bucket: PUBLIC_BUCKET,
      Key: cleanPath,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
    });

    await client.send(command);
    console.log(`[S3-Public] Uploaded asset: ${cleanPath}`);
    return { success: true, url };
  } catch (error) {
    console.error(`[S3-Public] Upload failed for ${cleanPath}:`, error);
    return {
      success: false,
      url: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Delete a public asset
 */
export async function deletePublicAsset(
  path: string
): Promise<{ success: boolean; error?: string }> {
  const client = getS3Client();
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  try {
    const command = new DeleteObjectCommand({
      Bucket: PUBLIC_BUCKET,
      Key: cleanPath,
    });

    await client.send(command);
    console.log(`[S3-Public] Deleted asset: ${cleanPath}`);
    return { success: true };
  } catch (error) {
    console.error(`[S3-Public] Delete failed for ${cleanPath}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * AWS S3 Storage Utility
 *
 * Provides presigned URL generation and file operations for S3 storage.
 * Replaces Supabase Storage with AWS S3.
 *
 * Authentication:
 * - Vercel Deployment: Uses Vercel OIDC to assume IAM role (AWS_ROLE_ARN required)
 * - Local Development: Uses AWS default credential chain (env vars or ~/.aws/credentials)
 *
 * Bucket structure:
 * - finanseal-bucket/invoices/{business_id}/{user_id}/invoice/{doc_id}/{stage}/{filename}
 * - finanseal-bucket/expense_claims/{business_id}/{user_id}/receipt/{doc_id}/{stage}/{filename}
 * - finanseal-bucket/business-profiles/{business_id}/logo_{timestamp}.{ext}
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { fromWebToken } from '@aws-sdk/credential-providers'
import type { AwsCredentialIdentityProvider } from '@smithy/types'

// Configuration from environment
const AWS_REGION = process.env.AWS_REGION || 'us-west-2'
const S3_BUCKET = process.env.S3_BUCKET_NAME || 'finanseal-bucket'
const AWS_ROLE_ARN = process.env.AWS_ROLE_ARN // Set in Vercel for OIDC

// Storage prefixes (folders in S3)
export const S3_PREFIXES = {
  invoices: 'invoices',
  expense_claims: 'expense_claims',
  business_profiles: 'business-profiles',
  account_deletions: 'account-deletions',
  einvoices: 'einvoices', // 001-einv-pdf-gen: LHDN-validated e-invoice PDFs
} as const

export type S3Prefix = keyof typeof S3_PREFIXES

// Presigned URL expiry defaults (in seconds)
export const URL_EXPIRY = {
  upload: 900, // 15 minutes for uploads
  download: 3600, // 1 hour for downloads
  shortLived: 600, // 10 minutes for processing
} as const

/**
 * Create Vercel OIDC credential provider
 *
 * Fetches fresh OIDC token from Vercel for each credential request.
 * This handles token refresh automatically since tokens expire.
 */
function createVercelOidcCredentialProvider(
  roleArn: string
): AwsCredentialIdentityProvider {
  return async () => {
    // Dynamic import to avoid bundling issues when not on Vercel
    const { getVercelOidcToken } = await import('@vercel/oidc')

    // Get fresh token for each credential request
    const token = await getVercelOidcToken()

    // Use fromWebToken to assume the IAM role with the OIDC token
    const provider = fromWebToken({
      roleArn,
      webIdentityToken: token,
      roleSessionName: `groot-${Date.now()}`,
      durationSeconds: 3600, // 1 hour session
    })

    return provider()
  }
}

/**
 * S3 client instance
 *
 * Authentication strategy:
 * 1. If AWS_ROLE_ARN is set (Vercel deployment): Uses Vercel OIDC federation
 * 2. Otherwise (local dev): Uses AWS default credential provider chain
 *    - Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
 *    - Shared credentials file (~/.aws/credentials)
 *    - IAM roles (EC2, ECS, Lambda)
 */
let s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (!s3Client) {
    const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
      region: AWS_REGION,
      // Disable automatic checksum validation for presigned URLs
      // AWS SDK v3.958+ adds x-amz-checksum-mode=ENABLED by default, which can cause
      // 403 errors when:
      // 1. Objects were uploaded without checksums
      // 2. IAM policy doesn't include s3:GetObjectAttributes
      // Setting these to 'when_required' only uses checksums when explicitly requested
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    }

    // Use Vercel OIDC if AWS_ROLE_ARN is configured
    if (AWS_ROLE_ARN) {
      console.log('[S3] Using Vercel OIDC federation')
      clientConfig.credentials = createVercelOidcCredentialProvider(AWS_ROLE_ARN)
    } else {
      console.log('[S3] Using default credential provider chain')
      // No credentials specified = uses default credential provider chain
    }

    s3Client = new S3Client(clientConfig)
  }

  return s3Client
}

/**
 * Build the full S3 key with prefix
 */
export function buildS3Key(prefix: S3Prefix, path: string): string {
  const prefixPath = S3_PREFIXES[prefix]
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  return `${prefixPath}/${cleanPath}`
}

/**
 * Generate a presigned URL for uploading a file
 */
export async function getPresignedUploadUrl(
  prefix: S3Prefix,
  path: string,
  contentType: string,
  expiresIn: number = URL_EXPIRY.upload
): Promise<string> {
  const client = getS3Client()
  const key = buildS3Key(prefix, path)

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ContentType: contentType,
  })

  const url = await getSignedUrl(client, command, { expiresIn })
  console.log(`[S3] Generated upload URL for: ${key} (expires in ${expiresIn}s)`)
  return url
}

/**
 * Generate a presigned URL for downloading/viewing a file
 */
export async function getPresignedDownloadUrl(
  prefix: S3Prefix,
  path: string,
  expiresIn: number = URL_EXPIRY.download
): Promise<string> {
  const client = getS3Client()
  const key = buildS3Key(prefix, path)

  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  })

  const url = await getSignedUrl(client, command, { expiresIn })
  console.log(`[S3] Generated download URL for: ${key} (expires in ${expiresIn}s)`)
  return url
}

/**
 * Upload a file directly to S3 (server-side upload)
 */
export async function uploadFile(
  prefix: S3Prefix,
  path: string,
  file: Buffer | Uint8Array | Blob | File,
  contentType: string,
  metadata?: Record<string, string>
): Promise<{ success: boolean; key: string; error?: string }> {
  const client = getS3Client()
  const key = buildS3Key(prefix, path)

  try {
    // Convert File/Blob to Buffer if needed
    let body: Buffer | Uint8Array
    if (file instanceof Blob || file instanceof File) {
      const arrayBuffer = await file.arrayBuffer()
      body = Buffer.from(arrayBuffer)
    } else {
      body = file
    }

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      Metadata: metadata,
    })

    await client.send(command)
    console.log(`[S3] Uploaded file: ${key}`)
    return { success: true, key }
  } catch (error) {
    console.error(`[S3] Upload failed for ${key}:`, error)
    return {
      success: false,
      key,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Delete a file from S3
 */
export async function deleteFile(
  prefix: S3Prefix,
  path: string
): Promise<{ success: boolean; error?: string }> {
  const client = getS3Client()
  const key = buildS3Key(prefix, path)

  try {
    const command = new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    })

    await client.send(command)
    console.log(`[S3] Deleted file: ${key}`)
    return { success: true }
  } catch (error) {
    console.error(`[S3] Delete failed for ${key}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Check if a file exists in S3
 */
export async function fileExists(prefix: S3Prefix, path: string): Promise<boolean> {
  const client = getS3Client()
  const key = buildS3Key(prefix, path)

  try {
    const command = new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    })

    await client.send(command)
    return true
  } catch (error) {
    // NotFound error means file doesn't exist
    return false
  }
}

/**
 * List files in a directory (prefix)
 */
export async function listFiles(
  prefix: S3Prefix,
  path: string,
  options?: { maxKeys?: number; continuationToken?: string }
): Promise<{
  files: Array<{ key: string; size: number; lastModified: Date }>
  nextToken?: string
}> {
  const client = getS3Client()
  const fullPrefix = buildS3Key(prefix, path)

  try {
    const command = new ListObjectsV2Command({
      Bucket: S3_BUCKET,
      Prefix: fullPrefix,
      MaxKeys: options?.maxKeys || 100,
      ContinuationToken: options?.continuationToken,
    })

    const response = await client.send(command)

    const files = (response.Contents || []).map((item) => ({
      key: item.Key || '',
      size: item.Size || 0,
      lastModified: item.LastModified || new Date(),
    }))

    return {
      files,
      nextToken: response.NextContinuationToken,
    }
  } catch (error) {
    console.error(`[S3] List failed for ${fullPrefix}:`, error)
    return { files: [] }
  }
}

/**
 * Get file metadata
 */
export async function getFileMetadata(
  prefix: S3Prefix,
  path: string
): Promise<{
  exists: boolean
  size?: number
  contentType?: string
  lastModified?: Date
  metadata?: Record<string, string>
}> {
  const client = getS3Client()
  const key = buildS3Key(prefix, path)

  try {
    const command = new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    })

    const response = await client.send(command)

    return {
      exists: true,
      size: response.ContentLength,
      contentType: response.ContentType,
      lastModified: response.LastModified,
      metadata: response.Metadata,
    }
  } catch (error) {
    return { exists: false }
  }
}

/**
 * Copy a file within S3 (useful for moving between stages)
 */
export async function copyFile(
  sourcePrefix: S3Prefix,
  sourcePath: string,
  destPrefix: S3Prefix,
  destPath: string
): Promise<{ success: boolean; error?: string }> {
  const client = getS3Client()
  const sourceKey = buildS3Key(sourcePrefix, sourcePath)
  const destKey = buildS3Key(destPrefix, destPath)

  try {
    const { CopyObjectCommand } = await import('@aws-sdk/client-s3')
    const command = new CopyObjectCommand({
      Bucket: S3_BUCKET,
      CopySource: `${S3_BUCKET}/${sourceKey}`,
      Key: destKey,
    })

    await client.send(command)
    console.log(`[S3] Copied ${sourceKey} to ${destKey}`)
    return { success: true }
  } catch (error) {
    console.error(`[S3] Copy failed from ${sourceKey} to ${destKey}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// =============================================================================
// Legacy Compatibility Layer
// Legacy Supabase compat functions removed — migrated to native S3 (2026-03-14)

// Common MIME types
const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  return MIME_TYPES[ext || ''] || 'application/octet-stream'
}

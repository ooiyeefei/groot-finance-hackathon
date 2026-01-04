/**
 * AWS S3 Helpers for Trigger.dev Tasks
 * Provides storage operations for background jobs
 *
 * Authentication:
 * Trigger.dev runs on its own infrastructure, so we use AWS access keys
 * set in the Trigger.dev dashboard environment variables:
 * - AWS_ACCESS_KEY_ID
 * - AWS_SECRET_ACCESS_KEY
 * - AWS_REGION (optional, defaults to us-west-2)
 *
 * The IAM user/role should have the same least-privilege S3 policy
 * as the Vercel OIDC role (see CLAUDE.md for policy details).
 */

import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// S3 Configuration
const AWS_REGION = process.env.AWS_REGION || 'us-west-2'
const S3_BUCKET = process.env.AWS_S3_BUCKET || 'finanseal-bucket'

// Bucket prefixes for different domains
export const S3_PREFIXES = {
  invoices: 'invoices',
  expense_claims: 'expense_claims',
  business_profiles: 'business-profiles',
} as const

export type S3Prefix = keyof typeof S3_PREFIXES

// URL expiry times in seconds
export const URL_EXPIRY = {
  upload: 900,    // 15 minutes
  download: 3600, // 1 hour
  shortLived: 600 // 10 minutes
} as const

/**
 * Singleton S3 client for Trigger.dev tasks
 *
 * Uses AWS SDK default credential provider chain which reads:
 * - AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY from Trigger.dev env vars
 * - AWS_REGION for region configuration
 *
 * Set these in Trigger.dev Dashboard → Project → Environment Variables
 */
let s3Client: S3Client | null = null

function getS3Client(): S3Client {
  if (!s3Client) {
    // Uses credentials from Trigger.dev environment variables
    s3Client = new S3Client({
      region: AWS_REGION,
    })
    console.log('[S3-Trigger] Client initialized with default credential chain')
  }
  return s3Client
}

/**
 * Build full S3 key from prefix and path
 */
function buildS3Key(prefix: S3Prefix, path: string): string {
  const prefixPath = S3_PREFIXES[prefix]
  // Remove leading slash from path if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  return `${prefixPath}/${cleanPath}`
}

/**
 * Get bucket name from domain for backwards compatibility
 */
export function getBucketNameFromDomain(domain: string): S3Prefix {
  const domainMap: Record<string, S3Prefix> = {
    'invoices': 'invoices',
    'expense_claims': 'expense_claims',
    'documents': 'invoices', // Fallback for legacy references
  }
  return domainMap[domain] || 'invoices'
}

/**
 * Generate a presigned download URL for an S3 object
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
  return url
}

/**
 * Generate a presigned upload URL for an S3 object
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
  return url
}

/**
 * Download a file from S3 and return as Buffer
 */
export async function downloadFile(
  prefix: S3Prefix,
  path: string
): Promise<Buffer> {
  const client = getS3Client()
  const key = buildS3Key(prefix, path)

  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  })

  const response = await client.send(command)

  if (!response.Body) {
    throw new Error(`Empty response body for ${key}`)
  }

  // Convert stream to buffer
  const chunks: Uint8Array[] = []
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    chunks.push(chunk)
  }

  return Buffer.concat(chunks)
}

/**
 * Upload a file to S3
 */
export async function uploadFile(
  prefix: S3Prefix,
  path: string,
  data: Buffer | Uint8Array,
  contentType: string,
  metadata?: Record<string, string>
): Promise<{ success: boolean; key: string; error?: string }> {
  try {
    const client = getS3Client()
    const key = buildS3Key(prefix, path)

    const command = new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: data,
      ContentType: contentType,
      Metadata: metadata,
    })

    await client.send(command)

    return { success: true, key }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[S3] Upload failed for ${prefix}/${path}:`, message)
    return { success: false, key: '', error: message }
  }
}

/**
 * List files in an S3 prefix/folder
 */
export async function listFiles(
  prefix: S3Prefix,
  path: string,
  options?: { maxKeys?: number }
): Promise<{ files: Array<{ key: string; name: string; size: number; lastModified: Date }> }> {
  const client = getS3Client()
  const fullPrefix = buildS3Key(prefix, path)
  // Ensure prefix ends with / for directory listing
  const directoryPrefix = fullPrefix.endsWith('/') ? fullPrefix : `${fullPrefix}/`

  const command = new ListObjectsV2Command({
    Bucket: S3_BUCKET,
    Prefix: directoryPrefix,
    MaxKeys: options?.maxKeys || 1000,
  })

  const response = await client.send(command)

  const files = (response.Contents || [])
    .filter(obj => obj.Key && obj.Key !== directoryPrefix) // Filter out the directory itself
    .map(obj => ({
      key: obj.Key!,
      name: obj.Key!.split('/').pop() || obj.Key!,
      size: obj.Size || 0,
      lastModified: obj.LastModified || new Date(),
    }))

  return { files }
}

/**
 * Check if a file exists in S3
 */
export async function fileExists(prefix: S3Prefix, path: string): Promise<boolean> {
  try {
    const client = getS3Client()
    const key = buildS3Key(prefix, path)

    const command = new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    })

    await client.send(command)
    return true
  } catch {
    return false
  }
}

// Signed URL cache for optimization
const signedUrlCache = new Map<string, { signedUrl: string; expiryTime: number }>()
const SIGNED_URL_CACHE_DURATION_MS = 8 * 60 * 1000 // 8 minutes (URLs valid for 10 min)

/**
 * Get or create cached signed URL for a storage path
 * Reduces S3 API calls by caching signed URLs with TTL
 */
export async function getOrCreateSignedUrl(
  prefix: S3Prefix,
  storagePath: string,
  expirySeconds: number = 600
): Promise<string> {
  const cacheKey = `${prefix}:${storagePath}`
  const now = Date.now()
  const cached = signedUrlCache.get(cacheKey)

  // Return cached URL if still valid
  if (cached && cached.expiryTime > now) {
    console.log(`[S3 Cache HIT] Using cached signed URL for: ${storagePath}`)
    return cached.signedUrl
  }

  // Create new signed URL
  console.log(`[S3 Cache MISS] Creating new signed URL for: ${storagePath}`)
  const signedUrl = await getPresignedDownloadUrl(prefix, storagePath, expirySeconds)

  // Cache the signed URL
  const expiryTime = now + SIGNED_URL_CACHE_DURATION_MS
  signedUrlCache.set(cacheKey, { signedUrl, expiryTime })

  // Periodic cache cleanup
  if (signedUrlCache.size % 50 === 0) {
    for (const [key, entry] of signedUrlCache.entries()) {
      if (entry.expiryTime <= now) {
        signedUrlCache.delete(key)
      }
    }
  }

  return signedUrl
}

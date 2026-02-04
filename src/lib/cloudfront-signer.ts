/**
 * CloudFront Signed URL Generator
 *
 * Generates signed URLs for private CloudFront content.
 * Uses RSA key pair for signing - much faster than S3 presigned URLs
 * because it doesn't require AWS API calls for each URL.
 *
 * Private key is securely stored in AWS SSM Parameter Store (encrypted).
 * Key is fetched once at startup and cached in memory.
 *
 * Benefits over S3 presigned URLs:
 * - No AWS API call required per URL (instant generation after key fetch)
 * - Edge caching (content served from nearest location)
 * - Better security (S3 bucket not directly exposed, key in SSM)
 */

import { getSignedUrl } from '@aws-sdk/cloudfront-signer'
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'
import { fromWebToken } from '@aws-sdk/credential-providers'

// Configuration from environment
const CLOUDFRONT_DOMAIN = process.env.CLOUDFRONT_DOMAIN || process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN
const CLOUDFRONT_KEY_PAIR_ID = process.env.CLOUDFRONT_KEY_PAIR_ID
const AWS_REGION = process.env.AWS_REGION || 'us-west-2'
const AWS_ROLE_ARN = process.env.AWS_ROLE_ARN

// SSM Parameter names
const SSM_PRIVATE_KEY_PARAM = '/finanseal/cloudfront/private-key'

// Cached private key (fetched once from SSM)
let cachedPrivateKey: string | null = null
let keyFetchPromise: Promise<string | null> | null = null

// URL expiry defaults (in seconds)
export const CLOUDFRONT_URL_EXPIRY = {
  download: 3600, // 1 hour for downloads
  shortLived: 600, // 10 minutes for processing
  longLived: 86400, // 24 hours for cached content
} as const

/**
 * Create SSM client with appropriate credentials
 */
function createSSMClient(): SSMClient {
  const clientConfig: ConstructorParameters<typeof SSMClient>[0] = {
    region: AWS_REGION,
  }

  // Use Vercel OIDC if AWS_ROLE_ARN is configured (production)
  if (AWS_ROLE_ARN) {
    clientConfig.credentials = async () => {
      const { getVercelOidcToken } = await import('@vercel/oidc')
      const token = await getVercelOidcToken()
      const provider = fromWebToken({
        roleArn: AWS_ROLE_ARN,
        webIdentityToken: token,
        roleSessionName: `finanseal-ssm-${Date.now()}`,
        durationSeconds: 3600,
      })
      return provider()
    }
  }
  // Otherwise uses default credential chain (local dev)

  return new SSMClient(clientConfig)
}

/**
 * Fetch private key from SSM Parameter Store (with caching)
 */
async function getPrivateKey(): Promise<string | null> {
  // Return cached key if available
  if (cachedPrivateKey) {
    return cachedPrivateKey
  }

  // If already fetching, wait for that promise
  if (keyFetchPromise) {
    return keyFetchPromise
  }

  // Check if we have env var override (for local dev without SSM access)
  if (process.env.CLOUDFRONT_PRIVATE_KEY) {
    cachedPrivateKey = process.env.CLOUDFRONT_PRIVATE_KEY
    console.log('[CloudFront] Using private key from environment variable')
    return cachedPrivateKey
  }

  // Fetch from SSM
  keyFetchPromise = (async () => {
    try {
      console.log('[CloudFront] Fetching private key from SSM Parameter Store...')
      const client = createSSMClient()
      const command = new GetParameterCommand({
        Name: SSM_PRIVATE_KEY_PARAM,
        WithDecryption: true, // Decrypt SecureString
      })

      const response = await client.send(command)
      cachedPrivateKey = response.Parameter?.Value || null

      if (cachedPrivateKey) {
        console.log('[CloudFront] Successfully loaded private key from SSM')
      } else {
        console.error('[CloudFront] Private key not found in SSM')
      }

      return cachedPrivateKey
    } catch (error) {
      console.error('[CloudFront] Failed to fetch private key from SSM:', error)
      return null
    } finally {
      keyFetchPromise = null
    }
  })()

  return keyFetchPromise
}

/**
 * Check if CloudFront CDN is configured
 */
export function isCloudFrontConfigured(): boolean {
  return !!(CLOUDFRONT_DOMAIN && CLOUDFRONT_KEY_PAIR_ID)
}

/**
 * Check if CloudFront is fully ready (including private key)
 */
export async function isCloudFrontReady(): Promise<boolean> {
  if (!isCloudFrontConfigured()) {
    return false
  }
  const privateKey = await getPrivateKey()
  return !!privateKey
}

/**
 * Get CloudFront configuration status for debugging
 */
export function getCloudFrontStatus(): {
  configured: boolean
  domain: string | undefined
  keyPairId: string | undefined
  hasPrivateKey: boolean
  privateKeySource: 'cached' | 'env' | 'ssm' | 'none'
} {
  return {
    configured: isCloudFrontConfigured(),
    domain: CLOUDFRONT_DOMAIN,
    keyPairId: CLOUDFRONT_KEY_PAIR_ID,
    hasPrivateKey: !!cachedPrivateKey || !!process.env.CLOUDFRONT_PRIVATE_KEY,
    privateKeySource: cachedPrivateKey
      ? 'cached'
      : process.env.CLOUDFRONT_PRIVATE_KEY
      ? 'env'
      : 'ssm',
  }
}

/**
 * Generate a CloudFront signed URL for private content
 *
 * @param s3Key - The S3 object key (without bucket name)
 * @param expiresInSeconds - URL expiry time in seconds (default: 1 hour)
 * @returns Signed CloudFront URL
 *
 * @example
 * // For expense claim receipt
 * const url = await getCloudFrontSignedUrl(
 *   'expense_claims/user123/receipt.jpg',
 *   3600 // 1 hour
 * )
 */
export async function getCloudFrontSignedUrl(
  s3Key: string,
  expiresInSeconds: number = CLOUDFRONT_URL_EXPIRY.download
): Promise<string> {
  if (!CLOUDFRONT_DOMAIN || !CLOUDFRONT_KEY_PAIR_ID) {
    throw new Error(
      'CloudFront not configured. Set CLOUDFRONT_DOMAIN and CLOUDFRONT_KEY_PAIR_ID environment variables.'
    )
  }

  const privateKey = await getPrivateKey()
  if (!privateKey) {
    throw new Error(
      'CloudFront private key not available. Check SSM Parameter Store or CLOUDFRONT_PRIVATE_KEY env var.'
    )
  }

  // Clean the key - remove leading slash if present
  const cleanKey = s3Key.startsWith('/') ? s3Key.slice(1) : s3Key

  // Build the CloudFront URL
  const url = `https://${CLOUDFRONT_DOMAIN}/${cleanKey}`

  // Calculate expiry date
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000)

  // Generate signed URL using canned policy (simpler, shorter URLs)
  const signedUrl = getSignedUrl({
    url,
    keyPairId: CLOUDFRONT_KEY_PAIR_ID,
    privateKey: privateKey,
    dateLessThan: expiresAt.toISOString(),
  })

  return signedUrl
}

/**
 * Generate a CloudFront signed URL for expense claim images
 *
 * @param storagePath - The storage path from expense claim record
 * @param expiresInSeconds - URL expiry time in seconds
 * @returns Signed CloudFront URL
 */
export async function getExpenseClaimImageUrl(
  storagePath: string,
  expiresInSeconds: number = CLOUDFRONT_URL_EXPIRY.download
): Promise<string> {
  // Storage paths are stored without the bucket prefix
  // e.g., "user123/doc456/raw/image.jpg"
  // Full S3 key is "expense_claims/user123/doc456/raw/image.jpg"
  const s3Key = `expense_claims/${storagePath}`
  return getCloudFrontSignedUrl(s3Key, expiresInSeconds)
}

/**
 * Generate a CloudFront signed URL for invoice images
 *
 * @param storagePath - The storage path from invoice record
 * @param expiresInSeconds - URL expiry time in seconds
 * @returns Signed CloudFront URL
 */
export async function getInvoiceImageUrl(
  storagePath: string,
  expiresInSeconds: number = CLOUDFRONT_URL_EXPIRY.download
): Promise<string> {
  const s3Key = `invoices/${storagePath}`
  return getCloudFrontSignedUrl(s3Key, expiresInSeconds)
}

/**
 * Generate signed URLs for multiple images (batch operation)
 *
 * @param storagePaths - Array of storage paths
 * @param prefix - S3 prefix ('expense_claims' or 'invoices')
 * @param expiresInSeconds - URL expiry time in seconds
 * @returns Map of storage path to signed URL
 */
export async function getSignedUrlsBatch(
  storagePaths: string[],
  prefix: 'expense_claims' | 'invoices',
  expiresInSeconds: number = CLOUDFRONT_URL_EXPIRY.download
): Promise<Map<string, string>> {
  const urls = new Map<string, string>()

  // Pre-fetch the private key once
  await getPrivateKey()

  for (const path of storagePaths) {
    try {
      const s3Key = `${prefix}/${path}`
      const signedUrl = await getCloudFrontSignedUrl(s3Key, expiresInSeconds)
      urls.set(path, signedUrl)
    } catch (error) {
      console.error(`[CloudFront] Failed to sign URL for ${path}:`, error)
    }
  }

  return urls
}

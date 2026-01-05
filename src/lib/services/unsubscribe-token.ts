/**
 * Unsubscribe Token Service
 *
 * JWT-based token generation and verification for email unsubscribe links.
 * Implements RFC 8058 one-click unsubscribe pattern.
 *
 * Key Features:
 * - Self-contained tokens (no database lookup for verification)
 * - 7-day expiration for security
 * - URL-safe base64 encoding
 * - Supports both GET (render page) and POST (one-click) flows
 */

import { SignJWT, jwtVerify } from 'jose'

// ===== TYPE DEFINITIONS =====

export interface UnsubscribeTokenPayload {
  userId: string       // Convex user ID
  email: string        // Email address
  type: 'marketing' | 'onboarding' | 'product_updates' | 'all'
}

export interface VerifiedUnsubscribeToken extends UnsubscribeTokenPayload {
  exp: number         // Expiration timestamp
  iat: number         // Issued at timestamp
}

export interface TokenResult {
  success: boolean
  token?: string
  error?: string
}

export interface VerifyResult {
  success: boolean
  payload?: VerifiedUnsubscribeToken
  error?: string
}

// ===== CONFIGURATION =====

const TOKEN_EXPIRATION_DAYS = 7
const ALGORITHM = 'HS256'

/**
 * Get JWT secret from environment
 * Falls back to CLERK_SECRET_KEY if dedicated secret not set
 */
function getJwtSecret(): Uint8Array {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.CLERK_SECRET_KEY

  if (!secret) {
    throw new Error('EMAIL_UNSUBSCRIBE_SECRET or CLERK_SECRET_KEY must be configured')
  }

  return new TextEncoder().encode(secret)
}

// ===== TOKEN GENERATION =====

/**
 * Generate Unsubscribe Token
 *
 * Creates a JWT containing user ID, email, and unsubscribe type.
 * Token is valid for 7 days.
 *
 * @param payload - User info and unsubscribe type
 * @returns JWT token string or error
 */
export async function generateUnsubscribeToken(
  payload: UnsubscribeTokenPayload
): Promise<TokenResult> {
  try {
    const secret = getJwtSecret()

    const token = await new SignJWT({
      userId: payload.userId,
      email: payload.email,
      type: payload.type
    })
      .setProtectedHeader({ alg: ALGORITHM })
      .setIssuedAt()
      .setExpirationTime(`${TOKEN_EXPIRATION_DAYS}d`)
      .setSubject('unsubscribe')
      .sign(secret)

    return { success: true, token }
  } catch (error) {
    console.error('[Unsubscribe Token] Generation error:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Token generation failed'
    }
  }
}

/**
 * Generate Unsubscribe URL
 *
 * Creates a full unsubscribe URL with embedded token.
 * Includes type parameter for direct unsubscribe path.
 *
 * @param baseUrl - Application base URL (e.g., https://finanseal.com)
 * @param payload - User info and unsubscribe type
 * @returns Full unsubscribe URL
 */
export async function generateUnsubscribeUrl(
  baseUrl: string,
  payload: UnsubscribeTokenPayload
): Promise<string | null> {
  const result = await generateUnsubscribeToken(payload)

  if (!result.success || !result.token) {
    console.error('[Unsubscribe Token] Failed to generate URL:', result.error)
    return null
  }

  // URL for GET request (renders confirmation page)
  return `${baseUrl}/api/v1/unsubscribe?token=${encodeURIComponent(result.token)}`
}

/**
 * Generate One-Click Unsubscribe URL
 *
 * Creates URL for RFC 8058 List-Unsubscribe-Post header.
 * This URL handles POST requests for immediate unsubscribe.
 *
 * @param baseUrl - Application base URL
 * @param payload - User info and unsubscribe type
 * @returns One-click unsubscribe URL for email headers
 */
export async function generateOneClickUrl(
  baseUrl: string,
  payload: UnsubscribeTokenPayload
): Promise<string | null> {
  const result = await generateUnsubscribeToken(payload)

  if (!result.success || !result.token) {
    console.error('[Unsubscribe Token] Failed to generate one-click URL:', result.error)
    return null
  }

  return `${baseUrl}/api/v1/unsubscribe/one-click?token=${encodeURIComponent(result.token)}`
}

// ===== TOKEN VERIFICATION =====

/**
 * Verify Unsubscribe Token
 *
 * Validates JWT signature and expiration.
 * Returns decoded payload if valid.
 *
 * @param token - JWT token string
 * @returns Verified payload or error
 */
export async function verifyUnsubscribeToken(token: string): Promise<VerifyResult> {
  try {
    const secret = getJwtSecret()

    const { payload } = await jwtVerify(token, secret, {
      algorithms: [ALGORITHM]
    })

    // Validate required fields
    if (!payload.userId || !payload.email || !payload.type) {
      return {
        success: false,
        error: 'Invalid token payload: missing required fields'
      }
    }

    // Validate subject
    if (payload.sub !== 'unsubscribe') {
      return {
        success: false,
        error: 'Invalid token: wrong subject'
      }
    }

    return {
      success: true,
      payload: {
        userId: payload.userId as string,
        email: payload.email as string,
        type: payload.type as UnsubscribeTokenPayload['type'],
        exp: payload.exp as number,
        iat: payload.iat as number
      }
    }
  } catch (error) {
    console.error('[Unsubscribe Token] Verification error:', error)

    // Provide user-friendly error messages
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        return { success: false, error: 'Link has expired. Please use the link in a recent email.' }
      }
      if (error.message.includes('signature')) {
        return { success: false, error: 'Invalid link. Please use the link from your email.' }
      }
    }

    return {
      success: false,
      error: 'Invalid or expired unsubscribe link'
    }
  }
}

// ===== EMAIL HEADERS HELPER =====

/**
 * Generate List-Unsubscribe Headers
 *
 * Creates RFC 2369 / RFC 8058 compliant unsubscribe headers for emails.
 * These headers enable one-click unsubscribe in email clients.
 *
 * @param baseUrl - Application base URL
 * @param payload - User info and unsubscribe type
 * @returns Headers object for SES/email sending
 */
export async function generateUnsubscribeHeaders(
  baseUrl: string,
  payload: UnsubscribeTokenPayload
): Promise<Record<string, string> | null> {
  const oneClickUrl = await generateOneClickUrl(baseUrl, payload)
  const standardUrl = await generateUnsubscribeUrl(baseUrl, payload)

  if (!oneClickUrl || !standardUrl) {
    return null
  }

  return {
    // RFC 2369: List-Unsubscribe header (mailto or http)
    'List-Unsubscribe': `<${standardUrl}>`,
    // RFC 8058: One-click unsubscribe (required for Gmail, Yahoo)
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
  }
}

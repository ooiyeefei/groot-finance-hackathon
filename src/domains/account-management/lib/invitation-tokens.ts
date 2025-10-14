/**
 * Simple JWT-based Invitation Token System
 *
 * Uses industry-standard JWT tokens with jose library for invitation links.
 * No database needed - expiration handled by JWT itself.
 */

import { SignJWT, jwtVerify } from 'jose'

export interface InvitationTokenData {
  userId: string
  businessId: string
  email: string
  role: string
}

export interface TokenValidationResult {
  isValid: boolean
  data?: InvitationTokenData
  error?: string
}

// Get JWT secret for invitation tokens
function getJWTSecret(): Uint8Array {
  const secret = process.env.INVITATION_TOKEN_SECRET || process.env.NEXTAUTH_SECRET || 'fallback-invitation-secret'
  return new TextEncoder().encode(secret)
}

/**
 * Generate a JWT invitation token with 7-day expiration
 */
export async function createInvitationToken(
  userId: string,
  businessId: string,
  email: string,
  role: string,
  expirationDays: number = 7
): Promise<string> {
  const secret = getJWTSecret()

  const token = await new SignJWT({
    userId,
    businessId,
    email: email.toLowerCase(),
    role
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${expirationDays}d`)
    .setIssuedAt()
    .setSubject(userId)
    .setAudience('invitation')
    .sign(secret)

  return token
}

/**
 * Validate and decode an invitation JWT token
 */
export async function validateInvitationToken(token: string): Promise<TokenValidationResult> {
  try {
    const secret = getJWTSecret()

    const { payload } = await jwtVerify(token, secret, {
      audience: 'invitation'
    })

    // Extract data from JWT payload
    const data: InvitationTokenData = {
      userId: payload.userId as string,
      businessId: payload.businessId as string,
      email: payload.email as string,
      role: payload.role as string
    }

    // Validate required fields
    if (!data.userId || !data.businessId || !data.email || !data.role) {
      return { isValid: false, error: 'Missing required token data' }
    }

    return { isValid: true, data }

  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        return { isValid: false, error: 'Invitation has expired' }
      }
      if (error.message.includes('signature')) {
        return { isValid: false, error: 'Invalid invitation token' }
      }
    }
    return { isValid: false, error: 'Token validation failed' }
  }
}

/**
 * Check if token is a legacy UUID token (for backward compatibility)
 */
export function isLegacyUuidToken(token: string): boolean {
  // UUIDs are 36 characters with hyphens in specific positions
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(token)
}
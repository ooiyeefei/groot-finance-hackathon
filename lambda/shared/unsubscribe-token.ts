/**
 * Unsubscribe Token Generator for Lambda
 *
 * Generates JWT tokens for email unsubscribe links.
 * Must match the format expected by /api/v1/unsubscribe route.
 */

import { SignJWT } from 'jose';

const TOKEN_EXPIRATION_DAYS = 7;
const ALGORITHM = 'HS256';

export type UnsubscribeType = 'marketing' | 'onboarding' | 'product_updates' | 'all';

/**
 * Get JWT secret from environment
 */
function getJwtSecret(): Uint8Array {
  const secret = process.env.EMAIL_UNSUBSCRIBE_SECRET || process.env.CLERK_SECRET_KEY;

  if (!secret) {
    throw new Error('EMAIL_UNSUBSCRIBE_SECRET or CLERK_SECRET_KEY must be configured');
  }

  return new TextEncoder().encode(secret);
}

/**
 * Generate Unsubscribe Token
 *
 * Creates a JWT that can be verified by the /api/v1/unsubscribe route.
 */
export async function generateUnsubscribeToken(
  userId: string,
  email: string,
  type: UnsubscribeType = 'all'
): Promise<string> {
  const secret = getJwtSecret();

  const token = await new SignJWT({
    userId,
    email,
    type,
  })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_EXPIRATION_DAYS}d`)
    .setSubject('unsubscribe')
    .sign(secret);

  return token;
}

/**
 * Generate Unsubscribe URL
 *
 * Note: API routes in Next.js don't use i18n locale prefixes.
 * This function strips any locale prefix (e.g., /en, /th, /id) from baseUrl.
 */
export async function generateUnsubscribeUrl(
  userId: string,
  email: string,
  type: UnsubscribeType = 'all',
  baseUrl: string = 'https://finanseal.com'
): Promise<string> {
  const token = await generateUnsubscribeToken(userId, email, type);

  // Strip locale prefix from baseUrl for API routes
  // Next.js API routes don't use i18n locale prefixes
  const apiBaseUrl = baseUrl.replace(/\/(en|th|id)$/, '');

  return `${apiBaseUrl}/api/v1/unsubscribe?token=${encodeURIComponent(token)}`;
}

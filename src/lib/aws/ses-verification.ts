/**
 * SES Email Verification Utility
 *
 * Sends verification emails via SES. Uses branded custom template when
 * SES production access is available, falls back to default VerifyEmailIdentity
 * in sandbox mode.
 *
 * Used by:
 * - Manual "Verify Email" button in business settings
 * - Auto-verification after team invitation acceptance
 */

import {
  SESClient,
  VerifyEmailIdentityCommand,
  SendCustomVerificationEmailCommand,
  GetIdentityVerificationAttributesCommand,
} from '@aws-sdk/client-ses'
import { fromWebToken } from '@aws-sdk/credential-providers'
import type { AwsCredentialIdentityProvider } from '@smithy/types'

// ===== CONFIG =====

const AWS_REGION = process.env.AWS_REGION || 'us-west-2'
const AWS_ROLE_ARN = process.env.AWS_ROLE_ARN

// Template name — must be pre-created via CLI (SES sandbox can't create templates programmatically)
const TEMPLATE_NAME = 'GrootEmailVerification'

// ===== SES CLIENT =====

function createVercelOidcCredentialProvider(
  roleArn: string
): AwsCredentialIdentityProvider {
  return async () => {
    const { getVercelOidcToken } = await import('@vercel/oidc')
    const token = await getVercelOidcToken()
    const provider = fromWebToken({
      roleArn,
      webIdentityToken: token,
      roleSessionName: `groot-ses-verify-${Date.now()}`,
      durationSeconds: 3600,
    })
    return provider()
  }
}

function getSESClient(): SESClient {
  const config: ConstructorParameters<typeof SESClient>[0] = { region: AWS_REGION }
  if (AWS_ROLE_ARN) {
    config.credentials = createVercelOidcCredentialProvider(AWS_ROLE_ARN)
  }
  return new SESClient(config)
}

// ===== PUBLIC API =====

/**
 * Send a verification email via SES.
 * Tries branded custom template first (requires SES production access),
 * falls back to default VerifyEmailIdentity (works in sandbox).
 */
export async function sendBrandedVerificationEmail(email: string): Promise<void> {
  const ses = getSESClient()

  // Try branded template first (requires SES production access + pre-created template)
  try {
    await ses.send(new SendCustomVerificationEmailCommand({
      EmailAddress: email,
      TemplateName: TEMPLATE_NAME,
    }))
    console.log(`[SES Verification] Sent branded verification to ${email}`)
    return
  } catch (error: unknown) {
    const err = error as { name?: string }
    // Any failure from branded send → fall back to default
    console.log(`[SES Verification] Branded send failed (${err.name}), falling back to default`)
  }

  // Fallback: default AWS verification email (works in sandbox)
  await ses.send(new VerifyEmailIdentityCommand({ EmailAddress: email }))
  console.log(`[SES Verification] Sent default verification to ${email}`)
}

/**
 * Check SES verification status for an email address.
 * Returns: 'verified' | 'pending' | 'unverified'
 */
export async function checkVerificationStatus(
  email: string
): Promise<'verified' | 'pending' | 'unverified'> {
  const ses = getSESClient()
  const result = await ses.send(
    new GetIdentityVerificationAttributesCommand({ Identities: [email] })
  )
  const status = result.VerificationAttributes?.[email]?.VerificationStatus
  if (status === 'Success') return 'verified'
  if (status === 'Pending') return 'pending'
  return 'unverified'
}

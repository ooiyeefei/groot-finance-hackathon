/**
 * SES Email Verification Utility
 *
 * Sends branded Groot verification emails via SES custom templates.
 * Used by:
 * - Manual "Verify Email" button in business settings
 * - Auto-verification after team invitation acceptance
 */

import {
  SESClient,
  SendCustomVerificationEmailCommand,
  CreateCustomVerificationEmailTemplateCommand,
  GetIdentityVerificationAttributesCommand,
} from '@aws-sdk/client-ses'
import { fromWebToken } from '@aws-sdk/credential-providers'
import type { AwsCredentialIdentityProvider } from '@smithy/types'

// ===== CONFIG =====

const AWS_REGION = process.env.AWS_REGION || 'us-west-2'
const AWS_ROLE_ARN = process.env.AWS_ROLE_ARN
const APP_URL = process.env.APP_URL || 'https://finance.hellogroot.com'

const TEMPLATE_NAME = 'GrootEmailVerification'
const FROM_EMAIL = 'noreply@notifications.hellogroot.com'

// ===== BRANDED EMAIL TEMPLATE =====

const VERIFICATION_EMAIL_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 20px;">
<tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
  <tr><td style="padding:32px 32px 24px;text-align:center;">
    <div style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:20px;font-weight:700;padding:8px 16px;border-radius:8px;">G</div>
    <h1 style="margin:16px 0 0;font-size:20px;font-weight:600;color:#18181b;">Groot Finance</h1>
  </td></tr>
  <tr><td style="padding:0 32px 32px;">
    <h2 style="margin:0 0 8px;font-size:18px;font-weight:600;color:#18181b;">Verify your email</h2>
    <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#52525b;">
      Click the button below to verify your email address for e-invoice email forwarding.
      This enables reliable delivery of e-invoice documents to your inbox.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <a href="{{VerificationUrl}}" style="display:inline-block;background-color:#2563eb;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 32px;border-radius:8px;">
        Verify Email Address
      </a>
    </td></tr></table>
    <p style="margin:24px 0 0;font-size:12px;line-height:1.5;color:#a1a1aa;">
      If you didn't request this verification, you can safely ignore this email.
      This link will expire in 24 hours.
    </p>
  </td></tr>
  <tr><td style="padding:16px 32px;border-top:1px solid #e4e4e7;text-align:center;">
    <p style="margin:0;font-size:12px;color:#a1a1aa;">
      &copy; Groot Finance &mdash; Financial co-pilot for Southeast Asian SMEs
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`

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
      roleSessionName: `finanseal-ses-verify-${Date.now()}`,
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

// ===== TEMPLATE MANAGEMENT =====

let templateEnsured = false

async function ensureVerificationTemplate(ses: SESClient): Promise<void> {
  if (templateEnsured) return
  try {
    await ses.send(new CreateCustomVerificationEmailTemplateCommand({
      TemplateName: TEMPLATE_NAME,
      FromEmailAddress: FROM_EMAIL,
      TemplateSubject: 'Verify your email — Groot Finance',
      TemplateContent: VERIFICATION_EMAIL_HTML,
      SuccessRedirectionURL: `${APP_URL}/en/business-settings?email_verified=success`,
      FailureRedirectionURL: `${APP_URL}/en/business-settings?email_verified=failed`,
    }))
    console.log('[SES Verification] Created custom verification template')
  } catch (error: unknown) {
    const err = error as { name?: string }
    if (err.name === 'CustomVerificationEmailTemplateAlreadyExistsException') {
      // no-op
    } else {
      throw error
    }
  }
  templateEnsured = true
}

// ===== PUBLIC API =====

/**
 * Send a branded Groot verification email via SES custom template.
 * Idempotent — safe to call even if a verification is already pending.
 */
export async function sendBrandedVerificationEmail(email: string): Promise<void> {
  const ses = getSESClient()
  await ensureVerificationTemplate(ses)
  await ses.send(new SendCustomVerificationEmailCommand({
    EmailAddress: email,
    TemplateName: TEMPLATE_NAME,
  }))
  console.log(`[SES Verification] Sent branded verification to ${email}`)
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

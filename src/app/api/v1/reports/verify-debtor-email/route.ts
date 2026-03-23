/**
 * Verify Debtor Email for SES Sandbox
 *
 * POST /api/v1/reports/verify-debtor-email — Send SES verification to debtor email
 * GET  /api/v1/reports/verify-debtor-email?email=xxx — Check verification status
 *
 * Required because SES sandbox only allows sending to verified emails.
 * Part of 035-aging-payable-receivable-report feature.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedConvex } from '@/lib/convex'
import {
  sendBrandedVerificationEmail,
  checkVerificationStatus,
} from '@/lib/aws/ses-verification'

export async function GET(req: NextRequest) {
  const { userId } = await getAuthenticatedConvex()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const email = req.nextUrl.searchParams.get('email')
  if (!email) {
    return NextResponse.json({ error: 'Missing email parameter' }, { status: 400 })
  }

  try {
    const status = await checkVerificationStatus(email)
    return NextResponse.json({ email, status })
  } catch (error: any) {
    console.error('SES verification check failed:', error)
    return NextResponse.json(
      { error: 'Failed to check verification: ' + error.message },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  const { userId } = await getAuthenticatedConvex()
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { email } = body as { email: string }

  if (!email) {
    return NextResponse.json({ error: 'Missing email' }, { status: 400 })
  }

  try {
    await sendBrandedVerificationEmail(email)
    return NextResponse.json({ success: true, message: `Verification email sent to ${email}` })
  } catch (error: any) {
    console.error('SES verification send failed:', error)
    return NextResponse.json(
      { error: 'Failed to send verification: ' + error.message },
      { status: 500 }
    )
  }
}

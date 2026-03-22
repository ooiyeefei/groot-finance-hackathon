/**
 * 032-self-service-debtors-info-update
 *
 * POST /api/v1/debtor-info-request — Send email to debtor requesting info update (single)
 * POST /api/v1/debtor-info-request?bulk=true — Send emails to multiple debtors (bulk)
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { emailService } from '@/lib/services/email-service'
import type { Id } from '@/convex/_generated/dataModel'

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

const PUBLIC_BASE_URL = process.env.APP_URL || 'https://finance.hellogroot.com'

function buildEmailHtml(businessName: string, selfServiceUrl: string, expiresAt: number): string {
  const expiryDate = new Date(expiresAt).toLocaleDateString('en-MY', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
      <div style="text-align: center; margin-bottom: 32px;">
        <div style="display: inline-block; width: 40px; height: 40px; background: #2563eb; border-radius: 8px; line-height: 40px; color: white; font-weight: bold; font-size: 18px;">G</div>
      </div>

      <h2 style="color: #111827; font-size: 20px; margin-bottom: 16px;">Update Your Business Details</h2>

      <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
        Hi there,
      </p>

      <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
        <strong>${businessName}</strong> is requesting you to update your business details. This helps ensure accurate records for e-invoice compliance with LHDN (Lembaga Hasil Dalam Negeri).
      </p>

      <p style="color: #4b5563; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
        Please click the button below to review and update your information. The process takes less than 3 minutes.
      </p>

      <div style="text-align: center; margin-bottom: 24px;">
        <a href="${selfServiceUrl}" style="display: inline-block; background: #2563eb; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
          Update My Details
        </a>
      </div>

      <p style="color: #9ca3af; font-size: 13px; margin-bottom: 32px;">
        This link expires on ${expiryDate}. If the link has expired, please contact ${businessName} for a new one.
      </p>

      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;" />

      <p style="color: #9ca3af; font-size: 12px; text-align: center;">
        Powered by <a href="https://finance.hellogroot.com" style="color: #6b7280;">Groot Finance</a>
      </p>
    </div>
  `
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth()
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const isBulk = request.nextUrl.searchParams.get('bulk') === 'true'

    if (isBulk) {
      return handleBulk(body)
    }

    return handleSingle(body)
  } catch (error) {
    console.error('[Debtor Info Request] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function handleSingle(body: { businessId: string; customerId: string }) {
  const { businessId, customerId } = body

  if (!businessId || !customerId) {
    return NextResponse.json(
      { success: false, error: 'Missing businessId or customerId' },
      { status: 400 }
    )
  }

  // Get token status (or it will be created during QR gen / email send)
  const tokenStatus = await convex.query((api as any).functions.debtorSelfService.getTokenStatus, {
    businessId,
    customerId,
  })

  let token: string
  let expiresAt: number

  if (tokenStatus?.isActive && tokenStatus.token) {
    token = tokenStatus.token
    expiresAt = tokenStatus.expiresAt!
  } else {
    // Create new token via regenerate (which also revokes old)
    const result = await convex.mutation((api as any).functions.debtorSelfService.regenerateToken, {
      businessId,
      customerId,
    })
    token = result.token
    expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000
  }

  // Fetch customer for email
  const formData = await convex.query((api as any).functions.debtorSelfService.getFormData, { token })
  if (!formData?.valid || !formData.customer?.email) {
    return NextResponse.json(
      { success: false, error: 'Customer has no email address' },
      { status: 400 }
    )
  }

  const selfServiceUrl = `${PUBLIC_BASE_URL}/en/debtor-update/${token}`
  const htmlBody = buildEmailHtml(formData.businessName!, selfServiceUrl, expiresAt)

  await emailService.sendGenericEmail({
    to: formData.customer.email,
    subject: `${formData.businessName} — Please update your business details`,
    htmlBody,
    textBody: `${formData.businessName} is requesting you update your business details for e-invoice compliance. Please visit: ${selfServiceUrl}`,
  })

  // Mark email sent
  await convex.mutation((api as any).functions.debtorSelfService.markEmailSent, {
    businessId,
    customerId,
  })

  return NextResponse.json({
    success: true,
    data: { tokenUrl: selfServiceUrl },
  })
}

async function handleBulk(body: { businessId: string; customerIds: string[] }) {
  const { businessId, customerIds } = body

  if (!businessId || !customerIds?.length) {
    return NextResponse.json(
      { success: false, error: 'Missing businessId or customerIds' },
      { status: 400 }
    )
  }

  let sent = 0
  let skipped = 0
  let errors = 0

  for (const customerId of customerIds) {
    try {
      const result = await handleSingleInternal(businessId, customerId)
      if (result === 'sent') sent++
      else if (result === 'skipped') skipped++
      else errors++
    } catch {
      errors++
    }
  }

  return NextResponse.json({
    success: true,
    data: { sent, skipped, errors },
  })
}

async function handleSingleInternal(businessId: string, customerId: string): Promise<'sent' | 'skipped' | 'error'> {
  // Get or create token
  let tokenStatus = await convex.query((api as any).functions.debtorSelfService.getTokenStatus, {
    businessId,
    customerId,
  })

  let token: string
  let expiresAt: number

  if (tokenStatus?.isActive && tokenStatus.token) {
    token = tokenStatus.token
    expiresAt = tokenStatus.expiresAt!
  } else {
    const result = await convex.mutation((api as any).functions.debtorSelfService.regenerateToken, {
      businessId,
      customerId,
    })
    token = result.token
    expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000
  }

  const formData = await convex.query((api as any).functions.debtorSelfService.getFormData, { token })
  if (!formData?.valid || !formData.customer?.email) {
    return 'skipped'
  }

  const selfServiceUrl = `${PUBLIC_BASE_URL}/en/debtor-update/${token}`
  const htmlBody = buildEmailHtml(formData.businessName!, selfServiceUrl, expiresAt)

  await emailService.sendGenericEmail({
    to: formData.customer.email,
    subject: `${formData.businessName} — Please update your business details`,
    htmlBody,
    textBody: `${formData.businessName} is requesting you update your business details. Visit: ${selfServiceUrl}`,
  })

  await convex.mutation((api as any).functions.debtorSelfService.markEmailSent, {
    businessId,
    customerId,
  })

  return 'sent'
}

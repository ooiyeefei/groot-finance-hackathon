/**
 * Partner Application API - Sends email notification to partners@hellogroot.com
 * POST /api/v1/partner-application - No authentication required (public form)
 */

import { NextRequest, NextResponse } from 'next/server'
import { emailService } from '@/lib/services/email-service'

const PARTNERS_EMAIL = 'partners@hellogroot.com'

// Simple in-memory rate limiting (per IP, 3 requests per 10 minutes)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW = 10 * 60 * 1000
const RATE_LIMIT_MAX = 3

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return true
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false
  }

  entry.count++
  return true
}

interface PartnerApplicationRequest {
  fullName: string
  email: string
  phone: string
  companyName: string
  companyWebsite: string
  partnerType: 'reseller' | 'referrer'
  smeClients?: string
  currentServices?: string
  heardFrom?: string
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429 }
      )
    }

    const body: PartnerApplicationRequest = await request.json()
    const { fullName, email, phone, companyName, companyWebsite, partnerType, smeClients, currentServices, heardFrom } = body

    // Validate required fields
    if (!fullName?.trim() || !email?.trim() || !phone?.trim() || !companyName?.trim() || !partnerType) {
      return NextResponse.json(
        { success: false, error: 'Full name, email, phone, company name, and partner type are required.' },
        { status: 400 }
      )
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid email address.' },
        { status: 400 }
      )
    }

    const typeLabel = partnerType === 'reseller' ? 'Reseller (Sell-and-Close)' : 'Referrer (Lead-Only)'

    // Build a structured message for the feedback notification email
    const lines = [
      `PARTNER APPLICATION — ${typeLabel}`,
      '',
      `Full Name: ${fullName}`,
      `Email: ${email}`,
      `Phone/WhatsApp: ${phone}`,
      `Company: ${companyName}`,
      companyWebsite ? `Website/SSM: ${companyWebsite}` : '',
      `Partner Type: ${typeLabel}`,
      '',
      smeClients ? `SME Clients Served: ${smeClients}` : '',
      currentServices ? `Current Services: ${currentServices}` : '',
      heardFrom ? `How They Heard: ${heardFrom}` : '',
    ].filter(Boolean).join('\n')

    try {
      await emailService.sendFeedbackNotification({
        recipientEmail: PARTNERS_EMAIL,
        feedbackType: 'general',
        feedbackMessage: lines,
        submitterEmail: email,
        isAnonymous: false,
      })
      console.log('[Partner Application API] Email sent to', PARTNERS_EMAIL, 'from', email)
    } catch (err) {
      console.error('[Partner Application API] Failed to send email:', err)
      return NextResponse.json(
        { success: false, error: 'Failed to submit application. Please try again or email partners@hellogroot.com directly.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Partner application submitted successfully.',
    })
  } catch (error) {
    console.error('[Partner Application API] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to submit application. Please try again.' },
      { status: 500 }
    )
  }
}

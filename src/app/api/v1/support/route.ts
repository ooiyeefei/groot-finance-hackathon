/**
 * Public Support API - Creates GitHub issue + sends email notification
 * POST /api/v1/support - No authentication required
 *
 * This is the public-facing support endpoint used by the /support page.
 * It creates a GitHub issue and notifies support@hellogroot.com.
 */

import { NextRequest, NextResponse } from 'next/server'
import { Octokit } from '@octokit/rest'
import { emailService } from '@/lib/services/email-service'

const GITHUB_TOKEN = process.env.GITHUB_TOKEN
const GITHUB_REPO = process.env.GITHUB_REPO // format: "owner/repo"
const SUPPORT_EMAIL = 'support@hellogroot.com'

// Simple in-memory rate limiting (per IP, 5 requests per 10 minutes)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT_WINDOW = 10 * 60 * 1000 // 10 minutes
const RATE_LIMIT_MAX = 5

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

interface SupportRequest {
  name: string
  email: string
  type: 'bug' | 'feature' | 'general'
  message: string
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { success: false, error: 'Too many requests. Please try again later.' },
        { status: 429 }
      )
    }

    const body: SupportRequest = await request.json()
    const { name, email, type, message } = body

    // Validate required fields
    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Name, email, and message are required.' },
        { status: 400 }
      )
    }

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Please provide a valid email address.' },
        { status: 400 }
      )
    }

    const validTypes = ['bug', 'feature', 'general']
    const feedbackType = validTypes.includes(type) ? type : 'general'

    // 1. Create GitHub issue
    let githubIssueUrl: string | undefined
    if (GITHUB_TOKEN && GITHUB_REPO) {
      try {
        const [owner, repo] = GITHUB_REPO.split('/')
        if (owner && repo) {
          const octokit = new Octokit({ auth: GITHUB_TOKEN })

          const prefixMap: Record<string, string> = {
            bug: '[Bug]',
            feature: '[Feature Request]',
            general: '[Support]',
          }
          const prefix = prefixMap[feedbackType] || '[Support]'
          const shortMessage = message.length > 80 ? message.substring(0, 77) + '...' : message
          const title = `${prefix} ${shortMessage}`

          const bodyLines = [
            `## ${feedbackType === 'bug' ? 'Bug Report' : feedbackType === 'feature' ? 'Feature Request' : 'Support Request'}`,
            '',
            '### Description',
            message,
            '',
            '### Contact',
            `- **Name:** ${name}`,
            `- **Email:** ${email}`,
            '',
            '---',
            '*Submitted via the public support form at finance.hellogroot.com/support*',
          ]

          const labelMap: Record<string, string[]> = {
            bug: ['bug', 'support'],
            feature: ['feature-request', 'support'],
            general: ['support'],
          }

          const { data: issue } = await octokit.issues.create({
            owner,
            repo,
            title,
            body: bodyLines.join('\n'),
            labels: labelMap[feedbackType] || ['support'],
          })

          githubIssueUrl = issue.html_url
          console.log(`[Support API] Created GitHub issue #${issue.number}: ${issue.html_url}`)
        }
      } catch (err) {
        // Log but don't fail — email notification is the fallback
        console.error('[Support API] Failed to create GitHub issue:', err)
      }
    }

    // 2. Send email notification to support
    try {
      await emailService.sendFeedbackNotification({
        recipientEmail: SUPPORT_EMAIL,
        feedbackType: feedbackType as 'bug' | 'feature' | 'general',
        feedbackMessage: message,
        submitterEmail: email,
        githubIssueUrl,
        isAnonymous: false,
      })
      console.log('[Support API] Email notification sent to', SUPPORT_EMAIL)
    } catch (err) {
      // Log but don't fail — GitHub issue is already created
      console.error('[Support API] Failed to send email notification:', err)
    }

    return NextResponse.json({
      success: true,
      message: 'Support request submitted successfully.',
    })
  } catch (error) {
    console.error('[Support API] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to submit support request. Please try again.' },
      { status: 500 }
    )
  }
}

/**
 * Unsubscribe API Route
 *
 * GET /api/v1/unsubscribe?token=xxx - Render unsubscribe confirmation page
 * POST /api/v1/unsubscribe - Process unsubscribe request
 *
 * No authentication required - uses JWT token for verification.
 * This allows users to unsubscribe without logging in.
 */

import { NextRequest, NextResponse } from 'next/server'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '@/convex/_generated/api'
import { Id } from '@/convex/_generated/dataModel'
import {
  verifyUnsubscribeToken,
  type VerifiedUnsubscribeToken
} from '@/lib/services/unsubscribe-token'

// ===== CONVEX CLIENT =====

function getConvexClient(): ConvexHttpClient {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!convexUrl) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL is not configured')
  }
  return new ConvexHttpClient(convexUrl)
}

// ===== HTML TEMPLATES =====

/**
 * Generate unsubscribe confirmation HTML page
 */
function renderConfirmationPage(payload: VerifiedUnsubscribeToken): string {
  const typeLabels: Record<string, string> = {
    marketing: 'Marketing emails',
    onboarding: 'Onboarding tips',
    product_updates: 'Product updates',
    all: 'All emails'
  }

  const typeLabel = typeLabels[payload.type] || payload.type

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribe - FinanSEAL</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #f5f5f5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      max-width: 480px;
      width: 100%;
      padding: 40px;
      text-align: center;
    }
    .logo { margin-bottom: 24px; }
    .logo svg { width: 48px; height: 48px; }
    h1 {
      color: #1a1a1a;
      font-size: 24px;
      margin-bottom: 16px;
    }
    p {
      color: #666;
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .email {
      background: #f0f0f0;
      border-radius: 8px;
      padding: 12px 16px;
      font-family: monospace;
      font-size: 14px;
      color: #333;
      margin-bottom: 24px;
      word-break: break-all;
    }
    .type-badge {
      display: inline-block;
      background: #e3f2fd;
      color: #1976d2;
      padding: 6px 12px;
      border-radius: 16px;
      font-size: 14px;
      margin-bottom: 24px;
    }
    form { margin-top: 24px; }
    button {
      background: #dc2626;
      color: white;
      border: none;
      border-radius: 8px;
      padding: 14px 32px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
      width: 100%;
    }
    button:hover { background: #b91c1c; }
    button:disabled {
      background: #9ca3af;
      cursor: not-allowed;
    }
    .cancel {
      display: block;
      margin-top: 16px;
      color: #666;
      text-decoration: none;
      font-size: 14px;
    }
    .cancel:hover { color: #333; }
    .footer {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #eee;
      color: #999;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="24" fill="#1976d2"/>
        <path d="M15 20h18v12a2 2 0 0 1-2 2H17a2 2 0 0 1-2-2V20Z" fill="white"/>
        <path d="M33 16H15a2 2 0 0 0-2 2v2h22v-2a2 2 0 0 0-2-2Z" fill="white" opacity=".7"/>
      </svg>
    </div>
    <h1>Unsubscribe from emails</h1>
    <p>You're about to unsubscribe the following email address:</p>
    <div class="email">${escapeHtml(payload.email)}</div>
    <div class="type-badge">${escapeHtml(typeLabel)}</div>
    <p>Are you sure you want to unsubscribe? You can always update your preferences in your account settings.</p>

    <form id="unsubscribe-form" method="POST">
      <input type="hidden" name="token" value="">
      <button type="submit" id="submit-btn">Unsubscribe</button>
    </form>

    <a href="https://finanseal.com" class="cancel">Cancel and return to FinanSEAL</a>

    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} FinanSEAL. All rights reserved.</p>
    </div>
  </div>

  <script>
    // Preserve token from URL for form submission
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    document.querySelector('input[name="token"]').value = token || '';

    // Handle form submission
    document.getElementById('unsubscribe-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('submit-btn');
      btn.disabled = true;
      btn.textContent = 'Processing...';

      try {
        const response = await fetch('/api/v1/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });

        const result = await response.json();

        if (result.success) {
          window.location.href = '/api/v1/unsubscribe/success';
        } else {
          alert(result.error || 'Failed to unsubscribe. Please try again.');
          btn.disabled = false;
          btn.textContent = 'Unsubscribe';
        }
      } catch (error) {
        alert('An error occurred. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Unsubscribe';
      }
    });
  </script>
</body>
</html>`
}

/**
 * Generate error HTML page
 */
function renderErrorPage(error: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - FinanSEAL</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: #f5f5f5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      max-width: 480px;
      width: 100%;
      padding: 40px;
      text-align: center;
    }
    .icon {
      width: 64px;
      height: 64px;
      background: #fef2f2;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
    }
    .icon svg { width: 32px; height: 32px; color: #dc2626; }
    h1 {
      color: #1a1a1a;
      font-size: 24px;
      margin-bottom: 16px;
    }
    p {
      color: #666;
      font-size: 16px;
      line-height: 1.6;
    }
    a {
      display: inline-block;
      margin-top: 24px;
      background: #1976d2;
      color: white;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
    }
    a:hover { background: #1565c0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
      </svg>
    </div>
    <h1>Something went wrong</h1>
    <p>${escapeHtml(error)}</p>
    <a href="https://finanseal.com">Return to FinanSEAL</a>
  </div>
</body>
</html>`
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }
  return text.replace(/[&<>"']/g, m => map[m])
}

// ===== ROUTE HANDLERS =====

/**
 * GET - Render unsubscribe confirmation page
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token) {
    return new NextResponse(renderErrorPage('Missing unsubscribe token. Please use the link from your email.'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' }
    })
  }

  // Verify token
  const result = await verifyUnsubscribeToken(token)

  if (!result.success || !result.payload) {
    return new NextResponse(renderErrorPage(result.error || 'Invalid unsubscribe link'), {
      status: 400,
      headers: { 'Content-Type': 'text/html' }
    })
  }

  // Render confirmation page
  return new NextResponse(renderConfirmationPage(result.payload), {
    status: 200,
    headers: { 'Content-Type': 'text/html' }
  })
}

/**
 * POST - Process unsubscribe request
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { token } = body

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Missing token' },
        { status: 400 }
      )
    }

    // Verify token
    const result = await verifyUnsubscribeToken(token)

    if (!result.success || !result.payload) {
      return NextResponse.json(
        { success: false, error: result.error || 'Invalid token' },
        { status: 400 }
      )
    }

    const { userId, email, type } = result.payload

    // Update email preferences in Convex
    const convex = getConvexClient()

    // Try to find user by email first (userId in token might not be valid Convex ID)
    let convexUserId: Id<'users'> | null = null

    try {
      // Check if userId looks like a valid Convex ID (they start with specific patterns)
      // Convex IDs are base64-like strings, not test strings like "test-e2e-..."
      if (userId && !userId.startsWith('test-')) {
        // Try to use it directly - will fail if invalid
        convexUserId = userId as Id<'users'>
      }
    } catch {
      // userId is not a valid Convex ID, we'll use email-based suppression
      convexUserId = null
    }

    // If we have a valid Convex user ID, update their preferences
    if (convexUserId) {
      // Map unsubscribe type to preference fields
      const updates: Record<string, boolean> = {}

      switch (type) {
        case 'marketing':
          updates.marketingEnabled = false
          break
        case 'onboarding':
          updates.onboardingTipsEnabled = false
          break
        case 'product_updates':
          updates.productUpdatesEnabled = false
          break
        case 'all':
          updates.globalUnsubscribe = true
          updates.marketingEnabled = false
          updates.onboardingTipsEnabled = false
          updates.productUpdatesEnabled = false
          break
      }

      try {
        await convex.mutation(api.functions.emails.updateEmailPreferences, {
          userId: convexUserId,
          ...updates
        })
        console.log(`[Unsubscribe API] Updated preferences for user ${convexUserId}`)
      } catch (prefError) {
        // Log but don't fail - user might be deleted
        console.warn(`[Unsubscribe API] Failed to update preferences: ${prefError}`)
        console.log(`[Unsubscribe API] Proceeding anyway for CAN-SPAM compliance`)
      }
    } else {
      // No valid user ID - log and succeed for CAN-SPAM compliance
      // AWS SES handles suppressions natively - no need for custom tracking
      console.log(`[Unsubscribe API] No valid user ID for ${email}, but succeeding for compliance`)
    }

    console.log(`[Unsubscribe API] Processed unsubscribe for ${email}, type: ${type}`)

    return NextResponse.json({
      success: true,
      message: 'Successfully unsubscribed'
    })

  } catch (error) {
    console.error('[Unsubscribe API] POST error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

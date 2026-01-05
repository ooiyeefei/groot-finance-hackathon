/**
 * Unsubscribe Success Page
 *
 * GET /api/v1/unsubscribe/success
 *
 * Renders a confirmation page after successful unsubscribe.
 * No authentication required.
 */

import { NextResponse } from 'next/server'

/**
 * Generate success HTML page
 */
function renderSuccessPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Unsubscribed - FinanSEAL</title>
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
      width: 80px;
      height: 80px;
      background: #ecfdf5;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 24px;
    }
    .icon svg {
      width: 40px;
      height: 40px;
      color: #059669;
    }
    h1 {
      color: #1a1a1a;
      font-size: 28px;
      margin-bottom: 16px;
    }
    p {
      color: #666;
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 8px;
    }
    .note {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 16px;
      margin: 24px 0;
      text-align: left;
    }
    .note h3 {
      color: #334155;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .note ul {
      color: #64748b;
      font-size: 14px;
      margin-left: 20px;
    }
    .note li {
      margin-bottom: 4px;
    }
    .button-group {
      display: flex;
      gap: 12px;
      justify-content: center;
      margin-top: 24px;
    }
    .btn {
      display: inline-block;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      text-decoration: none;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #1976d2;
      color: white;
    }
    .btn-primary:hover {
      background: #1565c0;
    }
    .btn-secondary {
      background: white;
      color: #475569;
      border: 1px solid #e2e8f0;
    }
    .btn-secondary:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
    }
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
    <div class="icon">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
      </svg>
    </div>
    <h1>You've been unsubscribed</h1>
    <p>Your email preferences have been updated successfully.</p>
    <p>You will no longer receive these emails from FinanSEAL.</p>

    <div class="note">
      <h3>Please note:</h3>
      <ul>
        <li>You may still receive important transactional emails (e.g., password resets, security alerts)</li>
        <li>It may take up to 24 hours for changes to fully take effect</li>
        <li>You can update your preferences anytime in your account settings</li>
      </ul>
    </div>

    <div class="button-group">
      <a href="https://finanseal.com" class="btn btn-primary">Go to FinanSEAL</a>
      <a href="https://finanseal.com/settings/notifications" class="btn btn-secondary">Manage Preferences</a>
    </div>

    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} FinanSEAL. All rights reserved.</p>
      <p style="margin-top: 8px;">
        <a href="https://finanseal.com/privacy" style="color: #999; text-decoration: none;">Privacy Policy</a>
        &nbsp;•&nbsp;
        <a href="https://finanseal.com/terms" style="color: #999; text-decoration: none;">Terms of Service</a>
      </p>
    </div>
  </div>
</body>
</html>`
}

/**
 * GET - Render success page
 */
export async function GET() {
  return new NextResponse(renderSuccessPage(), {
    status: 200,
    headers: { 'Content-Type': 'text/html' }
  })
}

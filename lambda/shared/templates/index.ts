/**
 * Email Template Loader
 *
 * Templates are inlined to work with esbuild bundling.
 * No file system access needed at runtime.
 */

// Inline templates (esbuild-compatible)
const TEMPLATES: Record<string, string> = {
  welcome_new_user: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to FinanSEAL</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
    .logo {
      text-align: center;
      margin-bottom: 32px;
    }
    .logo-text {
      font-size: 24px;
      font-weight: 700;
      color: #0066cc;
    }
    h1 {
      font-size: 28px;
      font-weight: 600;
      margin: 0 0 16px;
      color: #1a1a1a;
    }
    p {
      margin: 0 0 16px;
      color: #4a4a4a;
    }
    .highlight {
      background: linear-gradient(135deg, #0066cc 0%, #0052a3 100%);
      color: white;
      border-radius: 8px;
      padding: 24px;
      margin: 24px 0;
    }
    .highlight p {
      color: rgba(255, 255, 255, 0.9);
      margin: 0;
    }
    .features {
      margin: 24px 0;
    }
    .feature {
      display: flex;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .feature-icon {
      width: 24px;
      height: 24px;
      margin-right: 12px;
      color: #0066cc;
    }
    .button {
      display: inline-block;
      background: #0066cc;
      color: white;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 8px;
      font-weight: 600;
      margin: 24px 0;
    }
    .button:hover {
      background: #0052a3;
    }
    .footer {
      text-align: center;
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e5e5e5;
    }
    .footer p {
      font-size: 13px;
      color: #8a8a8a;
    }
    .footer a {
      color: #0066cc;
      text-decoration: none;
    }
    .unsubscribe {
      font-size: 12px;
      color: #999;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">
        <span class="logo-text">FinanSEAL</span>
      </div>

      <h1>Welcome, {{firstName}}! 🎉</h1>

      <p>Thank you for joining FinanSEAL - your AI-powered financial co-pilot for Southeast Asian SMEs.</p>

      <div class="highlight">
        <p>You're now part of a growing community of business owners who are simplifying their financial management with intelligent automation.</p>
      </div>

      <p>Here's what you can do with FinanSEAL:</p>

      <div class="features">
        <div class="feature">
          <span class="feature-icon">📄</span>
          <div>
            <strong>Smart Document Processing</strong>
            <p style="margin: 4px 0 0; font-size: 14px;">Upload invoices and receipts - our AI extracts all the data automatically.</p>
          </div>
        </div>

        <div class="feature">
          <span class="feature-icon">💬</span>
          <div>
            <strong>AI Financial Assistant</strong>
            <p style="margin: 4px 0 0; font-size: 14px;">Ask questions about your finances in natural language.</p>
          </div>
        </div>

        <div class="feature">
          <span class="feature-icon">💱</span>
          <div>
            <strong>Multi-Currency Support</strong>
            <p style="margin: 4px 0 0; font-size: 14px;">Track transactions across 9 Southeast Asian currencies.</p>
          </div>
        </div>
      </div>

      <p style="text-align: center;">
        <a href="{{loginUrl}}" class="button" style="color: #ffffff !important;">Get Started →</a>
      </p>

      <p>Need help? Contact <a href="mailto:hello@hellogroot.com">hello@hellogroot.com</a></p>

      <div class="footer">
        <p>© 2026 FinanSEAL. All rights reserved.</p>
        <p>Singapore | Thailand | Indonesia | Malaysia</p>
        <p class="unsubscribe">
          You're receiving this email because you signed up for FinanSEAL.<br>
          <a href="{{unsubscribeUrl}}">Manage email preferences</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`,

  welcome_team_member: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to FinanSEAL</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
    .logo {
      text-align: center;
      margin-bottom: 32px;
    }
    .logo-text {
      font-size: 24px;
      font-weight: 700;
      color: #0066cc;
    }
    h1 {
      font-size: 28px;
      font-weight: 600;
      margin: 0 0 16px;
      color: #1a1a1a;
    }
    p {
      margin: 0 0 16px;
      color: #4a4a4a;
    }
    .invite-card {
      background: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 8px;
      padding: 20px;
      margin: 24px 0;
      text-align: center;
    }
    .invite-card .inviter {
      font-weight: 600;
      color: #1a1a1a;
    }
    .features {
      margin: 24px 0;
    }
    .feature {
      display: flex;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .feature-icon {
      width: 24px;
      height: 24px;
      margin-right: 12px;
      color: #0066cc;
    }
    .button {
      display: inline-block;
      background: #0066cc;
      color: white;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 8px;
      font-weight: 600;
      margin: 24px 0;
    }
    .button:hover {
      background: #0052a3;
    }
    .tips {
      background: #e8f4fd;
      border-radius: 8px;
      padding: 20px;
      margin: 24px 0;
    }
    .tips h3 {
      margin: 0 0 12px;
      font-size: 16px;
      color: #0066cc;
    }
    .tips ul {
      margin: 0;
      padding-left: 20px;
    }
    .tips li {
      margin-bottom: 8px;
      color: #4a4a4a;
      font-size: 14px;
    }
    .footer {
      text-align: center;
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e5e5e5;
    }
    .footer p {
      font-size: 13px;
      color: #8a8a8a;
    }
    .footer a {
      color: #0066cc;
      text-decoration: none;
    }
    .unsubscribe {
      font-size: 12px;
      color: #999;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">
        <span class="logo-text">FinanSEAL</span>
      </div>

      <h1>Welcome to the team, {{firstName}}! 👋</h1>

      <div class="invite-card">
        <p style="margin: 0; color: #6c757d;">You've been invited by</p>
        <p class="inviter" style="margin: 8px 0 0;">{{invitedBy}}</p>
      </div>

      <p>You now have access to FinanSEAL - your team's AI-powered financial co-pilot. Your account is ready to use.</p>

      <div class="tips">
        <h3>🚀 Quick Start Guide</h3>
        <ul>
          <li><strong>Dashboard:</strong> View your team's financial overview</li>
          <li><strong>Documents:</strong> Upload and process invoices/receipts</li>
          <li><strong>Chat:</strong> Ask questions about your finances</li>
          <li><strong>Transactions:</strong> Review and manage financial records</li>
        </ul>
      </div>

      <p style="text-align: center;">
        <a href="{{loginUrl}}" class="button" style="color: #ffffff !important;">Access Your Account →</a>
      </p>

      <p>Need help? Contact <a href="mailto:hello@hellogroot.com">hello@hellogroot.com</a></p>

      <div class="footer">
        <p>© 2026 FinanSEAL. All rights reserved.</p>
        <p>Singapore | Thailand | Indonesia | Malaysia</p>
        <p class="unsubscribe">
          You're receiving this email because you were invited to join FinanSEAL.<br>
          <a href="{{unsubscribeUrl}}">Manage email preferences</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>`,

  invitation: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited to FinanSEAL</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      background-color: #f5f5f5;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      padding: 40px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    }
    .logo {
      text-align: center;
      margin-bottom: 32px;
    }
    .logo-text {
      font-size: 24px;
      font-weight: 700;
      color: #0066cc;
    }
    h1 {
      font-size: 28px;
      font-weight: 600;
      margin: 0 0 16px;
      color: #1a1a1a;
    }
    p {
      margin: 0 0 16px;
      color: #4a4a4a;
    }
    .button {
      display: inline-block;
      background: #0066cc;
      color: white;
      text-decoration: none;
      padding: 14px 28px;
      border-radius: 8px;
      font-weight: 600;
      margin: 24px 0;
    }
    .footer {
      text-align: center;
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #e5e5e5;
    }
    .footer p {
      font-size: 13px;
      color: #8a8a8a;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo">
        <span class="logo-text">FinanSEAL</span>
      </div>

      <h1>You're invited! 🎉</h1>

      <p>{{invitedBy}} has invited you to join their team on FinanSEAL.</p>

      <p style="text-align: center;">
        <a href="{{inviteUrl}}" class="button" style="color: #ffffff !important;">Accept Invitation →</a>
      </p>

      <p>This invitation expires in 7 days.</p>

      <div class="footer">
        <p>© 2026 FinanSEAL. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>`,
};

/**
 * Get and render an email template
 */
export async function getTemplate(
  templateType: string,
  data: Record<string, unknown>
): Promise<string> {
  const template = TEMPLATES[templateType];

  if (!template) {
    throw new Error(`Unknown template type: ${templateType}`);
  }

  // Simple variable substitution: {{variableName}}
  let rendered = template;
  for (const [key, value] of Object.entries(data)) {
    const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    rendered = rendered.replace(placeholder, String(value ?? ''));
  }

  // Remove any unreplaced placeholders
  rendered = rendered.replace(/\{\{[^}]+\}\}/g, '');

  return rendered;
}

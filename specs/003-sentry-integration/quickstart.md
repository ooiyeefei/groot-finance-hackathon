# Quickstart: Error Logging & Monitoring (Sentry Integration)

**Branch**: `003-sentry-integration` | **Date**: 2026-01-04

## Prerequisites

1. Sentry account (free Developer tier)
2. Telegram account with BotFather bot created
3. Access to Vercel project settings

## Setup Steps

### 1. Create Sentry Project

1. Go to [sentry.io](https://sentry.io) and sign up/login
2. Create new project → Select "Next.js"
3. Note down:
   - **DSN** (looks like `https://xxx@xxx.ingest.sentry.io/xxx`)
   - **Organization slug** (from URL: `sentry.io/organizations/{org-slug}/`)
   - **Project slug** (from URL: `sentry.io/organizations/{org}/projects/{project-slug}/`)

### 2. Generate Sentry Auth Token

1. Go to Settings → Developer Settings → Auth Tokens
2. Create new token with scopes:
   - `project:releases`
   - `project:write`
   - `org:read`
3. Copy the token (shown only once)

### 3. Create Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` and follow prompts
3. Note down the **Bot Token** (format: `123456:ABC-DEF...`)
4. Create a group/channel and add your bot
5. Get chat ID:
   - Send a message to the group
   - Visit `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
   - Find `chat.id` in the response

### 4. Configure Environment Variables

Add to `.env.local`:

```bash
# Sentry Configuration
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_AUTH_TOKEN=sntrys_xxx
SENTRY_ORG=finanseal
SENTRY_PROJECT=finanseal-web

# Telegram Alerts
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_CHAT_ID=-1001234567890

# Webhook Security (generate random string)
SENTRY_WEBHOOK_SECRET=your-random-secret-string
```

### 5. Add to Vercel

1. Go to Vercel → Project Settings → Environment Variables
2. Add all variables above (except `NEXT_PUBLIC_*` which auto-deploy)
3. `SENTRY_AUTH_TOKEN` needed for build-time source map upload

### 6. Configure Sentry Alerts

1. In Sentry → Alerts → Create Alert Rule
2. Set conditions:
   - When: "A new issue is created"
   - Environment: "production"
3. Add action:
   - "Send a notification via webhook"
   - URL: `https://your-domain.com/api/v1/system/webhooks/sentry`
   - Add header: `X-Sentry-Token: your-webhook-secret`

## Verification

### Test Error Capture

```typescript
// Add to any page temporarily
'use client';
import * as Sentry from "@sentry/nextjs";

export default function TestPage() {
  return (
    <button onClick={() => {
      throw new Error("Test Sentry Error");
    }}>
      Trigger Test Error
    </button>
  );
}
```

### Expected Results

1. Error appears in Sentry dashboard within 1 minute
2. Stack trace shows original TypeScript line numbers
3. User context shows (if authenticated)
4. Telegram receives alert message (if webhook configured)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No errors in Sentry | Check DSN in browser console, verify `sentry.client.config.ts` loads |
| Minified stack traces | Verify `SENTRY_AUTH_TOKEN` is set in Vercel build env |
| No user context | Check `Sentry.setUser()` is called after auth |
| No Telegram alerts | Verify webhook URL, check API route logs |
| Webhook 401 | Ensure `X-Sentry-Token` header matches `SENTRY_WEBHOOK_SECRET` |

## Key Files

```
src/
├── sentry.client.config.ts    # Client SDK init
├── sentry.server.config.ts    # Server SDK init
├── sentry.edge.config.ts      # Edge runtime init
├── instrumentation.ts         # Server instrumentation
├── app/
│   ├── error.tsx              # Route error boundary
│   ├── global-error.tsx       # Root error boundary
│   └── api/v1/system/webhooks/sentry/route.ts
└── domains/system/lib/
    ├── sentry.ts              # Sentry helpers
    └── telegram-notifier.ts   # Telegram sender
```

## Next Steps

After setup:
1. Run `npm run build` to verify source map upload
2. Deploy to Vercel staging environment
3. Trigger test error and verify full pipeline
4. Configure alert rules for your team's needs

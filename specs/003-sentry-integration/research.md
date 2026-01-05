# Research: Error Logging & Monitoring (Sentry Integration)

**Branch**: `003-sentry-integration` | **Date**: 2026-01-04

## Technology Decisions

### 1. Error Monitoring SDK

**Decision**: `@sentry/nextjs` (Sentry Next.js SDK)

**Rationale**:
- Official Next.js 15 App Router support with automatic configuration
- Integrated source map upload during build via `withSentryConfig`
- Built-in error boundaries for React component failures
- Automatic instrumentation for API routes, middleware, and server components
- 10% performance trace sampling configurable out-of-box

**Alternatives Considered**:
- **Bugsnag**: Good but more expensive, less Next.js-specific tooling
- **Rollbar**: Limited App Router support, fewer integrations
- **LogRocket**: Expensive, overkill for error-only monitoring
- **Self-hosted Sentry**: Requires infrastructure management

**Configuration Pattern**:
```typescript
// next.config.ts - wraps existing config
import { withSentryConfig } from "@sentry/nextjs";
export default withSentryConfig(nextConfig, {
  org: "finanseal",
  project: "finanseal-web",
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
});
```

### 2. User Context Enrichment

**Decision**: Integrate with existing Clerk authentication via `Sentry.setUser()`

**Rationale**:
- Clerk `auth()` already provides `userId` in server components
- `BusinessContext` service provides `businessId` and `role`
- Sentry `setUser()` accepts custom fields for business context
- Minimal code changes - hook into existing auth flow

**Implementation Pattern**:
```typescript
// After Clerk auth succeeds
Sentry.setUser({
  id: userId,
  business_id: businessContext?.businessId,
  role: businessContext?.role,
});
```

### 3. Data Scrubbing / PII Protection

**Decision**: Use `beforeSend` hook with allowlist approach

**Rationale**:
- `beforeSend` intercepts events before transmission
- Allowlist is safer than denylist for sensitive data
- Can delete entire request headers/body when needed
- Pattern already recommended in Sentry docs

**Scrubbing Targets**:
- `event.request.headers.authorization` - Bearer tokens
- `event.request.headers.cookie` - Session cookies
- `event.request.data` containing: password, token, credit_card, ssn patterns
- `event.user.email` - Remove if included accidentally

### 4. Telegram Alert Integration

**Decision**: Custom Next.js API route webhook handler forwarding to Telegram Bot API

**Rationale**:
- Sentry webhooks available on free tier (unlike native Slack)
- Telegram Bot API is simple: single HTTP POST with bot token
- No user limits on Telegram (vs. Slack workspace restrictions)
- Immediate setup with BotFather

**Architecture**:
```
Sentry Alert → Webhook POST → /api/v1/system/webhooks/sentry → Telegram Bot API
```

**Telegram API**:
- Endpoint: `https://api.telegram.org/bot<token>/sendMessage`
- Auth: Bot token from BotFather
- Required: `chat_id`, `text`

### 5. Performance Monitoring

**Decision**: 10% client-side trace sampling, 100% error capture

**Rationale**:
- Clarification session confirmed 10% sampling rate
- Balances data quality with free tier quota (~5K events/month)
- Errors always captured at 100% (not subject to sampling)
- Can increase sampling post-launch if needed

**Configuration**:
```typescript
Sentry.init({
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  // Errors captured at 100% regardless of tracesSampleRate
});
```

### 6. Trigger.dev Task Instrumentation

**Decision**: Add Sentry SDK to Trigger.dev tasks for background job monitoring

**Rationale**:
- Clarification confirmed job failures trigger same alerting pipeline
- `@sentry/node` works in Trigger.dev Node runtime
- Task errors captured with domain tags for filtering
- Future Lambda migration only requires SDK swap

**Pattern**:
```typescript
// In Trigger.dev task
import * as Sentry from "@sentry/node";

export const extractInvoiceData = task({
  id: "extract-invoice-data",
  run: async (payload) => {
    Sentry.setTag("domain", "invoices");
    Sentry.setTag("task", "extract-invoice-data");
    try {
      // task logic
    } catch (error) {
      Sentry.captureException(error, {
        extra: { document_id: payload.documentId }
      });
      throw error; // Re-throw for Trigger.dev retry handling
    }
  },
});
```

## File Structure

Based on Constitution Principle I (Domain-Driven Architecture):

```
src/
├── domains/
│   └── system/
│       ├── lib/
│       │   ├── sentry.ts              # Sentry initialization helpers
│       │   └── telegram-notifier.ts   # Telegram bot message sender
│       └── components/
│           └── error-boundary.tsx     # Global error boundary
├── app/
│   ├── api/v1/system/
│   │   └── webhooks/
│   │       └── sentry/
│   │           └── route.ts           # Sentry webhook handler
│   ├── error.tsx                      # Root error boundary
│   └── global-error.tsx               # Global error handler
├── instrumentation.ts                  # Server-side Sentry init
├── sentry.client.config.ts            # Client-side Sentry init
├── sentry.server.config.ts            # Server-side Sentry config
└── sentry.edge.config.ts              # Edge runtime Sentry config
```

## Environment Variables

| Variable | Description | Location |
|----------|-------------|----------|
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry project DSN (public) | `.env.local` |
| `SENTRY_AUTH_TOKEN` | Build-time source map upload | `.env.local` + Vercel |
| `SENTRY_ORG` | Sentry organization slug | `next.config.ts` |
| `SENTRY_PROJECT` | Sentry project slug | `next.config.ts` |
| `TELEGRAM_BOT_TOKEN` | Telegram bot auth token | `.env.local` |
| `TELEGRAM_CHAT_ID` | Target chat/group for alerts | `.env.local` |

## Dependencies

```json
{
  "@sentry/nextjs": "^9.x",
  "@sentry/node": "^9.x"
}
```

Note: `@sentry/nextjs` includes client, server, and edge configs. `@sentry/node` needed separately for Trigger.dev tasks.

## Security Considerations

1. **SENTRY_AUTH_TOKEN**: Only used at build time for source map upload. Never exposed to client.
2. **TELEGRAM_BOT_TOKEN**: Server-side only, stored in environment variables
3. **Webhook Validation**: Sentry webhooks should verify `X-Sentry-Token` header
4. **PII Scrubbing**: `beforeSend` removes sensitive headers before transmission

## Constitution Compliance Pre-Check

| Principle | Compliance | Notes |
|-----------|------------|-------|
| I. Domain-Driven | Yes | System domain for cross-cutting monitoring |
| II. Semantic Design | N/A | No UI components (error boundary is functional) |
| III. Build Validation | Required | Must pass after integration |
| IV. Simplicity First | Yes | Minimal files, leverages Sentry defaults |
| V. Background Jobs | Yes | Sentry SDK added to existing Trigger.dev tasks |

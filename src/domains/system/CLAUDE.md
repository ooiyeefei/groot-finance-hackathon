# System Domain

## Purpose

The **system** domain handles cross-cutting infrastructure concerns that span the entire application. This includes:

1. **Error Monitoring** - Sentry SDK integration, error capture, user context enrichment
2. **Webhooks** - External service webhook handlers (Sentry → Telegram alerts)
3. **Health Checks** - System health and readiness endpoints
4. **Knowledge Base** - System-wide documentation and help content

## Directory Structure

```
src/domains/system/
├── lib/
│   ├── sentry.ts              # Sentry helpers (setUser, setContext, domain tags)
│   ├── telegram-notifier.ts   # Telegram Bot API message sender
│   ├── health.service.ts      # System health check service
│   ├── knowledge-base.service.ts # Knowledge base management
│   └── webhook.service.ts     # Generic webhook handling
└── CLAUDE.md                  # This documentation
```

## Key Files

### sentry.ts
Sentry helper functions for user context and error enrichment:
- `setSentryUserContext()` - Set Clerk user_id and business_id
- `setSentryDomainTag()` - Tag errors by domain (invoices, expense-claims, etc.)
- `scrubSensitiveData()` - PII removal for beforeSend hook

### telegram-notifier.ts
Telegram Bot API integration for alert forwarding:
- `sendTelegramAlert()` - Send formatted error alerts to configured chat
- Handles rate limiting and error recovery

## API Routes

System domain API routes are located at:
- `/api/v1/system/webhooks/sentry` - Receive Sentry alert webhooks, forward to Telegram
- `/api/v1/system/health` - System health check endpoint

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `NEXT_PUBLIC_SENTRY_DSN` | Yes | Sentry DSN for error capture |
| `SENTRY_AUTH_TOKEN` | Build | Source map upload authentication |
| `SENTRY_ORG` | Yes | Sentry organization slug |
| `SENTRY_PROJECT` | Yes | Sentry project slug |
| `TELEGRAM_BOT_TOKEN` | Phase 5 | Telegram bot authentication |
| `TELEGRAM_CHAT_ID` | Phase 5 | Alert destination chat/group |
| `SENTRY_WEBHOOK_SECRET` | Phase 5 | Webhook validation secret |

## Integration Points

- **Clerk Authentication**: User context enrichment via `setSentryUserContext()`
- **All Domains**: Domain tagging via `setSentryDomainTag()` for error filtering
- **Trigger.dev Tasks**: Background job error capture via `@sentry/node`

## Constitution Compliance

- ✅ **Principle I**: Domain-driven architecture in `src/domains/system/`
- ✅ **Principle IV**: Minimal changes, leveraging SDK defaults
- N/A **Principle II**: No UI components (error boundary is functional)

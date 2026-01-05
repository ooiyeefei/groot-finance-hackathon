# Implementation Plan: Error Logging & Monitoring (Sentry Integration)

**Branch**: `003-sentry-integration` | **Date**: 2026-01-04 | **Spec**: [spec.md](./spec.md)
**GitHub Issue**: [#82](https://github.com/grootdev-ai/finanseal-mvp/issues/82)
**Priority**: P0 - Launch Blocker

## Summary

Integrate Sentry error monitoring into FinanSEAL to capture all unhandled exceptions with readable stack traces, user context enrichment (Clerk user_id, business_id), 10% performance trace sampling, and Telegram alert forwarding via custom webhook endpoint.

## Technical Context

**Language/Version**: TypeScript 5.9+ with Next.js 15.4.6 App Router
**Primary Dependencies**: `@sentry/nextjs` ^9.x, `@sentry/node` ^9.x (for Trigger.dev)
**Storage**: N/A - External storage in Sentry infrastructure
**Testing**: Manual verification + intentional error triggers
**Target Platform**: Vercel serverless (production), Node.js (Trigger.dev tasks)
**Project Type**: Web application (Next.js monolith)
**Performance Goals**: Error capture < 1 minute latency, Telegram alert < 5 minutes
**Constraints**: Free tier (~5K errors/month), 10% trace sampling, 90-day retention
**Scale/Scope**: Single Sentry project, single Telegram channel

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Domain-Driven Architecture | Feature code in `src/domains/system/`? API in `/api/v1/system/`? | PASS |
| II. Semantic Design System | UI uses semantic tokens only? No hardcoded colors? | N/A (no UI) |
| III. Build Validation | `npm run build` passes? | Required |
| IV. Simplicity First | Minimal changes? No over-engineering? | PASS |
| V. Background Jobs | Long tasks use Trigger.dev? Fire-and-forget pattern? | N/A (adds monitoring to existing) |

## Project Structure

### Documentation (this feature)

```text
specs/003-sentry-integration/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Technology decisions
├── data-model.md        # Event structures
├── quickstart.md        # Setup guide
├── contracts/           # API contracts
│   └── webhook-api.yaml # Sentry webhook OpenAPI spec
└── tasks.md             # Implementation tasks (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── domains/
│   └── system/
│       ├── lib/
│       │   ├── sentry.ts              # Sentry helpers (setUser, setContext)
│       │   └── telegram-notifier.ts   # Telegram Bot API sender
│       └── CLAUDE.md                  # Domain documentation
├── app/
│   ├── error.tsx                      # Route-level error boundary
│   ├── global-error.tsx               # Root error boundary
│   └── api/v1/system/
│       └── webhooks/
│           └── sentry/
│               └── route.ts           # Webhook handler
├── instrumentation.ts                  # Server instrumentation entry
├── sentry.client.config.ts            # Client SDK configuration
├── sentry.server.config.ts            # Server SDK configuration
└── sentry.edge.config.ts              # Edge runtime configuration

# Trigger.dev tasks (existing, to be instrumented)
src/trigger/
├── extract-invoice-data.ts            # Add Sentry capture
├── extract-receipt-data.ts            # Add Sentry capture
├── classify-document.ts               # Add Sentry capture
└── convert-pdf-to-image.ts            # Add Sentry capture
```

**Structure Decision**: Sentry configuration files at project root per Next.js convention. Domain-specific helpers in `src/domains/system/lib/`. Webhook API in `/api/v1/system/` following domain architecture.

## Complexity Tracking

No constitution violations. All changes follow existing patterns.

## Implementation Phases

### Phase 1: Core Sentry SDK Setup (P0)

**Goal**: Capture errors with readable stack traces

| Task | Files | FR |
|------|-------|-----|
| Install `@sentry/nextjs` | `package.json` | - |
| Create client config | `sentry.client.config.ts` | FR-001 |
| Create server config | `sentry.server.config.ts` | FR-001 |
| Create edge config | `sentry.edge.config.ts` | FR-001 |
| Create instrumentation | `instrumentation.ts` | FR-001 |
| Wrap next.config.ts | `next.config.ts` | FR-002 |
| Add environment variables | `.env.example`, `.env.local` | - |

**Verification**: `npm run build` uploads source maps, test error appears in Sentry dashboard with readable stack trace.

### Phase 2: Error Boundaries & User Context (P0)

**Goal**: Graceful error handling + user identification

| Task | Files | FR |
|------|-------|-----|
| Create global error handler | `src/app/global-error.tsx` | FR-003 |
| Create route error boundary | `src/app/error.tsx` | FR-003 |
| Create Sentry helpers | `src/domains/system/lib/sentry.ts` | FR-004, FR-005 |
| Add user context hook | `src/app/layout.tsx` or provider | FR-004 |
| Implement beforeSend scrubbing | `sentry.client.config.ts` | FR-005 |

**Verification**: Authenticated errors show user_id and business_id. Sensitive headers stripped.

### Phase 3: Performance Monitoring (P1)

**Goal**: 10% trace sampling with Core Web Vitals

| Task | Files | FR |
|------|-------|-----|
| Enable tracesSampleRate 10% | `sentry.client.config.ts` | FR-009 |
| Add distributed tracing | `src/app/layout.tsx` | FR-010 |
| Verify API tracing | - (automatic) | FR-010 |

**Verification**: Performance tab in Sentry shows page loads and API calls.

### Phase 4: Trigger.dev Instrumentation (P1)

**Goal**: Background job error capture

| Task | Files | FR |
|------|-------|-----|
| Install `@sentry/node` | `package.json` | - |
| Create task wrapper helper | `src/trigger/utils/sentry-helpers.ts` | FR-011 |
| Instrument extract-invoice-data | `src/trigger/extract-invoice-data.ts` | FR-011 |
| Instrument extract-receipt-data | `src/trigger/extract-receipt-data.ts` | FR-011 |
| Instrument other tasks | `src/trigger/*.ts` | FR-011 |

**Verification**: Task failures appear in Sentry with domain tags.

### Phase 5: Telegram Webhook Integration (P2)

**Goal**: Forward alerts to Telegram

| Task | Files | FR |
|------|-------|-----|
| Create Telegram notifier | `src/domains/system/lib/telegram-notifier.ts` | FR-013 |
| Create webhook route | `src/app/api/v1/system/webhooks/sentry/route.ts` | FR-012 |
| Add webhook secret validation | webhook route | Security |
| Configure Sentry alert rule | Sentry dashboard | FR-006, FR-007, FR-008 |
| Add Telegram env vars | `.env.example` | - |

**Verification**: Test error triggers Telegram message in configured chat.

## Environment Variables

| Variable | Required | Scope | Description |
|----------|----------|-------|-------------|
| `NEXT_PUBLIC_SENTRY_DSN` | Yes | Client+Server | Sentry DSN |
| `SENTRY_AUTH_TOKEN` | Yes (build) | Build only | Source map upload auth |
| `SENTRY_ORG` | Yes | Config | Organization slug |
| `SENTRY_PROJECT` | Yes | Config | Project slug |
| `TELEGRAM_BOT_TOKEN` | Yes (Phase 5) | Server | Telegram bot token |
| `TELEGRAM_CHAT_ID` | Yes (Phase 5) | Server | Alert destination |
| `SENTRY_WEBHOOK_SECRET` | Yes (Phase 5) | Server | Webhook auth |

## Dependencies

```json
{
  "dependencies": {
    "@sentry/nextjs": "^9.0.0"
  },
  "devDependencies": {}
}
```

For Trigger.dev tasks (separate package context):
```json
{
  "dependencies": {
    "@sentry/node": "^9.0.0"
  }
}
```

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Free tier quota exceeded | Low | Medium | Start with 10% sampling, monitor usage |
| Source maps not uploading | Medium | High | Test in staging first, verify build logs |
| Telegram rate limiting | Low | Low | Sentry groups errors, limits webhook volume |
| Build time increase | Low | Low | Source map upload is parallelized |

## Success Verification Checklist

- [ ] Error thrown in browser appears in Sentry within 1 minute
- [ ] Stack trace shows TypeScript file names and line numbers
- [ ] Authenticated errors include user_id and business_id
- [ ] No Authorization headers or tokens in error reports
- [ ] Performance traces visible in Sentry (sample rate ~10%)
- [ ] Trigger.dev task failure appears in Sentry
- [ ] Telegram receives alert for new error (after Phase 5)
- [ ] `npm run build` completes without errors

## Artifacts Generated

| Artifact | Path | Status |
|----------|------|--------|
| Research | `specs/003-sentry-integration/research.md` | Complete |
| Data Model | `specs/003-sentry-integration/data-model.md` | Complete |
| API Contract | `specs/003-sentry-integration/contracts/webhook-api.yaml` | Complete |
| Quickstart | `specs/003-sentry-integration/quickstart.md` | Complete |
| Tasks | `specs/003-sentry-integration/tasks.md` | Pending (`/speckit.tasks`) |

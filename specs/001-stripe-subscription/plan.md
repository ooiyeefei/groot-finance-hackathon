# Implementation Plan: Stripe Subscription Integration

**Branch**: `001-stripe-subscription` | **Date**: 2025-12-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-stripe-subscription/spec.md`

## Summary

Integrate Stripe for subscription billing and monetization with three tiers (Free, Pro, Enterprise). The implementation uses Stripe Checkout for secure payment collection, Stripe Customer Portal for self-service management, and webhooks for real-time subscription state synchronization. Per-business billing with immediate proration on plan changes. Usage tracking for OCR credits with soft block on limit exceeded.

## Technical Context

**Language/Version**: TypeScript 5.9+ with Next.js 15 App Router
**Primary Dependencies**: Stripe SDK (`stripe`), Stripe React (`@stripe/stripe-js`), Supabase Client
**Storage**: Supabase PostgreSQL with RLS (subscription data synced from Stripe via webhooks)
**Testing**: Vitest for unit tests, Playwright for E2E, Stripe CLI for webhook testing
**Target Platform**: Web application (Next.js on Vercel/serverless)
**Project Type**: Web application with domain-driven architecture
**Performance Goals**: Checkout completion <3 min, webhook processing <30s (SC-001, SC-002)
**Constraints**: 99.9% webhook reliability (SC-006), idempotent event handling (FR-012)
**Scale/Scope**: Per-business subscriptions, 3 tiers, OCR usage metering

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Domain-Driven Architecture | Feature code in `src/domains/billing/`? API in `/api/v1/billing/`? | ✅ |
| II. Semantic Design System | UI uses semantic tokens only? No hardcoded colors? | ✅ |
| III. Build Validation | `npm run build` passes? | ✅ (will validate) |
| IV. Simplicity First | Minimal changes? No over-engineering? | ✅ |
| V. Background Jobs | Long tasks use Trigger.dev? Fire-and-forget pattern? | ✅ (webhooks are sync, no long tasks) |

**Notes**:
- New domain `src/domains/billing/` will be created following domain-driven architecture
- Webhook handlers are synchronous (Stripe expects <30s response) - no Trigger.dev needed
- Stripe Customer Portal handles most UI complexity (external hosted page)

## Project Structure

### Documentation (this feature)

```text
specs/001-stripe-subscription/
├── plan.md              # This file
├── research.md          # Phase 0: Stripe integration patterns
├── data-model.md        # Phase 1: Database schema
├── quickstart.md        # Phase 1: Developer setup guide
├── contracts/           # Phase 1: API contracts
│   ├── checkout.yaml    # Checkout session creation
│   ├── portal.yaml      # Customer portal session
│   ├── webhooks.yaml    # Webhook event handling
│   └── usage.yaml       # Usage tracking endpoints
└── tasks.md             # Phase 2: Implementation tasks
```

### Source Code (repository root)

```text
src/
├── domains/
│   └── billing/                    # NEW: Billing domain
│       ├── CLAUDE.md               # Domain documentation
│       ├── components/
│       │   ├── pricing-table.tsx   # Plan selection UI
│       │   ├── billing-settings.tsx # Subscription management
│       │   ├── usage-dashboard.tsx # OCR usage display
│       │   └── invoice-list.tsx    # Invoice history
│       ├── hooks/
│       │   ├── use-subscription.ts # Subscription state hook
│       │   └── use-usage.ts        # Usage tracking hook
│       ├── services/
│       │   ├── stripe.ts           # Stripe SDK wrapper
│       │   └── usage-tracker.ts    # OCR usage logic
│       └── types/
│           └── billing.ts          # Type definitions
├── app/
│   ├── api/v1/billing/
│   │   ├── checkout/route.ts       # Create checkout session
│   │   ├── portal/route.ts         # Create portal session
│   │   ├── webhooks/route.ts       # Stripe webhook handler
│   │   ├── subscription/route.ts   # Get subscription status
│   │   └── usage/route.ts          # Get/track usage
│   └── (authenticated)/
│       ├── pricing/page.tsx        # Pricing page
│       └── settings/billing/page.tsx # Billing settings page
└── lib/
    └── stripe/
        ├── client.ts               # Stripe client initialization
        ├── plans.ts                # Plan definitions (Free/Pro/Enterprise)
        └── webhook-handlers.ts     # Event type handlers

supabase/
└── migrations/
    ├── YYYYMMDD_add_stripe_to_businesses.sql  # 5 columns on businesses
    ├── YYYYMMDD_create_stripe_events.sql      # Webhook idempotency
    └── YYYYMMDD_create_ocr_usage.sql          # Usage tracking
```

**Structure Decision**: Following domain-driven architecture with new `billing` domain. Stripe client utilities in `src/lib/stripe/` for cross-domain reuse. API routes under `/api/v1/billing/` namespace.

## Complexity Tracking

> No constitution violations - design follows all principles.
> **Simplified after review**: Following [Next.js SaaS Starter](https://github.com/nextjs/saas-starter) pattern.

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| Database design | 5 columns on `businesses` table | **SaaS Starter pattern** - no separate subscriptions table |
| Stripe Customer Portal | Use hosted portal | Stripe handles payment method updates, plan changes, cancellations |
| Webhook idempotency | `stripe_events` table | Simple event ID deduplication |
| Usage tracking | `ocr_usage` table | Track in Supabase, not Stripe metered billing (simpler for soft blocks) |

### Simplification from Original Plan

| Original | Simplified | Savings |
|----------|------------|---------|
| 4 new tables | 2 new tables + 5 columns | Less complexity |
| Full Stripe state mirror | Status cache only | Stripe is source of truth |
| Complex subscription lifecycle | Simple status updates | Webhook handlers are trivial |

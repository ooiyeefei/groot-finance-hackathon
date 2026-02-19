# Research: Usage Tracking (AI Chat, E-Invoice, Credit Packs)

**Date**: 2026-02-19
**Branch**: `001-usage-tracking`

## R1: Existing Usage Tracking Pattern (OCR)

**Decision**: Mirror the `ocrUsage.ts` pattern for all new usage tables.

**Rationale**: The OCR usage module (`convex/functions/ocrUsage.ts`) is a production-tested, battle-hardened implementation of per-business per-month usage tracking. It covers: monthly key format (`"YYYY-MM"`), auto-creation of monthly records, `creditsUsed`/`creditsRemaining`/`planLimit` fields, composite indexes (`by_businessId_month`), pre-flight checks (`reserveCredits`), and API-facing recording (`recordUsageFromApi`). Reusing this pattern ensures consistency and reduces risk.

**Alternatives considered**:
- Generic usage table (one table for all resource types, discriminated by `type` field): Rejected because Convex doesn't support compound queries with inequality + equality efficiently; separate tables allow optimized indexes per resource type.
- Event-sourcing pattern (log every action, derive counts): Rejected as over-engineered for the current scale; simple counters with atomic increments are sufficient and match the existing OCR pattern.

## R2: Plan Limit Resolution

**Decision**: Resolve limits from the existing `catalog.ts` plan configuration via `getPlan(planKey)`.

**Rationale**: `src/lib/stripe/catalog.ts` already defines `FALLBACK_PLANS` with all limits (`ai_message_limit`, `invoice_limit`, `einvoice_limit`, `ocr_limit`) per plan, and dynamically fetches from Stripe with 1-hour cache. Plan limits are stored in Stripe product metadata. The `PlanConfig` interface needs extension to include the new limit fields (`aiMessageLimit`, `invoiceLimit`, `einvoiceLimit`), but the fetching/caching infrastructure already exists.

**Alternatives considered**:
- Hardcode limits in usage modules: Rejected because limits should propagate from a single source of truth (Stripe metadata → catalog.ts → all consumers).
- Store limits in a separate Convex table: Rejected because this adds sync complexity; Stripe metadata + catalog fallback is already the established pattern.

## R3: Pre-flight Check Insertion Points

**Decision**: Insert usage checks at the earliest possible point in each action flow.

**Rationale**:

| Action | File | Insertion Point | Context Available |
|--------|------|-----------------|-------------------|
| AI Chat message | `src/app/api/copilotkit/route.ts` | Line ~25, before rate limit | `userId`, `resolvedBusinessId` |
| Sales invoice creation | `convex/functions/salesInvoices.ts` | `create()` mutation, after auth check | `businessId`, `user` |
| E-invoice submission | Not yet implemented | Will be added to the submission mutation when built | `businessId` |

**Alternatives considered**:
- Check in frontend hooks (before API call): Rejected as the primary check — frontend checks are advisory only (can be bypassed). The authoritative check must be server-side. However, the client hook (`use-subscription.ts`) should expose usage data for UI feedback.
- Check in Convex mutation only: Rejected for AI chat because the CopilotKit route is the entry point, and the Convex message mutation doesn't have plan context. The API route is the right level.

## R4: Credit Pack Architecture

**Decision**: New `credit_packs` table in Convex schema, with purchase via Stripe checkout (one-time payment), FIFO consumption via `purchasedAt` ordering, and daily expiry cron job.

**Rationale**: Credit packs are one-time purchases (not subscriptions). The Stripe webhook handler (`src/app/api/v1/billing/webhooks/route.ts`) already processes `checkout.session.completed` events and uses idempotency checks. Extending this handler for credit pack purchases follows the established pattern. The daily cron job for expiry follows the same pattern as `mark-overdue-invoices` in `convex/crons.ts`.

**Alternatives considered**:
- Stripe subscriptions with metered billing: Rejected because credit packs are one-time purchases with fixed quantities, not recurring.
- Real-time expiry (check expiry on every access): Rejected as the primary mechanism because it doesn't clean up state — expired packs would remain "active" until accessed. A daily cron ensures consistent state. Pre-flight checks should also verify expiry as a safety net.

## R5: Monthly Reset Strategy

**Decision**: No explicit reset mechanism needed. Usage records are keyed by `"YYYY-MM"`. A new month automatically starts with no record (treated as zero usage per the OCR pattern).

**Rationale**: The OCR usage pattern already handles this: `getCurrentUsage()` queries by `businessId + currentMonth`. If no record exists, it returns zero usage. A new month simply means no record exists yet, so the first action creates a fresh record with zero usage. This is simpler and more reliable than a cron-based reset that could fail or run late.

**Alternatives considered**:
- Daily cron to create next month's records: Rejected because it pre-creates records for potentially inactive businesses, wasting storage.
- Carry forward with reset flag: Rejected as unnecessarily complex.

## R6: Billing API Extension

**Decision**: Extend `GET /api/v1/billing/subscription` to include all usage types and credit packs in the response.

**Rationale**: The current endpoint already returns OCR usage data. Adding AI message usage, e-invoice usage, sales invoice count, and credit pack data follows the same pattern. The client hook (`use-subscription.ts`) consumes this endpoint and needs extension to expose the new data. This is a single endpoint change rather than multiple new endpoints, keeping the API surface minimal.

**Alternatives considered**:
- Separate `/api/v1/billing/usage` endpoint: Rejected because it would require an additional API call from the client. The subscription endpoint already bundles plan + usage data, and adding more usage types is natural.
- Convex real-time queries only (skip REST): Rejected because the subscription endpoint aggregates Stripe data + Convex data; a pure Convex query can't access Stripe subscription status.

## R7: Concurrent Usage (Atomicity)

**Decision**: Rely on Convex mutation atomicity for concurrent usage protection.

**Rationale**: Convex mutations are automatically serialized per document. When two team members send AI chat messages simultaneously, each mutation reads the current count, checks against the limit, and increments — all atomically. If only one allocation unit remains, the first mutation to execute will increment to the limit, and the second mutation will see the updated count and reject. This is the same guarantee used by `ocrUsage.reserveCredits()`.

**Alternatives considered**:
- Distributed locking (Redis): Rejected because Convex already provides the needed atomicity guarantees.
- Optimistic concurrency with retry: Unnecessary — Convex handles this internally.

## R8: Fail-Open Implementation

**Decision**: Wrap pre-flight checks in try-catch at the API route level. If the usage check throws (transient failure), log the error and allow the action to proceed.

**Rationale**: Per the spec clarification, protecting user experience takes priority over strict limit enforcement during transient failures. The API route (`/api/copilotkit/route.ts`) is the right level for this try-catch because it can log the failure and proceed to the CopilotKit handler. The Convex mutation level should still throw on limit exceeded (that's intentional blocking, not a transient failure).

**Alternatives considered**:
- Fail-closed with retry: Rejected per spec clarification — user experience takes priority.
- Queue-based deferred processing: Over-engineered for the failure mode we're handling.

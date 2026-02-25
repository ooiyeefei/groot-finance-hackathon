# Research: LHDN e-Invoice Submission Pipeline

**Feature Branch**: `001-lhdn-einvoice-submission`
**Date**: 2026-02-25

## Decision 1: API Client Pattern

**Decision**: Mirror the existing Peppol/Storecove client pattern — a dedicated `src/lib/lhdn/` module with typed client, mapper, and types.

**Rationale**: The Storecove client (`src/lib/peppol/storecove-client.ts`) is a proven pattern: fetch wrapper with typed responses, error handling via custom error class, config from environment variables. Replicating this for LHDN ensures consistency.

**Alternatives considered**:
- Third-party LHDN SDK — none exist for TypeScript that are production-ready
- Generic HTTP client wrapper — adds unnecessary abstraction for a single external API

## Decision 2: Submission Orchestration (Async)

**Decision**: Next.js API route triggers submission, updates Convex to "submitted", then a Convex scheduled function handles polling for validation results.

**Rationale**: LHDN validation is asynchronous (seconds to minutes). The user should not be blocked. The Peppol flow uses a webhook pattern (Storecove calls back), but LHDN requires polling. Convex scheduled functions (`ctx.scheduler.runAfter`) are the right fit — they can retry at intervals and update the record atomically.

**Alternatives considered**:
- Webhook-based (like Peppol) — LHDN doesn't push results; requires polling
- Long-polling from browser — poor UX, wastes resources, user may close tab
- External queue (SQS) — over-engineered for this; Convex scheduler handles retries natively

## Decision 3: UBL Document Generation

**Decision**: Build a `src/lib/lhdn/invoice-mapper.ts` that converts FinanSEAL invoice/expense claim data to UBL 2.1 JSON format, following the same pattern as the Peppol mapper.

**Rationale**: UBL 2.1 JSON is the LHDN-required format. The mapper transforms internal data to the external schema. Keeping it in `src/lib/lhdn/` alongside the API client maintains the same separation of concerns as the Peppol module.

**Key technical details**:
- Namespace prefixes required: `_D`, `_A`, `_B` at root level (GitHub #218)
- Decimal formatting: at least 1 decimal place, no trailing zeros (GitHub #218)
- Document types map: Invoice (01), Credit Note (02), Debit Note (03), Refund Note (04), Self-Billed Invoice (11)
- Self-billed mapper needs to swap buyer/seller compared to standard invoice mapper

## Decision 4: Digital Signature Invocation

**Decision**: Invoke the existing `finanseal-digital-signature` Lambda from the Next.js API route via AWS SDK (`@aws-sdk/client-lambda`), same as any Lambda invocation from Vercel.

**Rationale**: The signing Lambda is already deployed, tested, and has IAM permissions for the Vercel OIDC role. No new infrastructure needed — just invoke it with `{ action: "sign", document: "<UBL JSON string>", environment: "production" }`.

**Alternatives considered**:
- Inline signing in the API route — bad: private key would need to be in Vercel environment
- Separate signing microservice — over-engineered; Lambda already exists

## Decision 5: Token Caching for LHDN OAuth

**Decision**: Cache LHDN JWT tokens in Convex with per-tenant expiry (tokens valid 60 minutes). Store encrypted token + expiry timestamp per business TIN.

**Rationale**: LHDN rate-limits the token endpoint to 12 RPM. Each token is valid for 60 minutes. Caching prevents hitting the rate limit during batch operations and avoids unnecessary round-trips.

**Alternatives considered**:
- In-memory cache (e.g., global variable) — doesn't persist across Vercel serverless invocations
- Redis — adds infrastructure for a simple key-value cache; Convex already available
- SSM Parameter Store — latency overhead for frequent reads; SSM is better for secrets not ephemeral tokens

## Decision 6: Polling Strategy

**Decision**: After submission, schedule a Convex function to poll LHDN every 5 seconds for the first 2 minutes, then every 30 seconds up to 30 minutes. If no result after 30 minutes, schedule a retry in 1 hour (up to 3 retries). After exhausting retries, mark as "failed — manual review".

**Rationale**: Most LHDN validations complete within seconds. Aggressive initial polling (5s) catches fast results. The backoff to 30s respects rate limits (300 RPM for the status endpoint). The 30-minute + 3-retry strategy handles LHDN outages without leaving records in limbo.

**Alternatives considered**:
- Fixed interval (e.g., every 10s for 30 min) — wasteful for fast validations, still aggressive for slow ones
- Single long poll — doesn't handle LHDN timeouts gracefully

## Decision 7: Self-Billed E-Invoice Source Records

**Decision**: Add LHDN tracking fields to both `expense_claims` and `invoices` (AP) tables. Use the same field names as `sales_invoices` for consistency.

**Rationale**: Self-billing applies to ALL purchases from exempt vendors — expense claims and AP invoices. Using the same field names (`lhdnSubmissionId`, `lhdnDocumentUuid`, etc.) enables shared UI components and backend logic.

**Alternatives considered**:
- Separate `einvoice_submissions` table linking to any source — adds a join; simpler to put fields directly on the source tables
- Only on expense_claims — incorrect; AP invoices also need self-billing

## Decision 8: Vendor Exempt Flag

**Decision**: Add `isLhdnExempt` boolean field to both `vendors` and `customers` tables. Default: undefined (unknown). When set to true, all transactions from that vendor suggest self-billing.

**Rationale**: Two-level detection confirmed in spec clarifications: (1) vendor-level flag persists across transactions, (2) QR-code absence on receipts infers exempt for expense claims. The flag name includes "lhdn" to distinguish from potential future exemption types.

**Alternatives considered**:
- Generic `isExempt` — ambiguous; could mean tax-exempt, e-invoice-exempt, etc.
- Enum with exemption reasons — over-engineered for current requirements

## Decision 9: Auto-Trigger Self-Billing Configuration

**Decision**: Add `autoSelfBillExemptVendors` boolean field to the `businesses` table (in LHDN settings section). Default: false (manual confirmation required).

**Rationale**: Per spec clarification — configurable per-business. Some businesses with high volume of exempt vendor purchases will want automation; others prefer manual control. Default to manual for safety.

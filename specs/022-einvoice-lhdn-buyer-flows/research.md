# Research: LHDN E-Invoice Buyer Flows

## R1: LHDN API for Document Status Checking

**Decision**: Use `GET /api/v1.0/documentsubmissions/{submissionUid}` (existing) to check status of issued documents. The response already includes `rejectRequestDateTime`, `documentStatusReason`, and `cancelDateTime` fields.

**Rationale**: This endpoint is already used by `lhdnJobs.ts` for initial validation polling. The same response structure contains rejection/cancellation data — we just need to check for it after the initial "Valid" status is confirmed. Rate limit is 300 RPM — more than sufficient.

**Alternatives considered**:
- `GET /api/v1.0/documents/{uuid}` (individual document query) — more granular but requires one call per document instead of one per submission batch. Less efficient.
- LHDN webhooks — not available in the current MyInvois API. No push notification mechanism exists.

## R2: LHDN API for Buyer Rejection

**Decision**: Use `PUT /api/v1.0/documents/state/{uuid}/state` with body `{ status: "rejected", reason: "..." }`. Same endpoint as cancellation, different status value.

**Rationale**: Confirmed in LHDN docs (`docs/features/einvoice/lhdn-einvoice-research.md` lines 180-194). Rate limit is 12 RPM. The rejection must be authenticated with the buyer's business TIN (via `onbehalfof` header in intermediary mode).

**Alternatives considered**: None — this is the only LHDN-provided mechanism for rejection.

## R3: Polling Architecture for 72-Hour Window

**Decision**: Extend the existing LHDN polling Lambda (`src/lambda/lhdn-polling/handler.ts`) with a second pass that checks status of recently-validated issued invoices.

**Rationale**: The Lambda already runs every 5 minutes via EventBridge, authenticates with LHDN per-business, and has IAM-native access to SSM credentials. Adding a second query pass is simpler than creating a separate Lambda or Convex cron. The 72-hour window naturally bounds the polling set.

**Alternatives considered**:
- Convex cron job — Cannot use AWS SDK natively; would need to call through an API route. More complex, less efficient.
- Separate Lambda — Unnecessary duplication of auth logic and EventBridge scheduling.

## R4: PDF Generation with LHDN QR Code

**Decision**: Extend the existing `@react-pdf/renderer` invoice template to conditionally include an LHDN validation block (QR code image, UUID text, timestamp, badge). Generate client-side for manual download, server-side (in API route) for auto-delivery email attachment.

**Rationale**: The existing QR code component (`src/domains/sales-invoices/components/lhdn-qr-code.tsx`) already generates QR data URLs from `lhdnLongId`. The existing email service (`send-email/route.ts`) already accepts `pdfAttachment: { content: base64, filename }`. The gap is purely in the PDF template — adding a conditional footer section.

**Alternatives considered**:
- Pre-generate and store PDFs in Convex File Storage — Adds storage cost and staleness risk (invoice data could change). On-demand generation is simpler.
- Use a separate PDF service (e.g., Puppeteer) — Over-engineered; `@react-pdf/renderer` works in both browser and Node.js.

## R5: Buyer Email Notification Service

**Decision**: Create a thin notification service (`src/lib/services/buyer-notification-service.ts`) that composes email content and calls the existing `emailService.sendInvoiceEmail()` or a new `emailService.sendEinvoiceNotification()` method.

**Rationale**: The existing SES email infrastructure (`notifications.hellogroot.com`) is already configured. The existing `emailService` in `src/lib/services/email-service.ts` handles SES delivery. We just need new email templates for lifecycle events.

**Alternatives considered**:
- Direct SES SDK calls — Bypasses the existing email service abstraction. Less maintainable.
- Convex action calling MCP Lambda for email — Over-complex for simple transactional emails.

## R6: Compliance Dashboard Data Query

**Decision**: Add a Convex query `getEinvoiceAnalytics` in `salesInvoices.ts` that aggregates sales_invoices by `lhdnStatus`, computes metrics using `.collect()` + JS reduce (Convex has no GROUP BY).

**Rationale**: For businesses with up to 10,000 invoices, client-side aggregation after a single indexed query is fast enough (< 3s target). Real-time updates via Convex subscriptions keep the dashboard live.

**Alternatives considered**:
- Pre-computed aggregate table — Adds complexity (cron to maintain). Not needed at current scale.
- API route with caching — Loses real-time updates. Convex subscriptions are a better fit.

## R7: Server-Side PDF Rendering for Auto-Delivery

**Decision**: Use `@react-pdf/renderer`'s `renderToBuffer()` in a Next.js API route to generate the PDF server-side when auto-delivery is triggered.

**Rationale**: `@react-pdf/renderer` supports both client-side (`pdf().toBlob()`) and server-side (`renderToBuffer()`) rendering. The API route receives the validation event, generates the PDF, converts to base64, and calls the existing email service with `pdfAttachment`.

**Alternatives considered**:
- Generate client-side and upload — Requires user's browser to be open; doesn't work for auto-delivery triggered by background polling.
- Lambda for PDF generation — Over-engineered; the API route can handle it.

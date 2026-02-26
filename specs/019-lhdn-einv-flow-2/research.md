# Research: LHDN e-Invoice Flow 2 — Expense Claim E-Invoice Retrieval

**Branch**: `019-lhdn-einv-flow-2` | **Date**: 2026-02-25

## R1: QR Code Detection from Receipt Images

### Decision
Add QR detection as a new step in the existing Python Lambda receipt processing pipeline (`document-processor-python`), using a Python QR library alongside the existing DSPy + Gemini extraction.

### Rationale
- The receipt processing pipeline is already a Python Lambda with durable execution (DSPy + Gemini 3 Flash)
- Adding QR detection as a parallel step in the same Lambda avoids a separate service
- Python has mature QR libraries (`pyzbar`, `opencv-python`) that handle real-world receipt photos better than JS alternatives
- `sharp` (Node.js) is not available in the Python Lambda — use `Pillow` (already a dependency via DSPy) for image preprocessing
- QR detection runs in parallel with the existing OCR extraction step — no additional latency

### Alternatives Considered
- **jsQR in a separate Node.js Lambda**: Adds infrastructure complexity. Python Lambda already processes the image.
- **Client-side QR scanning**: Would require the employee to manually scan the QR code. Defeats the automation purpose.
- **@zxing/library in Node.js**: Good multi-QR support but requires a separate processing step outside the Python pipeline.

### Technical Details
- **Library**: `pyzbar` (Python wrapper for zbar) — handles multiple QR codes per image, works with `Pillow` images
- **Fallback**: `cv2.QRCodeDetector` (OpenCV) for difficult images
- **Pipeline insertion point**: After `convert_pdf_step()`, before or parallel to `extract_receipt_step()`
- **Output**: List of detected QR URLs stored in `processing_metadata.detected_qr_codes`
- **Filtering**: URLs matching `myinvois.hasil.gov.my` are classified as LHDN validation QRs (not merchant form QRs)

---

## R2: AI Browser Agent (Stagehand + Browserbase)

### Decision
Use Stagehand REST API with Browserbase cloud browsers, invoked from a Next.js API route. Use Gemini Flash as the LLM for form reasoning.

### Rationale
- Stagehand is TypeScript-native — fits the Next.js stack
- REST API mode is required for serverless (no persistent WebSocket/CDP connections)
- Browserbase handles anti-bot detection, stealth browsing, and optional CAPTCHA solving
- Gemini Flash is already in the stack (used for OCR) and is cost-efficient (~$0.075/1M input tokens)
- Free tier (1 concurrent session, limited hours) is sufficient for development and early users

### Alternatives Considered
- **Browser-Use (Python)**: Would require a separate Python microservice. Doesn't share types/schemas with the Next.js app.
- **Direct Playwright on Lambda**: No anti-bot protection. Large bundle size. Cold start issues.
- **Self-hosted browser**: Requires infrastructure management. Browserbase free tier removes this burden.

### Technical Details
- **Invocation**: `POST /api/v1/expense-claims/[id]/request-einvoice` → calls Stagehand REST API
- **Session lifecycle**: Create session → navigate → act (fill form) → end session. All in one API call.
- **LLM prompt**: Structured prompt with company details injected. Natural language instruction: "Fill in the buyer information form with: Company Name: {name}, TIN: {tin}, BRN: {brn}, Address: {address}, Email: {email}. Then submit the form."
- **Timeout**: 60s max per form fill (Vercel Pro limit). Most forms complete in 15-30s.
- **Error handling**: Try/finally with session cleanup. On failure: store error, notify user, provide manual URL fallback.
- **Cost optimization**: Cache `observe()` results in Convex for repeated merchant form patterns.

### Browserbase Tier Plan
| Stage | Tier | Cost | Capacity |
|-------|------|------|----------|
| Development | Free | $0/mo | 1 concurrent, ~1 hr/mo |
| First users | Free | $0/mo | ~30-60 form fills/mo |
| Growth | Developer | $20/mo | 100 hrs/mo (~3000 fills) |
| Scale | Startup | $99/mo | 500 hrs/mo |

---

## R3: Email Receiving Channel (System Email Inbox)

### Decision
Use AWS SES email receiving with S3 delivery + Lambda trigger. Gmail inbox with `+` addressing as the user-facing email address, with SES handling the routing.

### Rationale
- AWS SES is already in the stack for sending transactional emails
- SES receiving rules can route `einvoice@hellogroot.com` to S3 → Lambda
- `+` addressing (sub-addressing) is preserved in MIME headers — the Lambda can parse `einvoice+{claimRef}@hellogroot.com` from the `To:` field
- No Google API credentials or OAuth needed — purely AWS-native
- Lambda processes the email, extracts attachments (e-invoice PDF), and writes to Convex

### Alternatives Considered
- **Gmail API with Pub/Sub push**: Works but requires Google Workspace API setup, service account with domain-wide delegation, and a Pub/Sub → Lambda bridge. More complex than SES receiving.
- **Google Groups**: Designed for discussion lists, not programmatic access. Groups API is read-only. Not suitable.
- **Dedicated email service (SendGrid Inbound, Mailgun)**: Additional vendor dependency and cost. SES is already available.

### Technical Details
- **Email address**: `einvoice@hellogroot.com` (requires MX record pointing to SES)
- **SES receiving rule**: Match `einvoice@hellogroot.com` → store in S3 → trigger Lambda
- **Lambda processing**: Parse MIME message, extract `To:` header for `+` suffix, extract attachments, write to Convex
- **Claim reference format**: `einvoice+{6-char-unique-token}@hellogroot.com` — token generated per request, stored on expense claim
- **Deduplication**: Use email `Message-ID` header to prevent duplicate processing

### Infrastructure Requirements
- MX record for `hellogroot.com` (or subdomain like `einv.hellogroot.com`) pointing to SES
- SES receiving rule set (us-east-1 — SES receiving only available in limited regions)
- S3 bucket for raw email storage
- Lambda for email processing
- **Note**: If domain MX is already configured for Gmail/Google Workspace, a subdomain (`einv.hellogroot.com`) is needed to avoid conflict

---

## R4: LHDN Received Documents Polling

### Decision
Use a Convex cron job to periodically poll LHDN's received documents API, with a dedicated Convex action for the API call and matching logic.

### Rationale
- Convex crons are the established pattern for periodic background jobs in this codebase (see `convex/crons.ts`)
- The LHDN API client (authentication, token caching) will be shared with Flow 1
- Polling frequency: every 15 minutes (within 60 RPM rate limit, achieves <24hr matching target)
- Convex actions can call external APIs and write results to the database in one transaction

### Alternatives Considered
- **AWS EventBridge + Lambda**: Adds AWS infrastructure outside Convex. The LHDN API client would need to be duplicated or shared via a package.
- **Webhook from LHDN**: LHDN does not support webhooks. Polling is the only option.
- **Real-time polling (every minute)**: Unnecessary — merchant e-invoice issuance takes hours/days. 15-minute intervals are sufficient.

### Technical Details
- **LHDN API**: `GET /api/v1.0/documents/recent?InvoiceDirection=Received` (60 RPM limit)
- **Authentication**: Reuses Flow 1's intermediary model — platform credentials with `onbehalfof: {tenant_TIN}` header
- **Token caching**: JWT valid 60 minutes — cache in Convex (same pattern as Flow 1)
- **Polling strategy**:
  1. Fetch recent received documents (last 31 days, paginated)
  2. For each new document (not already processed): fetch raw UBL via `GET /documents/{uuid}/raw`
  3. Extract buyer email from UBL → attempt Tier 1 match
  4. If no email match → attempt Tier 2 match (supplierTin + total + dateTimeIssued ±1 day)
  5. If no Tier 2 match → attempt Tier 3 match (supplierName fuzzy + total + date) → flag for review
  6. Store processed document UUIDs to avoid re-processing

### LHDN Response Fields Used for Matching
**From `GET /documents/recent` (metadata)**:
- `uuid`, `submissionUID`, `longId` — stored on expense claim after match
- `supplierTin`, `supplierName` — matching signals
- `total` — amount matching
- `dateTimeIssued` — date matching (±1 day tolerance)
- `status` — only process "Valid" documents
- `internalId` — merchant's own invoice reference (supplementary)

**From `GET /documents/{uuid}/raw` (full UBL)**:
- Buyer email field — deterministic matching via `+` suffix (Tier 1)
- Buyer TIN — confirms document is for this business
- Line items — stored for reference

---

## R5: Existing Codebase Patterns

### Expense Claims Domain
- **Schema**: `convex/schema.ts` lines 359-471. All fields optional for backward compatibility.
- **Functions**: `convex/functions/expenseClaims.ts` (CRUD, status transitions) and `convex/functions/expenseSubmissions.ts` (batch submission workflow)
- **UI components**: `src/domains/expense-claims/components/` — `submission-detail-page.tsx` (detail view), `personal-expense-dashboard.tsx` (list)
- **Notifications**: `convex/functions/notifications.ts` — internal mutation `create` with types: approval, anomaly, compliance, insight, invoice_processing
- **Background jobs**: `convex/crons.ts` — established cron pattern for periodic tasks

### Receipt Processing Pipeline
- **Lambda**: `src/lambda/document-processor-python/handler.py` — Python 3.11, DSPy, Gemini 3 Flash
- **Steps**: fetch_categories → convert_pdf → validate_document → extract_receipt → update_convex
- **Invocation**: Async Lambda invoke from Next.js API route via `src/lib/lambda-invoker.ts`
- **Results**: Written to `expense_claims.processing_metadata` via Convex HTTP API from Lambda
- **QR detection insertion point**: New step after `convert_pdf_step()`, parallel to `extract_receipt_step()`

### Notification Pattern
```typescript
await ctx.scheduler.runAfter(0, internal.functions.notifications.create, {
  recipientUserId: user._id,
  businessId: business._id,
  type: "compliance", // Best fit for e-invoice notifications
  severity: "info",
  title: "E-Invoice attached",
  body: "An e-invoice has been matched to your expense claim",
  resourceType: "expense_claim",
  resourceId: claimId,
  resourceUrl: `/${locale}/expense-claims/submissions/${submissionId}`,
  sourceEvent: `einvoice_attached_${claimId}`,
});
```

---

## R6: Convex Schema Extension for Expense Claims

### Decision
Extend the existing `expense_claims` table with e-invoice fields. All new fields optional. Add a new `einvoice_requests` table for tracking AI agent requests and email/LHDN matching state.

### New Fields on `expense_claims`
- `merchantFormUrl` — URL detected from receipt QR code
- `einvoiceRequestStatus` — "none" | "requesting" | "requested" | "received" | "failed"
- `einvoiceSource` — "merchant_issued" | "manual_upload" | "not_applicable"
- `einvoiceAttached` — boolean flag for quick filtering
- `lhdnReceivedDocumentUuid` — LHDN document UUID of the matched received e-invoice
- `lhdnReceivedLongId` — for verification QR code generation
- `lhdnReceivedStatus` — "valid" | "cancelled"
- `lhdnReceivedAt` — timestamp when the received e-invoice was validated by LHDN
- `einvoiceEmailRef` — the unique token used in the `+` addressing (for matching)
- `einvoiceManualUploadPath` — S3 path for manually uploaded e-invoice document
- `einvoiceRequestedAt` — timestamp when e-invoice request was initiated
- `einvoiceReceivedAt` — timestamp when e-invoice was matched/attached

### New Table: `einvoice_received_documents`
Tracks all received LHDN documents for a business (regardless of match status):
- `businessId` — owning business
- `lhdnDocumentUuid` — LHDN document UUID
- `lhdnSubmissionUid` — LHDN submission UID
- `lhdnLongId` — for verification QR
- `supplierTin`, `supplierName` — merchant details
- `total`, `dateTimeIssued` — transaction details
- `status` — "valid" | "cancelled"
- `buyerEmail` — extracted from raw UBL (for Tier 1 matching)
- `matchedExpenseClaimId` — linked expense claim (if matched)
- `matchTier` — "tier1_email" | "tier2_tin_amount" | "tier3_fuzzy" | "manual"
- `matchConfidence` — numeric confidence score
- `processedAt` — when this document was processed by the matching algorithm
- `rawDocumentSnapshot` — key fields from the raw UBL (stored for audit)

### New Indexes
- `expense_claims`: `by_businessId_einvoiceRequestStatus` for filtering claims by e-invoice status
- `expense_claims`: `by_einvoiceEmailRef` for deterministic email matching
- `einvoice_received_documents`: `by_businessId_status` for polling new documents
- `einvoice_received_documents`: `by_lhdnDocumentUuid` for deduplication
- `einvoice_received_documents`: `by_matchedExpenseClaimId` for reverse lookup

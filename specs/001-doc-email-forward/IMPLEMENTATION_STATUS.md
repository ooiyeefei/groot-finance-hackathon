# Email Forwarding Implementation Status

**Feature**: Email Forwarding for Documents (Receipts & AP Invoices)
**Branch**: `001-doc-email-forward`
**Date**: 2026-03-16
**Status**: Core Backend Complete — Frontend & Infrastructure Pending

---

## ✅ Completed (Backend Foundation)

### 1. Convex Schema & Database Layer
- ✅ New table: `document_inbox_entries` with 12 indexes
- ✅ Extended `businesses` table with email forwarding config fields:
  - `emailForwardingEnabled`
  - `emailForwardingDomain`
  - `emailForwardingPrefix`
  - `emailForwardingAllowlist`
- ✅ Extended `expense_claims` and `invoices` tables with source tracking:
  - `sourceType` (manual_upload | email_forward)
  - `sourceEmailMetadata` (from, subject, receivedAt, messageId)
- ✅ Deployed to production: `npx convex deploy --yes` ✅

### 2. Convex Functions (Document Inbox)
- ✅ `createInboxEntry` (internal mutation) — creates inbox entry, checks duplicates
- ✅ `updateInboxStatus` (internal mutation) — updates after classification
- ✅ `getInboxDocuments` (query) — fetches documents for "Needs Review" page
- ✅ `getInboxDocument` (query) — fetches single document with user details
- ✅ `findDocumentByHash` (query) — duplicate detection helper
- ✅ `getInboxStats` (query) — analytics for dashboard
- ✅ `manuallyClassifyDocument` (mutation) — user classification override
- ✅ `deleteInboxEntry` (mutation) — user deletion
- ✅ `getBusinessByPrefix` (query) — Lambda helper to validate email prefix
- ✅ `uploadAndCreateInboxEntry` (action) — S3 → Convex storage upload + inbox entry

### 3. Convex Utilities
- ✅ `duplicate_detector.ts` — fuzzy vendor matching, amount/date matching helpers
- ✅ Extended `expenseClaims.create` to accept `sourceType` and `sourceEmailMetadata`
- ✅ Extended `invoices.create` to accept `sourceType` and `sourceEmailMetadata`

### 4. Lambda Email Processor Extension
- ✅ Created `document-forward-handler.ts` — handles docs@prefix.hellogroot.com emails
  - Email parsing with mailparser
  - Attachment extraction (PDF, JPG, PNG)
  - File hash calculation (MD5)
  - Sender authorization check (allowlist)
  - Batch submission detection (>10 attachments → reject)
  - S3 staging upload
  - Convex inbox entry creation via action
  - Duplicate detection + auto-reply email
  - Batch rejection email
- ✅ Extended main `handler.ts` to detect and route document forwarding emails
- ✅ Added import for document forwarding handler

### 5. Git & Configuration
- ✅ Added `test-data/` to `.gitignore`
- ✅ Created test data directory structure
- ✅ Installed `mailparser` and `@types/mailparser` dependencies

---

## ⚠️ Pending (Frontend, Infrastructure, Testing)

### 6. Infrastructure (AWS CDK)
- ❌ **SES Receipt Rule**: Need to add recipient for `docs@*.hellogroot.com` domain
  - Current rule only handles `einv.hellogroot.com`
  - Need wildcard or separate rule for document forwarding subdomain
- ❌ **DNS Configuration**: MX record for document forwarding subdomain
  - Example: `docs.hellogroot.com` → `inbound-smtp.us-west-2.amazonaws.com`
- ❌ **Lambda Permissions**: Already has S3 + SES permissions ✅ (no changes needed)

### 7. Trigger.dev Classification Extension
- ❌ Extend `classify-document` task to support multi-domain routing
  - Add `targetDomain` parameter (auto, expense_claims, invoices)
  - Update classification prompt to distinguish receipts vs invoices
  - Return `destinationDomain` in classification result
- ❌ Create routing logic after classification
  - High confidence (≥85%) → auto-route to expense_claims or invoices
  - Low confidence (<85%) → mark as needs_review
- ❌ Call `updateInboxStatus` mutation after classification

### 8. Frontend "Needs Review" Inbox Page
- ❌ Create `/documents-inbox` page (Next.js app router)
- ❌ Create `<DocumentsInboxTable>` component
  - Columns: Filename, Source, AI Suggestion, Confidence, Date, Actions
  - Confidence badge with color coding (green/yellow/red)
  - "Classify" button opens classification modal
- ❌ Create `<ClassificationModal>` component
  - Dropdown: Receipt, AP Invoice, E-Invoice
  - Confirm button calls `manuallyClassifyDocument`
- ❌ Add "Documents Inbox" nav item to sidebar (conditional on feature flag)
- ❌ Real-time updates via Convex subscriptions

### 9. Notifications
- ❌ Email notification when document enters "Needs Review" status
  - Template: "Document needs your review"
  - Deep link to `/documents-inbox`
- ❌ Unauthorized sender notification email
  - Template: "Email forwarding attempt from unauthorized sender"

### 10. Data Retention Crons
- ❌ Convex cron: Auto-archive documents after 30 days (status: needs_review → archived)
- ❌ Convex cron: Delete archived documents after 7 years (PDPA compliance)

### 11. Testing
- ❌ Create email simulator script (`scripts/test-email-forward.ts`)
- ❌ End-to-end test: High-confidence receipt → auto-route to expense_claims
- ❌ End-to-end test: Low-confidence invoice → needs_review inbox
- ❌ End-to-end test: Duplicate detection → auto-reply email
- ❌ End-to-end test: Batch submission (>10 files) → rejection email
- ❌ End-to-end test: Manual classification → route to correct domain
- ❌ Integration test: `tests/integration/email-forwarding.test.ts` (Playwright)
- ❌ Regression test: Verify existing upload flows still work

### 12. Documentation & Deployment
- ❌ Update `quickstart.md` with production setup instructions
- ❌ Add email forwarding setup to business admin UI (settings page)
  - Toggle: Enable email forwarding
  - Input: Email prefix (e.g., "acme-corp")
  - Multi-input: Authorized sender emails (allowlist)
- ❌ Deploy Lambda changes: `cd infra && npx cdk deploy --profile groot-finanseal`
- ❌ Run `npm run build` to verify no regressions
- ❌ Test on staging environment before production

---

## Architecture Decisions Made

1. **S3 as Staging Layer**: Lambda uploads to S3 first, then Convex action pulls and uploads to Convex storage. Keeps file handling in Convex where storage APIs live.

2. **Dual-Layer Duplicate Detection**: File hash (Lambda) catches exact duplicates before API calls. Metadata check (Convex) catches semantic duplicates (different scans).

3. **90-Day Detection Window**: Balances compliance (Malaysian tax requirements) with performance (prevents unbounded table scans).

4. **85% Confidence Threshold**: Auto-route if AI is ≥85% confident, otherwise manual review. Threshold chosen based on Gemini Flash-Lite performance benchmarks.

5. **Batch Submission Rejection**: Limit 10 attachments per email. Batch uploads should use web UI for reliability and better UX.

6. **No New Lambda**: Extended existing `finanseal-einvoice-email-processor` rather than creating new infrastructure. Saves deployment complexity and cost.

---

## Next Steps (Priority Order)

1. **Infrastructure**: Update SES receipt rule + DNS for `docs@*.hellogroot.com`
2. **Trigger.dev**: Extend classification task for multi-domain routing
3. **Frontend**: Build "Needs Review" inbox page + classification modal
4. **Testing**: Create email simulator and run end-to-end tests
5. **Deployment**: Deploy Lambda changes, test on staging, deploy to production
6. **Documentation**: Update quickstart.md with production setup steps

---

## Files Modified

### Convex (Deployed)
- `convex/schema.ts` — new table + extended businesses/expense_claims/invoices
- `convex/functions/documentInbox.ts` — inbox mutations and queries
- `convex/functions/documentInboxInternal.ts` — upload action (Node.js runtime)
- `convex/lib/duplicate_detector.ts` — matching utilities
- `convex/functions/expenseClaims.ts` — extended create mutation
- `convex/functions/invoices.ts` — extended create mutation

### Lambda (Not Yet Deployed)
- `src/lambda/einvoice-email-processor/handler.ts` — added routing logic
- `src/lambda/einvoice-email-processor/document-forward-handler.ts` — NEW file

### Configuration
- `.gitignore` — added test-data/
- `package.json` — added mailparser dependencies

---

## Known Limitations

1. **No Convex Storage File Hash Index**: Duplicate detection currently checks filename only. Need to implement proper file hash storage and indexing after MVP.

2. **No User Selection**: Lambda routes to first admin/manager found. For multi-admin businesses, may need user selection logic.

3. **No Mobile Push Notifications**: Email notifications only. Mobile push requires separate implementation.

4. **No Batch Processing UI**: Users with >10 attachments must use web upload. Could add batch upload page in future.

5. **No Gemini Vision for Classification**: Current Lambda uses Gemini Flash text-only. Full document OCR + classification requires Trigger.dev integration.

---

## Testing Checklist (Before Production)

- [ ] `npm run build` passes (no TypeScript errors)
- [ ] `npx convex deploy --yes` succeeds
- [ ] Email simulator test (high confidence receipt)
- [ ] Email simulator test (low confidence invoice)
- [ ] Email simulator test (duplicate detection)
- [ ] Email simulator test (batch submission >10 files)
- [ ] Frontend inbox page loads without errors
- [ ] Manual classification works (document routes correctly)
- [ ] Real-time updates work (inbox refreshes on classification)
- [ ] Regression: Existing expense claim upload still works
- [ ] Regression: Existing AP invoice upload still works

---

**Last Updated**: 2026-03-16 by Claude Sonnet 4.5

# Tasks: Aging Payable & Receivable Reports

**Branch**: `035-aging-payable-receivable-report`
**Generated**: 2026-03-23
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Task 1: Convex Schema — Add report tables and business settings (P1)

**Files to modify**: `convex/schema.ts`
**Files to create**: None
**Dependencies**: None

Add two new tables to Convex schema:

1. **`generated_reports`** table with fields: businessId, reportType (ap_aging/ar_aging), reportScope (consolidated/debtor_statement/vendor_statement), asOfDate, periodMonth, generationMethod (manual/auto_monthly), generatedBy, s3Key, s3Bucket, fileSizeBytes, entityId, entityName, totalOutstanding, currency, hasWarnings, aiInsightsSummary, expiresAt. Indexes: `by_business_period` (businessId, periodMonth), `by_business_type` (businessId, reportType), `by_expiry` (expiresAt).

2. **`debtor_statement_sends`** table with fields: businessId, reportId, customerId, customerName, customerEmail, totalOutstanding, invoiceCount, sendStatus (pending/sent/auto_sent/failed/no_email), sentAt, emailDeliveryStatus, periodMonth, hasDisclaimer, autoSendEnabled. Indexes: `by_business_period` (businessId, periodMonth), `by_business_status` (businessId, sendStatus), `by_report` (reportId).

3. Add `reportSettings` optional field to **`businesses`** table: `{ autoGenerateMonthly: boolean, autoSendGlobal: boolean, autoSendDebtors: string[], notifyEmail: boolean }`.

**Verify**: `npx convex deploy --yes` succeeds.

---

## Task 2: Convex Functions — Report queries and mutations (P1)

**Files to create**: `convex/functions/reports.ts`
**Dependencies**: Task 1

Create Convex functions for report CRUD:

**Queries** (use `query` — small result sets, filtered by index):
- `listReports(businessId, reportType?, periodMonth?, limit?)` — list generated reports, sorted newest first
- `listStatementSends(businessId, periodMonth, sendStatus?)` — list debtor statement sends for a period
- `getReportSettings(businessId)` — get report settings from businesses table

**Mutations**:
- `internalMutation createReport(...)` — create generated_reports record with expiresAt = now + 12 months
- `internalMutation createStatementSend(...)` — create debtor_statement_sends record
- `mutation updateStatementStatus(statementId, sendStatus, sentAt?, emailDeliveryStatus?)` — update send status after email. Auth: finance_admin or owner.
- `mutation updateReportSettings(businessId, ...)` — update report settings on businesses table. Auth: owner only.
- `internalMutation deleteExpiredReports(before)` — delete reports + statement sends older than 12 months

**Verify**: `npx convex deploy --yes` succeeds.

---

## Task 3: Individual Statement PDF Templates (P1)

**Files to create**: `src/lib/reports/templates/debtor-statement-template.tsx`, `src/lib/reports/templates/vendor-statement-template.tsx`
**Dependencies**: None (uses existing @react-pdf/renderer pattern)

Create two new PDF templates following the pattern in `ar-aging-template.tsx`:

**Debtor Statement Template** (`debtor-statement-template.tsx`):
- Header: Business name, logo (if available), "Statement of Account", as-of date
- Debtor info: Customer name, contact
- Table: Invoice number, invoice date, due date, original amount, paid amount, outstanding balance, days overdue
- Aging summary: Current, 1-30, 31-60, 61-90, 90+ totals for this debtor
- Grand total outstanding
- Footer: "If you have recently made a payment, it may not yet be reflected" (conditional disclaimer when hasWarnings=true)
- Professional formatting matching existing templates

**Vendor Statement Template** (`vendor-statement-template.tsx`):
- Same structure but for AP — what the business owes a vendor
- No disclaimer (vendor statements aren't auto-sent)

**Data interfaces**: `DebtorStatementData { businessName, currency, asOfDate, customer: { name, email }, invoices: InvoiceRow[], agingTotals, grandTotal, hasDisclaimer }`, similar for vendor.

**Verify**: `npm run build` succeeds (no type errors).

---

## Task 4: Report Generation Actions (P1)

**Files to create**: `convex/functions/reportGeneration.ts`
**Files to modify**: `src/lib/reports/report-generator.ts`
**Dependencies**: Tasks 1, 2, 3

Create Convex actions for report generation and S3 upload:

**`action generateAgingReport`**:
1. Use `ctx.runQuery(internal.functions.financialIntelligence.getAPAging)` or `getARSummary` to fetch aging data
2. Call report-generator.ts to produce PDF buffer
3. Upload PDF to S3 at `reports/{businessId}/aging/{periodMonth}/{reportType}-consolidated.pdf`
4. Create `generated_reports` record via `ctx.runMutation(internal.functions.reports.createReport)`
5. Return reportId + presigned download URL

**`action generateDebtorStatements`**:
1. Query `sales_invoices` grouped by customer (outstanding balance > 0)
2. For each customer: generate individual statement PDF, upload to S3
3. Create `generated_reports` record (scope: debtor_statement) + `debtor_statement_sends` record
4. Resolve email: check customer billing/AP email first, fall back to primary email
5. Set sendStatus: "no_email" if no email found, "pending" otherwise
6. Return count + report IDs

**`action getReportDownloadUrl`**:
1. Look up report by ID, get s3Key
2. Return presigned download URL (1-hour expiry)

**Modify `report-generator.ts`**: Add `generateDebtorStatement(data)` and `generateVendorStatement(data)` functions using the new templates.

**Verify**: Can generate a test PDF and upload to S3. `npm run build` passes.

---

## Task 5: Reports Page — UI (P1-P2)

**Files to create**: `src/app/[locale]/reports/page.tsx`, `src/domains/reports/components/reports-client.tsx`, `src/domains/reports/components/generate-report-dialog.tsx`, `src/domains/reports/components/report-history-table.tsx`, `src/domains/reports/components/how-it-works-drawer.tsx`, `src/domains/reports/hooks/use-reports.ts`, `src/domains/reports/lib/types.ts`
**Files to modify**: `src/lib/navigation/nav-items.ts`
**Dependencies**: Tasks 1, 2, 4

**Navigation**: Add `{ icon: FileBarChart, label: 'reports', path: '/reports' }` to finance group in `nav-items.ts`.

**Reports page** (`page.tsx`): Server component following app shell pattern — `auth()` check, `<ClientProviders>`, `<Sidebar />` + `<HeaderWithUser>` + `<main>` → `<ReportsClient />`.

**ReportsClient** (`reports-client.tsx`):
- "Pending Review" banner at top (shows when statements await sending, links to review page)
- "Generate Report" button → opens `GenerateReportDialog`
- Report history table (sorted newest first, filterable by type)
- How It Works drawer (ⓘ info button)

**GenerateReportDialog**: Select report type (AP Aging / AR Aging), date picker for "as of" date, "Generate" button. Calls `generateAgingReport` action, shows loading state, adds to history on completion.

**ReportHistoryTable**: Columns: Type, Period, Generated (date + method badge), Download button. Uses `listReports` query.

**use-reports hook**: Wraps `useAction` for generation and `useQuery` for listing. Handles loading/error states.

**Verify**: `npm run build` passes. Page renders with sidebar and header.

---

## Task 6: Statements Review Page — UI (P2)

**Files to create**: `src/app/[locale]/reports/statements-review/page.tsx`, `src/domains/reports/components/statements-review-client.tsx`, `src/domains/reports/hooks/use-statements.ts`
**Dependencies**: Tasks 1, 2, 4, 5

**StatementsReviewClient**:
- Period selector (defaults to current month)
- Table: Debtor name, Amount owed, Invoice count, Status badge (pending/sent/auto_sent/no_email), Preview button, Send checkbox
- "Send Selected" and "Send All" buttons at top
- Auto-send banner: "Tired of reviewing every month? Enable auto-send..." with link to settings
- Per-row auto-send toggle (small switch)
- Preview: opens PDF in new tab via presigned URL

**use-statements hook**: Wraps `listStatementSends` query and `sendStatementEmails` action.

**Send flow**: Selected statement IDs → `sendStatementEmails` action → updates status to "sent" → UI refreshes.

**Verify**: `npm run build` passes.

---

## Task 7: Statement Email Sending (P2)

**Files to modify**: `src/lib/services/email-service.ts`
**Files to create**: None (logic in `convex/functions/reportGeneration.ts`)
**Dependencies**: Tasks 2, 3, 4

**`action sendStatementEmails`** (in `reportGeneration.ts`):
1. For each statementId: fetch statement send record + report record
2. Download PDF from S3 (get buffer)
3. Send email via SES:
   - To: customerEmail (billing/AP first, then primary)
   - From: `noreply@notifications.hellogroot.com`
   - Reply-To: business contact email (`businesses.invoiceSettings.companyEmail`)
   - Subject: "Statement of Account — {businessName} — {month year}"
   - Body: HTML template with polite message, total outstanding, disclaimer if hasDisclaimer
   - Attachment: PDF (base64-encoded)
4. Update `debtor_statement_sends` record: sendStatus="sent", sentAt=now
5. If email fails: sendStatus="failed"
6. Return counts: { sent, failed }

**Add to email-service.ts**: `sendDebtorStatementEmail(to, replyTo, businessName, periodMonth, totalOutstanding, pdfBuffer, hasDisclaimer)` function.

**Verify**: Test email delivery with PDF attachment.

---

## Task 8: EventBridge Monthly Automation (P1)

**Files to create**: `src/lambda/scheduled-intelligence/modules/monthly-aging-reports.ts`
**Files to modify**: `infra/lib/scheduled-intelligence-stack.ts`
**Dependencies**: Tasks 1-4, 7

**Lambda handler** (`monthly-aging-reports.ts`):
1. Query Convex for all active businesses with `reportSettings.autoGenerateMonthly !== false`
2. For each business:
   a. Check for duplicate (skip if report already exists for this periodMonth)
   b. Call `runMonthlyReportGeneration` action
   c. Log success/failure per business
3. Error handling: per-business try/catch, don't let one failure block others

**`action runMonthlyReportGeneration`** (in `reportGeneration.ts`):
1. Generate consolidated AP + AR aging reports
2. Generate all debtor statements + vendor statements
3. Auto-send statements where `autoSendEnabled=true` (check reportSettings.autoSendDebtors)
4. Create Action Center notification for owner
5. Send owner monthly summary email (with PDF attached)
6. Return summary counts

**CDK**: Add EventBridge rule `monthly-aging-reports` to `scheduled-intelligence-stack.ts`:
- Schedule: `cron(0 4 1 * ? *)` (4am UTC = 12pm MYT on 1st of month)
- Target: existing `finanseal-scheduled-intelligence` Lambda
- Input: `{ "module": "monthly-aging-reports" }`

**Verify**: `cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2` succeeds. Manual trigger via AWS Console works.

---

## Task 9: Owner Monthly Email Notification (P2)

**Files to modify**: `convex/functions/reportGeneration.ts`, `src/lib/services/email-service.ts`
**Dependencies**: Tasks 4, 7, 8

Add owner notification to `runMonthlyReportGeneration`:
1. After all reports generated, compose owner email:
   - Subject: "Your {month year} Aging Report — {N} debtor statements ready for review"
   - Body: inline summary (total AR outstanding, overdue %, debtor count), top 5 debtors table, CTA button to review page
   - Auto-send status line (if applicable)
   - Attachment: consolidated AR aging PDF
2. Create Action Center notification with same summary data, category "report", priority "medium"

**Add to email-service.ts**: `sendOwnerReportEmail(to, businessName, periodMonth, summary, consolidatedPdfBuffer)` function.

**Verify**: Owner receives email with summary and PDF attachment.

---

## Task 10: Pre-Generation Reconciliation Check (P2)

**Files to modify**: `convex/functions/reportGeneration.ts`
**Dependencies**: Tasks 4, 8

**`action checkUnreconciledTransactions`**:
1. Query `bank_transactions` where reconStatus is unreconciled, within last 45 days
2. Query outstanding invoices (AP + AR)
3. For each unreconciled transaction, check for matches:
   - Tier 1: Exact amount match + date within 7 days
   - Tier 2: Call existing MCP bank recon matching tool for fuzzy name/reference matching
4. Return matches with confidence scores

**Integration into monthly flow**:
1. Before generating, call `checkUnreconciledTransactions`
2. If matches found: create Action Center alert "N bank transactions may match outstanding invoices"
3. Set a 48-hour timeout flag on the alert
4. When timeout expires (checked on next Lambda invocation or separate cron): proceed with generation, set `hasWarnings=true` on all reports
5. If owner resolves matches before timeout: proceed without warnings

**Verify**: Manually create a matching bank transaction and verify it appears in the reconciliation queue.

---

## Task 11: AP Aging Interactive Page (P2)

**Files to create**: `src/app/[locale]/payables/aging-report/page.tsx`, `src/domains/payables/components/ap-aging-report.tsx`
**Dependencies**: None (uses existing `getAPAging` query and `use-vendor-aging` hook)

Mirror the existing AR aging page (`src/domains/sales-invoices/components/aging-report.tsx`):
- Date picker for "as of" date
- Summary cards with color-coded aging buckets (green→red)
- Per-vendor breakdown table
- Export CSV button
- "Generate PDF" button → navigates to Reports page generate dialog

Follow server component page pattern (auth, sidebar, header, client component).

**Verify**: `npm run build` passes. Page renders with vendor aging data.

---

## Task 12: AI Insights Generation (P3)

**Files to modify**: `convex/functions/reportGeneration.ts`
**Dependencies**: Tasks 4, 8

**`action generateAiInsights`**:
1. Gather current aging data + previous month's data (from `generated_reports` metadata or re-query)
2. Build a structured prompt for Gemini Flash-Lite:
   - Input: Current aging buckets, previous month comparison, top debtors, concentration ratios
   - Ask for: 2-3 bullet point insights covering trends, risks, and one actionable recommendation
3. Call Gemini via existing MCP `analyze_trends` tool or direct API
4. Parse response, return as string
5. If API fails or <5 invoices: return null (insights omitted)

**Integration**: Called during `generateAgingReport` (consolidated only). Result stored in `aiInsightsSummary` field. Rendered at top of consolidated PDF and in owner email.

**Verify**: Generate a report with test data and verify insights appear. Verify graceful degradation when Gemini is unavailable.

---

## Task 13: Auto-Send Settings & Logic (P3)

**Files to modify**: `convex/functions/reports.ts`, `convex/functions/reportGeneration.ts`
**Files to create**: Settings UI in existing business settings page
**Dependencies**: Tasks 2, 6, 7, 8

**Settings UI**: Add "Reports" section to business settings page:
- Toggle: "Auto-generate monthly reports" (default: on)
- Toggle: "Auto-send debtor statements" (default: off)
- Note: "New debtors always require manual review before first send"
- Toggle: "Send monthly email notification" (default: on)

**Per-debtor auto-send**: In Statements Review page, add small toggle per row. Toggling calls `updateReportSettings` to add/remove customerId from `autoSendDebtors` array.

**Auto-send logic** (in `runMonthlyReportGeneration`):
1. After generating debtor statements, check each customerId against `reportSettings.autoSendDebtors`
2. If customer is in auto-send list AND has been sent at least once before: auto-send, set sendStatus="auto_sent"
3. If customer is new (never sent before): always set sendStatus="pending" regardless of auto-send settings

**Verify**: Enable auto-send for a debtor, trigger monthly generation, verify they receive email without manual review.

---

## Task 14: Report Retention Cleanup (P3)

**Files to modify**: `convex/functions/reports.ts`, EventBridge schedule
**Dependencies**: Tasks 1, 2

Add cleanup logic:
1. `internalMutation deleteExpiredReports(before)`: Query `generated_reports` by `by_expiry` index where expiresAt < before. Delete matching records + their S3 objects + related `debtor_statement_sends`.
2. Add to existing weekly cleanup cron (or monthly-aging-reports handler): call `deleteExpiredReports(now - 12months)`.
3. S3 cleanup: Either use S3 lifecycle rules on `reports/` prefix (12-month expiry) or delete in the mutation via Lambda.

**Verify**: Create a test report with short expiresAt, run cleanup, verify deletion.

---

## Task 15: Build Verification & Convex Deploy (Final)

**Dependencies**: All previous tasks

1. `npm run build` — must pass with zero errors
2. `npx convex deploy --yes` — deploy all Convex changes to production
3. `cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2` — deploy EventBridge rule
4. UAT on finance.hellogroot.com:
   - Generate on-demand AP aging report → verify PDF
   - Generate on-demand AR aging report → verify PDF
   - Check Reports page history
   - Verify sidebar "Reports" entry
   - Generate debtor statements → review page → send one → verify email
   - Check Action Center notification

# Research: Aging Payable & Receivable Reports

**Date**: 2026-03-23

## Existing Infrastructure Assessment

### Decision: Reuse existing PDF templates and aging queries
**Rationale**: AP and AR aging templates (`ar-aging-template.tsx`, `ap-aging-template.tsx`) already exist with professional formatting. `report-generator.ts` orchestrates PDF rendering via `@react-pdf/renderer`. Aging bucket calculations exist in `aging-calculations.ts`. No need to rebuild.
**Alternatives considered**: Building new templates from scratch — rejected as the existing ones match spec requirements.

### Decision: Add individual statement templates as new files
**Rationale**: Existing templates are for consolidated reports (all vendors/customers in one PDF). Individual debtor/vendor statements need a different layout — single entity, list of outstanding invoices, personalized header. New templates `debtor-statement-template.tsx` and `vendor-statement-template.tsx` extend the same `@react-pdf/renderer` pattern.
**Alternatives considered**: Modifying existing templates with a "single entity" mode — rejected as it complicates the template logic.

### Decision: Use EventBridge + Lambda for monthly generation (not Convex crons)
**Rationale**: Per CLAUDE.md rules, scheduled jobs reading >10 documents must use EventBridge → Lambda → Convex HTTP API. Monthly report generation scans all invoices per business — easily >10 docs. Add a new EventBridge rule to existing `scheduled-intelligence-stack.ts`.
**Alternatives considered**: Convex cron — rejected per bandwidth rules.

### Decision: Use Convex actions (not queries) for report data fetching
**Rationale**: Per CLAUDE.md bandwidth rules, never use reactive `query` for heavy aggregations. Report generation scans entire invoices/sales_invoices tables. Use `action` + `internalQuery` pattern — runs once, no reactive subscription.
**Alternatives considered**: Reactive queries — rejected per bandwidth constraints.

### Decision: S3 storage with presigned URLs for PDF access
**Rationale**: Existing `src/lib/aws-s3.ts` provides `uploadFile()` and `getPresignedDownloadUrl()` using OIDC federation. Store PDFs at `reports/{businessId}/aging/{year-month}/` prefix. 12-month retention via S3 lifecycle rule or application-level cleanup.
**Alternatives considered**: Convex file storage — rejected as PDFs can be large and Convex storage counts toward the 1GB free tier limit.

### Decision: SES for statement emails with PDF attachments
**Rationale**: Existing `email-service.ts` supports `EmailAttachment` interface with base64-encoded content. SES infrastructure (`notifications.hellogroot.com`) already deployed. Pattern matches existing invoice email sending.
**Alternatives considered**: Resend — available as fallback but SES is primary and already handles DKIM/SPF.

### Decision: Action Center for in-app notifications
**Rationale**: Existing `actionCenterInsights` table and queries support per-business, per-user notifications with priority, category, and expiry. Add a new category for report notifications.
**Alternatives considered**: Custom notification table — rejected as Action Center already provides the needed infrastructure.

### Decision: Use existing bank recon matching for pre-generation reconciliation check
**Rationale**: DSPy bank recon matching (Tier 1: amount+reference+date, Tier 2: fuzzy name matching via MCP tool) already exists. The pre-generation check calls the same matching logic against unreconciled bank transactions. No new AI infrastructure needed.
**Alternatives considered**: Building separate matching logic — rejected as it duplicates existing capability.

### Decision: Gemini Flash-Lite for AI insights (same as all other AI features)
**Rationale**: Per CLAUDE.md, all non-CUA Gemini calls use `gemini-3.1-flash-lite-preview`. AI insights call existing MCP tools (`analyze_trends`, `get_ap_aging`, `get_ar_summary`) and pass data to Gemini for natural language summary. Optional — fails gracefully.
**Alternatives considered**: No AI — rejected as the brainstorming session validated the value of trend + concentration insights.

## Key Data Sources

| Data | Source Table | Key Fields |
|------|-------------|------------|
| AP invoices | `invoices` | paidAmount, paymentStatus, dueDate, accountingStatus, extractedData.vendor_name |
| AR invoices | `sales_invoices` | amountPaid, balanceDue, dueDate, status, customerSnapshot.businessName, customerSnapshot.email |
| Customer contacts | `customers` | email, email2, contactPerson, businessName |
| Business config | `businesses` | homeCurrency, companyName, invoiceSettings.companyEmail |
| Bank transactions | `bank_transactions` | amount, date, description, reconStatus |
| Action Center | `actionCenterInsights` | businessId, category, priority, status |

## Email Infrastructure

- **From**: `noreply@notifications.hellogroot.com`
- **Configuration set**: `finanseal-transactional`
- **Attachment support**: Base64-encoded PDF via `EmailAttachment` interface
- **Reply-to**: Business contact email (from `businesses.invoiceSettings.companyEmail`)
- **DKIM/SPF**: Already configured on `notifications.hellogroot.com`

## Sidebar Navigation

- Source of truth: `src/lib/navigation/nav-items.ts`
- Pattern: `getNavigationGroups(userRole)` returns groups with items
- Reports entry: Add to finance group (admin-only) with `FileBarChart` icon
- Path: `/reports`

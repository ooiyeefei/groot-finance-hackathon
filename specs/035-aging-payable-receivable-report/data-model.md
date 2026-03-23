# Data Model: Aging Payable & Receivable Reports

**Date**: 2026-03-23

## New Tables

### generated_reports

Stores metadata for every generated report (consolidated and individual statements).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | string (ref: businesses) | yes | Business this report belongs to |
| reportType | string enum | yes | "ap_aging", "ar_aging" |
| reportScope | string enum | yes | "consolidated", "debtor_statement", "vendor_statement" |
| asOfDate | string (YYYY-MM-DD) | yes | Report reference date |
| periodMonth | string (YYYY-MM) | yes | Month this report covers (for dedup and history) |
| generationMethod | string enum | yes | "manual", "auto_monthly" |
| generatedBy | string | yes | userId or "system" |
| s3Key | string | yes | S3 object key for the PDF |
| s3Bucket | string | yes | S3 bucket name |
| fileSizeBytes | number | no | PDF file size |
| entityId | string | no | customerId (for debtor statements) or vendorId (for vendor statements). Null for consolidated. |
| entityName | string | no | Customer/vendor name snapshot at generation time |
| totalOutstanding | number | yes | Total outstanding amount on report |
| currency | string | yes | Report currency |
| hasWarnings | boolean | yes | True if generated with unreconciled transaction warnings |
| aiInsightsSummary | string | no | AI insights text (null if unavailable or individual statement) |
| expiresAt | number | no | Timestamp for 12-month auto-deletion |

**Indexes**:
- `by_business_period`: businessId + periodMonth (list reports for a month)
- `by_business_type`: businessId + reportType (filter by AP/AR)
- `by_expiry`: expiresAt (cleanup job)

### debtor_statement_sends

Tracks the send status of individual debtor statements.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| businessId | string (ref: businesses) | yes | Business this belongs to |
| reportId | string (ref: generated_reports) | yes | The generated debtor statement |
| customerId | string (ref: customers) | yes | Customer/debtor |
| customerName | string | yes | Snapshot of customer name |
| customerEmail | string | no | Email address used (billing/AP or primary) |
| totalOutstanding | number | yes | Amount owed |
| invoiceCount | number | yes | Number of outstanding invoices |
| sendStatus | string enum | yes | "pending", "sent", "auto_sent", "failed", "no_email" |
| sentAt | number | no | Timestamp when sent |
| emailDeliveryStatus | string | no | "delivered", "bounced", "complaint" (from SES feedback) |
| periodMonth | string (YYYY-MM) | yes | Month this statement covers |
| hasDisclaimer | boolean | yes | True if sent with unreconciled payment disclaimer |
| autoSendEnabled | boolean | yes | Whether auto-send is on for this debtor |

**Indexes**:
- `by_business_period`: businessId + periodMonth (list all for a month)
- `by_business_status`: businessId + sendStatus (find pending statements)
- `by_report`: reportId (find sends for a specific report)

## Modified Tables

### businesses (add fields)

| Field | Type | Description |
|-------|------|-------------|
| reportSettings | object (optional) | Report generation settings |
| reportSettings.autoGenerateMonthly | boolean | Enable/disable monthly auto-generation (default: true) |
| reportSettings.autoSendGlobal | boolean | Global auto-send toggle (default: false) |
| reportSettings.autoSendDebtors | string[] | Array of customerIds with auto-send enabled |
| reportSettings.notifyEmail | boolean | Send monthly email to owner (default: true) |

## Entity Relationships

```
businesses (1) ──→ (many) generated_reports
generated_reports (1) ──→ (0..1) debtor_statement_sends
customers (1) ──→ (many) debtor_statement_sends
sales_invoices (many) ──→ (1) customers [source data for AR aging]
invoices (many) ──→ (source data for AP aging)
```

## State Transitions

### debtor_statement_sends.sendStatus

```
pending ──→ sent (manual send by owner)
pending ──→ auto_sent (auto-send enabled)
pending ──→ failed (email delivery failure)
pending ──→ no_email (no email address on file)
```

### Report Lifecycle

```
EventBridge fires (1st of month)
  → Pre-recon check: scan unreconciled bank txns
  → If matches found: create Action Center notification + email
  → 48-hour timeout: if no owner action, proceed with warnings
  → Generate consolidated AP + AR reports
  → Generate individual debtor/vendor statements
  → Store all PDFs in S3
  → Create generated_reports + debtor_statement_sends records
  → Notify owner (Action Center + email)
  → Auto-send statements where autoSendEnabled=true
  → Remaining statements: sendStatus=pending, await owner review
```

## Data Retention

- Reports older than 12 months: auto-deleted (S3 objects + Convex records)
- Cleanup: EventBridge weekly job or piggyback on existing cleanup cron
- Owner can re-generate older reports on demand

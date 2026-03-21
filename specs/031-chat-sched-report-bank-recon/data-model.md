# Data Model: Scheduled Reports via Chat + Bank Recon Integration

**Date**: 2026-03-21

## New Tables

### report_schedules

Recurring report delivery configuration, created via chat commands.

| Field | Type | Description |
|-------|------|-------------|
| businessId | Id\<"businesses"\> | Owning business |
| createdBy | Id\<"users"\> | User who created the schedule |
| reportType | "pnl" \| "cash_flow" \| "ar_aging" \| "ap_aging" \| "expense_summary" | Report to generate |
| frequency | "daily" \| "weekly" \| "monthly" | How often |
| dayOfWeek | number? | 0-6 (Sun-Sat), required for weekly |
| dayOfMonth | number? | 1-28, required for monthly |
| hourUtc | number | Hour to run (0-23, default 4 = 12pm MYT) |
| recipients | string[] | Email addresses |
| currency | string | Business home currency code (e.g., "MYR") |
| isActive | boolean | Soft toggle |
| nextRunDate | number | Unix timestamp of next scheduled run |
| lastRunDate | number? | Unix timestamp of last run |
| lastRunStatus | "success" \| "failed" \| "pending"? | Result of last run |
| consecutiveBounces | Record\<string, number\>? | Per-recipient bounce count |
| deletedAt | number? | Soft delete timestamp |

**Indexes**:
- `by_businessId` → (businessId)
- `by_businessId_active` → (businessId, isActive)
- `by_nextRunDate` → (nextRunDate) — for scheduler queries

**State Transitions**:
- Created (isActive=true) → Modified → Cancelled (isActive=false) → Reactivated (isActive=true)
- Soft deleted (deletedAt set) — never hard deleted

### report_runs

Individual report execution history.

| Field | Type | Description |
|-------|------|-------------|
| businessId | Id\<"businesses"\> | Business |
| scheduleId | Id\<"report_schedules"\> | Parent schedule |
| reportType | string | Report type at time of run |
| periodStart | string | ISO date of period start |
| periodEnd | string | ISO date of period end |
| status | "pending" \| "generating" \| "delivered" \| "failed" | Run status |
| errorReason | string? | If failed, why |
| recipientsDelivered | string[] | Emails successfully sent to |
| recipientsFailed | string[] | Emails that failed |
| generatedAt | number? | Timestamp when PDF was created |
| deliveredAt | number? | Timestamp when emails were sent |
| pdfStorageKey | string? | S3 key for generated PDF (for re-download) |

**Indexes**:
- `by_scheduleId` → (scheduleId)
- `by_businessId_date` → (businessId, generatedAt)

### bank_recon_runs

Tracks chat-triggered reconciliation executions.

| Field | Type | Description |
|-------|------|-------------|
| businessId | Id\<"businesses"\> | Business |
| bankAccountId | Id\<"bank_accounts"\> | Which account was reconciled |
| triggeredBy | Id\<"users"\> | User who triggered via chat |
| status | "running" \| "complete" \| "failed" | Execution state |
| startedAt | number | Timestamp |
| completedAt | number? | Timestamp |
| matchedCount | number | Auto-matched transactions |
| pendingReviewCount | number | Matches needing user review |
| unmatchedCount | number | No match found |
| errorReason | string? | If failed |

**Indexes**:
- `by_businessId_status` → (businessId, status) — for concurrency check
- `by_bankAccountId` → (bankAccountId)

## Modified Tables

### bank_recon_matches (existing)

No schema changes. New usage: chat action cards read/write `status` field ("pending" → "accepted"/"rejected") and create journal entries on accept.

### bank_transactions (existing)

No schema changes. New usage: chat queries by `reconciliationStatus` ("unmatched", "matched", "pending_review") for status display.

## Entity Relationships

```
report_schedules 1──N report_runs
bank_recon_runs  1──N bank_recon_matches (via bankAccountId + run timeframe)
bank_transactions 1──N bank_recon_matches (via bankTransactionId)
```

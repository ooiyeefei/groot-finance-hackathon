# Data Model: Cross-Business Benchmarking, Email Integration & Voice Input

**Date**: 2026-03-21 | **Branch**: `031-chat-cross-biz-voice`

## New Tables

### `email_send_logs`

Tracks all emails sent via the chat agent. Serves as audit log (FR-007) and rate limit counter (FR-007a).

| Field | Type | Description |
|-------|------|-------------|
| businessId | Id<"businesses"> | Sending business |
| userId | string | Clerk user ID of sender |
| userRole | string | Role at time of send (finance_admin / owner) |
| reportType | string | e.g., "ap_aging", "cash_flow", "pnl" |
| recipients | string[] | Email addresses |
| subject | string | Email subject line |
| status | string | "sent" / "delivered" / "bounced" / "failed" |
| sesMessageId | string | AWS SES message ID for tracking |
| sentAt | number | Unix timestamp |

**Indexes**:
- `by_business_date`: [businessId, sentAt] — for rate limit counting and audit queries

### `benchmarking_opt_ins`

Tracks business opt-in status for anonymized benchmarking.

| Field | Type | Description |
|-------|------|-------------|
| businessId | Id<"businesses"> | The business |
| isActive | boolean | Currently opted in |
| industryGroup | string | 2-digit MSIC code (e.g., "46") |
| industryLabel | string | Human-readable (e.g., "Wholesale Trade") |
| optedInAt | number | Unix timestamp of opt-in |
| optedInBy | string | Clerk user ID who toggled |
| optedOutAt | number? | Unix timestamp if opted out |

**Indexes**:
- `by_businessId`: [businessId] — unique lookup
- `by_industry_active`: [industryGroup, isActive] — for aggregation queries

### `benchmarking_aggregates`

Pre-computed industry benchmarks, refreshed weekly by EventBridge.

| Field | Type | Description |
|-------|------|-------------|
| industryGroup | string | 2-digit MSIC code |
| industryLabel | string | Human-readable name |
| metric | string | "gross_margin" / "cogs_ratio" / "opex_ratio" / "ar_days" / "ap_days" |
| period | string | e.g., "2026-Q1" or "2026-03" |
| sampleSize | number | Number of businesses in aggregate |
| average | number | Mean value |
| median | number | Median value |
| p25 | number | 25th percentile |
| p75 | number | 75th percentile |
| p10 | number | 10th percentile |
| p90 | number | 90th percentile |
| updatedAt | number | Unix timestamp of last computation |

**Indexes**:
- `by_industry_metric`: [industryGroup, metric, period] — for benchmark lookups

## Modified Tables

### `businesses` (existing)

No schema changes. Uses existing `msicCode` field for industry grouping. The 2-digit prefix of `msicCode` maps to `industryGroup` in benchmarking tables.

## Entity Relationships

```
businesses (1) ──── (0..1) benchmarking_opt_ins
    │
    │  msicCode[0:2] = industryGroup
    │
benchmarking_aggregates (by industryGroup + metric)
    │
email_send_logs (many per business)
```

## State Transitions

### Benchmarking Opt-In Lifecycle

```
[not opted in] ──opt_in──> [active]
    ^                         │
    │                         │
    └───────opt_out───────────┘
```

- Opt-in: Creates row with `isActive: true`
- Opt-out: Sets `isActive: false`, sets `optedOutAt`
- Re-opt-in: Sets `isActive: true`, updates `optedInAt`, clears `optedOutAt`

### Email Send Lifecycle

```
[requested] ──confirm──> [sent] ──SES callback──> [delivered/bounced/failed]
```

- Initial log created with status "sent" when SES accepts the message
- Status updated via SES delivery events (if tracking is wired to Convex — can be deferred)

## Validation Rules

- `email_send_logs.recipients`: Each must be a valid email format
- `email_send_logs.userRole`: Must be "finance_admin" or "owner"
- `benchmarking_opt_ins.businessId`: Unique per business (one opt-in record per business)
- `benchmarking_aggregates.sampleSize`: Must be >= 10 before results are exposed to users
- `benchmarking_aggregates.metric`: Must be one of the 5 supported metrics

# Data Model: Conditional Auto-Approval

## New Table: `matching_settings`

Per-business configuration for auto-approval behavior.

| Field | Type | Description |
|-------|------|-------------|
| `businessId` | string (FK, unique) | Business this setting belongs to |
| `enableAutoApprove` | boolean | Global on/off toggle (default: false) |
| `autoApproveThreshold` | number | Minimum confidence for auto-approval (0.90-1.00, default: 0.98) |
| `minLearningCycles` | number | Minimum correct matches for an alias before auto-approval (1-50, default: 5) |
| `autoApproveDisabledReason` | string (optional) | If auto-disabled by safety valve: "critical_failures_exceeded" |
| `autoApproveDisabledAt` | number (optional) | Timestamp when safety valve triggered |
| `updatedBy` | string | Clerk user ID of last editor |
| `updatedAt` | number | Timestamp of last update |

**Indexes**:
- `by_businessId`: (businessId) — unique lookup

## Extended Table: `order_matching_corrections`

New fields for critical failure support.

| New Field | Type | Description |
|-----------|------|-------------|
| `weight` | number (optional) | Training weight multiplier (default: 1, critical failures: 5) |

**Note**: `correctionType` already supports string values. Add "critical_failure" as a new valid type.

## Extended Table: `sales_orders`

New match method value.

| Change | Description |
|--------|-------------|
| `matchMethod` | Add "auto_agent" to valid values (alongside existing: exact_reference, fuzzy, manual, ai_suggested, line_item) |
| `aiMatchStatus` | Add "auto_approved" and "reversed" to valid values |

## State Transitions

### Auto-Approval Flow

```
[Tier 2 AI suggestion created] → aiMatchStatus: "pending_review"
    ↓ (Triple-Lock evaluates)
[All 3 locks pass] → aiMatchStatus: "auto_approved", matchMethod: "auto_agent"
    → Journal entry posted with preparer = "groot_ai_agent"
    OR
[Any lock fails] → aiMatchStatus: "pending_review" (standard flow)
```

### Reversal Flow

```
[Auto-approved match] → aiMatchStatus: "auto_approved"
    ↓ (User clicks "Reverse Auto-Match")
[Reversal] → aiMatchStatus: "reversed", matchStatus: "unmatched"
    → Reversal journal entry created (opposite debits/credits)
    → CRITICAL_FAILURE correction created (weight: 5)
    → Safety valve check: if 3+ critical failures in 30 days → auto-disable
```

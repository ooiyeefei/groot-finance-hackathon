# Data Model: Accounting Periods UI

## Entities (Existing — No Changes)

### accounting_periods
| Field | Type | Description |
|-------|------|-------------|
| businessId | Id<"businesses"> | Owner business |
| periodCode | string | YYYY-MM format |
| periodName | string | Display name (e.g., "March 2026") |
| fiscalYear | number | Year for grouping |
| fiscalQuarter | number? | Optional quarter |
| startDate | string | YYYY-MM-DD |
| endDate | string | YYYY-MM-DD |
| status | "open" \| "closed" | Period status |
| journalEntryCount | number | Entries in period (set on close) |
| totalDebits | number | Sum of debits (set on close) |
| totalCredits | number | Sum of credits (set on close) |
| closedAt | number? | Timestamp of close |
| closedBy | string? | User who closed |
| closingNotes | string? | Notes on close |
| createdBy | string | Creator user |
| createdAt | number | Creation timestamp |

**Indexes**: by_business, by_business_period, by_business_status

### journal_entries (period-related fields only)
| Field | Type | Description |
|-------|------|-------------|
| isPeriodLocked | boolean | Set by lockEntries mutation |
| accountingPeriodId | Id<"accounting_periods">? | Link to period |
| fiscalYear | number | For period lookup |
| fiscalPeriod | string | YYYY-MM format |

## State Transitions

### Period Lifecycle
```
Open → Close → Closed → Lock Entries → Locked (UI-derived)
                  ↓
              Reopen → Open (only if no entries locked)
```

### UI-Derived "Locked" State
The UI shows "Locked" badge when:
1. Period status === "closed"
2. All journal entries in the period have isPeriodLocked === true

## API Contracts (Existing Convex Functions)

| Function | Type | Purpose |
|----------|------|---------|
| accountingPeriods.list | query | List periods with optional status filter |
| accountingPeriods.getById | query | Get single period |
| accountingPeriods.getCurrent | query | Get period containing today |
| accountingPeriods.create | mutation | Create new period |
| accountingPeriods.close | mutation | Close period, calculate totals |
| accountingPeriods.lockEntries | mutation | Lock all entries in period |
| accountingPeriods.reopen | mutation | Reopen closed period |

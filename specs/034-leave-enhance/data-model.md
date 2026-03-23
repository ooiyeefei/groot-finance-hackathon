# Data Model: Leave Management P1 Enhancements

**Date**: 2026-03-23 | **Branch**: `034-leave-enhance`

## Schema Changes

### Modified Tables

#### `businesses` — Add leave year configuration

```typescript
// Add to existing businesses table definition in convex/schema.ts
leaveYearStartMonth: v.optional(v.number()), // 1-12, defaults to 1 (January)
```

**Validation**: Must be integer 1-12. Default behavior when undefined = January (backward compatible).

#### `leave_balances` — Add import tracking

```typescript
// Add to existing leave_balances table definition
importSource: v.optional(v.union(v.literal("manual"), v.literal("csv_import"))),
importedAt: v.optional(v.number()), // timestamp of CSV import
```

**Purpose**: Track whether a balance was created manually or via CSV import for audit trail.

### Existing Tables (No Changes Required)

#### `push_subscriptions` — Already exists

```typescript
// Already defined in schema.ts — no changes needed
push_subscriptions: defineTable({
  userId: v.id("users"),
  businessId: v.id("businesses"),
  platform: v.union(v.literal("ios"), v.literal("android")),
  deviceToken: v.string(),
  isActive: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})
```

**Indexes**: `by_userId`, `by_deviceToken`

#### `leave_requests` — No changes

Overlap detection queries this table but doesn't modify its structure. Uses existing indexes: `by_businessId_status`, `by_approverId_status`.

#### `leave_types` — No changes

Referenced by CSV import validation (lookup by code) and report generation.

## State Transitions

### Leave Request (existing — unchanged)

```
draft ──submit──→ submitted ──approve──→ approved
                     │            │
                   reject      cancel (future dates only)
                     │            │
                  rejected     cancelled
```

**New behavior at `submitted → approved` transition**: Before approval mutation executes, the UI checks for overlapping team leave and shows a warning dialog if conflicts exist. The state machine itself is unchanged — the warning is a UI-layer concern.

### Push Notification Delivery (new)

```
event_triggered → check_preferences → [enabled] → lookup_device_tokens
                                    → [disabled] → no_push
lookup_device_tokens → [tokens_found] → send_via_lambda
                     → [no_tokens] → no_push
send_via_lambda → [success] → delivered
                → [failure] → increment_failure_count
                             → [failures >= 3] → mark_token_inactive
                             → [failures < 3] → log_and_continue
```

### CSV Import (new)

```
file_uploaded → parse_csv → column_mapping → validation
validation → [all_valid] → confirm_import → upsert_balances → summary
           → [some_invalid] → show_errors → confirm_import (skip invalid) → upsert_balances → summary
           → [all_invalid] → show_errors → abort
```

## Entity Relationships

```
businesses (1) ──── (N) leave_types
    │                       │
    │ leaveYearStartMonth   │ code (unique per business)
    │                       │
    ├──── (N) leave_balances ────┤
    │         │                  │
    │         │ year, entitled,  │
    │         │ used, carryover  │
    │         │                  │
    ├──── (N) leave_requests ────┘
    │         │
    │         │ startDate, endDate,
    │         │ status, approverId
    │         │
    └──── (N) push_subscriptions
              │
              │ platform (ios|android),
              │ deviceToken, isActive
```

## Index Usage

| Query | Table | Index | Filter |
|-------|-------|-------|--------|
| Overlap check | leave_requests | by_businessId_status | businessId + status in (approved, submitted) |
| Balance import upsert | leave_balances | by_businessId_userId_leaveTypeId_year | businessId + userId + leaveTypeId + year |
| Report: Balance Summary | leave_balances | by_businessId | businessId, then JS filter by year |
| Report: Utilization | leave_balances | by_businessId | businessId, join with leave_types |
| Report: Absence Trends | leave_requests | by_businessId_status | businessId + status = approved |
| Push token lookup | push_subscriptions | by_userId | userId + isActive = true |
| Leave year config | businesses | by ID | direct document lookup |

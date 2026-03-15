# Research: Accounting Periods UI

## Decision: Follow existing accounting module UI patterns exactly

**Rationale**: All three existing accounting tabs (Dashboard, Journal Entries, Chart of Accounts) use identical patterns — server page shell, client content component, domain hook. No reason to deviate.

**Alternatives considered**: None — pattern is well-established and consistent.

## Decision: No backend changes required

**Rationale**: `convex/functions/accountingPeriods.ts` already has all needed functions: `create`, `close`, `lockEntries`, `reopen`, `list`, `getById`, `getCurrent`. Journal entries already have `isPeriodLocked` and period validation in create/post/reverse mutations.

**Alternatives considered**: Adding a `status: "locked"` to the accounting_periods schema. Rejected because locking is per-entry, not per-period — the UI derives "Locked" badge from closed period + all entries locked.

## Decision: Use Dialog component for confirmations (not browser confirm())

**Rationale**: Existing codebase uses both `confirm()` and `<Dialog>`. For this feature, close/lock/reopen actions need rich confirmation content (summaries, warnings, financial totals), which requires Dialog. Simple actions in journal entries use `confirm()` but period operations are more complex.

**Alternatives considered**: Using `confirm()` — rejected because we need to show period financial summary in the confirmation.

## Decision: Inline date validation for closed period check

**Rationale**: Clarification Q3 decided this. When user picks a date in the new journal entry form, immediately check if that period is closed and show inline warning. This prevents wasted form-filling effort.

**Implementation**: Use existing `getCurrent` query or add a lightweight check against the periods list already loaded via the hook.

## Decision: "Locked" as third distinct status badge

**Rationale**: Clarification Q1 decided this. Users see three clear states: Open (green), Closed (yellow/amber), Locked (red). Simpler than showing "Closed" + secondary indicator.

**Implementation**: Derive from period.status === "closed" + checking if all entries have isPeriodLocked === true. The `lockEntries` mutation already sets this flag on all entries atomically.

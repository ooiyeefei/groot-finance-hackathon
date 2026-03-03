# AI Action Center — Duplicate Insights Bug Fix

## Problem
AI Action Center shows duplicate insights (same anomaly card 3x), stale insights that don't refresh, and inflated badge counts.

## Root Cause
`runAnomalyDetection` in `actionCenterJobs.ts` used `ctx.db.insert()` directly — **bypassing all deduplication checks**. Every 4h cron run re-detected the same anomalous transactions and created new insights. 82% of insights in production were duplicates (19/23).

Secondary: `getPendingCount` didn't filter by userId, inflating the badge.

## Changes

### 1. Fix anomaly detection dedup (`convex/functions/actionCenterJobs.ts`)
- [x] Added 7-day transactionId-based dedup check before inserting anomaly insights
- [x] Pre-fetches existing anomaly insights once (batch query, not per-transaction)
- [x] Matches dedup pattern used by all other detectors (vendor, cashflow, deadline)

### 2. Fix getPendingCount userId filter (`convex/functions/actionCenterInsights.ts`)
- [x] Added `i.userId === userIdStr` filter to match the `list` query behavior
- [x] Badge count now reflects current user's insights only

### 3. Deduplication cleanup (`convex/functions/actionCenterInsights.ts`)
- [x] Added `deduplicateExisting` internalMutation
- [x] Ran in production: deleted 19 duplicates, 4 remaining
- [x] Groups by (userId + category + transactionId) for anomalies, (userId + category + title) for others

### 4. Event-driven insight generation (`convex/functions/actionCenterJobs.ts` + `accountingEntries.ts`)
- [x] Added `analyzeNewTransaction` internalMutation — lightweight single-transaction anomaly check
- [x] Hooked into `accountingEntries.create` via `ctx.scheduler.runAfter(0, ...)`
- [x] Anomalies now surface immediately when transactions are created, not 4h later
- [x] Only runs for expenses, only for users with admin/owner roles

### 5. Build & Deploy
- [x] `next build` passes
- [x] `convex deploy --yes` successful
- [x] Dedup cleanup ran in production

## Review
- Anomaly detection was the ONLY detector without dedup — all others (categorization, cashflow, vendor concentration, vendor spending, vendor risk, deadline, cash balance, duplicate txn) had proper checks
- The `internalCreate` mutation in `actionCenterInsights.ts` has a 24h dedup, but was never called by the detection algorithms — they all use `ctx.db.insert()` directly. This is a known architectural debt.
- Installed missing `jszip` and `heic2any` dependencies (pre-existing build failures unrelated to this change)

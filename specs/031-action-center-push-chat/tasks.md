# Tasks: Proactive Chat Alerts

**Branch**: `031-action-center-push-chat` | **Date**: 2026-03-21
**Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## Task 1: Add proactive_alert_delivery table to schema
**Priority**: P1 | **Depends on**: none | **Status**: pending

**Files**:
- `convex/schema.ts` — Add `proactive_alert_delivery` table definition with indexes

**Acceptance**: Schema deploys successfully with `npx convex deploy --yes`

---

## Task 2: Create proactiveAlerts.ts — core alert pipeline
**Priority**: P1 | **Depends on**: Task 1 | **Status**: pending

**Files**:
- `convex/functions/proactiveAlerts.ts` — NEW file with:
  - `pushToChat` (internalMutation) — find/create conversation, check batching window, create system message, record delivery
  - `handleAction` (mutation) — process Investigate/Dismiss actions
  - `getUnreadCount` (query) — reactive badge count
  - `sendMobilePush` (internalAction) — APNs push for critical alerts

**Acceptance**: Functions deploy and can be called from Convex dashboard

---

## Task 3: Hook internalCreate to trigger chat alerts
**Priority**: P1 | **Depends on**: Task 2 | **Status**: pending

**Files**:
- `convex/functions/actionCenterInsights.ts` — Add `ctx.scheduler.runAfter(0, internal.functions.proactiveAlerts.pushToChat, ...)` after successful insert for high/critical priority

**Acceptance**: Creating a high/critical insight automatically triggers pushToChat

---

## Task 4: Create proactive-alert-card action card
**Priority**: P1 | **Depends on**: Task 2 | **Status**: pending

**Files**:
- `src/domains/chat/components/action-cards/proactive-alert-card.tsx` — NEW card with severity indicator, title, description, Investigate/Dismiss buttons
- `src/domains/chat/components/action-cards/index.tsx` — Register `proactive-alert-card`

**Acceptance**: Alert card renders in chat with working Investigate and Dismiss buttons

---

## Task 5: Add unread badge to chat widget
**Priority**: P1 | **Depends on**: Task 2 | **Status**: pending

**Files**:
- Chat widget component (identify exact file) — Add reactive badge using `getUnreadCount` query
- Badge caps at "20+" for overflow

**Acceptance**: Badge appears on chat widget, updates in real-time, disappears when alerts are read

---

## Task 6: Implement weekly email digest
**Priority**: P2 | **Depends on**: Task 1 | **Status**: pending

**Files**:
- `convex/functions/emailDigestJobs.ts` — Implement `runWeeklyDigest` body (query insights, cash flow, overdue invoices, send SES email)
- `src/lambda/scheduled-intelligence/modules/weekly-email-digest.ts` — Wire to call Convex HTTP API

**Acceptance**: Weekly digest email sent to finance_admin/owner users with correct content

---

## Task 7: Build and verify end-to-end
**Priority**: P1 | **Depends on**: Tasks 1-5 | **Status**: pending

**Steps**:
1. `npm run build` — must pass
2. `npx convex deploy --yes` — deploy schema + functions
3. Create test insight → verify chat message appears
4. Test Investigate and Dismiss actions
5. Test badge count
6. Test burst batching (create 3+ insights quickly)

**Acceptance**: All flows work end-to-end, build passes, Convex deploys successfully

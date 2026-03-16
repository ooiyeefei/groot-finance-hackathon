# Tasks: E-Invoice Status Polling

**Branch**: `001-einv-poll-status-change` | **Date**: 2026-03-16
**Plan**: [plan.md](./plan.md) | **Spec**: [spec.md](./spec.md)

## Task 1: Wire Email Notifications into Lambda Polling

**Status**: pending
**Files**: `src/lambda/lhdn-polling/handler.ts`
**Spec**: FR-005 (email + in-app notifications)
**Depends on**: none

**What**: After `updateLhdnStatusFromPoll` mutation succeeds in `pollIssuedInvoiceStatuses()`, send email notification using `buyer-notification-service.ts`.
**How**:
1. Import `sendBuyerNotification` from buyer-notification-service
2. After each successful status change mutation call, check `business.einvoiceBuyerNotifications`
3. If enabled, call `sendBuyerNotification` with appropriate event type
4. Fire-and-forget pattern (try/catch with console.error, don't block polling)

**Acceptance**: Email sent on rejection/cancellation detection when business has notifications enabled.

---

## Task 2: Implement LhdnDetailSection Component

**Status**: pending
**Files**: `src/domains/sales-invoices/components/lhdn-detail-section.tsx`
**Spec**: FR-010 (review flag UI), User Story 3 (status details)
**Depends on**: none

**What**: Replace "Coming Soon" stub with full LHDN detail section.
**How**:
1. Display LHDN metadata: document UUID, long ID, submission ID
2. Show LHDN status badge with validation/rejection timestamp
3. Show rejection/cancellation reason when applicable
4. Show "Review Required" warning banner when `lhdnReviewRequired` is true
5. Integrate `LhdnSubmissionTimeline` component
6. Integrate `LhdnValidationErrors` component when errors exist
7. Show `LhdnCancelButton` when invoice is in 72h window and status is "valid"

**Acceptance**: Detail page shows full LHDN lifecycle info including rejection details.

---

## Task 3: Build Verification

**Status**: pending
**Files**: all
**Spec**: all
**Depends on**: Task 1, Task 2

**What**: Run `npm run build` and fix any errors.
**Acceptance**: Build passes with zero errors.

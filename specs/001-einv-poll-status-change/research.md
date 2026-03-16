# Research: E-Invoice Status Polling

**Date**: 2026-03-16 | **Branch**: `001-einv-poll-status-change`

## Key Finding: Most Backend Already Exists

The `022-einvoice-lhdn-buyer-flows` implementation (commit `627a4c27`) already built the core polling infrastructure. This feature focuses on closing remaining gaps.

### What Already Exists

| Component | Status | Location |
|-----------|--------|----------|
| Lambda Pass 2: `pollIssuedInvoiceStatuses()` | ✅ Complete | `src/lambda/lhdn-polling/handler.ts:300-453` |
| Convex query: `getIssuedInvoicesForStatusPolling()` | ✅ Complete | `convex/functions/salesInvoices.ts:1584-1613` |
| Convex mutation: `updateLhdnStatusFromPoll()` | ✅ Complete | `convex/functions/salesInvoices.ts:1623-1690` |
| Schema fields (lhdnRejectedAt, lhdnStatusReason, lhdnReviewRequired) | ✅ Complete | `convex/schema.ts` |
| Status values ("rejected", "cancelled_by_buyer") | ✅ Complete | `src/lib/constants/statuses.ts` |
| LHDN types (rejectRequestDateTime, cancelDateTime, documentStatusReason) | ✅ Complete | `src/lib/lhdn/types.ts` |
| LHDN client: `getDocumentDetails()`, `getSubmissionStatus()` | ✅ Complete | `src/lib/lhdn/client.ts` |
| In-app notifications on status change | ✅ Complete | Inside `updateLhdnStatusFromPoll` |
| EventBridge schedule (every 5 min) | ✅ Complete | `infra/lib/document-processing-stack.ts` |
| List view: "Review Required" red badge | ✅ Complete | `sales-invoice-list.tsx:503-508` |
| Detail page: review-required alert card | ✅ Complete | `[id]/page.tsx:402-426` |
| LHDN status badge (all 7 statuses) | ✅ Complete | `lhdn-status-badge.tsx` |
| LhdnSubmissionTimeline component | ✅ Exists (not integrated) | `lhdn-submission-timeline.tsx` |
| LhdnValidationErrors component | ✅ Exists (not integrated) | `lhdn-validation-errors.tsx` |

### What's Missing (Gaps)

| Gap | Impact | Spec Requirement |
|-----|--------|-----------------|
| Email notifications not wired into polling flow | High — FR-005 requires email | FR-005 |
| LhdnDetailSection is a stub ("Coming Soon") | Medium — FR-010 UI, User Story 3 | FR-010, US-3 |
| Submission timeline not integrated into detail page | Low — exists, just needs wiring | US-3 |

## Decisions

### Decision 1: Email Notification Trigger Point

**Decision**: Trigger email from Lambda after successful Convex mutation, using buyer-notification-service pattern.
**Rationale**: The Lambda already has business auth context and can call the email service directly. The existing cancel API route uses the same pattern (fire-and-forget email after mutation).
**Alternatives considered**: (1) Convex action calling SES — rejected because Convex can't use AWS SDK natively. (2) Separate email Lambda triggered by Convex — over-engineered for this use case.

### Decision 2: LhdnDetailSection Implementation

**Decision**: Implement the LhdnDetailSection stub to show LHDN metadata, submission timeline, validation errors, and action controls in a cohesive section.
**Rationale**: All sub-components exist — the section just needs to compose them together and display the LHDN fields already on the invoice record.
**Alternatives considered**: Separate pages for each concern — rejected because all LHDN info belongs on the invoice detail page.

### Decision 3: No CDK Changes Needed

**Decision**: No infrastructure changes required.
**Rationale**: EventBridge schedule (5 min), Lambda config (256MB, 2min timeout, ARM_64), and IAM permissions are all already configured. The email service uses existing SES setup.

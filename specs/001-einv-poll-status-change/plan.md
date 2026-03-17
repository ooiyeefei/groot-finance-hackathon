# Implementation Plan: E-Invoice Status Polling

**Branch**: `001-einv-poll-status-change` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-einv-poll-status-change/spec.md`

## Summary

Close remaining gaps in LHDN e-invoice status polling for buyer rejections and cancellations. The core backend (Lambda polling, Convex mutations, schema, in-app notifications) already exists from `022-einvoice-lhdn-buyer-flows`. This plan focuses on: (1) wiring email notifications into the polling flow, (2) implementing the LhdnDetailSection UI stub, and (3) integrating existing timeline/error components into the detail page.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, React 19.1.2, AWS SES, lucide-react
**Storage**: Convex (no schema changes needed — all fields exist)
**Testing**: `npm run build` (mandatory), manual UAT
**Target Platform**: Web (Next.js) + AWS Lambda (Node.js 20, ARM_64)
**Project Type**: Web application (Next.js + Convex + Lambda)
**Performance Goals**: Status changes detected within 10 minutes (5-min polling cycle already configured)
**Constraints**: LHDN 300 RPM rate limit, 72-hour rejection window, existing SES configuration
**Scale/Scope**: ~3 files to modify, ~1 file unchanged, ~0 new files

## Constitution Check

*No constitution configured — gate passes by default.*

## Project Structure

### Documentation (this feature)

```text
specs/001-einv-poll-status-change/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Codebase research findings
├── data-model.md        # Data model (no changes needed)
├── contracts/           # API contracts
│   └── api-contracts.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Task breakdown (next step)
```

### Source Code (files to modify)

```text
src/
├── lambda/lhdn-polling/
│   └── handler.ts                          # ADD: email notification after status change detection
├── domains/sales-invoices/components/
│   └── lhdn-detail-section.tsx             # MODIFY: implement stub → full LHDN detail section
└── lib/services/
    └── buyer-notification-service.ts       # EXISTING: already supports "rejection_confirmed" event
```

**Structure Decision**: No new files needed. All changes are modifications to existing files within the established domain structure.

## Implementation Tasks

### Task 1: Wire Email Notifications into Lambda Polling (FR-005)

**File**: `src/lambda/lhdn-polling/handler.ts`
**What**: After `updateLhdnStatusFromPoll` mutation succeeds, call `sendBuyerNotification` with event `"rejection_confirmed"` (for rejections) or `"cancelled"` (for buyer cancellations).
**Guard**: Check `business.einvoiceBuyerNotifications` setting before sending.
**Pattern**: Fire-and-forget with error logging (same as cancel API route at `src/app/api/v1/sales-invoices/[invoiceId]/lhdn/cancel/route.ts:118-151`).

### Task 2: Implement LhdnDetailSection (FR-010, US-3)

**File**: `src/domains/sales-invoices/components/lhdn-detail-section.tsx`
**What**: Replace "Coming Soon" stub with full LHDN detail section showing:
- LHDN metadata (document UUID, long ID, submission ID)
- Status badge with timestamp
- Rejection/cancellation reason and timestamp (when applicable)
- Review Required warning banner (when `lhdnReviewRequired` is true)
- Integration of `LhdnSubmissionTimeline` component
- Integration of `LhdnValidationErrors` component (when errors exist)
- Action controls: `LhdnSubmitButton` (when eligible) and `LhdnCancelButton` (when in 72h window)

### Task 3: Build Verification

Run `npm run build` to ensure no type errors or build failures.

## Complexity Tracking

No constitution violations to justify.

# Implementation Plan: Leave Management P1 Enhancements

**Branch**: `034-leave-enhance` | **Date**: 2026-03-23 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/034-leave-enhance/spec.md`

## Summary

Five independent enhancements to the leave management module: (1) team overlap conflict warnings during approval, (2) mobile push notifications via APNs + FCM, (3) bulk CSV import of leave balances, (4) leave reports with CSV/PDF export, and (5) configurable leave year start month. All stories build on existing infrastructure — the `push_subscriptions` table, CSV import library, React-PDF renderer, and team calendar overlap detection are already in place.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Next.js 15.5.7 + Convex 1.31.3)
**Primary Dependencies**: Convex (DB + real-time), Capacitor 8.1.0 (mobile), @react-pdf/renderer (PDF export), papaparse/xlsx (CSV parsing), Recharts (charts), Radix UI + Tailwind CSS (UI)
**Storage**: Convex (leave_requests, leave_balances, leave_types, push_subscriptions, businesses tables)
**Testing**: Manual UAT via finance.hellogroot.com (three test roles: admin, manager, employee)
**Target Platform**: Web (Next.js) + iOS (Capacitor/APNs) + Android (Capacitor/FCM)
**Project Type**: Web + Mobile hybrid
**Performance Goals**: Overlap check <2s, push delivery <30s, reports <5s for 200 employees
**Constraints**: Convex free plan (2GB bandwidth/month) — use actions not reactive queries for reports
**Scale/Scope**: Up to 200 employees per business, 500-row report exports

## Constitution Check

*GATE: Constitution template is unconfigured. Using CLAUDE.md project rules as governing principles.*

| Principle | Status | Notes |
|-----------|--------|-------|
| Domain-Driven Design | PASS | All changes within `src/domains/leave-management/` (business domain) and `src/lib/csv-parser/` (shared capability) |
| Convex Bandwidth Budget | PASS | Reports use `action` + `internalQuery` pattern (not reactive `query`). No `.collect()` on unbounded tables. |
| Page Layout Pattern | PASS | No new pages — enhancements to existing leave management page (settings tab, approvals tab, reports tab) |
| Security — Least Privilege | PASS | Role-based report access (FR-023), admin-only import (FR-012), notification preferences respected (FR-009) |
| AWS-first for AWS operations | PASS | Push notification Lambda uses IAM-native access to SSM for APNs/FCM credentials |
| Prefer Modification Over Creation | PASS | Minimal new files — extends existing components, hooks, and Convex functions |
| EventBridge-first for scheduled jobs | N/A | No new crons — all features are on-demand |

## Project Structure

### Documentation (this feature)

```text
specs/034-leave-enhance/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: research findings
├── data-model.md        # Phase 1: schema changes
├── quickstart.md        # Phase 1: implementation quickstart
├── contracts/           # Phase 1: API contracts
│   ├── overlap-check.md
│   ├── push-notification.md
│   ├── leave-balance-import.md
│   ├── leave-reports.md
│   └── leave-year-config.md
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2: implementation tasks
```

### Source Code (repository root)

```text
# Convex backend changes
convex/
├── schema.ts                              # Add leaveYearStartMonth to businesses
├── functions/
│   ├── leaveRequests.ts                   # Add checkOverlaps query
│   ├── leaveBalances.ts                   # Add bulkUpsert mutation, leave year logic
│   ├── teamCalendar.ts                    # Extend conflict detection for approval context
│   └── leaveReports.ts                    # NEW: report aggregation actions

# Lambda for push notifications
infra/lib/
└── push-notification-stack.ts             # NEW: CDK stack for push Lambda

src/lambda/push-notification/
└── index.ts                               # NEW: APNs + FCM send logic

# Frontend changes
src/domains/leave-management/
├── components/
│   ├── leave-approvals-content.tsx        # Add overlap warning dialog
│   ├── leave-management-settings.tsx      # Add import button + leave year config
│   ├── leave-reports-content.tsx          # NEW: reports tab with 3 report types
│   ├── overlap-warning-dialog.tsx         # NEW: approval overlap warning
│   └── leave-report-pdf-document.tsx      # NEW: PDF template for reports
├── hooks/
│   ├── use-leave-reports.ts               # NEW: report data fetching
│   └── use-leave-report-pdf.ts            # NEW: PDF generation hook
└── lib/
    └── leave-year-utils.ts                # NEW: leave year boundary calculations

# Shared capability extension
src/lib/csv-parser/lib/
└── schema-definitions.ts                  # Add LEAVE_BALANCE_FIELDS schema

# API routes
src/app/api/v1/leave-management/
├── notifications/route.ts                 # Extend with push notification channel
└── reports/route.ts                       # NEW: report generation endpoint
```

**Structure Decision**: Web application pattern — follows existing domain-driven structure. All leave-specific code in `src/domains/leave-management/`, shared CSV parser in `src/lib/csv-parser/`, push notification infrastructure in `infra/` + `src/lambda/`.

## Implementation Sequence

### Phase A: Foundation (Leave Year + Schema Changes)
1. Add `leaveYearStartMonth` field to businesses table in schema.ts
2. Create `leave-year-utils.ts` helper (getLeaveYearBoundaries, getCurrentLeaveYear)
3. Add leave year config UI to settings page
4. Deploy Convex schema changes

### Phase B: Team Overlap Warnings (Story 1 — P1)
5. Add `checkOverlapsForApproval` query to leaveRequests.ts (or teamCalendar.ts)
6. Create `overlap-warning-dialog.tsx` component
7. Integrate warning into leave-approvals-content.tsx approval flow

### Phase C: Push Notifications (Story 2 — P1)
8. Create push notification Lambda (APNs + FCM send logic)
9. Create CDK stack for push Lambda
10. Extend notification API route to dispatch push notifications
11. Wire Capacitor push plugin for token registration (mobile-side)

### Phase D: Bulk Import (Story 3 — P2)
12. Add LEAVE_BALANCE_FIELDS to csv-parser schema-definitions.ts
13. Add bulkUpsert mutation to leaveBalances.ts
14. Add "Import Balances" button + modal integration to settings page

### Phase E: Reports & Export (Story 4 — P2)
15. Create leaveReports.ts Convex actions (3 report types)
16. Create leave-reports-content.tsx with tab UI
17. Create leave-report-pdf-document.tsx + use-leave-report-pdf.ts hook
18. Add CSV export utility

### Phase F: Integration & Polish
19. Wire leave year config into balance queries and reports
20. End-to-end testing across all 5 stories
21. Deploy Convex + CDK changes to production

## Complexity Tracking

No constitution violations to justify — all changes follow existing patterns.

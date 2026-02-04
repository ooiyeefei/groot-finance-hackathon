# Implementation Plan: Leave & Time-Off Management Module

**Branch**: `001-leave-management` | **Date**: 2026-02-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-leave-management/spec.md`

## Summary

Add a Leave & Time-Off Management module to FinanSEAL that provides:
1. **Unified workflow** - Leave requests appear in the same approval queue as expense claims
2. **Modern UX** - Real-time balance updates, minimal clicks, mobile-first
3. **SEA regional compliance** - Public holidays for MY, SG, ID, PH, TH, VN

Technical approach: Extend existing Convex schema with new tables (leave_requests, leave_balances, leave_types, public_holidays), reuse 80%+ of expense claims patterns (approval workflow, RBAC, audit events), add new React components for leave-specific UI.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, React 19.1.2, Convex 1.31.3, Clerk 6.30.0, React Query 5.90.7, Zod 3.23.8
**Storage**: Convex (real-time document database with subscriptions)
**Testing**: Vitest 3.2.4 (unit), Playwright 1.57.0 (E2E)
**Target Platform**: Web (responsive), PWA-enabled
**Project Type**: Web application (Next.js fullstack with Convex backend)
**Performance Goals**: Page load <2s, real-time sync <500ms, calendar render <2s for 50 members
**Constraints**: 500 employees per business, 100 concurrent users, multi-tenant isolation
**Scale/Scope**: 9 user stories, 36 functional requirements, 4 new Convex tables

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| Reuse existing patterns | ✅ PASS | 80%+ reuse from expense claims |
| Test-first approach | ✅ PASS | Vitest + Playwright available |
| Simplicity (YAGNI) | ✅ PASS | V1 scope bounded, explicit out-of-scope |
| Multi-tenant isolation | ✅ PASS | All tables scoped by businessId |
| Audit trail | ✅ PASS | Reuse existing audit_events table |

**Gate Result**: PASS - Proceed to Phase 0

## Project Structure

### Documentation (this feature)

```text
specs/001-leave-management/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── leave-api.yaml   # OpenAPI schema
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/domains/leave-management/     # NEW: Leave management domain
├── types/
│   └── index.ts                  # Leave request, balance, type definitions
├── hooks/
│   ├── use-leave-requests.ts     # CRUD hooks for leave requests
│   ├── use-leave-balances.ts     # Balance queries
│   └── use-team-calendar.ts      # Manager calendar view
├── lib/
│   ├── leave-workflow.ts         # Status transitions, approval logic
│   ├── day-calculator.ts         # Business day calculation (excl. weekends/holidays)
│   └── data-access.ts            # Convex query wrappers
└── components/
    ├── leave-request-form.tsx    # Employee request submission
    ├── leave-balance-widget.tsx  # Dashboard balance display
    ├── team-calendar.tsx         # Manager calendar view
    └── leave-type-settings.tsx   # Admin configuration

convex/
├── schema.ts                     # ADD: leave_requests, leave_balances, leave_types, public_holidays
├── functions/
│   ├── leaveRequests.ts          # NEW: Leave request CRUD + approval
│   ├── leaveBalances.ts          # NEW: Balance queries + updates
│   ├── leaveTypes.ts             # NEW: Leave type configuration
│   └── publicHolidays.ts         # NEW: Holiday management
└── migrations.ts                 # ADD: Leave table migrations + seed data

src/domains/expense-claims/       # MODIFY: Unified approval queue
└── components/
    └── approval-queue.tsx        # EXTEND: Include leave requests

src/lib/constants/
└── statuses.ts                   # ADD: Leave request status constants

src/lib/data/
└── public-holidays/              # NEW: Pre-loaded holiday data
    ├── my-2026.json
    ├── sg-2026.json
    ├── id-2026.json
    ├── ph-2026.json
    ├── th-2026.json
    └── vn-2026.json
```

**Structure Decision**: Follows existing domain structure pattern from expense-claims. New domain at `src/domains/leave-management/` with types → hooks → lib → components hierarchy. Convex functions follow existing pattern in `convex/functions/`.

## Complexity Tracking

No constitution violations requiring justification. Implementation follows established patterns.

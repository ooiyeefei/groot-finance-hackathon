# Implementation Plan: Batch Expense Submission

**Branch**: `009-batch-receipt-submission` | **Date**: 2026-02-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-batch-receipt-submission/spec.md`

## Summary

Introduce an **Expense Submission** entity — a container that groups multiple expense claims for batch upload, review, and all-or-nothing approval. This replaces the current single-claim creation flow entirely: all new expenses (even single receipts) go through a submission. The implementation adds a new Convex table (`expense_submissions`), extends the existing `expense_claims` table with a `submissionId` reference, creates a dedicated submission detail page with a reusable claim drawer, and updates both the employee dashboard and manager approval dashboard to operate on submissions.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0, TanStack Query 5.90.7, Zod 3.23.8
**Storage**: Convex (document database with real-time sync), AWS S3 (file storage), CloudFront (signed URL delivery)
**Testing**: Build verification (`npm run build`), manual E2E testing
**Target Platform**: Web (desktop + mobile responsive)
**Project Type**: Web application (Next.js full-stack with Convex backend)
**Performance Goals**: Submission creation + 10 receipt uploads + submit in under 10 minutes; manager approval of 10-claim submission in under 3 minutes
**Constraints**: Max 50 claims per submission; 10MB max file size per receipt; existing Trigger.dev extraction pipeline unchanged
**Scale/Scope**: SME teams (5-50 employees), moderate claim volume (100-500 claims/month per business)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is a blank template — no project-specific gates defined. Gate passes trivially.

**Post-Phase 1 re-check**: Design follows existing codebase patterns (Convex mutations, Next.js pages, React components). No new dependencies beyond Shadcn Sheet component. No architectural deviations.

## Project Structure

### Documentation (this feature)

```text
specs/009-batch-receipt-submission/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: Research decisions & rationale
├── data-model.md        # Phase 1: Entity definitions & state transitions
├── quickstart.md        # Phase 1: Development setup guide
├── contracts/
│   ├── convex-functions.md  # Convex query/mutation contracts
│   └── rest-api.md          # REST API endpoint contracts
├── checklists/
│   └── requirements.md      # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
# New files
convex/functions/expenseSubmissions.ts           # Queries, mutations, internal functions
src/app/[locale]/expense-claims/submissions/
  └── [id]/page.tsx                              # Submission detail page (server component)
src/domains/expense-claims/components/
  ├── submission-detail-page.tsx                 # Main submission view (claim list, upload, totals)
  ├── submission-list.tsx                        # Submissions list for dashboard
  └── claim-detail-drawer.tsx                    # Slide-out drawer wrapping existing claim detail
src/domains/expense-claims/hooks/
  └── use-expense-submissions.tsx                # TanStack Query hooks for submissions
src/components/ui/sheet.tsx                      # Shadcn Sheet/Drawer component
src/app/api/v1/expense-submissions/
  ├── route.ts                                   # GET (list), POST (create)
  └── [id]/
      ├── route.ts                               # GET (detail), PUT (update), DELETE (soft-delete)
      ├── submit/route.ts                        # POST (submit for approval)
      ├── approve/route.ts                       # POST (approve)
      ├── reject/route.ts                        # POST (reject)
      └── claims/
          ├── route.ts                           # POST (add receipt to submission)
          └── [claimId]/route.ts                 # DELETE (remove claim)

# Modified files
convex/schema.ts                                 # Add expense_submissions table, extend expense_claims
convex/crons.ts                                  # Add empty draft cleanup cron (hourly)
convex/functions/expenseClaims.ts                # Extend updateStatus for submission-aware transitions
convex/functions/system.ts                       # Add system mutations for submission processing
src/domains/expense-claims/components/
  ├── personal-expense-dashboard.tsx             # Replace claims list with submissions list
  └── expense-approval-dashboard.tsx             # Show submissions in approval queue
src/domains/expense-claims/types/expense-claims.ts  # Add submission-related types
src/lib/services/email-service.ts                # Add submission notification methods
```

**Structure Decision**: Follows existing codebase conventions — Convex functions in `convex/functions/`, domain components in `src/domains/expense-claims/components/`, API routes in `src/app/api/v1/`, UI primitives in `src/components/ui/`.

## Complexity Tracking

No constitution violations to justify. The implementation follows existing patterns without introducing new architectural complexity.

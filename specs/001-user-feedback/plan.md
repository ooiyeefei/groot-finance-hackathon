# Implementation Plan: User Feedback Collection

**Branch**: `001-user-feedback` | **Date**: 2026-01-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-user-feedback/spec.md`

## Summary

Implement an in-app feedback widget that enables logged-in users to submit bug reports, feature requests, and general feedback through a frictionless, non-technical UI. The system automatically creates GitHub issues for bugs and feature requests, stores all feedback with optional screenshots, and provides admin management capabilities with team notifications.

**Key Technical Approach**:
- New `feedback` domain following existing domain-driven architecture
- Floating widget component using existing UI component library
- Convex database for feedback storage (following existing patterns)
- GitHub API integration via Next.js API route for issue creation
- html2canvas for screenshot capture (client-side)

## Technical Context

**Language/Version**: TypeScript 5.9+ with Next.js 15.4.6 App Router
**Primary Dependencies**: React 18, Tailwind CSS, Convex, Clerk, html2canvas, @octokit/rest
**Storage**: Convex (primary database), Convex file storage (screenshots)
**Testing**: Vitest for unit tests, Playwright for E2E
**Target Platform**: Web (desktop/mobile browsers)
**Project Type**: Web application (Next.js full-stack)
**Performance Goals**: Widget load <2s, submission <30s end-to-end, screenshot <3s
**Constraints**: 3-click max submission, no technical jargon in UI, GitHub API rate limits (5000/hr)
**Scale/Scope**: Expected <100 feedback submissions/day initially

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| Prefer Modification Over Creation | PASS | New domain required (no existing feedback domain) |
| Build-Fix Loop Mandatory | PASS | Will run `npm run build` after each change |
| Parallel Execution | PASS | Frontend widget and backend API can be developed in parallel |
| Simplicity | PASS | Single new domain, minimal dependencies, reuses existing patterns |
| Check Existing Components First | PASS | Will use existing Button, Card, Badge, Input components |
| Semantic Design System | PASS | Will follow Layer 1-2-3 system for theming |

**No violations requiring justification.**

## Project Structure

### Documentation (this feature)

```text
specs/001-user-feedback/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── feedback-api.yaml
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/domains/feedback/           # New feedback domain
├── components/
│   ├── feedback-widget.tsx     # Floating button + modal
│   ├── feedback-form.tsx       # Form with type selection
│   ├── feedback-confirmation.tsx
│   └── screenshot-button.tsx
├── hooks/
│   └── use-feedback.ts         # Submission hook
├── services/
│   └── github-integration.ts   # GitHub issue creation logic
└── types/
    └── feedback.ts             # TypeScript interfaces

src/app/api/v1/feedback/        # API routes
├── route.ts                    # POST /api/v1/feedback (submit)
└── github/
    └── route.ts                # POST /api/v1/feedback/github (create issue)

src/app/(dashboard)/admin/feedback/  # Admin UI
└── page.tsx                    # Feedback management view

convex/
├── feedback.ts                 # Convex table and mutations
└── schema.ts                   # Schema update (add feedback table)

tests/
├── unit/
│   └── feedback/
│       └── feedback-form.test.ts
└── e2e/
    └── feedback-submission.spec.ts
```

**Structure Decision**: Following existing domain-driven architecture pattern. New `feedback` domain is self-contained with its own components, hooks, services, and types. API routes follow `/api/v1/{domain}/` convention.

## Complexity Tracking

> No violations requiring justification.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | N/A |

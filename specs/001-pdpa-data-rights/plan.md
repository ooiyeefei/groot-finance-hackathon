# Implementation Plan: PDPA Data Subject Rights & Clerk/Convex Name Sync

**Branch**: `001-pdpa-data-rights` | **Date**: 2026-03-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-pdpa-data-rights/spec.md`

## Summary

Three deliverables: (1) Fix the Clerk/Convex name sync bug where name edits only update Convex — add Clerk `updateUser` call first, let webhook sync back; applies to both admin and self-edits. (2) Create PDPA data subject rights compliance documentation. (3) Add "Download My Data" button in user profile settings that bundles existing per-module export functions across all businesses into a ZIP of CSVs.

## Technical Context

**Language/Version**: TypeScript 5.9.3 / Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, Clerk 6.30.0, React 19.1.2, JSZip (new — for client-side ZIP generation)
**Storage**: Convex (document database with real-time sync)
**Testing**: Manual UAT via Playwright (existing pattern)
**Target Platform**: Web (desktop + mobile via Capacitor)
**Project Type**: Web application (Next.js + Convex backend)
**Performance Goals**: Name sync < 10s end-to-end; Data export < 2 min for typical user volumes
**Constraints**: Clerk API rate limits (20 req/s for Backend API); Export max 10,000 records per module
**Scale/Scope**: ~100 active users, multi-business support, 4 export modules

## Constitution Check

*No project-specific constitution defined — template only. No gates to enforce.*

## Project Structure

### Documentation (this feature)

```text
specs/001-pdpa-data-rights/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── api-contracts.md
└── checklists/
    └── requirements.md  # Spec quality checklist (complete)
```

### Source Code (files to create/modify)

```text
# P1: Name Sync Bug Fix
src/app/api/v1/users/update-clerk-profile/route.ts    # NEW — Clerk profile update API
src/domains/users/lib/user.service.ts                  # MODIFY — call new API from updateUserName + updateUserProfile
src/domains/account-management/components/teams-management-client.tsx  # MODIFY — call new API after name save (or let service handle it)

# P2: Compliance Documentation
docs/compliance/data-subject-rights.md                 # NEW — PDPA data subject rights document

# P3: Download My Data
src/domains/account-management/components/download-my-data.tsx  # NEW — Download button component
src/app/api/v1/users/export-my-data/route.ts           # NEW — API route to gather data across businesses
convex/functions/exportJobs.ts                          # MODIFY — add getRecordsForUser query (all modules, forced own-records scope)
```

**Structure Decision**: Follows existing domain-based architecture. Name sync fix modifies existing service layer + adds one new API route. Download My Data adds a new component in account-management domain and a new Convex query that composes existing per-module functions.

## Complexity Tracking

No constitution violations to justify.

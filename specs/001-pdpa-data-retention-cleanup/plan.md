# Implementation Plan: PDPA Data Retention Cleanup

**Branch**: `001-pdpa-data-retention-cleanup` | **Date**: 2026-03-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-pdpa-data-retention-cleanup/spec.md`

## Summary

Implement automated PDPA-compliant data retention cleanup for Groot Finance, adding three new daily cron jobs to permanently delete expired chat conversations (2 years), audit logs (3 years), and export history (1 year). Also deliver a formal data retention policy document covering all data types across Malaysia and Singapore jurisdictions. No schema changes required — leverages existing Convex indexes and the established `internalMutation` + cron pattern.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Convex 1.31.3 (crons, internalMutation, storage API)
**Storage**: Convex document database (existing tables), Convex File Storage (export files)
**Testing**: Manual verification via Convex dashboard (cron execution, log output, record counts)
**Target Platform**: Convex serverless backend (cron jobs)
**Project Type**: Web application — backend-only changes
**Performance Goals**: Process 500 records per cron invocation within Convex 10-second mutation timeout
**Constraints**: No schema changes, no new indexes, no frontend changes, no Lambda (deferred to future S3 cleanup)
**Scale/Scope**: 3 new internal mutations, 3 new cron entries, 1 policy document

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution file contains template placeholders only (not project-specific). No gates to enforce.
CLAUDE.md rules are the governing constraints — verified:
- Convex deployment required after changes: YES (will run `npx convex deploy --yes`)
- Least privilege: YES (all new functions are `internalMutation` — not exposed to frontend)
- AWS-first for AWS ops: YES (S3 cleanup deferred to Lambda in future iteration)
- No new files without approval: Policy doc is explicitly required by spec (FR-010)
- Prefer modification over creation: YES (adding functions to existing files)

**Gate status**: PASS

## Project Structure

### Documentation (this feature)

```text
specs/001-pdpa-data-retention-cleanup/
├── plan.md                              # This file
├── spec.md                              # Feature specification
├── research.md                          # Phase 0: technical decisions
├── data-model.md                        # Phase 1: entity analysis
├── quickstart.md                        # Phase 1: implementation guide
├── contracts/
│   └── convex-internal-mutations.md     # Phase 1: function contracts
├── checklists/
│   └── requirements.md                  # Spec quality validation
└── tasks.md                             # Phase 2: task breakdown (via /speckit.tasks)
```

### Source Code (repository root)

```text
convex/
├── crons.ts                    # MODIFY: add 3 new daily cron entries
├── functions/
│   ├── conversations.ts        # MODIFY: add deleteExpired internalMutation
│   ├── audit.ts                # MODIFY: add deleteExpired internalMutation
│   └── exportHistory.ts        # MODIFY: add deleteExpired internalMutation
docs/
└── compliance/
    └── data-retention-policy.md # CREATE: formal retention policy document
```

**Structure Decision**: Backend-only changes to existing Convex function files + one new compliance document. No new source directories, no frontend modifications, no infrastructure changes.

## Complexity Tracking

No constitution violations to justify. All changes follow existing patterns:
- `internalMutation` pattern from existing cleanup functions
- Cron registration pattern from existing `crons.ts`
- File deletion pattern from existing `exportHistory.archiveExpired`

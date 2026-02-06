# Implementation Plan: CSV Template Builder

**Branch**: `002-csv-template-builder` | **Date**: 2026-02-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-csv-template-builder/spec.md`

---

## Summary

The CSV Template Builder enables users to export expense claims and leave records to CSV format compatible with external systems (SQL Payroll, Xero, QuickBooks, BrioHR, Kakitangan). Users can use pre-built templates, create custom templates with field mapping, save templates for reuse, schedule automated exports, and view export history.

**Technical Approach**: New Convex tables for templates, schedules, and history. New domain at `src/domains/exports/`. Convex crons for scheduled exports. File storage via Convex storage (same pattern as expense claims).

---

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, React 19.1.2, React Query 5.90.7, Zod 3.23.8, Clerk 6.30.0
**Storage**: Convex (document database with real-time subscriptions), Convex File Storage for CSV files
**Testing**: Vitest for unit tests, Playwright for E2E
**Target Platform**: Web application (desktop + mobile responsive)
**Project Type**: Web application (monorepo with Next.js frontend + Convex backend)
**Performance Goals**: Export preview < 2s, Export history load < 2s for 100 records, CSV generation < 30s for 10,000 records
**Constraints**: Max 10,000 records per export, 90-day file retention, UTF-8 CSV format only
**Scale/Scope**: ~5 new Convex tables, ~15 new components, ~8 new API endpoints

---

## Constitution Check

*No project constitution defined. Using general best practices.*

**Gates Passed**:
- [x] Follows existing domain structure pattern (`src/domains/exports/`)
- [x] Uses existing Convex patterns for data storage
- [x] Reuses existing file storage patterns
- [x] Uses existing cron job patterns for scheduling
- [x] Follows role-based access control patterns

---

## Project Structure

### Documentation (this feature)

```text
specs/002-csv-template-builder/
├── plan.md              # This file
├── research.md          # Phase 0 output - technology decisions
├── data-model.md        # Phase 1 output - Convex schema additions
├── quickstart.md        # Phase 1 output - development setup
├── contracts/           # Phase 1 output - API contracts
│   ├── templates.ts     # Template CRUD endpoints
│   ├── exports.ts       # Export execution endpoints
│   ├── schedules.ts     # Schedule management endpoints
│   └── history.ts       # Export history endpoints
└── tasks.md             # Phase 2 output (via /speckit.tasks)
```

### Source Code (repository root)

```text
src/domains/exports/
├── components/
│   ├── exports-page-content.tsx       # Main page component
│   ├── template-list.tsx              # List pre-built + custom templates
│   ├── template-builder.tsx           # Custom template editor
│   ├── field-mapper.tsx               # Drag-and-drop field mapping
│   ├── export-preview.tsx             # Preview data before export
│   ├── export-filters.tsx             # Date range, status, employee filters
│   ├── schedule-manager.tsx           # Create/edit schedules
│   ├── schedule-list.tsx              # List active schedules
│   ├── export-history-list.tsx        # List past exports
│   └── index.ts                       # Component exports
├── hooks/
│   ├── use-export-templates.ts        # Template CRUD hooks
│   ├── use-export-execution.ts        # Execute export hooks
│   ├── use-export-schedules.ts        # Schedule management hooks
│   ├── use-export-history.ts          # History query hooks
│   └── index.ts                       # Hook exports
├── lib/
│   ├── csv-generator.ts               # CSV generation logic
│   ├── field-definitions.ts           # Available fields per module
│   └── prebuilt-templates.ts          # Pre-built template definitions
└── types/
    └── index.ts                       # TypeScript interfaces

convex/functions/
├── exportTemplates.ts                 # Template CRUD functions
├── exportSchedules.ts                 # Schedule management functions
├── exportHistory.ts                   # History tracking functions
└── exportJobs.ts                      # Background export execution

convex/schema.ts                       # Add new tables
convex/crons.ts                        # Add scheduled export cron

src/app/[locale]/reporting/
└── page.tsx                           # New "Reporting & Exports" page
```

**Structure Decision**: New domain `src/domains/exports/` following existing patterns from `expense-claims` and `leave-management` domains. Convex functions follow existing function organization pattern.

---

## Complexity Tracking

| Aspect | Complexity | Justification |
|--------|-----------|---------------|
| New domain | Medium | Follows existing patterns, 5 new tables |
| Template builder UI | Medium | Drag-and-drop field mapping, preview |
| Scheduled exports | Low | Existing cron pattern, simple execution |
| File storage | Low | Existing Convex storage pattern |
| Permissions | Low | Existing role-based patterns |

---

## Phase 0: Research Summary

See [research.md](./research.md) for full details.

**Key Decisions**:
1. **File Storage**: Convex File Storage (same as expense claims)
2. **CSV Generation**: Server-side in Convex action, client downloads via signed URL
3. **Scheduling**: Convex crons with daily/weekly/monthly intervals
4. **Pre-built Templates**: Stored as code constants, versioned with app
5. **Custom Templates**: Stored in Convex `export_templates` table

---

## Phase 1: Data Model & Contracts

See [data-model.md](./data-model.md) for Convex schema additions.
See [contracts/](./contracts/) for API contracts.

**New Convex Tables**:
1. `export_templates` - Template configurations
2. `export_field_mappings` - Field mapping definitions (embedded in template)
3. `export_schedules` - Scheduled export jobs
4. `export_history` - Completed export records
5. `export_files` - File storage references

---

## Implementation Phases

### Phase 1: Core Export (P1 - Pre-built Templates)

**Scope**: FR-001 through FR-005
**Components**: template-list, export-preview, export-filters, exports-page-content
**Convex**: exportTemplates (queries), exportHistory (mutations)

### Phase 2: Custom Templates (P2)

**Scope**: FR-006 through FR-013
**Components**: template-builder, field-mapper
**Convex**: exportTemplates (full CRUD)

### Phase 3: Scheduled Exports (P3)

**Scope**: FR-014 through FR-017
**Components**: schedule-manager, schedule-list
**Convex**: exportSchedules, exportJobs, crons.ts update

### Phase 4: Export History (P3)

**Scope**: FR-018 through FR-021
**Components**: export-history-list
**Convex**: exportHistory (queries, filters)

---

## Success Metrics Validation

| Metric | How to Validate |
|--------|-----------------|
| SC-001: Export in < 1 min | Performance test with sample data |
| SC-002: Template creation < 5 min | UX testing with real users |
| SC-003: 90% scheduled success | Monitor cron job success rate |
| SC-004: History loads < 2s | Performance test with 100+ records |
| SC-005: Import compatibility | Manual import test for each target system |

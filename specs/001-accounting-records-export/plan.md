# Implementation Plan: Export System v2 — Accounting Records, Invoices & Unified Rebuild

**Branch**: `001-accounting-records-export` | **Date**: 2026-02-24 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-accounting-records-export/spec.md`

## Summary

Rebuild the entire Reporting & Exports system from scratch with 4 export modules (Expense Claims, Invoices, Leave Records, Accounting Records) using a unified export engine. The engine supports both flat CSV (comma-delimited) and hierarchical MASTER/DETAIL (semicolon-delimited) formats. Pre-built templates target SQL Accounting (Malaysia) and AutoCount for accounting records and invoices, plus rebuilt templates for existing payroll/HR systems. Master Accounting template deferred pending vendor documentation.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0, Zod 3.23.8, lucide-react
**Storage**: Convex (document database with real-time sync), Convex File Storage (export file storage)
**Testing**: Manual UAT against SQL Accounting and AutoCount import tools, unit tests for formatters
**Target Platform**: Web application (desktop + mobile responsive)
**Project Type**: Web application (Next.js frontend + Convex backend)
**Performance Goals**: Export 1,000 entries with ~3 line items each (4,000 rows) in <10 seconds
**Constraints**: Client-side CSV generation (no server-side file generation), 10,000 entry limit per export, 90-day export history retention
**Scale/Scope**: ~15 files modified/created, 4 modules × ~4 templates each = ~17 pre-built templates total

## Constitution Check

*No project constitution defined. Using CLAUDE.md guidelines as governing constraints.*

| Gate | Status | Notes |
|------|--------|-------|
| Design system tokens | PASS | All UI uses semantic tokens per CLAUDE.md |
| Button styling | PASS | Action buttons use `bg-primary`, destructive use `bg-destructive` |
| Number formatting | PASS | Export engine uses `formatNumber`/`formatCurrency` utilities |
| Date handling | PASS | Uses `formatBusinessDate` pattern, no timezone shift |
| Convex deployment | PENDING | Must run `npx convex deploy --yes` after schema changes |
| Build verification | PENDING | Must pass `npm run build` before completion |
| Git author | PENDING | Must use `grootdev-ai` identity |

## Project Structure

### Documentation (this feature)

```text
specs/001-accounting-records-export/
├── plan.md              # This file
├── spec.md              # Feature specification (complete)
├── research.md          # Phase 0 research decisions (complete)
├── data-model.md        # Phase 1 data model (complete)
├── quickstart.md        # Phase 1 implementation guide (complete)
├── contracts/
│   └── convex-functions.md  # Phase 1 API contracts (complete)
├── checklists/
│   └── requirements.md  # Spec quality checklist (complete)
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/domains/exports/
├── components/
│   ├── exports-page-content.tsx    # Tab container (minor modify)
│   ├── module-selector.tsx         # Module selection cards (modify: add 2 modules)
│   ├── export-filters.tsx          # Filter panel (modify: add invoice type, txn type)
│   ├── export-preview.tsx          # Preview table (modify: hierarchical row styling)
│   └── template-builder.tsx        # Template builder (modify: 4 module support)
├── hooks/
│   ├── use-export-templates.ts     # Template CRUD hooks (minor modify)
│   └── use-export-execution.ts     # Export execution hook (modify: format handling)
└── lib/
    ├── export-engine.ts            # NEW: Unified export engine (flat + hierarchical)
    ├── value-extractor.ts          # NEW: Shared value extraction & formatting
    ├── field-definitions.ts        # Modify: add accounting + invoice fields
    ├── prebuilt-templates.ts       # Major rewrite: all 17 templates
    ├── csv-generator.ts            # REMOVE: replaced by export-engine.ts
    └── data-access-filter.ts       # Minor modify: new module support

convex/
├── schema.ts                       # Modify: expand exportModuleValidator
└── functions/
    ├── exportJobs.ts               # Major rewrite: 4 module data retrieval
    ├── exportTemplates.ts          # Modify: expanded module + prebuilt registry
    ├── exportSchedules.ts          # Minor modify: new module support
    └── exportHistory.ts            # Minor modify: new module support
```

**Structure Decision**: Web application with Next.js frontend and Convex serverless backend. Export domain is self-contained under `src/domains/exports/`. All changes are within existing directory structure — no new directories needed except `contracts/` in the spec.

## Implementation Phases

### Phase 1: Unified Export Engine Core
- Create `export-engine.ts` with `FlatFormatter` and `HierarchicalFormatter`
- Create `value-extractor.ts` with shared extraction/formatting logic factored from `csv-generator.ts`
- Add accounting and invoice field definitions to `field-definitions.ts`
- Unit test both formatters

### Phase 2: Accounting Records Module
- Expand `exportModuleValidator` in `convex/schema.ts`
- Add `getAccountingRecords()` and `enrichAccountingRecords()` to `exportJobs.ts`
- Implement journal line DR/CR derivation logic
- Add SQL Accounting GL_JE, AutoCount journal, and generic accounting templates
- Add "Accounting Records" to module selector

### Phase 3: Invoices Module
- Add `getInvoiceRecords()` and `enrichInvoiceRecords()` to `exportJobs.ts`
- Implement AP/AR normalization from two source tables
- Add invoice type filter (AP/AR/All) to export filters
- Add SQL Accounting AP_PI/AR_IV, AutoCount invoice, and generic invoice templates
- Add "Invoices" to module selector

### Phase 4: Rebuild Expense Claims + Leave Records
- Port all 10 existing templates to new engine interface
- Refactor `getExpenseRecords()` and `getLeaveRecords()` to shared patterns
- Remove `csv-generator.ts`, replace all references with export engine
- Verify output parity with v1

### Phase 5: Template Builder, Preview, History, Scheduling
- Update Template Builder for 4-module field selection
- Add hierarchical preview with MASTER/DETAIL row styling
- Update export filters for module-specific options
- Expand Convex functions for new modules (templates, schedules, history)
- Update export execution hook for format-aware output

### Phase 6: Deploy & Validate
- Run `npx convex deploy --yes`
- Run `npm run build`
- UAT: Export → Import into SQL Accounting, AutoCount
- Verify existing custom templates still work
- Verify export history, scheduling, role-based access

## Complexity Tracking

No constitution violations to justify. All changes stay within the existing project structure and technology stack.

# Implementation Plan: CSV Auto-Parser with Intelligent Column Mapping

**Branch**: `001-csv-parser` | **Date**: 2026-03-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-csv-parser/spec.md`

## Summary

Build an intelligent CSV/Excel parser that auto-detects column mappings using AI (Qwen3-8B) and saves confirmed mappings as reusable templates. Delivered as an embeddable React component (`<CsvImportModal>`) that consuming features invoke. Browser-side parsing for instant header detection, server-side AI for mapping suggestions. One new Convex table (`csv_import_templates`) for template persistence.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, React 19.1.2, Convex 1.31.3, papaparse (CSV), xlsx/SheetJS (Excel), Clerk 6.30.0
**Storage**: Convex (csv_import_templates table). No file storage — files parsed in browser memory.
**Testing**: `npm run build` (Next.js build check), manual UAT
**Target Platform**: Web (desktop + mobile browser)
**Project Type**: Web application (Next.js + Convex)
**Performance Goals**: AI mapping suggestions within 10s, template auto-apply under 3s
**Constraints**: 25 MB max file size, 100,000 max rows, browser-side parsing only
**Scale/Scope**: Per-business template isolation, ~15 standard fields per schema

## Constitution Check

*Constitution file contains placeholder template only — no concrete gates to evaluate.*

## Project Structure

### Documentation (this feature)

```text
specs/001-csv-parser/
├── plan.md              # This file
├── research.md          # Phase 0: Technology decisions
├── data-model.md        # Phase 1: Entity definitions
├── quickstart.md        # Phase 1: Getting started guide
├── contracts/
│   ├── convex-functions.md   # Convex query/mutation contracts
│   └── component-api.md      # React component interface
└── tasks.md             # Phase 2 output (next step)
```

### Source Code (repository root)

```text
src/domains/csv-parser/
├── components/
│   ├── csv-import-modal.tsx          # Main entry point (Sheet drawer)
│   ├── file-upload-step.tsx          # Step 1: File selection + parsing
│   ├── column-mapping-step.tsx       # Step 2: Review/edit AI mappings
│   ├── data-preview-step.tsx         # Step 3: Preview mapped data
│   ├── validation-results.tsx        # Validation error display
│   └── template-manager.tsx          # Template CRUD (P2)
├── hooks/
│   ├── use-csv-parser.ts             # File parsing logic
│   ├── use-column-mapping.ts         # AI mapping + manual adjustment
│   ├── use-import-templates.ts       # Convex template hooks
│   └── use-import-session.ts         # In-memory session state
├── lib/
│   ├── parser-engine.ts              # CSV/XLSX parsing, delimiter detection
│   ├── fingerprint.ts                # Header SHA-256 fingerprint
│   ├── sanitizer.ts                  # Formula injection prevention
│   ├── validator.ts                  # Row validation against schema
│   └── schema-definitions.ts         # Standard field schemas
├── types/
│   └── index.ts                      # TypeScript interfaces
└── CLAUDE.md                         # Domain docs

convex/functions/
└── csvImportTemplates.ts             # Queries + mutations

src/app/api/v1/csv-parser/
└── suggest-mappings/route.ts         # AI mapping endpoint
```

**Structure Decision**: New domain `src/domains/csv-parser/` following established domain-driven architecture. Separate from `exports/` because import and export are different data flow directions with different entities and UI. Convex functions follow existing pattern from `exportTemplates.ts`.

## Complexity Tracking

No constitution violations to justify — all design choices follow existing codebase patterns.

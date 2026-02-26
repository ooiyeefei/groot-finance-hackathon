# Quickstart: Master Accounting Export Integration

**Branch**: `001-master-accounting-export` | **Date**: 2026-02-26

## Implementation Overview

This feature adds Master Accounting (MasterITEC) as a new export target in the existing Groot Finance export system. It involves:

1. **7 new prebuilt templates** in `prebuilt-templates.ts` (4 transaction + 3 master data)
2. **1 new Convex table** (`export_code_mappings`) for persisting code mappings
3. **1 new UI component** (inline code mapping screen) inserted into the export flow
4. **Minor engine enhancements** (section header support, column header toggle, pipe sanitization)

## Files to Create

| File | Purpose |
|------|---------|
| `convex/functions/exportCodeMappings.ts` | CRUD queries/mutations for `export_code_mappings` table |
| `src/domains/exports/components/code-mapping-step.tsx` | Inline mapping screen UI component |
| `src/domains/exports/hooks/use-code-mappings.ts` | React hook for fetching/saving code mappings |

## Files to Modify

| File | Changes |
|------|---------|
| `convex/schema.ts` | Add `export_code_mappings` table definition |
| `src/domains/exports/types/index.ts` | Add `sectionHeader`, `includeColumnHeaders`, `requiresCodeMapping`, `codeMappingTypes` to `PrebuiltTemplate` |
| `src/domains/exports/lib/prebuilt-templates.ts` | Add 7 Master Accounting templates + register in collections |
| `src/domains/exports/lib/export-engine.ts` | Add section header support to `generateHierarchicalExport`, add `includeColumnHeaders` option to `generateFlatExport`, add pipe sanitization in `escapeDelimitedValue` |
| `src/domains/exports/lib/value-extractor.ts` | Add pipe character replacement for pipe-delimited formats |
| `src/domains/exports/components/exports-page-content.tsx` | Insert code mapping step between template selection and filters (conditional on `requiresCodeMapping`) |

## Implementation Order

1. **Schema + Types** — Add Convex table, update TypeScript types
2. **Engine Enhancements** — Section header, column header toggle, pipe sanitization
3. **Prebuilt Templates** — Define all 7 Master Accounting templates
4. **Code Mapping Backend** — Convex CRUD functions
5. **Code Mapping UI** — Inline mapping step component + hook
6. **Integration** — Wire mapping step into export flow
7. **Testing** — Generate sample exports, validate against Master Accounting import

## Key Patterns to Follow

- **Prebuilt templates**: Follow the exact pattern of `SQL_ACCOUNTING_GL_JE` for hierarchical templates and `GENERIC_EXPENSE` for flat templates
- **Convex mutations**: Use `internalMutation` for backend-only ops. The code mapping CRUD uses regular `mutation` since it's frontend-initiated
- **Export engine**: The `generateExport()` dispatcher handles format routing — templates with `formatType: "hierarchical"` auto-route to `generateHierarchicalExport()`
- **Field mappings**: Use `'"M"'` syntax for literal values (single-quoted string containing double-quoted literal) as seen in existing SQL Accounting templates for the record type prefix

## Testing Strategy

1. **Unit tests**: Generate sample export output for each template and validate pipe-delimited format, field count, date format, decimal places
2. **Integration tests**: Export real Convex data through the full pipeline and verify file content
3. **Manual validation**: Import generated .txt files into Master Accounting trial version to confirm acceptance

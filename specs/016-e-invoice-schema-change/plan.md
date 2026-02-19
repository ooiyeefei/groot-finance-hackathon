# Implementation Plan: e-Invoice Schema Changes (LHDN + Peppol Fields)

**Branch**: `016-e-invoice-schema-change` | **Date**: 2026-02-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/016-e-invoice-schema-change/spec.md`

## Summary

Add e-invoice specific fields to 3 existing Convex tables (`sales_invoices`, `businesses`, `customers`) to support LHDN MyInvois (Malaysia) and Peppol InvoiceNow (Singapore) submissions. Extend the `customerSnapshot` embedded object with TIN, BRN, and structured address fields. Add 3 new database indexes for e-invoice status queries and TIN lookups. All changes are additive (optional fields) — zero migration, zero downtime.

## Technical Context

**Language/Version**: TypeScript 5.9.3
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Zod 3.23.8
**Storage**: Convex (document database with real-time sync)
**Testing**: `npm run build` (type checking + compilation) + manual verification
**Target Platform**: Web application (Next.js)
**Project Type**: Web (monorepo: frontend + Convex backend)
**Performance Goals**: Indexed queries return results in <1s
**Constraints**: All new fields must be `v.optional()` for backward compatibility. No new tables. LHDN client secret must NOT be stored in Convex.
**Scale/Scope**: ~34 new fields across 3 tables, 3 new indexes, 6 files modified

## Constitution Check

*GATE: No project constitution configured. Proceeding with standard best practices.*

No violations. The feature follows existing codebase patterns:
- Status constants in `src/lib/constants/statuses.ts`
- Validators in `convex/lib/validators.ts`
- Schema in `convex/schema.ts`
- Types in domain-specific `types/index.ts`

## Project Structure

### Documentation (this feature)

```text
specs/016-e-invoice-schema-change/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── schema-contract.md  # Type contracts and validator definitions
├── checklists/
│   └── requirements.md     # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (files to modify)

```text
src/
├── lib/
│   └── constants/
│       └── statuses.ts                          # Add LHDN/Peppol/einvoice status constants
└── domains/
    └── sales-invoices/
        ├── types/
        │   └── index.ts                         # Extend CustomerSnapshot interface + Zod
        └── components/
            └── customer-selector.tsx             # Extend snapshot builder

convex/
├── schema.ts                                    # Extend 3 tables + add indexes
├── lib/
│   └── validators.ts                            # Add 3 new validators
└── functions/
    └── salesInvoices.ts                         # Extend mutation arg validation + auto-customer
```

**Structure Decision**: No new directories or files needed. All changes modify existing files following established patterns.

## File Change Matrix

| File | Change Type | Lines ~Added | Scope |
|------|------------|-------------|-------|
| `src/lib/constants/statuses.ts` | Extend | ~30 | 3 new status constant blocks + types |
| `convex/lib/validators.ts` | Extend | ~15 | 3 new validator exports + imports |
| `convex/schema.ts` | Extend | ~80 | Fields on 3 tables + customerSnapshot + 3 indexes |
| `src/domains/sales-invoices/types/index.ts` | Extend | ~20 | CustomerSnapshot interface + Zod schema |
| `src/domains/sales-invoices/components/customer-selector.tsx` | Extend | ~15 | Snapshot builder + save-back functions |
| `convex/functions/salesInvoices.ts` | Extend | ~40 | Mutation args + auto-customer mapping |

**Total**: ~200 lines added across 6 files. Zero lines deleted. Zero files created.

## Complexity Tracking

No constitution violations to justify. The implementation is straightforward additive changes following established patterns.

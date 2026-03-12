# Implementation Plan: Bank Statement Import & Auto-Reconciliation

**Branch**: `021-bank-statement-import-recon` | **Date**: 2026-03-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/021-bank-statement-import-recon/spec.md`

## Summary

Enable users to upload bank statements (CSV/XLSX) and auto-reconcile transactions against accounting entries. Leverages the existing shared CSV parser (`src/lib/csv-parser/`) with `bank_statement` schema type. Matching engine runs against `accounting_entries` table as single target, displaying linked source records (invoices, expenses) for context. Lives as a new "Bank Reconciliation" tab within the Accounting page (renamed from "Accounting Records" to "Accounting").

## Technical Context

**Language/Version**: TypeScript 5.9.3 / Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, React 19.1.2, Clerk 6.30.0, Radix UI Tabs, TanStack Query 5.90.7, Zod 3.23.8
**Storage**: Convex (new `bank_accounts`, `bank_transactions`, `bank_import_sessions`, `reconciliation_matches` tables)
**Testing**: `npm run build` (type + lint check), manual UAT with test accounts
**Target Platform**: Web (desktop-first, responsive)
**Project Type**: Web application (Next.js monolith)
**Performance Goals**: Import <60s for 1k rows, dashboard load <3s, match confirm <5s
**Constraints**: Must not break existing accounting entries functionality; CSV parser limits (25MB, 100k rows)
**Scale/Scope**: ~200 transactions/month per business, 3 new Convex tables, 1 new tab, ~15 components

## Constitution Check

*Constitution not configured for this project. No gates to check. Proceeding with CLAUDE.md rules as governance.*

Key CLAUDE.md constraints applied:
- Domain-driven design: Bank recon is a shared capability consumed by the Accounting domain
- Convex deployment: Must run `npx convex deploy --yes` after schema changes
- Semantic design tokens: No hardcoded colors
- Git author: `grootdev-ai` / `dev@hellogroot.com`

## Project Structure

### Documentation (this feature)

```text
specs/021-bank-statement-import-recon/
├── plan.md              # This file
├── research.md          # Phase 0: Research findings
├── data-model.md        # Phase 1: Entity schemas
├── quickstart.md        # Phase 1: Dev quickstart
├── contracts/           # Phase 1: API contracts
└── tasks.md             # Phase 2: Implementation tasks
```

### Source Code (repository root)

```text
# Convex backend (new tables + functions)
convex/
├── schema.ts                              # Add bank_accounts, bank_transactions, bank_import_sessions, reconciliation_matches
└── functions/
    ├── bankAccounts.ts                    # CRUD for bank accounts
    ├── bankTransactions.ts                # Import, list, duplicate detection
    ├── bankImportSessions.ts              # Import session tracking
    └── reconciliationMatches.ts           # Matching engine, confirm/reject/manual match

# Accounting domain (UI lives here — bank recon is an accounting workflow)
src/domains/accounting-entries/
├── components/
│   ├── accounting-entries-client.tsx       # MODIFY: Add tab container (Records | Bank Reconciliation)
│   ├── bank-recon/
│   │   ├── bank-recon-tab.tsx             # Main tab container
│   │   ├── bank-accounts-manager.tsx      # Register/edit/deactivate bank accounts
│   │   ├── bank-import-button.tsx         # Triggers CsvImportModal with bank_statement schema
│   │   ├── reconciliation-dashboard.tsx   # Summary bar + transaction list
│   │   ├── transaction-row.tsx            # Single transaction with match actions
│   │   ├── match-candidates-sheet.tsx     # Side sheet showing candidate matches
│   │   ├── manual-match-search.tsx        # Search accounting entries for manual matching
│   │   ├── categorize-transaction.tsx     # Categorize unmatched (bank charges, interest, etc.)
│   │   └── reconciliation-summary.tsx     # Period summary + export
│   └── ...existing components
├── hooks/
│   ├── use-bank-accounts.ts               # TanStack Query hooks for bank accounts
│   ├── use-bank-transactions.ts           # TanStack Query hooks for transactions
│   └── use-reconciliation.ts              # Matching + reconciliation actions
└── lib/
    └── matching-engine.ts                 # Client-side matching logic (runs after import)

# Navigation update
src/lib/navigation/nav-items.ts            # MODIFY: Rename "Accounting Records" → "Accounting"

# Page update
src/app/[locale]/accounting/page.tsx       # MODIFY: Pass tab context to client component
```

**Structure Decision**: Bank reconciliation components live within `src/domains/accounting-entries/` as a sub-feature (under `components/bank-recon/`). This follows the domain-driven design pattern — accounting owns the user journey, bank recon is an accounting workflow. The shared CSV parser (`src/lib/csv-parser/`) is consumed via `<CsvImportModal schemaType="bank_statement">`.

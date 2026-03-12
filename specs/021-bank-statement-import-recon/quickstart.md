# Quickstart: Bank Statement Import & Auto-Reconciliation

## Prerequisites

- Node.js 20.x, npm
- Convex CLI (`npx convex`)
- Feature branch: `021-bank-statement-import-recon`

## Development Flow

1. **Schema changes**: Add 4 new tables to `convex/schema.ts`
2. **Deploy schema**: `npx convex deploy --yes`
3. **Convex functions**: Create bankAccounts, bankTransactions, bankImportSessions, reconciliationMatches
4. **Navigation**: Rename "Accounting Records" → "Accounting" in sidebar
5. **Tab container**: Transform accounting page into Records | Bank Reconciliation tabs
6. **Bank recon UI**: Build components under `src/domains/accounting-entries/components/bank-recon/`
7. **Integration**: Wire CsvImportModal with `bank_statement` schema type
8. **Build check**: `npm run build`
9. **Deploy**: `npx convex deploy --yes`

## Key Integration Points

- **CSV Parser**: `import { CsvImportModal } from '@/lib/csv-parser'` with `schemaType="bank_statement"`
- **Accounting Entries**: `convex/functions/accountingEntries.ts` — query for matching candidates
- **Existing Tabs Pattern**: Follow `src/domains/invoices/components/invoices-tab-container.tsx` for hash-routing tabs

## Testing

- Import a sample bank statement CSV
- Verify transactions appear in the Bank Reconciliation tab
- Check auto-matching against existing accounting entries
- Confirm/reject suggested matches
- Manual match an unmatched transaction
- Categorize a bank fee transaction

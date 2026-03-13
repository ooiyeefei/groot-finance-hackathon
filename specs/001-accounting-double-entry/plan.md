# Implementation Plan: Double-Entry Accounting System with Modern UX

**Branch**: `001-accounting-double-entry` | **Date**: 2026-03-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-accounting-double-entry/spec.md`

## Summary

Implement GAAP/IFRS/MAS-8 compliant double-entry accounting system to replace the current single-entry `accounting_entries` table. System provides automated journal entry creation from business events (sales, expenses, AR reconciliation), generates financial statements (P&L, Balance Sheet, Cash Flow, Trial Balance), supports chart of accounts management, and presents data through a modern dashboard with both simplified and technical views. Integrates with existing AR reconciliation, expense claims, and sales invoices modules.

**Core Value**: Enables businesses to maintain compliant financial records, generate regulatory-ready financial statements, and understand financial health without external accounting software.

## Technical Context

**Language/Version**: TypeScript 5.9.3 / Node.js 20.x + Next.js 15.5.7, React 19.1.2
**Primary Dependencies**: Convex 1.31.3 (real-time database), React Query 5.90.7, Zod 3.23.8, Clerk 6.30.0 (auth), Radix UI (components), lucide-react (icons)
**Storage**: Convex document database with real-time subscriptions. New tables: `chart_of_accounts`, `journal_entries`, `journal_entry_lines`, `accounting_periods`, `manual_exchange_rates`. Migration from existing `accounting_entries` table
**Testing**: Manual UAT using test accounts from `.env.local` (TEST_USER_ADMIN for Finance Admin role). Integration testing with AR reconciliation module, expense claims approval flow, sales invoice payment recording
**Target Platform**: Web application (Next.js App Router at `/en/accounting`). Desktop-first UI with responsive design. Mobile shows read-only financial statements (Phase 2: full transaction entry)
**Project Type**: Web application with domain-driven architecture (`src/domains/accounting/`)
**Performance Goals**: Dashboard load <1 second, financial statement generation <5 seconds, transaction list pagination 50 entries/page. Tested with 2000 transactions/month dataset (24k annual entries)
**Constraints**: Must maintain referential integrity (every journal entry balances to zero), prevent modification of closed accounting periods, support multi-currency with exchange rate tracking, RBAC enforcement (Finance Admin only for edit, Owner view-only, Manager/Employee blocked)
**Scale/Scope**: Medium volume SMEs (500-2000 transactions/month). 5 user stories (P1-P3). 27 functional requirements. 4 financial statements. Integration with 3 existing modules (AR recon, expense claims, sales invoices)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: Constitution template not yet ratified for Groot Finance project. Skipping gate validation. Will establish accounting-specific principles during implementation:

- **Data Integrity**: All journal entries must balance (total debits = total credits) - enforced via Zod validation before database write
- **Audit Trail**: Immutable journal entries - deletions require reversal entries with `reversed_by` reference
- **RBAC Enforcement**: Finance Admin Only model - validated at API route level and Convex mutation level
- **Financial Compliance**: Follow MAS-8/IFRS/GAAP accrual accounting principles

## Project Structure

### Documentation (this feature)

```text
specs/001-accounting-double-entry/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── api-endpoints.yaml          # REST API contract (OpenAPI 3.0)
│   ├── convex-schema.ts            # Convex table schemas
│   └── integration-hooks.md        # Events from AR recon/expenses/invoices
├── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
├── spec.md              # Feature specification (already created)
└── checklists/
    └── requirements.md  # Spec validation (already created)
```

### Source Code (repository root)

```text
# Web application structure (Next.js App Router + Convex)

src/domains/accounting/
├── components/
│   ├── dashboard.tsx                    # Modern dashboard (SC-006: <1s load)
│   ├── chart-of-accounts-manager.tsx    # COA CRUD (FR-003, FR-004, FR-005)
│   ├── journal-entry-form.tsx           # Manual entry wizard (FR-007, FR-008)
│   ├── journal-entry-list.tsx           # Transaction list with pagination (FR-020a)
│   ├── financial-statements/
│   │   ├── profit-loss-statement.tsx    # P&L (FR-010)
│   │   ├── balance-sheet.tsx            # Balance Sheet (FR-011)
│   │   ├── cash-flow-statement.tsx      # Cash Flow - Indirect Method (FR-013)
│   │   └── trial-balance.tsx            # Trial Balance (FR-012)
│   ├── accounting-period-manager.tsx    # Period close (FR-018)
│   ├── currency-rate-manager.tsx        # Manual exchange rates (FR-019a)
│   └── simplified-mode-toggle.tsx       # Accountant vs Simple mode (FR-023, FR-024)
├── hooks/
│   ├── use-journal-entries.tsx          # Real-time journal entries query
│   ├── use-chart-of-accounts.tsx        # COA query with caching
│   ├── use-financial-statements.tsx     # Statement generation (SC-005: <5s)
│   └── use-accounting-periods.tsx       # Period management
├── lib/
│   ├── double-entry-validator.ts        # Validates debits = credits (FR-001, FR-002)
│   ├── journal-entry-builder.ts         # Builds entries from business events (FR-006)
│   ├── statement-generators/
│   │   ├── profit-loss-generator.ts     # P&L calculation logic
│   │   ├── balance-sheet-generator.ts   # Balance Sheet calculation
│   │   ├── cash-flow-generator.ts       # Indirect Method implementation
│   │   └── trial-balance-generator.ts   # Trial Balance calculation
│   └── migration/
│       ├── migrate-accounting-entries.ts # Big Bang migration (FR-025)
│       └── migration-report-generator.ts # Report skipped records (FR-025a)
└── types/
    └── index.ts                          # TypeScript interfaces for journal entries, COA

src/app/[locale]/accounting/
├── page.tsx                              # Dashboard landing page (FR-021, FR-022)
├── chart-of-accounts/page.tsx           # COA management
├── journal-entries/
│   ├── page.tsx                          # Journal entry list
│   ├── new/page.tsx                      # Manual entry form
│   └── [id]/page.tsx                     # Entry detail view
├── reports/
│   ├── profit-loss/page.tsx             # P&L report page
│   ├── balance-sheet/page.tsx           # Balance Sheet page
│   ├── cash-flow/page.tsx               # Cash Flow Statement page
│   └── trial-balance/page.tsx           # Trial Balance page
├── periods/page.tsx                      # Accounting period management
└── settings/
    └── currency-rates/page.tsx          # Manual exchange rate entry (FR-019a)

convex/
├── schema.ts                             # Add new tables (see data-model.md)
├── functions/
│   ├── journalEntries.ts                 # CRUD mutations + queries
│   ├── chartOfAccounts.ts                # COA mutations + queries
│   ├── accountingPeriods.ts              # Period management
│   ├── manualExchangeRates.ts            # Manual rate CRUD
│   ├── financialStatements.ts            # Statement generation queries
│   └── integrations/
│       ├── arReconciliationIntegration.ts # Hook: closePeriod → create entries (FR-015, FR-016)
│       ├── expenseClaimIntegration.ts     # Hook: approved → create entries (FR-006)
│       └── salesInvoiceIntegration.ts     # Hook: paid → create entries (FR-006)
└── migrations/
    └── migrateAccountingEntries.ts       # One-time migration (FR-025)

src/lib/services/currency-service.ts      # EXTEND: Add manual rate priority (FR-019a)

tests/
├── accounting/
│   ├── double-entry-validation.test.ts   # Test FR-001, FR-002 (debits = credits)
│   ├── journal-entry-creation.test.ts    # Test FR-006 (auto entries from events)
│   ├── financial-statements.test.ts      # Test FR-010, FR-011, FR-012, FR-013
│   └── migration.test.ts                 # Test FR-025, FR-025a (migration report)
└── integration/
    ├── ar-reconciliation-close.test.ts   # Test FR-015, FR-016 (period close → entries)
    └── expense-approval.test.ts          # Test expense approved → accounting entry
```

**Structure Decision**: Web application using Next.js App Router with domain-driven architecture. New `src/domains/accounting/` directory follows existing pattern (expense-claims, sales-invoices, analytics). Convex backend adds 5 new tables with real-time subscriptions for live dashboard updates.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**No constitution violations** - project does not have ratified constitution yet. However, documenting complexity decisions:

| Design Decision | Rationale | Simpler Alternative Rejected |
|-----------------|-----------|------------------------------|
| Separate `journal_entry_lines` table | Follows double-entry bookkeeping standard where one transaction creates multiple lines (debits/credits). Enables per-account queries for balance calculations | Single flattened `journal_entries` table with debit/credit columns - rejected because cannot support transactions with >2 accounts (e.g., platform sale: Dr. Cash, Dr. Platform Fees, Cr. Revenue, Cr. AR) |
| Indirect Method for Cash Flow | Industry standard (95%+ adoption). Calculates from P&L + Balance Sheet without separate tagging. Reconciles net income to cash flow for user understanding | Direct Method - rejected because requires tagging every transaction as operating/investing/financing, adds implementation complexity with marginal user benefit |
| Big Bang migration (skip bad records) | Current `accounting_entries` usage is limited. Acceptable to skip unmigrated records with report for manual review. Minimizes migration complexity and allows immediate system activation | Gradual migration with fallback - rejected because maintaining dual systems (old + new accounting) adds significant complexity for minimal benefit given low current usage |
| Finance Admin Only access model | Simplifies RBAC implementation. Most SMEs have 1-2 people managing accounting. Owner gets view-only access for financial oversight | Granular permissions (per-statement, per-account access) - rejected as over-engineering for SME needs where Finance Admin role is already well-defined |

## Phase 0: Research & Technical Decisions

**Prerequisites**: Spec clarified, plan template filled

**Unknowns to resolve**:
1. Convex table design for double-entry: How to model journal entries with balanced lines?
2. Financial statement calculation patterns: Query strategies for aggregating 2000+ entries in <5 seconds?
3. Integration hooks: How do AR reconciliation, expense claims, sales invoices trigger journal entry creation?
4. Migration strategy: Algorithm for converting single-entry `accounting_entries` to balanced double-entry format?
5. Manual exchange rate storage: Table schema for effective_date lookup with priority over API rates?

**Research tasks** (execute in parallel with Agent tool):

1. **Convex Schema for Double-Entry**:
   - Research: Survey double-entry accounting database schemas (QuickBooks, Xero, ERPNext)
   - Decision: Design `journal_entries` (header) + `journal_entry_lines` (debits/credits) pattern
   - Output: Schema design in `data-model.md` with indexes for performance

2. **Financial Statement Performance**:
   - Research: Convex aggregation patterns for large datasets, indexed queries, pagination strategies
   - Decision: Index strategy on (business_id, transaction_date, account_id) composite
   - Output: Query patterns in `research.md` with performance benchmarks

3. **Integration Hooks**:
   - Research: Convex mutation composition patterns, event-driven architecture in Convex
   - Decision: Direct mutation calls vs cron-based processing
   - Output: Integration patterns in `contracts/integration-hooks.md`

4. **Migration Algorithm**:
   - Research: Best practices for accounting data migration, balance validation, error reporting
   - Decision: Big Bang with skip bad records + detailed report (from clarification)
   - Output: Migration pseudocode in `research.md`

5. **Currency Rate Priority**:
   - Research: Existing `CurrencyService` code, rate resolution patterns
   - Decision: Extend `getCurrentRate()` with manual rate lookup first, then API fallback
   - Output: Code modification plan in `research.md`

**Output**: `research.md` with all technical decisions documented

## Phase 1: Data Model & API Contracts

**Prerequisites**: `research.md` complete

### Data Model Design

**Output**: `data-model.md` with Convex table schemas

**New Tables**:

1. **chart_of_accounts**
   - Fields: account_code, account_name, account_type, normal_balance, parent_account_id, is_active, business_id
   - Relationships: Self-referencing for hierarchy
   - Validation: account_code must be unique per business, account_type enum (Asset/Liability/Equity/Revenue/Expense)

2. **journal_entries**
   - Fields: entry_id, transaction_date, posting_date, description, status, source_type, source_id, business_id, created_by, created_at
   - Relationships: One-to-many with journal_entry_lines
   - Validation: status enum (draft/posted/reversed), source_type enum (sales_invoice/expense/ar_recon/manual)

3. **journal_entry_lines**
   - Fields: line_id, entry_id, account_id, debit_amount, credit_amount, line_description, line_order
   - Relationships: Many-to-one with journal_entries, many-to-one with chart_of_accounts
   - Validation: Either debit_amount OR credit_amount must be non-zero (not both). Per-entry sum(debit_amount) = sum(credit_amount)

4. **accounting_periods**
   - Fields: period_id, start_date, end_date, status, closed_by, closed_at, business_id
   - Validation: status enum (open/closed), no overlapping periods per business

5. **manual_exchange_rates**
   - Fields: rate_id, from_currency, to_currency, rate, effective_date, entered_by, reason, business_id, created_at
   - Validation: rate must be positive, effective_date not in future

**Indexes** (performance optimization for SC-005, SC-006):
- journal_entries: (business_id, transaction_date, status)
- journal_entry_lines: (entry_id, account_id)
- chart_of_accounts: (business_id, account_code), (business_id, is_active)
- accounting_periods: (business_id, status)
- manual_exchange_rates: (business_id, from_currency, to_currency, effective_date DESC)

### API Contracts

**Output**: `contracts/api-endpoints.yaml` (OpenAPI 3.0 spec)

**New REST API Endpoints**:

1. **Chart of Accounts**:
   - `GET /api/v1/accounting/chart-of-accounts` - List COA (FR-003)
   - `POST /api/v1/accounting/chart-of-accounts` - Create account (FR-004)
   - `PATCH /api/v1/accounting/chart-of-accounts/{id}` - Update account (FR-004)
   - `DELETE /api/v1/accounting/chart-of-accounts/{id}` - Deactivate account (FR-004)

2. **Journal Entries**:
   - `GET /api/v1/accounting/journal-entries` - List entries with pagination (FR-020a)
   - `POST /api/v1/accounting/journal-entries` - Create manual entry (FR-007)
   - `GET /api/v1/accounting/journal-entries/{id}` - Entry detail
   - `POST /api/v1/accounting/journal-entries/{id}/reverse` - Reverse entry (FR-009)

3. **Financial Statements**:
   - `GET /api/v1/accounting/statements/profit-loss` - P&L (FR-010)
   - `GET /api/v1/accounting/statements/balance-sheet` - Balance Sheet (FR-011)
   - `GET /api/v1/accounting/statements/trial-balance` - Trial Balance (FR-012)
   - `GET /api/v1/accounting/statements/cash-flow` - Cash Flow (FR-013)
   - `POST /api/v1/accounting/statements/export` - Export to Excel/PDF (FR-014)

4. **Accounting Periods**:
   - `GET /api/v1/accounting/periods` - List periods
   - `POST /api/v1/accounting/periods/{id}/close` - Close period (FR-018)

5. **Manual Exchange Rates**:
   - `GET /api/v1/accounting/currency-rates` - List manual rates
   - `POST /api/v1/accounting/currency-rates` - Create manual rate (FR-019a)
   - `PATCH /api/v1/accounting/currency-rates/{id}` - Update rate (FR-019a)
   - `DELETE /api/v1/accounting/currency-rates/{id}` - Delete rate

**Convex Mutations** (real-time):
- `journalEntries:create` - Create journal entry with balanced lines validation (FR-001, FR-002)
- `journalEntries:reverse` - Create reversing entry (FR-009)
- `chartOfAccounts:create`, `chartOfAccounts:update`, `chartOfAccounts:deactivate`
- `accountingPeriods:close` - Lock period and trigger integration hooks (FR-018)
- `manualExchangeRates:create`, `manualExchangeRates:update`

**Convex Queries** (real-time):
- `journalEntries:list` - Paginated query with filters (business_id, date_range, status)
- `financialStatements:profitLoss` - Aggregation query (FR-010)
- `financialStatements:balanceSheet` - Aggregation query (FR-011)
- `financialStatements:trialBalance` - Aggregation query (FR-012)
- `financialStatements:cashFlow` - Indirect Method calculation (FR-013)

### Integration Hooks

**Output**: `contracts/integration-hooks.md`

**AR Reconciliation Integration** (FR-015, FR-016):
- Hook point: `closePeriod` mutation in AR recon module
- Action: Call `arReconciliationIntegration:createJournalEntries(periodId)`
- Journal entries created:
  1. Platform fees: Dr. Platform Fees Expense (5xxx), Cr. Accounts Receivable (1xxx)
  2. Cash received: Dr. Cash/Bank (1xxx), Cr. Accounts Receivable (1xxx)
  3. If variance > 10%: Dr/Cr. AR Variance Adjustment (5xxx/4xxx)
- Update sales_invoices.status = 'paid' for matched orders

**Expense Claims Integration** (FR-006):
- Hook point: `updateExpenseClaim` mutation when status changes to 'approved'
- Action: Call `expenseClaimIntegration:createJournalEntry(claimId)`
- Journal entries created:
  1. Dr. Expense Account (5xxx category from claim), Cr. Accounts Payable (2xxx)
  2. When status = 'reimbursed': Dr. Accounts Payable (2xxx), Cr. Cash/Bank (1xxx)

**Sales Invoices Integration** (FR-006):
- Hook point: `updateInvoiceStatus` mutation when status changes to 'paid'
- Action: Call `salesInvoiceIntegration:createJournalEntry(invoiceId)`
- Journal entries created:
  1. On invoice created: Dr. Accounts Receivable (1xxx), Cr. Sales Revenue (4xxx)
  2. On payment: Dr. Cash/Bank (1xxx), Cr. Accounts Receivable (1xxx)

### Quickstart Guide

**Output**: `quickstart.md` - Developer guide for working with accounting module

**Contents**:
1. Local setup: Convex dev server, schema deployment
2. Test data seeding: Default COA, sample transactions
3. Testing flows: Manual entry, AR recon integration, statement generation
4. UAT test accounts: Finance Admin, Owner (view-only), Manager (blocked)
5. Performance testing: Generate 2000 transactions, verify <5s statement generation

### Agent Context Update

Run `.specify/scripts/bash/update-agent-context.sh claude` to add new accounting module technologies to CLAUDE.md.

## Phase 2: Task Generation

**Not covered by `/speckit.plan`** - see `/speckit.tasks` command

Will generate dependency-ordered tasks in `tasks.md` covering:
- Phase 1: Database schema + migrations
- Phase 2: Convex backend (mutations, queries, integrations)
- Phase 3: Frontend components (dashboard, forms, statements)
- Phase 4: Integration hooks (AR recon, expenses, invoices)
- Phase 5: UAT testing + performance validation

## Migration Strategy

**One-time migration from `accounting_entries` to `journal_entries` + `journal_entry_lines`**:

**Algorithm** (FR-025, FR-025a):
```
For each record in accounting_entries WHERE deleted_at IS NULL:
  1. Validate required fields exist (amount, transaction_type, category, transaction_date)
  2. Map transaction_type to account:
     - 'Income' → Revenue account (4xxx) from category mapping
     - 'Expense' → Expense account (5xxx) from category mapping
     - 'Cost of Goods Sold' → COGS account (5xxx) from category mapping
  3. Create balanced journal entry:
     - If 'Income': Dr. Accounts Receivable (1200), Cr. Revenue (4xxx)
     - If 'Expense' OR 'COGS': Dr. Expense/COGS (5xxx), Cr. Accounts Payable (2100)
  4. If status = 'paid':
     - Income: Dr. Cash (1000), Cr. Accounts Receivable (1200)
     - Expense: Dr. Accounts Payable (2100), Cr. Cash (1000)
  5. Link to original: source_type = 'migrated', source_id = accounting_entries.id

  Error handling:
  - Missing required fields → Skip record, log to migration_report
  - Invalid category → Skip record, log to migration_report
  - Cannot balance entry → Skip record, log to migration_report

After migration:
  - Generate migration_report.json:
    { skipped_records: [{id, reason, original_data}], migrated_count, error_count }
  - Store report in Convex: migration_reports table
  - Notify Finance Admin via email + in-app notification
```

**Migration report UI** (FR-025a):
- `/en/accounting/migration/report` page
- Display skipped records in table: ID, Date, Amount, Category, Reason
- Actions: Download report as CSV, "Fix and Re-import" button (manual data entry)

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Migration data loss (invalid records) | High | Generate detailed report (FR-025a). Finance Admin reviews skipped records. Low current usage minimizes impact |
| Performance degradation (statement generation >5s) | Medium | Implement indexed queries on (business_id, transaction_date, account_id). Test with 2000 transactions/month dataset. Add pagination for year-to-date views |
| Integration breakage (AR recon, expenses don't create entries) | High | Comprehensive integration tests. Test each hook independently. UAT test full workflows before deployment |
| Unbalanced entries bypass validation | High | Multi-layer validation: Zod schema at frontend, mutation validation at Convex, database constraint on total debits = total credits. Add monitoring alert for unbalanced entries |
| User confusion (non-accountants can't use system) | Medium | Implement simplified mode toggle (FR-023, FR-024). Provide tooltips and help text. Owner gets read-only dashboard with plain language |
| Exchange rate API downtime | Low | Existing CurrencyService has fallback to hardcoded rates. Manual rates take priority (FR-019a). Display rate source for transparency |

## Success Metrics (from spec.md)

- **SC-001**: 100% of journal entries balance (enforced by validation)
- **SC-002**: Trial balance sums to zero (tested in UAT)
- **SC-003**: Balance sheet satisfies Assets = Liabilities + Equity (tested in UAT)
- **SC-005**: Financial statements generate in <5 seconds (load tested with 24k entries)
- **SC-006**: Dashboard loads in <1 second (tested with 2000 transactions)
- **SC-011**: Migration completes with report of skipped records (validated in migration script)
- **SC-013**: Multi-currency transactions use correct exchange rates (tested with manual rates)
- **SC-014**: Cash Flow reconciles to P&L with 100% accuracy (validated in unit tests)

## Next Steps

1. **Execute Phase 0**: Generate `research.md` with parallel Agent tasks
2. **Execute Phase 1**: Generate `data-model.md`, `contracts/`, `quickstart.md`
3. **Update Agent Context**: Run agent context script to add technologies to CLAUDE.md
4. **Re-evaluate Constitution**: Check if any new complexity added during research/design
5. **Proceed to `/speckit.tasks`**: Generate dependency-ordered task breakdown
6. **Proceed to `/speckit.implement`**: Execute tasks with RED-GREEN-REFACTOR cycle
7. **UAT Testing**: Use `.env.local` test accounts to validate all user stories
8. **Deployment**: Merge to main after all tests pass

---

**Plan Status**: ✅ Ready for Phase 0 Research
**Estimated Duration**: 8-10 days (2 days research, 2 days backend, 3 days frontend, 1 day integration, 2 days UAT)
**Complexity**: High (new domain, financial compliance, data migration, multi-module integration)

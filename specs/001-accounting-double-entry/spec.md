# Feature Specification: Double-Entry Accounting System with Modern UX

**Feature Branch**: `001-accounting-double-entry`
**Created**: 2026-03-13
**Status**: Draft
**Input**: User description: "Revamp accounting system with double-entry bookkeeping and modern UX - proper GAAP/IFRS/MAS-8 compliant financial reporting with chart of accounts, automated journal entries, financial statements, AR reconciliation integration, and user-friendly dashboard replacing current table view"

## Clarifications

### Session 2026-03-12

- Q: Who can access the accounting module and what permissions do they have? (Roles: Owner, Finance Admin, Manager, Employee) → A: Finance Admin Only model - Finance Admin has full access (view/edit/post/manage COA/close periods). Owner can view reports only (no edit). Manager and Employee are blocked from accounting module entirely.
- Q: What happens during one-time data migration if some old accounting_entries records can't be converted to double-entry format? → A: Big Bang - Skip Bad Records. Migration script converts valid records and skips broken records (logs them). Generate migration report showing skipped records for review. User/Finance Admin can decide whether to fix or permanently delete skipped records. (Note: Limited active usage currently, acceptable to skip/delete bad records)
- Q: Where should the system source exchange rates for currency conversion? → A: Hybrid approach - API default + Finance Admin manual override. System uses existing CurrencyService (ExchangeRate-API.com free tier) for automated daily rates. Finance Admin can optionally enter manual rates for specific currency pairs (effective date) which take precedence over API rates. This provides compliance flexibility for businesses requiring official bank rates or government-mandated rates (e.g., Bank Negara Malaysia rates) while maintaining automation for most transactions.
- Q: What is the expected monthly transaction volume for a typical business using this system? → A: Medium volume (500-2000 transactions/month). Typical SME scale covering: 50-100 sales invoices, 100-200 expense claims, 50-100 vendor payments, 200-500 platform orders for e-commerce. This volume allows simple queries for single-period views but requires indexed queries and pagination for year-to-date reports (12k-24k annual transactions). Performance optimization targets: dashboard aggregation <1 second, financial statement generation <5 seconds with proper database indexing.
- Q: Which Cash Flow Statement method should the system use (Direct vs Indirect)? → A: Indirect Method. Industry-standard approach used by 95%+ of businesses globally. Starts with Net Income from P&L, adjusts for non-cash items (depreciation, amortization), and adjusts for changes in working capital (AR, AP, inventory). Easier implementation - calculates from existing P&L and Balance Sheet data without requiring separate cash flow tags on every transaction. Accepted by IFRS, GAAP, and MAS-8. Shows reconciliation between profit and cash flow, helping users understand why profit ≠ cash.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Accurate Financial Statements (Priority: P1)

As a business owner or accountant, I need to view accurate Profit & Loss statements and Balance Sheets that comply with Malaysia Accounting Standards (MAS-8), IFRS, and GAAP so I can make informed business decisions, file tax returns, and present financials to stakeholders.

**Why this priority**: Financial reporting is the core purpose of an accounting system. Without accurate, compliant statements, the business cannot operate legally or make sound financial decisions. This is the minimum viable product.

**Independent Test**: Can be fully tested by creating sample transactions (revenue, expenses, assets, liabilities) and verifying that:
1. Generated P&L shows correct Revenue - Expenses = Net Profit/Loss
2. Balance Sheet satisfies the accounting equation (Assets = Liabilities + Equity)
3. Trial balance sums match (total debits = total credits)
4. Statements can be exported to Excel/PDF for external use

**Acceptance Scenarios**:

1. **Given** business has recorded transactions over the past month, **When** user navigates to "Profit & Loss" report and selects date range, **Then** system displays revenue, expenses, and net profit/loss grouped by category with accurate totals
2. **Given** financial statements need to be shared externally, **When** user clicks "Export", **Then** system generates downloadable Excel/PDF file with properly formatted P&L and Balance Sheet
3. **Given** user wants to review account balances, **When** user views Trial Balance, **Then** system displays all accounts with debit and credit totals that balance to zero
4. **Given** business operates in multiple currencies, **When** viewing financial statements, **Then** amounts are displayed in home currency with exchange rate information

---

### User Story 2 - Record Business Transactions Properly (Priority: P2)

As a business user (accountant or admin), I need to record business transactions (sales, expenses, payments) using proper double-entry accounting so that every transaction maintains balanced books and creates an audit trail.

**Why this priority**: This is the foundation that enables User Story 1. Without proper transaction recording, financial statements cannot be accurate. However, it's P2 because we could theoretically import pre-recorded transactions first to test P1.

**Independent Test**: Can be fully tested by recording various transaction types and verifying:
1. Every transaction creates balanced journal entries (debit amount = credit amount)
2. System prevents posting unbalanced entries
3. Transactions appear in correct accounts in the chart of accounts
4. User can reverse incorrect entries without deleting original records

**Acceptance Scenarios**:

1. **Given** business makes a sale, **When** user records a sales transaction, **Then** system automatically creates journal entry debiting Accounts Receivable and crediting Sales Revenue
2. **Given** business pays an expense, **When** user records payment, **Then** system creates journal entry debiting Expense account and crediting Cash account
3. **Given** user attempts to post unbalanced entry, **When** debits don't equal credits, **Then** system displays error message and prevents posting until balanced
4. **Given** user recorded transaction incorrectly, **When** user initiates reversal, **Then** system creates reversing journal entry (opposite debits/credits) and links to original
5. **Given** business receives platform payment (e-commerce), **When** recording settlement, **Then** system creates entries for cash received, platform fees deducted, and accounts receivable cleared

---

### User Story 3 - Manage Chart of Accounts (Priority: P3)

As an accountant or finance manager, I need to set up and customize our chart of accounts (COA) so that financial transactions are categorized correctly according to our business structure and industry standards.

**Why this priority**: While important for proper categorization, the system could function with a default chart of accounts. Customization is valuable but not essential for MVP.

**Independent Test**: Can be fully tested by:
1. Viewing default chart of accounts with standard account categories
2. Adding custom accounts under appropriate categories
3. Activating/deactivating accounts based on business needs
4. Verifying transactions use correct accounts from COA

**Acceptance Scenarios**:

1. **Given** new business starting from scratch, **When** user accesses accounting system, **Then** system provides default chart of accounts with standard account categories (Assets 1000-1999, Liabilities 2000-2999, Equity 3000-3999, Revenue 4000-4999, Expenses 5000-5999)
2. **Given** business needs industry-specific account, **When** user creates new account under appropriate category, **Then** system assigns account code and makes it available for transactions
3. **Given** account is no longer needed, **When** user deactivates account, **Then** account is hidden from transaction entry but historical data remains accessible
4. **Given** business uses sub-accounts, **When** user creates parent-child account structure, **Then** system supports hierarchical reporting with roll-up totals

---

### User Story 4 - AR Reconciliation Integration (Priority: P3)

As an e-commerce business using platforms like Shopee/Lazada, I need to reconcile my sales orders against sales invoices and automatically post the proper accounting entries when I close the reconciliation period, so that platform fees are tracked and cash received is recorded correctly.

**Why this priority**: This is specific to e-commerce businesses with AR reconciliation needs. Service-based businesses or those without platform sales can skip this entirely. However, it's critical for the e-commerce segment.

**Independent Test**: Can be fully tested by:
1. Creating sales invoice (posts: Dr. AR, Cr. Revenue)
2. Importing platform sales statement
3. Matching order to invoice in AR recon module
4. Closing reconciliation period
5. Verifying three accounting entries are created automatically:
   - Platform fees (Dr. Platform Fees Expense, Cr. AR)
   - Cash received (Dr. Cash, Cr. AR)
   - Original AR is cleared

**Acceptance Scenarios**:

1. **Given** e-commerce order matched to invoice in AR recon, **When** user closes reconciliation period, **Then** system creates journal entry debiting Platform Fees Expense and crediting Accounts Receivable for fees amount
2. **Given** reconciliation period closed with matched orders, **When** entries are posted, **Then** system creates journal entry debiting Cash/Bank and crediting Accounts Receivable for net amount received
3. **Given** matched order has variance (order amount ≠ invoice amount), **When** closing period, **Then** system creates adjustment entry for difference and flags for review
4. **Given** service business without e-commerce, **When** sales invoice is marked "paid" manually, **Then** system creates simple journal entry (Dr. Cash, Cr. AR) without platform fee complexity

---

### User Story 5 - User-Friendly Dashboard View (Priority: P3)

As a business owner who is not an accountant, I need to see my financial health at a glance with visual charts and simplified language (not accounting jargon) so I can understand my business performance without technical training.

**Why this priority**: UX improvement is valuable but the accounting system can function with technical terminology for trained users. This expands usability to non-accountants but isn't essential for core functionality.

**Independent Test**: Can be fully tested by:
1. Viewing dashboard and verifying key metrics are displayed (revenue, expenses, net profit, cash balance)
2. Checking that charts visualize trends over time
3. Confirming language is simplified ("Money In" instead of "Debit Cash")
4. Testing that accountant mode toggle switches to technical terminology

**Acceptance Scenarios**:

1. **Given** user accesses accounting module, **When** dashboard loads, **Then** system displays cards showing current month revenue, expenses, net profit/loss, cash balance, accounts receivable, and accounts payable
2. **Given** user wants to understand trends, **When** viewing dashboard, **Then** system displays line chart comparing revenue vs expenses over last 6 months
3. **Given** non-accountant user recording transaction, **When** interface prompts for details, **Then** labels use simplified language ("Money received" not "Debit Cash", "Money spent" not "Credit Cash")
4. **Given** trained accountant needs technical view, **When** user toggles "Accountant Mode", **Then** interface switches to standard debit/credit terminology with account codes visible
5. **Given** user wants quick actions, **When** viewing dashboard, **Then** prominent buttons are available for "Record Sale", "Record Expense", "View P&L", "View Balance Sheet"

---

### Edge Cases

- **What happens when fiscal year closes?** System should allow year-end closing process that transfers net profit/loss to retained earnings and opens new fiscal year while maintaining historical data access
- **How does system handle transactions spanning multiple accounting periods?** System should record transactions in the period they occurred (transaction date) and prevent modifying closed periods without proper authorization
- **What happens when user tries to delete a transaction that's part of closed period?** System prevents deletion and requires formal reversal entry to maintain audit trail
- **How does system handle currency exchange rate changes?** System records transactions at exchange rate on transaction date (API rate or manual override if exists). For transactions on effective date of manual rate entry, system uses manual rate. Finance Admin can update manual rates for future transactions but cannot retroactively change rates for posted transactions (requires reversal and re-entry). System tracks unrealized gains/losses for foreign currency accounts at period-end using current rates
- **What happens when AR reconciliation finds no matching invoice?** Order remains unmatched with status "disputed" and must be resolved manually before period can be closed
- **How does system handle partial payments?** System creates partial journal entries and maintains outstanding balance in AR/AP accounts until fully paid
- **What happens when data migration encounters invalid records?** Migration script converts valid records and skips broken records (cannot convert to double-entry format). System generates migration report listing all skipped records with specific failure reasons. Finance Admin reviews report and decides whether to fix and manually re-import skipped records or permanently delete them as corrupt data. New accounting system becomes active immediately with successfully migrated records.
- **What happens when ExchangeRate-API.com is down?** System falls back to hardcoded rates stored in CurrencyService. If manual rate exists for currency pair, manual rate takes precedence regardless of API status. UI displays rate source (API/Manual/Fallback) for transparency
- **What happens when transaction volume exceeds 5000/month?** System performance may degrade for year-to-date reports (>60k entries). Recommended solutions: (1) Increase pagination page size limits, (2) Add database partitioning by accounting_period, (3) Implement materialized views for common aggregations. Finance Admin receives performance warning when monthly volume exceeds 3000 transactions
- **How does Cash Flow Statement handle non-cash transactions like depreciation or barter?** Indirect Method automatically handles non-cash items by adding them back to Net Income in Operating Activities section (since they reduced net income but didn't use cash). Example: Depreciation Expense reduces Net Income but is added back in cash flow as "+Depreciation". Barter transactions (debit Asset, credit Revenue) show as negative adjustment in working capital changes. System identifies non-cash items by analyzing journal entries where no Cash/Bank account is involved

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST implement double-entry bookkeeping where every transaction creates balanced journal entries (total debits = total credits)
- **FR-002**: System MUST prevent posting any journal entry where debits do not equal credits
- **FR-003**: System MUST provide a default chart of accounts organized by standard categories: Assets (1000-1999), Liabilities (2000-2999), Equity (3000-3999), Revenue (4000-4999), Expenses (5000-5999)
- **FR-004**: Users MUST be able to customize chart of accounts by adding, modifying, or deactivating accounts while preserving historical transaction data
- **FR-005**: System MUST support hierarchical chart of accounts with parent-child account relationships and roll-up totals
- **FR-006**: System MUST automatically create journal entries when business events occur: sales invoice sent (Dr. AR, Cr. Revenue), expense approved (Dr. Expense, Cr. AP), payment made (Dr. AP, Cr. Cash), payment received (Dr. Cash, Cr. AR)
- **FR-007**: System MUST allow users to manually record transactions through a guided wizard that ensures entries balance before posting
- **FR-008**: System MUST provide common transaction templates for: sales, purchases, payments, receipts, and adjustments
- **FR-009**: System MUST support reversing entries to correct mistakes without deleting original transactions, maintaining full audit trail
- **FR-010**: System MUST generate Profit & Loss statement showing: Revenue - Expenses = Net Profit/Loss, grouped by account category, for user-selected date range
- **FR-011**: System MUST generate Balance Sheet showing: Assets = Liabilities + Equity, with current vs non-current classification, as of specified date
- **FR-012**: System MUST generate Trial Balance listing all accounts with debit and credit totals that sum to zero
- **FR-013**: System MUST generate Cash Flow Statement using Indirect Method showing three sections: (1) Operating Activities - starts with Net Income, adjusts for non-cash items (depreciation/amortization), adjusts for working capital changes (AR/AP/inventory), (2) Investing Activities - capital expenditures and asset sales, (3) Financing Activities - loans, equity, dividends. Calculation derives from P&L and Balance Sheet changes without requiring separate cash flow tags on transactions
- **FR-014**: Users MUST be able to export financial statements to Excel and PDF formats
- **FR-015**: System MUST integrate with AR reconciliation module such that closing a reconciliation period creates three journal entries: platform fees expense, bank deposit, and AR clearance
- **FR-016**: System MUST update sales invoice status to "paid" when corresponding order is reconciled and period is closed
- **FR-017**: System MUST handle variance between order amount and invoice amount by creating adjustment entries and flagging for manual review if variance exceeds 10% (industry standard for SME e-commerce AR reconciliation - balances accuracy with practical platform fee/rounding variations)
- **FR-017a**: System MUST display the 10% variance threshold to users in the AR reconciliation UI with explanation: "Variances under 10% are auto-adjusted. Larger variances are flagged for your review to ensure accuracy."
- **FR-018**: System MUST prevent modification or deletion of transactions in closed accounting periods, requiring formal reversal process
- **FR-019**: System MUST support multiple currencies with exchange rate tracking on transaction date. Exchange rates are sourced via hybrid approach: (1) Automated daily fetch from ExchangeRate-API.com free tier via existing CurrencyService, (2) Finance Admin can manually enter rates for specific currency pairs with effective dates that override API rates, (3) System falls back to hardcoded rates if both API and manual rates unavailable
- **FR-019a**: System MUST provide Finance Admin interface to enter manual exchange rates (from_currency, to_currency, rate, effective_date) which take precedence over API rates for transactions on or after the effective date. Use case: businesses requiring Bank Negara Malaysia official rates or other government-mandated exchange rates for compliance
- **FR-020**: System MUST maintain audit trail showing: who created/modified transactions, when, and what changed
- **FR-020a**: System MUST implement pagination for transaction lists and reports when viewing year-to-date data (>1000 entries). Default page size: 50 entries. Financial statement generation (P&L, Balance Sheet) processes full dataset without pagination but uses indexed aggregation queries
- **FR-021**: System MUST display dashboard with key financial metrics: current month revenue, expenses, net profit/loss, cash balance, accounts receivable, accounts payable
- **FR-022**: System MUST provide visual charts on dashboard: revenue vs expenses trend (line chart), expense breakdown by category (pie chart), cash flow over time (bar chart)
- **FR-023**: System MUST use simplified language for non-accountant users ("Money In" instead of "Debit Cash", "Money Owed to Us" instead of "Accounts Receivable")
- **FR-024**: System MUST provide toggle for "Accountant Mode" that switches interface to technical accounting terminology (debit/credit, account codes)
- **FR-025**: System MUST support data migration from existing accounting_entries table to new journal_entries structure, converting valid records and skipping records that cannot be converted to balanced double-entry format
- **FR-025a**: Migration process MUST generate detailed report listing all skipped records with specific failure reasons (e.g., "missing amount", "invalid transaction type", "unbalanced entry"). Report must be accessible to Finance Admin for review and decision on whether to fix or delete skipped records
- **FR-026**: System MUST enforce role-based access control: Finance Admin has full access (view/edit/post entries/manage COA/close periods), Owner has view-only access to all reports and financial statements, Manager and Employee roles are blocked from accessing accounting module entirely

### Key Entities

- **Chart of Accounts**: Organizational structure categorizing all accounts used in the business. Each account has: unique code, name, type (Asset/Liability/Equity/Revenue/Expense), normal balance (debit/credit), parent account (for hierarchy), active status
- **Journal Entry**: Complete accounting transaction representing a business event. Contains: unique entry ID, transaction date, posting date, description, status (draft/posted/reversed), source document type (sales invoice, expense, AR recon, manual), link to source record, business_id (for multi-tenancy). Expected volume: 500-2000 entries per month per business. Requires composite index on (business_id, transaction_date, status) for efficient querying
- **Journal Entry Line**: Individual debit or credit within a journal entry. Contains: account reference, debit amount, credit amount, line description, line order. Multiple lines make up one complete journal entry. Expected volume: 2-5 lines per entry average (1000-10000 lines per month). Requires index on (journal_entry_id, account_id) for account balance queries
- **Financial Statement**: Generated report from journal entry data. Types include: Profit & Loss (revenue vs expenses over period), Balance Sheet (assets vs liabilities+equity at point in time), Cash Flow Statement using Indirect Method (reconciles Net Income to Operating Cash Flow by adjusting for non-cash items and working capital changes, plus Investing and Financing sections), Trial Balance (all accounts with balances). Cash flow calculated from P&L + balance sheet changes without separate transaction tagging
- **Accounting Period**: Time period for financial reporting (month, quarter, year). Periods can be open (accepting transactions) or closed (locked for historical integrity)
- **Manual Exchange Rate**: Finance Admin-defined exchange rate override for compliance. Contains: from_currency, to_currency, rate, effective_date, entered_by (Finance Admin user), reason for manual entry. Takes precedence over API rates for transactions on/after effective date
- **Audit Log**: Immutable record of all transaction creation, modification, reversal activities with user identity and timestamp

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of journal entries must balance (total debits = total credits) - system prevents posting any unbalanced entry
- **SC-002**: Trial balance must always sum to zero (total debits - total credits = 0)
- **SC-003**: Balance sheet must satisfy accounting equation (Assets = Liabilities + Equity) with zero variance
- **SC-004**: Profit & Loss statement net profit/loss must equal the change in equity between two balance sheet dates (excluding owner contributions/distributions)
- **SC-005**: Users can generate a complete set of financial statements (P&L, Balance Sheet, Cash Flow, Trial Balance) in under 5 seconds for any date range. Performance tested with 2000 transactions/month dataset (24k annual entries). Achievable with indexed queries on (business_id, transaction_date, account_id)
- **SC-006**: Dashboard loads and displays key financial metrics in under 1 second. Performance tested with current month data (~500-2000 transactions). Achievable with aggregation queries using indexed fields
- **SC-007**: 90% of users can successfully record a common transaction (sale, expense, payment) in under 2 minutes without training
- **SC-008**: Users can export financial statements to Excel/PDF in under 10 seconds
- **SC-009**: When AR reconciliation period closes, accounting entries are created automatically within 5 seconds
- **SC-010**: System prevents 100% of attempts to modify closed accounting periods without proper reversal process
- **SC-011**: Data migration from old accounting_entries to new journal_entries structure completes with all valid records successfully converted to balanced entries. Migration report identifies any skipped records (unable to convert) with specific error reasons. System becomes operational immediately with migrated data.
- **SC-012**: Non-accountant users report understanding their business financial health after viewing dashboard (measured by ability to answer: "Is your business profitable this month?", "What is your largest expense category?", "How much cash do you have?")
- **SC-013**: Multi-currency transactions use correct exchange rates: API-sourced rates load within 5 seconds, Finance Admin can enter manual rates in under 1 minute, manual rates take precedence over API rates for transactions on/after effective date with 100% accuracy
- **SC-014**: Cash Flow Statement (Indirect Method) reconciles to P&L with 100% accuracy: Operating Cash Flow = Net Income + Non-cash Adjustments ± Working Capital Changes. Statement generation completes in under 5 seconds for any date range (tested with 2000 transactions/month dataset)

### Quality Attributes

- **Compliance**: System follows Malaysia Accounting Standards (MAS-8), IFRS, and GAAP principles for revenue recognition (accrual basis), expense matching, and financial statement presentation
- **Data Integrity**: All financial data maintains referential integrity - every journal entry links to source document, every line references valid chart of account, all entries maintain balanced state
- **Auditability**: Complete audit trail enables external auditors to trace any balance in financial statements back to original source transaction
- **Usability**: Non-accounting users can complete common tasks without training, while accounting professionals have access to full technical detail when needed

## Assumptions

1. Businesses using this system want to comply with recognized accounting standards (GAAP/IFRS/MAS-8) rather than simplified cash-basis accounting
2. Existing accounting_entries table contains reasonably clean data that can be migrated to double-entry format (may require data cleanup phase)
3. E-commerce businesses using AR reconciliation are primarily on Southeast Asian platforms (Shopee, Lazada, TikTok Shop, Grab, Foodpanda)
4. Users have basic understanding of financial concepts even if not trained accountants (understand revenue, expenses, profit, cash flow at high level)
5. Mobile app will initially show read-only view of financial statements; full transaction entry will remain web-only until Phase 2
6. System will use business's home currency as the default; multi-currency is a supported feature but not required for all users
7. Integration with external accounting software (Xero, QuickBooks, SQL Account) will be via CSV export in Phase 1; API integration is Phase 2
8. Tax calculation (GST/SST) will be added as Phase 2 feature; Phase 1 focuses on core accounting functionality
9. Historical data before migration date will remain in old accounting_entries table and be accessible via separate "Historical Records" view; only new transactions use double-entry system
10. Target businesses process 500-2000 transactions per month (typical SME scale). Businesses exceeding 5000 transactions/month may require performance optimization (database partitioning, materialized views) in future phases

## Dependencies

1. **AR Reconciliation Module**: Must provide hooks/events when reconciliation period is closed so accounting system can create proper journal entries
2. **Sales Invoices Module**: Must trigger accounting events when invoice is created, sent, or marked paid so proper revenue/AR entries are generated
3. **Expense Claims Module**: Must trigger accounting events when expense is approved, reimbursed, or rejected so proper expense/AP entries are generated
4. **User Permissions System**: Accounting module will require role-based permissions with Finance Admin Only model - Finance Admin has full access (view/edit/post entries/manage COA/close periods), Owner has view-only access to reports, Manager and Employee are blocked from accounting module access
5. **CurrencyService**: Existing service at src/lib/services/currency-service.ts provides automated exchange rates via ExchangeRate-API.com (free tier). Accounting system will extend this with manual rate override capability stored in new manual_exchange_rates table. Rate resolution priority: manual rates → API rates → fallback rates

## Out of Scope

- Bank reconciliation module (match bank statements to cash account entries) - planned for Phase 2
- Budget vs Actual comparison and variance analysis - Phase 2
- Cost center / department tracking for internal management reporting - Phase 2
- Inventory accounting (FIFO/LIFO/weighted average costing) - Phase 3
- Fixed asset depreciation calculation and tracking - Phase 3
- Payroll integration and payroll liability tracking - Phase 3
- Direct API integration with Xero/QuickBooks/SQL Account (Phase 1 uses CSV export only)
- GST/SST tax calculation and filing - Phase 2
- Consolidated financial statements for multi-entity businesses - Phase 4
- Advanced financial analysis (ratio analysis, trend forecasting, what-if scenarios) - Phase 4

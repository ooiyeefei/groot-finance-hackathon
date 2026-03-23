# Feature Specification: Auto-Generated Financial Statements

**Feature Branch**: `033-fin-statements-gen`
**Created**: 2026-03-23
**Status**: Draft
**Input**: GitHub Issue #341 — Auto-generated Financial Statements (P&L, Balance Sheet, Trial Balance, Cash Flow)
**Parent**: Continues from #285 (Revamp Accounting System) — Phase 1D

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generate Trial Balance (Priority: P1)

As a business owner or finance admin, I want to generate a trial balance for any date range so I can verify that my books are balanced and review account-level totals.

**Why this priority**: The trial balance is the foundation of all other financial statements. It validates data integrity (total debits = total credits) and provides the raw account balances that P&L, Balance Sheet, and Cash Flow are derived from. Without a correct trial balance, no other report can be trusted.

**Independent Test**: Can be fully tested by selecting a date range and generating a report that lists every account with its debit/credit totals. Delivers immediate value — users can verify their books balance without manually summing journal entries.

**Acceptance Scenarios**:

1. **Given** a business with posted journal entries, **When** the user selects a date range and generates a trial balance, **Then** the system displays every account that had activity in the period, showing account code, account name, total debits, total credits, and net balance.
2. **Given** a correctly maintained set of journal entries, **When** the trial balance is generated, **Then** the total of all debit balances MUST equal the total of all credit balances (fundamental accounting identity).
3. **Given** a trial balance is displayed, **When** the user clicks "Export PDF" or "Export CSV", **Then** the report is downloaded in the selected format with business name, report title, date range, and generation timestamp.
4. **Given** a business with no journal entries in the selected period, **When** the user generates a trial balance, **Then** the system shows a clear empty state message ("No journal entries found for this period").

---

### User Story 2 - Generate Profit & Loss Statement (Priority: P1)

As a business owner, I want to generate a Profit & Loss (Income) statement so I can understand my revenue, expenses, and net profit/loss for a given period.

**Why this priority**: P&L is the most frequently reviewed financial statement for SMEs — owners need to know if they're making or losing money. It directly informs business decisions on spending, pricing, and growth.

**Independent Test**: Can be tested by generating a P&L for a period that has both revenue (4xxx accounts) and expense (5xxx-6xxx accounts) entries. The report should show categorized line items and a clear net profit/loss figure.

**Acceptance Scenarios**:

1. **Given** journal entries exist for revenue and expense accounts, **When** the user generates a P&L for a date range, **Then** the report shows: Revenue section (4xxx accounts grouped), Cost of Goods Sold section (5xxx accounts grouped), Gross Profit (Revenue - COGS), Operating Expenses section (6xxx accounts grouped), and Net Profit/Loss (Gross Profit - Operating Expenses).
2. **Given** a P&L is displayed, **When** the user enables period comparison, **Then** the report shows the current period alongside a comparison period (e.g., previous month or same month last year) with variance amounts and percentages.
3. **Given** the P&L is generated, **When** the user clicks on an account group or line item, **Then** the system expands to show individual account breakdowns within that group.
4. **Given** a P&L is displayed, **When** the user exports to PDF, **Then** the document follows standard accounting report format with headers, sections, subtotals, and a clear Net Profit/Loss line.

---

### User Story 3 - Generate Balance Sheet (Priority: P1)

As a business owner or CFO, I want to generate a balance sheet so I can see the financial position of my business — what we own, what we owe, and our equity — at a specific point in time.

**Why this priority**: The balance sheet is one of the three core financial statements required for any business. It validates the fundamental accounting equation (Assets = Liabilities + Equity) and provides a snapshot of financial health needed for loan applications, investor reporting, and regulatory compliance.

**Independent Test**: Can be tested by generating a balance sheet for a date with existing asset, liability, and equity account entries. The report must satisfy A = L + E.

**Acceptance Scenarios**:

1. **Given** journal entries exist for asset, liability, and equity accounts, **When** the user generates a balance sheet as of a specific date, **Then** the report shows: Assets section (1xxx accounts, classified as Current and Non-Current), Liabilities section (2xxx accounts, classified as Current and Non-Current), Equity section (3xxx accounts), and Total Assets MUST equal Total Liabilities + Total Equity.
2. **Given** the balance sheet is generated, **When** the accounting equation does not balance (due to data issues), **Then** the system displays a prominent warning indicating the imbalance amount and suggests the user review journal entries.
3. **Given** a balance sheet is displayed, **When** the user exports to PDF, **Then** the document shows the "as of" date (not a range), standard classification headers, subtotals for each section, and the balancing equation verification at the bottom.

---

### User Story 4 - Generate Cash Flow Statement (Priority: P2)

As a business owner, I want to see a simplified cash flow statement so I can understand where cash came from and where it went during a period.

**Why this priority**: While critical for financial completeness, a simplified cash flow statement is derived from journal entries involving the Cash account (1000). It is lower priority than P&L and Balance Sheet because those statements are more immediately actionable for SME decision-making. The cash flow statement adds value for businesses tracking liquidity.

**Independent Test**: Can be tested by generating the report for a period with cash inflows (revenue receipts, loan proceeds) and outflows (expense payments, asset purchases). The net change in cash should match the difference in Cash account balance between period start and end.

**Acceptance Scenarios**:

1. **Given** journal entries involving the Cash account (1000) exist, **When** the user generates a cash flow statement for a date range, **Then** the report shows: Operating Activities (cash from sales minus cash for expenses), Investing Activities (cash for asset purchases/sales), Financing Activities (cash from loans/equity), Net Change in Cash, and Opening/Closing Cash Balances.
2. **Given** the cash flow statement is generated, **When** the Net Change in Cash is added to the Opening Balance, **Then** it MUST equal the Closing Cash Balance (mathematical integrity check).
3. **Given** a cash flow statement is displayed, **When** the user exports to PDF, **Then** the document follows the simplified direct method format with clear section totals.

---

### User Story 5 - Period Filtering and Navigation (Priority: P1)

As a user, I want to quickly filter any financial report by common time periods and custom date ranges so I can analyze my finances for the specific timeframe I need.

**Why this priority**: Period filtering is a shared capability that all four statements depend on. Without it, reports are unusable. Common presets (This Month, Last Month, This Quarter, This Year, Custom Range) eliminate friction and make reports instantly actionable.

**Independent Test**: Can be tested on any single report type — selecting different periods should update the report data accordingly.

**Acceptance Scenarios**:

1. **Given** any financial report page, **When** the user opens the period selector, **Then** they see preset options: This Month, Last Month, This Quarter, Last Quarter, This Financial Year, Last Financial Year, and Custom Date Range.
2. **Given** the user selects "Custom Date Range", **When** they pick a start and end date, **Then** the report regenerates for the selected range.
3. **Given** the user switches between periods, **When** the new period is selected, **Then** the report updates without a full page reload, with a loading indicator during calculation.

---

### User Story 6 - Generate Reports via Chat Agent (Priority: P1)

As a business owner or manager, I want to ask the chat agent for financial reports in natural language (e.g., "Show me P&L for last quarter", "What's my balance sheet?") so I can get financial insights without navigating to a separate page.

**Why this priority**: Groot is an agent-first financial copilot. The chat agent is the PRIMARY interface — if a user can't ask "Am I profitable this month?" and get an instant P&L summary, the product fails its core value proposition.

**Independent Test**: Can be tested by sending a natural language request to the chat agent and receiving a formatted financial report summary inline in the conversation.

**Acceptance Scenarios**:

1. **Given** a user with Owner/Admin or Manager role is in the chat, **When** they ask "Show me my P&L for this month", **Then** the agent generates a Profit & Loss summary for the current month and displays it inline with key figures (Revenue, COGS, Gross Profit, Operating Expenses, Net Profit/Loss).
2. **Given** a user asks for a financial report, **When** the agent generates the report, **Then** it includes a brief natural language insight (e.g., "Your expenses increased 15% compared to last month — mainly from account 6100 Office Supplies").
3. **Given** a user asks for a report with a specific period (e.g., "Q1 2026 balance sheet"), **When** the agent parses the date reference, **Then** it generates the correct report for the specified period.
4. **Given** an Employee role user asks for a financial report, **When** the agent receives the request, **Then** it politely declines explaining they don't have permission to view financial statements.
5. **Given** a user asks for a report, **When** the report is generated, **Then** the agent offers to export it as PDF ("Would you like me to export this as a PDF?").

---

### Edge Cases

- **No data for period**: Reports display an empty state with a helpful message, not an error.
- **Single journal entry**: Reports still generate correctly (trial balance balances with one entry).
- **Very large date range**: Reports covering years of data still generate within acceptable time limits.
- **Accounts with zero balance**: Accounts with no activity in the selected period are excluded from reports by default (optional toggle to show all accounts).
- **Unposted/draft journal entries**: Only "posted" journal entries are included in reports. Draft or voided entries are excluded.
- **Multi-currency entries**: Journal entries with foreign currency amounts are converted to the business's home currency for report display, per IFRS 21.
- **Mid-period balance sheet**: Balance sheet is a point-in-time snapshot — it includes ALL posted entries up to and including the selected date, not just entries within a range.
- **Retained earnings**: The P&L net income for prior periods should roll into retained earnings on the balance sheet. The system must calculate retained earnings dynamically (sum of all historical revenue minus expenses not yet transferred to equity).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate a Trial Balance report that lists all accounts with debit/credit activity for a selected period, showing account code, name, total debits, total credits, and net balance.
- **FR-002**: System MUST verify that total debits equal total credits on every trial balance and display the verification status prominently.
- **FR-003**: System MUST generate a Profit & Loss statement showing Revenue (4xxx), COGS (5xxx), and Operating Expenses (6xxx) with subtotals for Gross Profit and Net Profit/Loss.
- **FR-004**: System MUST support P&L period comparison — displaying the current period alongside a comparison period with variance amounts and percentages.
- **FR-005**: System MUST generate a Balance Sheet showing Assets (1xxx), Liabilities (2xxx), and Equity (3xxx) classified as Current and Non-Current where applicable.
- **FR-006**: System MUST verify the accounting equation (Assets = Liabilities + Equity) on every balance sheet and display a warning if it does not balance.
- **FR-007**: System MUST calculate retained earnings dynamically for the balance sheet — accumulated net income from all prior periods not yet transferred to a retained earnings equity account.
- **FR-008**: System MUST generate a simplified Cash Flow Statement using the direct method, categorizing cash transactions into Operating, Investing, and Financing activities.
- **FR-009**: System MUST provide period filtering with presets (This Month, Last Month, This Quarter, Last Quarter, This Financial Year, Last Financial Year) and a custom date range picker.
- **FR-010**: System MUST export each report to PDF format with proper formatting (business name, report title, period, generation timestamp, section headers, subtotals).
- **FR-011**: System MUST export each report to CSV format suitable for import into spreadsheet applications.
- **FR-012**: System MUST only include posted journal entries in all reports (exclude draft, voided, and reversed entries).
- **FR-013**: System MUST handle multi-currency journal entries by converting to the business's home currency for report display.
- **FR-014**: Balance Sheet MUST be generated as a point-in-time snapshot (all posted entries up to the selected date), NOT filtered to a date range.
- **FR-015**: System MUST restrict financial report generation to Owner/Admin and Manager roles only. Employees MUST NOT have access to financial statements.
- **FR-016**: Chat agent MUST be able to generate any of the four financial reports in response to natural language requests (e.g., "Show me P&L for last quarter", "What's my balance sheet?").
- **FR-017**: Chat agent MUST parse natural language date references into correct report periods (e.g., "last quarter" → Q4 2025, "this month" → March 2026).
- **FR-018**: Chat agent MUST display report summaries inline in the conversation with key figures and a brief natural language insight highlighting notable trends or changes.
- **FR-019**: Chat agent MUST offer PDF export after generating a report inline.
- **FR-020**: Chat agent MUST enforce the same role-based access as the UI — decline financial report requests from Employee role users.

### Key Entities

- **Financial Report**: A generated report with a type (Trial Balance, P&L, Balance Sheet, Cash Flow), period parameters, generation timestamp, and the computed data. Reports are generated on-demand, not stored persistently.
- **Account Group**: A classification of accounts by their code range (1xxx=Assets, 2xxx=Liabilities, 3xxx=Equity, 4xxx=Revenue, 5xxx=COGS, 6xxx=Expenses) with sub-classifications (Current/Non-Current for assets and liabilities).
- **Report Period**: A date range (start date to end date) for income/expense/cash flow reports, or a single "as of" date for balance sheet. Includes preset shortcuts and custom selection.
- **Journal Entry Line** (existing): The source data — each line has an account code, debit amount, credit amount, entry date, and posting status.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can generate any of the four financial reports in under 3 seconds for up to 12 months of data.
- **SC-002**: Trial balance total debits equal total credits 100% of the time (when underlying data is correct).
- **SC-003**: Balance sheet satisfies Assets = Liabilities + Equity 100% of the time (when underlying data is correct).
- **SC-004**: Users can switch between time periods and see updated reports without navigating away from the page.
- **SC-005**: Exported PDF reports are formatted professionally and suitable for sharing with accountants, auditors, or investors.
- **SC-006**: Users with zero accounting knowledge can understand which report to use, aided by clear report descriptions and the "How It Works" info drawer.
- **SC-007**: P&L period comparison shows variance in both absolute and percentage terms, enabling trend analysis at a glance.
- **SC-008**: All four reports are accessible from a single "Financial Statements" section, reducing navigation friction to one click per report.

## Clarifications

### Session 2026-03-23

- Q: Which user roles can generate financial reports? → A: Owner/Admin and Manager roles only. Employees cannot access financial statements.
- Q: How are accounts classified as Current vs Non-Current? → A: By account code sub-range convention (e.g., 1000-1499 = Current Assets, 1500-1999 = Non-Current Assets; 2000-2499 = Current Liabilities, 2500-2999 = Non-Current Liabilities).
- Q: Should the chat agent be able to generate financial reports? → A: Yes, include in this feature. The agent must generate and display reports inline (e.g., "Show me P&L for last quarter"). Agent-first is core to Groot's identity as a financial copilot.

## Assumptions

- The Chart of Accounts follows the existing classification in the codebase: Assets (1xxx), Liabilities (2xxx), Equity (3xxx), Revenue (4xxx), COGS (5xxx), Expenses (6xxx).
- The financial year start month is configurable per business (or defaults to January if not set).
- "Posted" journal entries are those with `status: 'posted'` — the existing journal entry system already tracks this.
- Current vs Non-Current classification for assets and liabilities is determined by account code sub-ranges: 1000-1499 = Current Assets, 1500-1999 = Non-Current Assets, 2000-2499 = Current Liabilities, 2500-2999 = Non-Current Liabilities. No per-account metadata or schema changes required.
- The simplified cash flow statement uses the direct method (summing actual cash transactions), not the indirect method (adjusting net income for non-cash items), as this is simpler and more appropriate for SMEs.
- Cash Flow activity classification (Operating/Investing/Financing) is derived from the account codes of the contra-entry to Cash. For example: Cash debit + Revenue credit = Operating inflow; Cash debit + Fixed Asset credit = Investing inflow.
- Reports are generated on-demand and not persisted — users regenerate them as needed. This avoids storage costs and ensures reports always reflect the latest data.
- Multi-currency conversion uses exchange rates from the `manual_exchange_rates` table already in the system.

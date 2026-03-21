# Feature Specification: Multi-Currency Display & Historical Trend Analysis

**Feature Branch**: `031-multi-curr-history-analysis`
**Created**: 2026-03-21
**Status**: Draft
**Input**: GitHub Issue #349 — Multi-currency display + historical trend analysis tools

## Clarifications

### Session 2026-03-21

- Q: Which exchange rate should be used for historical currency conversions (transaction-date, current, or period-end)? → A: Current rate — all amounts converted at today's exchange rate for consistent apples-to-apples comparison
- Q: Should trend analysis and period comparison tools be available to all personas or restricted? → A: Manager + CFO only — trend/comparison/growth tools restricted to Manager and CFO roles; currency display available to all users
- Q: How should trend data be visualized in the chat? → A: Both — structured text summary (table with trend arrows and % change) plus a chart rendered inside an action card

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View Financial Data in a Different Currency (Priority: P1)

A business owner or CFO operating across SE Asian markets (MYR, SGD, USD, THB) asks the chat agent to show financial figures in a currency other than their home currency. For example, "Show revenue in USD" or "What's our total expenses in SGD?" The agent converts the amount using stored exchange rates and displays both the home currency value and the converted value side by side.

**Why this priority**: Multi-currency display is the foundational capability. SE Asian SMEs trade across borders daily — seeing financials in the currency of a trading partner or investor is a basic CFO need. This unblocks all other currency-related features.

**Independent Test**: Can be fully tested by asking the chat agent to display any financial metric in a non-home currency. Delivers immediate value for cross-border businesses.

**Acceptance Scenarios**:

1. **Given** a business with home currency MYR, **When** the user asks "Show revenue in USD", **Then** the agent displays revenue in both MYR and USD (e.g., "Revenue: RM20,059 (~ USD 4,456)")
2. **Given** a business with home currency MYR, **When** the user asks "What are my expenses in SGD?", **Then** the agent converts and displays total expenses in both MYR and SGD
3. **Given** a business with home currency USD, **When** the user asks "Show revenue" without specifying a currency, **Then** the agent displays revenue in the home currency only (no conversion)
4. **Given** a request to display in a currency for which no exchange rate exists, **When** the agent processes the request, **Then** it informs the user that the exchange rate is unavailable and shows the home currency value

---

### User Story 2 - Compare Financial Periods (Priority: P1)

A CFO asks the chat agent to compare financial performance across two time periods — for example, "Compare Q1 2025 vs Q1 2026" or "How did our expenses in January compare to December?" The agent retrieves data for both periods, calculates absolute and percentage changes, determines the trend direction, and presents a side-by-side comparison with visual indicators.

**Why this priority**: Period-over-period comparison is the most-requested CFO analytical capability. It answers the fundamental question "Are we doing better or worse?" and is essential for board reporting and strategic decisions.

**Independent Test**: Can be fully tested by asking the chat agent to compare any two time periods for a financial metric. Delivers standalone analytical value.

**Acceptance Scenarios**:

1. **Given** journal entry data exists for Q1 2025 and Q1 2026, **When** the user asks "Compare Q1 2025 vs Q1 2026", **Then** the agent shows a side-by-side comparison with absolute change, percentage change, and trend direction indicator
2. **Given** data exists for both periods, **When** the user asks "Compare January vs February expenses", **Then** the agent shows expense totals for both months with the change highlighted
3. **Given** data exists for only one of the two requested periods, **When** the user asks for a comparison, **Then** the agent shows the available period's data and explains that the other period has no data
4. **Given** a comparison request, **When** the agent presents results, **Then** the comparison includes a visual trend indicator (up/down arrow or equivalent) and the percentage change

---

### User Story 3 - View Financial Trends Over Time (Priority: P2)

A CFO or business owner asks the chat agent for a trend over a range of time — for example, "Show 6-month expense trend" or "Revenue trend for the past year." The agent retrieves data for the specified range, breaks it down by the appropriate granularity (monthly, quarterly, or yearly), and presents a trend visualization showing the trajectory.

**Why this priority**: Trend analysis builds on the comparison capability but adds longitudinal insight. It helps CFOs spot patterns (seasonal dips, growth acceleration) that point comparisons miss.

**Independent Test**: Can be fully tested by asking the chat agent for a multi-period trend on any financial metric. Delivers pattern-recognition value independently.

**Acceptance Scenarios**:

1. **Given** 6 months of journal entry data, **When** the user asks "Show 6-month expense trend", **Then** the agent displays a structured text summary with monthly figures, trend arrows, and percentage changes, plus an action card containing a chart visualization
2. **Given** 12 months of data, **When** the user asks "Revenue trend for the past year", **Then** the agent shows monthly revenue figures with an overall trend direction
3. **Given** the user asks for a quarterly trend, **When** the agent processes the request, **Then** data is aggregated at the quarterly level (Q1, Q2, Q3, Q4)
4. **Given** incomplete data for the requested range (e.g., only 4 months of a 6-month request), **When** the agent presents the trend, **Then** it clearly indicates which periods have data and which are missing

---

### User Story 4 - Calculate Growth Rates (Priority: P2)

A CFO asks the chat agent for a growth rate — for example, "What is our revenue growth rate?" or "Expense growth rate year over year." The agent calculates the growth rate based on the most recent comparable periods and presents it clearly.

**Why this priority**: Growth rate is a derived metric from comparison data. It's a common board-level KPI but is a calculation on top of the comparison capability rather than a new data source.

**Independent Test**: Can be fully tested by asking the chat agent for a growth rate on any metric. Delivers a specific KPI answer.

**Acceptance Scenarios**:

1. **Given** revenue data for the current and previous comparable period, **When** the user asks "What is our revenue growth rate?", **Then** the agent calculates and displays the percentage growth rate with context (e.g., "Revenue grew 12% compared to the same period last year")
2. **Given** the user doesn't specify a comparison period, **When** the agent calculates growth rate, **Then** it defaults to comparing the most recent complete period vs the same period in the prior year (e.g., last quarter vs same quarter last year)
3. **Given** negative growth (decline), **When** the agent presents the result, **Then** it clearly indicates a decline (e.g., "Revenue declined 8% compared to Q1 last year")

---

### User Story 5 - Multi-Currency Trend Comparison (Priority: P3)

A CFO asks to see a trend or comparison in a non-home currency — combining Stories 1 and 2/3. For example, "Compare Q1 vs Q2 revenue in USD" or "Show 6-month expense trend in SGD."

**Why this priority**: This is a composition of the two core capabilities. It only works once both multi-currency display and trend analysis are independently working.

**Independent Test**: Can be tested by requesting any trend or comparison with an explicit display currency. Validates that currency conversion and analytical tools compose correctly.

**Acceptance Scenarios**:

1. **Given** a business with home currency MYR, **When** the user asks "Compare Q1 vs Q2 revenue in USD", **Then** both period values are shown in MYR and USD, with the change calculated in the display currency
2. **Given** a 6-month trend request in SGD, **When** the agent processes it, **Then** each monthly value shows both MYR and SGD amounts

---

### Edge Cases

- What happens when the user requests a currency that is not supported or has no exchange rate data?
- How does the system handle periods with zero transactions (e.g., "Compare Q3 2024 vs Q3 2025" when Q3 2024 has no data)?
- Exchange rate variance within a period is not applicable — all conversions use the current (today's) rate for consistency
- How does the system handle ambiguous period references like "last quarter" when the current quarter is incomplete?
- What happens when the user asks for a metric that doesn't exist (e.g., "Show inventory turnover trend" when inventory isn't tracked)?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The chat agent MUST accept an optional display currency parameter in all financial data requests (revenue, expenses, profit, cash flow)
- **FR-002**: When a display currency is specified, the system MUST show both the home currency amount and the converted amount
- **FR-003**: Currency conversion MUST always use the current (today's) exchange rate from the system's database, regardless of the historical period being displayed
- **FR-004**: The system MUST support at minimum MYR, SGD, USD, and THB as display currencies
- **FR-005**: When no display currency is specified, the system MUST display amounts in the business's home currency only (current behavior preserved)
- **FR-006**: The system MUST provide a period comparison capability that accepts two time periods and a financial metric
- **FR-007**: Period comparison MUST calculate and display: absolute change, percentage change, and trend direction
- **FR-008**: The system MUST provide a trend analysis capability that accepts a metric, a time range, and a granularity (monthly, quarterly, yearly)
- **FR-009**: Trend analysis MUST break down the data by the specified granularity and present both a structured text summary (table with trend arrows and percentage changes) and a chart rendered inside an action card
- **FR-010**: The system MUST calculate growth rates by comparing the most recent complete period to the same period in the prior year when no specific periods are given
- **FR-011**: The system MUST handle missing data gracefully — showing available data and clearly indicating gaps rather than failing
- **FR-012**: Multi-currency display and trend/comparison capabilities MUST be composable — users can request trends or comparisons in a non-home currency
- **FR-013**: The system MUST interpret natural language period references ("last quarter", "Q1 2025", "past 6 months", "year over year") into concrete date ranges
- **FR-014**: Trend analysis, period comparison, and growth rate tools MUST be restricted to Manager and CFO/Owner roles. Currency display (converting amounts to a different currency) MUST be available to all user roles including Employee

### Key Entities

- **Exchange Rate**: The current conversion rate between two currencies, used to translate all financial amounts (including historical) from home currency to display currency. Always uses today's rate for consistency
- **Financial Metric**: A measurable financial quantity (revenue, expenses, profit, cash flow) derived from journal entry data
- **Period**: A defined time range (month, quarter, year, custom range) used as the basis for data retrieval and comparison
- **Trend**: A series of financial metric values over sequential periods, showing trajectory and direction of change
- **Comparison**: A pair of period values for the same metric, with calculated absolute change, percentage change, and direction

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can view any financial metric in any of the four supported currencies (MYR, SGD, USD, THB) within a single chat interaction
- **SC-002**: Period-over-period comparisons display accurate absolute and percentage changes, verifiable against manual calculation from the underlying data
- **SC-003**: Trend analysis requests return data broken down by the correct granularity with all available periods represented
- **SC-004**: 90% of natural language period references ("last quarter", "Q1 2025", "past 6 months") are correctly interpreted into the intended date ranges
- **SC-005**: All converted amounts display both home currency and target currency values, so users always retain context of the original figure
- **SC-006**: The system handles incomplete data (missing periods, unavailable exchange rates) without errors — graceful messaging in 100% of edge cases
- **SC-007**: Growth rate calculations match manual verification (percentage change between comparable periods) to within 0.1% rounding tolerance

## Assumptions

- Exchange rates are already stored in the system's database (referenced in the issue as "already in DB")
- The journal entries table contains sufficient historical data for trend analysis (at least 12 months for year-over-year comparisons)
- The chat agent's natural language understanding can parse period references — the NLU layer handles "Q1 2025", "last quarter", "past 6 months" etc.
- The existing chat agent tool framework supports adding new tools and extending existing tools with optional parameters
- Visual trend representations (charts, comparison cards) can be rendered in the chat interface's current action card system
- The four currencies (MYR, SGD, USD, THB) cover the primary markets; additional currencies can be added later by extending the exchange rate data

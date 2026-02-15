# Feature Specification: Chat Action Cards Expansion

**Feature Branch**: `013-chat-action-cards`
**Created**: 2026-02-14
**Status**: Draft
**Input**: User description: "Expand the chat agent's dynamic content and interactive action cards beyond the 4 existing types (expense_approval, anomaly_card, vendor_comparison, spending_chart) to cover invoice approvals, cash flow dashboards, tax/compliance alerts, budget warnings, rich content panel integration, time-series charts, bulk actions, and data export."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Post OCR Invoice to Accounting from Chat (Priority: P1)

A user asks the chat agent about recently processed invoices. The agent retrieves OCR-extracted invoice data and renders an interactive card showing the extracted details (vendor, amount, date, line items, confidence score). The user can review the extraction, confirm it is correct, and post it to accounting records directly from the card.

**Why this priority**: Posting confirmed invoices to accounting is the natural next step after OCR processing. It closes the loop from document upload → extraction → accounting entry, all within the chat experience. It mirrors the existing expense_approval card pattern and requires write-back to the database.

**Independent Test**: Can be fully tested by asking "Show my recently processed invoices" or "Any invoices ready to post?" in the chat widget and verifying the card renders with extracted data and a "Post to Accounting" button that creates the accounting entry.

**Acceptance Scenarios**:

1. **Given** the user has OCR-processed invoices with status "completed", **When** they ask "Any invoices ready to post?", **Then** the agent displays invoice_posting cards with vendor name, amount, currency, date, line items, and extraction confidence score.
2. **Given** an invoice_posting card is displayed, **When** the user clicks "Post to Accounting", **Then** an inline confirmation appears showing the extracted details, and upon confirming, the invoice is posted as an accounting entry.
3. **Given** an invoice_posting card is displayed and the OCR extraction has low confidence, **When** the card renders, **Then** a warning indicator is shown suggesting the user review the data before posting.
4. **Given** an invoice was already posted, **When** the card is loaded from message history, **Then** it displays a "Posted" status badge and no action buttons.
5. **Given** the posting mutation fails (network error, duplicate entry), **When** the error occurs, **Then** an error message is shown with a retry option.

---

### User Story 2 - Cash Flow Dashboard in Chat (Priority: P1)

A business owner asks the chat agent about their cash flow. The agent calls the cash flow analysis tool and renders a dashboard card showing runway days, burn rate, projected balance, and alert indicators. The card presents key financial health metrics at a glance.

**Why this priority**: Cash flow visibility is the primary use case for the financial co-pilot. The analysis tool already exists but has no visual representation — users currently receive only text responses for cash flow data.

**Independent Test**: Can be fully tested by asking "What's my cash flow situation?" or "How many days of runway do I have?" and verifying the dashboard card renders with metrics, alerts, and visual indicators.

**Acceptance Scenarios**:

1. **Given** the business has transaction history, **When** the user asks about cash flow, **Then** a cash_flow_dashboard card renders with runway days, monthly burn rate, projected balance, and net cash flow.
2. **Given** the cash flow analysis returns alerts (e.g., low runway), **When** the card renders, **Then** alert badges are displayed with severity-appropriate colors (red for critical, yellow for warning, green for healthy).
3. **Given** the analysis includes a forecast period, **When** the card renders, **Then** the forecast period label is displayed (e.g., "30-day forecast").
4. **Given** insufficient transaction data, **When** the tool returns limited results, **Then** the card shows available metrics with a note about limited data.

---

### User Story 3 - Tax & Compliance Alert Card (Priority: P2)

A user asks the chat agent about regulatory requirements (e.g., "What are the GST registration requirements in Singapore?"). The agent calls the RAG knowledge base, retrieves relevant regulatory information with citations, and renders a compliance alert card that links to official documents and the existing citation overlay.

**Why this priority**: This connects the existing RAG/Qdrant knowledge base to a visual card, enhancing the regulatory guidance experience. The RAG pipeline already works; this adds a structured visual layer on top.

**Independent Test**: Can be fully tested by asking a regulatory question (e.g., "Singapore GST registration") and verifying the compliance card renders with country, regulatory authority, key requirements summary, and clickable citation links that open the citation overlay.

**Acceptance Scenarios**:

1. **Given** the user asks a regulatory question, **When** the RAG tool returns results with citations, **Then** a compliance_alert card renders with the country, regulatory authority, topic, and key requirements.
2. **Given** a compliance_alert card is displayed, **When** the user clicks a citation link, **Then** the existing citation overlay opens with the source document preview.
3. **Given** the regulatory information has a severity or urgency level, **When** the card renders, **Then** the appropriate visual indicator is shown (e.g., "Action Required" in red, "For Information" in blue).
4. **Given** the user asks about a country not yet in the knowledge base, **When** the RAG tool returns no results, **Then** no card is rendered and the agent responds with text only.

---

### User Story 4 - Budget Alert Card (Priority: P2)

A user asks about their spending relative to historical patterns or the agent proactively detects overspending. A budget alert card renders showing current month spending vs. rolling 3-month average per category, with progress bars and warning colors that indicate spending health.

**Why this priority**: Budget alerts are a natural extension of the spending chart and anomaly detection capabilities. They provide proactive financial guidance — a core value proposition of the financial co-pilot. Uses historical averages as baseline (no new schema needed), with future expansion to user-defined budget targets.

**Independent Test**: Can be fully tested by asking "Am I overspending this month?" or "Show my spending vs. average" and verifying the card renders with category-level comparisons, progress bars, and color-coded warnings.

**Acceptance Scenarios**:

1. **Given** the business has at least 1 month of transaction history, **When** the user asks about spending health, **Then** a budget_alert card renders with categories showing current month spending vs. rolling 3-month average.
2. **Given** current spending exceeds 80% of the historical average in a category, **When** the card renders, **Then** a yellow "Above Average" indicator is shown for that category.
3. **Given** current spending exceeds 100% of the historical average in a category, **When** the card renders, **Then** a red "Overspending" indicator is shown with the overage amount.
4. **Given** current spending is within 80% of the historical average, **When** the card renders, **Then** a green "On Track" indicator is shown.
5. **Given** insufficient history (less than 1 month of data), **When** the card would render, **Then** the agent responds with text only and notes that more data is needed for comparison.

---

### User Story 5 - Rich Content Panel for Complex Visualizations (Priority: P2)

When the agent returns data that would benefit from a larger visualization (e.g., detailed cash flow breakdown, multi-period comparison, detailed transaction table), a "View Details" button on the action card opens the rich content panel — a slide-out side panel that displays charts, tables, or dashboard metrics alongside the chat window.

**Why this priority**: The rich content panel component already exists but is disconnected from the chat flow. Wiring it up provides a natural expansion area for complex data that doesn't fit within the compact chat widget cards.

**Independent Test**: Can be fully tested by asking a question that generates a data-heavy response (e.g., "Show detailed spending breakdown for Q1") and verifying that a "View Details" button appears on the card, which opens the side panel with expanded visualization.

**Acceptance Scenarios**:

1. **Given** an action card contains data suitable for expanded visualization, **When** the card renders, **Then** a "View Details" button appears.
2. **Given** the user clicks "View Details", **When** the panel opens, **Then** it displays the expanded visualization (chart, table, or dashboard) alongside the chat window.
3. **Given** the rich content panel is open, **When** the user clicks the close button, **Then** the panel closes and the chat widget remains functional.
4. **Given** a new "View Details" is clicked while the panel is open, **When** the new data loads, **Then** the panel replaces its content with the new visualization.

---

### User Story 6 - Time-Series Spending Charts (Priority: P3)

When the user asks about spending trends over time (e.g., "Show spending trends for the last 6 months"), the chat agent renders an enhanced spending chart with time-series data points. The chart shows period-over-period comparison with labeled data points.

**Why this priority**: Time-series visualization adds analytical depth beyond the existing static bar chart. However, it's lower priority because the core spending_chart already handles basic breakdowns.

**Independent Test**: Can be fully tested by asking "Show spending trends for the last 6 months" and verifying that a time-series chart renders with monthly data points, trend line, and period labels.

**Acceptance Scenarios**:

1. **Given** the user asks about spending over time, **When** the agent retrieves multi-period data, **Then** a time-series chart renders with labeled data points for each period.
2. **Given** the time-series data includes multiple categories, **When** the chart renders, **Then** each category is displayed with a distinct color and legend entry.
3. **Given** the chart shows a significant trend change, **When** the card renders, **Then** a trend indicator (up/down arrow with percentage) is displayed in the header.

---

### User Story 7 - Bulk Expense Approval / Invoice Posting (Priority: P3)

A manager asks "Show all pending expenses" and receives multiple expense approval or invoice posting cards. A bulk action bar appears allowing them to select multiple items and process them in a single batch operation.

**Why this priority**: Bulk actions significantly improve manager efficiency when handling many pending items, but the single-item approval flow already works. This is an efficiency improvement, not a new capability.

**Independent Test**: Can be fully tested by having 3+ pending expenses, asking the agent to show them, selecting multiple items via checkboxes, and clicking "Approve Selected" to verify all selected items are processed.

**Acceptance Scenarios**:

1. **Given** multiple approval cards are displayed, **When** the user sees 2+ cards of the same approval type, **Then** a "Select All" checkbox and batch action bar appear.
2. **Given** the user selects multiple items, **When** they click "Approve Selected", **Then** an inline confirmation shows the count and total amount being approved.
3. **Given** the user confirms bulk approval, **When** the operation processes, **Then** each card updates its status individually with a progress indicator.
4. **Given** some items in the batch fail, **When** the operation completes, **Then** a summary shows how many succeeded vs. failed, with retry for failed items.

---

### User Story 8 - Export Data from Cards (Priority: P3)

A user views a spending chart or data table and wants to save the data. An export button on applicable cards generates a CSV file for download directly from the chat.

**Why this priority**: Export is a convenience feature that enhances the usefulness of all data-presenting cards. It's lower priority because users can still access this data through the main application views.

**Independent Test**: Can be fully tested by asking for a spending breakdown, clicking the export/download button on the card, and verifying a CSV file is downloaded with the correct data.

**Acceptance Scenarios**:

1. **Given** a card contains exportable data (spending_chart, vendor_comparison, budget_alert), **When** the card renders, **Then** a small download icon button appears in the card header.
2. **Given** the user clicks the download button, **When** the export generates, **Then** a CSV file downloads with headers matching the displayed data columns.
3. **Given** the card contains currency amounts, **When** the CSV is generated, **Then** amounts are formatted as plain numbers (not locale-formatted) for spreadsheet compatibility.

---

### Edge Cases

- What happens when the agent emits an action card type that isn't registered? The existing FallbackCard renders a JSON preview of the data.
- What happens when multiple cards of different types are emitted in a single response? They render in order below the text content.
- What happens when a card's database mutation is called but the item was already processed by someone else? The mutation should return an error, and the card should display an appropriate message (e.g., "This invoice was already posted").
- What happens when the user scrolls up to view a historical approval card? It renders with the final status badge and no action buttons (isHistorical flag).
- What happens when the rich content panel overlaps with other UI elements on mobile? The panel should not render on viewports below a minimum width threshold; instead, the card data renders inline.
- What happens when export is triggered on a card with no data? The download button should be disabled or hidden.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render an invoice_posting card when the agent returns OCR-processed invoice data, displaying vendor name, amount, currency, date, line items, extraction confidence score, and a "Post to Accounting" button.
- **FR-002**: System MUST execute the post-to-accounting action from the card, creating an accounting entry from the confirmed OCR data with inline confirmation before execution.
- **FR-003**: System MUST render a cash_flow_dashboard card when the agent returns cash flow analysis, displaying runway days, burn rate, projected balance, net cash flow, and severity-coded alert indicators.
- **FR-004**: System MUST render a compliance_alert card when the agent returns regulatory knowledge base results, displaying the country, regulatory authority, topic summary, key requirements, and clickable citation links that open the existing citation overlay.
- **FR-005**: System MUST render a budget_alert card showing current month spending vs. rolling 3-month historical average per category, with color-coded progress bars (green for on-track, yellow for above-average at 80%, red for overspending at 100%).
- **FR-006**: System MUST provide a "View Details" mechanism on data-heavy cards that opens the rich content panel alongside the chat, displaying expanded charts, tables, or dashboard metrics.
- **FR-007**: System MUST support time-series spending chart rendering with period-labeled data points, multi-category display, and trend indicators.
- **FR-008**: System MUST support bulk selection and batch approval/rejection when multiple approval cards of the same type are displayed, with progress tracking and partial failure handling.
- **FR-009**: System MUST provide CSV export functionality for data-presenting cards (spending charts, vendor comparisons, budget alerts), generating downloadable files with spreadsheet-compatible formatting.
- **FR-010**: System MUST update the agent's system prompt to instruct the LLM when and how to emit the new action card types with correct data schemas.
- **FR-011**: All new action cards MUST follow the existing registry pattern (registerActionCard side-effect import) and support the isHistorical prop for displaying read-only historical cards.
- **FR-012**: All new action cards MUST use the project's semantic design tokens (bg-card, text-foreground, bg-primary, etc.) and follow existing card styling patterns.

### Key Entities

- **Action Card**: A registered React component that renders structured data from the agent's response. Identified by a type string (e.g., "invoice_approval") and receives data + historical flag as props.
- **Invoice Posting Item**: An OCR-processed invoice with vendor, amount, currency, date, line items, extraction confidence score, and posting status (ready/posted). Linked to the invoices table via invoiceId.
- **Cash Flow Metrics**: A set of financial health indicators including runway days, burn rate, projected balance, net cash flow, forecast period, and severity alerts.
- **Compliance Alert**: A regulatory information block with country, authority, topic, requirements list, severity level, and linked citations from the RAG knowledge base.
- **Budget Status**: A per-category comparison of current month spending vs. rolling 3-month historical average, with derived health indicators (on-track, above-average, overspending). Designed to support future expansion to user-defined budget targets.
- **Rich Content Payload**: An expandable data structure (chart, table, or dashboard type) that the rich content panel renders in a side panel alongside the chat.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All 4 new card types (invoice_posting, cash_flow_dashboard, compliance_alert, budget_alert) render correctly when the agent returns the appropriate data, verified by end-to-end chat interaction.
- **SC-002**: Invoice posting action from cards successfully creates accounting entries, with the same reliability as the existing expense_approval card.
- **SC-003**: Compliance alert card citations open the existing citation overlay, maintaining the same user experience as inline citation markers.
- **SC-004**: The rich content panel opens from action cards and displays expanded visualizations without obstructing the chat widget.
- **SC-005**: Users can complete invoice posting via chat in under 15 seconds (from card display to confirmed posting).
- **SC-006**: Bulk approval of 5+ items completes with clear progress feedback, with individual item failure not blocking the remaining items.
- **SC-007**: CSV export produces correctly formatted files that open without errors in common spreadsheet applications.
- **SC-008**: All new cards match the existing design language (border, spacing, colors, typography) established by the 4 existing cards.
- **SC-009**: All new cards render correctly in historical message view (read-only, no action buttons) when loaded from conversation history.
- **SC-010**: The build passes with zero errors after all cards are implemented.

## Clarifications

### Session 2026-02-14

- Q: What does "invoice approval" mean — the system has no incoming invoice approval workflow? → A: It means confirming OCR-extracted invoice data and posting it to accounting records (not approve/reject). Card renamed to invoice_posting.
- Q: Where does budget data come from — no budget table exists in schema? → A: Derive from historical spending averages (current month vs. rolling 3-month average per category). No new schema needed. Can expand to user-defined budget targets (new table) in a future iteration.
- Q: Are the new cards duplicating existing MCP tools/anomaly detection? → A: No duplicates. Each new card visualizes a distinct tool output that currently returns as text only. anomaly_card = individual transaction outliers (Z-score), cash_flow_dashboard = aggregate financial health (runway/burn rate), compliance_alert = regulatory knowledge from RAG + cross-border analysis, budget_alert = aggregate category spending vs. historical average. compliance_alert can serve both searchRegulatoryKnowledgeBase and analyze_cross_border_compliance tools.

## Assumptions

- OCR-processed invoices in the `invoices` table with status "completed" can be posted to accounting by creating an accounting_entries record from the extracted data.
- Budget baselines are derived from rolling 3-month historical spending averages per category using existing transaction data. No user-defined budget targets table is needed for the initial implementation.
- The cash flow analysis tool returns structured data with runway, burn rate, and alert fields that can be directly mapped to card display.
- The rich content panel's existing implementation (chart, table, dashboard renderers) is sufficient and does not need major refactoring.
- The AI model can reliably emit action card JSON blocks when given explicit prompt instructions and data schemas, consistent with the existing 4 card types.
- Mobile responsive behavior for new cards follows the same approach as existing cards (compact rendering within the chat widget width).

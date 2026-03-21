# Feature Specification: CFO Copilot — PDF Reports, Cash Flow Forecasting, Tax Planning KB

**Feature Branch**: `031-cfo-copilot-tools`
**Created**: 2026-03-21
**Status**: Draft
**Input**: [GitHub Issue #351](https://github.com/grootdev-ai/groot-finance/issues/351) — CFO Copilot tools for business owners: PDF board reports, cash flow forecasting with monthly projections, and tax planning knowledge base for SE Asia.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Cash Flow Forecasting with Monthly Projections (Priority: P1)

A business owner asks the chat agent: "Forecast cash flow for the next 6 months." The agent analyzes historical income and expense patterns, factors in known future receivables (unpaid sent invoices with due dates) and payables (posted AP invoices with due dates), and returns a month-by-month projected balance. The response includes a visual chart showing projected cash balance per month, estimated runway, and a risk assessment (e.g., "Cash may run low in Month 4 based on current burn rate").

**Why this priority**: Cash flow visibility is the #1 concern for SME owners. This directly addresses the "CFO Copilot" persona's core need — proactive financial intelligence. The forecasting engine also feeds into the PDF board report (P2), making it a prerequisite.

**Independent Test**: Can be tested by asking the agent "Forecast cash flow for the next 3 months" and verifying it returns monthly projections with amounts, a runway estimate, and risk flags — without requiring PDF generation or tax KB.

**Acceptance Scenarios**:

1. **Given** a business with 6+ months of transaction history, **When** the owner asks "Forecast cash flow for next 6 months", **Then** the agent returns monthly projected income, expenses, and net balance for each of the next 6 months, plus an overall runway estimate.
2. **Given** a business with outstanding sent invoices (AR) and posted AP invoices, **When** forecasting, **Then** known receivables and payables are factored into the projection (not just historical averages).
3. **Given** the forecast shows a month where projected runway drops below 2 months of average operating expenses, **When** the forecast is displayed, **Then** a risk alert is shown highlighting the specific month and projected shortfall.
4. **Given** a business with fewer than 3 months of transaction history, **When** the owner requests a forecast, **Then** the agent returns a projection with a caveat that limited data reduces accuracy, and suggests minimum data needed for reliable forecasts.

---

### User Story 2 - PDF Board Report Generation (Priority: P2)

A business owner says "Prepare a board deck for Q1" or "Generate Q1 board report." The agent generates a multi-section PDF report covering: P&L summary, cash flow overview, AR/AP aging breakdown, top vendors by spend, and trend charts. The PDF is downloadable via a link returned in the chat response.

**Why this priority**: Board reports are a high-value, time-consuming task for SME owners. Automating this directly demonstrates the "CFO Copilot" value proposition — turning hours of manual work into a single chat command. Depends on cash flow data (P1) for the cash flow section.

**Independent Test**: Can be tested by asking "Generate a board report for Q1 2026" and verifying a downloadable PDF link is returned with the expected sections populated from real business data.

**Acceptance Scenarios**:

1. **Given** a business with transaction data for Q1, **When** the owner says "Generate Q1 board report", **Then** a PDF is generated containing P&L summary, cash flow, AR aging, AP aging, top vendors, and trend charts — and a download link is returned in the chat.
2. **Given** a date range is specified (e.g., "Q1 2026" or "January to March"), **When** generating the report, **Then** all sections reflect data from that specific period only.
3. **Given** a section has no data (e.g., no AR for the period), **When** generating the report, **Then** that section shows a "No data available for this period" message rather than being omitted or showing errors.
4. **Given** the business uses a non-default home currency, **When** generating the report, **Then** all amounts are displayed in the business's home currency with proper formatting.
5. **Given** the PDF is generated, **When** the user clicks the download link, **Then** the PDF downloads with a descriptive filename (e.g., "Board-Report-Q1-2026.pdf").

---

### User Story 3 - Tax Reference Knowledge Base (Priority: P3)

A business owner asks "What is the corporate tax rate in Malaysia?" or "When is GST filing due in Singapore?" The agent retrieves factual tax information from a curated knowledge base — rates, filing deadlines, document requirements, and regulatory thresholds. The KB covers Malaysia corporate tax facts, Singapore GST calendar, and SE Asia regulatory reference data. The agent explicitly does NOT provide tax optimization advice, strategy recommendations, or "should I..." guidance.

**Why this priority**: Tax reference data is genuinely useful for SME owners and differentiates Groot from basic accounting tools. By limiting scope to factual information (rates, dates, thresholds), liability risk is minimized. Advisory features (optimization strategies, transfer pricing guidance) are deferred to a future sprint pending legal review.

**Independent Test**: Can be tested by asking factual tax questions and verifying the agent returns accurate reference data — and that it declines advisory/strategy questions with a referral to a tax professional.

**Acceptance Scenarios**:

1. **Given** the tax KB is populated with Malaysia corporate tax rates, **When** the owner asks "What is the corporate tax rate in Malaysia?", **Then** the agent returns the current rate(s) with any applicable thresholds (e.g., SME preferential rate vs. standard rate).
2. **Given** the tax KB contains Singapore GST filing calendar, **When** the owner asks "When is GST filing due?", **Then** the agent returns the filing deadlines and submission requirements.
3. **Given** the owner asks a tax optimization question (e.g., "How should I structure expenses to reduce tax?"), **When** the agent processes the query, **Then** it declines to provide advisory guidance and recommends consulting a qualified tax professional.
4. **Given** the owner asks a factual tax question not covered by the KB, **When** the agent searches, **Then** it responds that it doesn't have that specific reference data and suggests consulting a tax professional.
5. **Given** tax rates or deadlines change (e.g., new Malaysia Budget updates), **When** the KB content is updated, **Then** subsequent queries reflect the updated information without requiring system changes.

---

### Edge Cases

- What happens when the business has zero transactions? Forecasting returns an "Insufficient data" message; PDF report generates with empty sections noted.
- What happens when the user requests a forecast period longer than 12 months? System caps at 12 months with a note that longer projections have diminishing accuracy.
- What happens when PDF generation fails mid-way (e.g., a chart rendering error)? The user receives an error message suggesting they retry; partial PDFs are not returned.
- What happens when tax KB content contradicts itself (e.g., outdated vs. updated entries)? Retrieval uses recency-weighted scoring to prefer newer content.
- What happens when the owner asks for a report type not supported (e.g., "Generate audit report")? The agent clarifies available report types and offers the closest match.
- What happens when forecast data shows negative cash balance? The risk alert explicitly warns of projected cash shortfall with the specific month and amount.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The chat agent MUST support a forecasting command that projects monthly cash balances for a user-specified number of months (1–12).
- **FR-002**: Cash flow forecasting MUST incorporate known future receivables (unpaid sent invoices with due dates) and known future payables (posted AP invoices with due dates), not just historical averages.
- **FR-003**: Forecast results MUST include: projected monthly income, projected monthly expenses, net cash balance per month, estimated runway in months, and risk assessment flags.
- **FR-004**: The agent MUST display forecast results with a visual monthly projection chart (action card) in the chat interface.
- **FR-005**: The chat agent MUST support a report generation command that produces a downloadable PDF for a specified date range.
- **FR-006**: The PDF board report MUST include these sections: Profit & Loss summary, Cash Flow overview, Accounts Receivable aging, Accounts Payable aging, Top Vendors by spend, and Trend charts.
- **FR-007**: Generated PDFs MUST be stored and accessible via a download link for at least 7 days after generation.
- **FR-008**: The chat agent MUST be able to answer tax planning questions by retrieving information from a curated knowledge base.
- **FR-009**: The tax reference KB MUST cover factual data only: tax rates, filing deadlines, document requirements, and regulatory thresholds for Malaysia and Singapore. Tax optimization strategies, transfer pricing advice, and deduction recommendations are explicitly out of scope.
- **FR-010**: The agent MUST decline tax advisory questions (e.g., "How should I structure expenses to reduce tax?") and recommend consulting a qualified tax professional.
- **FR-014**: Every tax reference answer MUST include a brief disclaimer footer: "This is factual reference information only. Please consult a qualified tax professional for advice specific to your situation."
- **FR-011**: All three capabilities (forecasting, PDF reports, tax KB) MUST be accessible exclusively through the chat agent interface, consistent with Groot's agent-first architecture.
- **FR-012**: PDF reports MUST display all monetary amounts in the business's configured home currency.
- **FR-013**: Forecasting and PDF report generation MUST be restricted to Owner/Admin and Manager roles. Tax planning KB queries are available to all roles. Employees attempting to use restricted tools MUST receive a clear permission-denied message.

### Key Entities

- **Cash Flow Forecast**: A projection containing monthly buckets (month, projected income, projected expenses, net balance), overall runway estimate, risk alerts, and the input parameters (forecast period, historical basis period).
- **Board Report**: A generated document with metadata (report type, date range, generation date, business name) and sections (P&L, cash flow, AR aging, AP aging, top vendors, trends). Stored as a downloadable file with expiry.
- **Tax Reference Entry**: A knowledge base article with factual content, jurisdiction (Malaysia, Singapore), topic category (tax rates, filing deadlines, document requirements, regulatory thresholds), effective date, and source reference. Does not include advisory content (optimization strategies, deduction recommendations).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can generate a cash flow forecast for up to 12 months in under 10 seconds from issuing the chat command.
- **SC-002**: Forecast projections that account for known AR/AP are within 15% of actual outcomes for the first 3 months (measured retroactively after 3 months of usage).
- **SC-003**: Users can generate a complete board report PDF in under 30 seconds from issuing the chat command.
- **SC-004**: 90% of generated PDFs are downloaded by the requesting user (indicating the content is useful and accessible).
- **SC-005**: The agent correctly answers 80% of tax planning questions within the KB's documented scope on first attempt.
- **SC-006**: Users who previously spent 2+ hours preparing board reports can produce equivalent output through the chat agent in under 5 minutes.

## Assumptions

- The existing MCP `forecast_cash_flow` tool provides the foundational forecasting algorithm; this feature extends it with monthly granularity and a richer response format.
- `@react-pdf/renderer` (already installed) will be used for PDF generation, consistent with existing sales invoice PDF generation patterns.
- Qdrant (already deployed for RAG) will store tax KB embeddings using the same embedding pipeline as existing knowledge base content.
- Tax reference KB content will be curated manually (not auto-scraped) to ensure accuracy. Initial content covers Malaysia and Singapore factual data only — rates, deadlines, thresholds. Tax optimization strategies and advisory content are explicitly excluded to minimize liability risk; expansion to advisory requires legal review.
- The forecast_card action card follows the existing action card pattern used in other chat agent responses.
- PDF storage uses the existing S3 bucket (`finanseal-bucket`) with signed URLs for secure, time-limited downloads.

## Clarifications

### Session 2026-03-21

- Q: Who can access forecasting, PDF reports, and tax KB? → A: Owner/Admin + Manager for forecasting and PDF reports; all roles for tax KB queries.
- Q: What defines the "safety threshold" for cash balance risk alerts? → A: Runway dropping below 2 months of average operating expenses.
- Q: Should tax KB answers include a legal disclaimer? → A: Yes, always include a brief disclaimer footer on every tax KB response.
- Q: Should Groot offer tax advisory to avoid liability risk? → A: No — narrow to factual-only (rates, deadlines, thresholds). No optimization advice or strategy. Advisory deferred pending legal review.

## Dependencies

- **Cash Flow Forecasting (P1)** is a prerequisite for the cash flow section in PDF Board Reports (P2).
- Tax Planning KB (P3) is fully independent of P1 and P2.
- Existing infrastructure: Convex (transaction data), MCP server (tool hosting), Qdrant (vector store), S3 + CloudFront (file storage/delivery).

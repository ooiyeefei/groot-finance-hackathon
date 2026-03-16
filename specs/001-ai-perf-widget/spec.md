# Feature Specification: AI Performance Widget

**Feature Branch**: `001-ai-perf-widget`
**Created**: 2026-03-16
**Status**: Draft
**Input**: GitHub Issue #314 — P1: AI Performance widget — confidence rate, edit rate, automation rate in-app dashboard
**Priority**: P1 (Competitive parity with MindHive PAGE)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View AI Performance at a Glance (Priority: P1)

As a business owner or finance manager, I want to see a single widget on my analytics dashboard that shows how well the AI is performing across all automated features (AR matching, bank reconciliation, fee classification, document OCR), so I can gauge whether to trust AI decisions and enable more automation.

**Why this priority**: This is the core value proposition — making AI performance visible builds trust and justifies subscription cost. Without this, users have no in-app way to assess AI reliability. Competitive parity with MindHive's prominent AI Performance card.

**Independent Test**: Navigate to the analytics dashboard and verify the AI Performance widget displays current metrics (confidence rate, edit rate, no-edit rate, automation rate) with correct data from the current month.

**Acceptance Scenarios**:

1. **Given** a business with AI-processed transactions (AR matches, bank classifications, fee breakdowns), **When** the user opens the analytics dashboard, **Then** they see an AI Performance widget showing overall confidence rate, edit rate, no-edit rate, and automation rate as percentages.
2. **Given** a business with no AI activity yet, **When** the user opens the analytics dashboard, **Then** the widget displays a friendly empty state explaining what metrics will appear once AI features are used.
3. **Given** the widget is displayed, **When** the user views it, **Then** they see a visual chart (donut/ring) showing the distribution of AI decision outcomes (no-edit, edited, missing).

---

### User Story 2 - Filter by Time Period (Priority: P1)

As a finance manager, I want to switch between time periods (This Month, Last 3 Months, All Time) on the AI Performance widget, so I can observe trends and see how AI accuracy improves over time as the system learns.

**Why this priority**: Time-based comparison is essential for demonstrating the DSPy learning loop — users need to see that accuracy improves. Also directly listed in the issue's acceptance criteria.

**Independent Test**: Click through each time period option and verify the metrics update correctly with data scoped to the selected range.

**Acceptance Scenarios**:

1. **Given** the AI Performance widget is displayed with "This Month" selected, **When** the user selects "Last 3 Months", **Then** the metrics recalculate to reflect the last 3 months of AI decisions.
2. **Given** the user selects "All Time", **When** the widget loads, **Then** it aggregates all historical AI decisions since the business started using AI features.
3. **Given** a period with no AI activity, **When** the user selects that period, **Then** the widget shows zero values with a message indicating no AI activity in the selected period.

---

### User Story 3 - "Hours Saved" Hero Metric (Priority: P1)

As a business owner, I want to see a prominent "Hours Saved" or "Invoices Automated" hero metric that quantifies the ROI of AI automation, so I can justify the subscription cost and understand the tangible value delivered.

**Why this priority**: This is the key product messaging metric — turning abstract AI accuracy into concrete business value (time and money saved). Directly supports sales demos and retention.

**Independent Test**: Verify the hero metric calculates and displays total AI decisions, decisions requiring human review, automation rate, and estimated hours saved for the selected period.

**Acceptance Scenarios**:

1. **Given** a business that processed 500 AI decisions this month with 20 requiring human review, **When** the widget loads, **Then** the hero metric shows "480 automated" and an estimated hours saved calculation.
2. **Given** the hero metric is displayed, **When** the user changes the time period, **Then** the hours saved recalculates for the new period.
3. **Given** a new business with zero AI decisions, **When** the widget loads, **Then** the hero metric shows "0 hours saved" with an encouraging message about enabling AI features.

---

### User Story 4 - Trend Indicators (Priority: P2)

As a finance manager, I want to see trend indicators (up/down arrows with percentage change) comparing the current period to the previous period, so I can quickly tell if AI performance is improving or degrading.

**Why this priority**: Trend context transforms static numbers into a narrative. A 92% confidence rate means more when you can see it was 88% last month. Lower priority because the core metrics are valuable even without trends.

**Independent Test**: Verify each metric shows an up/down indicator with the percentage change compared to the equivalent previous period.

**Acceptance Scenarios**:

1. **Given** the widget shows "This Month" with 95% confidence, and last month had 90% confidence, **When** the widget loads, **Then** a green upward trend indicator shows "+5%" next to the confidence metric.
2. **Given** the edit rate increased from 3% to 7%, **When** the widget loads, **Then** a red upward trend indicator shows "+4%" (higher edit rate is unfavorable).
3. **Given** this is the first month with AI activity (no previous period), **When** the widget loads, **Then** no trend indicator is shown — just the current values.

---

### User Story 5 - Widget on AP/AR Pages (Priority: P3)

As a user working in the AP or AR section, I want to see a compact version of AI performance metrics relevant to that specific feature (e.g., AR matching confidence on the AR page, bank recon confidence on the bank reconciliation page), so I have contextual trust signals while reviewing AI suggestions.

**Why this priority**: Contextual placement reinforces trust at the moment of decision. However, the analytics dashboard placement (P1) delivers the core value first. This extends reach but can follow later.

**Independent Test**: Navigate to the AR reconciliation page and verify a compact AI performance card shows AR-specific metrics (match confidence, correction rate).

**Acceptance Scenarios**:

1. **Given** the user is on the AR reconciliation page, **When** the page loads, **Then** a compact AI performance card shows AR-specific confidence rate and edit rate.
2. **Given** the user is on the bank reconciliation page, **When** the page loads, **Then** the compact card shows bank recon-specific confidence and classification accuracy.
3. **Given** the user is on a page with no AI features (e.g., team management), **When** the page loads, **Then** no AI performance card is shown.

---

### Edge Cases

- What happens when a business has AI data from only one feature (e.g., AR matching but not bank recon)? → Widget displays available metrics and indicates which features have no data yet.
- What happens when all AI decisions in a period were auto-approved with zero corrections? → Show 0% edit rate, 100% no-edit rate — this is the ideal state, display it positively.
- What happens when the data source tables are empty (brand new account)? → Show an empty state with guidance on enabling AI features.
- What happens when "hours saved" calculation has no baseline for manual processing time? → Use a reasonable industry default (3 minutes per transaction) and disclose the assumption.
- What happens when metrics are being calculated for a very large dataset (thousands of transactions)? → Widget shows a loading state and the query is performant (indexed, bounded by date range).
- What happens when confidence values are missing on some records (older data before AI was enabled)? → Exclude records without confidence values from the average calculation; do not treat missing as zero.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display an AI Performance widget on the analytics dashboard showing: overall confidence rate, edit rate, no-edit rate, automation rate, and missing fields rate.
- **FR-002**: System MUST aggregate AI performance data across AR reconciliation, bank reconciliation, fee classification, and expense OCR features.
- **FR-003**: System MUST allow users to filter metrics by time period: This Month, Last 3 Months, and All Time.
- **FR-004**: System MUST display a visual chart (donut/ring) showing the distribution of AI decision outcomes (no-edit, edited, missing).
- **FR-005**: System MUST display a "Hours Saved" or "Invoices Automated" hero metric that quantifies AI automation ROI.
- **FR-006**: The hero metric MUST calculate: total AI decisions, decisions requiring human review, automation rate percentage, and estimated hours saved.
- **FR-007**: System MUST show trend indicators comparing current period metrics to the equivalent previous period (e.g., this month vs last month).
- **FR-008**: System MUST update metrics in real-time as new AI decisions and corrections are recorded.
- **FR-009**: System MUST display a meaningful empty state when no AI activity data exists for the selected period.
- **FR-010**: System MUST scope all metrics to the current user's business (multi-tenant isolation).
- **FR-011**: System SHOULD display compact, feature-specific AI performance cards on the AR reconciliation and bank reconciliation pages.
- **FR-012**: System MUST calculate confidence rate as a weighted average across all AI features, weighted by decision volume.
- **FR-013**: System MUST calculate edit rate as: (user corrections) / (total AI decisions) for the selected period.
- **FR-014**: System MUST calculate automation rate as: (auto-approved decisions) / (total eligible decisions) for the selected period.
- **FR-015**: System MUST use a disclosed default assumption for manual processing time when calculating hours saved.

### Key Entities

- **AI Decision**: A single instance where the AI system made a classification, match, or extraction. Spans across AR matching, bank recon, fee classification, and OCR. Key attributes: feature source, confidence score, timestamp, outcome (accepted/corrected/missing).
- **User Correction**: A record of a user overriding or modifying an AI decision. Key attributes: original AI decision reference, correction timestamp, feature source.
- **Performance Metric**: An aggregated calculation over a set of AI decisions for a time period. Key attributes: metric type (confidence, edit rate, no-edit rate, automation rate, missing rate), value, period, comparison delta.
- **Hours Saved Estimate**: A derived metric calculating the time saved by AI automation. Key attributes: total decisions, human-reviewed decisions, automation rate, estimated manual time per decision, total hours saved.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can view AI performance metrics within 2 seconds of navigating to the analytics dashboard.
- **SC-002**: All displayed metrics are accurate to within 1% of the underlying data when verified by manual calculation.
- **SC-003**: Users can switch between all three time periods and see updated metrics within 1 second.
- **SC-004**: The widget correctly aggregates data from all active AI features for the business — no feature's data is silently excluded.
- **SC-005**: 80% of users who view the AI Performance widget report increased confidence in enabling AI automation features (measured via auto-approval adoption rate increase).
- **SC-006**: The "Hours Saved" metric is displayed prominently and is understandable without additional explanation.
- **SC-007**: The widget renders correctly on both desktop and tablet screen sizes without layout breakage.
- **SC-008**: When no AI data exists, users see a clear empty state that guides them toward enabling AI features — not a broken or blank widget.

## Assumptions

- **Manual processing time**: The "hours saved" calculation assumes 3 minutes per transaction for manual data entry, matching, or classification. This default is disclosed to users and may be made configurable in a future iteration.
- **Confidence score availability**: Not all historical records may have confidence scores (pre-AI data). These records are excluded from confidence calculations rather than counted as zero.
- **Feature weighting**: The overall confidence rate is weighted by decision volume per feature (a feature with 1000 decisions has more weight than one with 10), not equally weighted across features.
- **Auto-approval scope**: Automation rate only counts decisions eligible for auto-approval (those within Triple-Lock criteria). Manual-only decisions are excluded from this metric.
- **Real-time updates**: The widget uses live subscriptions, so new AI decisions and corrections appear without page refresh.
- **Multi-tenant isolation**: All queries are scoped by businessId — users only see their own business's AI performance.

## Out of Scope

- Configurable manual time estimates per feature (future iteration)
- AI performance comparison across multiple businesses (admin/reseller view)
- Detailed per-transaction drill-down from the widget (users can navigate to the respective feature pages for details)
- Historical trend charts beyond the current vs previous period comparison (e.g., line chart over 12 months)
- Export of AI performance metrics to CSV/PDF
- Action Center integration (listed as optional in issue — deferred to follow-up)

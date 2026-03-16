# Feature Specification: Smart Vendor Intelligence

**Feature Branch**: `001-smart-vendor-intelligence`
**Created**: 2026-03-16
**Status**: Draft
**Input**: User description: "AI-powered vendor intelligence with automated price tracking, anomaly detection, vendor scorecards, risk analysis, and smart alerts"
**GitHub Issue**: #320

## Clarifications

### Session 2026-03-16

- Q: How should the system uniquely identify items across invoices to build accurate price history? → A: Item code primary + fuzzy description fallback - Match on item code first. If no code or code changed, use fuzzy description match with confidence threshold requiring user confirmation.

- Q: What confidence threshold percentage should trigger user confirmation for fuzzy-matched items? → A: 80% confidence threshold

- Q: What constitutes a "significant" deviation in invoice frequency that should trigger an alert? → A: 50% frequency change - Alert when billing frequency changes by ≥50% (e.g., monthly → biweekly, quarterly → monthly)

- Q: How should the system determine that items from different vendors are "the same item" for cross-vendor price comparison? → A: Hybrid approach - AI semantic matching with manual correction capability. System suggests potential cross-vendor item matches using fuzzy/semantic analysis; users confirm or manually reassign to correct item groups. Confirmed groupings persist for future comparisons.

- Q: How long should the system retain historical price data? → A: 2 years retention

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic Price Tracking & Anomaly Alerts (Priority: P1)

As a finance manager, I want the system to automatically track item prices from every AP invoice and alert me when vendors raise prices unexpectedly, so I can negotiate better terms or find alternative suppliers before costs spiral.

**Why this priority**: This is the core AI moat feature that differentiates us from competitors. Manual price tracking is impossible at scale, and late detection of price increases costs businesses real money. This delivers immediate, measurable value.

**Independent Test**: Can be fully tested by processing AP invoices with line items, verifying price history is built automatically, and confirming alerts trigger when prices increase beyond thresholds. Delivers standalone value even without the dashboard or risk analysis.

**Acceptance Scenarios**:

1. **Given** an AP invoice is processed with line items (item code, description, unit price), **When** the system extracts the line items, **Then** it stores each item's price with vendor ID, timestamp, and builds a price history timeline.

2. **Given** a vendor submits a new invoice with an item previously purchased, **When** the new unit price is >10% higher than the last invoice for the same item, **Then** the system creates an in-app alert with: vendor name, item description, old price, new price, percentage increase, and action links (View History, Dismiss).

3. **Given** a vendor's item price increases >20% over the trailing 6-month average, **When** the anomaly is detected, **Then** the system flags it as a "High Impact" alert and includes it in the Action Center insights.

4. **Given** a vendor invoice contains new line items that don't exist in historical data, **When** the invoice is processed, **Then** the system creates an alert: "New charges detected: [item description] (RM X.XX) — this item wasn't in previous invoices from this vendor."

5. **Given** a vendor's billing frequency changes by ≥50% from historical average (e.g., monthly → biweekly, quarterly → monthly), **When** the pattern change is detected, **Then** the system alerts: "Billing pattern changed: [Vendor] now invoicing [frequency] instead of usual [frequency]" with potential indicators (cash flow issues, billing errors, contract violations).

---

### User Story 2 - Vendor Performance Scorecard (Priority: P2)

As a finance manager, I want to see a comprehensive scorecard for each vendor showing spend, payment cycles, price stability, and AI accuracy, so I can identify which vendors are reliable partners and which require closer monitoring.

**Why this priority**: After detecting anomalies (P1), users need context to make decisions. A scorecard provides the full picture of vendor performance and helps prioritize which relationships need attention. This is less urgent than alerting but essential for actionable insights.

**Independent Test**: Can be fully tested by viewing a vendor's detail page and verifying all metrics are calculated correctly from existing data. Delivers standalone value for vendor management even without price alerts.

**Acceptance Scenarios**:

1. **Given** a user views a vendor's detail page, **When** the scorecard loads, **Then** it displays: Total Spend YTD (sum of paid invoices), Invoice Volume (count per period), Average Payment Cycle (days from invoice date to payment date), Price Stability Score (AI-calculated variance metric), AI Extraction Accuracy (from per-field confidence scores), and Anomaly Flags (count of detected issues).

2. **Given** a vendor has processed 10 invoices in the current year, **When** the scorecard calculates Total Spend YTD, **Then** it sums the total amounts of all paid invoices for this vendor in the current fiscal year.

3. **Given** a vendor has 5 paid invoices with payment dates, **When** the scorecard calculates Average Payment Cycle, **Then** it computes the mean number of days between invoice date and payment date across all paid invoices.

4. **Given** a vendor's item prices have low variance over time, **When** the Price Stability Score is calculated, **Then** it returns a high score (e.g., 90/100) indicating stable, predictable pricing.

5. **Given** a vendor's invoices have high per-field confidence scores (from AI extraction), **When** the AI Extraction Accuracy metric is calculated, **Then** it shows a high percentage (e.g., 95%) indicating clean, well-formatted invoices.

---

### User Story 3 - Price Intelligence Dashboard (Priority: P3)

As a procurement manager, I want to visualize price trends over time and compare the same items across multiple vendors, so I can make data-driven decisions during contract negotiations.

**Why this priority**: This enhances the basic price tracking (P1) with visual analysis tools. While useful for negotiation prep, it's less urgent than detecting anomalies and understanding vendor performance. Users can still get value from P1/P2 without advanced visualizations.

**Independent Test**: Can be fully tested by navigating to the Price Intelligence tab, selecting a vendor and item, and verifying charts render correctly with historical data. Delivers standalone value for procurement analysis.

**Acceptance Scenarios**:

1. **Given** a user navigates to the Price Intelligence dashboard, **When** they select a vendor, **Then** the system displays a list of tracked items with: item description, current unit price, price trend indicator (up/down/stable), and number of observations.

2. **Given** a user selects a specific item from a vendor, **When** they view the price trend chart, **Then** the system renders a line chart showing unit price over time with labeled data points (date, price) for each invoice.

3. **Given** the same item is purchased from multiple vendors (AI suggests matches or user manually groups them), **When** the user views cross-vendor comparison, **Then** the system displays a comparison table showing: vendor name, current unit price, last price change date, price stability score, sorted by price (lowest to highest). User can confirm AI-suggested groupings or manually reassign items to correct groups.

4. **Given** a user wants to prepare for vendor negotiations, **When** they click "Export Price History", **Then** the system generates a CSV file containing: vendor name, item code, item description, invoice date, unit price, quantity, total amount, observation count, for all tracked items from that vendor.

5. **Given** a vendor's pricing fluctuates seasonally, **When** the user views the price trend chart for 12+ months, **Then** the system displays a pattern indicator: "Seasonal pattern detected — prices typically increase in [months]."

---

### User Story 4 - Vendor Risk Analysis (Priority: P4)

As a finance director, I want to see AI-powered risk scores for each vendor covering payment risk, concentration risk, compliance risk, and price risk, so I can proactively manage supply chain vulnerabilities.

**Why this priority**: Risk analysis is valuable for strategic planning but less urgent than immediate cost-saving opportunities (P1-P3). This is a "nice to have" that enhances vendor management for larger businesses with complex supply chains.

**Independent Test**: Can be fully tested by viewing a vendor's risk analysis section and verifying scores are calculated from existing data. Delivers standalone value for risk management.

**Acceptance Scenarios**:

1. **Given** a user views a vendor's detail page, **When** the risk analysis section loads, **Then** it displays four risk scores (0-100, where 100 = high risk): Payment Risk, Concentration Risk, Compliance Risk, Price Risk, with a tooltip explaining each metric.

2. **Given** a vendor's invoices frequently have missing or incorrect fields, **When** the Payment Risk score is calculated, **Then** it returns a high score (e.g., 75) indicating poor invoice quality that requires manual intervention.

3. **Given** a single vendor represents >30% of total AP spend, **When** the Concentration Risk score is calculated, **Then** it returns a high score (e.g., 85) indicating dangerous single-supplier dependency.

4. **Given** a vendor is missing Tax Identification Number (TIN) or is not e-invoice compliant, **When** the Compliance Risk score is calculated, **Then** it returns a high score (e.g., 90) with a warning: "Missing TIN — regulatory risk."

5. **Given** a vendor's prices fluctuate significantly over time (high variance), **When** the Price Risk score is calculated, **Then** it returns a high score (e.g., 70) indicating unpredictable pricing.

---

### User Story 5 - Smart Alerts & Recommended Actions (Priority: P5)

As a finance manager, I want vendor anomalies to automatically appear in my Action Center and AI Digest email, with AI-suggested next steps, so I can act on issues without constant monitoring.

**Why this priority**: This integrates vendor intelligence into existing AI workflows but requires P1-P4 to be functional first. It's a "polish" feature that improves discoverability but doesn't add new analytical capabilities.

**Independent Test**: Can be fully tested by triggering a price anomaly and verifying it appears in Action Center, AI Digest email, and is callable via MCP chat agent. Delivers standalone value for workflow integration.

**Acceptance Scenarios**:

1. **Given** a price anomaly is detected (from P1), **When** the weekly Action Center cron runs, **Then** the anomaly appears in the "Vendor Insights" section with: vendor name, item, price change, severity level, and recommended actions.

2. **Given** vendor anomalies are detected throughout the day, **When** the daily AI Digest email is sent at 6 PM local time, **Then** it includes a "Vendor Price Alerts" section summarizing: number of anomalies detected, top 3 vendors with the largest price increases, and a deep link to the Price Intelligence dashboard.

3. **Given** a user is chatting with the Groot AI assistant, **When** they ask "Which vendors raised prices this month?", **Then** the assistant calls the MCP `analyzeVendorPricing` tool and returns a formatted response with vendor names, affected items, and percentage increases.

4. **Given** a vendor's price increase exceeds the high-impact threshold (>20% over 6 months), **When** the system generates recommended actions, **Then** it suggests: "Request quotes from alternative vendors for these items", "Negotiate pricing — this vendor's prices are X% above historical average", or "Review contract terms — vendor has raised prices N times in Y months."

5. **Given** a user views a price anomaly alert, **When** they click "Dismiss", **Then** the alert is marked as acknowledged and removed from the active alerts list, but the price history remains for future reference.

---

### Edge Cases

- **What happens when a vendor changes their item codes or descriptions?** System matches on item code first (primary key). If item code is missing or changed, the system falls back to fuzzy description matching (e.g., "STEEL BOLT M8" vs "M8 STEEL BOLT"). When fuzzy match confidence is below 80%, the system flags the match and asks user to confirm if it's the same item before linking to existing price history. Confidence ≥80% = auto-link.

- **What happens when an invoice has missing line items or unit prices?** System should skip price tracking for that invoice and log a warning, but not block invoice processing. The vendor's AI Extraction Accuracy score should decrease.

- **What happens when a vendor is newly added with no historical data?** System should start building price history from the first invoice but not generate anomaly alerts until at least 2 invoices are processed (no baseline for comparison).

- **What happens when a user disputes a price anomaly alert (false positive)?** System should allow users to mark alerts as "Not an Issue" with optional feedback, which feeds into the DSPy learning loop to improve future detection accuracy.

- **What happens when the same item is purchased in different units (e.g., per piece vs per box)?** System should normalize prices to a common unit where possible (e.g., price per piece) or display both unit types with a warning that direct comparison may not be accurate.

- **What happens when a vendor is deactivated?** Price history and anomaly alerts should remain accessible (read-only) for audit purposes, but no new alerts are generated for that vendor.

- **What happens when AI suggests an incorrect cross-vendor item match?** User can reject the AI suggestion and manually assign the item to the correct item group. Once corrected, the system remembers the user's grouping decision and will not re-suggest the incorrect match. User corrections feed into the learning loop to improve future AI matching accuracy.

- **What happens when price history data reaches 2 years old?** System automatically archives price history records older than 2 years. Archived data remains accessible for audit/compliance but is excluded from active price tracking, anomaly detection, and dashboard queries to maintain query performance. Users can request archived data exports via support.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST automatically extract line items (item code, description, unit price, quantity) from every processed AP invoice and store them with vendor ID, invoice ID, and timestamp.

- **FR-002**: System MUST build a price history timeline for each unique item-vendor pair, using item code as the primary identifier. When item code is missing or changed, the system MUST fall back to fuzzy description matching. Matches with confidence ≥80% auto-link to existing price history; matches with confidence <80% require user confirmation.

- **FR-003**: System MUST detect price anomalies using two thresholds: (a) >10% increase from the last invoice for the same item, (b) >20% increase over the trailing 6-month average.

- **FR-004**: System MUST create in-app alerts when anomalies are detected, including: vendor name, item description, old price, new price, percentage change, severity level (standard/high-impact), and action buttons (View History, Dismiss).

- **FR-005**: System MUST detect and alert on new line items that don't exist in historical data for that vendor, flagging them as potential hidden charges.

- **FR-006**: System MUST detect and alert on invoice frequency changes when a vendor's billing frequency deviates by ≥50% from the historical average (e.g., monthly → biweekly = 100% increase, quarterly → monthly = 200% increase). Alert MUST include potential indicators: vendor cash flow issues, billing errors (duplicate invoicing), or contract term violations.

- **FR-007**: System MUST display a vendor scorecard with calculated metrics: Total Spend YTD, Invoice Volume, Average Payment Cycle (days), Price Stability Score (0-100), AI Extraction Accuracy (percentage), Anomaly Flags (count).

- **FR-008**: System MUST calculate Total Spend YTD as the sum of all paid invoice amounts for a vendor in the current fiscal year.

- **FR-009**: System MUST calculate Average Payment Cycle as the mean number of days between invoice date and payment date across all paid invoices for a vendor.

- **FR-010**: System MUST calculate Price Stability Score (0-100, where 100 = most stable) based on the coefficient of variation of item prices over time for a vendor.

- **FR-011**: System MUST calculate AI Extraction Accuracy as the average per-field confidence score across all invoices processed for a vendor.

- **FR-012**: System MUST provide a Price Intelligence dashboard displaying: list of tracked items per vendor, current unit price, price trend indicator (up/down/stable), observation count.

- **FR-013**: System MUST render a line chart showing unit price over time for a selected item-vendor pair, with labeled data points (date, price).

- **FR-014**: System MUST support cross-vendor price comparison using a hybrid matching approach: (a) AI suggests potential item matches across vendors using semantic/fuzzy analysis of descriptions and item codes, (b) users confirm AI suggestions or manually assign items to correct item groups, (c) confirmed groupings persist and enable automatic comparison. Comparison table displays: vendor name, current unit price, last price change date, price stability score, sorted by price.

- **FR-015**: System MUST export price history to CSV format containing: vendor name, item code, item description, invoice date, unit price, quantity, total amount, observation count.

- **FR-016**: System MUST calculate four vendor risk scores (0-100, where 100 = high risk): Payment Risk (based on invoice quality), Concentration Risk (based on spend percentage), Compliance Risk (based on missing TIN or e-invoice status), Price Risk (based on price variance).

- **FR-017**: System MUST integrate vendor anomalies into the Action Center weekly cron, displaying them in a "Vendor Insights" section with recommended actions.

- **FR-018**: System MUST include vendor anomalies in the daily AI Digest email at 6 PM local time, summarizing: number of anomalies, top 3 vendors with largest increases, deep link to dashboard.

- **FR-019**: System MUST provide an MCP tool `analyzeVendorPricing` callable by the chat agent, accepting parameters (vendor ID, date range) and returning: vendor name, affected items, price changes, anomaly flags.

- **FR-020**: System MUST generate recommended actions when high-impact anomalies are detected, suggesting: request alternative quotes, negotiate pricing, or review contract terms.

- **FR-021**: System MUST allow users to dismiss alerts, marking them as acknowledged while preserving price history for audit purposes.

- **FR-022**: System MUST use item code as primary identifier for linking items across invoices. When item code is missing or changed, the system MUST use fuzzy matching on descriptions. Confidence ≥80% = auto-link to existing price history; confidence <80% = flag for user confirmation before linking.

- **FR-023**: System MUST skip price tracking for invoices with missing line items or unit prices, log a warning, and decrease the vendor's AI Extraction Accuracy score.

- **FR-024**: System MUST suppress anomaly alerts for newly added vendors until at least 2 invoices are processed (no baseline for comparison).

- **FR-025**: System MUST allow users to reject incorrect AI-suggested cross-vendor item matches and manually reassign items to correct item groups. User corrections MUST persist and prevent re-suggesting the same incorrect match. Corrections MUST feed into the learning loop to improve future AI matching accuracy.

- **FR-026**: System MUST retain price history data for 2 years. Records older than 2 years MUST be automatically archived (excluded from active tracking, anomaly detection, and dashboard queries) but remain accessible for audit/compliance purposes. Users can request archived data exports.

### Key Entities

- **Price History Record**: Represents a single observation of an item's price from a vendor. Attributes: item identifier (item code as primary key, description as fallback), vendor ID, invoice ID, unit price, quantity, currency, invoice date, observation timestamp, match confidence score (0-100%, for fuzzy-matched items; ≥80% = auto-linked, <80% = requires user confirmation), user-confirmed flag (indicates manual linking approval), archived flag (true if >2 years old). Relationships: belongs to a vendor, belongs to an invoice, links to item master data (if available), optionally belongs to a cross-vendor item group. Retention: 2 years active, then archived.

- **Cross-Vendor Item Group**: Represents a collection of equivalent items from different vendors (e.g., "M8 BOLT" from Vendor A and "BOLT-M8-SS" from Vendor B are the same). Attributes: group ID, group name (user-defined or auto-generated), created timestamp, last updated timestamp, match source (AI-suggested, user-confirmed, user-created). Relationships: contains multiple price history records from different vendors, enables cross-vendor price comparison.

- **Price Anomaly Alert**: Represents a detected deviation from normal pricing or billing patterns. Attributes: vendor ID, item identifier (for price changes; null for frequency changes), alert type (per-invoice increase, trailing average increase, new item, frequency change), old value, new value, percentage change (or frequency deviation %), severity level (standard/high-impact), status (active/dismissed), potential indicators (cash flow issues, billing errors, contract violations — for frequency changes), created timestamp, dismissed timestamp, user feedback. Relationships: belongs to a vendor, references price history records (for price anomalies), links to recommended actions.

- **Vendor Scorecard**: Represents calculated performance metrics for a vendor. Attributes: vendor ID, total spend YTD, invoice volume, average payment cycle (days), price stability score (0-100), AI extraction accuracy (percentage), anomaly flags count, last updated timestamp. Relationships: belongs to a vendor, aggregates data from invoices, payment records, price history, and anomaly alerts.

- **Vendor Risk Profile**: Represents calculated risk scores for a vendor. Attributes: vendor ID, payment risk score (0-100), concentration risk score (0-100), compliance risk score (0-100), price risk score (0-100), risk level (low/medium/high), last calculated timestamp. Relationships: belongs to a vendor, calculated from invoices, spend data, compliance status, and price history.

- **Recommended Action**: Represents AI-suggested next steps for addressing vendor issues. Attributes: vendor ID, anomaly alert ID, action type (request quotes, negotiate, review contract), action description, priority level, status (pending/completed/dismissed), created timestamp. Relationships: belongs to a vendor, triggered by a price anomaly alert.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Finance managers can detect price increases within 24 hours of invoice processing, reducing the average time to identify vendor cost changes from weeks/months to under 1 day.

- **SC-002**: System automatically tracks prices for 100% of AP invoices with valid line items, eliminating manual price tracking work (estimated 2-3 hours per week saved per finance manager).

- **SC-003**: Users receive actionable alerts for price anomalies with 90%+ accuracy (low false positive rate), verified by user feedback on dismissed alerts.

- **SC-004**: Vendor scorecard loads within 2 seconds and displays 6+ key metrics calculated from existing data, providing a comprehensive performance snapshot without requiring manual report generation.

- **SC-005**: Users can identify the top 5 most expensive vendors for any item category within 30 seconds using cross-vendor price comparison, enabling faster procurement decisions.

- **SC-006**: System reduces vendor concentration risk by alerting when a single supplier exceeds 30% of total spend, preventing over-reliance on one vendor.

- **SC-007**: AI-suggested recommended actions accompany 100% of high-impact anomalies, providing clear next steps without requiring users to determine action items manually.

- **SC-008**: Vendor intelligence insights appear in the daily AI Digest email for 100% of businesses with active price anomalies, ensuring proactive monitoring without requiring users to check the dashboard daily.

- **SC-009**: Chat agent successfully answers vendor-related queries (e.g., "Which vendors raised prices?") with 95%+ accuracy by calling the MCP `analyzeVendorPricing` tool.

- **SC-010**: Users can export full price history for contract negotiation prep in under 10 seconds, with CSV files containing all tracked items and historical prices for a vendor.

# Feature Specification: Smart AP Vendor Management

**Feature Branch**: `013-ap-vendor-management`
**Created**: 2026-02-14
**Status**: Draft
**Input**: User description: "Develop smart AP vendor management — extend existing accounting entries as implicit AP ledger, add vendor payment terms, creditor aging, upcoming payments, quick payment recording, spend analytics, price intelligence alerts, cross-vendor comparison, dedicated AP dashboard, enhanced invoice review UX, and overdue auto-detection."

## Clarifications

### Session 2026-02-14

- Q: Should payment recording support partial payments or full-only? → A: Record payment amount (pre-filled with full amount, user can adjust for partial payments).
- Q: How should vendor bank details be displayed in the UI? → A: Mask by default (show last 4 digits), click-to-reveal for full details.
- Q: How should payables without a vendorId appear in vendor-level aging? → A: Show under "Unassigned Vendor" row so totals always reconcile with aggregate.
- Q: Which entry statuses should spend analytics include? → A: Paid + pending + overdue (excludes cancelled and disputed).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Vendor Payment Terms & Profile (Priority: P1)

A business owner opens a vendor's profile and configures their default payment terms (e.g., Net 30, Net 60, Due on Receipt). They can also record the vendor's preferred currency, bank details, contact person, and notes. When an invoice from that vendor is later processed, the system uses these terms to auto-calculate the due date instead of assuming a blanket 30-day default.

**Why this priority**: Payment terms are the single most impactful addition — they make aged payables accurate, enable correct "upcoming payments" calculations, and reduce manual date entry on every invoice. Without correct due dates, all downstream AP features produce misleading data.

**Independent Test**: Can be fully tested by editing a vendor's profile, setting payment terms, then creating an accounting entry from that vendor and verifying the due date is auto-calculated.

**Acceptance Scenarios**:

1. **Given** a vendor with no payment terms set, **When** the user opens the vendor profile and selects "Net 60," **Then** the vendor's default payment terms are saved and displayed on the profile.
2. **Given** a vendor with "Net 30" terms, **When** a new expense/COGS accounting entry is created for that vendor without an explicit due date, **Then** the system calculates the due date as transaction date + 30 days.
3. **Given** a vendor with "Custom" terms set to 45 days, **When** a new accounting entry is created, **Then** the due date is transaction date + 45 days.
4. **Given** an OCR'd invoice that specifies its own due date, **When** the user creates the payable, **Then** the invoice-specified due date takes precedence over the vendor's default terms.
5. **Given** a vendor with no payment terms and no business-level default, **When** a payable is created, **Then** the system defaults to 30 days from transaction date.

---

### User Story 2 — Vendor-Level Creditor Aging (Priority: P1)

A business owner views an aged payables breakdown that shows not just aggregate totals per aging bucket, but also which specific vendors are owed money and how overdue each vendor's balance is. They can click on a vendor to drill down into that vendor's individual unpaid bills.

**Why this priority**: Aggregate aging numbers (already exist) tell you the total risk, but vendor-level breakdowns tell you WHO to pay and WHO to chase. This is the actionable layer that transforms data into decisions.

**Independent Test**: Can be tested by having multiple pending/overdue accounting entries across different vendors, then verifying the aging view groups by vendor with correct bucket allocations.

**Acceptance Scenarios**:

1. **Given** a business with unpaid accounting entries across 5 vendors, **When** the user views vendor-level aged payables, **Then** each vendor is listed with their total outstanding broken into Current, 1-30, 31-60, 61-90, and 90+ day overdue buckets.
2. **Given** a vendor with "Net 60" terms and a 45-day-old unpaid bill, **When** the user views that vendor's aging, **Then** the bill appears in the "Current" bucket (not yet due), NOT the "31-60 overdue" bucket.
3. **Given** the vendor aging view, **When** the user clicks on a vendor row, **Then** they see a drill-down of that vendor's individual unpaid bills with amounts, dates, and days until due or overdue.
4. **Given** no unpaid accounting entries for any vendor, **When** the user views vendor aging, **Then** an empty state message indicates all payables are settled.

---

### User Story 3 — Upcoming Payments View (Priority: P1)

A business owner sees a clear list of bills due in the next 7, 14, or 30 days so they can plan cash outflows. The list shows vendor name, amount (in original and home currency), due date, and days remaining. This view helps with weekly payment planning.

**Why this priority**: SEA SMEs operate with tight cash flow and often pay vendors manually via bank transfer. Knowing what's due this week vs. this month directly impacts their payment scheduling decisions.

**Independent Test**: Can be tested by creating accounting entries with various due dates, then filtering the upcoming payments view by 7/14/30 day windows and verifying correct entries appear.

**Acceptance Scenarios**:

1. **Given** 3 bills due within 7 days and 2 bills due in 14 days, **When** the user selects the "7 days" filter, **Then** only the 3 bills due within 7 days are shown, sorted by due date (soonest first).
2. **Given** a bill due in 5 days for MYR 2,500 and the business's home currency is SGD, **When** the user views upcoming payments, **Then** the entry shows both MYR 2,500 and the SGD equivalent.
3. **Given** a bill that is already overdue by 3 days, **When** the user views upcoming payments, **Then** the overdue bill appears at the top with a visual indicator that it is past due.
4. **Given** no bills due in the next 30 days, **When** the user views upcoming payments, **Then** an empty state indicates no upcoming payments.

---

### User Story 4 — Quick Payment Recording (Priority: P1)

A business owner selects a pending or overdue payable and records a payment with an amount (pre-filled with the full outstanding balance), payment date, and payment method (bank transfer, cash, cheque, card, or other). If the full amount is paid, the status changes to "paid." If a partial amount is paid, the status remains "pending" (or "overdue") with the outstanding balance reduced.

**Why this priority**: Without payment recording, the AP ledger becomes increasingly inaccurate over time — bills that were paid still show as outstanding. This is the "close the loop" action that keeps the ledger trustworthy.

**Independent Test**: Can be tested by creating a pending accounting entry, marking it as paid with a date and method, then verifying it no longer appears in aged payables or upcoming payments.

**Acceptance Scenarios**:

1. **Given** a pending accounting entry for SGD 1,200 from Vendor A, **When** the user clicks "Record Payment" and the amount field is pre-filled with SGD 1,200, **Then** submitting with the full amount changes the status to "paid" with the recorded payment date and method.
2. **Given** a pending accounting entry for SGD 1,200, **When** the user records a partial payment of SGD 600, **Then** the entry remains "pending" with the outstanding balance reduced to SGD 600, and the payment is recorded in the entry's payment history.
3. **Given** an overdue accounting entry with SGD 800 outstanding, **When** the user records the full SGD 800, **Then** the status changes from "overdue" to "paid" and it is removed from the overdue totals.
4. **Given** the user is recording a payment, **When** they do not enter a payment date, **Then** today's date is used as the default.
5. **Given** an entry with prior partial payments, **When** the user views the entry detail, **Then** all payment records are displayed (date, amount, method) along with the remaining balance.

---

### User Story 5 — Overdue AP Auto-Detection (Priority: P1)

The system automatically detects pending accounting entries (type Expense/COGS) whose due date has passed and marks them as "overdue." This runs daily so the business owner always sees accurate overdue totals without manual status updates.

**Why this priority**: Manual status tracking breaks down at scale. Mirroring the existing AR overdue cron ensures AP data is always current and consistent with how the AR side already works.

**Independent Test**: Can be tested by creating a pending accounting entry with a due date in the past, triggering the detection process, and verifying the status changes to "overdue."

**Acceptance Scenarios**:

1. **Given** a pending expense entry with a due date of yesterday, **When** the daily overdue detection runs, **Then** the entry's status is automatically updated to "overdue."
2. **Given** a pending expense entry with a due date of tomorrow, **When** the daily detection runs, **Then** the entry remains "pending."
3. **Given** a paid accounting entry with a due date in the past, **When** the detection runs, **Then** the entry is not affected (only "pending" entries are candidates).
4. **Given** 5 entries newly marked as overdue, **When** the detection completes, **Then** a notification/insight is generated summarizing newly overdue bills (e.g., "5 bills totaling SGD 8,200 are now overdue").

---

### User Story 6 — Vendor Spend Analytics (Priority: P2)

A business owner views a spend analytics dashboard showing their top vendors by total spend, spend broken down by category, and spend trends over the last 12 months. They can filter by time period (30, 90, or 365 days) to understand spending patterns and identify cost optimization opportunities.

**Why this priority**: Spend visibility is a differentiator for a "financial co-pilot." SEA SMEs rarely have this insight — knowing that 60% of spend goes to 3 vendors or that a category's spend doubled this quarter drives strategic decisions.

**Independent Test**: Can be tested by creating multiple accounting entries across different vendors and categories over several months, then verifying the analytics display correct totals, rankings, and trend lines.

**Acceptance Scenarios**:

1. **Given** 20 expense/COGS entries across 8 vendors over the last 90 days, **When** the user views the top vendors chart, **Then** vendors are ranked by total spend (in home currency) with transaction count and percentage of total.
2. **Given** expense entries categorized as "office_supplies," "logistics," and "raw_materials," **When** the user views spend by category, **Then** each category shows total spend and percentage of total.
3. **Given** 12 months of expense data, **When** the user views the trend chart, **Then** a monthly aggregation shows spend over time.
4. **Given** the user switches the period filter from 90 days to 30 days, **When** the analytics refresh, **Then** all charts and rankings update to reflect only the selected period.

---

### User Story 7 — Price Increase Detection Alerts (Priority: P2)

When an invoice is processed through OCR and the user reviews it before creating a payable, the system compares each line item's price against the vendor's historical prices. If a price has increased significantly (above configurable thresholds), a visible alert appears next to the affected line item. Significant price changes also appear in the Action Center as optimization insights.

**Why this priority**: This is the headline differentiator — no lightweight competitor auto-detects price increases from OCR'd documents. For price-sensitive SEA SMEs, even a 10% increase on a recurring purchase is significant. This turns FinanSEAL from a bookkeeper into a co-pilot.

**Independent Test**: Can be tested by creating vendor price history entries for an item, then processing a new invoice with a higher price for the same item and verifying the alert appears.

**Acceptance Scenarios**:

1. **Given** Vendor A's last confirmed price for "Widget X" was SGD 10.00, **When** a new invoice from Vendor A has "Widget X" at SGD 11.50 (15% increase), **Then** a warning-level alert appears next to that line item showing "Price +15% vs last order."
2. **Given** a price increase of 6% (above info threshold but below warning), **When** the user reviews the invoice, **Then** an info-level indicator appears (less prominent than a warning).
3. **Given** fewer than 2 price observations for an item, **When** a new invoice is processed, **Then** no price comparison is shown (insufficient data).
4. **Given** a significant price increase is detected, **When** the accounting entry is created, **Then** an insight is generated in the Action Center with category "optimization" summarizing the increase.
5. **Given** price thresholds that vary by currency (5%/10%/20% for SGD; 8%/15%/25% for IDR), **When** an IDR invoice shows a 12% increase, **Then** the system applies the IDR-specific thresholds and shows an info-level alert (not warning).

---

### User Story 8 — Cross-Vendor Price Comparison (Priority: P2)

When reviewing an invoice or browsing items, the business owner can see if other vendors supply the same item at a lower price. The system matches items across vendors using normalized descriptions and shows a comparison: "Vendor A charges 15% more than Vendor B for this item."

**Why this priority**: SEA SMEs actively shop around. Knowing that a cheaper alternative exists — without manually checking — makes vendor selection data-driven. This leverages the existing vendor_price_history data that's already being collected passively.

**Independent Test**: Can be tested by recording price observations for the same item from multiple vendors, then verifying the comparison shows correct price differences during invoice review.

**Acceptance Scenarios**:

1. **Given** "Printer Paper A4" is purchased from Vendor A at SGD 12.00 and Vendor B at SGD 10.50, **When** the user reviews a new invoice from Vendor A for that item, **Then** a note indicates "Vendor B offers this item for 12.5% less."
2. **Given** a vendor is already the cheapest for an item, **When** the user reviews their invoice, **Then** no "cheaper alternative" note is shown.
3. **Given** the same item from 3+ vendors, **When** the user views the comparison, **Then** all vendors with confirmed prices for that item are listed with their latest prices.
4. **Given** items matched by normalized description, **When** "A4 Paper (500 sheets)" from Vendor A and "A4 Paper 500pcs" from Vendor B share the same normalized description, **Then** they are treated as the same item for comparison purposes.

---

### User Story 9 — Dedicated AP Dashboard (Priority: P2)

The business owner navigates to a dedicated AP / Payables page that consolidates all accounts payable information: summary cards (total outstanding, amount overdue, due this week, due this month), aged payables chart with vendor drill-down, upcoming payments table, top vendors by outstanding amount, and recent AP activity.

**Why this priority**: Currently, AP information is scattered. A single dashboard gives the business owner a complete payables picture at a glance — mirroring the AR experience. This is the user-facing capstone that ties all P1 components together.

**Independent Test**: Can be tested by navigating to the AP dashboard with existing pending/overdue entries and verifying all widgets render with correct data.

**Acceptance Scenarios**:

1. **Given** a business with 15 pending and 3 overdue accounting entries, **When** the user navigates to the AP dashboard, **Then** summary cards show total outstanding, overdue amount, due this week total, and due this month total — all in home currency.
2. **Given** the AP dashboard, **When** the user views the aged payables section, **Then** it matches the enhanced vendor-level aging from User Story 2.
3. **Given** the AP dashboard, **When** the user views upcoming payments, **Then** it shows the same data as User Story 3 (bills due in the next 7/14/30 days).
4. **Given** recent activity (3 new bills, 2 payments, 1 price alert), **When** the user views the activity feed, **Then** events are listed in reverse chronological order with type indicators.

---

### User Story 10 — Enhanced Invoice Review with Vendor Context (Priority: P2)

When a user reviews an OCR-processed invoice before creating a payable, the review screen displays vendor context: the vendor's payment terms, current outstanding balance, number of unpaid bills, and price change indicators on line items (from User Stories 7 and 8). The "Create Accounting Entry" button is relabeled to "Create Payable" for clarity.

**Why this priority**: The review screen is the moment of decision — enriching it with vendor intelligence helps the user make informed choices without navigating away. This connects the OCR pipeline to the AP intelligence layer.

**Independent Test**: Can be tested by processing an invoice through OCR, opening the review screen, and verifying vendor context data (terms, balance, price alerts) is displayed alongside the extracted data.

**Acceptance Scenarios**:

1. **Given** an OCR'd invoice from Vendor A who has "Net 30" payment terms, **When** the user opens the review screen, **Then** the vendor's payment terms are displayed and the due date is pre-calculated.
2. **Given** Vendor A has 3 unpaid bills totaling MYR 12,450, **When** the user reviews a new invoice from Vendor A, **Then** a context panel shows "3 unpaid bills — MYR 12,450 outstanding."
3. **Given** a line item with a detected price increase, **When** the user views the review screen, **Then** the price alert badge appears next to the affected line item (per User Story 7).
4. **Given** the invoice review screen, **When** the user is ready to create the entry, **Then** the primary action button reads "Create Payable" instead of "Create Accounting Entry."

---

### Edge Cases

- What happens when a vendor has no prior transactions and payment terms are not set? The system defaults to 30 days for due date calculation.
- How does the system handle duplicate invoices from the same vendor with the same amount and date? The system does NOT auto-create payables — the user must manually trigger creation, serving as a natural duplicate guard. A warning should be shown if a similar entry already exists.
- What happens when exchange rates change between invoice date and payment date? The system records the exchange rate at invoice time for the accounting entry. Payment recording does not recalculate the home currency amount.
- How does aging handle entries with no due date at all (legacy data)? Entries without a due date default to transaction date + 30 days for aging bucket calculation.
- What happens if the same item from a vendor has significantly different unit measurements across invoices? Price comparison uses normalized description matching. If normalization produces different strings, they are treated as different items. Over time, the normalization pipeline improves matching accuracy.
- How does the system handle a vendor being deactivated while they have outstanding payables? The vendor's outstanding payables remain visible and actionable. Deactivation only prevents new entries from being associated with that vendor via OCR auto-creation.
- How does the system handle payables with no vendorId (manually created or OCR failures)? They appear under an "Unassigned Vendor" row in vendor-level aging so that totals always reconcile. Users can assign a vendor to these entries from the drill-down view.

## Requirements *(mandatory)*

### Functional Requirements

**Vendor Profile Enhancement**

- **FR-001**: System MUST support configuring default payment terms per vendor (Due on Receipt, Net 15, Net 30, Net 60, Custom with user-specified number of days).
- **FR-002**: System MUST support storing optional vendor metadata: default currency, bank details (bank name, account number, routing/SWIFT code, account holder name), contact person, website, and notes. Bank account numbers and routing/SWIFT codes MUST be masked by default (showing only last 4 digits) with click-to-reveal for full details.
- **FR-003**: System MUST display and allow editing of all vendor profile fields in the vendor detail view.

**Due Date Calculation**

- **FR-004**: System MUST auto-calculate due dates for new payables using this precedence: (1) invoice-specified due date, (2) vendor's default payment terms, (3) 30-day default.
- **FR-005**: System MUST use the vendor's actual payment terms (not a blanket 30 days) when computing aging bucket placement.

**Creditor Aging**

- **FR-006**: System MUST provide vendor-level aged payables showing each vendor's outstanding balance grouped into Current, 1-30, 31-60, 61-90, and 90+ day overdue buckets. Payables without a vendor MUST appear under an "Unassigned Vendor" row so that vendor-level totals always reconcile with the aggregate total.
- **FR-007**: System MUST support drill-down from vendor summary to individual unpaid bills for that vendor.
- **FR-008**: Aging buckets MUST classify entries relative to their due date — an entry within its payment terms is "Current," not "overdue."

**Upcoming Payments**

- **FR-009**: System MUST display pending payables due within a user-selectable window (7, 14, or 30 days), sorted by due date.
- **FR-010**: Each upcoming payment entry MUST show vendor name, original amount and currency, home currency equivalent, due date, and days remaining (or days overdue if past due).

**Payment Recording**

- **FR-011**: System MUST allow users to record a payment against any pending or overdue payable with: payment amount (pre-filled with full outstanding balance), payment date, and payment method. If the payment amount equals the outstanding balance, status changes to "paid." If partial, the outstanding balance is reduced and status remains unchanged.
- **FR-012**: Supported payment methods MUST include: bank transfer, cash, cheque, card, and other.
- **FR-013**: If no payment date is specified, the system MUST default to today's date.
- **FR-014**: Once marked as paid, the entry MUST be excluded from outstanding payables, aged payables, and upcoming payments views.

**Overdue Auto-Detection**

- **FR-015**: System MUST automatically detect pending Expense/COGS accounting entries whose due date has passed and update their status to "overdue."
- **FR-016**: Auto-detection MUST run daily and MUST NOT affect entries with status other than "pending."
- **FR-017**: System MUST generate an insight/notification summarizing newly overdue bills after each detection run.

**Spend Analytics**

- **FR-018**: System MUST display top vendors ranked by total spend (in home currency) for a selectable period (30, 90, or 365 days), including transaction count and percentage of total spend. Spend calculations MUST include entries with status paid, pending, or overdue; cancelled and disputed entries MUST be excluded.
- **FR-019**: System MUST display spend breakdown by expense category with totals and percentage of total.
- **FR-020**: System MUST display a monthly spend trend for the last 12 months.

**Price Intelligence**

- **FR-021**: System MUST compare new line item prices against the vendor's most recent confirmed price for the same item (matched by normalized description).
- **FR-022**: Price change alerts MUST use tiered thresholds: info level (>5%), warning level (>10%), alert level (>20%) for stable currencies (SGD, MYR, USD); and elevated thresholds (>8%, >15%, >25%) for higher-inflation currencies (IDR, VND).
- **FR-023**: Price change alerts MUST appear inline during invoice review, next to the affected line item.
- **FR-024**: Significant price changes MUST generate Action Center insights with category "optimization."
- **FR-025**: Price comparison MUST require at least 2 historical price observations before showing alerts.

**Cross-Vendor Price Comparison**

- **FR-026**: System MUST identify when the same item (by normalized description) is available from multiple vendors at different prices.
- **FR-027**: During invoice review, if a cheaper vendor exists for a line item, the system MUST display a comparison note (e.g., "Vendor B offers this for X% less").

**AP Dashboard**

- **FR-028**: System MUST provide a dedicated payables page showing: summary cards, aged payables (vendor-level), upcoming payments, top vendors by outstanding, and recent AP activity.
- **FR-029**: All monetary amounts on the dashboard MUST be displayed in the business's home currency.

**Enhanced Invoice Review**

- **FR-030**: When reviewing an OCR-processed invoice, the system MUST display the vendor's payment terms, current outstanding balance, and count of unpaid bills.
- **FR-031**: The primary action to create a payable from an invoice MUST be clearly labeled (not generic).
- **FR-032**: Price intelligence alerts (FR-023, FR-027) MUST be visible during invoice review.

### Key Entities

- **Vendor**: A supplier or service provider to the business. Key attributes: name, contact info, tax ID, supplier code, category, status (prospective/active/inactive), default payment terms, default currency, bank details.
- **Payable (Accounting Entry — Expense/COGS)**: An amount owed to a vendor, representing the AP ledger. Key attributes: vendor reference, amount, currency, transaction date, due date, status (pending/overdue/paid/cancelled/disputed), payment date, payment method, line items.
- **Price Observation (Vendor Price History)**: A recorded price for an item from a specific vendor at a specific point in time. Key attributes: vendor, item description (raw and normalized), unit price, currency, quantity, source document, observation date, confirmation status.
- **Action Center Insight**: A system-generated notification or recommendation. Used here for price increase alerts and overdue bill summaries.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Business owners can set vendor payment terms in under 30 seconds per vendor.
- **SC-002**: Aged payables view accurately reflects vendor-specific payment terms — entries within their terms appear as "Current," not artificially overdue.
- **SC-003**: Users can identify which vendors to pay this week without navigating to more than one screen.
- **SC-004**: Recording a payment against an outstanding bill completes in under 3 clicks from the payable entry.
- **SC-005**: 100% of pending payables past their due date are automatically detected and marked overdue within 24 hours.
- **SC-006**: Top vendor spend rankings and category breakdowns are available for any selected period without requiring manual calculation or export.
- **SC-007**: Price increases above threshold are surfaced to the user at the point of invoice review — before the payable is created.
- **SC-008**: Users can see, at a glance, how much they owe in total, how much is overdue, and what is due this week from a single dashboard view.
- **SC-009**: Cross-vendor price comparisons surface savings opportunities automatically, without the user needing to look up historical prices manually.
- **SC-010**: The AP dashboard loads and displays all summary metrics within acceptable response time for businesses with up to 500 outstanding payables.

## Assumptions

- The existing `accounting_entries` table with type "Expense"/"COGS" will continue to serve as the AP ledger — no separate AP table will be created.
- The existing `vendor_price_history` table will serve as the purchase price intelligence source — no separate purchase catalog table will be created.
- Payment recording supports both full and partial payments. The payment amount is pre-filled with the full outstanding balance but can be adjusted. Partial payments reduce the outstanding balance; full payments change the status to "paid." Payment history is stored per entry to track multiple partial payments.
- The `PAYMENT_TERMS_OPTIONS` (due_on_receipt, net_15, net_30, net_60, custom) already defined for sales invoices will be reused for vendor payment terms.
- Price alert thresholds (5%/10%/20% for stable currencies, 8%/15%/25% for higher-inflation currencies) are reasonable defaults. These may need adjustment based on user feedback.
- The 90-day lookback window for price comparisons is sufficient to capture meaningful price trends without being distorted by very old data.
- Multi-currency amounts are displayed using the exchange rate recorded at invoice/entry creation time, not live rates.

## Scope Exclusions

The following are explicitly out of scope to keep FinanSEAL as a lightweight financial co-pilot rather than a full ERP:

- **Purchase Orders**: SEA SMEs under 50 employees rarely use formal POs.
- **Three-way matching** (PO vs receipt vs invoice): Enterprise ERP territory.
- **Bill approval workflows**: Expense approval already exists; vendor bills in SMEs are owner-approved.
- **Vendor portal**: Requires onboarding vendors as users. Too heavyweight.
- **Accruals and deferrals**: Overwhelming for SMEs using cash-basis or simplified accrual.
- **Vendor credit notes / returns management**: Track as negative entries if needed.
- **Batch payments / payment runs**: Fintech feature, not accounting feature.
- **Recurring / repeating bills**: Deferred until core AP is solid.
- **Vendor performance scoring**: Requires data SMEs don't reliably capture.
- **Budget management**: Separate major feature area.

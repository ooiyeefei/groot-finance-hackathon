# Feature Specification: AR Reconciliation — Platform-Agnostic Sales Statement Import & Invoice Matching

**Feature Branch**: `001-ar-reconciliation`
**Created**: 2026-03-11
**Status**: Draft
**Input**: GitHub Issue #271 — AR Reconciliation system for SEA SMEs selling across multiple channels
**Issue**: https://github.com/grootdev-ai/groot-finance/issues/271

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Upload & Import Sales Statement (Priority: P1)

A finance team member receives a monthly sales report (CSV or Excel) from an e-commerce platform like Shopee, Lazada, or Grab. They navigate to the AR Reconciliation section, upload the file, map the columns to standard fields (order reference, date, product, quantity, amount, fees, net settlement), and import the data as sales orders into the system.

**Why this priority**: Without the ability to ingest external sales data, no reconciliation can happen. This is the foundational capability that everything else builds on. It also leverages the already-built CSV parser (issue #272), making it the fastest path to demonstrable value.

**Independent Test**: Can be fully tested by uploading a sample Shopee/Lazada CSV, mapping columns, and verifying the imported sales orders appear in the system with correct field values.

**Acceptance Scenarios**:

1. **Given** a user has a Shopee monthly sales report CSV, **When** they open the AR Reconciliation tab and click "Import Sales Statement", **Then** the CSV import modal opens with the `sales_statement` schema pre-selected.
2. **Given** a user uploads a CSV file, **When** column headers are detected, **Then** the system auto-maps columns using alias matching (e.g., "Order ID" → orderReference, "Total Price" → grossAmount) and shows the mapping for review.
3. **Given** a user confirms the column mapping, **When** they proceed to import, **Then** sales orders are created in the system with the correct source platform, order reference, date, line items, fees, and net settlement.
4. **Given** a user uploads a file with unrecognizable columns, **When** alias matching fails to reach sufficient coverage, **Then** the system falls back to AI-assisted column mapping suggestions.
5. **Given** a user has previously imported from the same platform, **When** they upload a new file with the same column structure, **Then** the saved column mapping template is automatically applied.

---

### User Story 2 — Automatic Order-to-Invoice Matching (Priority: P1)

After importing sales orders, the system automatically attempts to match each order against existing internal sales invoices. Matching uses order reference / invoice number as the primary key, with fallback to fuzzy matching on product + quantity + amount when order references are unavailable.

**Why this priority**: Matching is the core value proposition — without it, users are just storing data in two places. Automatic matching eliminates the manual cross-referencing that is the #1 time sink for SEA SME finance teams.

**Independent Test**: Can be tested by importing a batch of sales orders where some have matching invoice numbers in the system, then verifying the system correctly identifies matched, unmatched, and partially matched orders.

**Acceptance Scenarios**:

1. **Given** imported sales orders with order references that match existing invoice numbers, **When** matching runs, **Then** those orders are marked as "matched" and linked to the corresponding invoices.
2. **Given** imported sales orders without recognizable order references, **When** matching runs, **Then** the system attempts fuzzy matching by comparing product name + quantity + amount against invoice line items within a configurable date window.
3. **Given** a sales order matches an invoice but the amounts differ (e.g., platform fees deducted), **When** matching runs, **Then** the system compares the order gross amount to the invoice total, subtracts known platform fees, and marks the order as "variance" if the residual is within tolerance (10% or RM 5 equivalent) — otherwise it remains "unmatched".
4. **Given** imported sales orders with no matching invoices at all, **When** matching runs, **Then** those orders are marked as "unmatched" for manual review.
5. **Given** a single sales order could match multiple invoices (e.g., split shipments), **When** matching runs, **Then** the system flags it as "partial" and presents candidates for manual resolution.

---

### User Story 3 — Reconciliation Dashboard & Review (Priority: P2)

After matching completes, the finance user views a reconciliation summary showing matched, unmatched, and variance counts with drill-down capability. They can review side-by-side comparisons of orders vs. invoices, manually resolve unmatched items, and override match suggestions.

**Why this priority**: The dashboard transforms raw matching data into actionable insights. While matching (P1) does the heavy lifting, the dashboard is where users actually make decisions and close out their reconciliation cycle.

**Independent Test**: Can be tested by navigating to the reconciliation dashboard after a batch import, verifying summary counts are accurate, drilling into an unmatched order, and manually matching it to an invoice.

**Acceptance Scenarios**:

1. **Given** a completed matching run, **When** the user views the reconciliation dashboard, **Then** they see summary cards showing: total orders imported, matched count, unmatched count, variance count, and total variance amount.
2. **Given** a list of unmatched orders, **When** the user clicks on one, **Then** they see the order details alongside suggested invoice matches (if any) ranked by confidence score.
3. **Given** an unmatched order, **When** the user manually selects an invoice to match it to, **Then** the match is recorded, the order status updates to "matched" (or "variance" if amounts differ), and the dashboard summary refreshes.
4. **Given** a variance match, **When** the user drills into it, **Then** they see a side-by-side comparison showing: order gross amount, platform fees, net settlement, invoice total, and the calculated variance.
5. **Given** a reconciliation period (e.g., "March 2026"), **When** the user filters the dashboard, **Then** only orders and invoices within that period are shown, with period-specific summary statistics.

---

### User Story 4 — Fee & Commission Tracking (Priority: P2)

Platform fees and commissions deducted from sales (Shopee's commission, Grab's service fee, Lazada's marketing charges) are extracted from the imported statement and categorized. Users can see total fees per platform per period, helping them understand their true net revenue per channel.

**Why this priority**: Platform fees are a major cost center for SEA SMEs but are often buried in dense sales reports. Extracting and categorizing them provides immediate financial visibility, and the data is already present in the CSV import — it just needs to be surfaced meaningfully.

**Independent Test**: Can be tested by importing a Shopee statement with commission and shipping fee columns, verifying the fees are extracted, and checking the fee summary shows correct totals by category.

**Acceptance Scenarios**:

1. **Given** a sales statement with platform fee columns, **When** imported, **Then** fee amounts are extracted and stored per order alongside the gross and net amounts.
2. **Given** imported orders with fees, **When** the user views fee analytics, **Then** they see total fees broken down by platform and fee category (commission, shipping, marketing, etc.) for the selected period.
3. **Given** a matched order-invoice pair with fees, **When** the user views the match detail, **Then** the fee breakdown explains the difference between the invoice amount and the net settlement.

---

### User Story 5 — Reconciliation Report Export (Priority: P3)

Finance users export a reconciliation report for a specific period, suitable for sharing with management or auditors. The report includes matched/unmatched summaries, variance details, and fee breakdowns.

**Why this priority**: Export is essential for audit trails and management reporting but doesn't block day-to-day reconciliation workflows. Users can work effectively with on-screen data first.

**Independent Test**: Can be tested by completing a reconciliation for a period, exporting the report, and verifying the exported file contains accurate summary and detail data.

**Acceptance Scenarios**:

1. **Given** a completed reconciliation for a period, **When** the user clicks "Export Report", **Then** a downloadable file is generated containing the reconciliation summary and line-item details.
2. **Given** an exported report, **When** opened, **Then** it includes: period, platform source, total orders, matched/unmatched/variance counts, variance details, and fee summary.

---

### User Story 6 — Bank Statement Reconciliation (Priority: P3)

Finance users import bank statements (CSV/PDF) and reconcile bank transactions against invoices and sales orders, enabling three-way matching: Sales Order ↔ Invoice ↔ Bank Settlement.

**Why this priority**: Three-way reconciliation is the gold standard for AR management, but it builds on top of the two-way order-invoice matching. It can be delivered as an enhancement after the core reconciliation flow is proven.

**Independent Test**: Can be tested by importing a bank statement CSV, matching transactions to invoices (by reference or amount), and verifying the three-way match status is correctly displayed.

**Acceptance Scenarios**:

1. **Given** a user uploads a bank statement CSV, **When** column mapping completes, **Then** bank transactions are imported with date, description, debit/credit amounts, and reference.
2. **Given** imported bank transactions, **When** matching runs against invoices and sales orders, **Then** transactions are linked to their corresponding invoice payments.
3. **Given** a fully matched set (order + invoice + bank transaction), **When** the user views the reconciliation, **Then** the three-way match is clearly indicated with all three records visible together.
4. **Given** a bank transaction that doesn't match any invoice, **When** displayed in the reconciliation view, **Then** it is flagged as "unreconciled" for manual investigation.

---

### Edge Cases

- What happens when the same sales statement file is uploaded twice? The system should detect duplicate orders by order reference + source platform and warn the user, offering to skip duplicates or update existing records.
- What happens when a sales order matches an invoice but the currencies differ? The system should flag the currency mismatch as a variance and not auto-match, requiring manual review.
- What happens when a CSV contains orders spanning multiple months? The system should import all orders regardless of date range, and the user filters by period in the reconciliation dashboard.
- How does the system handle returns/refunds in the sales statement? Negative amounts or refund-type rows should be imported and flagged with a "refund" indicator, matched against credit notes if they exist.
- What happens when the platform uses a different product naming convention than the internal catalog? Fuzzy matching should use configurable similarity thresholds, and unmatched items should be surfaced for manual mapping.
- What happens when multiple orders from different platforms match the same invoice? The system flags all competing orders as "conflict" and presents them side-by-side for the user to select the correct match. Unselected orders revert to "unmatched".

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow users to upload sales statement files (CSV, XLSX) from any e-commerce or sales platform.
- **FR-002**: System MUST auto-detect the source platform from file content (column headers, patterns) and present the detected platform for user confirmation or correction. The core import, matching, and reconciliation logic MUST be source-agnostic — platform is a metadata label only, not a code branching point. All platform-specific behavior is limited to column mapping aliases and display labels.
- **FR-003**: System MUST store imported sales orders with: source platform (metadata label), order reference, order date, line items (product, quantity, unit price, gross amount), platform fees, net settlement amount, and currency.
- **FR-004**: System MUST automatically match imported sales orders to internal sales invoices by order reference / invoice number.
- **FR-005**: System MUST support fuzzy matching by product name + quantity + amount when order references are unavailable, within a configurable date tolerance window.
- **FR-006**: System MUST classify each sales order match status as one of: "unmatched", "matched", "partial", "variance", or "conflict" (when multiple orders compete for the same invoice).
- **FR-007**: System MUST detect and record specific variances between matched orders and invoices (amount differences, quantity mismatches, missing line items). Matching compares invoice total to order gross amount; the residual difference after subtracting known platform fees must be within tolerance (10% of invoice total or local-currency equivalent of RM 5, whichever is greater) to qualify as a "variance" match — otherwise the order remains "unmatched".
- **FR-008**: System MUST detect duplicate imports by order reference + source platform and warn the user before creating duplicate records.
- **FR-009**: System MUST allow users to manually match, unmatch, or override automatic matches.
- **FR-010**: System MUST display a reconciliation summary dashboard showing matched, unmatched, variance, and total counts with drill-down capability.
- **FR-011**: System MUST support period-based filtering (date range) for reconciliation views.
- **FR-012**: System MUST extract and categorize platform fees and commissions from imported sales statements.
- **FR-013**: System MUST support saving and reusing column mapping templates per platform (leveraging existing CSV parser template system).
- **FR-014**: System MUST allow users to export reconciliation reports for a given period.
- **FR-015**: System MUST support bank statement import (CSV) using the existing `bank_statement` schema type.
- **FR-016**: System MUST match bank transactions to invoice payments for three-way reconciliation (Sales Order ↔ Invoice ↔ Bank Settlement).
- **FR-017**: System MUST handle refund/return rows in sales statements by flagging negative amounts and matching against credit notes where applicable.

### Key Entities

- **Sales Order**: An external sales transaction imported from a platform statement. Contains order reference, date, line items, gross amount, platform fees, net settlement, and source platform. Linked to the uploaded source document. Each order has a match status indicating its reconciliation state.
- **Sales Invoice** (existing): An internal invoice issued by the business. The target entity for matching against sales orders.
- **Match Result**: The relationship between a sales order and a sales invoice, including match confidence, variance details, and whether the match was automatic or manual.
- **Platform Fee**: A fee or commission deducted by the sales platform (e.g., Shopee commission, Grab service fee). Categorized by type and tracked per order.
- **Reconciliation Period**: A user-defined date range used to scope reconciliation analysis and reporting. Not a persisted entity — applied as a filter.
- **Bank Transaction** (Phase 4): An imported bank statement line item used for three-way reconciliation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can import a sales statement file and complete column mapping in under 3 minutes, regardless of the source platform.
- **SC-002**: Automatic matching correctly identifies at least 80% of order-to-invoice matches without manual intervention (for statements that include order references).
- **SC-003**: Users can complete a full monthly reconciliation (import → match → review → resolve) in under 30 minutes, compared to the current manual process of 4+ hours.
- **SC-004**: All imported sales orders are accounted for — every order is either matched, flagged as variance, or marked as unmatched. Zero orders silently dropped.
- **SC-005**: Platform fee totals extracted from imported statements match the source document totals within rounding tolerance (±0.01 per currency unit).
- **SC-006**: Duplicate imports are detected and prevented, ensuring data integrity across multiple import sessions.
- **SC-007**: Reconciliation reports accurately reflect the current state of all matches and variances for the selected period.

## Clarifications

### Session 2026-03-11

- Q: What variance threshold determines "variance match" vs "unmatched"? → A: Compare invoice total to order gross amount (not net settlement). If the residual difference after subtracting known platform fees exceeds 10% of the invoice total or the local currency equivalent of RM 5 (whichever is greater), the order is left unmatched. Otherwise, it is linked as a "variance" match with the discrepancy recorded.
- Q: How is the source platform identified during import? → A: Hybrid auto-detect + user confirmation. The system infers the platform from file content (column headers, patterns) and presents its guess for the user to confirm or correct. The core design is source-agnostic — platform is a metadata label only. The data model, matching engine, and reconciliation logic must not branch on platform. All platform-specific behavior is limited to column mapping aliases and display labels.
- Q: How are conflicting matches resolved when multiple orders claim the same invoice? → A: Flag as "conflict" — mark all competing orders and present them side-by-side for the user to decide. No auto-resolution; the user picks the correct match and the others revert to "unmatched".
- Q: What is the expected import volume per file? → A: Design for up to 5,000 orders per file. Matching runs synchronously on import (no background job needed for Phase 1). This covers the vast majority of SEA SME sellers. Files exceeding 5,000 rows should display a warning but still attempt processing.

## Assumptions

- Users have access to downloadable sales reports from their e-commerce platforms (Shopee, Lazada, Grab, etc.) in CSV or Excel format. The system does not connect to platform APIs directly.
- The existing CSV parser's `sales_statement` schema covers the common fields across major SEA e-commerce platforms (80-90% field overlap as noted in the issue).
- Sales invoices are already created in the system before reconciliation — the system matches imported orders against existing invoices, not the other way around.
- Platform fee categories (commission, shipping, marketing, etc.) can be inferred from column headers during import, with user confirmation during mapping.
- Bank statement reconciliation (Phase 4/Story 6) will reuse the same CSV parser with the existing `bank_statement` schema type.
- Fuzzy matching date tolerance defaults to ±3 days (configurable) to account for differences between order date and invoice date.
- Currency for matching is expected to be consistent within a single import file. Cross-currency matching is flagged as an edge case requiring manual review.
- Typical import volume is up to 5,000 orders per file. Matching runs synchronously on import. Files exceeding 5,000 rows display a warning but still attempt processing. Background/async matching is deferred to a future phase if larger-scale sellers require it.

## Dependencies

- **CSV Parser Utility** (Issue #272, completed): Provides the shared CSV/XLSX upload, column mapping, and template system. AR Reconciliation is the first consuming domain for the `sales_statement` schema.
- **Sales Invoice System** (live): Existing `sales_invoices` table, CRUD operations, and query functions provide the target dataset for matching.
- **Payment Recording** (live): Existing `payments` table and `recordPayment()` mutation for linking bank settlements to invoices.
- **Document Processor Lambda** (live): Potential future use for PDF sales statement OCR, but not required for Phase 1 (CSV/XLSX only).

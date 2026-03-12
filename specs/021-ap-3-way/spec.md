# Feature Specification: AP 3-Way Matching — PO, Invoice & GRN Reconciliation

**Feature Branch**: `021-ap-3-way`
**Created**: 2026-03-11
**Status**: Draft
**Input**: User description: "Build 3-way matching for Accounts Payable: automatically match Purchase Orders (PO) ↔ Supplier Invoices ↔ Goods Received Notes (GRN) with variance detection, tolerance rules, and approval workflows for SEA SMEs. Leverages existing OCR document pipeline (purchase_order and delivery_note types already defined), CSV parser for bulk import, vendor management with payment terms, and AP aging dashboard."

## Clarifications

### Session 2026-03-11

- Q: Should SMEs be able to start with 2-way matching (PO ↔ Invoice only) and optionally add GRN for 3-way? → A: Yes — 2-way matching is the minimum viable workflow. GRN adds the third leg when the business is ready. Many SEA SMEs skip formal goods receipt tracking initially.
- Q: Should matching be triggered automatically on document upload, or only manually? → A: Both. Auto-match is attempted when a document contains a PO reference number. Manual matching is available as fallback when auto-match fails or references are missing.
- Q: How should partial deliveries be handled — one GRN per delivery, or cumulative? → A: One GRN per delivery (event-based). The system tracks cumulative received quantities across multiple GRNs linked to the same PO line.
- Q: Should tolerance thresholds be global or per-vendor? → A: Start with business-level defaults (global), with per-vendor override as a P2 enhancement. Most SEA SMEs apply the same tolerance across vendors initially.
- Q: Can POs be created manually (form entry) in addition to OCR/CSV import? → A: Yes — manual PO creation is the primary path for SMEs. OCR upload and CSV import are convenience options for businesses that already have POs from another system.
- Q: How does matching relate to payable (accounting entry) creation? → A: Matching gates payable creation. Invoices linked to POs require an approved match (or explicit "no PO required" marking) before a payable can be created. This prevents paying for unverified goods.
- Q: Where do PO and GRN management live in the navigation? → A: Within the existing `payables` domain as new tabs/sections. PO list, GRN list, and matching views are added to the AP/Payables page, keeping all AP functionality consolidated.
- Q: Can POs be edited after they are issued? → A: No — only draft POs are editable. Once issued, the PO is locked as a commitment record. If changes are needed, the user cancels the original PO and creates a new one. This preserves audit integrity for matching.
- Q: Who can approve/reject flagged matches? → A: Admin and manager roles can approve/reject matches. Employees can view match status but cannot take approval actions. Aligns with the existing expense claim approval pattern.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Purchase Order Management (Priority: P1)

A business owner creates a Purchase Order for goods they plan to buy from a vendor. They can create POs manually by entering vendor, line items (description, quantity, unit price), and expected delivery date. Alternatively, they can upload an existing PO document (PDF/image) and have the system extract the details via OCR, or bulk-import POs from a CSV/Excel file exported from their existing ERP or procurement system. The PO is tracked through its lifecycle: draft → issued → partially received → fully received → invoiced → closed.

**Why this priority**: POs are the foundation of 3-way matching — without POs in the system, there is nothing to match against. Manual creation is the most accessible entry point for SMEs who don't use formal procurement software. OCR and CSV import reduce friction for businesses migrating from other systems.

**Independent Test**: Can be fully tested by creating a PO manually, verifying it appears in the PO list with correct vendor association, line items, and status. OCR and CSV import can be tested independently by uploading sample documents.

**Acceptance Scenarios**:

1. **Given** a business with active vendors, **When** the user opens the "Create Purchase Order" form and enters vendor, 3 line items with quantities and unit prices, and a required delivery date, **Then** a PO is created with status "draft," a system-generated PO number, and correct line-item totals.
2. **Given** a draft PO, **When** the user marks it as "issued," **Then** the PO status changes to "issued" and it becomes eligible for matching against incoming invoices and GRNs.
3. **Given** a PDF of an existing PO, **When** the user uploads it to the PO section, **Then** the OCR pipeline classifies it as `purchase_order`, extracts vendor name, PO number, line items (description, quantity, unit price), and delivery date — pre-populating a PO creation form for the user to review and confirm.
4. **Given** a CSV file containing PO data from an ERP export, **When** the user imports it using the CSV import flow, **Then** the system maps columns to PO fields (using the shared CSV parser with alias matching or AI fallback), previews the mapped data, and creates POs on confirmation.
5. **Given** the PO list view, **When** the user filters by status, vendor, or date range, **Then** only matching POs are displayed, sorted by most recent.
6. **Given** a PO linked to a vendor, **When** the user views the PO detail, **Then** vendor payment terms, contact details, and outstanding balance are shown in context.

---

### User Story 2 — Goods Received Note (GRN) Recording (Priority: P1)

A warehouse manager or business owner records what was actually received from a vendor against a specific PO. They select a PO, and the system pre-populates the GRN with the PO's line items and ordered quantities. The user enters the received quantities (which may differ from ordered), notes any damaged or rejected items, and saves the GRN. Alternatively, a delivery note document can be uploaded via OCR, or GRN data can be bulk-imported from a CSV/Excel file.

**Why this priority**: GRNs capture the physical reality of what was delivered versus what was ordered — the critical data needed for 3-way matching. Without GRNs, the system can only do 2-way matching (PO ↔ Invoice), which misses quantity discrepancies.

**Independent Test**: Can be fully tested by creating a GRN against an existing PO, entering received quantities that differ from ordered quantities, and verifying the GRN is saved with correct line-item detail and the PO status updates to "partially received" or "fully received."

**Acceptance Scenarios**:

1. **Given** an issued PO with 3 line items, **When** the user creates a GRN and selects that PO, **Then** the GRN form pre-populates with the PO's line items showing ordered quantities, and the user can enter received quantities per line.
2. **Given** a PO for 100 units of Item A, **When** the user records a GRN with 80 received and 5 rejected, **Then** the GRN saves with quantityReceived=80, quantityRejected=5, and the PO's received-to-date for Item A updates to 80.
3. **Given** a PO already partially received (first GRN for 50 of 100 units), **When** a second GRN is recorded for 40 more units, **Then** the PO's cumulative received quantity updates to 90 of 100, and the PO status remains "partially received."
4. **Given** all PO line items fully received across one or more GRNs, **When** the final GRN is saved, **Then** the PO status automatically transitions to "fully received."
5. **Given** a delivery note document (PDF/image), **When** the user uploads it, **Then** the OCR pipeline classifies it as `delivery_note`, extracts reference number, line items (description, quantity received), and links it to a PO if a PO reference is found. The user reviews and confirms before saving.
6. **Given** a CSV file containing GRN data, **When** the user imports it using the CSV import flow, **Then** the system maps columns to GRN fields, previews the mapped data, and creates GRNs on confirmation.

---

### User Story 3 — Automatic and Manual Matching (Priority: P1)

When a supplier invoice is processed through OCR, the system automatically attempts to find a matching PO by looking for a PO reference number in the invoice data. If a match is found, the system creates a match record linking the PO, invoice, and any related GRNs, then runs variance detection. If auto-match fails (no PO reference found, or ambiguous matches), the user can manually link an invoice to a PO from the invoice review screen or from a dedicated matching workspace.

**Why this priority**: Matching is the core value proposition — connecting the three documents to detect discrepancies before payment. Auto-match on upload minimizes manual effort, while manual matching handles the inevitable cases where references are missing or inconsistent.

**Independent Test**: Can be tested by creating a PO, then uploading an invoice that references that PO number, and verifying the system automatically creates a match record. Manual matching can be tested separately by creating unlinked documents and linking them through the UI.

**Acceptance Scenarios**:

1. **Given** PO-2024-001 exists in the system, **When** a supplier invoice is uploaded and OCR extracts `purchase_order_ref: "PO-2024-001"`, **Then** the system automatically creates a match record linking the invoice to PO-2024-001 and any GRNs linked to that PO.
2. **Given** an invoice with no PO reference, **When** the user opens the invoice review screen, **Then** a "Link to PO" action is available, showing a searchable list of open POs from the same vendor, filtered by compatible date range and amount.
3. **Given** an invoice manually linked to a PO, **When** the match is confirmed, **Then** the system runs variance detection on the linked documents and updates the match record with results.
4. **Given** 2-way matching mode (no GRN recorded yet), **When** an invoice is matched to a PO, **Then** the system compares PO line items to invoice line items (quantity and price) and reports a "2-way match" status with any variances found.
5. **Given** 3-way matching mode (GRN exists for the PO), **When** an invoice is matched to a PO, **Then** the system compares all three documents: PO ordered qty → GRN received qty → invoice billed qty, and PO unit price → invoice unit price.
6. **Given** multiple invoices for the same PO (partial invoicing), **When** a second invoice is linked to the same PO, **Then** the system tracks cumulative invoiced quantities and amounts against the PO totals.

---

### User Story 4 — Variance Detection and Tolerance Rules (Priority: P1)

After documents are matched, the system detects and categorizes variances: quantity variance (ordered vs. received vs. billed), price variance (PO price vs. invoice price), and missing document flags (invoice without GRN, PO without invoice). Variances within configurable tolerance thresholds are auto-approved; variances exceeding tolerances are flagged for review.

**Why this priority**: Variance detection is the intelligence layer that transforms matching from a bookkeeping exercise into a cost-control tool. Tolerance rules prevent the system from flagging every minor rounding difference, which would overwhelm users with false positives.

**Independent Test**: Can be tested by creating a match with known variances (e.g., invoice price 8% higher than PO price) and verifying the system correctly categorizes the variance type, calculates the percentage, and applies the correct tolerance threshold.

**Acceptance Scenarios**:

1. **Given** a matched PO (unit price MYR 10.00) and invoice (unit price MYR 10.00, same quantity), **When** variance detection runs, **Then** the match status is "matched — no variances" and auto-approved.
2. **Given** a matched PO (100 units) and invoice (105 units) with a quantity tolerance of ±5%, **When** variance detection runs, **Then** the variance is flagged as "over-invoiced by 5%" and auto-approved (within tolerance).
3. **Given** a matched PO (unit price MYR 10.00) and invoice (unit price MYR 11.50) with a price tolerance of ±5%, **When** variance detection runs, **Then** the variance is flagged as "price variance +15%" and marked for review (exceeds tolerance).
4. **Given** a PO with GRN (received 90 of 100 units) and invoice (billed for 100 units), **When** 3-way variance detection runs, **Then** the system flags "over-invoiced: billed 100 but only received 90" as a review-required variance.
5. **Given** a business with default tolerance thresholds (quantity ±10%, price ±5%), **When** the business owner navigates to matching settings, **Then** they can view and adjust both thresholds, with changes applying to future matches.
6. **Given** a matched invoice with a missing GRN, **When** variance detection runs, **Then** the match status is "partial match — GRN pending" and the match is flagged with a "missing GRN" indicator rather than blocked.

---

### User Story 5 — Match Review and Approval Workflow (Priority: P2)

A business owner or finance manager reviews flagged matches on a dedicated review screen. The screen shows a side-by-side comparison of the PO, invoice, and GRN (when available) with variances highlighted. The reviewer can approve a match (accepting the variance), reject it (returning the invoice for dispute), or put it on hold pending investigation. Approved matches allow the invoice to proceed to payment.

**Why this priority**: The review workflow is the user-facing decision point where variance data becomes actionable. Without it, flagged variances pile up with no resolution path. However, it builds on top of the matching engine (P1), so it is a natural second phase.

**Independent Test**: Can be tested by creating a match with flagged variances, navigating to the review screen, and verifying the side-by-side comparison shows correct data. Approve/reject actions can be tested and verified by checking status changes.

**Acceptance Scenarios**:

1. **Given** a match flagged for review due to a price variance, **When** the reviewer opens the match review screen, **Then** a side-by-side view shows PO line items, invoice line items, and GRN line items (if available) with the variant cells highlighted.
2. **Given** the review screen, **When** the reviewer approves the match with a note "vendor price increase approved per contract amendment," **Then** the match status changes to "approved," the note is saved, and the linked invoice is eligible for payment recording.
3. **Given** the review screen, **When** the reviewer rejects the match, **Then** the match status changes to "disputed," and the linked invoice status is flagged for vendor follow-up.
4. **Given** a match with "missing GRN" status, **When** a GRN is later recorded for the PO, **Then** the match is automatically re-evaluated with the new GRN data, and the "missing GRN" flag is resolved.
5. **Given** the match review list, **When** the reviewer filters by "needs review," **Then** only matches with variances exceeding tolerance are shown, sorted by variance severity (highest first).

---

### User Story 6 — Unmatched Documents Report (Priority: P2)

The business owner can view a report of all unmatched documents: POs without invoices (ordered but not yet billed), invoices without POs (received bills that don't match any PO), and POs without GRNs (ordered but delivery not recorded). This report helps identify procurement gaps, forgotten deliveries, and potential fraud (invoices for goods never ordered).

**Why this priority**: Unmatched document visibility closes the loop on the entire procure-to-pay cycle. It surfaces operational gaps that individual document views cannot reveal. This is a reporting view that leverages data already captured by the matching engine.

**Independent Test**: Can be tested by creating a mix of matched and unmatched POs, invoices, and GRNs, then viewing the unmatched report and verifying each category shows the correct documents.

**Acceptance Scenarios**:

1. **Given** 3 POs with no invoices received, **When** the user views the "POs without invoices" tab, **Then** those 3 POs are listed with vendor, PO number, total amount, and days since issuance.
2. **Given** 2 invoices from vendors with no matching PO, **When** the user views the "Invoices without POs" tab, **Then** those 2 invoices are listed with a prompt to either link to an existing PO or mark as "no PO required."
3. **Given** 1 PO fully received but no invoice received, **When** the user views the unmatched report, **Then** that PO appears in "POs without invoices" with an "overdue for invoicing" indicator if the expected invoice window has passed.
4. **Given** the unmatched report, **When** the user clicks on any unmatched document, **Then** they are taken to the document detail where they can initiate manual matching or take corrective action.

---

### User Story 7 — Matching Dashboard Integration (Priority: P2)

The existing AP dashboard is extended with a matching summary section showing: total matches (by status), matches pending review, variance trends, and auto-match success rate. This gives the business owner a single view of their procurement control health.

**Why this priority**: Dashboard integration surfaces matching health alongside existing AP metrics (aging, upcoming payments, spend analytics), giving a complete accounts payable picture. It builds on the existing AP dashboard infrastructure.

**Independent Test**: Can be tested by navigating to the AP dashboard with a mix of matched, pending, and flagged records, and verifying the matching summary cards and trends display correct data.

**Acceptance Scenarios**:

1. **Given** 20 matches total (15 auto-approved, 3 pending review, 2 disputed), **When** the user views the AP dashboard, **Then** the matching summary shows counts for each status category.
2. **Given** matching data over the last 90 days, **When** the user views the auto-match success rate, **Then** a percentage is displayed showing how many invoices were automatically matched to POs without manual intervention.
3. **Given** the matching dashboard, **When** the user clicks on the "pending review" count, **Then** they are navigated to the match review list filtered to pending items.

---

### User Story 8 — Fuzzy Line-Item Matching (Priority: P3)

When matching line items across PO, invoice, and GRN, the system handles real-world inconsistencies: item codes may differ between documents, descriptions may use abbreviations or different wording, and units of measurement may vary. The system uses a multi-tier matching strategy: exact item code match → normalized description match → amount-based fallback.

**Why this priority**: In practice, SEA SME documents are messy — a PO might say "A4 Paper 80gsm (500 sheets)" while the invoice says "Paper A4 80g x500." Fuzzy matching makes the system usable in real-world conditions rather than only working with perfectly consistent data.

**Independent Test**: Can be tested by creating a PO with item "A4 Paper 80gsm (500 sheets)" and an invoice with "Paper A4 80g x500" and verifying the system matches them as the same line item.

**Acceptance Scenarios**:

1. **Given** a PO line item with itemCode "SKU-001" and an invoice line item with itemCode "SKU-001," **When** line-item matching runs, **Then** the items are matched by exact code with high confidence.
2. **Given** a PO line with description "Printer Paper A4 80gsm" and an invoice line with description "A4 Paper 80g," **When** no item code match exists, **Then** the system uses normalized description matching and suggests a match with a confidence score.
3. **Given** no code or description match, **When** the PO has one line for MYR 500.00 and the invoice has one line for MYR 500.00, **Then** the system falls back to amount-based matching and suggests the match with a lower confidence score.
4. **Given** a suggested fuzzy match with low confidence, **When** the match is presented to the user, **Then** the user can confirm or reject the suggested line-item pairing.

---

### Edge Cases

- What happens when an invoice references a PO number that doesn't exist in the system? The system flags the invoice as "PO not found" and suggests manual matching. The user can create the PO retroactively or mark the invoice as "no PO required."
- How does the system handle cancelled POs? Cancelled POs are excluded from auto-matching. If an invoice arrives for a cancelled PO, the match is flagged with a "cancelled PO" warning for manual review.
- What happens when a vendor sends a credit note that offsets a previous invoice? Credit notes are treated as negative invoices. The match record shows the net position (original invoice minus credit note) against the PO.
- How does the system handle POs in one currency and invoices in another? The match compares amounts in the PO's original currency. If the invoice uses a different currency, the user must manually confirm the exchange rate before the match can be evaluated.
- What happens when a single invoice covers multiple POs? The system supports many-to-many matching. An invoice can be split across multiple POs, and a PO can have multiple invoices. Each match record tracks which specific line items are paired.
- How does the system handle a GRN without a PO (ad-hoc delivery)? GRNs can be created without a PO reference. These standalone GRNs appear in the unmatched report and can be linked to an invoice directly for 2-way matching (GRN ↔ Invoice).
- What happens when OCR extraction confidence for a PO or delivery note is low? The system presents the extracted data in a review form with low-confidence fields highlighted. The user must confirm or correct before the document is saved.

## Requirements *(mandatory)*

### Functional Requirements

**Purchase Order Management**

- **FR-001**: System MUST support creating purchase orders with: vendor, PO date, required delivery date, line items (description, quantity, unit price, optional item code, optional unit of measurement), currency, and notes.
- **FR-002**: System MUST auto-generate unique PO numbers per business using a configurable prefix and sequential counter (e.g., PO-2026-001).
- **FR-003**: System MUST track PO status through a defined lifecycle: draft → issued → partially received → fully received → invoiced → closed → cancelled. Only draft POs are editable; once issued, the PO is locked. Changes require cancellation and re-creation of a new PO.
- **FR-004**: System MUST support creating POs from three sources: manual form entry, OCR extraction from uploaded documents (leveraging existing `purchase_order` document type), and CSV/Excel import (leveraging existing shared CSV parser).
- **FR-005**: System MUST display a PO list view with filtering by status, vendor, date range, and search by PO number.
- **FR-006**: System MUST link POs to existing vendors, displaying vendor context (payment terms, outstanding balance) during PO creation.

**Goods Received Note (GRN) Recording**

- **FR-007**: System MUST support recording GRNs linked to a specific PO, with the GRN form pre-populated from the PO's line items and ordered quantities.
- **FR-008**: System MUST capture per-line received quantity, rejected quantity, item condition (good, damaged, rejected), and optional notes.
- **FR-009**: System MUST support multiple GRNs per PO (partial deliveries), tracking cumulative received quantities across all GRNs for each PO line item.
- **FR-010**: System MUST automatically update PO status to "partially received" or "fully received" based on cumulative received quantities relative to ordered quantities.
- **FR-011**: System MUST support creating GRNs from three sources: manual form entry (pre-populated from PO), OCR extraction from uploaded delivery notes (leveraging existing `delivery_note` document type), and CSV/Excel import.
- **FR-012**: System MUST support standalone GRNs without a PO reference (for ad-hoc deliveries).
- **FR-013**: System MUST auto-generate unique GRN numbers per business using a configurable prefix and sequential counter.

**Matching Engine**

- **FR-014**: System MUST automatically attempt to match an incoming invoice to a PO when the invoice contains a PO reference number (extracted via OCR from the existing `purchase_order_ref` field in `InvoiceSpecificData`).
- **FR-015**: System MUST support manual matching, allowing users to link an unmatched invoice to a PO from a searchable list of open POs for the same vendor.
- **FR-016**: System MUST support both 2-way matching (PO ↔ Invoice, when no GRN exists) and 3-way matching (PO ↔ Invoice ↔ GRN, when GRN exists).
- **FR-017**: System MUST support many-to-many matching: one invoice may reference multiple POs, and one PO may have multiple invoices (partial invoicing).
- **FR-018**: System MUST create match records that link the specific line items matched across documents, not just document-level links.

**Variance Detection**

- **FR-019**: System MUST detect and categorize the following variance types: quantity over-invoiced, quantity under-invoiced, price variance (higher or lower), missing GRN (invoice without goods receipt), and over-received (GRN quantity exceeds PO quantity).
- **FR-020**: System MUST calculate variance as both absolute amount and percentage for each flagged item.
- **FR-021**: System MUST support configurable tolerance thresholds at the business level: quantity variance threshold (default ±10%) and price variance threshold (default ±5%).
- **FR-022**: System MUST auto-approve matches where all line-item variances fall within tolerance thresholds.
- **FR-023**: System MUST flag matches for manual review when any line-item variance exceeds tolerance thresholds.

**Match Review and Approval**

- **FR-024**: System MUST provide a match review screen showing a side-by-side comparison of PO, invoice, and GRN line items with variant cells highlighted.
- **FR-025**: Reviewers with admin or manager roles MUST be able to approve, reject (dispute), or put on hold any flagged match, with mandatory notes for reject and hold actions. Employees can view match details and status but MUST NOT have access to approval actions.
- **FR-026**: Matching MUST gate payable creation: invoices linked to a PO MUST have an approved match (or be explicitly marked "no PO required") before the user can create an accounting entry (payable) from them. Invoices not linked to any PO follow the existing payable creation flow unchanged.
- **FR-027**: When a missing GRN is later recorded for a PO, the system MUST automatically re-evaluate any "missing GRN" flagged matches.

**Unmatched Documents**

- **FR-028**: System MUST provide an unmatched documents report with three tabs: POs without invoices, invoices without POs, and POs without GRNs.
- **FR-029**: Users MUST be able to take action from the unmatched report: initiate manual matching, create a missing document, or mark as "no match required" with a reason.

**Line-Item Matching**

- **FR-030**: System MUST match line items using a multi-tier strategy: (1) exact item code match, (2) normalized description match (fuzzy), (3) amount-based fallback.
- **FR-031**: System MUST assign a confidence score to each line-item match and present low-confidence matches for user confirmation.
- **FR-032**: System MUST allow users to manually pair line items when automatic matching produces unsatisfactory results.

**Dashboard Integration**

- **FR-033**: System MUST extend the existing AP dashboard with a matching summary section showing: total matches by status, matches pending review count, and auto-match success rate.
- **FR-034**: Clicking on summary counts MUST navigate to the relevant filtered view (e.g., clicking "pending review" opens the review list).

**Navigation & Layout**

- **FR-035**: PO management, GRN management, and matching views MUST be accessible as tabs or sections within the existing Payables page, alongside the current AP dashboard, vendor aging, and upcoming payments views.

### Key Entities

- **Purchase Order (PO)**: A commitment to buy goods or services from a vendor. Key attributes: PO number, vendor, PO date, required delivery date, line items (description, item code, quantity, unit price, total, currency, unit of measurement), total amount, status (draft/issued/partially received/fully received/invoiced/closed/cancelled), source document (optional — for OCR-created POs), created by user.
- **Goods Received Note (GRN)**: A record of goods physically received from a vendor, typically against a PO. Key attributes: GRN number, linked PO (optional), vendor, GRN date, line items (description, item code, quantity ordered, quantity received, quantity rejected, condition, notes), received by user, source document (optional — for OCR-created GRNs).
- **Match Record**: A link between a PO, one or more invoices, and zero or more GRNs, capturing the reconciliation outcome. Key attributes: linked PO, linked invoices, linked GRNs, match type (2-way or 3-way), overall match status (matched/pending review/approved/disputed/on hold), line-item pairings with variance details, reviewer, review notes, review date.
- **Variance**: A detected discrepancy within a match record at the line-item level. Key attributes: variance type (quantity over-invoiced, quantity under-invoiced, price variance, over-received, missing GRN), affected line item, expected value (from PO), actual value (from invoice or GRN), absolute difference, percentage difference, whether it exceeds tolerance.

## Assumptions

- The existing `accounting_entries` table (Expense/COGS type) will continue to represent the payable. PO matching enriches but does not replace the payable lifecycle.
- OCR extraction prompts for `purchase_order` and `delivery_note` document types need to be implemented but the classification pipeline already supports these types.
- The shared CSV parser (`src/lib/csv-parser/`) will be extended with new schema definitions for PO and GRN field mappings (sales statement and bank statement schemas already exist).
- The existing `InvoiceSpecificData.purchase_order_ref` field is the primary auto-match trigger — when OCR extracts a PO reference from an invoice, auto-matching kicks in.
- PO numbers are unique within a business but not globally. Cross-business PO number collisions are not a concern.
- Tolerance thresholds (quantity ±10%, price ±5%) are reasonable defaults for SEA SMEs. These can be adjusted per business.
- Multi-currency matching compares amounts in the PO's original currency. Cross-currency PO/invoice pairs require user confirmation of the exchange rate.
- The existing vendor price history will be updated when PO line items are recorded, enriching the price intelligence data.
- GRNs are event-based (one per delivery), not cumulative. The system tracks cumulative totals by summing across GRNs.

## Scope Exclusions

- **Procurement approval workflows**: PO approval chains (requiring manager sign-off before issuing a PO) are out of scope. SMEs under 50 employees typically have owner-issued POs.
- **Vendor portal**: No vendor-facing interface for PO acknowledgment or delivery scheduling.
- **Automated re-ordering**: No minimum stock level triggers or automatic PO generation.
- **Return-to-vendor (RTV) management**: Rejected goods tracking beyond the GRN's rejected quantity field is excluded.
- **Contract management**: Long-term vendor contracts with pricing schedules are not tracked.
- **Budget checking**: Validating POs against departmental budgets is deferred.
- **Per-vendor tolerance overrides**: Business-level tolerances only in this release; per-vendor customization is a future enhancement.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a purchase order with 5 line items in under 3 minutes via manual form entry.
- **SC-002**: Users can record a GRN against a PO (pre-populated form) in under 2 minutes for a 5-line-item PO.
- **SC-003**: At least 60% of invoices from vendors with POs are automatically matched without manual intervention (measured after 30 days of usage with PO data in the system).
- **SC-004**: Variance detection identifies and categorizes all line-item discrepancies with correct variance type and percentage within 5 seconds of match creation.
- **SC-005**: Match review (approve/reject) can be completed in under 3 clicks from the flagged match notification.
- **SC-006**: The unmatched documents report accurately reflects all documents not yet linked to a complete match set.
- **SC-007**: Users can import 50+ POs from a CSV/Excel file in a single operation using the shared CSV parser.
- **SC-008**: The matching dashboard summary loads within acceptable response time for businesses with up to 500 active POs.
- **SC-009**: Zero false auto-approvals: no match with variance exceeding configured tolerance is auto-approved.
- **SC-010**: OCR extraction of PO and delivery note documents achieves at least 85% field-level accuracy on standard SEA business documents (benchmarked against manually entered values).

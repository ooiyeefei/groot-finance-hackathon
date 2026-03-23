# Feature Specification: Aging Payable & Receivable Reports

**Feature Branch**: `035-aging-payable-receivable-report`
**Created**: 2026-03-23
**Status**: Draft
**Input**: GitHub Issue #318 — AP/AR aging reports with automated monthly generation, per-debtor/vendor statements, review-then-send workflow, and AI insights layer
**Design**: `docs/plans/2026-03-23-aging-reports-design.md`

## User Scenarios & Testing *(mandatory)*

### User Story 1 - On-Demand AP/AR Aging Report Generation (Priority: P1)

A business owner or finance admin navigates to the Reports page, selects a report type (AP Aging or AR Aging), picks an "as of" date, and generates a professional PDF report. The report shows all outstanding invoices grouped by vendor (AP) or customer (AR) in standard aging buckets: Current, 1-30 days, 31-60 days, 61-90 days, and 90+ days overdue. The user can download the PDF or view it on screen.

**Why this priority**: This is the core feature — generating the actual report. Without this, nothing else works. It delivers immediate value: business owners can produce professional aging reports on demand instead of manually building spreadsheets.

**Independent Test**: Can be fully tested by navigating to the Reports page, selecting "AR Aging", picking today's date, and generating a PDF. Delivers a downloadable aging report grouped by customer with aging buckets and totals.

**Acceptance Scenarios**:

1. **Given** a business with 10 outstanding sales invoices across 5 customers, **When** the owner generates an AR Aging report as of today, **Then** the system produces a PDF showing all 5 customers with their invoices distributed across the correct aging buckets, with per-customer subtotals and a grand total.
2. **Given** a business with posted purchase invoices from 8 vendors, **When** the finance admin generates an AP Aging report as of March 1 2026, **Then** the PDF shows all vendors with outstanding amounts in the correct aging buckets based on each invoice's due date relative to March 1.
3. **Given** a business with no outstanding invoices, **When** the owner generates an AR Aging report, **Then** the system produces a PDF with a clear "No outstanding receivables" message and zero totals.
4. **Given** a partially paid invoice (RM 10,000 total, RM 6,000 paid), **When** the aging report is generated, **Then** only the outstanding balance (RM 4,000) appears in the aging bucket — not the full invoice amount.

---

### User Story 2 - Automated Monthly Report Generation with Owner Notification (Priority: P1)

On the 1st of each month, the system automatically generates consolidated AP and AR aging reports plus individual debtor/vendor statements for each business. The owner receives both an Action Center notification and an email with a summary snapshot (total outstanding, overdue amount, debtor count) and the consolidated report attached. The email includes a table of the top 5 debtors by amount owed.

**Why this priority**: Automation is the key differentiator — businesses shouldn't have to remember to generate reports each month. Combined with P1 (report generation), this delivers the full "CFO Copilot" experience.

**Independent Test**: Can be tested by triggering the monthly generation job for a business and verifying that: (1) consolidated PDFs are created and stored, (2) individual debtor statements are created, (3) Action Center notification appears, (4) owner receives email with summary and attached PDF.

**Acceptance Scenarios**:

1. **Given** a business with outstanding AR invoices, **When** the 1st of the month arrives, **Then** the system generates a consolidated AR aging report, individual statements for each debtor, stores all PDFs, and notifies the owner via Action Center and email.
2. **Given** a business with both AP and AR outstanding, **When** monthly generation runs, **Then** both AP and AR consolidated reports are generated along with individual statements for debtors (AR) and vendors (AP).
3. **Given** the owner has email notifications enabled, **When** monthly reports are generated, **Then** the owner receives an email with: subject line including month/year and statement count, inline summary metrics, top 5 debtors table, CTA button linking to review page, and attached consolidated PDF.
4. **Given** a business with zero outstanding invoices, **When** monthly generation runs, **Then** no reports are generated and the owner receives a brief "All clear — no outstanding payables or receivables" notification.

---

### User Story 3 - Per-Debtor Statement Review & Send (Priority: P2)

After monthly reports are generated, the owner opens a Statements Review page showing all individual debtor statements for that month. Each entry shows the debtor name, total amount owed, number of outstanding invoices, and a preview button. The owner can selectively send statements to debtors or click "Send All." Each debtor receives a professional email with their individual statement PDF attached and a polite message stating their outstanding balance.

**Why this priority**: This transforms aging reports from passive documents into an active collections workflow. High value but depends on P1 report generation being complete.

**Independent Test**: Can be tested by generating monthly statements, opening the review page, previewing a debtor statement, selecting 3 debtors, clicking "Send Selected", and verifying each debtor receives the correct email with the correct PDF attached.

**Acceptance Scenarios**:

1. **Given** 12 debtor statements pending review, **When** the owner opens the Statements Review page, **Then** all 12 appear in a list with debtor name, amount owed, invoice count, and a send checkbox for each.
2. **Given** the owner selects 5 debtors and clicks "Send Selected", **When** the system processes the send, **Then** each of the 5 debtors receives an email with subject "Statement of Account — [Business Name] — [Month Year]", a polite body stating total outstanding, and their individual statement PDF attached. The reply-to address is the business contact email.
3. **Given** a debtor has a statement with unreconciled transactions (see Story 5), **When** the statement is sent, **Then** the email includes a disclaimer: "If you have recently made a payment, it may not yet be reflected in this statement."
4. **Given** the owner clicks "Send All", **When** the system processes, **Then** all pending statements are sent and the review page updates to show "Sent" status on each row.

---

### User Story 4 - Auto-Send Opt-In for Recurring Debtors (Priority: P3)

After manually reviewing and sending statements for a few months, the owner can enable auto-send — either globally or per debtor. When auto-send is enabled for a debtor, their statement is automatically emailed on the 1st of each month without requiring manual review. The review page shows a banner encouraging auto-send adoption. New debtors (first-time statements) always require manual review before they can be set to auto-send.

**Why this priority**: Convenience feature that builds on the review workflow. Not essential for MVP but significantly reduces monthly effort for returning debtors.

**Independent Test**: Can be tested by enabling auto-send for 3 debtors in settings, triggering monthly generation, and verifying those 3 receive emails automatically while other debtors appear in the review queue.

**Acceptance Scenarios**:

1. **Given** the owner enables auto-send for Debtor A and Debtor B, **When** monthly generation runs, **Then** Debtor A and B receive statements automatically and do not appear in the review queue. Other debtors appear in the review queue as usual.
2. **Given** the Statements Review page is displayed, **When** the owner views it, **Then** a banner at the top reads "Tired of reviewing every month? Enable auto-send to deliver statements automatically" with a link to settings.
3. **Given** a debtor who has never received a statement before, **When** monthly generation runs, **Then** that debtor always appears in the review queue regardless of global auto-send settings.
4. **Given** auto-send is enabled globally, **When** the owner views the monthly email notification, **Then** it states "Auto-send is ON — N statements will be sent automatically. M new debtors need your review."

---

### User Story 5 - Pre-Generation Reconciliation Check (Priority: P2)

Before generating monthly aging reports, the system scans unreconciled bank transactions for potential matches against outstanding invoices. If matches are found, the owner sees a reconciliation queue: "3 bank transactions may match outstanding invoices — review before generating statements." The owner can reconcile (write off matched invoices) or skip. If skipped, reports generate with a warning section noting unreconciled transactions that may affect accuracy.

**Why this priority**: Critical for report accuracy — prevents sending "you owe us" statements to debtors who already paid. This is where AI (fuzzy matching) genuinely adds value.

**Independent Test**: Can be tested by creating a bank transaction matching an outstanding invoice (same amount, similar date), triggering monthly generation, and verifying the system flags the match in the reconciliation queue before proceeding.

**Acceptance Scenarios**:

1. **Given** a bank deposit of RM 5,000 on Feb 28 and an outstanding AR invoice of RM 5,000 from Customer X due Feb 25, **When** monthly generation starts, **Then** the system flags this as a potential match and shows it in the reconciliation queue before generating reports.
2. **Given** 3 flagged matches in the reconciliation queue, **When** the owner reviews and confirms 2 matches (writes off those invoices), **Then** the confirmed invoices are marked as paid and excluded from the aging report. The 1 unconfirmed match remains outstanding.
3. **Given** flagged matches exist but the owner clicks "Skip — Generate Anyway", **When** reports are generated, **Then** the consolidated report includes a warning section listing unreconciled transactions, and debtor statement emails include a disclaimer about potential unreconciled payments.
4. **Given** no unreconciled bank transactions match outstanding invoices, **When** monthly generation starts, **Then** reports generate immediately without showing the reconciliation queue.

---

### User Story 6 - AI Insights on Consolidated Report (Priority: P3)

The consolidated aging report includes an optional AI-generated insights section at the top. This section provides trend analysis (e.g., "AR collection rate dropped from 85% to 71% vs last month"), concentration risk warnings (e.g., "3 vendors account for 78% of overdue AP"), and actionable recommendations (e.g., "Debtor XYZ has been consistently late for 3 months — consider adjusting credit terms"). These insights also appear in the owner's monthly email and Action Center card.

**Why this priority**: Adds genuine intelligence on top of deterministic data. Not required for the core report to be useful, but differentiates Groot from spreadsheet exports.

**Independent Test**: Can be tested by generating a consolidated report for a business with several months of history and verifying the insights section contains relevant, accurate observations about trends and risks.

**Acceptance Scenarios**:

1. **Given** a business with 3+ months of AR data showing declining collection rates, **When** the consolidated AR aging report is generated, **Then** the AI insights section includes a trend observation comparing current vs previous month collection rate.
2. **Given** a single debtor accounts for more than 50% of total overdue AR, **When** the report is generated, **Then** insights include a concentration risk warning naming that debtor.
3. **Given** the AI service is unavailable (API error or timeout), **When** the report is generated, **Then** the report generates successfully without the insights section — all deterministic data is still accurate and complete.
4. **Given** a business with minimal data (fewer than 5 invoices), **When** the report is generated, **Then** insights are omitted rather than generating low-confidence observations.

---

### User Story 7 - Reports Page & History (Priority: P2)

A unified Reports page accessible from the sidebar shows: (1) a "Pending Review" section at the top when monthly statements await sending, (2) a "Generate Report" button for on-demand generation, and (3) a historical list of all previously generated reports with download links. Users can filter history by report type and date range.

**Why this priority**: Provides the navigation home for all report functionality. Depends on P1 generation but is needed for the full experience.

**Independent Test**: Can be tested by generating several reports across different months, navigating to the Reports page, and verifying all appear in the history list with correct metadata and working download links.

**Acceptance Scenarios**:

1. **Given** the owner has generated 3 monthly reports and 2 ad-hoc reports, **When** they visit the Reports page, **Then** all 5 reports appear in the history sorted by date (newest first) with type, date, generation method (auto/manual), and download button.
2. **Given** monthly statements are pending review, **When** the owner visits the Reports page, **Then** a "Pending Review" banner appears at the top showing the count of unsent statements with a link to the Statements Review page.
3. **Given** the owner clicks "Generate Report", **When** they select "AR Aging" and pick a date, **Then** the report generates and appears in the history list immediately with a download link.

---

### Edge Cases

- What happens when a debtor has no email address on file? System flags them in the review queue as "No email — cannot send" and excludes from auto-send. Email resolution: billing/AP contact email takes priority; if absent, falls back to primary business email from customer record.
- What happens when the monthly job runs but the business has been inactive (no invoices for 6+ months)? No report is generated; owner gets a brief "no activity" notification.
- What happens when an invoice's due date is missing? Invoice is placed in the "Current" bucket with a note "(no due date)".
- How does the system handle multi-currency invoices? Reports display in the business's home currency. Individual invoices show original currency with converted amount.
- What if two monthly jobs overlap (e.g., previous month's job is still processing)? Second job waits or skips with a log entry — no duplicate reports generated for the same period.
- What if a debtor's statement was already sent and the owner later reconciles a payment? The sent statement cannot be recalled, but the next month's statement reflects the updated balance.
- What if the owner doesn't respond to the reconciliation queue? After 48 hours, the system auto-generates reports with warnings and disclaimers. The reconciliation flags remain available for the owner to resolve later — they don't expire.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST generate AP Aging reports from posted/completed purchase invoices, grouped by vendor, with aging buckets (Current, 1-30, 31-60, 61-90, 90+ days) based on invoice due date relative to the "as of" date.
- **FR-002**: System MUST generate AR Aging reports from outstanding sales invoices, grouped by customer, with the same aging bucket structure as AP.
- **FR-003**: Aging amounts MUST reflect only outstanding balances (total amount minus paid amount), not full invoice amounts for partially paid invoices.
- **FR-004**: System MUST produce PDF reports with professional formatting including business name, report title, "as of" date, column headers, per-entity subtotals, and grand totals.
- **FR-005**: System MUST support on-demand report generation where users select report type and "as of" date.
- **FR-006**: System MUST automatically generate both AP and AR aging reports on the 1st of each month for every active business.
- **FR-007**: System MUST generate individual debtor statements (one PDF per customer with outstanding balance) and individual vendor statements (one PDF per vendor) as part of monthly generation.
- **FR-008**: System MUST store all generated PDFs with metadata (report type, as-of date, generation timestamp, generated by user or system). Reports MUST be retained for 12 months, then automatically deleted. Owners can re-generate older reports on demand.
- **FR-009**: System MUST notify the business owner via both in-app notification and email when monthly reports are ready for review.
- **FR-010**: Owner notification email MUST include an inline summary (total outstanding, overdue amount and percentage, debtor count), a table of top 5 debtors by amount owed, a link to the review page, and the consolidated report as an attachment.
- **FR-011**: System MUST provide a Statements Review page where owners can preview, selectively send, or "Send All" debtor statements.
- **FR-012**: Debtor statement emails MUST be sent to the debtor's billing/AP contact email if available, otherwise the primary business email from the customer record. Emails MUST include the individual statement PDF, a polite message with total outstanding amount, and use the business contact email as reply-to address.
- **FR-013**: System MUST support per-debtor and global auto-send toggle. When enabled, statements for that debtor are sent automatically without manual review.
- **FR-014**: New debtors (first-time statement recipients) MUST always require manual review before their first statement is sent, regardless of auto-send settings.
- **FR-015**: Before monthly report generation, system MUST scan unreconciled bank transactions for potential matches against outstanding invoices using amount, reference, date proximity, and fuzzy name matching.
- **FR-016**: When potential matches are found, system MUST present a reconciliation queue to the owner before generating reports, with the option to confirm matches (write off invoices) or skip. If the owner does not act within 48 hours, the system MUST auto-generate reports with warnings and disclaimers.
- **FR-017**: When the owner skips reconciliation, reports MUST include a warning section noting unreconciled transactions, and debtor emails MUST include a disclaimer about potential unreconciled payments.
- **FR-018**: Consolidated reports MUST include an optional AI insights section with trend analysis, concentration risk warnings, and actionable recommendations when sufficient historical data exists.
- **FR-019**: AI insights MUST be optional — if the AI service is unavailable, reports generate without the insights section with no degradation to deterministic data.
- **FR-020**: System MUST provide a Reports page accessible from the sidebar showing pending review items, a generate button, and a searchable history of all generated reports with download links.
- **FR-021**: Reports MUST only be accessible to users with finance_admin or owner roles.

### Key Entities

- **Generated Report**: A stored report instance — type (AP Aging, AR Aging), as-of date, generation method (manual or auto-monthly), file reference, generation timestamp, business association.
- **Debtor Statement**: An individual statement for a specific customer — linked to a generated report, customer reference, total outstanding amount, send status (pending, sent, auto-sent), sent timestamp, email delivery status.
- **Vendor Statement**: An individual statement for a specific vendor — same structure as debtor statement but for AP side.
- **Report Schedule Settings**: Per-business configuration — auto-generation enabled/disabled, auto-send global toggle, per-debtor auto-send overrides, notification preferences.
- **Reconciliation Flag**: A potential match between an unreconciled bank transaction and an outstanding invoice — match confidence, matched amounts, resolution status (pending, confirmed, dismissed).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Business owners can generate a professional AP or AR aging report in under 30 seconds from clicking "Generate" to having a downloadable PDF.
- **SC-002**: Monthly automated reports are generated and notifications delivered within 5 minutes of the scheduled time for all active businesses.
- **SC-003**: 80% of debtor statements are reviewed and sent within 48 hours of monthly generation (measuring owner engagement with the review workflow).
- **SC-004**: After 3 months of usage, at least 30% of businesses enable auto-send for one or more debtors (measuring trust progression).
- **SC-005**: Pre-generation reconciliation check correctly identifies 90%+ of matching bank transactions against outstanding invoices (measured by owner confirmation rate).
- **SC-006**: Zero incorrect aging bucket calculations — invoices are always placed in the correct bucket based on days overdue relative to the as-of date.
- **SC-007**: Debtor statement emails achieve a delivery rate above 95% (excluding invalid email addresses).
- **SC-008**: AI insights, when available, are rated as "useful" or "accurate" by 70%+ of owners who view them (measured via optional feedback).

## Clarifications

### Session 2026-03-23

- Q: How long should generated reports and debtor statements be retained? → A: 12 months, then auto-deleted. Owner can re-generate older reports on demand if needed.
- Q: What happens if the owner doesn't respond to the reconciliation queue? → A: 48-hour timeout. If owner doesn't act within 48 hours of notification, system auto-generates reports with warnings and disclaimers.
- Q: Which email address should be used for debtor statement delivery? → A: Billing/AP contact email if available, otherwise primary business email from the customer record.

## Assumptions

- Businesses have debtor/customer email addresses stored in the system (from sales invoices or customer records). Debtors without email are flagged but not blocking.
- The existing email infrastructure and sending limits are sufficient for statement delivery volumes.
- The existing bank reconciliation matching logic can be reused for the pre-generation reconciliation check.
- Business home currency is set and consistent for all report calculations.
- The existing PDF template infrastructure supports the required report layouts.
- Monthly triggers can be added to the existing scheduled job infrastructure.

## Out of Scope

- Payable/Receivable summary reports (different aggregation, can be added as separate report types later)
- Bank reconciliation statement (separate data source and workflow)
- Payment links in debtor statement emails (future feature)
- Vendor statement auto-send (AP side — owners typically don't send statements to their vendors)
- Custom aging bucket configuration (standard 30/60/90/90+ is used; customization can be added later)
- Report scheduling on dates other than the 1st of the month

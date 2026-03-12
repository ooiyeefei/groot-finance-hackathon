# Feature Specification: Bank Statement Import & Auto-Reconciliation

**Feature Branch**: `021-bank-statement-import-recon`
**Created**: 2026-03-11
**Status**: Draft
**Input**: User description: "Bank Statement Import & Auto-Reconciliation — GitHub Issue #274, leveraging CSV parser from #272"
**GitHub Issue**: [#274](https://github.com/grootdev-ai/groot-finance/issues/274)

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Import Bank Statement (Priority: P1)

As a finance team member, I want to upload a bank statement file (CSV or Excel) and have the system automatically parse and store the transactions, so that I have a digital record of all bank activity within Groot without manual data entry.

**Why this priority**: Without imported bank transactions, no reconciliation can happen. This is the foundational data ingestion step that everything else builds on.

**Independent Test**: Can be fully tested by uploading a CSV bank statement and verifying transactions appear in a list view. Delivers immediate value by replacing manual bank statement tracking in spreadsheets.

**Acceptance Scenarios**:

1. **Given** a user has a bank account registered, **When** they upload a CSV bank statement file, **Then** the system parses the file using the shared CSV parser (column mapping + template save), extracts each transaction row, and stores them as individual bank transaction records linked to that bank account.
2. **Given** a user uploads a file they have already imported (same bank account + overlapping date range), **When** the system processes the file, **Then** duplicate transactions are detected by matching (date + amount + description) and the user is warned before proceeding. Already-imported transactions are skipped.
3. **Given** a user uploads their second statement from the same bank, **When** the system opens the CSV parser, **Then** the saved column mapping template is auto-detected (by header fingerprint) and applied — zero manual mapping needed.

---

### User Story 2 — Register Bank Accounts (Priority: P1)

As a finance team member, I want to register my business bank accounts (bank name, account number, currency) so that imported transactions are organized per account and matching context is accurate.

**Why this priority**: Bank accounts provide essential context for organizing transactions and configuring matching rules. A prerequisite for meaningful import and reconciliation.

**Independent Test**: Can be tested by adding a bank account and verifying it appears in a bank accounts list. Delivers value as a structured directory of business bank accounts.

**Acceptance Scenarios**:

1. **Given** a user is on the bank reconciliation page, **When** they add a new bank account (bank name, account number, currency, optional nickname), **Then** the account is saved and available for selection during import.
2. **Given** a user has multiple bank accounts, **When** they view the bank accounts list, **Then** each account shows its name, last imported statement date, and transaction count.
3. **Given** a user wants to edit or deactivate a bank account, **When** they modify the account, **Then** existing transactions remain linked and the account can be reactivated later.

---

### User Story 3 — Auto-Match Bank Transactions to Internal Records (Priority: P1)

As a finance team member, I want the system to automatically match bank credits to recorded payments/invoices and bank debits to expense reimbursements, so that I can instantly see which transactions are already accounted for.

**Why this priority**: Auto-matching is the core value proposition — it transforms a tedious manual cross-referencing task into an automated one. Without it, the feature is just a data viewer.

**Independent Test**: Can be tested by importing a bank statement with transactions that correspond to existing payments/invoices, then verifying the system suggests correct matches with confidence scores.

**Acceptance Scenarios**:

1. **Given** a bank credit transaction exists with amount $1,500 and reference "INV-2026-001", **When** the matching engine runs, **Then** it matches this transaction to the sales invoice with number INV-2026-001 (or the payment recorded against it) with high confidence.
2. **Given** a bank credit matches a recorded payment by amount + date (±3 days) but has no reference, **When** the matching engine runs, **Then** it suggests the match with medium confidence and presents it for user confirmation.
3. **Given** a bank debit transaction matches an approved expense claim reimbursement by amount, **When** the matching engine runs, **Then** it suggests the match linking the bank debit to the expense claim.
4. **Given** a bank transaction has no matching internal record, **When** the matching engine runs, **Then** the transaction is flagged as "unmatched" for manual review.
5. **Given** multiple internal records could match a single bank transaction, **When** the matching engine runs, **Then** all candidates are presented with confidence scores, and the user picks the correct one.

---

### User Story 4 — Reconciliation Dashboard (Priority: P2)

As a finance team member, I want a dashboard showing all imported bank transactions organized by reconciliation status (matched, suggested, unmatched), so that I can quickly see what needs my attention and track progress toward full reconciliation.

**Why this priority**: The dashboard is the primary workspace for the reconciliation workflow. While the matching engine does the heavy lifting, users need a clear interface to review results and take action.

**Independent Test**: Can be tested by importing a bank statement and verifying the dashboard shows correct counts and allows filtering by status. Delivers value as a reconciliation command center.

**Acceptance Scenarios**:

1. **Given** a bank account has imported transactions with mixed statuses, **When** the user opens the reconciliation dashboard, **Then** they see a summary bar showing counts for: Matched, Suggested (needs confirmation), Unmatched, and a reconciliation progress percentage.
2. **Given** the user wants to focus on a specific period, **When** they select a date range, **Then** the transaction list and summary update to reflect only that period.
3. **Given** the user wants to filter by status, **When** they select "Unmatched" filter, **Then** only unmatched transactions are displayed.

---

### User Story 5 — Confirm, Reject, and Manually Match Transactions (Priority: P2)

As a finance team member, I want to confirm suggested matches, reject incorrect suggestions, and manually link unmatched bank transactions to the correct internal record, so that I maintain full control over reconciliation accuracy.

**Why this priority**: Auto-matching won't be 100% accurate. Users need the ability to override, correct, and complete the reconciliation manually for the remaining transactions.

**Independent Test**: Can be tested by confirming a suggested match, rejecting another, and manually linking an unmatched transaction to an invoice. All three actions should update reconciliation status correctly.

**Acceptance Scenarios**:

1. **Given** a bank transaction has a suggested match, **When** the user confirms the match, **Then** both the bank transaction and the internal record are marked as "reconciled" and linked.
2. **Given** a bank transaction has an incorrect suggested match, **When** the user rejects the suggestion, **Then** the transaction reverts to "unmatched" and the rejected match is not suggested again.
3. **Given** an unmatched bank transaction, **When** the user searches for an internal record (by invoice number, amount, or date), **Then** they can select a record and create a manual match.
4. **Given** a reconciled match was made in error, **When** the user unmatch/unreconciles it, **Then** both the bank transaction and internal record return to their previous states.

---

### User Story 6 — Reconciliation Summary & Period Closing (Priority: P3)

As a finance team member, I want to generate a reconciliation summary for a specific period showing all matched, unmatched, and variance items, so that I can close the period with confidence and share the summary with stakeholders.

**Why this priority**: Period closing and reporting are important for audit trails and management reporting, but the core value is delivered by import + matching + manual resolution. Reporting is an enhancement.

**Independent Test**: Can be tested by completing reconciliation for a period and generating a summary that shows opening balance, all transactions, and closing balance with match statuses.

**Acceptance Scenarios**:

1. **Given** a user has completed reconciliation for March 2026, **When** they generate a reconciliation summary, **Then** the summary shows: total transactions, matched count, unmatched count, opening balance (from statement), closing balance (from statement), and reconciled balance.
2. **Given** a reconciliation summary has unmatched items, **When** the user views the summary, **Then** unmatched items are highlighted with their details for follow-up.
3. **Given** the user wants to share the summary, **When** they export it, **Then** a downloadable report is generated (CSV or PDF) with all reconciliation details.

---

### Edge Cases

- What happens when a bank statement has transactions in a different currency than the bank account's registered currency? → The system flags a currency mismatch and requires user confirmation before importing.
- What happens when the same bank transaction amount appears multiple times on the same day? → Each transaction is treated as distinct; the system uses description + reference as additional differentiators for duplicate detection.
- What happens when an internal payment record is partially matched (e.g., a bank credit of $3,000 covers two invoices of $1,500 each)? → The system supports split matching: one bank transaction can be linked to multiple internal records whose amounts sum to the bank transaction amount.
- How does the system handle bank fees, interest charges, or non-business transactions? → Users can categorize unmatched transactions as "bank charges", "interest", "non-business", or "other" to clear them from the unmatched queue without linking to an internal record.
- What happens when a user deletes a bank account that has reconciled transactions? → The bank account is soft-deleted (deactivated). All transaction history and reconciliation records are preserved.
- What happens when an invoice is voided after being reconciled with a bank transaction? → The reconciliation match is flagged for review; the user must manually resolve the discrepancy.

## Requirements *(mandatory)*

### Functional Requirements

**Bank Account Management**
- **FR-001**: System MUST allow users to register bank accounts with: bank name, account number (last 4 digits displayed), currency, and optional nickname.
- **FR-002**: System MUST support multiple bank accounts per business.
- **FR-003**: System MUST allow users to edit and deactivate (soft-delete) bank accounts.

**Bank Statement Import**
- **FR-004**: System MUST accept bank statement files in CSV and XLSX formats via the existing shared CSV parser.
- **FR-005**: System MUST use the "bank_statement" schema type for column mapping — fields: transactionDate, description, debitAmount, creditAmount, balance, reference, transactionType.
- **FR-006**: System MUST detect and warn about duplicate transactions when importing overlapping date ranges for the same bank account (matching on date + amount + description).
- **FR-007**: System MUST store each imported transaction as an individual record linked to the source bank account and import session.
- **FR-008**: System MUST support the saved-template workflow — auto-detecting previously saved column mappings via header fingerprint on repeat uploads.
- **FR-009**: System MUST enforce a maximum file size of 25MB and 100,000 rows per import (consistent with CSV parser limits).

**Auto-Matching Engine**
- **FR-010**: System MUST automatically run the matching engine immediately after each bank statement import completes. Users MUST also be able to re-trigger matching on demand for any bank account (e.g., after recording new payments or invoices).
- **FR-010a**: System MUST match bank transactions against accounting entries as the single matching target. When displaying matches to users, the system MUST show the linked source record (invoice number, expense claim ID, vendor name, etc.) for context.
- **FR-011**: System MUST match bank credit transactions to accounting entries by: exact amount + reference number match, or exact amount + date proximity (±3 days).
- **FR-012**: System MUST match bank credit transactions to accounting entries by: invoice number or reference found in the bank transaction description.
- **FR-013**: System MUST match bank debit transactions to accounting entries (expense reimbursements, AP payments) by: exact amount match.
- **FR-014**: System MUST assign a confidence score to each suggested match: High (reference + amount match), Medium (amount + date proximity), Low (amount-only match).
- **FR-015**: System MUST flag transactions with no matching accounting entry as "unmatched".
- **FR-016**: System MUST present all candidate matches when multiple accounting entries could match, allowing the user to choose.
- **FR-017**: System MUST support split matching — one bank transaction linked to multiple accounting entries whose amounts sum to the bank transaction amount.

**Reconciliation Workflow**
- **FR-018**: System MUST allow users to confirm suggested matches, moving the transaction to "reconciled" status.
- **FR-019**: System MUST allow users to reject suggested matches, returning the transaction to "unmatched" and suppressing the rejected suggestion.
- **FR-020**: System MUST allow users to manually search for and link an unmatched transaction to an accounting entry (with source record context displayed).
- **FR-021**: System MUST allow users to unmatch/unreconcile a previously matched transaction.
- **FR-022**: System MUST allow users to categorize unmatched transactions as "bank charges", "interest", "non-business", or "other" to clear them from the unmatched queue.
- **FR-023**: System MUST display a reconciliation dashboard showing transaction counts by status: Reconciled, Suggested, Unmatched, Categorized.
- **FR-024**: System MUST allow filtering transactions by date range, status, and bank account.

**Reporting**
- **FR-025**: System MUST generate a reconciliation summary per bank account per period showing: total transactions, matched/unmatched counts, opening balance, closing balance.
- **FR-026**: System MUST allow exporting the reconciliation summary as a downloadable report.

**Access Control**
- **FR-027**: System MUST restrict bank reconciliation features to users with admin or manager roles within the business.

### Key Entities

- **Bank Account**: A registered business bank account (bank name, account number, currency, status). A business can have many bank accounts.
- **Bank Transaction**: A single row from an imported bank statement (date, description, debit/credit amounts, balance, reference, type). Belongs to one bank account and one import session.
- **Import Session**: A record of a single file upload event (file name, upload date, row count, bank account). Used for tracking import history and duplicate detection.
- **Reconciliation Match**: A link between a bank transaction and one or more accounting entries. Includes match type (auto/manual), confidence score, and status (suggested/confirmed/rejected). The linked accounting entry carries a reference to its source record (invoice, expense claim, etc.) for display context.
- **Accounting Entry** (existing): The unified ledger record where AR invoices, AP invoices, and approved expenses all land. This is the single matching target for bank reconciliation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can import a bank statement file and see parsed transactions in under 60 seconds (for files up to 1,000 rows).
- **SC-002**: The auto-matching engine correctly matches at least 60% of bank transactions to internal records on first run (for businesses with existing invoice/payment data).
- **SC-003**: Users can complete full reconciliation of a monthly bank statement (200 transactions, 60% auto-matched) in under 30 minutes, compared to 2-4 hours manually.
- **SC-004**: Duplicate transaction detection prevents 100% of exact duplicates (same date + amount + description) from being re-imported.
- **SC-005**: Users can review and confirm/reject a suggested match in under 5 seconds per transaction.
- **SC-006**: The reconciliation dashboard loads and displays transaction summaries in under 3 seconds.
- **SC-007**: 90% of users can complete their first bank statement import without referring to help documentation (intuitive UX leveraging the familiar CSV parser flow).

## Clarifications

### Session 2026-03-11

- Q: When does the auto-matching engine run? → A: Auto-matching runs immediately after each import completes, plus users can re-trigger matching on demand at any time (e.g., after new invoices/payments are recorded).
- Q: Should matching target accounting entries or source records (invoices, payments, expenses)? → A: Hybrid — match against accounting entries as the single matching target, but display the linked source record (invoice number, expense claim ID, etc.) for user context when reviewing matches.
- Q: Where does bank reconciliation live in the navigation? → A: New tab under the Accounting section (renamed from "Accounting Records"). Sidebar and header show "Accounting" only. Two tabs: "Records" (existing ledger) and "Bank Reconciliation" (new feature). Bank recon is an accounting verification workflow — AR, AP, and expenses all flow into accounting records, and bank recon reconciles those records against the bank.

## Assumptions

- The shared CSV parser (Issue #272) is complete and production-ready, including the "bank_statement" schema type with 7 fields.
- Users will primarily upload CSV files from Malaysian banks (Maybank, CIMB, Public Bank, RHB, etc.) which vary in format but the AI column mapping handles this.
- The existing `accounting_entries` table is the single matching target. It already links to source records (invoices, expense claims) via foreign keys, providing rich context for match display.
- Bank account numbers are partially masked (last 4 digits) for security — users identify accounts by bank name + nickname.
- The sidebar and page header will be renamed from "Accounting Records" to "Accounting". The page will have two tabs: "Records" (existing accounting entries ledger) and "Bank Reconciliation" (new feature).
- PDF bank statement import (OCR-based) is deferred to a future phase — this spec covers CSV/XLSX only.

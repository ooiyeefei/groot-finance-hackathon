# Feature Specification: Accounting Periods UI

**Feature Branch**: `001-acct-period-ui`
**Created**: 2026-03-15
**Status**: Draft
**Input**: GitHub Issue #296 — Build frontend UI for the existing accounting periods backend (already implemented in `convex/functions/accountingPeriods.ts`). Add a "Periods" tab to the Accounting page where users can view, close, lock, and reopen monthly accounting periods. Show period status on journal entries and enforce edit restrictions on closed/locked periods.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View & Manage Accounting Periods (Priority: P1)

As a business owner or accountant, I need to see all accounting periods (months) for my business with their status (Open, Closed, Locked) and financial summaries, so I can manage the month-end close process.

**Why this priority**: This is the foundation — without a period list view, no other period management is possible. SME accountants need visibility into which months are open vs closed before they can take any action.

**Independent Test**: Navigate to Accounting > Periods tab. A table displays all periods with status, revenue, expenses, and net income. This delivers immediate value as a read-only overview of the financial calendar.

**Acceptance Scenarios**:

1. **Given** I am on the Accounting page, **When** I click the "Periods" tab, **Then** I see a table listing all accounting periods sorted newest-first with columns: Period (e.g., "Mar 2026"), Status badge (Open/Closed/Locked), Revenue, Expenses, Net Income, and Actions
2. **Given** no accounting periods exist yet, **When** I view the Periods tab, **Then** I see an empty state with guidance on how periods work and a button to create the first period
3. **Given** multiple periods exist across fiscal years, **When** I view the list, **Then** periods are sorted by fiscal year descending, then by month descending (newest first)

---

### User Story 2 - Close a Monthly Period (Priority: P1)

As a business owner or accountant, I need to close an accounting period at month-end so that no further journal entries can be backdated into that month. The system calculates final totals (revenue, expenses, net) upon closing.

**Why this priority**: Period closing is the primary workflow this feature enables — it's required for GAAP/IFRS/MAS-8 compliance. Without it, entries can be backdated indefinitely, undermining financial statement integrity.

**Independent Test**: Select an open period, click "Close Period," confirm in the dialog showing the period summary, and verify the period transitions to "Closed" status with calculated totals.

**Acceptance Scenarios**:

1. **Given** an open period with posted journal entries, **When** I click "Close Period" on that row, **Then** a confirmation dialog appears showing: period name, entry count, total debits, total credits, and net income
2. **Given** I confirm the close action, **When** the system processes, **Then** the period status changes to "Closed," financial totals are calculated and stored, and the close timestamp and user are recorded
3. **Given** an open period contains draft (unposted) journal entries, **When** I attempt to close it, **Then** the confirmation dialog shows a warning: "X draft entries exist in this period. Draft entries will not be included in period totals."
4. **Given** a period is already closed, **When** I view its row, **Then** the "Close" action is not available (only "Lock" and "Reopen" are shown)

---

### User Story 3 - Lock Period Entries (Priority: P2)

As an accountant preparing for audit, I need to permanently lock all journal entries within a closed period so they cannot be edited, reversed, or voided — ensuring the audit trail is tamper-proof.

**Why this priority**: Locking is the enforcement mechanism for period closing. While closing prevents new entries, locking prevents modifications to existing ones. Important for audit readiness but only needed after closing.

**Independent Test**: Close a period, then click "Lock Entries." Verify all journal entries in that period are marked as locked and can no longer be edited.

**Acceptance Scenarios**:

1. **Given** a closed period, **When** I click "Lock Entries," **Then** a confirmation dialog shows the entry count, period financial summary (total debits, credits, net), and warns: "This will permanently lock all X journal entries in [Period Name]. Locked entries cannot be edited, reversed, or voided."
2. **Given** I confirm the lock action, **When** the system processes, **Then** all journal entries dated within that period have their lock flag set to true
3. **Given** a period with locked entries, **When** I view journal entries from that period (in the Journal Entries tab), **Then** edit/void/reverse buttons are disabled and a "Period Locked" badge is visible
4. **Given** a period is open (not closed), **When** I view its actions, **Then** the "Lock Entries" option is not available (must close first)

---

### User Story 4 - Reopen a Closed Period (Priority: P2)

As an accountant, I occasionally need to reopen a previously closed period to correct an error or add a missing entry, provided entries have not been locked.

**Why this priority**: Essential for error correction, but a secondary workflow. Most users close periods more often than they reopen them. Includes safeguards to prevent reopening locked periods.

**Independent Test**: Close a period, then click "Reopen." Verify the period returns to "Open" status and entries can be created/edited again.

**Acceptance Scenarios**:

1. **Given** a closed period with no locked entries, **When** I click "Reopen," **Then** a confirmation dialog warns about audit implications: "Reopening allows new entries to be posted to this period. This may affect previously reported financial statements."
2. **Given** I confirm the reopen action, **When** the system processes, **Then** the period status changes back to "Open" and the close timestamp/user are cleared
3. **Given** a closed period with locked entries, **When** I attempt to reopen it, **Then** the system shows an error: "Cannot reopen — entries are locked. Unlock entries first to reopen this period."
4. **Given** a period is open, **When** I view its actions, **Then** the "Reopen" option is not available (already open)

---

### User Story 5 - Period Status Indicators on Journal Entries (Priority: P2)

As an accountant browsing journal entries, I need to see at a glance which period each entry belongs to and whether that period is open, closed, or locked — so I know whether I can still edit the entry.

**Why this priority**: This is the enforcement layer visible in the journal entry workflow. Users need visual feedback when they encounter locked entries to understand why they can't edit them.

**Independent Test**: View the Journal Entries list with entries spanning open and closed periods. Verify period badges are visible and edit controls are disabled for locked entries.

**Acceptance Scenarios**:

1. **Given** I am viewing the Journal Entries list, **When** entries belong to different periods, **Then** each entry row shows a period badge (e.g., "Mar 2026 — Open" or "Feb 2026 — Closed")
2. **Given** a journal entry belongs to a closed or locked period, **When** I view its detail or row, **Then** edit, void, and reverse buttons are disabled with a tooltip explaining why
3. **Given** I attempt to create a new journal entry, **When** I select a date falling in a closed period, **Then** an inline validation warning appears immediately: "Cannot create entry — the period for [month/year] is closed" (before the user fills other fields)

---

### User Story 6 - Create a New Accounting Period (Priority: P3)

As an accountant starting a new fiscal month, I need to create a new accounting period so that journal entries for that month are tracked within a formal period.

**Why this priority**: Lower priority because the system should work even without explicit period creation (entries can exist without periods). However, formal period creation is needed for the close workflow.

**Independent Test**: Click "Create Period," select a month/year, and verify the new period appears in the list with "Open" status.

**Acceptance Scenarios**:

1. **Given** I am on the Periods tab, **When** I click "Create Period," **Then** a dialog allows me to select a start date (month/year) and the system auto-generates the period code (YYYY-MM), period name, and end date
2. **Given** I create a period for "Mar 2026," **When** a period for "2026-03" already exists, **Then** the system shows an error: "A period for March 2026 already exists"
3. **Given** I create a new period, **When** it is saved, **Then** it appears in the list with "Open" status, zero totals, and the current user as creator

---

### Edge Cases

- What happens when a user tries to close a period that has no journal entries? The system allows it, calculating zero totals — some months may have no activity
- What happens when journal entries span midnight boundaries at period edges? The entry date (not creation timestamp) determines the period assignment
- What happens if the current period is closed and a user tries to submit an expense claim dated in that period? The expense claim submission should warn/block the user at journal entry creation time
- How does accounting period closing interact with AR reconciliation period closing? The two are independent systems — AR recon period status lives on sales orders, while accounting periods lock journal entries. No cross-system dependency
- What happens if a user creates periods out of order (e.g., creates May before April)? The system allows it — periods are independent months, not sequential chains
- What happens if locking fails partway through? Locking is atomic — all entries lock together or none do. If the operation fails, no entries are left in a partially locked state

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a "Periods" tab in the Accounting navigation alongside Dashboard, Journal Entries, and Chart of Accounts
- **FR-002**: System MUST show all accounting periods in a table with: period name, status badge (Open/Closed/Locked), journal entry count, total revenue, total expenses, net income, and available actions
- **FR-003**: System MUST allow closing an open period, which calculates and stores financial totals from all posted journal entries in that period
- **FR-004**: System MUST show a confirmation dialog before closing a period, displaying the period summary and warning about any draft entries
- **FR-005**: System MUST allow locking all entries in a closed period atomically (all-or-nothing) — either all entries lock successfully or none do, preventing partial lock states
- **FR-006**: System MUST prevent locking entries in an open period — closing is a prerequisite for locking
- **FR-007**: System MUST allow reopening a closed period only when no entries in that period are locked
- **FR-008**: System MUST show a warning about audit implications when reopening a period
- **FR-009**: System MUST display period status badges on journal entry rows in the Journal Entries tab
- **FR-010**: System MUST disable edit/void/reverse controls on journal entries that belong to a closed or locked period
- **FR-011**: System MUST prevent creation of new journal entries with dates falling within a closed period, validating inline at date selection time (not at form submission)
- **FR-012**: System MUST allow creating new accounting periods with auto-generated period codes and prevent duplicate periods for the same month
- **FR-013**: System MUST sort periods newest-first (by fiscal year descending, then period code descending)
- **FR-014**: System MUST show an empty state with guidance when no periods exist
- **FR-015**: System MUST use destructive styling (red) for Close and Lock actions with confirmation dialogs
- **FR-016**: System MUST use primary styling with warning text for the Reopen action

### Key Entities

- **Accounting Period**: Represents a calendar month of financial activity. Has a status lifecycle (Open → Closed → optionally Locked). Contains calculated totals (revenue, expenses, net) computed at close time. Linked to journal entries by date range.
- **Journal Entry**: Individual financial transaction record. References an optional accounting period. Has a lock flag that, when set, prevents any modification. Status includes draft, posted, reversed, voided.
- **Period Status**: Three distinct status badge values displayed in the UI — **Open** (entries can be created/edited), **Closed** (no new entries, existing entries still editable unless locked), **Locked** (entries cannot be modified at all). "Locked" is shown as a third distinct badge in the status column, derived from "closed period" + "all entries locked."

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can view all accounting periods and their status within 2 seconds of navigating to the Periods tab
- **SC-002**: Users can close a monthly period in under 30 seconds (including confirmation dialog review)
- **SC-003**: 100% of journal entries in a locked period are protected from editing — no edit, void, or reverse action succeeds on a locked entry
- **SC-004**: Users can identify the period status of any journal entry at a glance without navigating away from the Journal Entries tab
- **SC-005**: Period management reduces month-end close from a manual entry-by-entry review to a single-click workflow per month

## Assumptions

- The backend functions in `accountingPeriods.ts` are stable and complete — no backend changes are required for basic period management
- Period creation is manual (user-initiated), not automatic — the system does not auto-create periods when entries are posted
- Accounting periods and AR reconciliation periods are independent systems — closing an accounting period does not affect sales order period status, and vice versa
- Only admin/accountant roles can close, lock, and reopen periods — standard employees can view but not manage periods
- The "Locked" status badge is a third distinct value in the status column (alongside Open and Closed), derived from "closed period" + "all entries locked" — there is no separate "Locked" status field on the period record itself

## Clarifications

### Session 2026-03-15

- Q: Should "Locked" be a third distinct status badge or a secondary indicator on "Closed"? → A: Third distinct status badge (Open / Closed / Locked)
- Q: Should locking entries be atomic (all-or-nothing) or best-effort (partial lock)? → A: Atomic — all entries lock together or none do
- Q: Should the lock confirmation dialog show a summary of what will be locked? → A: Yes — entry count + period financial summary (debits, credits, net)
- Q: Should closed-period validation on new entries happen at date selection or form submission? → A: Inline at date selection time

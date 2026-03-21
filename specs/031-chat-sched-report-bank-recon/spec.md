# Feature Specification: Scheduled Reports via Chat + Bank Recon Integration

**Feature Branch**: `031-chat-sched-report-bank-recon`
**Created**: 2026-03-21
**Status**: Draft
**Input**: GitHub Issue #348 — "Scheduled reports via chat + bank recon integration"
**Personas**: CFO Copilot (Owner/Finance Admin), Manager's Right-Arm (Manager)

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Schedule a Recurring Report via Chat (Priority: P1)

A business owner or finance admin tells the chat agent: "Send me a weekly P&L every Monday" (or any natural-language variant like "email me the AR aging report on the 1st of every month"). The agent understands the intent, confirms the report type, frequency, delivery day, and recipients, then creates a persistent schedule. From that point forward, the report is generated and emailed automatically on schedule without any further user action.

**Why this priority**: This is the core value proposition — turning a manual, forgettable task (running and distributing financial reports) into a one-time chat command that runs forever. It directly serves the CFO Copilot persona's need for proactive financial visibility and is the highest-impact capability in this feature set.

**Independent Test**: Can be fully tested by sending a chat message to schedule a report, verifying the schedule is persisted, and confirming the next scheduled run date is correct. Delivers immediate value even before the report generation engine is connected (schedule creation + confirmation is the MVP).

**Acceptance Scenarios**:

1. **Given** a business owner in the chat, **When** they say "Send me a weekly P&L every Monday", **Then** the agent confirms: report type (P&L), frequency (weekly), day (Monday), recipients (the requesting user's email), and creates the schedule.
2. **Given** a user requests a report with ambiguous parameters (e.g., "send me a report every week"), **When** the agent detects missing details, **Then** it asks clarifying questions (which report type? which day?) before creating the schedule.
3. **Given** a schedule exists, **When** the scheduled time arrives, **Then** the system generates the report and delivers it via email to all listed recipients.
4. **Given** a report generation fails (e.g., insufficient data for the period), **When** the scheduled run executes, **Then** the system notifies the schedule owner via email that the report could not be generated, with a reason.

---

### User Story 2 — Trigger Bank Reconciliation from Chat (Priority: P2)

A finance admin says "Run bank reconciliation" or "Reconcile my bank transactions" in the chat. The agent triggers the existing bank reconciliation matching engine (Tier 1 rules + Tier 2 DSPy), processes unmatched bank transactions, and returns the results directly in the chat as interactive match cards. The user can review suggested matches and accept or reject them without leaving the chat.

**Why this priority**: Bank reconciliation is an existing capability in the UI but inaccessible via chat. Exposing it through the agent makes the CFO Copilot persona genuinely agentic — they can trigger financial operations through conversation. This is a direct embodiment of Groot's "agent IS the product" philosophy.

**Independent Test**: Can be tested by uploading bank transactions (via existing UI), then asking the chat agent to "run bank reconciliation." The agent should return match results with confidence scores and interactive accept/reject buttons.

**Acceptance Scenarios**:

1. **Given** unmatched bank transactions exist for the business, **When** the user says "Run bank reconciliation", **Then** the agent asks which bank account to reconcile (listing available accounts), and after the user selects one, triggers the matching engine and returns a summary: N transactions matched, M need review, K unmatched.
2. **Given** the agent returns match suggestions, **When** the user sees a match card with Accept/Reject buttons, **Then** clicking Accept confirms the match and creates the corresponding journal entry; clicking Reject marks the match as rejected. Alternatively, the user can say "Accept all above 90%" to bulk-accept high-confidence matches after a confirmation prompt.
3. **Given** no unmatched bank transactions exist, **When** the user requests reconciliation, **Then** the agent responds that all transactions are already reconciled with a summary of the last reconciliation date.
4. **Given** the matching engine identifies a split match (one bank transaction matching multiple invoices), **When** the results are displayed, **Then** the match card shows all matched invoices with individual amounts and a combined confidence score.

---

### User Story 3 — View Reconciliation Status from Chat (Priority: P3)

A user asks "What's my reconciliation status?" or "Show unmatched transactions." The agent retrieves the current state of bank reconciliation — how many transactions are matched, pending review, or unmatched — and presents a summary with the ability to drill down into specific items.

**Why this priority**: Read-only status queries are lower effort than triggering operations, and they complete the conversational loop. Users who schedule reports or run reconciliation will naturally want to check status without switching to the dashboard.

**Independent Test**: Can be tested by querying reconciliation status via chat and verifying the counts match the dashboard view. Delivers value even if the "trigger recon" tool (P2) isn't implemented yet — status can reflect reconciliation done via the existing UI.

**Acceptance Scenarios**:

1. **Given** a business with bank transactions in various states, **When** the user asks "Show reconciliation status", **Then** the agent returns: total transactions, matched count, pending review count, unmatched count, and the date range covered.
2. **Given** the user asks "Show unmatched transactions", **When** there are unmatched items, **Then** the agent lists up to 10 unmatched transactions with date, amount, and description, with an option to see more.
3. **Given** the user asks about a specific transaction ("What about the $500 payment from Acme?"), **When** the agent can identify the transaction, **Then** it shows the transaction details and its current match status (matched, pending, unmatched).

---

### User Story 4 — Manage Scheduled Reports via Chat (Priority: P4)

A user says "Show my scheduled reports" to see all active schedules, or "Cancel the weekly P&L" to deactivate a specific schedule. They can also modify existing schedules ("Change the P&L to monthly instead of weekly").

**Why this priority**: Schedule management completes the lifecycle of Story 1. Without it, users would need to go to a dashboard to manage what they created via chat, breaking the agentic experience.

**Independent Test**: Can be tested by creating a schedule (Story 1), then listing, modifying, and cancelling it — all via chat commands.

**Acceptance Scenarios**:

1. **Given** a user with active report schedules, **When** they say "Show my scheduled reports", **Then** the agent lists all active schedules with report type, frequency, next run date, and recipients.
2. **Given** a user wants to cancel a schedule, **When** they say "Cancel the weekly P&L", **Then** the agent confirms cancellation and deactivates the schedule (soft delete — schedule is preserved but marked inactive).
3. **Given** a user wants to modify a schedule, **When** they say "Change the P&L to monthly on the 1st", **Then** the agent updates the frequency and day, confirms the change, and shows the next scheduled run date.

---

### Edge Cases

- What happens when a user schedules a report type that requires data their business hasn't set up yet (e.g., P&L without any journal entries)? → The system should warn at schedule creation time and still allow it, but include a note that the report may be empty until data is available.
- What happens when a user tries to schedule more than 10 reports? → The system should enforce a per-business limit (10 active schedules) and inform the user they've reached the cap.
- What happens when the recipient email bounces repeatedly? → After 3 consecutive bounces, the system should deactivate delivery to that recipient and notify the schedule owner.
- What happens when a user with only "employee" role tries to schedule a P&L report? → Only users with admin or manager roles should be able to schedule financial reports. Employees can only schedule expense summary reports for themselves.
- What happens when bank reconciliation is triggered but there are no bank transactions imported yet? → The agent should respond that no bank transactions are available and suggest importing a bank statement first.
- What happens when a user triggers bank reconciliation while a previous run is still in progress? → The agent should inform the user that reconciliation is already running and provide an estimated completion time or offer to notify them when it finishes.

## Requirements *(mandatory)*

### Functional Requirements

**Report Scheduling**

- **FR-001**: The system MUST allow users to create recurring report schedules via natural-language chat commands.
- **FR-002**: The system MUST support these report types: Profit & Loss (P&L), Cash Flow Statement, AR Aging, AP Aging, and Expense Summary.
- **FR-003**: The system MUST support these delivery frequencies: daily, weekly (with configurable day-of-week), and monthly (with configurable day-of-month).
- **FR-004**: The system MUST allow specifying one or more email recipients per schedule (defaulting to the requesting user's email).
- **FR-005**: The system MUST persist report schedules and execute them automatically on the configured frequency without further user action.
- **FR-006**: The system MUST allow users to list, modify, and cancel their scheduled reports via chat commands.
- **FR-007**: The system MUST enforce role-based access: only admin and manager roles can schedule financial reports (P&L, Cash Flow, AR Aging, AP Aging); employees can only schedule Expense Summary for themselves.
- **FR-008**: The system MUST limit each business to a maximum of 10 active report schedules.
- **FR-009**: The system MUST notify the schedule owner when a report generation fails, with a clear reason for the failure.
- **FR-010**: The system MUST deactivate delivery to a recipient after 3 consecutive email bounces and notify the schedule owner.

**Report Generation & Delivery**

- **FR-011**: The system MUST generate reports based on the business's actual financial data (journal entries, invoices, sales invoices, bank transactions) for the relevant period. All amounts MUST be presented in the business's home (base) currency.
- **FR-012**: Reports MUST cover the most recent complete period based on frequency: daily = previous day, weekly = previous 7 days, monthly = previous calendar month.
- **FR-013**: Reports MUST be delivered via email with an HTML summary in the email body and a full PDF attachment, reusing the existing sales invoice email+PDF generation utility.
- **FR-014**: Each report email MUST include: report title, business name, period covered, generation timestamp, an HTML summary table in the body, and the complete report as a PDF attachment.

**Bank Reconciliation via Chat**

- **FR-015**: The system MUST allow users to trigger bank reconciliation via natural-language chat commands (e.g., "Run bank reconciliation"). The agent MUST always ask which bank account to reconcile before proceeding, even if the business has only one account (explicit confirmation for financial operations).
- **FR-016**: The system MUST use the existing Tier 1 (rule-based) + Tier 2 (DSPy) matching engine to process unmatched bank transactions for the selected bank account.
- **FR-017**: The system MUST return reconciliation results in the chat as a summary (matched/pending/unmatched counts) with detailed match cards for items needing review.
- **FR-018**: Match cards MUST display: bank transaction details (date, amount, description), matched invoice/entry details, confidence score, and Accept/Reject action buttons.
- **FR-019**: Accepting a match (individually or via bulk action) MUST create the corresponding journal entry and update the transaction's reconciliation status.
- **FR-019a**: The system MUST support bulk acceptance via a chat command (e.g., "Accept all matches above 90% confidence"), applying to all matches at or above the specified threshold. The agent MUST confirm the count of matches to be accepted before executing.
- **FR-020**: The system MUST handle split matches (one bank transaction matched to multiple invoices) with individual amounts displayed and a combined confidence score.
- **FR-021**: The system MUST prevent concurrent reconciliation runs for the same business — if a run is already in progress, inform the user.

**Reconciliation Status**

- **FR-022**: The system MUST allow users to query reconciliation status via chat (e.g., "Show reconciliation status", "Show unmatched transactions").
- **FR-023**: Status queries MUST return: total transaction count, matched count, pending review count, unmatched count, and date range covered.
- **FR-024**: When listing unmatched transactions, the system MUST show up to 10 items at a time with pagination support.
- **FR-025**: The system MUST support natural-language queries about specific transactions (e.g., "What about the $500 payment from Acme?").

### Key Entities

- **Report Schedule**: Represents a recurring report delivery configuration. Attributes: business, owner (who created it), report type, frequency, delivery day, recipients (email addresses), active status, next run date, last run date, last run status.
- **Report Run**: Represents a single execution of a scheduled report. Attributes: schedule reference, run timestamp, period covered, delivery status, error reason (if failed), recipients delivered to.
- **Bank Reconciliation Run**: Represents a single reconciliation execution triggered via chat. Attributes: business, triggered by (user), start time, end time, status (running/complete/failed), results summary (matched/pending/unmatched counts).
- **Match Card**: Represents a suggested match between a bank transaction and one or more invoices/entries. Attributes: bank transaction reference, matched items, confidence score, match type (exact/fuzzy/split), user action (accepted/rejected/pending).

### Assumptions

- Report content will be generated from existing Convex data (journal entries, invoices, sales invoices) — no new data ingestion is required for this feature.
- The existing DSPy bank reconciliation and AR matching modules will be reused as-is — no retraining or model changes are needed.
- Email delivery uses the existing SES infrastructure with the `notifications.hellogroot.com` domain.
- The chat agent's existing tool registration pattern (MCP-first per CLAUDE.md rules) will be followed for all new tools.
- Users have already imported bank transactions via the existing UI before attempting chat-based reconciliation.
- Report generation runs asynchronously — the user does not need to wait in the chat for the report to be emailed.

## Clarifications

### Session 2026-03-21

- Q: What format should scheduled report emails use? → A: HTML summary in email body + full PDF attachment, reusing the existing sales invoice email+PDF utility.
- Q: Should bank reconciliation run against all accounts or ask which one? → A: Always ask which bank account before running reconciliation.
- Q: Should reports show multi-currency breakdowns or home currency only? → A: Home currency only — all amounts converted to the business's base currency.
- Q: Should match card accept/reject be individual, bulk, or both? → A: Both — per-card Accept/Reject buttons + bulk "Accept all above X% confidence" chat command.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can create a report schedule via a single chat conversation in under 60 seconds (including any clarification questions).
- **SC-002**: Scheduled reports are delivered within 15 minutes of their configured run time, with 99% reliability over a 30-day period.
- **SC-003**: Bank reconciliation triggered via chat returns results within 30 seconds for up to 500 unmatched transactions.
- **SC-004**: 80% of suggested matches accepted by users without modification (measuring matching accuracy via the existing DSPy engine).
- **SC-005**: Users can manage the full report schedule lifecycle (create, list, modify, cancel) entirely within the chat — no dashboard switching required.
- **SC-006**: Reconciliation status queries return accurate, up-to-date counts that match the dashboard view within a 1-minute data freshness window.
- **SC-007**: Role-based access controls prevent 100% of unauthorized schedule creation attempts (employees cannot schedule financial reports beyond Expense Summary).

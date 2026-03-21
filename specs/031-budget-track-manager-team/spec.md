# Feature Specification: Budget Tracking + Manager Team Tools (Manager Right-Arm)

**Feature Branch**: `031-budget-track-manager-team`
**Created**: 2026-03-21
**Status**: Draft
**Input**: GitHub Issue #350 — Budget tracking, late approval detection, and team spending comparison tools for the Manager Right-Arm persona.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Budget Status Check (Priority: P1)

A manager asks the chat agent "What is our budget status?" and receives a visual breakdown of spending vs. budget for each expense category across the entire business. Categories that are approaching or exceeding their limit are highlighted so the manager can take immediate action.

**Why this priority**: Budget visibility is the core value proposition for the Manager Right-Arm persona. Without it, managers have no spending guardrails and must manually track team expenses against limits — the exact pain point this feature solves.

**Independent Test**: Can be fully tested by setting a budget for a category, having team members submit expenses against that category, then asking the chat agent for budget status. Delivers immediate value: spending visibility with actionable alerts.

**Acceptance Scenarios**:

1. **Given** a manager has set monthly budgets for 3 expense categories, **When** they ask "What is our budget status?", **Then** the system displays a card showing each category with: budget limit, amount spent, remaining amount, percentage used, and a status indicator (on track / warning / overspent).
2. **Given** a category has spending at 85% of budget, **When** the budget status is displayed, **Then** that category is highlighted as "Warning" with a visual progress bar in amber/orange.
3. **Given** a category has spending exceeding 100% of budget, **When** the budget status is displayed, **Then** that category is highlighted as "Overspent" with a visual progress bar in red and the overspent amount shown.
4. **Given** a manager has no budgets configured, **When** they ask for budget status, **Then** the system explains that no budgets are set and offers to help create them.
5. **Given** a manager manages multiple expense categories, **When** they ask "How is Travel spending?", **Then** the system returns the budget status for just the Travel category.

---

### User Story 2 - Budget Creation and Management (Priority: P1)

A manager tells the chat agent "Set a monthly budget of RM 5,000 for Travel" and the system sets a budget limit on the Travel expense category. Budgets are configured as an optional field on existing expense categories — managers opt in per category. Budgets can be set, viewed, and edited through both the chat interface and the category settings UI.

**Why this priority**: Without budget creation, the status check (Story 1) has nothing to compare against. These two stories together form the minimum viable budget feature.

**Independent Test**: Can be tested by creating a budget via chat, confirming it persists, updating it, and verifying the updated value is reflected.

**Acceptance Scenarios**:

1. **Given** no budget is set for the Travel category, **When** a manager says "Set Travel budget to RM 5,000 per month", **Then** a monthly budget limit of RM 5,000 is configured on the Travel category and the system confirms the creation.
2. **Given** Travel already has a budget of RM 5,000, **When** the manager says "Update Travel budget to RM 7,000", **Then** the category's budget limit is updated and the system confirms the change with old vs. new values.
3. **Given** a manager wants to see all configured budgets, **When** they ask "Show me all budgets", **Then** a summary card lists every category that has a budget set, with its monthly limit and current spend.
4. **Given** a manager wants to remove a budget, **When** they say "Remove the Travel budget", **Then** the budget limit is removed from the Travel category (the category itself remains) and the system confirms removal.
5. **Given** a non-manager employee tries to set a budget, **When** they say "Set Travel budget to RM 5,000", **Then** the system denies the request, explaining that only managers and above can manage budgets.

---

### User Story 3 - Proactive Budget Alerts (Priority: P2)

When team spending in any category reaches 80% of the monthly budget, the system proactively generates an alert that appears in the manager's Action Center and can be surfaced by the chat agent. This enables managers to intervene before overspending occurs.

**Why this priority**: Proactive alerts transform the budget feature from reactive (manager must ask) to proactive (system warns). This is high-value but depends on Stories 1-2 being functional first.

**Independent Test**: Can be tested by setting a low budget threshold, submitting expenses to cross 80%, and verifying the alert appears without the manager asking.

**Acceptance Scenarios**:

1. **Given** a Travel budget of RM 5,000 and current spending at RM 3,900, **When** a new RM 200 Travel expense is approved (bringing total to RM 4,100 = 82%), **Then** the system generates a "Budget Warning" alert for the manager.
2. **Given** a budget warning alert exists, **When** the manager opens the Action Center or asks "Any budget alerts?", **Then** the alert is displayed as an action card with the category, current spend, budget limit, and percentage.
3. **Given** a category has already triggered a warning alert this month, **When** additional spending occurs but stays in the same threshold band (80-100%), **Then** no duplicate alert is created.
4. **Given** spending crosses 100% of budget, **When** the overspend occurs, **Then** a separate "Budget Exceeded" alert is generated (distinct from the 80% warning).

---

### User Story 4 - Late Approval Detection (Priority: P2)

A manager asks "Any late approvals?" and the system identifies expense submissions that have been waiting for approval beyond a reasonable timeframe. The response includes actionable buttons to approve or review each overdue submission directly from the chat.

**Why this priority**: Late approvals cause employee frustration and delay reimbursements. This is a key Manager Right-Arm capability but is independent of budget tracking, so it's prioritized after the core budget feature.

**Independent Test**: Can be tested by submitting expenses and waiting for them to age beyond the threshold, then asking the chat agent about late approvals.

**Acceptance Scenarios**:

1. **Given** 3 expense submissions have been in "submitted" status for more than 3 business days, **When** the manager asks "Any late approvals?", **Then** the system returns a card listing each overdue submission with: employee name, submission title, amount, and how long it has been waiting.
2. **Given** late approvals are displayed, **When** the manager clicks "Approve Now" on a submission, **Then** the expense is approved inline and the card updates to reflect the approval.
3. **Given** no submissions have been waiting beyond the threshold, **When** the manager asks about late approvals, **Then** the system confirms there are no overdue submissions.
4. **Given** a manager has both direct-report and non-direct-report submissions pending, **When** they ask about late approvals, **Then** only submissions assigned to them (as designated approver) or from their direct reports are shown.

---

### User Story 5 - Team Spending Comparison (Priority: P3)

A manager asks "Compare team spending" and receives a visual comparison showing how much each team member has spent, with outliers highlighted. This helps managers identify unusual spending patterns across their team.

**Why this priority**: Comparison is a powerful analytical tool but is additive — the existing `get_team_summary` tool already provides basic team spending data. This story enhances it with visual comparison and outlier detection.

**Independent Test**: Can be tested by having multiple team members submit expenses of varying amounts, then asking for a comparison and verifying the chart and outlier indicators.

**Acceptance Scenarios**:

1. **Given** a manager has 5 direct reports with varying expense amounts this month, **When** they ask "Compare team spending", **Then** a bar chart card is displayed showing each employee's total spending, sorted by amount.
2. **Given** one employee's spending is significantly above the team average (more than 1.5x), **When** the comparison is displayed, **Then** that employee's bar is highlighted as an outlier with a visual indicator.
3. **Given** a manager asks "Compare team spending for Q1", **When** the system processes the request, **Then** the comparison covers the specified time period (January-March) rather than the default current month.
4. **Given** a manager has no direct reports, **When** they ask to compare team spending, **Then** the system explains that no team members are assigned and suggests updating the team structure.

---

### Edge Cases

- What happens when a budget period rolls over (month ends)? Spending resets to zero for the new period; historical budget data is retained for reporting.
- How does the system handle expenses in different currencies than the budget currency? Amounts are converted to the business's home currency before comparison.
- What happens if a manager has budgets in categories that no team member has used? The category shows 0% spent with the full budget remaining.
- How are rejected/voided expenses handled in budget calculations? Only approved or reimbursed expenses count toward budget usage.
- What if an expense is recategorized after approval? Budget calculations update to reflect the new category assignment.
- What happens when the "late approval" threshold changes mid-period? The new threshold applies to all future queries; existing alerts are not retroactively created or removed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow managers, finance admins, and owners to set an optional monthly budget limit on any existing expense category for their business. Budget configuration lives within the category settings (not as a separate standalone entity).
- **FR-002**: System MUST allow budget creators to update or remove the budget limit from a category.
- **FR-003**: System MUST calculate budget utilization by comparing approved/reimbursed expenses against the configured budget for each category within the current month.
- **FR-004**: System MUST classify budget status as: "On Track" (0-79%), "Warning" (80-99%), or "Overspent" (100%+).
- **FR-005**: System MUST restrict budget management and team-level budget queries to users with manager, finance_admin, or owner roles.
- **FR-006**: System MUST generate a proactive alert when spending in any budgeted category crosses the 80% threshold within a budget period.
- **FR-007**: System MUST generate a separate proactive alert when spending exceeds 100% of the budget.
- **FR-008**: System MUST NOT generate duplicate alerts for the same category in the same threshold band within the same budget period.
- **FR-009**: System MUST identify "late" expense submissions as those with status "submitted" for more than 3 business days (excluding weekends and public holidays for the business's country).
- **FR-010**: System MUST allow managers to approve overdue submissions directly from the late approval response (inline action).
- **FR-011**: System MUST provide a team spending comparison that shows per-employee totals with outlier highlighting (employees spending more than 1.5x the team average).
- **FR-012**: System MUST support time-period filtering for budget status and team comparison queries (current month by default, with support for custom date ranges).
- **FR-013**: System MUST convert multi-currency expenses to the business's home currency when calculating budget utilization.
- **FR-014**: System MUST only count expenses with "approved" or "reimbursed" status toward budget utilization (not draft, submitted, or rejected).

### Key Entities

- **Budget**: An optional monthly spending limit configured on an existing expense category within a business. Budgets are set through the category settings (opt-in per category). Key attributes: expense category (from the predefined list), monthly limit amount, currency, alert threshold percentage, associated business, created by (manager). Categories without a budget are simply untracked.
- **Budget Alert**: A notification generated when spending crosses a threshold (80% warning or 100% exceeded). Key attributes: category, threshold crossed, current spend, budget limit, budget period, alert type, dismissed status.
- **Late Approval**: A derived view (not a stored entity) of expense submissions that have been in "submitted" status beyond the configured threshold (3 business days).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Managers can create a budget and check its status through the chat agent in under 60 seconds (end-to-end: ask -> response with visual card).
- **SC-002**: Budget status queries return accurate spend-vs-budget data reflecting all approved expenses within 5 seconds of the query.
- **SC-003**: Proactive budget alerts are generated within 1 minute of an expense approval that crosses the 80% or 100% threshold.
- **SC-004**: Late approval queries correctly identify all submissions exceeding the 3-business-day threshold with zero false positives (no draft or already-approved submissions shown).
- **SC-005**: Team comparison displays spending for all direct reports and correctly highlights outliers (1.5x+ average) with 100% accuracy.
- **SC-006**: 80% of managers who use the budget feature configure at least one budget within their first week (adoption metric).
- **SC-007**: Budget-related chat interactions resolve in a single conversational turn (no back-and-forth needed for status checks).

## Clarifications

### Session 2026-03-21

- Q: Does a budget track spending across the entire business or only the creating manager's direct reports? → A: Business-wide. A budget tracks ALL spending in that category across the entire company. Any manager sees the same totals. No prior budget settings UI or infrastructure exists — this feature builds budget CRUD from scratch.
- Q: How do budget categories map to expense categories? → A: Budgets use the same predefined category list already defined for expense claims (not free text). Budget is configured as an optional field on the existing category settings — managers opt in per category by setting a monthly limit. Categories without a budget configured are simply untracked.

## Assumptions

- Business days for late approval calculation default to Monday-Friday. Public holiday support uses the business's configured country.
- Budget periods are calendar months (not custom fiscal periods). This may be extended later.
- The 80% alert threshold is fixed for the initial release. Per-category custom thresholds may be added in a future iteration.
- The 3-business-day threshold for late approvals is a sensible default based on common corporate expense approval SLAs.
- Outlier detection uses a simple 1.5x average multiplier. Statistical methods (z-score) may be considered in future iterations.
- Budget management is scoped to the business level (one set of budgets per business), not per-manager or per-department. Any manager in the business can see and manage all budgets. Budget utilization is calculated against ALL approved/reimbursed expenses in the business for the given category, not scoped to any individual manager's team.
- No budget settings, budget table, or budget management infrastructure currently exists in the system. This feature creates all budget CRUD operations from scratch (chat-agent-first, with the chat interface as the primary way to create and manage budgets).

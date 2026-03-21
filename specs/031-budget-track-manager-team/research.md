# Research: Budget Tracking + Manager Team Tools

## Decision 1: Budget Data Storage

**Decision**: Add `budgetLimit` and `budgetCurrency` as optional fields on each category object within `businesses.customExpenseCategories` (the existing embedded array).

**Rationale**: Categories are already stored as an embedded array on the businesses table. Adding budget fields to the existing category object is the simplest approach — no new tables, no join queries, atomic updates with existing CRUD mutations.

**Alternatives considered**:
- Separate `budgets` table: Rejected — would require join queries and adds complexity for a simple key-value relationship (category → limit).
- Separate budget settings document per business: Rejected — duplicates category references and adds sync burden.

## Decision 2: Budget Utilization Calculation

**Decision**: Calculate spend-vs-budget on demand via a Convex `action` (not a reactive `query`). The action runs an `internalQuery` to sum approved/reimbursed expense amounts by category for the current month, then compares against budget limits.

**Rationale**: Per CLAUDE.md bandwidth rules, reactive queries on expense tables would re-run on every document change, burning bandwidth. An on-demand action runs once per request.

**Alternatives considered**:
- Pre-computed aggregate table (`budget_utilization_monthly`): Rejected for MVP — adds complexity, requires keeping aggregate in sync on every expense approval. Can be added later if performance demands it.
- Convex cron that pre-computes: Rejected — bandwidth concerns on free plan.

## Decision 3: Proactive Budget Alert Trigger

**Decision**: Check budget thresholds in the expense approval flow. When an expense is approved, calculate the new category total and compare against budget. If threshold crossed, create an `actionCenterInsights` entry with `category: 'optimization'` and `metadata.insightType: 'budget_warning'` or `'budget_exceeded'`.

**Rationale**: Event-driven (on approval) is more responsive than periodic polling and avoids cron bandwidth. The existing Action Center infrastructure handles deduplication, notifications, and UI rendering.

**Alternatives considered**:
- EventBridge scheduled check: Rejected — SC-003 requires alerts within 1 minute, scheduled checks would have latency.
- Separate budget_alerts table: Rejected — Action Center already has the full alert lifecycle (new → reviewed → dismissed → actioned) with dedup.

## Decision 4: Late Approval Calculation

**Decision**: Query `expense_submissions` with `status === 'submitted'` and `submittedAt < (now - 3 business days)`. Business day calculation uses a simple weekday check (Mon-Fri). No public holiday support for MVP.

**Rationale**: The spec allows deferring public holidays. Weekday-only calculation covers 95%+ of cases and avoids the complexity of per-country holiday calendars.

**Alternatives considered**:
- Convex cron that flags late submissions: Rejected — bandwidth. On-demand query is sufficient since managers ask when they want to know.

## Decision 5: Team Comparison Enhancement

**Decision**: Extend the existing `get_team_summary` tool output (or create a new `compare_team_spending` tool) that returns per-employee totals with an `isOutlier` flag for employees spending >1.5x the team average. Render via a new `team_comparison_card` action card with horizontal bar chart.

**Rationale**: The existing `get_team_summary` already queries per-employee data via `financialIntelligence.getTeamExpenseSummary`. Adding outlier detection is a lightweight calculation on the same data.

**Alternatives considered**:
- Z-score based outlier detection: Deferred — 1.5x average multiplier is simpler and sufficient for MVP.

## Decision 6: Action Card Auto-Generation

**Decision**: Add auto-generation mappings in `copilotkit-adapter.ts` for the three new tools:
- `check_budget_status` → `budget_status` card
- `get_late_approvals` → `late_approvals` card
- `compare_team_spending` → `team_comparison` card

**Rationale**: Following the established pattern where each tool's successful result auto-generates a corresponding action card via the SSE stream.

## Decision 7: Category Settings UI Extension

**Decision**: Add an optional "Monthly Budget" field to the category form modal (`category-form-modal.tsx`) and a "Budget" column to the category management table (`category-management.tsx`). The field is a simple number input with currency display.

**Rationale**: The spec states budgets are "an optional field on the existing category settings." The existing category CRUD API and form already handle all other category properties — budget is just another optional field.

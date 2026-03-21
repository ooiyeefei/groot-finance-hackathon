# Data Model: Budget Tracking + Manager Team Tools

## Entity: Expense Category (Extended)

**Storage**: Embedded in `businesses.customExpenseCategories` array (existing)

### New Fields Added to Category Object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `budgetLimit` | `number` | No | Monthly spending limit for this category (in business home currency). Null/undefined = no budget tracking. |
| `budgetCurrency` | `string` | No | ISO 4217 currency code for the budget limit. Defaults to business home currency. |

### Existing Fields (unchanged, for reference)

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Format: `exp_{timestamp}_{randomId}` |
| `category_name` | `string` | Display name |
| `is_active` | `boolean` | Soft delete flag |
| `policy_limit` | `number` | Per-claim max (distinct from monthly budget) |
| `glCode` | `string` | GL account mapping |

### Validation Rules

- `budgetLimit` must be > 0 when provided
- `budgetCurrency` must be a valid ISO 4217 code (defaults to business `homeCurrency`)
- Setting `budgetLimit` to null/undefined removes the budget (no tracking for that category)
- `budgetLimit` is independent of `policy_limit` (per-claim max vs monthly aggregate)

---

## Entity: Budget Alert (via Action Center)

**Storage**: `actionCenterInsights` table (existing)

### Field Mapping for Budget Alerts

| actionCenterInsights Field | Budget Alert Value |
|---------------------------|-------------------|
| `category` | `'optimization'` |
| `priority` | `'high'` (warning) or `'critical'` (exceeded) |
| `status` | `'new'` (initial) |
| `title` | `"Budget Warning: {categoryName}"` or `"Budget Exceeded: {categoryName}"` |
| `description` | `"{categoryName} spending is at {percent}% of RM {limit} monthly budget"` |
| `metadata.insightType` | `'budget_warning'` or `'budget_exceeded'` |
| `metadata.categoryId` | Category ID from customExpenseCategories |
| `metadata.categoryName` | Category display name |
| `metadata.budgetLimit` | Budget limit amount |
| `metadata.currentSpend` | Current total spend |
| `metadata.percentUsed` | Percentage (e.g., 82.5) |
| `metadata.budgetPeriod` | `"YYYY-MM"` format (e.g., "2026-03") |
| `metadata.thresholdCrossed` | `80` or `100` |
| `recommendedAction` | `"Review spending in {categoryName} and consider adjusting budget or reducing expenses"` |

### Deduplication Rules

- Same `categoryId` + same `thresholdCrossed` + same `budgetPeriod` → skip (no duplicate)
- Different thresholds (80% warning + 100% exceeded) for same category = allowed (separate alerts)
- New month resets dedup (different `budgetPeriod`)

---

## Entity: Late Approval (Derived View)

**Storage**: No new storage — derived from `expense_submissions` query

### Query Criteria

| Field | Condition |
|-------|-----------|
| `status` | `=== 'submitted'` |
| `submittedAt` | `< (now - 3 business days)` |
| `businessId` | Manager's business |
| Scope | Submissions where `designatedApproverId === managerId` OR submitter is a direct report of the manager |

### Business Day Calculation

- Weekdays only (Monday-Friday)
- 3 business days = skip Saturdays and Sundays
- Example: submitted Friday → late on Wednesday (3 weekdays: Mon, Tue, Wed)

---

## State Transitions

### Budget Status (Computed, not stored)

```
No Budget → [set budgetLimit] → On Track (0-79%)
On Track → [spending increases] → Warning (80-99%)
Warning → [spending increases] → Overspent (100%+)
Overspent → [new month] → On Track (spending resets)
```

### Budget Alert Lifecycle (via Action Center)

```
[threshold crossed] → new → reviewed → dismissed/actioned
```

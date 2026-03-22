# MCP Contracts: Team/Manager Batch

**Tools**: 4 tools migrating from tool-factory to MCP server

## get_employee_expenses
- **Input**: `{ business_id?, employee_id?, date_range?, status_filter? }`
- **Output**: `{ expenses: ExpenseClaim[], total_amount, count_by_status }`
- **RBAC**: manager, finance_admin, owner

## get_team_summary
- **Input**: `{ business_id?, team_id?, period? }`
- **Output**: `{ team_size, total_spending, pending_approvals, top_categories }`
- **RBAC**: manager, finance_admin, owner

## get_late_approvals
- **Input**: `{ business_id?, threshold_days?, assignee_filter? }`
- **Output**: `{ late_approvals: Approval[], count, oldest_pending_days }`
- **RBAC**: manager, finance_admin, owner

## compare_team_spending
- **Input**: `{ business_id?, team_ids?, period?, comparison_type? }`
- **Output**: `{ comparisons: TeamComparison[], insights }`
- **RBAC**: manager, finance_admin, owner

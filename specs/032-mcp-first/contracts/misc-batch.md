# MCP Contracts: Misc Batch

**Tools**: 5 tools migrating from tool-factory to MCP server

## create_expense_from_receipt
- **Input**: `{ business_id?, user_id, receipt_image_url, description? }`
- **Output**: `{ expense_claim_id, extracted_data: ReceiptData, status: 'draft' }`
- **RBAC**: all roles
- **Note**: Write operation — uses proposal pattern for confirmation

## get_action_center_insight
- **Input**: `{ business_id?, insight_id?, category_filter?, limit? }`
- **Output**: `{ insights: Insight[], total_count, unread_count }`
- **RBAC**: all roles (filtered by user role)

## analyze_trends
- **Input**: `{ business_id?, metric_type, period, currency?, comparison_period? }`
- **Output**: `{ trend_data: TrendPoint[], summary, direction, percentage_change }`
- **RBAC**: finance_admin, owner

## set_budget
- **Input**: `{ business_id?, category, amount, period, currency? }`
- **Output**: `{ budget_id, created: true, effective_period }`
- **RBAC**: finance_admin, owner
- **Note**: Write operation — uses proposal pattern for confirmation

## check_budget_status
- **Input**: `{ business_id?, category?, period? }`
- **Output**: `{ budgets: BudgetStatus[], total_budget, total_spent, remaining }`
- **RBAC**: manager, finance_admin, owner

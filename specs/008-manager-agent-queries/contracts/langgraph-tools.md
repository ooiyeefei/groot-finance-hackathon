# LangGraph Tool Contracts

## Tool: get_employee_expenses

**Category**: 1-2 (Data Retrieval)
**File**: `src/lib/ai/tools/employee-expense-tool.ts`
**Registered in**: `src/lib/ai/tools/tool-factory.ts`

### Input Schema (OpenAI Function Calling Format)

```json
{
  "type": "function",
  "function": {
    "name": "get_employee_expenses",
    "description": "Look up a specific employee's approved expense transactions. Use this tool when a manager asks about a specific team member's spending (e.g., 'How much did Sarah spend at Starbucks in January 2026?'). Requires the manager to have the employee as a direct report. Only returns approved/posted financial records.",
    "parameters": {
      "type": "object",
      "properties": {
        "employee_name": {
          "type": "string",
          "description": "The employee's name (first name, last name, or partial name). The system will match against direct reports."
        },
        "vendor": {
          "type": "string",
          "description": "Optional vendor name filter. Case-insensitive partial match (e.g., 'starbucks' matches 'STARBUCKS COFFEE SDN BHD')."
        },
        "category": {
          "type": "string",
          "description": "Optional expense category in natural language (e.g., 'meals', 'travel', 'office supplies'). Mapped to system categories."
        },
        "date_range": {
          "type": "string",
          "description": "Natural language date expression (e.g., 'January 2026', 'last quarter', 'past 60 days', 'this month'). Converted to exact dates deterministically."
        },
        "start_date": {
          "type": "string",
          "description": "Explicit start date in YYYY-MM-DD format. Use instead of date_range for precise dates."
        },
        "end_date": {
          "type": "string",
          "description": "Explicit end date in YYYY-MM-DD format. Use instead of date_range for precise dates."
        },
        "transaction_type": {
          "type": "string",
          "enum": ["Income", "Expense", "Cost of Goods Sold"],
          "description": "Optional transaction type filter."
        },
        "limit": {
          "type": "number",
          "description": "Max transactions to return in detail (1-50, default 50). Summary always covers all matches."
        }
      },
      "required": ["employee_name"]
    }
  }
}
```

### Output Schema (Zod-validated)

```typescript
{
  summary: {
    total_amount: number,
    currency: string,
    record_count: number,
    date_range: { start: string, end: string }
  },
  employee: { name: string, id: string },
  items: Array<{
    date: string,
    description: string,
    vendor_name: string,
    amount: number,
    currency: string,
    category: string,
    transaction_type: string
  }>,  // max 50, most recent first
  truncated: boolean,
  truncated_count: number
}
```

### Authorization
- Requires caller role: `manager`, `finance_admin`, or `owner`
- Manager: target employee must be a direct report (managerId match)
- Finance admin/owner: any employee in the business

### Error Responses
- Employee not found → "I couldn't find an employee named '{name}' in your team. Your direct reports are: {list}"
- Not authorized → "You can only view data for your direct reports."
- Ambiguous match → "Multiple matches found for '{name}': {list}. Please specify which employee."

---

## Tool: get_team_summary

**Category**: 1-2 (Data Retrieval + Aggregation)
**File**: `src/lib/ai/tools/team-summary-tool.ts`
**Registered in**: `src/lib/ai/tools/tool-factory.ts`

### Input Schema (OpenAI Function Calling Format)

```json
{
  "type": "function",
  "function": {
    "name": "get_team_summary",
    "description": "Get aggregate spending summary across your team (all direct reports). Use this tool when a manager asks about total team spending, spending rankings, or comparisons across employees (e.g., 'What is the total team spending this month?', 'Who spent the most on travel?'). Returns per-employee breakdown and top categories.",
    "parameters": {
      "type": "object",
      "properties": {
        "date_range": {
          "type": "string",
          "description": "Natural language date expression (e.g., 'this month', 'last quarter', 'January 2026'). Converted to exact dates deterministically."
        },
        "start_date": {
          "type": "string",
          "description": "Explicit start date in YYYY-MM-DD format."
        },
        "end_date": {
          "type": "string",
          "description": "Explicit end date in YYYY-MM-DD format."
        },
        "category": {
          "type": "string",
          "description": "Optional category filter in natural language (e.g., 'travel', 'meals')."
        },
        "group_by": {
          "type": "string",
          "enum": ["employee", "category", "vendor"],
          "description": "How to group the summary breakdown. Default: employee."
        }
      },
      "required": []
    }
  }
}
```

### Output Schema (Zod-validated)

```typescript
{
  summary: {
    total_amount: number,
    currency: string,
    employee_count: number,
    record_count: number,
    date_range: { start: string, end: string }
  },
  breakdown: Array<{
    group_key: string,
    total_amount: number,
    record_count: number,
    percentage: number
  }>,  // sorted by total_amount descending
  top_categories: Array<{
    category: string,
    total_amount: number,
    percentage: number
  }>  // top 5
}
```

### Authorization
- Requires caller role: `manager`, `finance_admin`, or `owner`
- Manager: aggregates only direct reports
- Finance admin/owner: aggregates all business employees

### Error Responses
- No direct reports → "You don't have any direct reports assigned. Please contact your administrator."
- No data in range → structured zero-total response (not a free-form message)

# MCP Server Tool Contracts

## Tool: analyze_team_spending

**Category**: 3 (Domain Intelligence — server-side computation)
**File**: `src/lambda/mcp-server/tools/analyze-team-spending.ts`
**Schema**: `src/lambda/mcp-server/contracts/mcp-tools.ts`
**Registered in**: `src/lambda/mcp-server/handler.ts`

### Input Schema (Zod)

```typescript
export const AnalyzeTeamSpendingInputSchema = z.object({
  business_id: z.string().optional()
    .describe('Business ID (optional when using API key auth - derived from key)'),
  manager_user_id: z.string()
    .describe('Convex user ID of the requesting manager. Used to identify direct reports.'),
  employee_filter: z.array(z.string()).optional()
    .describe('Optional filter to specific employee Convex user IDs. If omitted, includes all direct reports.'),
  date_range: z.object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  }).optional()
    .describe('Date range in YYYY-MM-DD format. Defaults to last 30 days.'),
  category_filter: z.array(z.string()).optional()
    .describe('Filter to specific IFRS category IDs (e.g., ["travel_entertainment", "administrative_expenses"])'),
  vendor_filter: z.array(z.string()).optional()
    .describe('Filter to specific vendor names (case-insensitive partial match)'),
  include_trends: z.boolean().default(true)
    .describe('Include spending trend analysis comparing current to previous period'),
  include_rankings: z.boolean().default(true)
    .describe('Include employee spending rankings')
});
```

### Output Interface

```typescript
export interface AnalyzeTeamSpendingOutput {
  team_summary: {
    total_spend: number;
    currency: string;
    employee_count: number;
    transaction_count: number;
    date_range: { start: string; end: string };
    avg_per_employee: number;
  };
  employee_rankings: Array<{
    employee_name: string;
    employee_id: string;
    total_spend: number;
    transaction_count: number;
    percentage_of_total: number;
    top_category: string;
    top_vendor: string;
  }>;
  category_breakdown: Array<{
    category_id: string;
    category_name: string;
    total_amount: number;
    percentage: number;
    transaction_count: number;
  }>;
  vendor_breakdown: Array<{
    vendor_name: string;
    total_amount: number;
    percentage: number;
    transaction_count: number;
  }>;
  trends?: {
    current_period_total: number;
    previous_period_total: number;
    change_percentage: number;
    change_direction: 'increase' | 'decrease' | 'stable';
    top_increase_category?: string;
    top_decrease_category?: string;
  };
}
```

### Authorization
- MCP API key must have `analyze_team_spending` permission
- `manager_user_id` is verified against business_memberships
- Only direct reports of the specified manager are included (unless finance_admin/owner role)

### JSON-RPC Request Example

```json
{
  "jsonrpc": "2.0",
  "id": "req-123",
  "method": "tools/call",
  "params": {
    "name": "analyze_team_spending",
    "arguments": {
      "manager_user_id": "j57abc123def",
      "date_range": { "start": "2026-01-01", "end": "2026-01-31" },
      "include_trends": true,
      "include_rankings": true
    }
  }
}
```

### Error Codes
- `-32001` (UNAUTHORIZED): Manager not found or not authorized
- `-32003` (INSUFFICIENT_DATA): No direct reports or no transactions in range
- `-32004` (CONVEX_ERROR): Database query failure

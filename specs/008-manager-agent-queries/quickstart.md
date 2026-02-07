# Quickstart: Manager Cross-Employee Financial Queries

## Build & Test

```bash
# Install dependencies (if any new packages added)
npm install

# Run type checking
npm run typecheck

# Build Next.js app (validates all TypeScript)
npm run build

# Deploy Convex schema/functions (dev)
npx convex dev

# Deploy MCP server to AWS
cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2

# Deploy Convex to prod (after Convex changes)
npx convex deploy --yes
```

## Key Files to Create/Modify

### New Files

| File | Purpose |
|------|---------|
| `src/lib/ai/utils/date-range-resolver.ts` | Shared deterministic date range calculator |
| `src/lib/ai/utils/category-mapper.ts` | Natural language → IFRS category mapping |
| `src/lib/ai/tools/employee-expense-tool.ts` | `get_employee_expenses` LangGraph tool |
| `src/lib/ai/tools/team-summary-tool.ts` | `get_team_summary` LangGraph tool |
| `src/lambda/mcp-server/tools/analyze-team-spending.ts` | MCP analytics tool |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/ai/tools/tool-factory.ts` | Register new tools, add role-based filtering |
| `src/lib/ai/tools/transaction-lookup-tool.ts` | Use shared date-range-resolver |
| `convex/functions/financialIntelligence.ts` | Add 3 new query functions |
| `convex/functions/memberships.ts` | Add `resolveEmployeeByName` query |
| `src/lambda/mcp-server/handler.ts` | Register `analyze_team_spending` |
| `src/lambda/mcp-server/contracts/mcp-tools.ts` | Add schema for new MCP tool |
| `src/lib/ai/config/prompts.ts` | Update system prompt with manager tool descriptions |

## Git Config (Required)

```bash
git config user.name "grootdev-ai"
git config user.email "dev@hellogroot.com"
```

## Implementation Order

1. **Shared utilities** → date-range-resolver, category-mapper
2. **Convex queries** → new functions in financialIntelligence.ts and memberships.ts
3. **LangGraph tools** → employee-expense-tool, team-summary-tool
4. **Tool factory** → register new tools, add role-based routing
5. **MCP server tool** → analyze-team-spending
6. **System prompt** → update tool descriptions
7. **Integration testing** → end-to-end with AI assistant

## Verification

After each major step, run:
```bash
npm run build   # Must pass
```

After Convex changes:
```bash
npx convex dev  # Auto-sync to dev
```

After MCP server changes:
```bash
cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2
```

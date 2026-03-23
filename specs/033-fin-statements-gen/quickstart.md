# Quickstart: Auto-Generated Financial Statements

## Prerequisites
- Node.js 20+, npm
- Convex CLI (`npx convex`)
- AWS CDK CLI (`npx cdk`) with `groot-finanseal` profile

## Development
```bash
# 1. Install dependencies (if needed)
npm install

# 2. Run Convex dev (main working directory only!)
npx convex dev

# 3. Run Next.js dev
npm run dev
```

## Key Files to Modify
1. `convex/lib/statement_generators/` — Backend generators
2. `convex/functions/financialStatements.ts` — Convex action endpoints
3. `src/domains/financial-statements/` — UI components (NEW domain)
4. `src/lambda/mcp-server/tools/` — MCP tool endpoints
5. `src/lib/ai/tools/` — Chat agent tool wrappers

## Verification
```bash
npm run build                          # Must pass
npx convex deploy --yes                # Deploy Convex changes
cd infra && npx cdk deploy --profile groot-finanseal --region us-west-2  # Deploy MCP tools
```

## Testing
- Navigate to `/financial-statements` in the app
- Generate each report type with different periods
- Verify Trial Balance balances (DR = CR)
- Verify Balance Sheet equation (A = L + E)
- Export PDF and CSV for each report
- Ask chat agent: "Show me P&L for last quarter"

# Quickstart: Agent RBAC Hardening

## Implementation Order

1. **Security fixes first** (P1) — these close active vulnerabilities
2. **System prompt + clarification** (P2a) — improves agent intelligence
3. **New Convex queries** (P2b) — backend for new tools
4. **New tools** (P2c) — AP search, AR summary, AP aging, business txns
5. **Enhancements** (P3) — team vendor filter, multi-business consistency

## Critical Files

| File | Change | Priority |
|------|--------|----------|
| `src/lib/ai/tools/base-tool.ts` | Add `userContext.role = userProfile.role` at line ~111 | P1 |
| `src/lib/ai/tools/tool-factory.ts` | Add FINANCE_TOOLS set, update getToolSchemasForRole() | P1 |
| `src/app/api/copilotkit/route.ts` | Add businessId membership validation | P1 |
| `src/lib/ai/agent/config/prompts.ts` | Add role-aware section to system prompt | P2 |
| `src/lib/ai/agent/nodes/intent-node.ts` | Fix clarification skip for cross-employee queries | P2 |
| `convex/functions/financialIntelligence.ts` | Add getARSummary, getAPAging, getBusinessTransactions | P2 |
| `convex/functions/invoices.ts` | Add searchForAI query | P2 |
| `convex/functions/memberships.ts` | Add validateBusinessAccess query | P1 |
| `src/lib/ai/tools/get-invoices-tool.ts` | Add vendor/date/amount/invoiceNumber params | P2 |
| `src/lib/ai/tools/ar-summary-tool.ts` | New: AR aging + revenue summary | P2 |
| `src/lib/ai/tools/ap-aging-tool.ts` | New: AP aging + vendor balances | P2 |
| `src/lib/ai/tools/business-transactions-tool.ts` | New: Business-wide transaction query | P2 |
| `src/lib/ai/tools/team-summary-tool.ts` | Add vendor filter param | P3 |

## Testing

Use the 3 test accounts from `.env.local`:
- **TEST_USER_ADMIN** (finance_admin) — should access ALL tools
- **TEST_USER_MANAGER** — should access personal + team tools, NOT finance tools
- **TEST_USER_EMPLOYEE** — should access personal tools ONLY

Test at https://finance.hellogroot.com after each deployment.

## Build & Deploy

```bash
npm run build                    # Must pass
npx convex deploy --yes          # After any Convex changes
```

## Key Patterns to Follow

- New tools extend `BaseTool` from `base-tool.ts`
- Register in `ToolFactory.tools` static block
- Add to appropriate tier set (FINANCE_TOOLS, MANAGER_TOOLS)
- New Convex aggregation queries: use `action` + `internalQuery` (NOT reactive `query`)
- Tool output: emit action card JSON blocks for interactive rendering (see existing cash_flow_dashboard, invoice_posting patterns)
- Never return raw JSON to user — always format as conversational text + action cards

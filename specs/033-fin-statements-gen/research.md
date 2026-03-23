# Research: Auto-Generated Financial Statements

## Existing Foundation (Already Built)

| Component | Status | File | Notes |
|-----------|--------|------|-------|
| Trial Balance Generator | DONE | `convex/lib/statement_generators/trial_balance_generator.ts` | 3-query pattern, accounts → entries → lines, groups by account |
| P&L Generator | DONE | `convex/lib/statement_generators/profit_loss_generator.ts` | Revenue 4xxx, COGS 5xxx, OpEx 6xxx, Other Income/Expenses |
| Convex Query Endpoints | NEEDS FIX | `convex/functions/financialStatements.ts` | Uses reactive `query` — MUST convert to `action` per CLAUDE.md bandwidth rules |
| P&L PDF Template | DONE | `src/lib/reports/templates/pnl-template.tsx` | Standard format, renderToBuffer pattern |
| Cash Flow PDF Template | PARTIAL | `src/lib/reports/templates/cash-flow-template.tsx` | Simplified inflows/outflows only — needs Operating/Investing/Financing categorization |
| Report Generator Orchestrator | PARTIAL | `src/lib/reports/report-generator.ts` | Has pnl, cash_flow, ar/ap_aging, expense_summary — missing trial_balance, balance_sheet |
| Nav Item | EXISTS | `src/lib/navigation/nav-items.ts` | `reporting` entry at `/reporting` (admin+manager only in workspace group) |
| Report Generator Orchestrator | PARTIAL | `src/lib/reports/report-generator.ts` | Has pnl, cash_flow — missing trial_balance, balance_sheet types |

## What Needs To Be Built

### Backend Generators (Convex)
1. **Balance Sheet Generator** — `convex/lib/statement_generators/balance_sheet_generator.ts`
   - Point-in-time snapshot (all posted entries up to date)
   - Assets (1xxx), Liabilities (2xxx), Equity (3xxx)
   - Current/Non-Current by sub-range (1000-1499/1500-1999, 2000-2499/2500-2999)
   - Dynamic retained earnings = sum(Revenue) - sum(Expenses) for all prior periods
   - Verify A = L + E

2. **Cash Flow Generator** — `convex/lib/statement_generators/cash_flow_generator.ts`
   - Direct method: filter journal entries involving Cash account (1000)
   - Classify by contra-account code range:
     - Operating: Revenue (4xxx) or Expense (5xxx-6xxx) contra
     - Investing: Fixed Asset (1500-1999) contra
     - Financing: Liability (2xxx) or Equity (3xxx) contra
   - Calculate opening balance, closing balance, net change
   - Verify opening + net change = closing

3. **Convert queries → actions** in `convex/functions/financialStatements.ts`
   - Change `query` to `action` + `internalQuery` pattern
   - Add balance sheet and cash flow endpoints
   - Add P&L period comparison (two P&L calls, compute variance)

### PDF Templates
4. **Trial Balance PDF** — `src/lib/reports/templates/trial-balance-template.tsx`
5. **Balance Sheet PDF** — `src/lib/reports/templates/balance-sheet-template.tsx`
6. **Update Cash Flow PDF** — Add Operating/Investing/Financing sections

### UI
7. **Financial Statements Page** — `src/app/[locale]/financial-statements/page.tsx`
   - Server component, mandatory layout (Sidebar + HeaderWithUser)
   - Tab navigation: Trial Balance | P&L | Balance Sheet | Cash Flow
8. **Client Component** — `src/domains/financial-statements/components/financial-statements-client.tsx`
   - Tab switching, period selector, report display, export buttons
9. **Period Selector** — Shared component with presets + custom range
10. **CSV Export** — Convert report data to CSV download
11. **How It Works Drawer** — Standard info drawer per CLAUDE.md

### MCP + Chat Agent
12. **4 MCP Tools** — `generate_trial_balance`, `generate_pnl`, `generate_balance_sheet`, `generate_cash_flow`
13. **4 Chat Agent Tool Wrappers** — Delegate to MCP
14. **Tool Factory Registration** — Register 4 new tools
15. **Date Resolution** — Reuse existing `resolvePeriod()` for "last quarter", "this month" etc.

### Cross-cutting
16. **Role-based access** — Check Owner/Admin or Manager before generating
17. **Update nav-items.ts** — Point to `/financial-statements` or use existing `/reporting`
18. **Update report-generator.ts** — Add trial_balance and balance_sheet types

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Convex function type | `action` + `internalQuery` | Heavy aggregation — reactive `query` burns bandwidth |
| Cash flow method | Direct method | Simpler for SMEs, derives from actual cash transactions |
| Current/Non-Current | Account code sub-ranges | No schema changes, deterministic, per clarification |
| Report persistence | On-demand, not stored | Avoids storage cost, always fresh data |
| Cash flow classification | Contra-account code | Operating (4xxx-6xxx), Investing (1500-1999), Financing (2xxx-3xxx) |
| P&L comparison | Two separate P&L calls | Reuse existing generator, compute variance in action |
| Page route | `/financial-statements` | Distinct from generic `/reporting`, clearer intent |
| Access control | Owner/Admin + Manager | Per clarification, employees excluded |

# Implementation Plan: Auto-Generated Financial Statements

**Branch**: `033-fin-statements-gen` | **Date**: 2026-03-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/033-fin-statements-gen/spec.md`

## Summary

Build four auto-generated financial statements (Trial Balance, P&L, Balance Sheet, Cash Flow) with period filtering, PDF/CSV export, P&L period comparison, and chat agent integration via MCP tools. ~40% of backend generators and PDF templates already exist — main work is Balance Sheet generator, Cash Flow generator, UI page, MCP tools, and converting reactive queries to non-reactive actions.

## Technical Context

**Language/Version**: TypeScript 5.9.3 (Next.js 15.5.7 + Convex 1.31.3)
**Primary Dependencies**: Convex (DB + real-time), @react-pdf/renderer (PDF export), Radix UI + Tailwind CSS (UI), lucide-react (icons)
**Storage**: Convex (journal_entries, journal_entry_lines, chart_of_accounts — all existing tables)
**Testing**: Manual UAT via production URL
**Target Platform**: Web (desktop + mobile responsive)
**Project Type**: Web application (Next.js + Convex)
**Performance Goals**: Reports generate in <3 seconds for 12 months of data
**Constraints**: Convex free tier bandwidth (2GB/month) — must use `action` not reactive `query` for aggregations
**Scale/Scope**: ~100 SME businesses, ~1000 journal entries per business per year

## Constitution Check

No project-specific constitution defined. Following CLAUDE.md rules:
- ✅ Heavy aggregation → `action` + `internalQuery` (not reactive `query`)
- ✅ MCP-first for chat agent tools
- ✅ Domain-driven structure
- ✅ Mandatory page layout (Sidebar + HeaderWithUser)
- ✅ Semantic design tokens (no hardcoded colors)
- ✅ Role-based access (Owner/Admin + Manager only)

## Project Structure

### Documentation (this feature)

```text
specs/033-fin-statements-gen/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0: existing code audit + decisions
├── data-model.md        # Phase 1: data structures (in-memory, no new tables)
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2: implementation tasks
```

### Source Code (repository root)

```text
# Backend: Convex generators + actions
convex/lib/statement_generators/
├── trial_balance_generator.ts       # EXISTS — no changes needed
├── profit_loss_generator.ts         # EXISTS — no changes needed
├── balance_sheet_generator.ts       # NEW
└── cash_flow_generator.ts           # NEW

convex/functions/
└── financialStatements.ts           # EXISTS — convert query→action, add balance sheet + cash flow + comparison

# PDF Templates
src/lib/reports/templates/
├── pnl-template.tsx                 # EXISTS — no changes needed
├── cash-flow-template.tsx           # EXISTS — update with Operating/Investing/Financing sections
├── trial-balance-template.tsx       # NEW
└── balance-sheet-template.tsx       # NEW

src/lib/reports/
└── report-generator.ts              # EXISTS — add trial_balance + balance_sheet types

# UI: Financial Statements page
src/app/[locale]/financial-statements/
└── page.tsx                         # NEW — server component with mandatory layout

src/domains/financial-statements/
└── components/
    ├── financial-statements-client.tsx  # NEW — main client component with tabs
    ├── period-selector.tsx              # NEW — shared period picker with presets
    ├── trial-balance-view.tsx           # NEW — TB report display
    ├── profit-loss-view.tsx             # NEW — P&L display with comparison
    ├── balance-sheet-view.tsx           # NEW — BS display
    ├── cash-flow-view.tsx               # NEW — CF display
    ├── report-export-buttons.tsx        # NEW — PDF/CSV export buttons
    └── how-it-works-drawer.tsx          # NEW — info drawer

# MCP Tools (Chat Agent)
src/lambda/mcp-server/tools/
├── generate-trial-balance.ts        # NEW
├── generate-pnl.ts                  # NEW
├── generate-balance-sheet.ts        # NEW
└── generate-cash-flow.ts            # NEW

src/lib/ai/tools/
├── generate-trial-balance-tool.ts   # NEW — chat agent wrapper
├── generate-pnl-tool.ts            # NEW
├── generate-balance-sheet-tool.ts   # NEW
└── generate-cash-flow-tool.ts       # NEW

# Navigation
src/lib/navigation/nav-items.ts      # UPDATE — add financial-statements entry
```

**Structure Decision**: Follows existing domain-driven structure. Financial statements is a new domain under `src/domains/financial-statements/`. Backend generators live in `convex/lib/statement_generators/` (existing location). MCP tools follow established pattern in `src/lambda/mcp-server/tools/`.

## Implementation Phases

### Phase 1: Backend Generators (Foundation)
1. Create Balance Sheet generator
2. Create Cash Flow generator
3. Convert `financialStatements.ts` from reactive `query` to `action` + `internalQuery`
4. Add balance sheet, cash flow, and P&L comparison actions
5. Deploy Convex: `npx convex deploy --yes`

### Phase 2: PDF Templates + Export
6. Create Trial Balance PDF template
7. Create Balance Sheet PDF template
8. Update Cash Flow PDF template with Operating/Investing/Financing
9. Update report-generator.ts with new report types
10. Add CSV export utility function

### Phase 3: UI Page + Components
11. Create domain structure: `src/domains/financial-statements/`
12. Create period selector component
13. Create report view components (4 views)
14. Create export buttons component
15. Create How It Works drawer
16. Create main client component with tabs
17. Create server page with mandatory layout
18. Update nav-items.ts

### Phase 4: MCP + Chat Agent
19. Create 4 MCP tool endpoints
20. Register tools in MCP handler
21. Create 4 chat agent tool wrappers
22. Register in tool factory
23. Deploy MCP server: `cd infra && npx cdk deploy`

### Phase 5: Verification
24. `npm run build` — must pass
25. `npx convex deploy --yes` — deploy Convex functions
26. Manual verification on production URL

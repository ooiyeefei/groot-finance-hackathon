# Quickstart: Budget Tracking + Manager Team Tools

## Build Order

1. **Data model** — Add `budgetLimit`/`budgetCurrency` to category object type, update category CRUD
2. **Category settings UI** — Add budget field to form modal and management table
3. **Budget calculation backend** — Convex action to compute spend-vs-budget per category
4. **Chat tools** — `set_budget`, `check_budget_status`, `get_late_approvals`, `compare_team_spending`
5. **Action cards** — `budget_status`, `late_approvals`, `team_comparison` cards
6. **Auto-generation** — Wire tools to cards in copilotkit-adapter.ts
7. **Proactive alerts** — Budget threshold check on expense approval
8. **Tool registration** — Register all tools in tool-factory.ts with MANAGER_TOOLS access

## Verification Steps

1. `npm run build` — Must pass
2. `npx convex deploy --yes` — Deploy schema/function changes
3. Chat test: "Set Travel budget to RM 5000" → confirms creation
4. Chat test: "What is our budget status?" → shows budget card with categories
5. Chat test: "Any late approvals?" → shows overdue submissions (or confirms none)
6. Chat test: "Compare team spending" → shows bar chart with outliers
7. Approve an expense that crosses 80% → verify alert in Action Center

## Key Files to Touch

| File | Change |
|------|--------|
| `convex/functions/businesses.ts` | Add budgetLimit to category create/update mutations |
| `convex/functions/budgetTracking.ts` | NEW: budget calculation + alert checking |
| `src/lib/ai/tools/tool-factory.ts` | Register 4 new tools in MANAGER_TOOLS |
| `src/lib/ai/tools/budget-status-tool.ts` | NEW: check_budget_status |
| `src/lib/ai/tools/set-budget-tool.ts` | NEW: set_budget |
| `src/lib/ai/tools/late-approvals-tool.ts` | NEW: get_late_approvals |
| `src/lib/ai/tools/team-comparison-tool.ts` | NEW: compare_team_spending |
| `src/domains/chat/components/action-cards/budget-status-card.tsx` | NEW |
| `src/domains/chat/components/action-cards/late-approvals-card.tsx` | NEW |
| `src/domains/chat/components/action-cards/team-comparison-card.tsx` | NEW |
| `src/domains/chat/components/action-cards/index.tsx` | Register new cards |
| `src/lib/ai/copilotkit-adapter.ts` | Auto-generation for new tools |
| `src/domains/expense-claims/components/category-form-modal.tsx` | Add budget field |
| `src/domains/expense-claims/components/category-management.tsx` | Add budget column |

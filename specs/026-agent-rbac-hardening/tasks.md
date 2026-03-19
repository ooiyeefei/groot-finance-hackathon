# Tasks: AI Agent RBAC Security Hardening & Intelligence Gaps

## Phase 1: Security Fixes (P1)

### Task 1.1: Propagate role to userContext in base-tool.ts
- [ ] Add `userContext.role = userProfile.role` after line 111 in `base-tool.ts`
- [ ] Verify role is never undefined in checkUserPermissions()
- **Files**: `src/lib/ai/tools/base-tool.ts`

### Task 1.2: Tiered tool access in tool-factory.ts
- [ ] Add `FINANCE_TOOLS` set with finance-restricted tools
- [ ] Update `getToolSchemasForRole()` to filter by 3 tiers
- [ ] Add defense-in-depth: tool execution rejects if role doesn't match tier
- **Files**: `src/lib/ai/tools/tool-factory.ts`

### Task 1.3: BusinessId validation in API route
- [ ] Add Convex query `memberships.validateBusinessAccess`
- [ ] Call validation in copilotkit route when businessId is provided
- [ ] Return 403 for mismatched businessId
- **Files**: `src/app/api/copilotkit/route.ts`, `convex/functions/memberships.ts`

### Task 1.4: Deploy Convex + build check
- [ ] `npx convex deploy --yes`
- [ ] `npm run build`

## Phase 2: System Prompt & Clarification (P2a)

### Task 2.1: Role-aware system prompt
- [ ] Add role parameter to `getSystemPrompt()` and `getFinancialAgentPrompt()`
- [ ] Generate role-specific permission section dynamically
- [ ] Pass role from agent pipeline to prompt generation
- **Files**: `src/lib/ai/agent/config/prompts.ts`, `src/lib/ai/copilotkit-adapter.ts`

### Task 2.2: Fix clarification logic for manager queries
- [ ] Replace blanket `personal_data → skip clarification` with nuanced check
- [ ] Allow clarification for cross-employee queries (team/someone/employee name)
- [ ] Keep skip for genuine personal queries (my/I/me)
- **Files**: `src/lib/ai/agent/nodes/intent-node.ts`

## Phase 3: New Convex Queries (P2b)

### Task 3.1: AP invoice search query
- [ ] Add `invoices.searchForAI` with vendor, date, amount, invoiceNumber filters
- **Files**: `convex/functions/invoices.ts`

### Task 3.2: AR summary query
- [ ] Add `financialIntelligence.getARSummary` action + internalQuery
- [ ] Aging buckets: current, 1-30, 31-60, 61-90, 90+
- **Files**: `convex/functions/financialIntelligence.ts`

### Task 3.3: AP aging query
- [ ] Add `financialIntelligence.getAPAging` action + internalQuery
- [ ] Vendor breakdown + aging buckets
- **Files**: `convex/functions/financialIntelligence.ts`

### Task 3.4: Business-wide transactions query
- [ ] Add `financialIntelligence.getBusinessTransactions` action + internalQuery
- [ ] Include employee attribution in results
- **Files**: `convex/functions/financialIntelligence.ts`

### Task 3.5: Team summary vendor filter
- [ ] Add vendorName filter to `getTeamExpenseSummary`
- **Files**: `convex/functions/financialIntelligence.ts`

### Task 3.6: Scoped action center insights
- [ ] Modify or add scoped version of action center insights query
- [ ] Filter by managerId → direct reports for manager role
- **Files**: `convex/functions/financialIntelligence.ts` or `convex/functions/actionCenter.ts`

### Task 3.7: Deploy Convex
- [ ] `npx convex deploy --yes`

## Phase 4: New AI Tools (P2c)

### Task 4.1: Enhance get_invoices with search params
- [ ] Add vendor, date, amount, invoiceNumber parameters
- [ ] Update schema, validation, executeInternal
- [ ] Format output with invoice_posting action cards
- **Files**: `src/lib/ai/tools/get-invoices-tool.ts`

### Task 4.2: Create AR summary tool
- [ ] New file extending BaseTool
- [ ] Output: conversational text + `ar_aging_dashboard` action card
- [ ] Register in ToolFactory under FINANCE_TOOLS
- **Files**: `src/lib/ai/tools/ar-summary-tool.ts`, `src/lib/ai/tools/tool-factory.ts`

### Task 4.3: Create AP aging tool
- [ ] New file extending BaseTool
- [ ] Output: conversational text + `ap_aging_dashboard` action card
- [ ] Register in ToolFactory under FINANCE_TOOLS
- **Files**: `src/lib/ai/tools/ap-aging-tool.ts`, `src/lib/ai/tools/tool-factory.ts`

### Task 4.4: Create business-wide transactions tool
- [ ] New file extending BaseTool
- [ ] Output: numbered transaction list with employee attribution
- [ ] Register in ToolFactory under FINANCE_TOOLS
- **Files**: `src/lib/ai/tools/business-transactions-tool.ts`, `src/lib/ai/tools/tool-factory.ts`

### Task 4.5: Add vendor filter to team summary tool
- [ ] Add vendor parameter to schema
- [ ] Pass to Convex query
- **Files**: `src/lib/ai/tools/team-summary-tool.ts`

### Task 4.6: Update system prompt with new tool instructions
- [ ] Add tool selection directives for new tools
- [ ] Add examples for AR/AP/business-wide queries
- **Files**: `src/lib/ai/agent/config/prompts.ts`

## Phase 5: Build & Test

### Task 5.1: Build check
- [ ] `npm run build` — must pass with zero errors

### Task 5.2: Deploy Convex
- [ ] `npx convex deploy --yes`

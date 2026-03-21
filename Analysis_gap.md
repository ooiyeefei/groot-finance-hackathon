AI Agent Audit: Capability, RBAC & Security Gap Analysis

  Architecture Summary

  Your agent is a LangGraph StateGraph powered by Qwen3-8B on Modal, with 12 tools
   registered in ToolFactory. The pipeline flows: topicGuardrail → validate →
  analyzeIntent → handleClarification → callModel → executeTool → correctToolCall.

  ---
  WHAT WORKS WELL

  ★ Insight ─────────────────────────────────────
  The foundation is solid — defense-in-depth with multiple security layers. Key
  strengths:
  1. Tenant isolation is enforced at both tool level (userContext.businessId) and
  Convex query level
  2. Manager tools (get_employee_expenses, get_team_summary) have proper RBAC:
  schema filtering removes them from employee tool lists, Convex backend verifies
  managerId → direct reports relationship
  3. Name resolution with fuzzy matching + ambiguity handling is well-designed
  4. Audit logging on cross-employee queries provides accountability
  ─────────────────────────────────────────────────

  ---
  CRITICAL SECURITY GAPS

  Gap 1: Role NOT propagated to userContext in base-tool.ts

  In base-tool.ts:110-111, ensureUserProfile() returns role but it's never set on
  userContext:

  // base-tool.ts:110-111 — only sets these two:
  userContext.convexUserId = userProfile.user_id
  userContext.businessId = userProfile.business_id || undefined
  // ❌ MISSING: userContext.role = userProfile.role

  This means userContext.role stays whatever was passed from the API route. If the
   API route doesn't set it (and looking at copilotkit-adapter.ts, it doesn't
  appear to pass role), the role may be undefined, causing getToolSchemasForRole()
   to fall back to returning ALL tools (line 294-296 of tool-factory.ts):

  if (!userRole) {
    // Role unknown — return all tools (backward compatible)
    return allSchemas  // ❌ Employees get manager tools!
  }

  Severity: HIGH — An employee could potentially receive get_employee_expenses and
   get_team_summary in their tool schemas. The Convex backend would reject the
  query, but the LLM would still try.

  Gap 2: Finance-sensitive tools have NO role restriction

  These tools are available to ALL roles including employee:

  ┌───────────────────────────┬────────┬───────────────────────────────────────┐
  │           Tool            │  Risk  │          Why it's a problem           │
  ├───────────────────────────┼────────┼───────────────────────────────────────┤
  │                           │        │ Shows runway, burn rate, total        │
  │ analyze_cash_flow         │ HIGH   │ income/expenses — this is             │
  │                           │        │ owner/finance_admin data              │
  ├───────────────────────────┼────────┼───────────────────────────────────────┤
  │ detect_anomalies          │ MEDIUM │ Exposes all business transactions,    │
  │                           │        │ not just the user's own               │
  ├───────────────────────────┼────────┼───────────────────────────────────────┤
  │ analyze_vendor_risk       │ MEDIUM │ Exposes vendor concentration, payment │
  │                           │        │  patterns across the business         │
  ├───────────────────────────┼────────┼───────────────────────────────────────┤
  │ get_invoices              │ MEDIUM │ Shows ALL AP invoices including       │
  │                           │        │ amounts, vendors, line items          │
  ├───────────────────────────┼────────┼───────────────────────────────────────┤
  │ get_sales_invoices        │ MEDIUM │ Shows ALL AR invoices including       │
  │                           │        │ customer names, amounts, overdue      │
  ├───────────────────────────┼────────┼───────────────────────────────────────┤
  │ get_action_center_insight │ MEDIUM │ May expose business-wide duplicate    │
  │                           │        │ detection, approval queues            │
  └───────────────────────────┴────────┴───────────────────────────────────────┘

  An employee can ask "What's our cash flow runway?" or "Show me all invoices" and
   get full business financial data.

  Severity: HIGH — Violates least-privilege. Cash flow and invoice data are
  finance-level information.

  Gap 3: No businessId validation between frontend and backend

  The API route accepts businessId from the request body:
  // copilotkit route.ts
  const businessId = requestBody.businessId || userData.business_id

  There's no validation that requestBody.businessId matches a business where the
  user actually has membership. A user could potentially inject a different
  businessId to access another business's data.

  Severity: MEDIUM — Convex queries filter by businessId, and the authenticated
  Convex client should reject mismatched business queries. But the user profile
  enrichment uses ensureUserProfile which resolves to the user's primary business,
   creating a mismatch.

  ---
  FUNCTIONAL GAPS

  Gap 4: No role awareness in system prompt

  The system prompt (prompts.ts) never tells the LLM the user's role. It describes
   manager tools but doesn't instruct:
  - "If the user is an employee, refuse cash flow/invoice/vendor risk queries"
  - "If the user is a manager, they can only see direct reports"
  - "If the user is finance_admin/owner, they can see everything"

  The LLM has no context about WHO is asking — it treats everyone the same and
  lets tools handle permission.

  Impact: The LLM won't proactively say "You don't have permission to view company
   cash flow" — it will call the tool, get data back (because those tools have no
  role check), and return it.

  Gap 5: Clarification skipped for personal_data queries

  In intent-node.ts:52-56:
  if (intentAnalysisResult.intent.queryCategory === 'personal_data') {
    finalRequiresClarification = false  // ❌ Always skips clarification
  }

  This means if a manager asks "How much did someone claim for client meals last
  month?" without naming the employee, the LLM will try to call
  get_employee_expenses with a vague name, get no match, and fail — instead of
  asking "Which employee do you mean?"

  Similarly, "How much did the team claim for client meals?" should route to
  get_team_summary, but the current intent analysis may classify it as
  personal_data → skip clarification → call wrong tool.

  Gap 6: Missing tool capabilities for your use cases

  Use Case: "How much did Kate claim for client meals last month?"
  Gap: ✅ Works — get_employee_expenses with name + category + date
  What's needed: —
  ────────────────────────────────────────
  Use Case: "How much did the team claim for client meals last month?"
  Gap: ⚠️  Partial — get_team_summary exists but only groups by
    employee/category/vendor, not filtered by both
  What's needed: Add combined category + vendor filtering
  ────────────────────────────────────────
  Use Case: "What is Mr Tan's petrol claim from Jan to May?"
  Gap: ✅ Works — get_employee_expenses with category "petrol"
  What's needed: —
  ────────────────────────────────────────
  Use Case: "How much did Tan claim at Starbucks from Jan to May?"
  Gap: ✅ Works — get_employee_expenses with vendor "Starbucks"
  What's needed: —
  ────────────────────────────────────────
  Use Case: "Show me invoice details from supplier ABC"
  Gap: ❌ Missing — get_invoices has no vendor/supplier filter
  What's needed: Need vendor filter, date filter, search on AP invoices
  ────────────────────────────────────────
  Use Case: "How much did we buy from vendor X this quarter?"
  Gap: ❌ Missing — No AP invoice query by vendor + date range
  What's needed: Need vendor-filtered AP query
  ────────────────────────────────────────
  Use Case: "Show line items for invoice #INV-001"
  Gap: ❌ Missing — No single-invoice detail tool
  What's needed: Need invoice detail lookup by ID or number
  ────────────────────────────────────────
  Use Case: "Which customers are overdue?"
  Gap: ⚠️  Partial — get_sales_invoices can filter by status "overdue"
  What's needed: Works but no aging breakdown
  ────────────────────────────────────────
  Use Case: "What's our total revenue this month?"
  Gap: ❌ Missing — No revenue aggregation tool
  What's needed: Need AR/revenue summary tool
  ────────────────────────────────────────
  Use Case: "How much do we owe suppliers?"
  Gap: ❌ Missing — No AP aging/balance tool
  What's needed: Need AP aging report

  Gap 7: get_transactions is personal-scoped — managers can't use it for
  business-wide data

  get_transactions queries journalEntries.getTransactionsSafe which filters by the
   current user's RLS context. This means:
  - A finance admin asking "Show me all office supply expenses this month" only
  sees their own transactions, not the whole business
  - There's no "business-wide transaction query" tool for admin/owner roles

  Gap 8: Multi-business role ambiguity

  A user can be in Business A as employee and Business B as owner. The agent uses
  ensureUserProfile() which resolves to a single business. If the user switches
  businesses in the UI but the AI chat session still holds the old businessId,
  they could get wrong permissions.

  ---
  RECOMMENDED FIXES

  Priority 1 (Security — fix immediately):

  1. Propagate role in base-tool.ts — Add userContext.role = userProfile.role
  after line 111
  2. Tier the tools by role — Expand MANAGER_TOOLS to include finance-sensitive
  tools:
  FINANCE_TOOLS = ['analyze_cash_flow', 'analyze_vendor_risk', 'detect_anomalies']
  ADMIN_TOOLS = ['get_invoices', 'get_sales_invoices',
  'get_action_center_insight']
    - Employee: personal data tools only (get_transactions, search_documents,
  get_vendors, searchRegulatoryKnowledgeBase)
    - Manager: + get_employee_expenses, get_team_summary,
  get_action_center_insight (for approvals)
    - Finance admin / Owner: all tools
  3. Validate businessId — In the API route, verify the requested businessId
  matches a business where the user has active membership

  Priority 2 (Functional — needed for your use cases):

  4. Inject role into system prompt — Add a section like:
  ## YOUR ROLE CONTEXT
  Current user role: {role}
  - As {role}, you can: [list capabilities]
  - You CANNOT: [list restrictions]
  5. Fix clarification for manager queries — Don't skip clarification when the
  query is about someone else's data. Only skip for personal_data when it's the
  user's own data.
  6. Add invoice search tool — search_invoices with vendor, date, amount, invoice
  number filters for AP
  7. Add AR summary tool — Revenue aggregation, overdue aging, customer-level
  breakdown
  8. Add AP aging tool — Vendor-level AP balances, overdue tracking
  9. Add business-wide transaction tool — For finance_admin/owner to query all
  business transactions (not just their own)

  Priority 3 (Intelligence — nice to have):

  10. Smart clarification — When a manager asks about "client meals" without
  naming an employee, the agent should call get_team_summary with category filter
  (not ask for a name), since the question implies a team-level report
  11. Context-aware tool routing — If the user says "how much did the team spend
  on Starbucks?", route to get_team_summary with group_by: "vendor" (currently no
  vendor filter exists on team summary)

  ---
  SUMMARY TABLE

  ┌────────────┬─────────────────────────────────────┬──────────┬─────────────┐
  │  Category  │                Issue                │ Severity │   Status    │
  ├────────────┼─────────────────────────────────────┼──────────┼─────────────┤
  │ Security   │ Role not propagated to userContext  │ HIGH     │ Gap         │
  ├────────────┼─────────────────────────────────────┼──────────┼─────────────┤
  │ Security   │ Finance tools accessible to all     │ HIGH     │ Gap         │
  │            │ roles                               │          │             │
  ├────────────┼─────────────────────────────────────┼──────────┼─────────────┤
  │ Security   │ businessId not validated against    │ MEDIUM   │ Gap         │
  │            │ membership                          │          │             │
  ├────────────┼─────────────────────────────────────┼──────────┼─────────────┤
  │ Security   │ System prompt has no role awareness │ MEDIUM   │ Gap         │
  ├────────────┼─────────────────────────────────────┼──────────┼─────────────┤
  │ Functional │ Clarification skipped for           │ MEDIUM   │ Gap         │
  │            │ cross-employee queries              │          │             │
  ├────────────┼─────────────────────────────────────┼──────────┼─────────────┤
  │ Functional │ No AP invoice search (vendor/date   │ HIGH     │ Missing     │
  │            │ filter)                             │          │ tool        │
  ├────────────┼─────────────────────────────────────┼──────────┼─────────────┤
  │ Functional │ No AR revenue/aging summary         │ MEDIUM   │ Missing     │
  │            │                                     │          │ tool        │
  ├────────────┼─────────────────────────────────────┼──────────┼─────────────┤
  │ Functional │ No AP aging/balance tool            │ MEDIUM   │ Missing     │
  │            │                                     │          │ tool        │
  ├────────────┼─────────────────────────────────────┼──────────┼─────────────┤
  │ Functional │ No business-wide transaction query  │ MEDIUM   │ Missing     │
  │            │                                     │          │ tool        │
  ├────────────┼─────────────────────────────────────┼──────────┼─────────────┤
  │ Functional │ No single-invoice detail lookup     │ LOW      │ Missing     │
  │            │                                     │          │ tool        │
  ├────────────┼─────────────────────────────────────┼──────────┼─────────────┤
  │ Functional │ Team summary lacks vendor filter    │ LOW      │ Enhancement │
  ├────────────┼─────────────────────────────────────┼──────────┼─────────────┤
  │ Working    │ Tenant isolation (businessId on     │ —        │ ✅ Solid    │
  │            │ every query)                        │          │             │
  ├────────────┼─────────────────────────────────────┼──────────┼─────────────┤
  │ Working    │ Manager → direct reports            │ —        │ ✅ Solid    │
  │            │ enforcement                         │          │             │
  ├────────────┼─────────────────────────────────────┼──────────┼─────────────┤
  │ Working    │ Name resolution + fuzzy matching    │ —        │ ✅ Solid    │
  ├────────────┼─────────────────────────────────────┼──────────┼─────────────┤
  │ Working    │ Audit logging on cross-employee     │ —        │ ✅ Solid    │
  │            │ queries                             │          │             │
  ├────────────┼─────────────────────────────────────┼──────────┼─────────────┤
  │ Working    │ Category mapping + date resolution  │ —        │ ✅ Solid    │
  └────────────┴─────────────────────────────────────┴──────────┴─────────────┘
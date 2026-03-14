# Data Model: Improve AI Action Center

## Modified Entities

### actionCenterInsights (existing table — no schema changes)

No new fields added to the Convex schema. The `metadata` field (type `v.any()`) already supports arbitrary JSON. We use it to store:

- `metadata.sourceDataDomain`: `"ap_vendor" | "expense_claim" | "cross_domain"` — tracks which domain produced the insight
- `metadata.consolidatedEntities`: Array of `{ name, percentage, amount }` — for pattern-level summary cards listing all affected entities
- `metadata.aiDiscovered`: `true` — flag for LLM-generated insights (already exists)
- `metadata.materialityPct`: number — amount as percentage of monthly expenses

### business_expense_categories (existing table — read only)

Used for category name resolution. Fields used:
- `_id`: The category ID (e.g., `other_9gsnmr` format)
- `category_name`: Human-readable name (e.g., "Others")
- `businessId`: Links to business

### accounting_entries (existing table — read only)

Domain classification heuristic:
- Has `vendorId` (non-null, links to `vendors` table) → AP/COGS domain
- No `vendorId` + `transactionType === "Expense"` → Expense-claim domain
- `transactionType === "Cost of Goods Sold"` → COGS domain (treated as AP for supplier analysis)

### vendors (existing table — read only)

Only used for `runVendorRiskAnalysis` (already scoped correctly). No changes needed.

## New Utility Functions (in actionCenterJobs.ts)

### resolveCategoryName(ctx, businessId, categoryCode)
- Queries `business_expense_categories` for the business
- Returns `category_name` if found
- Fallback: strips `_[a-z0-9]+$` suffix, capitalizes first letter

### classifyEntryDomain(entry)
- Returns `"ap_vendor"` if `entry.vendorId` exists
- Returns `"cogs"` if `entry.transactionType === "Cost of Goods Sold"`
- Returns `"expense_claim"` otherwise

### computeMaterialityPriority(amount, monthlyExpenses, sigmaDeviation)
- If `amount / monthlyExpenses < 0.001` → suppress (return null)
- If `amount / monthlyExpenses < 0.01` → cap at "low"
- Otherwise: use σ-based logic (>3σ = "high", >2σ = "medium")

### computeJaccardSimilarity(title1, title2)
- Tokenize: lowercase, split on `\W+`, filter stopwords
- Return: `|intersection| / |union|`

### getInsightQuestionChips(insightCategory)
- Returns 2-3 suggested questions based on insight category
- Anomaly: ["Show me the transaction details", "Is this a recurring pattern?", "What's the financial impact?"]
- Cash flow: ["What's my projected runway?", "Show me recent income vs expenses", "Which invoices are overdue?"]
- Optimization: ["Which suppliers are affected?", "What are my alternatives?", "Show me the spending trend"]
- Default: ["What data supports this?", "What should I do next?"]

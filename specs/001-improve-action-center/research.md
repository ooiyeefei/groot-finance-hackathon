# Research: Improve AI Action Center

## R1: Category Name Resolution Strategy

**Decision**: Query `business_expense_categories` table at detection time, with fallback regex cleanup.
**Rationale**: The `business_expense_categories` table stores `category_name` alongside the ID. Existing `expense-category-mapper.ts` already does this for expense claims. We replicate the lookup in the detection pipeline.
**Alternatives considered**: (a) Pre-compute a category map at cron start — rejected because category config can change between runs. (b) Store resolved names in accounting_entries — rejected because it duplicates data and requires backfill.

## R2: AP vs Expense-Claim Entry Classification

**Decision**: Use `vendorId` presence on `accounting_entries` as the domain classifier. Entries with `vendorId` (linking to `vendors` table) = AP/COGS domain. Entries without `vendorId` = expense-claim domain.
**Rationale**: The `vendors` table is the AP vendor management system. When AP invoices create accounting entries, they link via `vendorId`. Expense claims create entries with `vendorName` only (no `vendorId` foreign key). This is a reliable heuristic confirmed by schema analysis.
**Alternatives considered**: (a) Cross-reference `expense_claims` table by date/amount — too expensive and fragile. (b) Add a `sourceDomain` field to accounting_entries — schema change for future, not needed now.

## R3: Materiality Threshold Calibration

**Decision**: Use 0.1% of 90-day total expenses as suppression floor, 1% as "high" priority floor. Combine with σ-deviation for final priority.
**Rationale**: Industry audit materiality for SMEs is typically 1-5% of revenue. For expense anomalies, 1% of total expenses is a conservative threshold. The 0.1% floor prevents noise from trivial amounts.
**Alternatives considered**: (a) Fixed absolute threshold (e.g., RM500) — rejected because it doesn't scale across business sizes. (b) Per-category materiality — adds complexity, defer to v2.

## R4: Jaccard Similarity for Semantic Dedup

**Decision**: Tokenize titles (lowercase, split on whitespace/punctuation, remove stopwords), compute Jaccard coefficient, threshold at 0.6.
**Rationale**: Simple, deterministic, zero-cost. Tested mentally against known duplicates: "High Concentration in Top Vendors" vs "Concentration in Top Vendors with High Expenses" → tokens overlap significantly (>0.6). Distinct insights like "Low cash runway: 15 days" vs "Supplier concentration: Company A" → low overlap (<0.2).
**Alternatives considered**: (a) LLM-based comparison — adds latency and cost per insight. (b) Embedding similarity — requires vector DB. Both overkill for title-level dedup.

## R5: Ask AI Event Protocol

**Decision**: Add `draftMessage` and `suggestionChips` fields to the `finanseal:open-chat` CustomEvent detail. Chat widget checks for `draftMessage` (sets input, doesn't send) vs existing `message` (auto-sends, preserved for backward compatibility).
**Rationale**: Backward-compatible — existing code that sends `message` still works. New Ask AI flow sends `draftMessage` + `suggestionChips` for the improved UX.
**Alternatives considered**: (a) Breaking change to always use draftMessage — rejected because other features may rely on auto-send behavior. (b) URL-based deep link — more complex, unnecessary.

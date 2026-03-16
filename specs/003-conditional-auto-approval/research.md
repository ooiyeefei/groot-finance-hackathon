# Research: Conditional Auto-Approval

## R1: Learning Cycle Counting Strategy

**Decision**: Count user-approved Tier 2 AI matches + user corrections (manual matches for the same alias). Tier 1 exact-reference matches do NOT count.

**Rationale**: The goal is to measure the AI's learned accuracy for fuzzy alias patterns. Tier 1 matches prove the reference number works, not the AI. User corrections are equally valuable — they teach the AI the correct mapping.

**Implementation**: Query `order_matching_corrections` (corrections = user teaching AI) + `sales_orders` where matchMethod = "ai_suggested" AND aiMatchStatus = "approved" (AI got it right). Group by normalized customer name.

## R2: Alias Normalization for Learning Cycles

**Decision**: Normalize by lowercasing, trimming whitespace, and removing common suffixes ("Sdn Bhd", "Sdn. Bhd.", "Plt", "Inc", "Ltd", "Corp"). Then match.

**Rationale**: Malaysian business names commonly include "Sdn Bhd" variants. "ABC Trading Sdn Bhd" and "ABC Trading" should be the same alias. The corrections table already stores both `orderCustomerName` and `correctedInvoiceCustomerName` — use the corrected invoice customer name as the canonical form.

## R3: Journal Entry Posting for Auto-Approved AR Matches

**Decision**: Reuse the existing `createSalesInvoiceJournalEntry` helper from `convex/lib/journal-entry-helpers.ts`. Add a `preparedBy` field to the journal entry metadata.

**Rationale**: The helper already creates the correct double-entry (Debit AR 1200, Credit Revenue 4000). We just need to add "groot_ai_agent" as the preparer reference. The existing `createInternal` mutation in journalEntries.ts accepts all sourceTypes — add "auto_agent" as a new sourceType.

## R4: Critical Failure 5x Weighting in MIPROv2

**Decision**: Add a `weight` field to corrections. Default weight = 1. Critical failures get weight = 5. The DSPy optimizer duplicates weighted examples in the training set (a correction with weight 5 appears 5 times).

**Rationale**: DSPy's BootstrapFewShot and MIPROv2 don't natively support weighted examples. The simplest approach is to duplicate high-weight examples in the training data. This is a proven technique in ML — oversampling critical failures makes the model pay extra attention to those patterns.

## R5: Auto-Disable Safety Valve

**Decision**: Count critical failures using a query on `order_matching_corrections` where correctionType = "critical_failure" AND createdAt > (now - 30 days). If count >= 3, set matching_settings.enableAutoApprove = false and create a notification.

**Rationale**: No need for a separate counter — the corrections table is the source of truth. The 30-day rolling window is computed at query time, not stored.

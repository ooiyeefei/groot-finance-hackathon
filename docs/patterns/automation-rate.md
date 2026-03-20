# Automation Rate Metric Pattern (001-surface-automation-rate)

**Pattern**: Computed metrics aggregating from multiple data sources without schema bloat

## Key Principles

1. **No New Tables for Computed Metrics**: Automation rate is calculated on-demand from existing correction tables. Don't create `automation_rate_history` or similar tables.

2. **Deduplication Required**: Multiple corrections for the same document count as ONE review (FR-021):
   - AR: Deduplicate by `orderReference`
   - Bank: Deduplicate by `bankTransactionDescription + bankName`
   - Use `Map` to track unique keys

3. **Immutable Historical Rates**: Historical rates reflect "what was known at that time" (FR-022):
   - Use `createdAt` range filters on corrections
   - Never query corrections outside the period being calculated
   - This prevents retroactive recalculation

4. **Milestone Tracking**: Extend `businesses` table with nested object (not new table):
   ```typescript
   automationMilestones: v.optional(v.object({
     "90": v.optional(v.number()),
     "95": v.optional(v.number()),
     "99": v.optional(v.number()),
   }))
   ```

5. **Performance Pattern**: Parallel queries with indexed filters:
   ```typescript
   const [arCorrections, bankCorrections, arOrders] = await Promise.all([
     ctx.db.query("order_matching_corrections")
       .withIndex("by_businessId_createdAt", q =>
         q.eq("businessId", bid).gte("createdAt", start).lte("createdAt", end))
       .collect(),
     // ... other queries
   ]);
   ```

## Data Sources

- **AR Recon**: `sales_orders` (AI decisions) + `order_matching_corrections` (reviews)
- **Bank Recon**: `bank_transactions` (AI decisions) + `bank_recon_corrections` (reviews)
- **Fee Classification**: `sales_orders.classifiedFees` (tier 2 = AI) + no corrections table yet
- **Expense OCR**: `expense_claims` (confidenceScore exists = AI) + edits tracked via `version > 1`

## Chart Annotations

Use `dspy_model_versions.trainedAt` for "Model optimized" markers on trend chart:
```typescript
const events = await ctx.db.query("dspy_model_versions")
  .withIndex("by_platform_status", q => q.eq("platform", "ar_matching").eq("status", "active"))
  .filter(q => q.and(q.gte(q.field("trainedAt"), weekStart), q.lte(q.field("trainedAt"), weekEnd)))
  .collect();
```

## Milestone Notification Flow

1. **Cron** (hourly at 6 PM local): Checks rate, updates `businesses.automationMilestones` if threshold crossed
2. **Client subscription**: React component subscribes to `businesses` table, triggers Sonner toast on milestone change
3. **Email digest**: `aiDigest.ts` includes milestone achievements from last 24 hours

## Edge Cases

- `totalDecisions === 0` → return `{ message: "No AI activity in this period" }`
- `totalDecisions < 10` → return `{ hasMinimumData: false, message: "Collecting data..." }`
- Expense edit tracking: `version > 1` AND `confidenceScore` exists (conservative: any edit = full correction)

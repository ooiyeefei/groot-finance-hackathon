# Data Model: Surface Automation Rate Metric

**Feature**: 001-surface-automation-rate
**Date**: 2026-03-16
**Status**: Phase 1 Design

---

## Overview

The automation rate metric is a **computed value**, not a stored entity. It aggregates data from multiple existing tables without requiring new storage tables. The only schema modification is adding milestone tracking to the `businesses` table.

---

## Entities

### 1. Automation Rate Metric (Computed)

**Type**: Computed value (not stored)
**Computation**: Aggregates from 4 data sources

**Fields**:
```typescript
interface AutomationRateMetric {
  rate: number;                    // 0-100 percentage
  totalDecisions: number;          // Count of all AI decisions
  decisionsReviewed: number;       // Count of decisions requiring human review
  period: {
    start: string;                 // ISO date
    end: string;                   // ISO date
    label: string;                 // "Today", "This week", "This month"
  };
  hasMinimumData: boolean;         // true if >= 10 decisions
  message?: string;                // "No AI activity" | "Collecting data..." | undefined
  sources: {
    arRecon: { total: number; reviewed: number };
    bankRecon: { total: number; reviewed: number };
    feeClassification: { total: number; reviewed: number };
    expenseOCR: { total: number; reviewed: number };
  };
}
```

**Calculation Formula**:
```
rate = ((totalDecisions - decisionsReviewed) / totalDecisions) * 100
```

**Validation Rules**:
- `0 <= rate <= 100`
- `totalDecisions >= decisionsReviewed`
- `decisionsReviewed >= 0`
- `totalDecisions >= 0`

**Edge Cases**:
- `totalDecisions === 0` → return `{ rate: 0, message: "No AI activity in this period" }`
- `totalDecisions < 10` → return `{ hasMinimumData: false, message: "Collecting data..." }`

---

### 2. AI Decision Sources (Existing Tables)

AI decisions are distributed across existing tables. No new tables required.

#### 2.1 AR Reconciliation (sales_orders)

**Source Table**: `sales_orders`

**Total Decisions** (query):
```typescript
// Count orders where AI matching was attempted
const arOrders = await ctx.db
  .query("sales_orders")
  .withIndex("by_businessId_createdAt", q =>
    q.eq("businessId", businessId)
     .gte("createdAt", periodStart)
     .lte("createdAt", periodEnd)
  )
  .filter(q => q.neq(q.field("aiMatchStatus"), undefined))
  .collect();

const totalArDecisions = arOrders.length;
```

**Fields Used**:
- `aiMatchStatus`: Indicates AI matching was performed
- `aiMatchTier`: 1 (rule-based) or 2 (AI)
- `createdAt`: For date range filtering

**Decisions Reviewed** (corrections):
```typescript
const arCorrections = await ctx.db
  .query("order_matching_corrections")
  .withIndex("by_businessId_createdAt", q =>
    q.eq("businessId", businessId)
     .gte("createdAt", periodStart)
     .lte("createdAt", periodEnd)
  )
  .collect();

// Deduplicate by orderReference (FR-021: only first correction counts)
const uniqueCorrections = new Map();
arCorrections.forEach(c => {
  if (!uniqueCorrections.has(c.orderReference)) {
    uniqueCorrections.set(c.orderReference, c);
  }
});

const arReviewed = uniqueCorrections.size;
```

**Deduplication**: Use `orderReference` as unique key (multiple corrections for same order = 1 review)

#### 2.2 Bank Reconciliation (bank_transactions)

**Source Table**: `bank_transactions`

**Total Decisions** (query):
```typescript
const bankTransactions = await ctx.db
  .query("bank_transactions")
  .withIndex("by_businessId_createdAt", q =>
    q.eq("businessId", businessId)
     .gte("createdAt", periodStart)
     .lte("createdAt", periodEnd)
  )
  .filter(q => q.neq(q.field("classificationTier"), undefined))
  .collect();

const totalBankDecisions = bankTransactions.length;
```

**Fields Used**:
- `classificationTier`: 1 (rule-based) or 2 (AI)
- `createdAt`: For date range filtering

**Decisions Reviewed** (corrections):
```typescript
const bankCorrections = await ctx.db
  .query("bank_recon_corrections")
  .withIndex("by_businessId_createdAt", q =>
    q.eq("businessId", businessId)
     .gte("createdAt", periodStart)
     .lte("createdAt", periodEnd)
  )
  .collect();

// Deduplicate by bankTransactionDescription + bankName (unique transaction identifier)
const uniqueBankCorrections = new Map();
bankCorrections.forEach(c => {
  const key = `${c.bankTransactionDescription}|${c.bankName}`;
  if (!uniqueBankCorrections.has(key)) {
    uniqueBankCorrections.set(key, c);
  }
});

const bankReviewed = uniqueBankCorrections.size;
```

**Deduplication**: Use `bankTransactionDescription + bankName` as composite key

#### 2.3 Fee Classification (sales_orders.classifiedFees)

**Source Table**: `sales_orders` (embedded array)

**Total Decisions** (query):
```typescript
const ordersWithFees = await ctx.db
  .query("sales_orders")
  .withIndex("by_businessId_createdAt", q =>
    q.eq("businessId", businessId)
     .gte("createdAt", periodStart)
     .lte("createdAt", periodEnd)
  )
  .filter(q => q.neq(q.field("classifiedFees"), undefined))
  .collect();

let totalFeeDecisions = 0;
ordersWithFees.forEach(order => {
  const fees = order.classifiedFees ?? [];
  totalFeeDecisions += fees.filter(f => f.tier === 2).length;
});
```

**Fields Used** (embedded in sales_orders):
- `classifiedFees`: Array of fee objects
- `classifiedFees[].tier`: 2 for AI classification

**Decisions Reviewed** (corrections):
```typescript
// No correction table exists yet - assume 0 corrections
const feeReviewed = 0;
```

**Note**: Fee corrections not yet implemented. When built, add `fee_classification_corrections` table following same pattern as AR/Bank corrections.

#### 2.4 Expense OCR (expense_claims)

**Source Table**: `expense_claims`

**Total Decisions** (query):
```typescript
const expenseClaims = await ctx.db
  .query("expense_claims")
  .withIndex("by_businessId_submittedAt", q =>
    q.eq("businessId", businessId)
     .gte("submittedAt", periodStart)
     .lte("submittedAt", periodEnd)
  )
  .filter(q => q.neq(q.field("confidenceScore"), undefined)) // Has OCR data
  .collect();

const totalExpenseDecisions = expenseClaims.length;
```

**Fields Used**:
- `confidenceScore`: Presence indicates OCR was used
- `version`: Tracks edits (version > 1 = edited)
- `submittedAt`: For date range filtering

**Decisions Reviewed** (edits):
```typescript
// Count claims where version > 1 (any edit after OCR = full correction per spec clarification #3)
const expenseReviewed = expenseClaims.filter(claim =>
  (claim.version ?? 1) > 1
).length;
```

**Note**: Conservative approach - any edit to OCR-extracted data counts as "needing review"

---

### 3. Automation Milestone (Stored in businesses table)

**Type**: Nested object in existing `businesses` table
**Purpose**: Track first achievement of automation rate thresholds

**Schema Addition**:
```typescript
// Extend businesses table
businesses: defineTable({
  // ... existing fields
  automationMilestones: v.optional(v.object({
    "90": v.optional(v.number()),  // Unix timestamp (ms) when 90% first achieved
    "95": v.optional(v.number()),  // Unix timestamp (ms) when 95% first achieved
    "99": v.optional(v.number()),  // Unix timestamp (ms) when 99% first achieved
  })),
})
```

**State Transitions**:
```
undefined → timestamp (on first achievement)
timestamp → timestamp (never changes, immutable)
```

**Validation Rules**:
- Timestamp must be positive integer (Unix ms)
- Once set, never cleared or decreased
- All thresholds independent (achieving 95% doesn't require 90% first)

**Query Pattern**:
```typescript
const business = await ctx.db.get(businessId);
const milestones = business.automationMilestones ?? {};

// Check if threshold already achieved
const alreadyAchieved = milestones["90"] !== undefined;

// Set new milestone
if (currentRate >= 90 && !alreadyAchieved) {
  await ctx.db.patch(businessId, {
    automationMilestones: {
      ...milestones,
      "90": Date.now(),
    },
  });
}
```

---

### 4. Model Optimization Event (Existing Table)

**Type**: Stored in existing `dspy_model_versions` table
**Purpose**: Annotate trend chart with "Model optimized" markers

**Source Table**: `dspy_model_versions`

**Fields Used**:
```typescript
{
  platform: string;        // "ar_matching" | "bank_recon" | "fee_classification"
  domain: string;          // "bank_recon" | "fee_classification"
  trainedAt: number;       // Unix timestamp (ms) - PRIMARY FIELD FOR ANNOTATIONS
  optimizerType: string;   // "bootstrap_fewshot" | "miprov2"
  status: string;          // "active" | "inactive" | "failed"
}
```

**Query Pattern**:
```typescript
// Find optimization events within week
const optimizationEvents = await ctx.db
  .query("dspy_model_versions")
  .withIndex("by_platform_status", q =>
    q.eq("platform", "ar_matching")
     .eq("status", "active")
  )
  .filter(q =>
    q.and(
      q.gte(q.field("trainedAt"), weekStart),
      q.lte(q.field("trainedAt"), weekEnd)
    )
  )
  .collect();

// Group by week for chart annotations
const annotations = optimizationEvents.map(event => ({
  date: event.trainedAt,
  label: "Model optimized",
  modelType: event.platform,
}));
```

**Usage in Trend Chart**:
- Display vertical `<ReferenceLine>` at `trainedAt` timestamp
- Label: "Model optimized"
- Tooltip shows which model(s) were optimized

---

### 5. Automation Rate Trend Point (Computed)

**Type**: Computed value for trend chart
**Purpose**: Weekly automation rate data points

**Fields**:
```typescript
interface AutomationRateTrendPoint {
  weekStart: string;         // ISO date (Monday)
  weekEnd: string;           // ISO date (Sunday)
  week: string;              // Label "Week of Mar 3"
  rate: number | null;       // null if no activity
  totalDecisions: number;
  decisionsReviewed: number;
  hasMinimumData: boolean;   // >= 10 decisions
  optimizationEvents: Array<{
    date: number;            // Unix timestamp
    label: string;           // "Model optimized"
    modelType: string;       // "ar_matching" | "bank_recon" | "fee_classification"
  }>;
}
```

**Computation**:
```typescript
// Generate 8 weeks of data points
const weeks = generateWeekRanges(8); // Helper function returns array of {start, end}

const trendData = await Promise.all(
  weeks.map(async ({ start, end }) => {
    const metric = await calculateAutomationRate(ctx, businessId, start, end);
    const events = await queryOptimizationEvents(ctx, start, end);

    return {
      weekStart: new Date(start).toISOString().split('T')[0],
      weekEnd: new Date(end).toISOString().split('T')[0],
      week: formatWeekLabel(start),
      rate: metric.totalDecisions > 0 ? metric.rate : null,
      totalDecisions: metric.totalDecisions,
      decisionsReviewed: metric.decisionsReviewed,
      hasMinimumData: metric.hasMinimumData,
      optimizationEvents: events,
    };
  })
);
```

**Validation Rules**:
- `rate === null` only when `totalDecisions === 0`
- Week ranges must not overlap
- Week ranges must be sequential (no gaps)

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Data Sources (Existing Tables)                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  sales_orders                bank_transactions                  │
│  ├─ aiMatchStatus            ├─ classificationTier              │
│  ├─ aiMatchTier              └─ createdAt                       │
│  ├─ classifiedFees[]                                            │
│  └─ createdAt                expense_claims                     │
│                              ├─ confidenceScore                  │
│  order_matching_corrections ├─ version                          │
│  ├─ orderReference           └─ submittedAt                     │
│  └─ createdAt                                                    │
│                              dspy_model_versions                 │
│  bank_recon_corrections      ├─ trainedAt                       │
│  ├─ bankTransactionDesc      ├─ platform                        │
│  └─ createdAt                └─ status                          │
│                                                                  │
└──────────────────┬───────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│ Convex Queries (Aggregation Layer)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  getAutomationRate(businessId, period)                          │
│  ├─ Query AR decisions + corrections                            │
│  ├─ Query Bank decisions + corrections                          │
│  ├─ Query Fee decisions (no corrections yet)                    │
│  ├─ Query Expense OCR + edits                                   │
│  ├─ Deduplicate corrections (FR-021)                            │
│  └─ Calculate rate formula                                      │
│                                                                  │
│  getAutomationRateTrend(businessId, weeks)                      │
│  ├─ Generate week ranges                                        │
│  ├─ Query rate for each week                                    │
│  ├─ Query optimization events                                   │
│  └─ Immutable historical data (FR-022)                          │
│                                                                  │
│  checkMilestones(businessId)                                    │
│  ├─ Get current rate                                            │
│  ├─ Read businesses.automationMilestones                        │
│  ├─ Check thresholds (90, 95, 99)                              │
│  └─ Update milestones if newly achieved                         │
│                                                                  │
└──────────────────┬───────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│ React Components (Presentation Layer)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AutomationRateHero                                             │
│  ├─ Displays current rate (large number)                        │
│  ├─ Period selector (Today/Week/Month)                          │
│  └─ Total decisions + reviewed count                            │
│                                                                  │
│  AutomationRateTrendChart                                       │
│  ├─ Recharts LineChart                                          │
│  ├─ ReferenceLine for optimization events                       │
│  └─ Custom tooltip                                              │
│                                                                  │
│  AutomationRateStats (Settings)                                 │
│  ├─ Lifetime total decisions                                    │
│  ├─ Lifetime rate                                               │
│  └─ First/last decision dates                                   │
│                                                                  │
│  ProactiveActionCenter (modified)                               │
│  └─ Daily summary: "X docs, Y reviewed"                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Indexes

**All required indexes already exist** - no new indexes needed.

**Used Indexes**:
1. `sales_orders.by_businessId_createdAt` - For AR decisions
2. `order_matching_corrections.by_businessId_createdAt` - For AR corrections
3. `bank_transactions.by_businessId_createdAt` - For bank decisions
4. `bank_recon_corrections.by_businessId_createdAt` - For bank corrections
5. `expense_claims.by_businessId_submittedAt` - For expense OCR decisions
6. `dspy_model_versions.by_platform_status` - For optimization events

---

## Performance Characteristics

**Query Performance** (estimated):
- Single period automation rate: <100ms (400-800 records)
- 8-week trend: <800ms (8 parallel queries, cached client-side)
- Lifetime stats: <200ms (indexed query + aggregation)

**Memory Footprint**:
- 1 week of data: ~1KB JSON
- 8 weeks trend: ~8KB JSON
- Client-side React Query cache: ~10-20KB total

**Scalability**:
- Supports up to 10,000 AI decisions per week per business
- Aggregation scales linearly with decision count
- Convex indexes ensure efficient filtering

---

## Edge Cases & Handling

### 1. Zero AI Activity
**Condition**: `totalDecisions === 0`
**Handling**:
```typescript
if (totalDecisions === 0) {
  return {
    rate: 0,
    totalDecisions: 0,
    decisionsReviewed: 0,
    hasMinimumData: false,
    message: "No AI activity in this period",
  };
}
```

### 2. Insufficient Data (<10 decisions)
**Condition**: `totalDecisions < 10`
**Handling**:
```typescript
if (totalDecisions < 10) {
  return {
    rate, // Still calculate but flag as unreliable
    totalDecisions,
    decisionsReviewed,
    hasMinimumData: false,
    message: "Collecting data...",
  };
}
```

### 3. Multiple Corrections Same Document
**Condition**: Multiple `order_matching_corrections` for same `orderReference`
**Handling**: Deduplicate by unique key (only first correction counts per FR-021)

### 4. Delayed Corrections
**Condition**: Correction made weeks after original decision
**Handling**: Use `createdAt` of correction, not original decision date (FR-022: immutable historical rates)

### 5. DSPy Optimization Reduces Rate
**Condition**: Model becomes more conservative, rate drops temporarily
**Handling**: Display actual rate without smoothing, "Model optimized" annotation provides context (spec clarification #5)

### 6. Concurrent Milestone Achievements
**Condition**: Rate jumps from 89% to 96% (crosses two thresholds)
**Handling**: Update both milestones in single transaction, trigger both notifications

---

## Migration Plan

**Schema Change Required**: Add `automationMilestones` field to `businesses` table

**Migration Script** (Convex migration):
```typescript
// convex/migrations/add_automation_milestones.ts
import { internalMutation } from "./_generated/server";

export const addAutomationMilestones = internalMutation({
  handler: async (ctx) => {
    const businesses = await ctx.db.query("businesses").collect();

    for (const business of businesses) {
      if (business.automationMilestones === undefined) {
        await ctx.db.patch(business._id, {
          automationMilestones: {},
        });
      }
    }

    return { updated: businesses.length };
  },
});
```

**Execution**: Run via Convex dashboard after schema update, or add as optional field (no migration needed).

**Rollback**: Remove field from schema, data is non-critical (can be recreated).

---

## Testing Data Requirements

**Test Scenarios**:

1. **Happy Path**: 100 decisions, 4 reviewed → 96% rate
2. **Zero Activity**: No decisions → "No AI activity" message
3. **Insufficient Data**: 5 decisions → "Collecting data..." message
4. **All Corrected**: 10 decisions, 10 reviewed → 0% rate
5. **Perfect Automation**: 50 decisions, 0 reviewed → 100% rate
6. **Milestone Crossing**: Rate increases from 89% to 91% → 90% milestone achieved
7. **Historical Immutability**: Correction made 2 weeks later → doesn't affect week 1 rate

**Test Data Setup**:
```sql
-- Create test orders with AI matching
INSERT INTO sales_orders (aiMatchStatus = "matched", createdAt = Week1)

-- Create test corrections
INSERT INTO order_matching_corrections (orderReference = "ORD-001", createdAt = Week1)

-- Verify rate calculation
QUERY getAutomationRate(businessId, Week1) → expect 96%

-- Add delayed correction
INSERT INTO order_matching_corrections (orderReference = "ORD-002", createdAt = Week3)

-- Verify immutability
QUERY getAutomationRate(businessId, Week1) → still 96% (unchanged)
```

---

## Next Steps

1. ✅ Data model defined
2. ⏳ Create contracts/ directory with TypeScript interfaces
3. ⏳ Write quickstart.md developer guide
4. ⏳ Update CLAUDE.md with automation rate patterns
5. ⏳ Generate tasks.md with implementation breakdown

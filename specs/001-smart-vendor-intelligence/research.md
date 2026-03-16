# Research & Technical Decisions: Smart Vendor Intelligence

**Date**: 2026-03-16
**Feature**: 001-smart-vendor-intelligence
**Status**: Complete

## Purpose

This document resolves all "NEEDS CLARIFICATION" items from the implementation plan and documents technical decisions with rationales.

---

## Decision 1: DSPy Fuzzy Matching Strategy

**Context**: The spec requires 80% confidence threshold for item description matching when item codes change. Need to choose the DSPy optimizer that best calibrates similarity scores.

**Decision**: Use **BootstrapFewShot** with **MIPROv2** for periodic optimization

**Rationale**:
- **BootstrapFewShot**: Builds few-shot examples from user confirmations (<80% confidence). When users confirm "STEEL BOLT M8" = "M8 STAINLESS BOLT", this becomes a training example. Generalizes to similar patterns (not just memorizes exact strings).
- **MIPROv2**: Runs weekly to optimize prompts for better semantic understanding. Uses user confirmation/rejection history to tune confidence calibration. Metric: % of AI suggestions confirmed by users (target: >70%).
- **Why not Levenshtein distance**: No semantic understanding. "BOLT 8MM" and "M8 BOLT" are semantically identical but have low Levenshtein similarity.
- **Why not Sentence-BERT directly**: DSPy provides the learning loop infrastructure (corrections → training examples → optimization). Raw Sentence-BERT requires custom training pipeline.

**Implementation Details**:
- DSPy signature: `class FuzzyItemMatcher(dspy.Signature): item_description_a = dspy.InputField(); item_description_b = dspy.InputField(); confidence_score = dspy.OutputField(desc="0-100 similarity score"); reasoning = dspy.OutputField()`
- Training data source: `convex/functions/vendorPriceHistory/` mutations store `matchConfidenceScore` and `userConfirmedFlag`. Bootstrap training set from confirmed matches.
- Optimization schedule: Weekly cron runs MIPROv2 when ≥50 new user confirmations accumulated.
- Model: Gemini 3.1 Flash-Lite (CLAUDE.md requirement)

**Alternatives Considered**:
1. **Fixed TF-IDF cosine similarity** → Rejected: No learning loop, can't improve from corrections
2. **GPT-4 API calls per match** → Rejected: Cost prohibitive at scale (millions of price records)
3. **Fine-tuned BERT model** → Rejected: Requires MLOps infrastructure we don't have; DSPy abstracts this

**Testing Strategy**:
- Unit tests: Known similar/dissimilar pairs → verify confidence scores
- Integration tests: User confirms low-confidence match → verify training example stored → verify next similar match has higher confidence
- Metrics: Track confirmation rate over time (should increase as model learns)

---

## Decision 2: Convex Real-Time Subscription Architecture

**Context**: Price history updates need to be reflected live in the dashboard when new invoices are processed. Convex supports real-time subscriptions.

**Decision**: Use **Convex real-time subscriptions** via `useQuery()` React hooks

**Rationale**:
- **Native Convex feature**: `useQuery(api.vendorPriceHistory.list, { vendorId })` automatically subscribes to updates. When new price record inserted, UI re-renders instantly.
- **Zero polling code**: No setInterval, no manual refetch logic. Convex handles WebSocket connection management.
- **Optimistic updates**: Convex mutations return immediately; UI updates before server confirmation.
- **Bandwidth efficient**: Only changed documents sent over WebSocket, not full query re-fetch.

**Why not HTTP polling**:
- Higher latency (minimum 1-second poll interval vs instant)
- Increased server load (repeated query executions)
- Race conditions (poll during invoice processing → see partial state)

**Why not manual WebSockets**:
- Convex abstracts connection management (reconnects, auth, multiplexing)
- More code to maintain

**Implementation Details**:
```typescript
// Frontend component
const priceHistory = useQuery(api.vendorPriceHistory.list, {
  vendorId: vendor.id,
  includeArchived: false // Exclude >2 years old
});

// Convex automatically:
// 1. Establishes WebSocket connection
// 2. Subscribes component to vendorPriceHistory changes
// 3. Pushes updates when new records inserted
// 4. Re-renders component with fresh data
```

**Performance Considerations**:
- **Query optimization**: Index on `{ vendorId, archived: false, invoiceDate desc }` ensures fast queries
- **Subscription limits**: Convex supports 1000s of concurrent subscriptions per app
- **Bandwidth**: Each price record ~500 bytes; 100 new records/minute = 50 KB/minute (negligible)

**Testing Strategy**:
- E2E test: Open dashboard → process invoice in background → verify UI updates without page refresh
- Load test: 100 concurrent users with real-time subscriptions → verify sub-second latency

---

## Decision 3: Cross-Vendor Item Grouping Storage

**Context**: Cross-vendor price comparison requires linking equivalent items from different vendors (e.g., "M8 BOLT" from Vendor A and "BOLT-M8-SS" from Vendor B). Many-to-many relationship: one group → many price records; one price record → optionally one group.

**Decision**: Create separate **`cross_vendor_item_groups`** table with `itemReferences` array field

**Rationale**:
- **Clear ownership**: Groups are first-class entities with lifecycle (created, updated, deleted)
- **Many-to-many support**: `itemReferences: [{ vendorId, itemIdentifier }, ...]` stores all members
- **Query efficiency**: Single query to get group → fetch all member price records
- **Audit trail**: `matchSource` field tracks if AI-suggested, user-confirmed, or user-created

**Schema**:
```typescript
cross_vendor_item_groups: defineTable({
  groupId: v.id("cross_vendor_item_groups"),
  groupName: v.string(), // User-defined or auto-generated
  itemReferences: v.array(v.object({
    vendorId: v.id("vendors"),
    itemIdentifier: v.string(), // Item code or description
  })),
  matchSource: v.union(
    v.literal("ai-suggested"),
    v.literal("user-confirmed"),
    v.literal("user-created")
  ),
  createdTimestamp: v.number(),
  lastUpdatedTimestamp: v.number(),
  businessId: v.id("businesses"), // Multi-tenant isolation
})
.index("by_business_id", ["businessId"])
```

**Linking to price history**:
```typescript
vendor_price_history: defineTable({
  // ... existing fields ...
  itemGroupId: v.optional(v.id("cross_vendor_item_groups")), // Optional link
})
.index("by_item_group", ["itemGroupId"])
```

**Why not embedded in price history**:
- Would require duplicating group data in every price record
- No single source of truth for group metadata (name, match source)
- Updates to group (e.g., adding new vendor) require updating all related price records

**Why not separate junction table**:
- Convex doesn't support SQL-style joins
- Array field in Convex is efficient for small groups (<100 items per group)
- Simpler query pattern: fetch group → get itemReferences → fetch price records

**Implementation Details**:
- **AI suggestion workflow**: DSPy identifies potential matches → create group with `matchSource: "ai-suggested"` → user confirms → update to `matchSource: "user-confirmed"` + link price records
- **User rejection workflow**: User rejects AI suggestion → delete group, never suggest again (store in rejection log)
- **Cross-vendor comparison query**: Fetch group → extract itemReferences → query `vendor_price_history` for each reference → aggregate by vendor → display in comparison table

**Testing Strategy**:
- Unit test: Create group with 3 vendors → verify all price records linkable
- Integration test: AI suggests group → user confirms → verify price records linked → verify shows in comparison view
- Edge case test: User manually creates group (no AI suggestion) → verify works same as confirmed group

---

## Decision 4: Price History Archival Strategy

**Context**: 2-year retention policy requires excluding old data from active queries while preserving for audit. Need efficient way to mark records as archived without moving to separate table.

**Decision**: Use **soft delete with `archivedFlag` + Convex scheduled function**

**Rationale**:
- **Single source of truth**: All price history in one table (`vendor_price_history`)
- **Query efficiency**: Index on `{ archived: false, vendorId }` allows fast filtering
- **Audit trail preserved**: Archived records remain queryable with `includeArchived: true` parameter
- **Automated cleanup**: Convex cron runs nightly to mark records >2 years old as archived

**Schema**:
```typescript
vendor_price_history: defineTable({
  // ... existing fields ...
  archivedFlag: v.boolean(), // Default false
  archivedTimestamp: v.optional(v.number()), // When archived
})
.index("by_archived_status", ["businessId", "archivedFlag", "invoiceDate"])
```

**Archival Cron**:
```typescript
// convex/crons/archiveOldPriceHistory.ts
export default internalMutation({
  handler: async (ctx) => {
    const twoYearsAgo = Date.now() - (2 * 365 * 24 * 60 * 60 * 1000);

    const oldRecords = await ctx.db
      .query("vendor_price_history")
      .withIndex("by_archived_status", (q) =>
        q.eq("archivedFlag", false)
      )
      .filter((q) => q.lt(q.field("invoiceDate"), twoYearsAgo))
      .collect();

    for (const record of oldRecords) {
      await ctx.db.patch(record._id, {
        archivedFlag: true,
        archivedTimestamp: Date.now(),
      });
    }

    return { archivedCount: oldRecords.length };
  },
});

// Schedule: Daily at 2 AM UTC
export const archiveOldPriceHistoryCron = cronJobs.daily(
  "archive old price history",
  { hourUTC: 2, minuteUTC: 0 },
  internal.crons.archiveOldPriceHistory
);
```

**Why not separate `vendor_price_history_archive` table**:
- Complicates audit queries (must query both tables)
- No Convex cross-table transactions (move is multi-step, can fail mid-way)
- Duplicate schema definition

**Why not delete after 2 years**:
- Compliance/audit requirements may need historical data
- User explicitly requests "archived data exports" (spec: Edge Cases)
- Irreversible operation (can't un-delete if policy changes)

**Query Patterns**:
```typescript
// Active price tracking (default)
const priceHistory = await ctx.db
  .query("vendor_price_history")
  .withIndex("by_archived_status", (q) =>
    q.eq("businessId", businessId).eq("archivedFlag", false)
  )
  .collect();

// Audit query (include archived)
const allHistory = await ctx.db
  .query("vendor_price_history")
  .withIndex("by_business_id", (q) => q.eq("businessId", businessId))
  .collect(); // No filter on archivedFlag
```

**Performance Impact**:
- **Storage growth**: Archived records stay in DB. Estimate: 1M records/year → 2M active + 10M archived after 5 years. Convex handles this scale.
- **Query performance**: Index on `archivedFlag` ensures fast filtering. Archived records excluded from index scan.
- **Write performance**: Nightly cron updates ~1M records/year = ~2700 records/day. Convex batch writes handle this easily.

**Testing Strategy**:
- Unit test: Create record with `invoiceDate` >2 years ago → run cron → verify `archivedFlag` = true
- Integration test: Archived record excluded from default queries, included when `includeArchived: true`
- Performance test: Query with 10M archived + 1M active records → verify <2 second response time

---

## Decision 5: Anomaly Detection Tier 2 (DSPy)

**Context**: Spec defines fixed thresholds (>10% per-invoice, >20% trailing 6-month). But optimal thresholds may vary by business/industry (e.g., construction materials have higher volatility than office supplies). Need self-improving system that learns optimal thresholds from user dismissals.

**Decision**: Use **fixed thresholds for Tier 1 + DSPy MIPROv2 for adaptive threshold tuning**

**Rationale**:
- **Tier 1 (Fast path)**: Fixed thresholds (>10%, >20%) catch obvious anomalies instantly. No AI cost.
- **Tier 2 (Learning path)**: DSPy MIPROv2 learns from dismissals. If user dismisses many "10% increase" alerts (false positives), MIPROv2 suggests increasing threshold to 15% for that business. Weekly optimization cycle.
- **Why hybrid approach**: Pure DSPy would be slow + expensive for every invoice. Pure fixed thresholds can't adapt to business-specific volatility. Hybrid gets best of both.

**Architecture**:
```typescript
// Phase 1: Tier 1 Detection (rule-based, runs on every invoice)
async function tier1AnomalyDetection(priceRecord) {
  const lastPrice = await getLastPriceForItem(priceRecord.itemIdentifier);
  const sixMonthAvg = await getSixMonthAverage(priceRecord.itemIdentifier);

  const perInvoiceIncrease = ((priceRecord.unitPrice - lastPrice) / lastPrice) * 100;
  const trailingIncrease = ((priceRecord.unitPrice - sixMonthAvg) / sixMonthAvg) * 100;

  if (perInvoiceIncrease > 10 || trailingIncrease > 20) {
    return { isAnomaly: true, tier: 1, perInvoiceIncrease, trailingIncrease };
  }
  return { isAnomaly: false };
}

// Phase 2: Tier 2 Tuning (DSPy MIPROv2, runs weekly)
async function tier2ThresholdOptimization() {
  // Collect training data: dismissed alerts (false positives)
  const dismissals = await getDismissedAlertsLastWeek();

  // DSPy MIPROv2 learns: "For this business, 10% increase in 'Office Supplies' category = often dismissed → suggest threshold 15%"
  const optimizedThresholds = await dspy.optimize({
    trainingData: dismissals.map(d => ({
      category: d.vendorCategory,
      percentageIncrease: d.percentageChange,
      userDismissed: true, // Label: false positive
    })),
    metric: "minimize false positive rate while maintaining recall",
  });

  // Store optimized thresholds per business/category
  await saveOptimizedThresholds(optimizedThresholds);
}
```

**DSPy Signature**:
```python
class AnomalyThresholdOptimizer(dspy.Signature):
    """Learn optimal price anomaly thresholds from user feedback"""

    vendor_category = dspy.InputField(desc="Vendor category (e.g., Office Supplies, Construction Materials)")
    historical_dismissals = dspy.InputField(desc="List of {percentageIncrease, userDismissed} from last 30 days")
    current_threshold = dspy.InputField(desc="Current threshold (e.g., 10%)")

    recommended_threshold = dspy.OutputField(desc="Optimized threshold (percentage)")
    confidence = dspy.OutputField(desc="Confidence in recommendation (0-100)")
    reasoning = dspy.OutputField(desc="Why this threshold is better")
```

**Why not per-business config**:
- User burden: Finance managers don't want to manually tune thresholds
- No learning: Static config doesn't improve over time

**Why not pure DSPy (no fixed thresholds)**:
- Latency: DSPy calls take ~1-3 seconds; Tier 1 rules take <10ms
- Cost: Gemini API cost per invoice; Tier 1 is free
- Cold start: New businesses have no training data; need sensible defaults

**Training Data Collection**:
- **Positive examples** (true anomalies): User doesn't dismiss alert, or user takes recommended action
- **Negative examples** (false positives): User dismisses alert with "Not an Issue" feedback
- **Minimum data**: Require ≥50 dismissals before first optimization (bootstrap period)

**Optimization Schedule**:
- Weekly cron on Sunday 2 AM UTC
- Only run if ≥20 new dismissals since last optimization (enough signal)
- Store optimization results in `businesses.vendorIntelligenceSettings.optimizedThresholds`

**Fallback Strategy**:
- If DSPy optimization fails (e.g., API timeout), keep current thresholds
- If confidence <70%, ignore recommendation (not enough signal)
- Always keep minimum threshold at 5% (never go below, prevents alert fatigue)

**Metrics to Track**:
- **False positive rate**: % of alerts dismissed by users (target: <20%)
- **True positive rate**: % of alerts that led to action (target: >60%)
- **Threshold drift**: How much thresholds change over time (should stabilize after 3-6 months)

**Testing Strategy**:
- Unit test: Simulate dismissals with known patterns → verify MIPROv2 suggests correct threshold adjustment
- Integration test: Create 100 alerts → dismiss 50 → run optimization → verify thresholds updated → verify fewer false positives next week
- A/B test: 50% of businesses use adaptive thresholds, 50% use fixed → compare false positive rates after 30 days

---

## Decision 6: Chart Library for Price Trend Visualization

**Context**: P3 (Price Intelligence Dashboard) requires line charts showing unit price over time, with labeled data points and responsive design.

**Decision**: Use **Recharts** (npm: recharts@^2.14.1)

**Rationale**:
- **Next.js 15 compatibility**: Works with React 19.1.2 + Next.js 15.5.7 (tested in community)
- **Declarative API**: `<LineChart><Line dataKey="unitPrice" /></LineChart>` is intuitive
- **Responsive by default**: `ResponsiveContainer` handles viewport changes
- **Customizable**: Easy to add tooltips, labeled data points, axis formatting
- **Bundle size**: ~130 KB gzipped (acceptable for feature)
- **Active maintenance**: 30K+ GitHub stars, regular releases

**Example Usage**:
```typescript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

function PriceHistoryChart({ data }: { data: PriceHistoryRecord[] }) {
  const chartData = data.map(record => ({
    date: formatBusinessDate(record.invoiceDate),
    price: record.unitPrice,
    vendor: record.vendorName,
  }));

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis />
        <Tooltip formatter={(value) => formatCurrency(value, 'MYR')} />
        <Legend />
        <Line type="monotone" dataKey="price" stroke="hsl(var(--primary))" />
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**Why not D3.js**:
- **Complexity**: Imperative API requires manual DOM manipulation, SVG path calculations
- **Bundle size**: ~200 KB+ for full library
- **React integration**: Need custom hooks to manage D3 lifecycle with React re-renders
- **Learning curve**: Steeper for team unfamiliar with D3

**Why not Victory**:
- **Smaller community**: ~10K GitHub stars vs Recharts 30K
- **Less documentation**: Fewer Stack Overflow answers, blog posts
- **Bundle size**: Similar to Recharts (~120 KB)
- **No clear advantage**: Recharts is more battle-tested in Next.js ecosystem

**Why not Chart.js**:
- **Imperative API**: Requires Canvas element ref, manual chart instantiation
- **React wrapper (react-chartjs-2)**: Extra dependency layer
- **Less declarative**: More boilerplate than Recharts for same result

**Customization Requirements**:
- **Tooltip formatting**: Use `formatCurrency()` helper from `@/lib/utils/format-number`
- **Theme integration**: Use semantic tokens (`hsl(var(--primary))` for line color)
- **Labeled data points**: Recharts `<LabelList>` component for inline price labels
- **Responsive breakpoints**: Adjust chart height on mobile (300px) vs desktop (400px)

**Performance Considerations**:
- **Data points limit**: Display max 100 data points per chart (2 years daily = 730 points, aggregate to weekly for performance)
- **Render optimization**: Use `useMemo()` to prevent re-creating chartData on every render
- **Animation**: Disable animations on mobile for better performance

**Testing Strategy**:
- Visual regression test: Snapshot test for chart rendering with known data
- Interaction test: Verify tooltip shows on hover with correct formatted price
- Responsive test: Verify chart adjusts to viewport changes (desktop → mobile)

---

## Decision 7: CSV Export Implementation

**Context**: P3 requires exporting price history to CSV for contract negotiation prep. Spec: "Users can export full price history for contract negotiation prep in under 10 seconds".

**Decision**: Use **papaparse** (already in project for csv-parser) for client-side CSV generation

**Rationale**:
- **Already installed**: Project uses `papaparse` in `src/lib/csv-parser/` (zero new dependencies)
- **Client-side generation**: No server round-trip; instant download
- **Large data handling**: Can export 10,000 rows in <1 second
- **TypeScript support**: `@types/papaparse` provides type safety

**Implementation**:
```typescript
import Papa from 'papaparse';

async function exportPriceHistory(vendorId: string) {
  // Fetch data (including archived if needed)
  const priceHistory = await convex.query(api.vendorPriceHistory.list, {
    vendorId,
    includeArchived: false,
  });

  // Transform to CSV structure
  const csvData = priceHistory.map(record => ({
    'Vendor Name': record.vendorName,
    'Item Code': record.itemCode || 'N/A',
    'Item Description': record.itemDescription,
    'Invoice Date': formatBusinessDate(record.invoiceDate),
    'Unit Price': record.unitPrice.toFixed(2),
    'Quantity': record.quantity,
    'Total Amount': (record.unitPrice * record.quantity).toFixed(2),
    'Currency': record.currency,
    'Observation Count': record.observationCount,
  }));

  // Generate CSV
  const csv = Papa.unparse(csvData);

  // Trigger download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `price-history-${vendorId}-${Date.now()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
```

**Why not server-side generation**:
- **Latency**: Client → server → generate → download = 2 round-trips
- **Scalability**: Server CPU/memory usage for large exports
- **Caching complexity**: Need to cache generated CSVs, handle invalidation

**Why not native `JSON.stringify()` + manual CSV formatting**:
- **Edge cases**: Commas in values, newlines in descriptions, quote escaping
- **Papaparse handles this**: Proper RFC 4180 CSV compliance

**Performance Optimization**:
- **Pagination**: If >10,000 rows, warn user and offer to export in chunks (or limit to last 2 years only)
- **Streaming**: For very large exports, use papaparse streaming mode (but likely unnecessary given 2-year limit)
- **Progress indicator**: Show loading state while fetching data from Convex

**Filename Convention**:
`price-history-{vendorName}-{YYYY-MM-DD}.csv`
- Example: `price-history-B&B-CEMERLANG-ELEKTRIK-2026-03-16.csv`
- Sanitize vendor name (remove special chars, replace spaces with hyphens)

**Testing Strategy**:
- Unit test: Generate CSV from mock data → verify headers, row count, value formatting
- Integration test: Export with 5000 records → verify file downloads, opens in Excel without errors
- Performance test: Export 10,000 records → verify completes <10 seconds (spec requirement)

---

## Summary of Technical Decisions

| Decision Area | Choice | Key Rationale |
|---------------|--------|---------------|
| **Fuzzy Matching** | DSPy BootstrapFewShot + MIPROv2 | Self-improving from user corrections, 80% confidence calibration |
| **Real-Time Updates** | Convex subscriptions via `useQuery()` | Zero-code WebSocket management, instant UI updates |
| **Cross-Vendor Grouping** | Separate `cross_vendor_item_groups` table | Many-to-many support, clear ownership, audit trail |
| **Data Archival** | Soft delete with `archivedFlag` | Single source of truth, audit-accessible, automated cleanup |
| **Anomaly Detection** | Hybrid Tier 1 (fixed) + Tier 2 (DSPy MIPROv2) | Fast + cheap for common cases, adaptive for business-specific volatility |
| **Chart Library** | Recharts 2.14.1 | Declarative API, Next.js 15 compatible, responsive by default |
| **CSV Export** | papaparse (client-side) | Already installed, sub-10-second exports, no server load |

## Implementation Readiness

✅ All "NEEDS CLARIFICATION" items resolved
✅ Technology choices documented with rationales
✅ Performance considerations addressed
✅ Testing strategies defined
✅ Ready to proceed to Phase 1: Design & Contracts

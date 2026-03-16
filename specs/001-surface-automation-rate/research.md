# Research Findings: Surface Automation Rate Metric

**Feature**: 001-surface-automation-rate
**Date**: 2026-03-16
**Purpose**: Resolve all technical unknowns identified in implementation plan

---

## 1. Data Source Inventory

### Decision: Expense OCR Edit Tracking

**Research Finding**: The `expense_claims` table does not have an explicit `wasEdited` boolean flag. However, several fields suggest edit tracking:
- `version` field (optimistic locking, incremented on updates)
- `confidenceScore` (if OCR is used, this field exists)
- `processingMetadata` (JSONB with potential edit history)

**Chosen Approach**: **Track edits via version field**
- If `version > 1` AND claim has OCR data (confidenceScore exists), consider it edited
- This is conservative: any update after initial OCR extraction counts as "needing review"
- Aligns with spec clarification #3: "any edit counts as full correction"

**Rationale**:
- Simplest implementation without schema changes
- Conservative approach (over-counts edits rather than under-counts)
- Maintains immutable historical rates (version is set at claim creation/update time)

**Alternatives Considered**:
- **Option A**: Add `ocrWasEdited` boolean - Requires schema change, more precise tracking
- **Option B**: Compare OCR extraction in `processingMetadata` with final values - Complex, prone to false positives
- **Option C**: Use audit trail/changelog - Not found in current schema

---

## 2. Fee Breakdown Classification Tracking

### Decision: Fee Classification via sales_orders.classifiedFees

**Research Finding**: Fee classification is tracked in the `sales_orders` table (from aiDigest.ts analysis):
```typescript
const fees = order.classifiedFees ?? [];
feeClassified += fees.filter((f) => f.tier === 2).length;
```

**Structure**:
- `classifiedFees` is an array on `sales_orders`
- Each fee has a `tier` field (1 = rule-based, 2 = AI classified)
- Corrections are NOT tracked in a separate table (no `fee_classification_corrections` found)

**Chosen Approach**: **Count tier 2 classifications as AI decisions, assume zero corrections**
- Total AI decisions: `count(classifiedFees where tier === 2)`
- Decisions requiring review: 0 (no correction mechanism exists yet)
- Future: When fee correction UI is built, add `fee_classification_corrections` table

**Rationale**:
- Existing implementation already distinguishes Tier 1 vs Tier 2
- No correction tracking means 100% automation rate for fees (optimistic but accurate given no user correction capability)
- Aligns with current system capabilities

**Alternatives Considered**:
- **Option A**: Search for separate correction table - Not found
- **Option B**: Infer corrections from fee updates - No reliable timestamp/audit trail

---

## 3. DSPy Model Optimization Events

### Decision: Use dspy_model_versions.trainedAt for annotations

**Research Finding**: The `dspy_model_versions` table structure:
```typescript
dspy_model_versions: {
  platform: string;        // e.g., "ar_matching", "bank_recon"
  version: number;
  domain: string;          // "fee_classification" | "bank_recon"
  trainedAt: number;       // Unix timestamp (ms)
  optimizerType: string;   // "bootstrap_fewshot" | "miprov2"
  status: string;          // "active" | "inactive" | "failed"
}
```

**Chosen Approach**: **Query active models by trainedAt within trend window**
- For each week in trend chart, find all `dspy_model_versions` where:
  - `status === "active"`
  - `trainedAt` falls within that week
  - Any `domain` (ar, bank, fee)
- Display "Model optimized" annotation on chart

**Rationale**:
- `trainedAt` is the definitive timestamp for optimization events
- Multiple models can be optimized in same week (show count)
- `status === "active"` filters out failed attempts

**Alternatives Considered**:
- **Option A**: Use `dspy_optimization_logs` table - More granular but includes failed attempts
- **Option B**: Track optimization separately - Unnecessary duplication

---

## 4. Chart Library Integration

### Decision: Use existing Recharts 3.1.2

**Research Finding**: `package.json` already includes:
```json
"recharts": "^3.1.2"
```

**Chosen Approach**: **No installation needed, use Recharts LineChart**
- Component: `<LineChart>` with `<Line>`, `<XAxis>`, `<YAxis>`, `<Tooltip>`, `<ReferenceLine>`
- ReferenceLine for "Model optimized" annotations
- Responsive design with `<ResponsiveContainer>`

**Best Practices**:
- Use `<ReferenceLine>` for optimization markers (vertical line at date)
- Custom tooltip to show rate + decision count
- `syncId` if multiple charts on same page
- Memoize data processing for performance

**Performance**: Rendering 52 weeks of data points (max) is well within Recharts performance limits (<100 data points).

**Alternatives Considered**:
- **Option A**: Chart.js - Not installed, would require new dependency
- **Option B**: Victory Charts - Not installed, more complex API

---

## 5. Analytics Dashboard Layout

### Decision: Integrate into existing complete-dashboard.tsx

**Research Finding**: Analytics dashboard structure:
```
src/domains/analytics/components/
├── complete-dashboard.tsx           # Main dashboard container
├── AgedPayablesWidget.tsx           # Existing widget
├── AgedReceivablesWidget.tsx        # Existing widget
├── unified-financial-dashboard.tsx  # Alternative layout
└── financial-analytics/             # Subdirectory with more widgets
```

**Chosen Approach**: **Create new AutomationRateWidget.tsx, add to complete-dashboard.tsx**
- Pattern follows existing `AgedPayablesWidget` structure
- Hero metric displays prominently at top of dashboard
- Grid layout: Place automation rate widget in top-left position

**Layout Integration**:
```tsx
// In complete-dashboard.tsx
<div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
  <AutomationRateHero businessId={businessId} period={period} />
  <AgedReceivablesWidget businessId={businessId} />
  <AgedPayablesWidget businessId={businessId} />
  {/* Other widgets */}
</div>
```

**Rationale**:
- Follows established widget pattern
- No layout disruption (grid is responsive)
- Hero metric gets prominent positioning

**Alternatives Considered**:
- **Option A**: Create separate automation-rate-dashboard.tsx - Over-engineering, not needed
- **Option B**: Add to unified-financial-dashboard.tsx - Unclear if this is actively used

---

## 6. Action Center UI Structure

### Decision: Extend ProactiveActionCenter.tsx with automation summary

**Research Finding**: Action Center structure:
```
src/domains/analytics/components/action-center/
├── ProactiveActionCenter.tsx  # Main component (10,983 bytes)
├── InsightCard.tsx             # Individual insight cards
└── index.ts                    # Barrel export
```

**Chosen Approach**: **Add automation summary as a prominent stat at top of ProactiveActionCenter**
- Location: Above existing insight cards
- Format: "Today: **47 documents** processed, **2 needed your attention**"
- Styling: Large text, semantic colors (success if high rate, warning if low)

**Component Pattern**:
```tsx
// In ProactiveActionCenter.tsx
<div className="mb-6">
  <AutomationSummaryCard businessId={businessId} />
</div>
<div className="grid gap-4">
  {/* Existing InsightCard components */}
</div>
```

**Rationale**:
- Visible without scrolling
- Complements existing insights
- Simple text-based display (no chart needed)

**Alternatives Considered**:
- **Option A**: Create separate action-center-summary.tsx file - Adds file complexity for simple text display
- **Option B**: Add to each InsightCard - Not the right semantic location

---

## 7. Business Settings AI Section

### Decision: Extend tabbed-business-settings.tsx with AI tab

**Research Finding**: Settings structure:
```
src/domains/account-management/components/
├── tabbed-business-settings.tsx         # Main tabbed interface
├── business-settings-section.tsx        # Individual sections
└── business-profile-settings.tsx        # Profile tab content
```

**Chosen Approach**: **Add "AI & Automation" tab to tabbed-business-settings.tsx**
- Tab label: "AI & Automation"
- Content: Cumulative lifetime automation statistics
- Format:
  - "**15,234 documents** processed since [date]"
  - "**782 reviewed** (**94.9% automation rate**)"
  - "AI has saved approximately **XXX hours** of manual work"

**Component Pattern**:
```tsx
// New file: src/domains/account-management/components/ai-automation-settings.tsx
export function AIAutomationSettings({ businessId }: Props) {
  const stats = useQuery(api.automationRate.getLifetimeStats, { businessId });
  return (
    <div className="space-y-6">
      <h2>AI & Automation Performance</h2>
      <AutomationRateStats stats={stats} />
    </div>
  );
}

// In tabbed-business-settings.tsx
<Tabs>
  <TabsList>
    <TabsTrigger value="profile">Profile</TabsTrigger>
    <TabsTrigger value="ai">AI & Automation</TabsTrigger>
    {/* Other tabs */}
  </TabsList>
  <TabsContent value="ai">
    <AIAutomationSettings businessId={businessId} />
  </TabsContent>
</Tabs>
```

**Rationale**:
- Separates AI metrics from business profile
- Follows existing tabbed pattern
- Room for future AI settings (confidence thresholds, notification prefs)

**Alternatives Considered**:
- **Option A**: Add to existing profile tab - Clutters profile with unrelated info
- **Option B**: Create separate settings page - Over-engineering

---

## 8. Milestone Notification System

### Decision: Server-triggered toasts via Convex cron + client subscription

**Research Finding**: Notification system uses Sonner (already imported in layout):
```typescript
// Toast notifications use Sonner
import { toast } from "sonner";
```

**Chosen Approach**: **Hybrid notification system**

**Server Side** (Convex cron - daily at 6 PM local):
1. Cron checks current automation rate for each business
2. Compares against stored milestones in `businesses.automationMilestones`
3. If new threshold crossed, creates notification record
4. Sends email via AI Intelligence Digest integration

**Client Side** (React subscription):
1. Component subscribes to `businesses` table changes
2. When `automationMilestones` object updates, trigger toast
3. Toast displays: "🎉 Your AI automation rate just hit 90%!"

**Milestone Storage** (extend businesses table):
```typescript
// In businesses table
automationMilestones: v.optional(v.object({
  "90": v.optional(v.number()),  // timestamp when achieved
  "95": v.optional(v.number()),
  "99": v.optional(v.number()),
}))
```

**Rationale**:
- Cron ensures reliable check (even if user offline)
- Client subscription gives instant visual feedback
- Persistent storage prevents duplicate notifications
- No new table needed (extend businesses)

**Alternatives Considered**:
- **Option A**: Client-only check - Miss notifications if user not logged in
- **Option B**: Separate `automation_milestones` table - Over-engineering for 3 thresholds per business
- **Option C**: Real-time check on every query - Performance overhead

---

## 9. Email Digest Integration

### Decision: Extend aiDigest.ts gatherAIActivity function

**Research Finding**: Email digest structure:
```typescript
// convex/functions/aiDigest.ts
interface NormalizedActivity {
  totalAiActions: number;
  autonomyRate: number;  // Already exists!
  // ... other fields
}
```

**Chosen Approach**: **Add milestoneAchievements field to activity object**

**Implementation**:
```typescript
// In gatherAIActivity function
const milestoneAchievements: Array<{ threshold: number; timestamp: number }> = [];

// Check if any milestones were achieved in last 24 hours
const business = await ctx.db.get(businessId);
if (business.automationMilestones) {
  const yesterday = Date.now() - 24 * 60 * 60 * 1000;
  Object.entries(business.automationMilestones).forEach(([threshold, timestamp]) => {
    if (timestamp && timestamp > yesterday) {
      milestoneAchievements.push({ threshold: Number(threshold), timestamp });
    }
  });
}

return {
  // ... existing fields
  milestoneAchievements,
};
```

**Email Template Addition** (in generateEmailHtml):
```html
${activity.milestoneAchievements.length > 0 ? `
  <div style="background: #10b981; padding: 20px; border-radius: 8px; margin-bottom: 24px;">
    <h2 style="color: white; margin: 0 0 12px;">🎉 Milestone Achievement!</h2>
    ${activity.milestoneAchievements.map(m => `
      <p style="color: white; margin: 4px 0;">
        Your AI automation rate hit ${m.threshold}%!
      </p>
    `).join('')}
  </div>
` : ''}
```

**Rationale**:
- Minimal changes to existing email structure
- Celebrates achievements prominently
- Leverages existing SES delivery infrastructure
- Only shows in digest if achieved in last 24 hours

**Alternatives Considered**:
- **Option A**: Separate milestone email - Too many emails, digest is better
- **Option B**: Weekly milestone summary - Less timely, reduces excitement

---

## 10. Performance Optimization

### Decision: Compute on-demand with indexed queries, no caching

**Research Finding**: Convex query performance depends on indexes:
- `bank_recon_corrections`: indexed by `["businessId", "createdAt"]`
- `order_matching_corrections`: indexed by `["businessId", "createdAt"]`
- Both support efficient date range queries

**Chosen Approach**: **Compute on-demand using indexed queries**

**Query Strategy**:
1. Use date range filters on `createdAt` indexes
2. Aggregate results in memory (100-1000 records per week is manageable)
3. Cache results client-side with React Query (staleTime: 5 minutes)

**Estimated Performance**:
- Query all corrections for one week: ~100-200 records × 4 tables = 400-800 records
- Convex query with index: <100ms
- Client-side aggregation: <10ms
- Total round-trip: <200ms (well under 2-second target)

**Index Requirements** (all already exist):
```typescript
.index("by_businessId_createdAt", ["businessId", "createdAt"])  ✅
```

**Rationale**:
- No new tables or materialized views needed
- Existing indexes support efficient queries
- React Query handles client-side caching
- On-demand computation ensures fresh data
- Immutable historical data (no need to recompute past periods)

**Alternatives Considered**:
- **Option A**: Pre-aggregate weekly stats in cron - Adds complexity, not needed for <1000 records
- **Option B**: Materialized view table - Over-engineering, Convex queries are fast enough
- **Option C**: Cache in Convex - Client-side React Query caching is sufficient

---

## Convex Aggregation Patterns (Best Practices)

**Pattern**: Multi-source aggregation with parallel queries

```typescript
// Convex query pattern
export const getAutomationRate = query({
  args: { businessId: v.id("businesses"), startDate: v.string(), endDate: v.string() },
  handler: async (ctx, args) => {
    const start = new Date(args.startDate).getTime();
    const end = new Date(args.endDate).getTime();

    // Parallel queries (Convex batches these automatically)
    const [arCorrections, bankCorrections, arOrders] = await Promise.all([
      ctx.db
        .query("order_matching_corrections")
        .withIndex("by_businessId_createdAt", (q) =>
          q.eq("businessId", args.businessId)
           .gte("createdAt", start)
           .lte("createdAt", end)
        )
        .collect(),

      ctx.db
        .query("bank_recon_corrections")
        .withIndex("by_businessId_createdAt", (q) =>
          q.eq("businessId", args.businessId)
           .gte("createdAt", start)
           .lte("createdAt", end)
        )
        .collect(),

      ctx.db
        .query("sales_orders")
        .withIndex("by_businessId_createdAt", (q) =>
          q.eq("businessId", args.businessId)
           .gte("createdAt", start)
           .lte("createdAt", end)
        )
        .collect(),
    ]);

    // Aggregate in memory
    const totalArDecisions = arOrders.filter(o => o.aiMatchStatus).length;
    const totalArCorrections = arCorrections.length;
    // ... similar for other sources

    const totalDecisions = totalArDecisions + totalBankDecisions + totalFeeDecisions + totalExpenseDecisions;
    const decisionsReviewed = totalArCorrections + totalBankCorrections + totalFeeCorrections + totalExpenseCorrections;
    const rate = totalDecisions > 0 ? ((totalDecisions - decisionsReviewed) / totalDecisions) * 100 : 0;

    return { rate, totalDecisions, decisionsReviewed };
  },
});
```

**Key Practices**:
1. Use `Promise.all()` for parallel queries
2. Filter by indexed fields first (businessId, createdAt)
3. Aggregate in memory after fetching (Convex queries return fast)
4. Return minimal data shape to client

---

## Immutable Historical Data Pattern

**Pattern**: Store calculation timestamp, never recalculate past periods

**Approach**:
- When querying historical weeks, use `createdAt` range filter
- Do NOT query corrections outside the week's date range
- This ensures historical rates reflect "what was known at that time"

**Example**:
```typescript
// Week of March 1-7, 2026
// Only count corrections created between March 1-7
// Corrections made on March 15 about March 5 decisions DON'T affect the March 1-7 rate
```

**Implementation**:
```typescript
// Historical week query
const weekStart = new Date("2026-03-01").getTime();
const weekEnd = new Date("2026-03-07").getTime();

// Corrections within this week only
const corrections = await ctx.db
  .query("order_matching_corrections")
  .withIndex("by_businessId_createdAt", (q) =>
    q.eq("businessId", businessId)
     .gte("createdAt", weekStart)
     .lte("createdAt", weekEnd)  // ← Immutability boundary
  )
  .collect();
```

**Rationale**: Aligns with spec clarification #2 (no retroactive recalculation).

---

## Milestone Tracking State Pattern

**Pattern**: Extend businesses table with nested milestone object

**Chosen Structure**:
```typescript
// In businesses table
automationMilestones: v.optional(v.object({
  "90": v.optional(v.number()),  // Unix timestamp (ms) when 90% first achieved
  "95": v.optional(v.number()),  // Unix timestamp (ms) when 95% first achieved
  "99": v.optional(v.number()),  // Unix timestamp (ms) when 99% first achieved
}))
```

**Update Pattern**:
```typescript
// In milestone check cron
const business = await ctx.db.get(businessId);
const currentMilestones = business.automationMilestones ?? {};
const rate = await calculateAutomationRate(ctx, businessId, "week");

// Check each threshold
const thresholds = [90, 95, 99];
for (const threshold of thresholds) {
  if (rate >= threshold && !currentMilestones[threshold.toString()]) {
    // First time crossing this threshold!
    await ctx.db.patch(businessId, {
      automationMilestones: {
        ...currentMilestones,
        [threshold.toString()]: Date.now(),
      },
    });
    // Trigger notification
    await sendMilestoneNotification(ctx, businessId, threshold, rate);
  }
}
```

**Rationale**:
- Simple nested object (no new table)
- Timestamps provide audit trail
- Once set, never cleared (aligns with spec FR-018: no duplicate notifications)
- Indexed via businessId parent table

**Alternatives Considered**:
- **Option A**: Separate `automation_milestones` table - Over-engineering for 3 fields per business
- **Option B**: Array of milestone objects - More complex to query "already achieved" status
- **Option C**: Boolean flags only - Loses timestamp information

---

## Summary

All 10 research tasks resolved. Key decisions:

1. **Expense edits**: Track via version field (version > 1 with OCR data)
2. **Fee classification**: Use sales_orders.classifiedFees tier 2, no corrections yet
3. **Optimization events**: Query dspy_model_versions.trainedAt for annotations
4. **Chart library**: Use existing Recharts 3.1.2
5. **Dashboard layout**: Add AutomationRateHero to complete-dashboard.tsx grid
6. **Action Center**: Extend ProactiveActionCenter with summary card
7. **Settings**: Add "AI & Automation" tab to tabbed-business-settings.tsx
8. **Notifications**: Hybrid cron + client subscription with Sonner toasts
9. **Email digest**: Extend aiDigest with milestoneAchievements field
10. **Performance**: On-demand queries with indexed date ranges, React Query caching

**No schema changes required** except:
- Add `automationMilestones` optional field to `businesses` table

**Ready for Phase 1**: Design (data model, contracts, quickstart)

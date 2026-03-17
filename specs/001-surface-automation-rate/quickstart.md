# Quickstart Guide: Automation Rate Metric

**Feature**: 001-surface-automation-rate
**Date**: 2026-03-16
**For**: Developers implementing and testing the automation rate feature

---

## Setup

### 1. Prerequisites

Ensure you have:
- Node.js 20.x installed
- Convex CLI authenticated (`npx convex dev`)
- Access to `.env.local` with test account credentials
- Git author set to `grootdev-ai` (see CLAUDE.md)

### 2. Install Dependencies

Dependencies already installed:
```bash
# Recharts (chart library) - already in package.json v3.1.2
# Sonner (toast notifications) - already in package.json
# No new dependencies needed!
```

### 3. Branch Checkout

```bash
git checkout 001-surface-automation-rate
npm install  # Ensure dependencies are up-to-date
```

---

## Development Workflow

### Phase 1: Convex Backend (Queries & Aggregation)

#### Step 1.1: Add Schema Field

Edit `convex/schema.ts`:

```typescript
// In businesses table definition (around line 135)
businesses: defineTable({
  // ... existing fields

  // ADD THIS FIELD:
  automationMilestones: v.optional(v.object({
    "90": v.optional(v.number()),  // Unix timestamp (ms)
    "95": v.optional(v.number()),
    "99": v.optional(v.number()),
  })),

  // ... rest of schema
})
```

**Deploy schema**:
```bash
npx convex deploy --yes
```

#### Step 1.2: Create Convex Query File

Create `convex/functions/automationRate.ts`:

```typescript
import { v } from "convex/values";
import { query, internalMutation } from "../_generated/server";

// Implement queries following contracts/convex-queries.ts interfaces:
// - getAutomationRate
// - getAutomationRateTrend
// - getLifetimeStats
// - getMilestones
// - checkMilestones (internal mutation)
```

**Key Implementation Points**:
1. Use indexed queries: `withIndex("by_businessId_createdAt")`
2. Deduplicate corrections by unique keys (orderReference, bankTransactionDescription)
3. Aggregate from 4 sources in parallel with `Promise.all()`
4. Return structured results matching contract types

**Test in Convex Dashboard**:
```typescript
// Navigate to: https://dashboard.convex.dev/functions
// Call getAutomationRate with test businessId
{
  businessId: "jh75kw...", // Your test business ID
  period: "week"
}
```

#### Step 1.3: Create Milestone Cron

Edit `convex/crons.ts`:

```typescript
import { cronJobs } from "convex/server";

const crons = cronJobs();

// ADD THIS CRON:
crons.hourly(
  "check-automation-milestones",
  { hourUTC: 10 }, // 6 PM SGT (UTC+8) = 10 AM UTC
  internal.automationRate.checkAllBusinessMilestones
);

export default crons;
```

**Deploy cron**:
```bash
npx convex deploy --yes
```

---

### Phase 2: React Components (Frontend)

#### Step 2.1: Create Custom Hook

Create `src/domains/analytics/hooks/use-automation-rate.ts`:

```typescript
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function useAutomationRate(options: UseAutomationRateOptions) {
  const data = useQuery(
    api.automationRate.getAutomationRate,
    {
      businessId: options.businessId,
      period: options.period,
      startDate: options.startDate,
      endDate: options.endDate,
    }
  );

  return {
    rate: data?.rate,
    totalDecisions: data?.totalDecisions,
    decisionsReviewed: data?.decisionsReviewed,
    message: data?.message,
    hasMinimumData: data?.hasMinimumData,
    sources: data?.sources,
    isLoading: data === undefined,
    error: null, // Convex handles errors internally
    refetch: () => {}, // Not needed with Convex's reactive queries
  };
}

// Similar for useAutomationRateTrend...
```

#### Step 2.2: Create Hero Metric Component

Create `src/domains/analytics/components/automation-rate-hero.tsx`:

```typescript
'use client';

import { useAutomationRate } from '../hooks/use-automation-rate';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export function AutomationRateHero({ businessId }: AutomationRateHeroProps) {
  const [period, setPeriod] = useState<"today" | "week" | "month">("week");
  const { rate, totalDecisions, decisionsReviewed, message, isLoading } = useAutomationRate({
    businessId,
    period,
  });

  if (isLoading) return <Card>Loading...</Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Automation Rate</CardTitle>
        {/* Period selector */}
      </CardHeader>
      <CardContent>
        {message ? (
          <p className="text-muted-foreground">{message}</p>
        ) : (
          <>
            <div className="text-5xl font-bold text-primary">{rate?.toFixed(1)}%</div>
            <p className="text-sm text-muted-foreground mt-2">
              <strong>{totalDecisions}</strong> documents processed,
              <strong> {decisionsReviewed}</strong> needed review
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

#### Step 2.3: Create Trend Chart Component

Create `src/domains/analytics/components/automation-rate-trend-chart.tsx`:

```typescript
'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { useAutomationRateTrend } from '../hooks/use-automation-rate';

export function AutomationRateTrendChart({ businessId, weeks = 8 }: AutomationRateTrendChartProps) {
  const { trendData, isLoading } = useAutomationRateTrend({ businessId, weeks });

  if (isLoading) return <div>Loading trend...</div>;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={trendData}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="week" />
        <YAxis domain={[0, 100]} />
        <Tooltip
          content={({ active, payload }) => {
            if (active && payload?.[0]) {
              const data = payload[0].payload;
              return (
                <div className="bg-card border p-2 rounded">
                  <p className="font-semibold">{data.week}</p>
                  <p>Rate: {data.rate?.toFixed(1)}%</p>
                  <p className="text-sm text-muted-foreground">
                    {data.totalDecisions} decisions, {data.decisionsReviewed} reviewed
                  </p>
                </div>
              );
            }
            return null;
          }}
        />
        <Line
          type="monotone"
          dataKey="rate"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={{ fill: 'hsl(var(--primary))', r: 4 }}
        />
        {/* Add ReferenceLine for optimization events */}
        {trendData?.flatMap((week) =>
          week.optimizationEvents.map((event, idx) => (
            <ReferenceLine
              key={`${week.weekStart}-${idx}`}
              x={week.week}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="3 3"
              label="Model optimized"
            />
          ))
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
```

#### Step 2.4: Integrate into Dashboard

Edit `src/domains/analytics/components/complete-dashboard.tsx`:

```typescript
import { AutomationRateHero } from './automation-rate-hero';
import { AutomationRateTrendChart } from './automation-rate-trend-chart';

export function CompleteDashboard({ businessId }: Props) {
  return (
    <div className="space-y-6">
      {/* ADD AUTOMATION RATE SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <AutomationRateHero businessId={businessId} defaultPeriod="week" />
        {/* Other widgets */}
      </div>

      <AutomationRateTrendChart businessId={businessId} weeks={8} />

      {/* Existing dashboard content */}
    </div>
  );
}
```

---

### Phase 3: Testing

#### Test Data Setup

**Option A: Use Existing Test Accounts** (from `.env.local`):
```bash
# Test account credentials in .env.local:
TEST_USER_ADMIN=admin@example.com
TEST_USER_ADMIN_PW=<password>
```

**Option B: Create Test Data via Convex Dashboard**:

1. Navigate to `https://dashboard.convex.dev`
2. Go to "Data" tab → `sales_orders` table
3. Create test orders with AI matching:

```json
{
  "businessId": "jh75kw...",
  "aiMatchStatus": "matched",
  "aiMatchTier": 2,
  "createdAt": 1710115200000,
  "orderAmount": 1000,
  "orderReference": "ORD-001"
}
```

4. Create test corrections in `order_matching_corrections`:

```json
{
  "businessId": "jh75kw...",
  "orderReference": "ORD-001",
  "correctionType": "wrong_match",
  "createdAt": 1710115300000,
  "createdBy": "user123"
}
```

#### Test Scenarios

**1. Happy Path (96% Automation)**:
```bash
# Setup: 100 AI decisions, 4 corrections
# Expected: Hero shows "96.0%", "100 documents processed, 4 needed review"
```

**2. Zero Activity**:
```bash
# Setup: No AI decisions in period
# Expected: Message "No AI activity in this period"
```

**3. Insufficient Data (<10 decisions)**:
```bash
# Setup: 5 AI decisions
# Expected: Message "Collecting data..." with rate displayed but flagged
```

**4. Milestone Achievement (90%)**:
```bash
# Setup: Automation rate crosses 90% threshold
# Expected: Toast notification "🎉 Your AI automation rate just hit 90%!"
# Expected: businesses.automationMilestones["90"] timestamp set
```

**5. Historical Immutability**:
```bash
# Setup:
# - Week 1: 100 decisions, 4 corrections → 96% rate
# - Week 3: Add correction for Week 1 decision
# Expected: Week 1 rate still shows 96% (unchanged)
```

**6. Optimization Annotation**:
```bash
# Setup: Create dspy_model_versions entry with trainedAt in Week 2
# Expected: Trend chart shows "Model optimized" vertical line in Week 2
```

#### Manual Testing Checklist

- [ ] Hero metric displays correct rate for "Today"
- [ ] Hero metric displays correct rate for "This Week"
- [ ] Hero metric displays correct rate for "This Month"
- [ ] Trend chart renders 8 weeks of data
- [ ] Trend chart shows "Model optimized" annotations
- [ ] Tooltip on trend chart shows rate + decision count
- [ ] Action Center shows daily summary: "X docs, Y reviewed"
- [ ] Settings page shows lifetime stats
- [ ] Toast notification triggers at 90% milestone
- [ ] Toast notification triggers at 95% milestone
- [ ] Toast notification triggers at 99% milestone
- [ ] No duplicate milestone notifications
- [ ] "No AI activity" message appears when totalDecisions = 0
- [ ] "Collecting data..." message appears when totalDecisions < 10
- [ ] Multiple corrections for same document count as 1 (deduplication)
- [ ] Historical rates don't change when delayed correction added

---

## Testing with Real Data

### 1. Production-like Test

```bash
# Login as test admin
npm run dev

# Navigate to:
http://localhost:3000/en/analytics

# Expected to see:
# - Automation rate hero metric at top
# - Trend chart below
# - Real data from test business
```

### 2. Verify Convex Queries

```bash
# Open Convex dashboard logs
npx convex dev --once

# Watch query logs for:
# - getAutomationRate calls
# - Query performance (<100ms)
# - Correct data returned
```

### 3. Test Milestone Cron

```bash
# Manually trigger cron in Convex dashboard
# Go to Functions → checkAllBusinessMilestones → Run

# Expected:
# - Check all businesses
# - Update milestones for those crossing thresholds
# - Return { newlyAchieved: [...], alreadyAchieved: [...] }
```

---

## Performance Testing

### Query Performance Benchmarks

**Target**: All queries under 2 seconds (per SC-001)

```bash
# Test getAutomationRate with 1000 decisions
# Expected: <100ms

# Test getAutomationRateTrend with 52 weeks
# Expected: <800ms (8 parallel queries × 100ms)

# Test getLifetimeStats
# Expected: <200ms
```

### Load Testing

```bash
# Simulate 10 concurrent users viewing dashboard
# Use browser DevTools → Network tab
# Expected: All queries return within performance targets
```

---

## Debugging Tips

### Common Issues

**Issue**: Hero metric shows "undefined%"
- **Cause**: Convex query not returning data
- **Fix**: Check Convex dashboard logs for errors, verify businessId exists

**Issue**: Trend chart doesn't render
- **Cause**: trendData is undefined or empty
- **Fix**: Ensure business has historical AI decisions (check sales_orders table)

**Issue**: Toast notification doesn't appear
- **Cause**: Milestone subscription not set up correctly
- **Fix**: Verify `useMilestoneSubscription` hook is called in layout component

**Issue**: Optimization annotations missing on chart
- **Cause**: No dspy_model_versions entries with status="active"
- **Fix**: Check `dspy_model_versions` table, verify trainedAt timestamps

**Issue**: "No AI activity" shown but data exists
- **Cause**: Date range filter not matching data
- **Fix**: Check `createdAt` timestamps align with period range

### Convex Query Debugging

```typescript
// Add console.log in Convex query
export const getAutomationRate = query({
  handler: async (ctx, args) => {
    console.log("Query args:", args);
    const result = await calculateRate(ctx, args);
    console.log("Result:", result);
    return result;
  },
});

// View logs in Convex dashboard → Logs tab
```

### React Component Debugging

```typescript
// Add debug output
useEffect(() => {
  console.log("Automation rate data:", { rate, totalDecisions, decisionsReviewed });
}, [rate, totalDecisions, decisionsReviewed]);
```

---

## Deployment Checklist

Before merging to main:

- [ ] `npm run build` passes without errors
- [ ] All TypeScript types compile (`npx tsc --noEmit`)
- [ ] Convex schema deployed to production (`npx convex deploy --yes`)
- [ ] Convex cron scheduled correctly (check Convex dashboard → Crons)
- [ ] UAT testing complete (all 3 user stories verified)
- [ ] No console.log statements in production code
- [ ] Git author set to `grootdev-ai`
- [ ] CLAUDE.md documentation updated with automation rate patterns

---

## Next Steps

After implementation:

1. **Monitor Performance**: Check Convex dashboard for query latency
2. **Gather Feedback**: Ask users if automation rate metric is useful
3. **Iterate**: Consider adding per-feature breakdown (AR vs Bank vs Fee vs Expense)
4. **Optimize**: If queries slow down at scale, add caching or materialized views

---

## Resources

- **Convex Docs**: https://docs.convex.dev
- **Recharts Docs**: https://recharts.org/en-US
- **Feature Spec**: [spec.md](./spec.md)
- **Data Model**: [data-model.md](./data-model.md)
- **Contracts**: [contracts/](./contracts/)
- **CLAUDE.md**: `/CLAUDE.md` (project rules)

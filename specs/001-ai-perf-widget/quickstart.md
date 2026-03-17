# Quickstart: AI Performance Widget

## Prerequisites

- Convex dev server running (`npx convex dev`)
- Next.js dev server running (`npm run dev`)
- At least one business with AI activity (AR matches, bank classifications, or fee classifications)

## Implementation Order

1. **Convex query** (`convex/functions/aiPerformanceMetrics.ts`)
   - Create `getAIPerformanceMetrics` query with period filtering
   - Reuse bridge pattern from `aiDigest.ts` — extend `gatherAIActivity` logic with date ranges + confidence averaging
   - Test: Call from Convex dashboard with a known businessId

2. **React hook** (`src/domains/analytics/hooks/use-ai-performance.ts`)
   - Wrap Convex `useQuery` with period state management
   - Expose: `metrics`, `period`, `setPeriod`, `loading`, `isEmpty`

3. **Widget component** (`src/domains/analytics/components/ai-performance/AIPerformanceWidget.tsx`)
   - Hero metric (hours saved / invoices automated)
   - 4 metric cards (confidence, edit rate, no-edit rate, automation rate)
   - Donut chart (recharts PieChart with inner radius)
   - Period selector (This Month / Last 3 Months / All Time)
   - Trend indicators (up/down arrows with delta)
   - Empty state

4. **Dashboard integration** (`src/domains/analytics/components/complete-dashboard.tsx`)
   - Import and place `AIPerformanceWidget` after `ProactiveActionCenter`
   - Pass `businessId` prop

5. **Build & deploy**
   - `npm run build` — must pass
   - `npx convex deploy --yes` — deploy Convex query to prod

## Key Files to Reference

| File | Purpose |
|------|---------|
| `convex/functions/aiDigest.ts` | Bridge pattern to replicate (gatherAIActivity, TIME_SAVED constants) |
| `src/domains/analytics/components/complete-dashboard.tsx` | Dashboard layout to integrate into |
| `src/domains/analytics/components/action-center/ProactiveActionCenter.tsx` | Card styling reference |
| `src/domains/expense-claims/einvoice/components/einvoice-dashboard.tsx` | recharts PieChart usage reference |
| `convex/schema.ts` | Table schemas for all data sources |

## Testing

- Navigate to analytics dashboard → widget visible with metrics
- Switch periods → metrics update
- New business (no AI data) → empty state shown
- `npm run build` passes with no errors

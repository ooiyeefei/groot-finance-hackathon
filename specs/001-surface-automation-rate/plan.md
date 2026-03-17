# Implementation Plan: Surface Automation Rate Metric

**Branch**: `001-surface-automation-rate` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-surface-automation-rate/spec.md`

## Summary

Add a prominent automation rate metric that demonstrates AI value across all four AI features (AR reconciliation, bank transaction classification, fee breakdown, expense OCR). Display as hero metric on analytics dashboard, daily summary on Action Center, cumulative stats in business settings, with weekly trend chart showing improvement over time. Include milestone notifications (90%, 95%, 99%) via toast and email digest. This addresses competitive parity with MindHive's "2,230 invoices processed, only looked at 12" social proof.

**Technical Approach**: Convex queries aggregate AI decisions and corrections from existing tables (`order_matching_corrections`, `bank_recon_corrections`, expense claims edits, fee breakdown logs). No new database tables required. React components display metrics using Recharts for trend visualization. Milestone tracking via Convex cron checking thresholds daily.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x
**Primary Dependencies**: Next.js 15.5.7, React 19.1.2, Convex 1.31.3, Recharts 2.x (for trend charts), Sonner (toast notifications), Radix UI (components)
**Storage**: Convex document database (existing tables: `order_matching_corrections`, `bank_recon_corrections`, `expense_claims`, `dspy_model_versions`, `businesses`)
**Testing**: Manual UAT testing with test accounts in `.env.local`, production testing on `finance.hellogroot.com`
**Target Platform**: Web (Next.js 15 server components + client components), responsive design
**Project Type**: Web application (Next.js frontend + Convex backend)
**Performance Goals**: Load automation rate within 2 seconds, trend chart render <1 second, toast notifications within 5 seconds of threshold crossing
**Constraints**:
- Must aggregate data from 4 independent AI feature sources without performance degradation
- Historical rates immutable (no retroactive recalculation)
- Zero new Convex tables (use existing correction tracking)
- Must work with existing analytics dashboard layout
- Milestone notifications fire once per threshold per business (no duplicates)

**Scale/Scope**:
- Expected 100-1000 AI decisions per business per week
- Trend chart displays 8-52 weeks of history
- 4 data sources to aggregate
- 3 display locations (dashboard, Action Center, settings)
- 3 milestone thresholds (90%, 95%, 99%)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Based on CLAUDE.md Project Rules

✅ **Domain-Driven Design**: Feature adds UI components to existing `src/domains/analytics/` - not creating new domain (analytics already exists)

✅ **No New Tables**: Uses existing correction tables (`order_matching_corrections`, `bank_recon_corrections`), queries existing data - no schema changes required

✅ **Convex Deployment**: After adding new queries, must run `npx convex deploy --yes` before completion

✅ **Design System Compliance**: Uses semantic tokens (`bg-card`, `text-foreground`, `bg-primary`), no hardcoded colors

✅ **Button Styling**: Action buttons use `bg-primary`, milestone notifications use appropriate styling

✅ **Number Formatting**: Uses `formatNumber()` and `formatCurrency()` from `@/lib/utils/format-number`

✅ **Least Privilege**: Queries are public (user-facing metrics), no sensitive data exposure, read-only operations

✅ **Git Author**: All commits use `grootdev-ai` identity

✅ **Build-Fix Loop**: `npm run build` must pass before task completion

⚠️ **Page Layout Pattern**: New components integrate into existing analytics dashboard (no new pages), but Action Center summary requires checking current layout

✅ **Documentation Update**: Must update `src/domains/analytics/CLAUDE.md` (if exists) or create it to document automation rate queries

### Gates Status

**Phase 0 Gate**: ✅ PASS - No constitution violations, existing infrastructure sufficient

**Phase 1 Re-check**: Will verify after design phase that:
- Analytics dashboard can accommodate hero metric without layout changes
- Action Center has space for daily summary
- Business settings AI section exists and can display cumulative stats

## Project Structure

### Documentation (this feature)

```text
specs/001-surface-automation-rate/
├── plan.md              # This file
├── research.md          # Phase 0: Data source research, chart library evaluation
├── data-model.md        # Phase 1: Automation rate calculation model, milestone tracking
├── quickstart.md        # Phase 1: Developer setup, testing automation rate locally
├── contracts/           # Phase 1: Convex query contracts, React component props
└── tasks.md             # Phase 2: Implementation task breakdown (created by /speckit.tasks)
```

### Source Code (repository root)

```text
# Groot Finance is a Next.js web application with domain-driven structure

src/domains/analytics/
├── components/
│   ├── automation-rate-hero.tsx        # NEW: Hero metric card for dashboard
│   ├── automation-rate-trend-chart.tsx # NEW: Weekly trend chart with Recharts
│   └── automation-rate-stats.tsx       # NEW: Business settings cumulative stats
├── hooks/
│   └── use-automation-rate.ts          # NEW: React Query hook for fetching rate data
└── lib/
    └── automation-rate-queries.ts      # NEW: Convex query helpers

src/domains/action-center/
└── components/
    └── action-center-summary.tsx       # MODIFY: Add daily automation summary

src/domains/settings/
└── components/
    └── business-settings-ai.tsx        # MODIFY: Add automation stats section

convex/functions/
├── automationRate.ts                   # NEW: Queries for automation rate calculation
├── automationMilestones.ts             # NEW: Milestone tracking and notification triggers
└── aiDigest.ts                         # MODIFY: Include milestone achievements in email

convex/crons.ts                         # MODIFY: Add daily automation milestone check cron

src/lib/utils/
└── automation-rate.ts                  # NEW: Client-side calculation helpers, formatting

tests/ (manual UAT)
└── automation-rate-uat.md              # NEW: Test plan for all 3 user stories
```

**Structure Decision**: This feature extends the existing Next.js + Convex web application. Components are added to the appropriate domain directories (`analytics/`, `action-center/`, `settings/`) following the domain-driven design pattern. Convex backend functions aggregate data from existing tables. No new pages created - all UI integrates into existing layouts.

## Complexity Tracking

No violations requiring justification. Feature uses existing infrastructure and follows all project patterns.

---

## Phase 0: Outline & Research

### Research Tasks

1. **Data Source Inventory**
   - **Unknown**: Exact table/field names for tracking expense OCR edits
   - **Research**: Query Convex schema to find how expense claim edits are tracked
   - **Alternatives**:
     - Option A: `expense_claims` table has edit history
     - Option B: Separate correction table exists
     - Option C: Tracked in metadata/changelog field

2. **Fee Breakdown Classification Tracking**
   - **Unknown**: How fee breakdown AI decisions are currently logged
   - **Research**: Examine existing fee breakdown implementation for decision tracking
   - **Alternatives**:
     - Option A: Logged in transaction metadata
     - Option B: Separate `fee_classification_decisions` table
     - Option C: Tracked via `bank_transactions` classification fields

3. **DSPy Model Optimization Events**
   - **Unknown**: Exact structure of `dspy_model_versions` table and optimization event logging
   - **Research**: Query table schema to understand timestamp/marker format for "Model optimized" annotations
   - **Decision needed**: Field name for optimization timestamp, businessId filtering

4. **Chart Library Integration**
   - **Unknown**: Whether Recharts is already installed or if we need to add it
   - **Research**: Check `package.json` for existing chart library, evaluate Recharts vs alternatives
   - **Alternatives**:
     - Option A: Recharts (React-specific, good for line charts)
     - Option B: Chart.js (if already in project)
     - Option C: Victory Charts (if already in project)

5. **Analytics Dashboard Layout**
   - **Unknown**: Current dashboard structure and available space for hero metric
   - **Research**: Examine `src/domains/analytics/` to understand existing dashboard layout
   - **Decision needed**: Where to place hero metric without displacing existing content

6. **Action Center UI Structure**
   - **Unknown**: Current Action Center component structure and summary area
   - **Research**: Examine `src/domains/action-center/` to find where daily summary should be added
   - **Decision needed**: Exact component file to modify, props structure

7. **Business Settings AI Section**
   - **Unknown**: Whether AI section exists in business settings or needs creation
   - **Research**: Examine `src/domains/settings/` to locate or design AI settings section
   - **Alternatives**:
     - Option A: AI section already exists - just add stats
     - Option B: Create new AI section in settings

8. **Milestone Notification System**
   - **Unknown**: Current notification system structure (Sonner integration)
   - **Research**: Find existing toast notification examples in codebase
   - **Decision needed**: Notification trigger location (client vs server), persistence strategy

9. **Email Digest Integration**
   - **Unknown**: Structure of AI Intelligence Digest email, template location
   - **Research**: Examine `convex/functions/aiDigest.ts` to understand email generation
   - **Decision needed**: How to inject milestone achievements into existing digest

10. **Performance Optimization**
    - **Unknown**: Best indexing strategy for aggregating corrections across 4 tables
    - **Research**: Convex indexing best practices, query performance patterns
    - **Decision needed**: Whether to cache aggregated results or compute on-demand

### Best Practices Research

1. **Convex Aggregation Patterns**
   - Research: Best practices for aggregating data from multiple tables in Convex
   - Goal: Ensure queries perform well with 100-1000 decisions/week

2. **Recharts Performance**
   - Research: Best practices for rendering 8-52 data points efficiently
   - Goal: <1 second chart render time

3. **Immutable Historical Data**
   - Research: Patterns for storing historical snapshots vs computing on-demand
   - Goal: Ensure historical rates don't change when new corrections are made

4. **Milestone Tracking State**
   - Research: Best way to track "already notified" state per business
   - Alternatives: Convex table, business metadata field, separate tracking table

### Output: research.md

Will consolidate findings in structured format with decisions, rationales, and alternatives.

---

## Phase 1: Design & Contracts

**Prerequisites**: `research.md` complete with all unknowns resolved

### 1. Data Model (`data-model.md`)

**Entities** (from feature spec):

- **Automation Rate Metric** (computed, not stored)
  - Fields: `rate` (percentage), `totalDecisions` (count), `decisionsReviewed` (count), `period` (date range), `timestamp` (calculation time)
  - Relationships: Aggregates from 4 data sources
  - Validation: `totalDecisions >= decisionsReviewed`, `0 <= rate <= 100`

- **AI Decision** (existing, distributed across tables)
  - AR: `sales_orders` with `aiMatchStatus`, `aiMatchTier`
  - Bank: `bank_transactions` with classification fields
  - Fee: TBD from research Phase 0
  - Expense: `expense_claims` with OCR extraction data

- **Decision Correction** (existing)
  - AR: `order_matching_corrections` table
  - Bank: `bank_recon_corrections` table
  - Fee: TBD from research Phase 0
  - Expense: TBD from research Phase 0

- **Automation Milestone** (new tracking needed)
  - Fields: `businessId`, `threshold` (90/95/99), `achievedAt` (timestamp), `currentRate` (rate when achieved)
  - Storage: Add to `businesses` table as nested object `automationMilestones: { "90": timestamp, "95": timestamp, "99": timestamp }`
  - Validation: Timestamp increases monotonically per threshold

- **Model Optimization Event** (existing)
  - Table: `dspy_model_versions` (assumed from spec)
  - Fields: TBD from research Phase 0
  - Used for: Trend chart annotations

**State Transitions**:
- Milestone tracking: `not_achieved` → `achieved` (one-way, no reset)

### 2. API Contracts (`contracts/`)

**Convex Queries**:

```typescript
// contracts/automation-rate-queries.ts

/**
 * Calculate current automation rate for a business
 * @param businessId - Target business ID
 * @param period - Date range (today | week | month | custom)
 * @param startDate - If period=custom
 * @param endDate - If period=custom
 * @returns { rate, totalDecisions, decisionsReviewed, period }
 */
export interface GetAutomationRateArgs {
  businessId: Id<"businesses">;
  period: "today" | "week" | "month" | "custom";
  startDate?: string; // ISO date
  endDate?: string;   // ISO date
}

export interface AutomationRateResult {
  rate: number;              // 0-100
  totalDecisions: number;
  decisionsReviewed: number;
  period: {
    start: string;           // ISO date
    end: string;             // ISO date
    label: string;           // "Today", "This week", etc.
  };
  hasMinimumData: boolean;   // true if >= 10 decisions
  message?: string;          // "No AI activity" or "Collecting data..."
}

/**
 * Get weekly automation rate trend data
 * @param businessId - Target business ID
 * @param weeks - Number of weeks to return (default 8, max 52)
 * @returns Array of weekly data points
 */
export interface GetAutomationRateTrendArgs {
  businessId: Id<"businesses">;
  weeks?: number;            // default 8, max 52
}

export interface AutomationRateTrendPoint {
  weekStart: string;         // ISO date (Monday)
  weekEnd: string;           // ISO date (Sunday)
  rate: number | null;       // null if no activity
  totalDecisions: number;
  decisionsReviewed: number;
  optimizationEvents: Array<{
    date: string;            // ISO date
    modelType: string;       // "AR" | "Bank" | "Fee"
  }>;
}

/**
 * Get cumulative lifetime automation stats
 * @param businessId - Target business ID
 * @returns Lifetime totals since business created
 */
export interface GetLifetimeAutomationStatsArgs {
  businessId: Id<"businesses">;
}

export interface LifetimeAutomationStats {
  rate: number;
  totalDecisions: number;
  decisionsReviewed: number;
  firstDecisionDate: string; // ISO date
  lastDecisionDate: string;  // ISO date
}

/**
 * Check and trigger milestone notifications (cron job)
 * @param businessId - Target business ID
 * @returns Newly achieved milestones
 */
export interface CheckMilestonesArgs {
  businessId: Id<"businesses">;
}

export interface MilestoneCheckResult {
  newlyAchieved: Array<{
    threshold: 90 | 95 | 99;
    currentRate: number;
    timestamp: string;       // ISO timestamp
  }>;
  alreadyAchieved: number[]; // List of thresholds already hit
}
```

**React Component Contracts**:

```typescript
// contracts/react-components.ts

/**
 * Hero metric card for analytics dashboard
 */
export interface AutomationRateHeroProps {
  businessId: string;
  period: "today" | "week" | "month";
  onPeriodChange: (period: "today" | "week" | "month") => void;
}

/**
 * Weekly trend chart component
 */
export interface AutomationRateTrendChartProps {
  businessId: string;
  weeks?: number;          // default 8
  height?: number;         // default 300px
}

/**
 * Cumulative stats for business settings
 */
export interface AutomationRateStatsProps {
  businessId: string;
}

/**
 * Daily summary for Action Center
 */
export interface ActionCenterSummaryProps {
  businessId: string;
  // Extends existing Action Center component
}
```

### 3. Quickstart Guide (`quickstart.md`)

Will include:
- How to test automation rate locally with sample data
- How to trigger milestone notifications
- How to add test AI decisions and corrections
- How to verify trend chart displays correctly

### 4. Agent Context Update

Run: `.specify/scripts/bash/update-agent-context.sh claude`

This will add to CLAUDE.md:
- Recharts dependency (if new)
- Automation rate query patterns
- Milestone tracking approach
- Historical data immutability pattern

---

## Phase 2: Task Breakdown (Generated by /speckit.tasks)

**Note**: This section is intentionally empty. Tasks are generated by the `/speckit.tasks` command after Phase 1 design is complete.

The tasks.md file will break down implementation into:
- Setup tasks (dependencies, file structure)
- Backend tasks (Convex queries, aggregation logic)
- Frontend tasks (React components, hooks)
- Integration tasks (dashboard layout, Action Center)
- Testing tasks (UAT scenarios from spec)
- Deployment tasks (Convex deploy, build verification)

---

## Next Steps

1. ✅ Run `/speckit.plan` (this file generated)
2. ⏳ Execute Phase 0 research to resolve all unknowns
3. ⏳ Execute Phase 1 design (data model, contracts, quickstart)
4. ⏳ Run `/speckit.tasks` to generate task breakdown
5. ⏳ Run `/speckit.implement` to execute implementation
6. ⏳ Test end-to-end with UAT scenarios
7. ⏳ Deploy to production

**Current Status**: Plan generated, ready for Phase 0 research

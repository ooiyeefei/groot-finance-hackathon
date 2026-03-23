# Implementation Plan: ROI Calculator for Partner Prospects

**Branch**: `033-roi-calculator` | **Date**: 2026-03-23 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/033-roi-calculator/spec.md`

## Summary

Build a public-facing ROI calculator page at `/roi-calculator` that lets prospects enter 5 business metrics and instantly see time savings, cost savings, and payback period. Supports partner branding via URL parameter and shareable links. Pure client-side calculation — no backend/Convex dependency for the core feature.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Next.js 15.5.7, React 19.1.2
**Primary Dependencies**: Existing UI components (card, input, select, button, sheet), `formatCurrency` utility, Tailwind CSS
**Storage**: N/A — no persistence. Inputs encoded in URL query params. Partner data as static config.
**Testing**: Manual UAT (existing project pattern for UI pages)
**Target Platform**: Web (desktop + mobile), public page (no auth)
**Project Type**: Web — addition to existing Next.js app
**Performance Goals**: Page load < 2s on mobile, instant calculation updates
**Constraints**: No Convex queries (zero bandwidth cost), no auth required, mobile-responsive (320px min)
**Scale/Scope**: 1 public page, ~5 components, ~1 config file, 1 middleware update

## Constitution Check

*GATE: Constitution is a template (no project-specific gates). Passed.*

Project follows existing patterns:
- Public page pattern: matches `/referral`, `/pricing` (no auth, no app shell)
- DDD: This is a GTM/marketing page, not a business domain — lives at `src/app/roi-calculator/` (like `/referral`)
- No Convex dependency: zero bandwidth impact
- Middleware: add `/roi-calculator` to `isPublicRoute` matcher

## Project Structure

### Documentation (this feature)

```text
specs/033-roi-calculator/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
src/app/roi-calculator/
├── page.tsx                    # Server component (metadata + SEO)
└── roi-calculator-client.tsx   # Client component (all UI + calculation logic)

src/lib/roi-calculator/
├── calculation.ts              # ROI calculation engine (pure functions)
├── partners.ts                 # Partner code → display name + contact lookup
└── constants.ts                # Configurable assumptions (time per task, pricing)
```

**Structure Decision**: Public marketing page at `/roi-calculator` (no `[locale]` prefix, no app shell). Follows the same pattern as `/referral/page.tsx`. Calculation logic in `src/lib/roi-calculator/` as a shared capability (not a domain — this is a GTM tool, not a business feature).

## Key Design Decisions

### 1. Pure Client-Side Calculation
- All ROI math happens in the browser — no API calls, no Convex queries
- Zero bandwidth cost on free plan
- Instant results as inputs change (no network latency)
- Calculation function is a pure TypeScript function for testability

### 2. Partner Lookup via Static Config
- Partner codes mapped to display names + contact URLs in a static TypeScript file
- No Convex table needed — partner list is small and rarely changes
- Adding a partner = editing one config file and redeploying
- If partner list grows, can migrate to Convex table later

### 3. URL-Encoded Shareable Links
- All 5 inputs + currency encoded as URL query params: `?pi=50&si=30&er=100&staff=3&salary=4000&currency=MYR&partner=acme`
- No backend state needed — link IS the state
- Partner code preserved in shared links

### 4. No App Shell (No Sidebar/Header)
- This is a standalone marketing page, not an app feature
- Clean, focused design — no navigation chrome
- Groot Finance branding via header/footer (similar to `/referral` page)
- Mobile-first layout

### 5. Configurable Calculation Assumptions
Constants file defines time-per-task and pricing assumptions:
- `MINUTES_PER_PURCHASE_INVOICE`: ~8 min (manual data entry, matching, approval)
- `MINUTES_PER_SALES_INVOICE`: ~6 min (creation, submission, tracking)
- `MINUTES_PER_EXPENSE_RECEIPT`: ~4 min (scanning, categorizing, submitting)
- `GROOT_MONTHLY_PRICE`: Groot Finance subscription cost
- `WORKING_HOURS_PER_MONTH`: 176 (22 days × 8 hours)

### 6. Calculation Formula
```
hoursSavedPerMonth = (purchaseInvoices × 8 + salesInvoices × 6 + receipts × 4) / 60
hourlyRate = monthlySalary / 176
monthlyCostSavings = hoursSavedPerMonth × hourlyRate
annualCostSavings = monthlyCostSavings × 12
paybackPeriodMonths = grootMonthlyPrice / monthlyCostSavings
timeSpentOnFinance = hoursSavedPerMonth / (staff × 176) × 100  // % of time on manual finance
```

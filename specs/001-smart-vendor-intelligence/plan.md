# Implementation Plan: Smart Vendor Intelligence

**Branch**: `001-smart-vendor-intelligence` | **Date**: 2026-03-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-smart-vendor-intelligence/spec.md`

## Summary

Build an AI-powered vendor intelligence system that automatically tracks item prices from AP invoices, detects cost anomalies, generates vendor performance scorecards, calculates risk scores, and provides smart alerts integrated with existing Action Center and AI Digest workflows. The system uses a two-tier intelligence architecture: Tier 1 (rule-based for common cases) + Tier 2 (DSPy self-improving AI for the long tail). Core moat feature: self-improving anomaly detection that learns from user corrections.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Node.js 20.x + Next.js 15.5.7, React 19.1.2
**Primary Dependencies**: Convex 1.31.3 (real-time DB), Clerk 6.30.0 (auth), Radix UI (components), Recharts (charts), Zod 3.23.8 (validation), papaparse (CSV), lucide-react (icons)
**Storage**: Convex document database with real-time subscriptions. New tables: `vendor_price_history`, `vendor_price_anomalies`, `vendor_scorecards`, `vendor_risk_profiles`, `cross_vendor_item_groups`, `vendor_recommended_actions`. Existing tables: `invoices`, `vendors`, `journal_entry_lines`, `businesses`.
**Testing**: Jest + React Testing Library (unit), Playwright (E2E), manual UAT with test accounts from `.env.local`
**Target Platform**: Next.js 15 web app (server + client components), Convex backend (serverless functions)
**Project Type**: Web application (domain-driven design structure in `src/domains/`)
**Performance Goals**: Vendor scorecard loads <2 seconds, price history export <10 seconds, price tracking processes 100% of invoices with valid line items, alert accuracy >90%
**Constraints**: 2-year price history retention (then auto-archive), 80% fuzzy match confidence threshold, ≥50% billing frequency deviation for alerts, <80% confidence requires user confirmation
**Scale/Scope**: Multi-tenant (per-business data isolation), handles 1000s of vendors per business, tracks millions of price history records, real-time anomaly detection on invoice processing

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### ✅ Domain-Driven Design (MANDATORY)
- **Rule**: Business domains in `src/domains/`, shared capabilities in `src/lib/`
- **Compliance**: This is a **business domain** (vendor intelligence = user-facing capability). Goes in `src/domains/vendor-intelligence/` with pages, components, hooks, lib, types.
- **Rationale**: Users navigate to vendor intelligence features (scorecard, price intelligence dashboard, risk analysis). Not a shared capability like CSV parsing.

### ✅ AI Moat: Self-Improving Over Static Rules (CRITICAL)
- **Rule**: Features should self-improve, learn from user behavior, use DSPy where appropriate
- **Compliance**:
  - Two-tier architecture: Tier 1 (exact match, keyword rules) → Tier 2 (DSPy semantic fuzzy matching with 80% confidence threshold)
  - User corrections feed into learning loop (false positive dismissals, cross-vendor item grouping corrections)
  - DSPy BootstrapFewShot for item matching, MIPROv2 for anomaly detection optimization
- **Rationale**: Price anomaly detection + cross-vendor matching = perfect DSPy use cases (classification, fuzzy matching, improving with corrections)

### ✅ Least Privilege Security (CRITICAL)
- **Rule**: Minimum permissions at all layers, no secrets in Convex, use Convex auth contexts
- **Compliance**:
  - All Convex mutations use `ctx.auth.getUserIdentity()` for user isolation
  - Business-scoped queries: every query filters by `businessId` from user's Clerk metadata
  - No API keys stored in Convex (existing pattern: SSM Parameter Store for secrets)
  - Read-only access for archived data (>2 years old)
- **Rationale**: Multi-tenant system requires strict data isolation per business

### ✅ Accounting Standards: IFRS Compliance (CRITICAL)
- **Rule**: Follow IFRS, double-entry bookkeeping, proper journal entries
- **Compliance**:
  - Price history records reference existing `invoices` table (already IFRS-compliant)
  - No new GL postings required (vendor intelligence is analytics layer, not transactional)
  - Audit trail: price history + anomaly alerts retained for 2 years, then archived (not deleted)
- **Rationale**: Vendor intelligence is read-only analytics; doesn't create transactions

### ✅ Build Incrementally: P1-P5 Prioritization
- **Rule**: Ship small, test, iterate
- **Compliance**:
  - P1 (price tracking + anomaly alerts) = MVP, independently testable
  - P2-P5 = progressive enhancements, each deliverable standalone
  - User Story structure supports incremental delivery
- **Rationale**: Moat feature (P1) ships first, gather feedback before building dashboard (P3)

### ✅ Git Author Identity (CRITICAL)
- **Rule**: All commits MUST use `grootdev-ai` identity for Vercel deployments
- **Compliance**: Will run `git config user.name "grootdev-ai"` and `git config user.email "dev@hellogroot.com"` before any commits
- **Rationale**: Vercel deployment requirement (see CLAUDE.md line 47-50)

### ✅ Clerk Version Lock (CRITICAL)
- **Rule**: Locked at `6.30.0` (no caret `^`), never upgrade without testing middleware
- **Compliance**: No Clerk version changes in this feature; using existing `6.30.0` lock
- **Rationale**: v6.34.0+ breaks middleware auth() detection (infinite redirect loop)

### ✅ Mandatory Build-Fix Loop
- **Rule**: `npm run build` MUST pass before completion
- **Compliance**: Will run build check after all code changes, fix errors iteratively
- **Rationale**: Catch TypeScript/Next.js errors before deployment

### ✅ Convex Deployment (CRITICAL)
- **Rule**: After ANY Convex change (schema, functions, queries, mutations, indexes), run `npx convex deploy --yes`
- **Compliance**: Will deploy to prod after schema changes (6 new tables, extended existing tables) and new queries/mutations
- **Rationale**: "Could not find public function" errors in prod if not deployed

### ⚠️ No Screenshots/Binary Files in Git
- **Rule**: Never commit .png, .jpg, .gif, or binary files
- **Compliance**: This feature generates CSVs (text) for export. No screenshots planned.
- **Rationale**: Keep repo size manageable

### ✅ Page Layout Pattern (MANDATORY)
- **Rule**: All pages must include `<Sidebar />` and `<HeaderWithUser />`; pages are server components
- **Compliance**: New price intelligence page will follow `expense-claims/page.tsx` pattern: server component → auth check → client providers → sidebar + header + main content
- **Rationale**: Consistent app shell across all pages

### ✅ Design System: Semantic Tokens (MANDATORY)
- **Rule**: Use semantic tokens (`bg-card`, `text-foreground`), never hardcode colors
- **Compliance**: Will use existing design system tokens from `src/app/globals.css`
- **Rationale**: Maintain dark mode compatibility + consistent theming

### ✅ Button Styling (MANDATORY)
- **Rule**: Action buttons = `bg-primary`, Destructive = `bg-destructive`, Cancel = `bg-secondary`
- **Compliance**: Dismiss alerts = `bg-secondary`, Export = `bg-primary`, Reject matches = `bg-destructive`
- **Rationale**: Consistent button hierarchy across app

### ✅ Number Formatting
- **Rule**: Use `formatCurrency()` and `formatNumber()` from `@/lib/utils/format-number`
- **Compliance**: All price displays will use `formatCurrency(amount, currency)`
- **Rationale**: Consistent locale-aware formatting

### ✅ Date Handling
- **Rule**: Use `formatBusinessDate()` from `@/lib/utils` (no timezone shift)
- **Compliance**: Invoice dates, price history timestamps will use `formatBusinessDate()`
- **Rationale**: Avoid timezone bugs in date displays

### ✅ Gemini Model Selection (MANDATORY)
- **Rule**: All Gemini calls (except CUA) MUST use `gemini-3.1-flash-lite-preview`
- **Compliance**: DSPy fuzzy matching will use Gemini Flash-Lite for semantic similarity
- **Rationale**: Best cost/performance ($0.25/$1.50 per M tokens)

### ✅ Documentation Update (MANDATORY)
- **Rule**: After changes, update relevant CLAUDE.md docs to reflect architecture
- **Compliance**: Will create `src/domains/vendor-intelligence/CLAUDE.md` documenting architecture, data flow, DSPy learning loops
- **Rationale**: Keep docs in sync with code for future AI agents

## Project Structure

### Documentation (this feature)

```text
specs/001-smart-vendor-intelligence/
├── spec.md              # Feature specification (complete)
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (technical decisions)
├── data-model.md        # Phase 1 output (Convex schema)
├── quickstart.md        # Phase 1 output (developer onboarding)
├── contracts/           # Phase 1 output (API contracts)
│   ├── queries.ts       # Convex query contracts
│   ├── mutations.ts     # Convex mutation contracts
│   └── types.ts         # Shared TypeScript types
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/domains/vendor-intelligence/           # NEW: Business domain
├── pages/
│   ├── price-intelligence/                # P3: Price Intelligence Dashboard
│   │   ├── page.tsx                       # Server component (auth check)
│   │   └── price-intelligence-client.tsx  # Client component (charts, filters)
│   ├── vendor/[vendorId]/                 # P2: Vendor Scorecard Detail
│   │   ├── page.tsx                       # Server component
│   │   └── vendor-detail-client.tsx       # Client component
│   └── alerts/                            # P1: Anomaly Alerts List
│       ├── page.tsx                       # Server component
│       └── alerts-client.tsx              # Client component
├── components/
│   ├── price-history-chart.tsx            # P3: Recharts line chart
│   ├── vendor-scorecard-card.tsx          # P2: Metrics display card
│   ├── anomaly-alert-card.tsx             # P1: Alert UI component
│   ├── cross-vendor-comparison-table.tsx  # P3: Multi-vendor price table
│   ├── vendor-risk-profile.tsx            # P4: Risk scores visualization
│   ├── fuzzy-match-confirmation-dialog.tsx # P1: <80% confidence UI
│   ├── item-group-editor.tsx              # P3: Cross-vendor grouping UI
│   └── csv-export-button.tsx              # P3: Export price history
├── hooks/
│   ├── use-price-history.ts               # P1: Query price history records
│   ├── use-anomaly-alerts.ts              # P1: Query + dismiss alerts
│   ├── use-vendor-scorecard.ts            # P2: Calculate scorecard metrics
│   ├── use-vendor-risk-profile.ts         # P4: Calculate risk scores
│   └── use-cross-vendor-groups.ts         # P3: Manage item groupings
├── lib/
│   ├── price-tracking.ts                  # P1: Extract prices from invoices
│   ├── anomaly-detection.ts               # P1: Tier 1 (rules) + Tier 2 (DSPy)
│   ├── fuzzy-matching.ts                  # P1: Item description matching (80% threshold)
│   ├── scorecard-calculator.ts            # P2: Aggregate vendor metrics
│   ├── risk-calculator.ts                 # P4: Calculate 4 risk scores
│   ├── billing-frequency-analyzer.ts      # P1: Detect ≥50% deviation
│   └── price-normalizer.ts                # Edge case: per-piece vs per-box
└── types/
    ├── price-history.ts                   # Type definitions for entities
    ├── anomaly-alert.ts
    ├── vendor-scorecard.ts
    ├── vendor-risk-profile.ts
    └── cross-vendor-item-group.ts

convex/functions/
├── vendorPriceHistory/                    # NEW: Convex backend
│   ├── create.ts                          # mutation: Store price from invoice
│   ├── list.ts                            # query: Get price history
│   ├── archive.ts                         # internalMutation: Archive >2 years
│   └── getByItemVendor.ts                 # query: Single item-vendor timeline
├── vendorPriceAnomalies/
│   ├── detect.ts                          # internalMutation: Run anomaly detection
│   ├── list.ts                            # query: Get active alerts
│   ├── dismiss.ts                         # mutation: User dismisses alert
│   └── createRecommendedActions.ts        # internalMutation: Generate actions
├── vendorScorecards/
│   ├── calculate.ts                       # internalMutation: Aggregate metrics
│   ├── get.ts                             # query: Get vendor scorecard
│   └── list.ts                            # query: List all scorecards
├── vendorRiskProfiles/
│   ├── calculate.ts                       # internalMutation: Calculate 4 risks
│   ├── get.ts                             # query: Get risk profile
│   └── list.ts                            # query: List high-risk vendors
├── crossVendorItemGroups/
│   ├── suggestMatches.ts                  # action: AI semantic matching
│   ├── createGroup.ts                     # mutation: User confirms/creates group
│   ├── updateGroup.ts                     # mutation: User reassigns item
│   ├── list.ts                            # query: Get all groups
│   └── getGroupById.ts                    # query: Get single group
└── vendorRecommendedActions/
    ├── create.ts                          # internalMutation: Create action
    ├── list.ts                            # query: Get actions for vendor
    └── updateStatus.ts                    # mutation: Mark action complete

convex/crons/
└── vendorIntelligenceCron.ts              # NEW: Process invoices, detect anomalies, archive old data

convex/schema.ts                           # EXTENDED: Add 6 new tables

src/lib/ai/                                # EXTENDED: DSPy modules
└── dspy-fuzzy-matcher.ts                  # NEW: DSPy module for item matching

tests/
├── integration/
│   ├── vendor-intelligence/
│   │   ├── price-tracking.test.ts         # P1: Invoice → price history
│   │   ├── anomaly-detection.test.ts      # P1: Price increase → alert
│   │   ├── fuzzy-matching.test.ts         # P1: Item code change → confirmation
│   │   ├── cross-vendor-matching.test.ts  # P3: AI suggests → user confirms
│   │   ├── scorecard-calculation.test.ts  # P2: Aggregate metrics
│   │   └── data-archival.test.ts          # Edge case: >2 years → archive
└── e2e/
    └── vendor-intelligence.spec.ts         # UAT: Full user journey P1-P5
```

**Structure Decision**: This is a **business domain** (vendor intelligence), not a shared capability. Users navigate to vendor intelligence features (price dashboard, vendor scorecard, anomaly alerts). Follows domain-driven design pattern: domain owns its pages, components, hooks, lib, and types. Backend logic in Convex functions with real-time subscriptions.

## Complexity Tracking

> No constitution violations requiring justification. All design decisions align with CLAUDE.md coding rules.

## Phase 0: Research & Technical Decisions

**Status**: Ready to execute

### Research Tasks

1. **DSPy Fuzzy Matching Strategy**
   - Decision needed: BootstrapFewShot vs MIPROv2 for item description matching
   - Rationale: 80% confidence threshold requires calibrated similarity scores
   - Alternatives: Levenshtein distance (rejected: no semantic understanding), Sentence-BERT (rejected: DSPy provides better learning loop)

2. **Convex Real-Time Subscription Architecture**
   - Decision needed: Polling vs real-time subscriptions for price history updates
   - Rationale: Users need live updates when new invoices processed
   - Alternatives: HTTP polling (rejected: higher latency + server load), WebSockets (rejected: Convex handles this natively)

3. **Cross-Vendor Item Grouping Storage**
   - Decision needed: Separate `cross_vendor_item_groups` table vs embedding in `vendor_price_history`
   - Rationale: Many-to-many relationship (one group → many price records)
   - Alternatives: Embedded array (rejected: Convex doesn't support cross-document transactions), Graph database (rejected: overkill for this use case)

4. **Price History Archival Strategy**
   - Decision needed: Soft delete (archived flag) vs separate archive table
   - Rationale: 2-year retention policy requires exclusion from active queries
   - Alternatives: Separate `vendor_price_history_archive` table (rejected: complicates audit queries), S3 export (rejected: loses real-time query capability)

5. **Anomaly Detection Tier 2 (DSPy)**
   - Decision needed: DSPy module structure for self-improving anomaly thresholds
   - Rationale: >10% and >20% thresholds may need tuning per business/industry
   - Alternatives: Fixed thresholds (simpler but no learning), Per-business config (user burden), DSPy MIPROv2 (learns optimal thresholds from dismissals)

6. **Recharts vs Victory vs D3.js for Price Trend Visualization**
   - Decision needed: Chart library for P3 (Price Intelligence Dashboard)
   - Rationale: Need line charts with labeled data points, responsive design, Next.js 15 compatibility
   - Alternatives: D3.js (rejected: overkill complexity), Victory (rejected: smaller community), Recharts (chosen: good balance, popular in Next.js)

### Technology Choices (from CLAUDE.md)

**Already decided:**
- Convex 1.31.3 for real-time database (existing)
- Gemini 3.1 Flash-Lite for DSPy (CLAUDE.md mandates this for non-CUA AI)
- TypeScript 5.9.3 + Next.js 15.5.7 (existing stack)
- Zod 3.23.8 for validation (existing)
- Radix UI for components (existing design system)

**New additions:**
- Recharts for data visualization (line charts, bar charts)
- papaparse for CSV export (already used in project for csv-parser)

**Output**: Will create `research.md` with all decisions documented

## Phase 1: Design & Contracts

**Prerequisites**: `research.md` complete

### Data Model Design

**Output**: `data-model.md` with Convex schema definitions for 6 new tables:

1. **vendor_price_history** (Price History Record entity)
   - Fields: itemIdentifier, itemCode, itemDescription, vendorId, invoiceId, unitPrice, quantity, currency, invoiceDate, observationTimestamp, matchConfidenceScore, userConfirmedFlag, archivedFlag
   - Indexes: by_vendor_item, by_vendor_date, by_archived_status
   - Validation: unitPrice > 0, matchConfidenceScore 0-100, quantity > 0

2. **vendor_price_anomalies** (Price Anomaly Alert entity)
   - Fields: vendorId, itemIdentifier, alertType (enum), oldValue, newValue, percentageChange, severityLevel (enum), status (enum), potentialIndicators (array), createdTimestamp, dismissedTimestamp, userFeedback
   - Indexes: by_vendor_status, by_severity, by_created_date
   - Validation: percentageChange required for price anomalies, alertType in [per-invoice, trailing-average, new-item, frequency-change]

3. **vendor_scorecards** (Vendor Scorecard entity)
   - Fields: vendorId, totalSpendYTD, invoiceVolume, averagePaymentCycle, priceStabilityScore, aiExtractionAccuracy, anomalyFlagsCount, lastUpdatedTimestamp
   - Indexes: by_vendor, by_last_updated
   - Validation: priceStabilityScore 0-100, aiExtractionAccuracy 0-100

4. **vendor_risk_profiles** (Vendor Risk Profile entity)
   - Fields: vendorId, paymentRiskScore, concentrationRiskScore, complianceRiskScore, priceRiskScore, riskLevel (enum), lastCalculatedTimestamp
   - Indexes: by_vendor, by_risk_level
   - Validation: all risk scores 0-100, riskLevel in [low, medium, high]

5. **cross_vendor_item_groups** (Cross-Vendor Item Group entity)
   - Fields: groupId, groupName, matchSource (enum), createdTimestamp, lastUpdatedTimestamp, itemReferences (array of {vendorId, itemIdentifier})
   - Indexes: by_group_id, by_created_date
   - Validation: matchSource in [ai-suggested, user-confirmed, user-created], itemReferences.length >= 2

6. **vendor_recommended_actions** (Recommended Action entity)
   - Fields: vendorId, anomalyAlertId, actionType (enum), actionDescription, priorityLevel (enum), status (enum), createdTimestamp
   - Indexes: by_vendor_status, by_anomaly_alert
   - Validation: actionType in [request-quotes, negotiate, review-contract], priorityLevel in [low, medium, high], status in [pending, completed, dismissed]

**Extended existing tables:**
- `invoices`: No changes needed (already has line items)
- `vendors`: No changes needed
- `businesses`: Potentially add `vendorIntelligenceSettings` field for per-business config (anomaly thresholds)

### API Contracts

**Output**: `contracts/` directory with TypeScript contracts

1. **queries.ts** - Convex query signatures
   ```typescript
   // P1: Price tracking
   export const getPriceHistory: QueryContract
   export const getAnomalyAlerts: QueryContract

   // P2: Vendor scorecard
   export const getVendorScorecard: QueryContract
   export const listVendorScorecards: QueryContract

   // P3: Price intelligence
   export const getCrossVendorGroups: QueryContract
   export const getPriceTrendData: QueryContract

   // P4: Risk analysis
   export const getVendorRiskProfile: QueryContract
   export const listHighRiskVendors: QueryContract

   // P5: Recommended actions
   export const getRecommendedActions: QueryContract
   ```

2. **mutations.ts** - Convex mutation signatures
   ```typescript
   // P1: Price tracking
   export const createPriceHistoryRecord: MutationContract
   export const dismissAnomalyAlert: MutationContract
   export const confirmFuzzyMatch: MutationContract

   // P3: Cross-vendor grouping
   export const createItemGroup: MutationContract
   export const updateItemGroup: MutationContract

   // P5: Recommended actions
   export const updateActionStatus: MutationContract
   ```

3. **types.ts** - Shared TypeScript types
   ```typescript
   export type PriceHistoryRecord = { ... }
   export type PriceAnomalyAlert = { ... }
   export type VendorScorecard = { ... }
   export type VendorRiskProfile = { ... }
   export type CrossVendorItemGroup = { ... }
   export type RecommendedAction = { ... }
   export type AlertType = 'per-invoice' | 'trailing-average' | 'new-item' | 'frequency-change'
   export type SeverityLevel = 'standard' | 'high-impact'
   export type RiskLevel = 'low' | 'medium' | 'high'
   ```

### Quickstart Documentation

**Output**: `quickstart.md` for developer onboarding
- Prerequisites: Node.js 20.x, Convex CLI, test accounts from `.env.local`
- Setup steps: `npm install`, `npx convex dev`, navigate to `/en/vendor-intelligence`
- Dev workflow: Make changes → `npm run build` → test locally → commit → deploy Convex
- Testing: Run `npm test` (unit), `npm run test:e2e` (Playwright), manual UAT with test accounts
- Common issues: Convex deployment missing (`npx convex deploy --yes`), build errors (check TypeScript types)

### Agent Context Update

**Output**: Run `.specify/scripts/bash/update-agent-context.sh claude` to add new technologies to agent context file
- New: Recharts (data visualization)
- New: DSPy fuzzy matching module
- Preserve manual additions between markers

## Phase 2: Task Breakdown

**Status**: Deferred to `/speckit.tasks` command (NOT created by `/speckit.plan`)

This phase generates `tasks.md` with dependency-ordered implementation tasks. Execute separately via `/speckit.tasks` after completing Phase 0-1 planning.

## Notes

- **Incremental delivery**: P1 (price tracking + anomaly alerts) ships first as standalone MVP
- **DSPy learning loops**: User dismissals → BootstrapFewShot training → MIPROv2 optimization
- **Security**: All mutations use Convex auth context, business-scoped queries
- **Performance**: Indexed Convex queries, archived data exclusion, real-time subscriptions
- **Testing**: Unit tests for business logic, integration tests for Convex functions, E2E tests for user journeys
- **Documentation**: Create `src/domains/vendor-intelligence/CLAUDE.md` after implementation

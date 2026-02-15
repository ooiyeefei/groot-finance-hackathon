# Implementation Plan: Chat Action Cards Expansion

**Branch**: `013-chat-action-cards` | **Date**: 2026-02-14 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-chat-action-cards/spec.md`

## Summary

Expand the chat agent's dynamic content from 4 action card types to 8+, adding invoice posting, cash flow dashboard, compliance alerts, budget alerts, rich content panel integration, time-series charts, bulk actions, and CSV export. All cards follow the existing registry pattern and SSE streaming architecture. No schema changes needed — all data comes from existing Convex queries and tools.

## Technical Context

**Language/Version**: TypeScript 5.9.3
**Primary Dependencies**: Next.js 15.5.7, React 19.1.2, Convex 1.31.3
**Storage**: Convex (existing tables: invoices, accounting_entries, conversations, messages)
**Testing**: Manual E2E via chat widget (no unit test framework currently for action cards)
**Target Platform**: Web (desktop + mobile responsive)
**Project Type**: Web application (Next.js monolith)
**Performance Goals**: Invoice posting < 15s from card display to confirmation
**Constraints**: Cards must fit within 400px chat widget width; semantic design tokens only
**Scale/Scope**: 8 user stories, ~12 files touched/created, no backend changes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is unpopulated (template only). No gates to enforce. Proceeding with project-level CLAUDE.md rules:
- Semantic design tokens only (no hardcoded colors) ✅
- Button styling: bg-primary for actions, bg-destructive for destructive ✅
- Build must pass (`npm run build`) ✅
- No new files without justification — justified: each card type needs its own component file (registry pattern requires it) ✅
- Prefer modification over creation — existing files modified where possible (index.tsx, prompts.ts, chat-window.tsx) ✅

**Post-design re-check**: All cards use `bg-card`, `text-foreground`, `bg-primary` tokens consistent with existing cards. No Convex schema changes, so no `npx convex deploy` needed.

## Project Structure

### Documentation (this feature)

```text
specs/013-chat-action-cards/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 research decisions
├── data-model.md        # Data shapes for all card types
├── quickstart.md        # Developer quickstart guide
├── contracts/           # TypeScript interface contracts
│   └── action-card-schemas.ts
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
src/domains/chat/
├── components/
│   ├── action-cards/
│   │   ├── registry.ts                  # EXISTING: Card registry (unchanged)
│   │   ├── index.tsx                    # MODIFY: Add new card imports
│   │   ├── expense-approval-card.tsx    # EXISTING (unchanged)
│   │   ├── anomaly-card.tsx             # EXISTING (unchanged)
│   │   ├── vendor-comparison-card.tsx   # EXISTING (unchanged)
│   │   ├── spending-chart.tsx           # EXISTING (unchanged)
│   │   ├── invoice-posting-card.tsx     # NEW: P1 - Post OCR invoice to accounting
│   │   ├── cash-flow-dashboard.tsx      # NEW: P1 - Financial health metrics
│   │   ├── compliance-alert-card.tsx    # NEW: P2 - Regulatory compliance with citations
│   │   ├── budget-alert-card.tsx        # NEW: P2 - Spending vs. historical average
│   │   ├── spending-time-series.tsx     # NEW: P3 - Multi-period trend chart
│   │   └── bulk-action-bar.tsx          # NEW: P3 - Batch selection/approval wrapper
│   ├── chat-window.tsx                  # MODIFY: Wire rich content panel
│   ├── message-renderer.tsx             # MODIFY: Pass rich content callback to cards
│   └── rich-content-panel.tsx           # MODIFY: Add trigger from cards
├── lib/
│   ├── sse-parser.ts                    # EXISTING (unchanged)
│   └── csv-export.ts                    # NEW: P3 - Client-side CSV generation

src/lib/ai/agent/config/
└── prompts.ts                           # MODIFY: Add 4+ new card type instructions
```

**Structure Decision**: All new code lives within the existing `src/domains/chat/` domain structure and `src/lib/ai/` agent config. No new directories or modules. The action-cards pattern (one file per card type, side-effect registration) is preserved.

## Implementation Phases

### Phase A: P1 Cards (Invoice Posting + Cash Flow Dashboard)

**Files created**: `invoice-posting-card.tsx`, `cash-flow-dashboard.tsx`
**Files modified**: `index.tsx` (2 new imports), `prompts.ts` (2 new card instructions)

1. Create `invoice-posting-card.tsx`
   - Interface: `InvoicePostingData` (see data-model.md)
   - States: ready → confirming → posting → posted / failed
   - Uses `useMutation(api.functions.accountingEntries.create)` for posting
   - Confidence score warning when < 0.7
   - isHistorical: show "Posted" badge, no buttons

2. Create `cash-flow-dashboard.tsx`
   - Interface: `CashFlowDashboardData` (see data-model.md)
   - 2x2 metric grid: runway days, burn rate, balance, expense ratio
   - Alert badges with severity colors
   - Forecast period label
   - Read-only card (no mutations)

3. Register both in `index.tsx`
4. Add card emission rules to `prompts.ts` ACTION CARD GENERATION PROTOCOL section

### Phase B: P2 Cards (Compliance Alert + Budget Alert + Rich Panel)

**Files created**: `compliance-alert-card.tsx`, `budget-alert-card.tsx`
**Files modified**: `index.tsx`, `prompts.ts`, `chat-window.tsx`, `message-renderer.tsx`, `rich-content-panel.tsx`

5. Create `compliance-alert-card.tsx`
   - Interface: `ComplianceAlertData` (see data-model.md)
   - Country + authority header with severity badge
   - Requirements list (bullet points)
   - Clickable citation links → reuse existing `setActiveCitation` handler
   - Needs MessageRenderer to pass citation click handler down

6. Create `budget-alert-card.tsx`
   - Interface: `BudgetAlertData` (see data-model.md)
   - Category rows with progress bars (CSS-based)
   - Color coding: green (< 80%), yellow (80-100%), red (> 100%)
   - Overall status badge in header
   - Read-only card

7. Wire rich content panel
   - Add `onViewDetails` callback prop to `ActionCardProps` (registry.ts)
   - In `chat-window.tsx`: manage `richContentData` state, pass callback
   - In `message-renderer.tsx`: forward `onViewDetails` to card components
   - Cards with complex data include a "View Details" button that calls the callback
   - `rich-content-panel.tsx`: receives data and renders (existing code)

### Phase C: P3 Features (Time-Series, Bulk Actions, Export)

**Files created**: `spending-time-series.tsx`, `bulk-action-bar.tsx`, `csv-export.ts`
**Files modified**: `index.tsx`, `prompts.ts`, `message-renderer.tsx`

8. Create `spending-time-series.tsx`
   - Interface: `SpendingTimeSeriesData` (see data-model.md)
   - Vertical bar groups per period with category stacking
   - Trend indicator in header (arrow + percentage)
   - CSS-based (no charting library)

9. Create `bulk-action-bar.tsx`
   - Wrapper component for `message-renderer.tsx` to use when 2+ approval cards present
   - Renders checkboxes on each approval card
   - Floating action bar: "Select All", "Approve Selected (N)", "Reject Selected (N)"
   - Processes mutations sequentially with per-item status updates
   - Partial failure handling: shows success/fail count, retry button

10. Create `csv-export.ts` utility
    - `exportToCSV(filename: string, headers: string[], rows: any[][]): void`
    - Generates CSV string, creates Blob, triggers download
    - Numbers as plain values (no locale formatting)

11. Add export button to `spending-chart.tsx`, `vendor-comparison-card.tsx`, `budget-alert-card.tsx`
    - Small download icon in card header
    - Calls `exportToCSV` with card's data

### Phase D: System Prompt Update + Final Build

12. Update `prompts.ts` with complete ACTION CARD GENERATION PROTOCOL
    - Add rules for all new card types: `invoice_posting`, `cash_flow_dashboard`, `compliance_alert`, `budget_alert`, `spending_time_series`
    - Include data schema examples for each
    - Define trigger keywords for each card type

13. Build verification
    - `npm run build` — must pass with zero errors
    - Manual chat testing for each card type

## Dependencies Between Phases

```
Phase A (P1 cards) → independent, start immediately
Phase B (P2 cards) → depends on Phase A for pattern validation
  └── Rich panel wiring depends on registry.ts change (onViewDetails prop)
Phase C (P3 features) → depends on Phase A + B for base cards
  └── Bulk actions depend on both expense_approval and invoice_posting cards
  └── Export depends on cards having data to export
Phase D (prompt + build) → depends on all cards being registered
```

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| LLM doesn't reliably emit action card JSON | Explicit schema examples in system prompt; test with multiple query phrasings |
| Invoice posting creates duplicate accounting entries | Check `sourceRecordId` uniqueness before creating; show "Already posted" if duplicate |
| Rich content panel positioning conflicts with chat widget | Fixed positioning with z-index layering; hide on mobile viewports |
| Bulk action mutations overwhelm Convex rate limits | Sequential execution (not parallel); configurable batch delay |
| Historical cards lose citation context | Citations persisted in Convex messages table; re-hydrated on load |

## Complexity Tracking

No constitution violations to justify. All implementation follows existing patterns.

# Research: UX/UI Theme Consistency & Layout Shift Prevention

**Feature**: 005-uiux-theme-cls
**Date**: 2026-01-07
**Status**: Complete

## Executive Summary

No blocking unknowns identified. The existing semantic token system in `globals.css` and design documentation in `CLAUDE.md` provide all necessary patterns. This document consolidates conversion rules and best practices for implementation.

---

## Decision 1: Color Conversion Mapping

**Decision**: Use existing semantic token system from `globals.css`

**Rationale**: The codebase already has a comprehensive Layer 1-2-3 semantic design system. Converting hardcoded colors to these tokens ensures automatic light/dark theme adaptation without creating new abstractions.

**Conversion Reference Table**:

| Hardcoded Pattern | Semantic Replacement | Context |
|-------------------|---------------------|---------|
| `bg-gray-700`, `bg-gray-800`, `bg-gray-900` | `bg-card` | Card backgrounds |
| `bg-gray-100`, `bg-gray-200` | `bg-muted` | Muted/disabled backgrounds |
| `bg-white` | `bg-card` or `bg-surface` | White backgrounds |
| `text-white` | `text-primary-foreground` or `text-foreground` | Depends on parent bg |
| `text-black` | `text-foreground` | Dark text |
| `text-gray-400`, `text-gray-500` | `text-muted-foreground` | Secondary text |
| `border-gray-600`, `border-gray-700` | `border-border` | All borders |
| `bg-blue-600`, `bg-blue-700` | `bg-primary` | Primary action backgrounds |
| `bg-green-600`, `bg-green-500` | `bg-action-view` | Success/view actions |
| `hover:bg-gray-600` | `hover:bg-muted` | Hover states |

**Alternatives Considered**:
- Create new token categories → Rejected: Existing system is comprehensive
- Use dark: prefix for all overrides → Rejected: Semantic tokens auto-adapt

---

## Decision 2: Badge Pattern Standardization

**Decision**: Use the documented light/dark mode badge pattern

**Rationale**: Badges need visible but subtle styling that adapts to both themes. The pattern `bg-{color}-500/10 text-{color}-600 dark:text-{color}-400 border border-{color}-500/30` provides consistent appearance without harsh contrasts.

**Badge Status Colors**:

| Status | Classes |
|--------|---------|
| Approved/Success | `bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30` |
| Pending/Warning | `bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30` |
| Rejected/Error | `bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30` |
| Draft/Info | `bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30` |
| Default/Neutral | `bg-muted text-muted-foreground border border-border` |

**Alternatives Considered**:
- Solid colored badges → Rejected: Too harsh, poor readability in dark mode
- Semantic token badges only → Rejected: Status colors need color distinction

---

## Decision 3: Skeleton Loader Implementation

**Decision**: Reuse existing `Skeleton` component with consistent height matching

**Rationale**: A generic Skeleton component already exists at `src/components/ui/skeleton.tsx` that follows semantic design tokens (`bg-muted`). Creating skeleton wrappers for specific content types ensures CLS prevention without new component patterns.

**Skeleton Pattern**:
```tsx
// Reuse existing Skeleton component
import { Skeleton } from '@/components/ui/skeleton'

// Match exact heights of final content
if (isLoading) {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[72px] w-full" />  {/* Match card height */}
      <Skeleton className="h-[72px] w-full" />
    </div>
  )
}
```

**Components Needing Skeletons** (9 identified):
1. `transaction-summary-cards.tsx` - HIGH CLS risk
2. `complete-dashboard.tsx` - HIGH CLS risk
3. `unified-financial-dashboard.tsx` - HIGH CLS risk
4. `invoice-list.tsx` - HIGH CLS risk
5. `expense-claims-list.tsx` (if exists) - HIGH CLS risk
6. `pricing-table.tsx` - MEDIUM CLS risk
7. `chat-interface-client.tsx` - MEDIUM CLS risk
8. `conversation-sidebar.tsx` - MEDIUM CLS risk
9. `currency-converter.tsx` - LOW CLS risk

**Alternatives Considered**:
- Create new skeleton variants per domain → Rejected: Overcomplication, existing component suffices
- Use CSS `min-height` only → Rejected: Doesn't prevent all CLS scenarios

---

## Decision 4: Implementation Sequence

**Decision**: Fix shared UI components first, then domain components by impact

**Rationale**: Shared UI components have maximum blast radius - fixing them propagates improvements across all domains. Domain order follows user journey importance (expense claims → analytics → settings).

**Recommended Sequence**:

1. **Phase A: Shared UI Components (2-3 hours)**
   - `badge.tsx` - Used everywhere for status
   - `button.tsx` - Core interaction element
   - `action-button.tsx` - Domain-specific variant
   - `role-badge.tsx` - User role display
   - `sidebar.tsx` - Notification badge only

2. **Phase B: Expense Claims Domain (3-4 hours)** - Core MVP feature
   - `formatted-expense-report.tsx`
   - `unified-expense-details-modal.tsx`
   - `comprehensive-form-step.tsx`
   - `personal-expense-dashboard.tsx`
   - `expense-approval-dashboard.tsx`
   - `mobile-camera-capture.tsx`
   - `field-suggestion.tsx`
   - `expense-submission-flow.tsx`
   - `processing-step.tsx`
   - `expense-analytics.tsx`
   - `edit-expense-modal-new.tsx`

3. **Phase C: Analytics Domain (2-3 hours)** - First user view
   - `unified-financial-dashboard.tsx`
   - `transaction-summary-cards.tsx`
   - `complete-dashboard.tsx`
   - `FinancialDashboard.tsx`
   - `MetricsOverview.tsx`
   - `PeriodSelector.tsx`
   - `ActionCenter.tsx`

4. **Phase D: Account Management (1-2 hours)** - Settings
   - `category-management.tsx`
   - `business-settings-section.tsx`
   - `business-management-cards.tsx`
   - `invitation-dialog.tsx`
   - `user-profile-section.tsx`
   - `teams-management-client.tsx`

5. **Phase E: Skeleton Loaders (3-4 hours)**
   - Add to 9 identified components with loading states

**Alternatives Considered**:
- Fix by file type (all .tsx together) → Rejected: No domain coherence, harder to test
- Fix all domains in parallel → Rejected: Harder to track progress, no incremental testing

---

## Decision 5: Validation Strategy

**Decision**: Three-tier validation approach

**Rationale**: Combining automated scanning, manual visual testing, and Lighthouse audits ensures comprehensive coverage of theme consistency and CLS prevention.

**Validation Tiers**:

1. **Automated Scan** - Before/after grep for hardcoded patterns
   ```bash
   grep -r "bg-gray-[0-9]" src/
   grep -r "text-white" src/ --include="*.tsx"
   grep -r "border-gray-" src/
   ```

2. **Manual Visual Testing**
   - Toggle light/dark mode on each fixed page
   - Check for: unreadable text, miscolored backgrounds, broken elements
   - Document any third-party exceptions

3. **Lighthouse Audit**
   - Run on core pages: dashboard, expense claims, invoices, settings
   - Verify CLS < 0.1 (Good rating)
   - Verify FCP < 1.8s

**Alternatives Considered**:
- Visual regression testing with Percy → Rejected: Overengineering for one-time fix
- Only manual testing → Rejected: Insufficient coverage, hard to verify 0 patterns remain

---

## Research Gaps Resolved

| Gap | Resolution |
|-----|------------|
| Token availability | ✅ `globals.css` has all needed tokens |
| Skeleton component | ✅ Exists at `src/components/ui/skeleton.tsx` |
| Badge pattern | ✅ Documented in `src/components/ui/CLAUDE.md` |
| Domain priority | ✅ Expense claims > Analytics > Account management |
| Validation method | ✅ Grep scan + Manual visual + Lighthouse |

---

## Files Analyzed

- `src/app/globals.css` - Semantic token definitions (150+ lines)
- `src/components/ui/CLAUDE.md` - Design system documentation
- `src/app/CLAUDE.md` - App-level implementation patterns
- `src/components/ui/skeleton.tsx` - Existing skeleton component
- `.pm/product/uxui-analysis.md` - Detailed issue analysis

## Next Steps

1. Proceed to Phase 1: Generate data-model.md (minimal - no data changes)
2. Generate quickstart.md with conversion examples
3. Run `/speckit.tasks` to generate actionable task list

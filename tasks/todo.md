# User Story 5 (US5) - Mobile Dashboard Experience Implementation Plan

**Goal**: Business owners can scan key financial metrics in under 10 seconds on mobile

**Priority**: P2

**Working Directory**: /home/fei/fei/code/finanseal-cc/mobile-pwa

---

## Implementation Tasks

### Task T046 - Audit Existing Dashboard Mobile Responsiveness
- [ ] Test `unified-financial-dashboard.tsx` at 320px viewport (iPhone SE)
- [ ] Identify hardcoded colors (bg-gray-700, text-white, etc.)
- [ ] Check grid layout: Currently `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5`
- [ ] Document horizontal scrolling issues
- [ ] Verify metrics visibility above the fold on mobile
- [ ] Document findings in audit report section below

**Key File**: `src/domains/analytics/components/unified-financial-dashboard.tsx`

### Task T047 - Convert Dashboard to Semantic Tokens
- [ ] Replace all hardcoded colors with semantic tokens
- [ ] Update grid layout for mobile stacking
- [ ] Ensure no horizontal scrolling on 320px viewport
- [ ] Test light and dark mode rendering

### Task T048 - Create Bottom Navigation Component
- [ ] Create `src/components/ui/bottom-nav.tsx`
- [ ] Fixed position at bottom with 44x44px touch targets
- [ ] Use semantic tokens for all colors
- [ ] Active state with primary color

### Task T049 - Touch-Friendly Chart Tooltips (Conditional)
- [ ] Check if charts exist in dashboard
- [ ] If yes: Implement larger tap targets
- [ ] If no charts: Skip and document

### Task T050 - Integrate Bottom Navigation
- [ ] Add bottom-nav to mobile layout
- [ ] Navigation items: Dashboard, Expenses, Invoices, Settings
- [ ] Add padding-bottom to main content
- [ ] Mobile-only display (block sm:hidden)

### Task T051 - Touch Target Audit
- [ ] Audit all interactive elements
- [ ] Ensure minimum 44x44px for all touchable items
- [ ] Add padding/margin where needed

### Task T052 - Mobile Testing & Documentation
- [ ] Test at 320px, 375px, 390px viewports
- [ ] Verify no horizontal scrolling
- [ ] Run `npm run build`
- [ ] Document findings

---

## Audit Report (T046)

### Issues Found in unified-financial-dashboard.tsx:

1. **Hardcoded Dark Mode Colors** - Extensive use throughout
2. **Grid Layout** - `grid-cols-1 sm:grid-cols-2 lg:grid-cols-5` (works well)
3. **Color-Coded Borders** - Need semantic equivalents
4. **Loading States** - Use `bg-gray-700` instead of `bg-muted`
5. **Hover States** - Use non-existent `bg-gray-750`
6. **Trend Colors** - Hardcoded green/red/gray
7. **No Light Mode Support** - Component designed only for dark mode

---

## Review Section

(To be filled after implementation)

---

## Build Validation

- [ ] `npm run build` passes
- [ ] TypeScript compilation successful
- [ ] Light and dark mode tested

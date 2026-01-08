# US4: Expense Approval on Mobile - Implementation Plan

## Overview
Implement mobile-optimized expense approval workflow for managers with swipe gestures, haptic feedback, and minimal tap count.

**Priority**: P2
**Target**: iPhone SE baseline (320px viewport)
**Design System**: Semantic tokens from src/components/ui/CLAUDE.md

---

## Tasks

### ⬜ T039 [US4] - Audit existing expense approval UI for mobile responsiveness
**Status**: Pending
**File**: src/domains/expense-claims/components/expense-approval-dashboard.tsx

**Audit Checklist**:
- [ ] Check viewport handling at 320px width
- [ ] Identify horizontal scrolling issues
- [ ] Review touch target sizes (must be 44x44px minimum)
- [ ] Document hardcoded colors that need semantic token conversion
- [ ] Test approval card grid layout on mobile
- [ ] Check modal responsiveness for UnifiedExpenseDetailsModal

**Findings**:
- (To be completed during audit)

---

### ⬜ T040 [US4] - Add notification badge for pending approvals
**Status**: Pending
**Files**:
- src/components/ui/header-with-user.tsx
- src/domains/expense-claims/hooks/use-pending-approvals-count.ts (new)

**Implementation**:
- [ ] Create hook: `usePendingApprovalsCount()` to fetch count from API
- [ ] Add badge to header between ThemeToggle and UserButton
- [ ] Use semantic tokens: `bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30`
- [ ] Ensure 44x44px minimum touch target
- [ ] Add loading state and error handling
- [ ] Cache API response with React Query (1 minute staleTime)

**API Endpoint**:
```typescript
GET /api/v1/expense-claims?approver=me&status=submitted
Response: { success: true, data: { claims: [], summary: { pending_approval: number } } }
```

**Design Pattern**:
```tsx
<Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30">
  {count}
</Badge>
```

---

### ⬜ T041 [US4] - Create mobile-optimized approval card layout
**Status**: Pending
**File**: src/domains/expense-claims/components/mobile-approval-card.tsx (new)

**Requirements**:
- [ ] Single column layout for mobile (< 768px)
- [ ] Larger touch targets: 44x44px minimum for all interactive elements
- [ ] Use semantic tokens (no hardcoded colors)
- [ ] Card component from @/components/ui/card
- [ ] Badge component for status indicators
- [ ] Responsive image preview with aspect ratio preservation
- [ ] Collapse/expand details section for space efficiency

**Component Structure**:
```tsx
<Card className="bg-card border-border">
  <CardHeader>
    <Badge>Status</Badge>
    <CardTitle className="text-foreground">{description}</CardTitle>
  </CardHeader>
  <CardContent>
    {/* Receipt preview */}
    {/* Amount display */}
    {/* Vendor/Category */}
    {/* Action buttons: 44x44px minimum */}
  </CardContent>
</Card>
```

---

### ⬜ T042 [US4] - Implement swipe gesture for approve/reject
**Status**: Pending
**File**: src/domains/expense-claims/hooks/use-swipe-gesture.ts (new)

**Requirements**:
- [ ] Left swipe for reject (red indicator)
- [ ] Right swipe for approve (green indicator)
- [ ] Use native touch events (touchstart, touchmove, touchend)
- [ ] Minimum swipe distance: 50px
- [ ] Visual feedback during swipe (color indicator)
- [ ] Snap back animation if swipe cancelled
- [ ] Confirm action after swipe completion
- [ ] Graceful fallback for desktop (no swipe)

**Hook API**:
```typescript
const {
  swipeState,
  handleTouchStart,
  handleTouchMove,
  handleTouchEnd
} = useSwipeGesture({
  onSwipeLeft: () => handleReject(claimId),
  onSwipeRight: () => handleApprove(claimId),
  threshold: 50
})
```

**Visual States**:
- Neutral: bg-card
- Swiping right: bg-green-500/10 (approve indicator)
- Swiping left: bg-red-500/10 (reject indicator)

---

### ⬜ T043 [US4] - Add haptic feedback on approval actions
**Status**: Pending
**File**: src/lib/utils/haptics.ts (new)

**Requirements**:
- [ ] Create haptic utility: `triggerHaptic(pattern: 'success' | 'error')`
- [ ] Approve action: `navigator.vibrate(50)` (single short vibration)
- [ ] Reject action: `navigator.vibrate([50, 50, 50])` (triple vibration)
- [ ] Feature detection: Check if `navigator.vibrate` exists
- [ ] Graceful degradation if API not available
- [ ] No-op on desktop browsers

**Implementation**:
```typescript
export function triggerHaptic(pattern: 'success' | 'error') {
  if (!navigator.vibrate) return

  if (pattern === 'success') {
    navigator.vibrate(50)
  } else if (pattern === 'error') {
    navigator.vibrate([50, 50, 50])
  }
}
```

---

### ⬜ T044 [US4] - Reduce approval flow to maximum 2 taps
**Status**: Pending
**Files**:
- src/domains/expense-claims/components/expense-approval-dashboard.tsx
- src/domains/expense-claims/components/mobile-approval-card.tsx

**Current Flow Analysis**:
- Tap 1: Click "Review" button to open modal
- Tap 2: Click "Approve" or "Reject" in modal
- Tap 3: Confirm action

**Optimized Flow** (2 taps max):
- Tap 1: Click card to expand details inline
- Tap 2: Quick approve/reject button (44x44px)
- OR: Use swipe gesture (0 taps!)

**Implementation**:
- [ ] Add quick action buttons directly on collapsed card
- [ ] Inline expansion instead of modal for mobile
- [ ] Optional: Add "Are you sure?" dialog only for reject
- [ ] Skip confirmation for approve (reduce to 2 taps)

---

### ⬜ T045 [US4] - Test approval flow on iPhone SE (320px)
**Status**: Pending

**Test Cases**:
- [ ] No horizontal scrolling at 320px viewport
- [ ] All touch targets are 44x44px minimum
- [ ] Swipe gestures work smoothly
- [ ] Haptic feedback triggers on actions
- [ ] Badge displays correctly in header
- [ ] Card layout is readable and actionable
- [ ] Images/receipts display properly
- [ ] Text doesn't overflow or truncate inappropriately

**Testing Tools**:
- Chrome DevTools: Device Mode → iPhone SE
- Safari Responsive Design Mode
- Real device testing (if available)

**Acceptance Criteria**:
- Approval flow completes in 2 taps or 1 swipe
- No UI elements smaller than 44x44px
- No horizontal scrolling
- Semantic tokens used throughout (no hardcoded colors)

---

## Design System Compliance

### Semantic Token Usage (MANDATORY)
```typescript
// ✅ Correct
<Card className="bg-card border-border">
<Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30">
<Button variant="primary" className="min-h-[44px] min-w-[44px]">

// ❌ Wrong
<div className="bg-gray-700 text-white border-gray-600">
<span className="bg-green-100 text-green-800">
<button className="h-8 w-8 bg-blue-600">
```

### Touch Target Standards
- Minimum size: 44x44px (iOS Human Interface Guidelines)
- Minimum spacing: 8px between interactive elements
- Use `min-h-[44px] min-w-[44px]` for critical actions

---

## API Endpoints Reference

**Get Pending Approvals**:
```
GET /api/v1/expense-claims?approver=me&status=submitted
```

**Update Claim Status**:
```
PUT /api/v1/expense-claims/{id}
Body: { status: 'approved' | 'rejected', comment?: string }
```

---

## Build Validation
After each task completion:
```bash
npm run build
```

All tasks must pass TypeScript compilation before marking as complete.

---

## Review Section
(To be completed after all tasks are done)

### Changes Summary
- (List all files modified)
- (Key functionality added)
- (Performance improvements)

### Mobile Responsiveness
- (320px viewport results)
- (Touch target compliance)
- (Swipe gesture UX)

### Design System Compliance
- (Semantic token usage)
- (Light/dark mode compatibility)
- (Accessibility standards)

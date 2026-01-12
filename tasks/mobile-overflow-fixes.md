# Mobile Overflow Fixes - Invoice & Expense Claims Components

## Problem Summary
UI overflow issues on small screens (iPhone SE, iPhone 6) in modals and list views:

### Invoice Domain (NEW - Jan 12, 2026)
- **Document Analysis Modal** - 50/50 split layout (`w-1/2`) doesn't work on mobile, content overflows

### Expense Claims Domain

1. **Edit Expense Modal** - Header buttons overflow, 40/60 split doesn't work on mobile
2. **Manager View Modal** - Same split layout issue, approve/reject buttons cut off
3. **Expense Claims List** - Action buttons (Edit, Delete, Submit, Re-extract) overflow horizontally
4. **Line Items Table** - 4-column grid too cramped on mobile

## Plan

### 0. Document Analysis Modal (`document-analysis-modal.tsx`) - Invoice Domain
- [x] Convert 50/50 split to vertical stack on mobile (`flex-col md:flex-row`)
- [x] Change `w-1/2` to `w-full md:w-1/2` for both panes
- [x] Document preview shows first (on top) when stacked

### 1. Edit Expense Modal (`edit-expense-modal-new.tsx`)
- [x] Make header buttons stack/wrap on mobile using `flex-wrap` and responsive gaps
- [x] Convert 40/60 split to vertical stack on mobile (`flex-col md:flex-row`)
- [x] Hide button text on mobile (icons only)

### 2. Unified Expense Details Modal (`unified-expense-details-modal.tsx`)
- [x] Convert 40/60 split to vertical stack on mobile
- [x] Make approve/reject buttons stack vertically on small screens
- [x] Adjust line items to card layout on mobile (vs 4-column grid on desktop)

### 3. Expense Claims List (`personal-expense-dashboard.tsx`)
- [x] Add `flex-wrap gap-2` to action buttons container

### 4. Summary/Top Banner
- [x] Hide secondary info on mobile (progress indicator, etc.)
- [x] Stack key info with flex-wrap on mobile

## Implementation Order
1. Fix action buttons wrapping (quickest win)
2. Fix modal split layouts
3. Adjust line items grid
4. Polish header buttons

## Review

### Completed: Document Analysis Modal (Jan 12, 2026)

**File Modified:** `src/domains/invoices/components/document-analysis-modal.tsx`

**Changes Made:**
1. Line 863: Changed main container from `flex` to `flex flex-col md:flex-row` - stacks vertically on mobile, side-by-side on desktop
2. Line 865: Changed left pane from `w-1/2 border-r` to `w-full md:w-1/2 md:border-r` - full width on mobile
3. Line 1061: Changed right pane from `w-1/2` to `w-full md:w-1/2` - full width on mobile
4. Added `overflow-y-auto md:overflow-hidden` to container for proper mobile scrolling
5. Added `shrink-0` to left pane to prevent compression when stacked

**Result:** On iPhone SE/6 and similar small screens, the document preview now appears on top with the extracted data below, instead of cramped side-by-side layout.

### Completed: Expense Claims Fixes (Jan 12, 2026)

**Files Modified:**

1. **`edit-expense-modal-new.tsx`**
   - Header buttons: Changed `space-x-2` to `flex-wrap gap-2`, button text hidden on mobile with `hidden md:inline`
   - Top banner: Changed to `flex-col md:flex-row` with `flex-wrap` for key info
   - Split layout: Changed from `w-2/5`/`w-3/5` to `w-full md:w-2/5`/`w-full md:w-3/5`, stacks on mobile
   - Progress indicator hidden on mobile

2. **`unified-expense-details-modal.tsx`**
   - Top banner: Same responsive changes as above
   - Split layout: Changed to stack vertically on mobile
   - Approve/Reject buttons: Changed to `flex-col sm:flex-row` - stack on small screens
   - Line items: Mobile shows card layout with description + total, desktop shows 4-column grid

3. **`personal-expense-dashboard.tsx`**
   - Action buttons: Changed from `space-x-2` to `flex-wrap gap-2` - allows buttons to wrap to next line

**Result:** All modals now stack content vertically on mobile instead of side-by-side. Action buttons wrap to new lines when needed.

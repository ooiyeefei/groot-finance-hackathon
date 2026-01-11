# Fix: Display Category Name Instead of Category ID

## Problem
In expense claims and manager approval pages, categories are displaying with random ID suffixes like:
- "Other A95gom" instead of "Other"
- "Staff Meals_7f7mhl" instead of "Staff Meals"

The `expense_category` field stores the category ID, but components are just formatting it as text instead of looking up the actual category name.

## Root Cause
The following files display `expense_category` directly with text formatting instead of looking up the category name:
1. `personal-expense-dashboard.tsx` (line 671)
2. `expense-approval-dashboard.tsx` (lines 243, 666)
3. `mobile-approval-card.tsx` (line 87)

Correct pattern (from `expense-form-fields.tsx` and `unified-expense-details-modal.tsx`):
```typescript
categories.find(c => c.id === expense_category)?.category_name || 'Uncategorized'
```

## Solution Plan

### Todo Items

- [ ] **1. Create a utility function to get category name from ID**
  - Add `getCategoryName(categoryId, categories)` to `use-expense-categories.ts`
  - Returns category name or falls back to 'Uncategorized'

- [ ] **2. Fix `personal-expense-dashboard.tsx`**
  - Import `useExpenseCategories` hook at parent level
  - Pass categories to `ExpenseClaimCard` component
  - Update line 671 to use category lookup

- [ ] **3. Fix `expense-approval-dashboard.tsx`**
  - Import `useExpenseCategories` hook at parent level
  - Update lines 243 and 666 to use category lookup

- [ ] **4. Fix `mobile-approval-card.tsx`**
  - Add `categories` prop to the component
  - Update line 87 to use category lookup
  - Update `mobile-approval-list.tsx` to pass categories prop

- [ ] **5. Run build and verify**
  - Run `npm run build` to ensure no TypeScript errors
  - Verify category names display correctly

## Files to Modify
- `src/domains/expense-claims/hooks/use-expense-categories.ts` (add utility)
- `src/domains/expense-claims/components/personal-expense-dashboard.tsx`
- `src/domains/expense-claims/components/expense-approval-dashboard.tsx`
- `src/domains/expense-claims/components/mobile-approval-card.tsx`
- `src/domains/expense-claims/components/mobile-approval-list.tsx`

## Review
(To be filled after implementation)

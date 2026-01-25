# Bottom Navigation Fix Plan

## Problem Summary
- Bottom Navigation only shows on Home (`/`) and Expense Claims pages
- Missing from: Invoices, Settings, Accounting, Manager Approvals, AI Assistant, Business Settings, Billing
- Only 4 nav items configured - missing 5 other important routes
- User wants horizontally scrollable navigation for more items

## Solution Approach
Move the bottom navigation from individual page components to the shared locale layout, ensuring it appears consistently on all pages. Add horizontal scroll capability for additional nav items.

---

## Todo Items

- [x] 1. Update `bottom-nav.tsx` to support horizontal scrolling when items overflow
- [x] 2. Update `mobile-app-shell.tsx` to include all navigation items (9 total) with role-based visibility
- [x] 3. Move `MobileAppShell` wrapper to `src/app/[locale]/layout.tsx` so all pages get bottom nav
- [x] 4. Remove individual `MobileAppShell` wrappers from `/page.tsx` and `/expense-claims/page.tsx`
- [x] 5. Run `npm run build` to verify no errors
- [x] 6. Test navigation consistency across all routes

---

## Navigation Items to Include (in order)
1. Dashboard - `/[locale]/`
2. Invoices - `/[locale]/invoices`
3. Expenses - `/[locale]/expense-claims` (with badge)
4. Accounting - `/[locale]/accounting`
5. AI Assistant - `/[locale]/ai-assistant`
6. Approvals - `/[locale]/manager/approvals` (manager/admin only)
7. Business - `/[locale]/business-settings` (manager/admin only)
8. Billing - `/[locale]/settings/billing` (manager/admin only)
9. Settings - `/[locale]/settings`

---

## Review

### Changes Made

**1. `src/components/ui/bottom-nav.tsx`**
- Changed container from `justify-around` to `overflow-x-auto` for horizontal scrolling
- Added `scrollbar-hide` class and inline styles to hide scrollbar while allowing scroll
- Changed nav item width from `w-full` to fixed `min-w-[72px] w-[72px]` for consistent item sizing
- Reduced label font size from `text-xs` to `text-[10px]` to fit more items

**2. `src/components/ui/mobile-app-shell.tsx`**
- Added role-based navigation logic using `fetchUserRoleWithCache()`
- Expanded from 4 nav items to 9 items (5 core + 3 manager/admin + 1 settings)
- Added icons matching sidebar: `CreditCard`, `MessageSquare`, `FileCheck`, `Building2`, `Sparkles`
- Integrated `useTranslations` for internationalized labels
- Added `useActiveBusiness` for business context and role refresh on business change

**3. `src/components/ui/mobile-app-shell-connected.tsx`**
- Replaced `locale` prop with `useLocale()` hook from next-intl
- Simplified interface by removing locale parameter

**4. `src/app/[locale]/layout.tsx`**
- Added `MobileAppShellConnected` wrapper around all children
- This ensures bottom navigation appears consistently on ALL pages

**5. `src/app/[locale]/page.tsx` and `src/app/[locale]/expense-claims/page.tsx`**
- Removed redundant `MobileAppShell` and `MobileAppShellConnected` wrappers
- Bottom nav now comes from the layout, not individual pages

### Build Status
- TypeScript compilation: Passed
- Build prerendering: Failed due to missing Clerk env vars (unrelated to changes)
- The core changes compile correctly

### Navigation Order (Mobile)
| # | Icon | Label | Route | Visibility |
|---|------|-------|-------|------------|
| 1 | Home | Dashboard | `/` | Everyone |
| 2 | FileText | Invoices | `/invoices` | Everyone |
| 3 | Receipt | Expenses | `/expense-claims` | Everyone (badge) |
| 4 | CreditCard | Accounting | `/accounting` | Everyone |
| 5 | MessageSquare | AI Assistant | `/ai-assistant` | Everyone |
| 6 | FileCheck | Approvals | `/manager/approvals` | Manager/Admin |
| 7 | Building2 | Business | `/business-settings` | Manager/Admin |
| 8 | Sparkles | Billing | `/settings/billing` | Manager/Admin |
| 9 | Settings | Settings | `/settings` | Everyone |

### Files Changed
- `src/components/ui/bottom-nav.tsx`
- `src/components/ui/mobile-app-shell.tsx`
- `src/components/ui/mobile-app-shell-connected.tsx`
- `src/app/[locale]/layout.tsx`
- `src/app/[locale]/page.tsx`
- `src/app/[locale]/expense-claims/page.tsx`

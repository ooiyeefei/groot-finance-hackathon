# Phase 1: Plan System Updates - Tasks T001-T005

**Status:** ✅ COMPLETED
**Date:** 2025-01-29
**Build Status:** Not validated yet (T006 pending)

---

## Task Completion Status

- [x] T001: Update PLANS constant in `src/lib/stripe/plans.ts`
- [x] T002: Add helper functions in same file
- [x] T003: Update getPlanFromPriceId() in same file
- [x] T004: Add env var placeholders
- [x] T005: Update free plan references

---

## Implementation Details

### T001: PLANS Constant Update
**File**: `src/lib/stripe/plans.ts`

**Changes Made**:
- ✅ Removed 'free' tier completely
- ✅ Added 'trial' tier with:
  - name: 'trial'
  - displayName: '14-Day Free Trial'
  - priceId: null
  - teamLimit: 3
  - ocrLimit: 100
  - features: ['Full Pro features for 14 days', 'No credit card required', '3 team members', '100 OCR scans/month']

- ✅ Added 'starter' tier with:
  - name: 'starter'
  - displayName: 'Starter'
  - priceId: process.env.STRIPE_STARTER_PRICE_ID ?? null
  - teamLimit: 3
  - ocrLimit: 50
  - features: ['Full data access', 'Basic reports', '50 OCR scans/month', '3 team members', 'Email support']

- ✅ Updated 'pro' tier:
  - Added teamLimit: 13
  - Added displayName: 'Pro'
  - Updated features to reference 'Starter' instead of 'Free'

- ✅ Updated 'enterprise' tier:
  - Added teamLimit: -1 (unlimited)
  - Added displayName: 'Enterprise'

- ✅ Removed hardcoded 'price' and 'currency' fields
- ✅ Added 'displayName' field to all tiers

### T002: Helper Functions
**File**: `src/lib/stripe/plans.ts`

**Added Functions**:
```typescript
export function getTeamLimit(planName: PlanName): number
export function canAddTeamMember(planName: PlanName, currentCount: number): boolean
```

### T003: Update getPlanFromPriceId()
**File**: `src/lib/stripe/plans.ts`

**Changes Made**:
- ✅ Added 'starter' mapping: `if (priceId === process.env.STRIPE_STARTER_PRICE_ID) return 'starter'`
- ✅ Changed default return from 'free' to 'trial'
- ✅ Updated getPaidPlans() to include 'starter' as first paid tier

### T004: Environment Variables
**File**: `.env.example`

**Changes Made**:
- ✅ Added `STRIPE_STARTER_PRICE_ID=price_xxx` to Product Price IDs section

### T005: Free Plan Reference Updates

**Files Updated**:

1. **`src/lib/stripe/webhook-handlers.ts`** (3 changes):
   - Line 118: Changed `plan_name: 'free'` to `plan_name: 'trial'`
   - Line 128: Changed "free plan" to "trial plan" in log message
   - Line 243: Changed default fallback from `'free'` to `'trial'`

2. **`src/domains/billing/components/pricing-table.tsx`** (7 changes):
   - Line 28: Changed default plan from `'free'` to `'trial'`
   - Line 30: Changed `PLANS.free` to `PLANS.trial` in allPlans array
   - Line 35: Changed `planName === 'free'` to `planName === 'trial'`
   - Line 43: Updated planOrder array to `['trial', 'starter', 'pro', 'enterprise']`
   - Line 82: Changed `plan.name` to `plan.displayName` for title display
   - Lines 84-88: Updated plan descriptions (added 'starter' case)
   - Line 95: Updated price display logic
   - Lines 116-118: Changed `name === 'free'` to `name === 'trial'`
   - Line 135: Changed button text to use `plan.displayName`

3. **`src/domains/billing/components/subscription-card.tsx`** (3 changes):
   - Line 50: Changed `isFreePlan` to `isTrialPlan` variable name
   - Line 56: Updated badge styling function
   - Line 77: Changed display text for trial plan
   - Line 122: Changed comment from "free users" to "trial users"

4. **`src/app/[locale]/settings/billing/page.tsx`** (1 change):
   - Line 318: Changed `data.plan.name === 'free'` to `data.plan.name === 'trial'`

---

## Files Modified (Total: 6)

1. `/home/fei/fei/code/finanseal-cc/onboarding-flow/src/lib/stripe/plans.ts`
2. `/home/fei/fei/code/finanseal-cc/onboarding-flow/.env.example`
3. `/home/fei/fei/code/finanseal-cc/onboarding-flow/src/lib/stripe/webhook-handlers.ts`
4. `/home/fei/fei/code/finanseal-cc/onboarding-flow/src/domains/billing/components/pricing-table.tsx`
5. `/home/fei/fei/code/finanseal-cc/onboarding-flow/src/domains/billing/components/subscription-card.tsx`
6. `/home/fei/fei/code/finanseal-cc/onboarding-flow/src/app/[locale]/settings/billing/page.tsx`

---

## Important Notes

### Type Safety
- The `PlanName` type is automatically updated since it's derived from `keyof typeof PLANS`
- All references to plan names are type-safe thanks to TypeScript

### Pricing Display
- Removed hardcoded `price` and `currency` fields from PLANS constant
- UI components now show placeholder text for paid plans
- **TODO (Future)**: Implement dynamic pricing from Stripe API

### Team Limits
- Trial: 3 members
- Starter: 3 members
- Pro: 13 members
- Enterprise: -1 (unlimited)

### OCR Limits
- Trial: 100 scans/month
- Starter: 50 scans/month
- Pro: 100 scans/month
- Enterprise: -1 (unlimited)

---

## Review Summary

All tasks T001-T005 completed successfully. The plan system has been updated to:
1. Remove the 'free' tier and replace it with 'trial'
2. Add a new 'starter' tier as the entry-level paid plan
3. Add team limits to all tiers
4. Remove hardcoded pricing information
5. Add displayName field for better UI presentation
6. Update all references throughout the codebase

The changes maintain type safety, follow existing code patterns, and use semantic design tokens consistently.

**Build Status**: Not run (per instructions - T006 will handle build validation)

# Quickstart: In-App Referral Code System

**Branch**: `001-in-app-referral-code`
**Date**: 2026-03-07

## Prerequisites

- Access to Groot Finance codebase (`groot-finance` repo)
- Convex dev environment (`npx convex dev`)
- Stripe test mode API keys (existing in `.env.local`)
- Clerk dev instance (existing)

## Implementation Order

### Step 1: Convex Schema + Functions (Backend)
1. Add `referral_codes` and `referrals` tables to `convex/schema.ts`
2. Add referral fields to `businesses` table
3. Create `convex/functions/referral.ts` with queries, mutations, actions
4. Deploy: `npx convex dev` (auto-syncs in dev)

### Step 2: Stripe Integration
1. Create referral coupon in Stripe (RM 100 off annual plans)
2. Implement `createStripePromotionCode` action
3. Modify checkout route: add `allow_promotion_codes: true`
4. Extend webhook handler: extract promo code from checkout session

### Step 3: Referral Page UI
1. Create `src/domains/referral/` domain
2. Build referral dashboard component (code display, stats, referral list)
3. Add "Earn $" header icon in `header-with-user.tsx`
4. Create referral page route

### Step 4: Sign-Up + Checkout Integration
1. Capture `?ref=` param on sign-up page, persist to localStorage
2. Auto-apply referral code at checkout
3. Show "Referred by [Name]" badge on sign-up page
4. Add "Have a referral code?" field at checkout

### Step 5: Status Tracking
1. Extend subscription webhook handlers to update referral status
2. Add attribution expiry check (90-day window)
3. Earnings calculation on status change

## Key Files

| Component | Path |
|-----------|------|
| Convex schema | `convex/schema.ts` |
| Referral functions | `convex/functions/referral.ts` |
| Referral domain | `src/domains/referral/` |
| Header component | `src/components/ui/header-with-user.tsx` |
| Checkout route | `src/app/api/v1/billing/checkout/route.ts` |
| Webhook handlers | `src/lib/stripe/webhook-handlers-convex.ts` |
| Sign-up page | `src/app/sign-up/` |
| Settings tabs | `src/domains/account-management/components/tabbed-business-settings.tsx` |

## Testing

1. **Opt-in flow**: Log in → tap "Earn $" → tap "Start Referring" → verify code generated
2. **Share flow**: Copy code → verify clipboard. Tap Share → verify native share sheet
3. **Checkout attribution**: Use referral code at checkout → verify RM 100 discount → verify referral record created
4. **Status tracking**: Referred business subscribes → verify referrer dashboard updates in real-time
5. **Self-referral**: Try using own code → verify rejection
6. **Invalid code**: Enter invalid code at checkout → verify error message

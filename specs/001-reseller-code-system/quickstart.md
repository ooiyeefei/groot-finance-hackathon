# Quickstart: Reseller Code System

## What Changes

3 files modified (backend + frontend utils + components). No new files, no schema changes.

## Implementation Order

1. **Backend** — `convex/functions/referral.ts`: Update `updateReferralStatus` to look up code type and branch commission (RM 300/800 for reseller vs RM 80/200 for customer)
2. **Frontend util** — `src/domains/referral/lib/referral-utils.ts`: Add `codeType` param to `calculateEarning()`, add `getCommissionRange()` helper, update share message
3. **Frontend components** — Update 3 components to read `code.type` and display dynamic amounts:
   - `referral-code-display.tsx`: discount amount
   - `referral-list.tsx`: empty state copy
   - `referral-dashboard.tsx`: pass codeType to children
4. **Deploy** — `npx convex deploy --yes`
5. **Manual test** — Create a test reseller code in Convex dashboard, verify dashboard shows reseller rates

## Manual Reseller Onboarding (Admin Checklist)

1. **Stripe** (one-time): Create coupon `reseller-rm200-off` — RM 200 off, percentage or fixed, applicable to annual plans
2. **Stripe** (per reseller): Create Promotion Code with code `GR-RES-XXXXX`, link to the reseller coupon
3. **Convex**: Insert into `referral_codes`:
   ```
   code: "GR-RES-XXXXX"
   userId: "<reseller's Clerk user ID>"
   businessId: "<reseller's business ID>"
   stripePromotionCodeId: "<from step 2>"
   stripeCouponId: "<coupon ID>"
   type: "partner_reseller"
   isActive: true
   totalReferrals: 0
   totalConversions: 0
   totalEarnings: 0
   createdAt: Date.now()
   ```
4. **Verify**: Reseller logs in → Referral page shows GR-RES-* code with RM 300/800 rates

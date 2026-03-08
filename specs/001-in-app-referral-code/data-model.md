# Data Model: In-App Referral Code System

**Branch**: `001-in-app-referral-code`
**Date**: 2026-03-07

## New Tables

### `referral_codes`

Stores one referral code per user. Created on opt-in.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| code | string | Yes | Unique referral code, e.g., `GR-FIN-3AR5M` |
| userId | string | Yes | Clerk user ID of code owner |
| businessId | Id<"businesses"> | Yes | Business the user belonged to at code creation time |
| stripePromotionCodeId | string | No | Stripe Promotion Code ID (set after sync) |
| stripeCouponId | string | No | Stripe Coupon ID used for the promotion code |
| type | string | Yes | `"customer"` \| `"partner_referrer"` \| `"partner_reseller"` |
| isActive | boolean | Yes | Whether code can be used (default: true) |
| totalReferrals | number | Yes | Count of businesses that signed up with this code |
| totalConversions | number | Yes | Count of businesses that became paying subscribers |
| totalEarnings | number | Yes | Estimated earnings in MYR (calculated) |
| createdAt | number | Yes | Unix timestamp (ms) |

**Indexes**:
- `by_code` → `["code"]` (unique lookup for validation)
- `by_userId` → `["userId"]` (one code per user)
- `by_businessId` → `["businessId"]` (list all referrers in a business)
- `by_stripePromotionCodeId` → `["stripePromotionCodeId"]` (webhook lookup)

### `referrals`

Tracks each referral relationship and its lifecycle.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| referralCodeId | Id<"referral_codes"> | Yes | Reference to the code used |
| referralCode | string | Yes | The code string (denormalized for display) |
| referrerUserId | string | Yes | Clerk user ID of referrer |
| referrerBusinessId | Id<"businesses"> | Yes | Business of referrer |
| referredBusinessId | Id<"businesses"> | No | Business that was referred (set after business creation) |
| referredBusinessName | string | No | Display name (denormalized) |
| status | string | Yes | `"signed_up"` \| `"trial"` \| `"paid"` \| `"upgraded"` \| `"downgraded"` \| `"churned"` \| `"cancelled"` \| `"expired"` |
| capturedAt | number | Yes | When the referral code was first captured (ms) |
| convertedAt | number | No | When first payment was made (ms) |
| planAtConversion | string | No | `"starter"` \| `"pro"` \| `"enterprise"` |
| currentPlan | string | No | Current plan (may differ from conversion plan after upgrade/downgrade) |
| estimatedEarning | number | No | MYR amount based on plan (80/200/500) |
| attributionExpiresAt | number | Yes | capturedAt + 90 days (ms) — no credit if conversion after this |
| createdAt | number | Yes | Unix timestamp (ms) |
| updatedAt | number | Yes | Unix timestamp (ms) |

**Indexes**:
- `by_referralCodeId` → `["referralCodeId"]` (list referrals for a code)
- `by_referrerUserId` → `["referrerUserId"]` (dashboard: my referrals)
- `by_referredBusinessId` → `["referredBusinessId"]` (lookup by referred business)
- `by_status` → `["status"]` (filter by status for reporting)

## Modified Tables

### `businesses` (existing — add fields)

| New Field | Type | Required | Description |
|-----------|------|----------|-------------|
| referredByCode | string | No | Referral code used during signup |
| referredByUserId | string | No | Clerk user ID of the referrer |
| referredByBusinessId | Id<"businesses"> | No | Business of the referrer |
| referralCapturedAt | number | No | When the referral code was first captured (ms) |

## State Transitions

```
Referral Status Lifecycle:

  signed_up ──→ trial ──→ paid ──→ upgraded
                  │         │         │
                  │         ▼         ▼
                  │      downgraded  (stays upgraded)
                  │         │
                  ▼         ▼
               churned   churned
                  │         │
                  ▼         ▼
              cancelled  cancelled

  (any state) ──→ expired  (if 90-day window lapses before payment)
```

**Transition triggers**:
- `signed_up` → `trial`: Business created + trial started
- `trial` → `paid`: First successful payment (invoice.payment_succeeded)
- `paid` → `upgraded`: Plan changed to higher tier within 12 months
- `paid` → `downgraded`: Plan changed to lower tier
- `trial`/`paid`/`upgraded` → `churned`: Subscription cancelled
- `churned` → `cancelled`: Subscription fully terminated
- `signed_up`/`trial` → `expired`: 90-day attribution window passed without payment

## Earning Calculation

| Referred Plan | Referrer Earning | Upgrade Bonus (Starter→Pro) |
|---------------|-----------------|----------------------------|
| Starter (annual) | RM 80 | — |
| Pro (annual) | RM 200 | +RM 120 |
| Enterprise | RM 500 | — |
| Monthly (any) | RM 0 (tracked but not commissionable) | — |

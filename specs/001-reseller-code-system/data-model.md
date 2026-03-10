# Data Model: Reseller Code System

**Date**: 2026-03-10

## Existing Entities (No Changes)

### referral_codes (existing — no schema change)

| Field | Type | Notes |
|-------|------|-------|
| code | string | `GR-FIN-*` for customer, `GR-RES-*` for reseller |
| userId | string | Clerk user ID of code owner |
| businessId | Id<"businesses"> | Business at time of creation |
| stripePromotionCodeId | string? | Stripe promo code ID |
| stripeCouponId | string? | Stripe coupon ID |
| **type** | `"customer" \| "partner_referrer" \| "partner_reseller"` | **Branching field** — drives commission tier + dashboard messaging |
| isActive | boolean | Can be deactivated by admin |
| totalReferrals | number | Denormalized counter |
| totalConversions | number | Denormalized counter |
| totalEarnings | number | Denormalized sum |
| createdAt | number | Timestamp |

**Indexes**: by_code, by_userId, by_businessId, by_stripePromotionCodeId

### referrals (existing — no schema change)

| Field | Type | Notes |
|-------|------|-------|
| referralCodeId | Id<"referral_codes"> | Links to referrer's code |
| referralCode | string | Denormalized code string |
| referrerUserId | string | Clerk user ID |
| referrerBusinessId | Id<"businesses"> | Referrer's business |
| referredBusinessId | Id<"businesses">? | Referred business (set after sign-up) |
| referredBusinessName | string? | Display name |
| status | union of 8 statuses | signed_up → trial → paid/churned/etc. |
| **estimatedEarning** | number? | **Set based on referrer's code type**: customer=80/200, reseller=300/800 |
| capturedAt | number | First-touch timestamp |
| convertedAt | number? | When status first became "paid" |
| planAtConversion | string? | "starter" or "pro" |
| currentPlan | string? | Current plan (may differ from conversion) |
| attributionExpiresAt | number | 90-day window |

## Commission Tier Business Rule

Not stored — derived from code type + plan:

| Code Type | Plan | Commission |
|-----------|------|------------|
| customer | starter | RM 80 |
| customer | pro | RM 200 |
| partner_reseller | starter | RM 300 |
| partner_reseller | pro | RM 800 |
| any | monthly | RM 0 |

## Stripe Entities (External)

| Entity | Customer Referral | Reseller Referral |
|--------|------------------|-------------------|
| Coupon | `referral-rm100-off` (RM 100) | `reseller-rm200-off` (RM 200) — admin creates once |
| Promotion Code | Auto-generated per user | Admin creates manually per reseller |
| Code format | `GR-FIN-XXXXX` | `GR-RES-XXXXX` (admin chosen) |

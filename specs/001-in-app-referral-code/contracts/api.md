# API Contracts: In-App Referral Code System

**Branch**: `001-in-app-referral-code`
**Date**: 2026-03-07

## Convex Functions

### Queries

#### `referral.getMyCode`
Get the current user's referral code (if opted in).

**Auth**: Authenticated user (any role)
**Input**: None (uses auth context)
**Output**:
```typescript
{
  code: string;              // "GR-FIN-3AR5M"
  referralUrl: string;       // "https://finance.hellogroot.com/sign-up?ref=GR-FIN-3AR5M"
  type: "customer" | "partner_referrer" | "partner_reseller";
  isActive: boolean;
  totalReferrals: number;
  totalConversions: number;
  totalEarnings: number;
  createdAt: number;
} | null                     // null if not opted in
```

#### `referral.getMyReferrals`
Get list of businesses referred by the current user.

**Auth**: Authenticated user (any role)
**Input**: None (uses auth context)
**Output**:
```typescript
Array<{
  _id: Id<"referrals">;
  referredBusinessName: string | null;
  status: "signed_up" | "trial" | "paid" | "upgraded" | "downgraded" | "churned" | "cancelled" | "expired";
  capturedAt: number;
  convertedAt: number | null;
  currentPlan: string | null;
  estimatedEarning: number | null;
}>
```

#### `referral.getStats`
Get aggregated referral stats for the current user.

**Auth**: Authenticated user (any role)
**Input**: None
**Output**:
```typescript
{
  totalReferrals: number;
  inTrial: number;
  paying: number;
  churned: number;
  totalEstimatedEarnings: number;  // MYR
}
```

#### `referral.validateCode`
Validate a referral code (for checkout/sign-up).

**Auth**: Public (no auth required — used during sign-up)
**Input**: `{ code: string }`
**Output**:
```typescript
{
  valid: boolean;
  referrerName: string | null;    // Business name for "Referred by X" badge
  error: string | null;           // "Invalid code" | "Code expired" | "Self-referral not allowed"
}
```

### Mutations

#### `referral.optIn`
Opt in to the referral program and generate a code.

**Auth**: Authenticated user (any role)
**Input**: None (uses auth context)
**Output**: `{ code: string; referralUrl: string }`
**Side effects**:
- Creates `referral_codes` record
- Triggers Stripe Promotion Code creation (via action)

#### `referral.captureReferral`
Record that a referral code was used during sign-up (before checkout).

**Auth**: Authenticated user
**Input**: `{ code: string }`
**Output**: `{ success: boolean }`
**Side effects**:
- Creates `referrals` record with status "signed_up"
- Updates `businesses` table with `referredByCode`, `referredByUserId`, `referredByBusinessId`
- Validates attribution window (90 days), self-referral check

### Internal Mutations (backend-only)

#### `referral.updateReferralStatus`
Update referral status based on subscription events.

**Auth**: Internal only (called from webhook handler)
**Input**:
```typescript
{
  referredBusinessId: Id<"businesses">;
  newStatus: "trial" | "paid" | "upgraded" | "downgraded" | "churned" | "cancelled";
  planName?: string;
}
```
**Side effects**:
- Updates `referrals` record status
- Calculates and updates `estimatedEarning`
- Updates `referral_codes` aggregate counts

### Actions (external API calls)

#### `referral.createStripePromotionCode`
Create a Stripe Promotion Code for a referral code.

**Auth**: Internal action
**Input**: `{ referralCodeId: Id<"referral_codes">; code: string }`
**Side effects**:
- Creates Stripe Coupon (if not exists): RM 100 off, fixed amount, once, annual only
- Creates Stripe Promotion Code with `code` on that coupon
- Updates `referral_codes` record with `stripePromotionCodeId`

## API Routes (Next.js)

### `POST /api/v1/referral/validate`
Public endpoint to validate referral code during sign-up.

**Auth**: None (rate-limited: 10 requests/min per IP)
**Input**: `{ code: string }`
**Output**: `{ valid: boolean; referrerName?: string; error?: string }`

## Modified Endpoints

### `POST /api/v1/billing/checkout` (existing)
**Change**: Add `allow_promotion_codes: true` to Stripe checkout session creation.

### Stripe Webhook Handler (existing)
**Change**: In `checkout.session.completed` handler, extract promotion code from session and call `referral.updateReferralStatus` to record attribution.

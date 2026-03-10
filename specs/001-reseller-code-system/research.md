# Research: Reseller Code System

**Date**: 2026-03-10

## Decision 1: Schema Approach

**Decision**: Extend existing `referral_codes` table — no new tables needed.

**Rationale**: The `type` field already supports `"customer"`, `"partner_referrer"`, and `"partner_reseller"`. The `referrals` table stores `estimatedEarning` per record, which `getStats` sums. No migration needed.

**Alternatives considered**:
- Separate `reseller_codes` table → Rejected: duplicates logic, same dashboard, same attribution flow.
- Config table for commission tiers → Rejected: over-engineering for 2 tiers; hardcoded branching is simpler.

## Decision 2: Commission Calculation Branching

**Decision**: Add `codeType` parameter to both `calculateEarning()` (frontend util) and the inline earning calculation in `updateReferralStatus` (Convex mutation). Look up the referral code's `type` field when calculating.

**Rationale**: Commission is calculated in two places:
1. `convex/functions/referral.ts` line ~358: `const earning = args.planName === "pro" ? 200 : 80;` — this is the authoritative calculation on conversion.
2. `src/domains/referral/lib/referral-utils.ts` line ~46: `calculateEarning()` — used for frontend display/estimation.

Both must branch on code type to show correct rates.

**Alternatives considered**:
- Single source of truth in Convex only → Rejected: frontend needs to display commission rates without a round-trip.
- Lookup table in Convex → Rejected: only 2 tiers, a simple conditional is clearer.

## Decision 3: Dashboard Messaging

**Decision**: Pass `codeType` from the referral code query to dashboard components. Components conditionally render amounts based on type.

**Rationale**: The `useMyReferralCode()` hook already returns the full code object. The `type` field is available — components just need to read it and branch.

**Files with hardcoded RM amounts** (all need updates):

| File | Current Value | Change |
|------|--------------|--------|
| `referral-utils.ts:46-50` | RM 80/200 | Branch on codeType: customer=80/200, reseller=300/800 |
| `referral-utils.ts:67` | "RM 100 off" | Branch: customer="RM 100 off", reseller="RM 200 off" |
| `referral-code-display.tsx:77` | "RM 100 off" | Read codeType, show "RM 200 off" for resellers |
| `referral-list.tsx:23` | "RM 80 (Starter) or RM 200 (Pro)" | Branch on codeType |
| `referral-opt-in.tsx:34` | "RM 80 – 200" | Branch on codeType (note: opt-in may be bypassed for resellers) |

## Decision 4: Stripe Manual Onboarding Process

**Decision**: Document manual admin steps. No automation in this iteration.

**Rationale**: < 50 resellers expected. Manual process:
1. Create Stripe Coupon `reseller-rm200-off` (RM 200 off, once, annual only) — one-time setup
2. Per reseller: Create Stripe Promotion Code with `GR-RES-*` code linked to that coupon
3. Insert Convex record: `referral_codes` with `type: "partner_reseller"`, the code, and the Stripe promo code ID

**Alternatives considered**:
- Admin dashboard UI → Rejected: out of scope, < 50 resellers.
- Convex internal mutation for onboarding → Could be useful later but manual DB insert is fine for now.

## Decision 5: Code Generation for Resellers

**Decision**: Reseller codes are NOT auto-generated. Admin manually chooses the GR-RES-* code string.

**Rationale**: Resellers may want branded codes (e.g., `GR-RES-TECHCO`). Auto-generation from userId is a customer-code pattern. Manual allows flexibility.

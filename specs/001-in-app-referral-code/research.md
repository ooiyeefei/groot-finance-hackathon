# Research: In-App Referral Code System

**Date**: 2026-03-07
**Branch**: `001-in-app-referral-code`

## 1. Stripe Promotion Codes API

**Decision**: Use Stripe Promotion Codes with a fixed-amount coupon (RM 100 off) for referral attribution and referee discount.

**Rationale**: Stripe Promotion Codes are the native mechanism for applying discounts at checkout via `allow_promotion_codes: true`. Each referral code maps 1:1 to a Stripe Promotion Code on a shared coupon. This gives us:
- Automatic discount application at checkout
- Attribution via `checkout.session.completed` webhook (promotion code ID in session)
- No custom discount logic needed — Stripe handles billing math

**How it works**:
1. Create one Stripe Coupon: `referral-rm100-off` — fixed RM 100 off, applies once, annual plans only
2. For each user opt-in, create a Stripe Promotion Code on that coupon with `code: "GR-FIN-XXXXX"`
3. Set `allow_promotion_codes: true` on checkout session
4. Webhook reads `session.total_details.breakdown.discounts[0].discount.promotion_code` to get the promo code ID
5. Look up referral_codes table by `stripePromotionCodeId` to find the referrer

**Alternatives considered**:
- Custom metadata-only tracking (no Stripe discount): Rejected — user confirmed RM 100 off for referee
- Stripe Coupons without Promotion Codes: Rejected — coupons can't be entered as text codes at checkout

## 2. Clerk User ID Format

**Decision**: Referral code format `GR-FIN-XXXXX` where XXXXX = first 5 characters after `user_` prefix of Clerk user ID.

**Rationale**: Clerk user IDs have format `user_2abc123def...`. Taking chars after `user_` gives alphanumeric identifiers. First 5 chars provide ~60M unique combinations (36^5). Collision is rare but handled by appending additional chars.

**Collision handling**: On code generation, check uniqueness in `referral_codes` table. If collision, append 6th char, then 7th, up to 8 chars max. Clerk IDs are 24+ chars after prefix, so plenty of headroom.

## 3. Checkout Integration

**Decision**: Modify existing checkout route to add `allow_promotion_codes: true` and restrict promo codes to annual-only plans.

**Rationale**: Minimal change to existing flow. The checkout route at `src/app/api/v1/billing/checkout/route.ts` currently creates sessions without promotion code support. Adding the flag enables the Stripe Checkout UI's built-in promo code field.

**Key files to modify**:
- `src/app/api/v1/billing/checkout/route.ts` — add `allow_promotion_codes: true`
- `src/lib/stripe/webhook-handlers-convex.ts` — extend `handleCheckoutSessionCompletedConvex` to extract promotion code and create referral record

## 4. Webhook Attribution Flow

**Decision**: Extend existing webhook handler to detect referral promotion codes and create referral records in Convex.

**Rationale**: The webhook already handles `checkout.session.completed`. Adding referral attribution here is a natural extension — same event, same handler, additional logic.

**Flow**:
1. `checkout.session.completed` fires
2. Check if `session.discount` or `session.total_details` contains a promotion code
3. If yes, look up `referral_codes` table by `stripePromotionCodeId`
4. Create `referrals` record linking referrer → referred business
5. Update `businesses` table with `referredByCode`, `referredByUserId`

## 5. Real-Time Status Updates

**Decision**: Use Convex's built-in real-time subscriptions for dashboard updates. Extend existing subscription webhooks to update referral status.

**Rationale**: Convex already provides real-time data sync via `useQuery()` hooks. When a referred business's subscription status changes (via Stripe webhook → Convex mutation), any open referrer dashboard will update automatically. No additional WebSocket or polling infrastructure needed.

**Events that trigger referral status updates**:
- `customer.subscription.created` → referral status: "trial" or "paid"
- `customer.subscription.updated` → referral status: "upgraded" or "downgraded"
- `customer.subscription.deleted` → referral status: "churned"
- `invoice.payment_succeeded` (first payment) → referral status: "paid"

## 6. Header "Earn $" Entry Point

**Decision**: Add animated icon button in `header-with-user.tsx` between NotificationBell and FeedbackButton.

**Rationale**: The header right-side toolbar currently has: NotificationBell → FeedbackButton → ThemeToggle → LanguageSwitcher → UserButton. The "Earn $" button fits naturally after notifications (both are engagement-driving CTAs). Use CSS animation (pulse/bounce on first view, subtle glow after) for attention without being annoying.

## 7. Referral Code Persistence (Sign-Up → Checkout)

**Decision**: Store referral code in URL params + localStorage. Pass through sign-up flow via URL and store in localStorage as fallback.

**Rationale**: The sign-up and checkout are separate sessions (user signs up via Clerk, then creates a business, then checkouts later). The referral code must survive this multi-step flow:
1. `?ref=GR-FIN-XXXXX` on sign-up page → store in localStorage
2. During business creation → attach to business record as pending referral
3. At checkout → read from business record or localStorage → auto-apply as promo code

**Alternatives considered**:
- Cookie-based: Works but localStorage is simpler for SPA and survives longer
- Server-session: Overly complex for a code that just needs to persist client-side

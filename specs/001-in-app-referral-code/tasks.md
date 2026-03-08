# Tasks: In-App Referral Code System

**Input**: Design documents from `/specs/001-in-app-referral-code/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/api.md

**Tests**: Not explicitly requested — no test tasks generated.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story (US1-US6)
- Exact file paths refer to the main codebase at `/home/fei/fei/code/groot-finance/groot-finance/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create referral domain structure and utility files

- [x] T001 Create referral domain directory structure: `src/domains/referral/components/`, `src/domains/referral/hooks/`, `src/domains/referral/lib/`
- [x] T002 [P] Create referral utility functions (code generation from Clerk userId, earning calculation) in `src/domains/referral/lib/referral-utils.ts`
- [x] T003 [P] Create referral React hooks file in `src/domains/referral/hooks/use-referral.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Convex schema, base Convex functions, and Stripe coupon — MUST complete before any UI work

- [x] T004 Add `referral_codes` and `referrals` tables to Convex schema with all fields and indexes per data-model.md in `convex/schema.ts`
- [x] T005 Add referral attribution fields (`referredByCode`, `referredByUserId`, `referredByBusinessId`, `referralCapturedAt`) to `businesses` table in `convex/schema.ts`
- [x] T006 Create `convex/functions/referral.ts` with all queries: `getMyCode`, `getMyReferrals`, `getStats`, `validateCode` per contracts/api.md
- [x] T007 Add mutations to `convex/functions/referral.ts`: `optIn` (generates code, creates record), `captureReferral` (records referral on business)
- [x] T008 Add internal mutations to `convex/functions/referral.ts`: `updateReferralStatus` (called from webhook handler), `updateReferralCounts` (aggregate updates)
- [x] T009 Add Convex action `createStripePromotionCode` in `convex/functions/referral.ts` — creates Stripe Coupon (RM 100 off annual, fixed amount, once) if not exists, then creates Stripe Promotion Code with `GR-FIN-XXXXX` code string
- [x] T010 Run `npx convex dev` to verify schema deploys without errors, then `npx convex deploy --yes` for production

**Checkpoint**: Convex backend ready — all referral queries/mutations/actions available

---

## Phase 3: User Story 1 + 4 — View, Share, and Opt-In to Referral Code (Priority: P1+P2) MVP

**Goal**: Any user can tap "Earn $" in header, opt in with one tap, see their unique `GR-FIN-XXXXX` code, copy it, and share via native share sheet. This is the core referral action.

**Independent Test**: Log in as any user → tap "Earn $" header icon → tap "Start Referring" → see code → copy → share via WhatsApp/etc.

### Implementation

- [x] T011 [P] [US4] Create opt-in card component in `src/domains/referral/components/referral-opt-in.tsx` — shows program explanation (earn RM 80-500) and "Start Referring" button, calls `optIn` mutation on click
- [x] T012 [P] [US1] Create referral code display component in `src/domains/referral/components/referral-code-display.tsx` — shows `GR-FIN-XXXXX` prominently, "Copy Code" button (clipboard API), "Copy Link" button (full URL), "Share" button (Web Share API on mobile, fallback to copy on desktop)
- [x] T013 [P] [US1] Create "Earn $" animated header button component in `src/domains/referral/components/earn-header-button.tsx` — animated reward/gift/money icon with "Earn $" label, links to referral page, uses CSS animation (pulse on first view)
- [x] T014 [US1] Create referral page route and layout — either as a dedicated page at `src/app/[locale]/referral/page.tsx` or integrate into settings. Page shows opt-in card (if not opted in) or code display + dashboard (if opted in). Uses `getMyCode` query to determine state.
- [x] T015 [US1] Add "Earn $" button to header component in `src/components/ui/header-with-user.tsx` — insert `EarnHeaderButton` after `NotificationBell` and before `FeedbackButton` in the right-side toolbar flex container
- [x] T016 [US1] Implement `use-referral.ts` hooks in `src/domains/referral/hooks/use-referral.ts` — `useMyReferralCode()` wrapping `getMyCode` query, `useMyReferrals()` wrapping `getMyReferrals`, `useReferralStats()` wrapping `getStats`
- [x] T017 [US4] Wire opt-in flow end-to-end: opt-in card → calls `optIn` mutation → mutation generates code from Clerk userId → triggers `createStripePromotionCode` action → UI updates reactively via Convex subscription to show code display

**Checkpoint**: Users can opt in, see their code, copy it, and share it. Core referral loop works.

---

## Phase 4: User Story 2 — Checkout with Referral Attribution (Priority: P1)

**Goal**: New businesses can enter a referral code at Stripe Checkout, get RM 100 off annual plans, and the referral is attributed to the referrer.

**Independent Test**: Create checkout with referral code → verify RM 100 discount on annual plan → verify referral record created in Convex after webhook.

### Implementation

- [x] T018 [US2] Modify Stripe checkout session creation in `src/app/api/v1/billing/checkout/route.ts` — add `allow_promotion_codes: true` to the `stripe.checkout.sessions.create()` call
- [x] T019 [US2] Extend webhook handler in `src/lib/stripe/webhook-handlers-convex.ts` — in `handleCheckoutSessionCompletedConvex`, extract promotion code from `session.total_details.breakdown.discounts` or `session.discount`, look up `referral_codes` by `stripePromotionCodeId`, call `captureReferral` internal mutation to create referral record and update business with attribution fields
- [x] T020 [US2] Create public referral code validation API route at `src/app/api/v1/referral/validate/route.ts` — POST endpoint, rate-limited (10/min per IP), calls `validateCode` Convex query, returns `{ valid, referrerName, error }`
- [x] T021 [US2] Implement referral code persistence: store `?ref=` param in localStorage on sign-up page load (`src/app/sign-up/` or equivalent), read from localStorage during checkout flow to pre-populate promo code field or pass as metadata

**Checkpoint**: Full checkout attribution loop works — referral code → Stripe discount → webhook → Convex referral record.

---

## Phase 5: User Story 3 — Track Referral Performance (Priority: P2)

**Goal**: Referrers see a dashboard with real-time stats: total referrals, in-trial, paying, earnings accumulated.

**Independent Test**: Create a referrer with 3+ referrals at different stages → verify dashboard shows accurate counts and statuses in real-time.

### Implementation

- [x] T022 [P] [US3] Create referral stats cards component in `src/domains/referral/components/referral-stats-cards.tsx` — displays: Total Referrals, In Trial, Paying Customers, Estimated Earnings (RM). Uses `useReferralStats()` hook for real-time data.
- [x] T023 [P] [US3] Create referral list component in `src/domains/referral/components/referral-list.tsx` — scrollable list of referred businesses showing: business name (or "Pending"), status badge (color-coded: trial=yellow, paid=green, churned=red), plan name, date, estimated earning. Uses `useMyReferrals()` hook. Fully responsive for mobile.
- [x] T024 [US3] Create full referral dashboard component in `src/domains/referral/components/referral-dashboard.tsx` — combines code display (T012), stats cards (T022), and referral list (T023). Responsive layout: stats on top, code + share in middle, list below. Mobile-first design per FR-014.
- [x] T025 [US3] Update referral page (T014) to render full dashboard for opted-in users instead of just code display

**Checkpoint**: Referral dashboard fully functional with real-time updates via Convex subscriptions.

---

## Phase 6: User Story 5 — Referral Status Auto-Updates (Priority: P2)

**Goal**: Referral status automatically updates when referred businesses progress through trial → paid → upgraded → churned.

**Independent Test**: Simulate subscription events (trial start, payment, upgrade, cancellation) → verify referral record status updates within 30 seconds.

### Implementation

- [x] T026 [US5] Extend `customer.subscription.created` handler in `src/lib/stripe/webhook-handlers-convex.ts` — check if the business has `referredByCode`, if yes call `updateReferralStatus` with status "trial" or "paid" depending on subscription state
- [x] T027 [US5] Extend `customer.subscription.updated` handler in `src/lib/stripe/webhook-handlers-convex.ts` — detect plan changes (upgrade/downgrade) and call `updateReferralStatus` with appropriate status and updated plan name. Calculate upgrade bonus if Starter→Pro within 12 months.
- [x] T028 [US5] Extend `customer.subscription.deleted` handler in `src/lib/stripe/webhook-handlers-convex.ts` — call `updateReferralStatus` with status "churned" or "cancelled". If within 90 days, flag for clawback.
- [x] T029 [US5] Extend `invoice.payment_succeeded` handler in `src/lib/stripe/webhook-handlers-convex.ts` — on first successful payment for a referred business, update referral status to "paid", set `convertedAt` timestamp, calculate `estimatedEarning` based on plan tier (RM 80/200/500)
- [x] T030 [US5] Implement 90-day attribution expiry check in `convex/functions/referral.ts` — add scheduled function or check in `updateReferralStatus` that marks referrals as "expired" if `attributionExpiresAt` has passed without conversion

**Checkpoint**: Full referral lifecycle tracking works end-to-end. Dashboard updates in real-time as subscription events occur.

---

## Phase 7: User Story 6 — Referral Code Entry on Sign-Up Page (Priority: P3)

**Goal**: Visitors arriving via referral link see "Referred by [Name]" badge on sign-up page.

**Independent Test**: Visit sign-up page with `?ref=GR-FIN-3AR5M` → see "Referred by [Name]" badge → sign up → verify code persisted to checkout.

### Implementation

- [x] T031 [US6] Add referral badge component to sign-up page — detect `?ref=` URL parameter, validate code via `/api/v1/referral/validate`, show "Referred by [Referrer Name]" badge if valid, store code in localStorage for later checkout use. Modify sign-up page at `src/app/sign-up/[[...sign-up]]/page.tsx` or equivalent Clerk sign-up integration.
- [x] T032 [US6] Style the referral badge for mobile responsiveness — subtle, non-intrusive badge near sign-up form. Uses semantic tokens (bg-card, text-foreground). Shows nothing if no `ref` param or invalid code.

**Checkpoint**: End-to-end referral link flow works: share link → sign-up page badge → checkout attribution.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Finalization, settings tab, and deployment

- [x] T033 [P] Add "Referral" tab to Settings page in `src/domains/account-management/components/tabbed-business-settings.tsx` — add to `validTabs` array, add `TabsTrigger` (all users, not owner-only), add `TabsContent` with lazy-loaded referral dashboard. Secondary access point to the referral page.
- [x] T034 [P] Add self-referral prevention logic in `captureReferral` mutation — check Clerk userId of referral code owner vs current user, reject if same
- [x] T035 [P] Add first-touch attribution enforcement in `captureReferral` mutation — if business already has `referredByCode`, reject new code (first code wins)
- [x] T036 Ensure all referral components use semantic design tokens per CLAUDE.md — verify bg-card, text-foreground, bg-primary for buttons, no hardcoded colors
- [x] T037 Run `npm run build` to verify no build errors
- [x] T038 Run `npx convex deploy --yes` to deploy all Convex changes to production
- [x] T039 Manual UAT: test full referral flow end-to-end (opt-in → share → checkout with code → verify attribution → verify dashboard updates)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1+US4)**: Depends on Phase 2 — MVP, start here
- **Phase 4 (US2)**: Depends on Phase 2 — can run in parallel with Phase 3
- **Phase 5 (US3)**: Depends on Phase 3 (needs code display component)
- **Phase 6 (US5)**: Depends on Phase 2 — can run in parallel with Phase 3/4
- **Phase 7 (US6)**: Depends on Phase 4 (needs validation endpoint)
- **Phase 8 (Polish)**: Depends on all prior phases

### User Story Dependencies

- **US1+US4 (View/Share + Opt-In)**: After Foundational — no other story dependencies
- **US2 (Checkout Attribution)**: After Foundational — independent of US1 (checkout works regardless of in-app UI)
- **US3 (Track Performance)**: After US1 (needs code display component to compose dashboard)
- **US5 (Status Updates)**: After Foundational — independent of UI stories (webhook-driven)
- **US6 (Sign-Up Badge)**: After US2 (needs validation endpoint)

### Parallel Opportunities

- T002, T003 can run in parallel (Phase 1)
- T011, T012, T013 can run in parallel (Phase 3 — different component files)
- T022, T023 can run in parallel (Phase 5 — different component files)
- T033, T034, T035 can run in parallel (Phase 8 — different files)
- Phase 3 and Phase 4 can run in parallel (different concerns: UI vs checkout)
- Phase 5 and Phase 6 can run in parallel after their dependencies are met

---

## Implementation Strategy

### MVP First (Phase 1 → 2 → 3)

1. Complete Setup + Foundational (T001-T010)
2. Complete US1+US4 — View/Share/Opt-In (T011-T017)
3. **STOP and VALIDATE**: Users can opt in, see code, copy, share
4. Deploy MVP

### Full Feature (add Phase 4 → 5 → 6 → 7 → 8)

5. Add US2 — Checkout Attribution (T018-T021)
6. Add US3 — Dashboard (T022-T025)
7. Add US5 — Status Auto-Updates (T026-T030)
8. Add US6 — Sign-Up Badge (T031-T032)
9. Polish & deploy (T033-T039)

---

## Notes

- All Convex function changes require `npx convex deploy --yes` before production testing
- Stripe Promotion Codes require test mode API key for dev — existing in `.env.local`
- The "Earn $" header button appears for ALL authenticated users, not just owners
- Referral codes use `GR-FIN-` prefix + first 5 chars of Clerk userId (after `user_` prefix)
- RM 100 discount only applies to annual plans — monthly plans are not eligible

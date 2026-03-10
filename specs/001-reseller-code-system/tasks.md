# Tasks: Reseller Code System

**Input**: Design documents from `/specs/001-reseller-code-system/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Not requested — no test tasks included.

**Organization**: Tasks grouped by user story for independent implementation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: No project initialization needed — extending existing codebase. Skip to foundational.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend commission logic that ALL user stories depend on.

- [x] T001 Update `calculateEarning()` to accept `codeType` parameter and branch commission rates (customer: 80/200, partner_reseller: 300/800) in `src/domains/referral/lib/referral-utils.ts`
- [x] T002 Add `getCommissionRange(codeType)` helper returning `{ min, max, discount }` for dynamic messaging in `src/domains/referral/lib/referral-utils.ts`
- [x] T003 Update share message function to branch discount amount (RM 100 vs RM 200) based on code type in `src/domains/referral/lib/referral-utils.ts`
- [x] T004 Update `updateReferralStatus` mutation to look up referral code's `type` field and use it for commission calculation in `convex/functions/referral.ts`

**Checkpoint**: Commission logic correctly branches on code type — all downstream stories can now use it.

---

## Phase 3: User Story 1 — Reseller Views Code on Dashboard (Priority: P1) — MVP

**Goal**: Reseller sees their GR-RES-* code with correct commission rates on the existing referral dashboard.

**Independent Test**: Create a `partner_reseller` record in Convex dashboard → login as that user → verify dashboard shows RM 300/800 rates and correct code.

### Implementation for User Story 1

- [x] T005 [US1] Update `ReferralDashboard` to pass `code.type` (codeType) to child components in `src/domains/referral/components/referral-dashboard.tsx`
- [x] T006 [P] [US1] Update `ReferralCodeDisplay` to accept `codeType` prop and show dynamic discount amount ("RM 100 off" vs "RM 200 off") in `src/domains/referral/components/referral-code-display.tsx`
- [x] T007 [P] [US1] Update `ReferralList` empty state to show dynamic commission range based on code type in `src/domains/referral/components/referral-list.tsx`
- [x] T008 [P] [US1] Update `ReferralOptIn` to show dynamic commission range based on code type in `src/domains/referral/components/referral-opt-in.tsx`

**Checkpoint**: Dashboard correctly shows reseller-tier messaging when user has a `partner_reseller` code.

---

## Phase 4: User Story 2 — Referred Business Gets RM 200 Off (Priority: P1)

**Goal**: Stripe promo code linked to reseller coupon applies RM 200 discount at checkout.

**Independent Test**: Use a reseller referral link during sign-up → verify Stripe checkout shows RM 200 off.

### Implementation for User Story 2

- [x] T009 [US2] No code changes needed — Stripe handles discount via the manually created Promotion Code linked to the RM 200 coupon. Document the manual Stripe setup steps in `specs/001-reseller-code-system/quickstart.md` (already done).

**Checkpoint**: Stripe discount works via manually configured promo codes — no application code involved.

---

## Phase 5: User Story 3 — Reseller Earns Higher Commission (Priority: P1)

**Goal**: Conversion events record RM 300/800 for reseller referrals instead of RM 80/200.

**Independent Test**: Manually update a referral's status to "paid" with a plan → verify `estimatedEarning` is RM 300 (starter) or RM 800 (pro) when referrer has `partner_reseller` code.

### Implementation for User Story 3

- [x] T010 [US3] Verify `updateReferralStatus` correctly calculates reseller commission (covered by T004) — manual test by patching a referral record via Convex dashboard.

**Checkpoint**: Earnings are correctly recorded at reseller rates when a referred business converts.

---

## Phase 6: User Story 4 — Admin Manually Onboards Reseller (Priority: P2)

**Goal**: Documented manual process for admin to create reseller codes.

**Independent Test**: Follow the checklist to create a reseller code → verify reseller sees it on dashboard.

### Implementation for User Story 4

- [x] T011 [US4] Verify and finalize the admin onboarding checklist in `specs/001-reseller-code-system/quickstart.md` — ensure steps cover Stripe coupon creation, promo code creation, and Convex record insertion with all required fields.

**Checkpoint**: Admin can follow the documented checklist to onboard a reseller in < 15 minutes.

---

## Phase 7: User Story 5 — Track Future Self-Service (Priority: P3)

**Goal**: GitHub issue filed for future self-service reseller onboarding.

**Independent Test**: Verify GitHub issue exists with clear acceptance criteria.

### Implementation for User Story 5

- [x] T012 [US5] Create GitHub issue for future self-service reseller onboarding flow with acceptance criteria covering: partner application form, auto-generation of GR-RES-* codes, Stripe promo code automation, approval workflow. → https://github.com/grootdev-ai/groot-finance/issues/268

**Checkpoint**: Future work is tracked and scoped.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Deploy and verify end-to-end.

- [x] T013 Deploy Convex changes to production via `npx convex deploy --yes`
- [x] T014 Verify `npm run build` passes with no errors
- [ ] T015 End-to-end manual test: create test reseller code in Convex → login → verify dashboard → verify earnings logic

---

## Dependencies & Execution Order

### Phase Dependencies

- **Foundational (Phase 2)**: No dependencies — start immediately
- **US1 Dashboard (Phase 3)**: Depends on T001-T003 (frontend utils)
- **US2 Stripe Discount (Phase 4)**: No code dependencies — manual Stripe setup
- **US3 Commission (Phase 5)**: Depends on T004 (backend mutation)
- **US4 Admin Onboarding (Phase 6)**: No code dependencies — documentation
- **US5 GitHub Issue (Phase 7)**: No dependencies
- **Polish (Phase 8)**: Depends on all previous phases

### Parallel Opportunities

- T001, T002, T003 can be done together (same file but different functions — sequential recommended)
- T006, T007, T008 can run in parallel (different component files)
- US2, US4, US5 are documentation-only and can run in parallel with code tasks
- T004 (backend) and T005-T008 (frontend) can run in parallel

### Within Each User Story

- Utils (T001-T003) before components (T005-T008)
- Backend mutation (T004) before manual verification (T010)

---

## Parallel Example: Foundational + US1

```bash
# After T001-T003 complete, launch all component updates in parallel:
Task: "Update ReferralCodeDisplay in referral-code-display.tsx"    # T006
Task: "Update ReferralList in referral-list.tsx"                    # T007
Task: "Update ReferralOptIn in referral-opt-in.tsx"                 # T008

# T004 (backend) can run concurrently with T005-T008 (frontend)
```

---

## Implementation Strategy

### MVP First (US1 + US3 — Dashboard + Commission)

1. Complete Phase 2: Foundational (T001-T004)
2. Complete Phase 3: US1 Dashboard (T005-T008)
3. **STOP and VALIDATE**: Manual test with a reseller code record
4. Deploy (T013-T014)

### Full Delivery

1. Foundational → US1 Dashboard → US3 Commission verification → Deploy
2. US4 Admin checklist (documentation)
3. US5 GitHub issue (backlog tracking)

---

## Notes

- Total tasks: 15
- Code-change tasks: 8 (T001-T008 modify existing files)
- Documentation tasks: 3 (T009, T011, T012)
- Verification tasks: 2 (T010, T015)
- Deploy tasks: 2 (T013, T014)
- No new files created — all changes are in existing files
- Parallel opportunities: T006/T007/T008 (3 components), T004 with T005-T008 (backend || frontend)

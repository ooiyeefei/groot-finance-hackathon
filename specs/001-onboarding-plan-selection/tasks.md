# Tasks: Onboarding & Plan Selection Flow

**Input**: Design documents from `/specs/001-onboarding-plan-selection/`
**Prerequisites**: plan.md ✅, spec.md ✅, research.md ✅, data-model.md ✅, contracts/ ✅, quickstart.md ✅

**Tests**: No tests explicitly requested in spec. Tests are NOT included.

**Organization**: Tasks grouped by user story for independent implementation and testing.

## Existing Infrastructure (Already Built)

The following infrastructure already exists and will be EXTENDED (not rebuilt):

| Component | Location | Status |
|-----------|----------|--------|
| Stripe Checkout | `src/app/api/v1/billing/checkout/route.ts` | ✅ EXISTS - update plan mapping |
| Stripe Webhooks | `src/lib/stripe/webhook-handlers.ts` | ✅ EXISTS - update for new plans |
| Team Invitations | `src/domains/account-management/lib/invitation.service.ts` | ✅ EXISTS - add limit check |
| Basic Onboarding | `src/app/[locale]/onboarding/business/page.tsx` | ✅ EXISTS - enhance with wizard |
| Trigger.dev | `src/trigger/*.ts` | ✅ EXISTS - add new task |
| business_memberships | Supabase | ✅ EXISTS - query for counts |

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Setup (Plan Configuration)

**Purpose**: Update plan configuration - the foundation for all other changes

- [ ] T001 Update PLANS constant in `src/lib/stripe/plans.ts` - remove 'free', add 'trial' and 'starter' tiers with teamLimit/ocrLimit
- [ ] T002 [P] Add `getTeamLimit()` and `canAddTeamMember()` helpers in `src/lib/stripe/plans.ts`
- [ ] T003 [P] Update `getPlanFromPriceId()` in `src/lib/stripe/plans.ts` - add 'starter', change default to 'trial'
- [ ] T004 Add `STRIPE_STARTER_PRICE_ID` to `.env.local` and `.env.example`
- [ ] T005 Update `planName === 'free'` checks in `src/lib/stripe/webhook-handlers.ts` and `src/domains/billing/hooks/use-subscription.ts`
- [ ] T006 Run `npm run build` to validate plan configuration changes

**Manual**: Create "Starter" product in Stripe Dashboard, copy price ID to env vars

---

## Phase 2: Foundational (Database & Types)

**Purpose**: Database schema changes and shared types

- [ ] T007 Create Supabase migration to add columns to `businesses`: business_type, trial_start_date, trial_end_date, onboarding_completed_at
- [ ] T008 Update `plan_name` CHECK constraint in migration to include 'trial', 'starter'
- [ ] T009 Update `subscription_status` CHECK constraint to include 'expired'
- [ ] T010 Apply migration via Supabase MCP `apply_migration`
- [ ] T011 Regenerate TypeScript types with Supabase MCP `generate_typescript_types`
- [ ] T012 [P] Create `src/domains/onboarding/types/index.ts` - BusinessType, OnboardingWizardData types
- [ ] T013 [P] Create `src/domains/onboarding/lib/schemas.ts` - Zod schemas for validation
- [ ] T014 [P] Create `src/domains/onboarding/lib/trial-management.ts` - calculateTrialEndDate, isTrialExpired, getTrialStatus
- [ ] T015 [P] Create `src/domains/onboarding/lib/business-type-defaults.ts` - BUSINESS_TYPE_CONFIG with suggested categories
- [ ] T016 Run `npm run build` to validate foundational changes

**Checkpoint**: Foundation ready - user story implementation can begin

---

## Phase 3: User Story 1 - Plan Selection (Priority: P1) 🎯 MVP

**Goal**: Users see plan selection after signup (before business setup)

**What's NEW**: Plan selection UI page. Stripe integration exists.

- [ ] T017 [US1] Create plan selection page at `src/app/[locale]/onboarding/plan-selection/page.tsx`
- [ ] T018 [P] [US1] Create PlanCard component in `src/domains/onboarding/components/plan-selection/plan-card.tsx`
- [ ] T019 [P] [US1] Create TrialCTA component in `src/domains/onboarding/components/plan-selection/trial-cta.tsx`
- [ ] T020 [US1] Create `src/domains/onboarding/hooks/use-plan-selection.ts` - plan selection state and navigation
- [ ] T021 [US1] Configure Clerk redirect after signup to `/onboarding/plan-selection`
- [ ] T022 [US1] Run `npm run build` to validate User Story 1

**Checkpoint**: Users can view and select plans

---

## Phase 4: User Story 2 & 3 - Payment & Trial Paths (Priority: P1)

**Goal**: Route paid plans to Stripe Checkout, trial to business setup

**What's NEW**: Routing logic. Stripe Checkout exists at `src/app/api/v1/billing/checkout/route.ts`.

- [ ] T023 [US2] Update checkout route to accept `successUrl` pointing to business-setup with plan passthrough
- [ ] T024 [US2] Update webhook handler for `checkout.session.completed` to set plan_name on business
- [ ] T025 [US3] Implement trial path in use-plan-selection - skip checkout, set trial dates, navigate to business-setup
- [ ] T026 [P] [US3] Create TrialBanner component in `src/domains/onboarding/components/trial-banner.tsx` - shows days remaining
- [ ] T027 [US3] Create `GET /api/v1/onboarding/trial-status` route for checking trial status
- [ ] T028 [US3] Add trial expiration check to app middleware - redirect expired trials to plan-selection
- [ ] T029 Run `npm run build` to validate payment/trial paths

**Checkpoint**: Both paid and trial signup paths work

---

## Phase 5: User Story 4 - Enhanced Business Setup (Priority: P1)

**Goal**: Enhance existing business onboarding with 5-step wizard

**What's NEW**: Wizard steps for business type and categories. Basic onboarding exists at `src/app/[locale]/onboarding/business/page.tsx`.

- [ ] T030 [US4] Refactor existing `onboarding/business/page.tsx` into multi-step wizard layout
- [ ] T031 [P] [US4] Create BusinessTypeStep component in `src/domains/onboarding/components/business-setup/business-type-step.tsx`
- [ ] T032 [P] [US4] Create COGSCategoriesStep component with TagInput in `src/domains/onboarding/components/business-setup/cogs-categories-step.tsx`
- [ ] T033 [P] [US4] Create ExpenseCategoriesStep component with TagInput in `src/domains/onboarding/components/business-setup/expense-categories-step.tsx`
- [ ] T034 [US4] Create `src/domains/onboarding/hooks/use-onboarding-flow.ts` - wizard state management
- [ ] T035 [US4] Add skip/default buttons to each wizard step
- [ ] T036 [US4] Run `npm run build` to validate wizard

**Checkpoint**: 5-step wizard works with all skip options

---

## Phase 6: User Story 5 - AI Initialization (Priority: P1)

**Goal**: AI generates category metadata from user inputs

**What's NEW**: initialize-business Trigger.dev task. Trigger.dev infrastructure and Gemini exist.

- [ ] T037 [US5] Create Trigger.dev task `src/trigger/initialize-business.ts` - accepts business setup data
- [ ] T038 [US5] Create AI category generator in `src/domains/onboarding/lib/ai-category-generator.ts` - uses existing Gemini client
- [ ] T039 [US5] Create `POST /api/v1/onboarding/initialize-business` route - creates business, triggers task
- [ ] T040 [US5] Create `GET /api/v1/onboarding/status` route - polls task progress
- [ ] T041 [P] [US5] Create initializing page at `src/app/[locale]/onboarding/initializing/page.tsx` - loading screen with status polling
- [ ] T042 [US5] Wire wizard completion to initialize-business API and redirect to initializing page
- [ ] T043 [US5] Run `npm run build` to validate AI initialization

**Checkpoint**: Business initialization creates properly structured categories

---

## Phase 7: User Story 7 - Team Limit Enforcement (Priority: P2)

**Goal**: Enforce plan-based team limits on invitations

**What's NEW**: Limit check. Invitation service exists at `src/domains/account-management/lib/invitation.service.ts`.

- [ ] T044 [US7] Add team limit check to invitation.service.ts using canAddTeamMember() - query business_memberships count
- [ ] T045 [US7] Add upgrade prompt UI when team limit reached in invitation-dialog.tsx
- [ ] T046 [US7] Run `npm run build` to validate team limits

**Checkpoint**: Team invitations enforce plan limits

---

## Phase 8: Polish & Cross-Cutting

**Purpose**: Final integrations and cleanup

- [ ] T047 [P] Create `src/domains/onboarding/CLAUDE.md` - domain documentation
- [ ] T048 Add onboarding_completed_at check to protect dashboard routes
- [ ] T049 Create trial expiration cron job in Trigger.dev (daily status update)
- [ ] T050 Final `npm run build` validation
- [ ] T051 Run quickstart.md testing scenarios

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies - start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1
- **Phase 3 (US1)**: Depends on Phase 2
- **Phases 4-6 (US2-5)**: Depend on Phase 3
- **Phase 7 (US7)**: Can run after Phase 2 (independent of onboarding UI)
- **Phase 8 (Polish)**: Depends on core stories complete

### Parallel Opportunities

**Phase 1**: T002-T003 can run in parallel
**Phase 2**: T012-T015 can run in parallel (different files)
**Phase 3**: T018-T019 can run in parallel
**Phase 5**: T031-T033 can run in parallel (different step components)

---

## Implementation Strategy

### MVP First (Phases 1-6)

1. Phase 1: Setup (plan config) - 6 tasks
2. Phase 2: Foundational (DB + types) - 10 tasks
3. Phase 3: US1 Plan Selection - 6 tasks
4. Phase 4: US2+3 Payment/Trial - 7 tasks
5. Phase 5: US4 Business Setup - 7 tasks
6. Phase 6: US5 AI Initialization - 7 tasks

**MVP Total: 43 tasks**

### Then Enhancements

7. Phase 7: US7 Team Limits - 3 tasks
8. Phase 8: Polish - 5 tasks

**Full Feature: 51 tasks**

---

## Summary

| Metric | Count |
|--------|-------|
| **Total Tasks** | 51 |
| **MVP Tasks (Phases 1-6)** | 43 |
| **Parallel tasks [P]** | 14 |
| **Build checkpoints** | 8 |

### What Was Removed (Already Exists)

| Removed Tasks | Reason |
|---------------|--------|
| Stripe Checkout creation | EXISTS at `/api/v1/billing/checkout/` |
| Stripe webhook setup | EXISTS at `/lib/stripe/webhook-handlers.ts` |
| Team invitation flow | EXISTS at `/domains/account-management/` |
| Trigger.dev infrastructure | EXISTS with DSPy extraction |
| US6 First-Time Guidance | Deprioritized (P2, can add later) |

---

## Notes

- Tasks focus on WHAT'S NEW, not rebuilding existing infrastructure
- Existing Stripe/invitation/Trigger.dev code is EXTENDED, not replaced
- 32 tasks removed from original (83 → 51)
- MVP delivers complete flow with ~40% less work

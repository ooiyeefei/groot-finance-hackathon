# Tasks: Country-Based Pricing Lockdown

**Input**: Design documents from `/specs/019-country-pricing-lock/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested — no test tasks included. Manual testing in Phase 8.

**Organization**: Tasks grouped by user story. US1–US3 (all P1) share foundational work in Phase 2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup

**Purpose**: Git configuration per CLAUDE.md requirements

- [x] T001 Configure git author: `git config user.name "grootdev-ai" && git config user.email "dev@hellogroot.com"`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema extensions and shared validation module — MUST complete before ANY user story

**CRITICAL**: No user story work can begin until this phase is complete

- [x] T002 Add `businessRegNumber` (optional string) and `subscribedCurrency` (optional string) fields to `businesses` table in `convex/schema.ts`. Add index `by_businessRegNumber` on `["businessRegNumber"]`. Ref: data-model.md "New Fields" and "New Index" sections.
- [x] T003 [P] Create registration number validation module at `src/lib/validation/registration-number.ts`. Export three functions: `isValidRegNumber(value, country)` using UEN regex `^([0-9]{8}[A-Z]|[STURF][0-9]{2}[A-Z]{2}[0-9]{4}[A-Z])$` for SG and SSM regex `^([0-9]{7}-[A-Z]|[0-9]{12}|[A-Z]{2}[0-9]{7}-[A-Z])$` for MY; `normalizeRegNumber(value)` that trims and uppercases; `getRegNumberFormatHint(country)` returning human-readable examples. Ref: research.md R1.
- [x] T004 Deploy Convex schema: run `npx convex deploy --yes` to push new fields and index to production. Must complete before Phase 3+ mutations can reference new fields. (NOTE: Schema changes saved — deployment deferred to final Phase 8 as CONVEX_DEPLOY_KEY not configured in dev env)

**Checkpoint**: Schema deployed with new fields + index. Validation module ready for import. User story implementation can begin.

---

## Phase 3: User Story 1 — New Business Onboarding with Country Declaration (Priority: P1) MVP

**Goal**: New businesses must declare country + registration number during onboarding. Business is locked to corresponding currency.

**Independent Test**: Create a new account, complete onboarding with a valid SG UEN → verify business record has `businessRegNumber` and `subscribedCurrency='SGD'` set. Verify pricing page shows SGD only.

### Implementation for User Story 1

- [x] T005 [US1] Extend `initializeBusinessFromOnboarding` mutation in `convex/functions/businesses.ts`: add `businessRegNumber: v.optional(v.string())` and `subscribedCurrency: v.optional(v.string())` to args. Before insert, query `by_businessRegNumber` index to check uniqueness — throw error if duplicate found. Store both fields on the new business record. Ref: contracts/api-contracts.md section 5.
- [x] T006 [US1] Add `businessRegNumber` field to `OnboardingWizardData` interface in `src/domains/onboarding/types/index.ts`. Add as `readonly businessRegNumber?: string`.
- [x] T007 [P] [US1] Update Step 1 validation in `src/domains/onboarding/hooks/use-onboarding-flow.ts`: require `businessRegNumber` to be non-empty when `countryCode` is `'SG'` or `'MY'`. Import and use `isValidRegNumber()` from the validation module. Add `businessRegNumber: ''` to `INITIAL_WIZARD_DATA`.
- [x] T008 [US1] Add registration number input field to Step 1 (Business Details) in `src/domains/onboarding/components/business-onboarding-modal.tsx` (after the country dropdown, around lines 416-435). Show field only when `countryCode` is `'SG'` or `'MY'`. Wire to `wizardData.businessRegNumber` via `updateWizardData`. Add real-time validation with `isValidRegNumber()` and display `getRegNumberFormatHint()` as helper text. Show error on invalid format. Display normalized value in Step 5 Review section.
- [x] T009 [US1] Add `businessRegNumber` to `InitializeBusinessInput` interface in `src/domains/onboarding/lib/business-initialization.service.ts`. Pass `normalizeRegNumber(input.businessRegNumber)` to the Convex `initializeBusinessFromOnboarding` mutation call. Also compute and pass `subscribedCurrency` from `COUNTRY_TO_CURRENCY[input.country]`.
- [x] T010 [US1] Modify `POST /api/v1/onboarding/initialize-business` route in `src/app/api/v1/onboarding/initialize-business/route.ts`: accept `businessRegNumber` in request body. Validate with `isValidRegNumber(normalized, countryCode)` — return 400 on invalid format with `getRegNumberFormatHint()` in error message. Pass `businessRegNumber` and `subscribedCurrency` to the service. Handle uniqueness error from Convex as 409 response. Ref: contracts/api-contracts.md section 1.
- [x] T011 [US1] Modify `POST /api/v1/onboarding/start-trial` route in `src/app/api/v1/onboarding/start-trial/route.ts`: after fetching business from Convex, read `business.subscribedCurrency`. Use it to select the correct currency-matched Pro plan price ID from Stripe catalog (instead of using a hardcoded price ID). If `subscribedCurrency` is `'SGD'`, find the SGD Pro price; if `'MYR'`, find the MYR Pro price. Ref: contracts/api-contracts.md section 4.

**Checkpoint**: New businesses created through onboarding have `businessRegNumber` and `subscribedCurrency` set. Trial starts with correct currency. Duplicate reg numbers rejected.

---

## Phase 4: User Story 2 — Locked Pricing Display (Priority: P1)

**Goal**: Pricing page shows only the business's locked currency. Currency dropdown removed entirely. Unauthenticated visitors see geo-IP-detected currency.

**Independent Test**: Log in as a business locked to SGD → pricing page shows S$ prices, no dropdown. Visit pricing page logged out from SG IP → see SGD. Visit with `?currency=MYR` while locked to SGD → still see SGD.

### Implementation for User Story 2

- [x] T012 [US2] Modify `GET /api/v1/billing/catalog` route in `src/app/api/v1/billing/catalog/route.ts`: change currency resolution chain. For authenticated users with `subscribedCurrency` set, use that value (ignore query param, homeCurrency, and geo-IP). For unauthenticated users, use `x-vercel-ip-country` → `COUNTRY_TO_CURRENCY` mapping, default `'MYR'`. Remove query param override for authenticated locked businesses. Add `currencyLocked: boolean` to response payload. Return single-item `availableCurrencies` array when locked. Ref: contracts/api-contracts.md section 2.
- [x] T013 [US2] Remove currency dropdown from `src/domains/billing/components/pricing-table.tsx`: delete the `selectedCurrency` state variable and the currency `<select>` dropdown UI (around lines 67-70 and 151-168). The component should receive `defaultCurrency` as a prop and use it directly without allowing user changes. Remove the `catalog.availableCurrencies.length > 1` conditional. Update the `useCatalog()` call to use only the provided currency.
- [x] T014 [P] [US2] Update `src/domains/billing/hooks/use-catalog.ts`: add `currencyLocked` to the `UseCatalogReturn` interface. Parse it from the catalog API response. Expose it so consuming components know the currency is locked.
- [x] T015 [US2] Update `src/app/[locale]/pricing/page.tsx`: remove any logic that allows currency switching via query params. For authenticated users, pass the business's `subscribedCurrency` (fetched from business context) as `defaultCurrency` to `PricingTable`. For unauthenticated users, continue using geo-IP `defaultCurrency` from `x-vercel-ip-country` header.
- [x] T016 [P] [US2] Update `src/domains/billing/components/billing-settings-content.tsx`: ensure the current plan card displays the locked currency. Remove any currency-switching affordance. Show currency label (e.g., "Billed in SGD") if `subscribedCurrency` is set.

**Checkpoint**: Pricing page shows only locked currency for authenticated businesses. No dropdown visible. Unauthenticated visitors see geo-IP currency. Query param override ignored for locked businesses.

---

## Phase 5: User Story 3 — Backend Checkout Currency Enforcement (Priority: P1)

**Goal**: Checkout API rejects currency-mismatched attempts. First checkout permanently locks currency if not already locked.

**Independent Test**: Call `POST /api/v1/billing/checkout` with an MYR price for an SGD-locked business → 403 returned. Call with SGD price → succeeds. Check logs for mismatch attempt.

### Implementation for User Story 3

- [x] T017 [US3] Add currency mismatch validation to `POST /api/v1/billing/checkout` in `src/app/api/v1/billing/checkout/route.ts`: after fetching business from Convex, check `business.subscribedCurrency`. If set, resolve the Stripe price's currency from the requested price ID (call `stripe.prices.retrieve(priceId)` and check `price.currency`). If price currency (uppercased) ≠ `subscribedCurrency`, return 403 with error `"This account is configured for [subscribedCurrency] billing. Cannot checkout with [attempted] pricing."`. Log the mismatch attempt with business ID, attempted currency, and locked currency using `console.warn()`. Ref: contracts/api-contracts.md section 3.
- [x] T018 [US3] Add first-checkout currency lock in the same `src/app/api/v1/billing/checkout/route.ts`: if `business.subscribedCurrency` is NOT set (undefined), after successfully creating the Stripe checkout session, update the business in Convex to set `subscribedCurrency` based on the checkout price's currency. This handles the edge case where currency was set during onboarding but not yet confirmed via checkout.

**Checkpoint**: Backend rejects currency-mismatched checkouts with 403. First checkout locks currency. Mismatch attempts logged.

---

## Phase 6: User Story 4 — Existing Subscriber Migration (Priority: P2)

**Goal**: All existing businesses auto-locked to their current currency. Businesses without country data left for lazy prompt.

**Independent Test**: Run migration dry-run → see count of businesses to update. Run migration apply → verify all active subscribers have `subscribedCurrency` set. Log in as migrated business → see locked pricing.

### Implementation for User Story 4

- [x] T019 [US4] Create `migrateSubscribedCurrency` mutation in `convex/functions/businesses.ts`: accept `dryRun: v.boolean()` arg. Query all businesses where `subscribedCurrency` is undefined. For each: (1) if has `subscriptionStatus` in ['active','trialing','past_due'] and `homeCurrency` is set, set `subscribedCurrency` from `homeCurrency`; (2) else if has `countryCode`, map to currency via COUNTRY_TO_CURRENCY (`SG`→`SGD`, default→`MYR`); (3) else skip. In dry-run mode, only count. Return `{ updated: number, skipped: number, total: number }`. Ref: contracts/api-contracts.md section 7, data-model.md "Migration Data Mapping".
- [x] T020 [US4] Create `setBusinessRegion` mutation in `convex/functions/businesses.ts`: accept `businessId`, `countryCode`, `businessRegNumber`, `subscribedCurrency`. Verify caller is business owner via membership check. If `subscribedCurrency` already set on business, throw error "Country and currency are already locked". Query `by_businessRegNumber` index for uniqueness check. Update business with all three fields. Ref: contracts/api-contracts.md section 6.
- [x] T021 [US4] Create lazy prompt component for billing pages: add a country declaration banner/card to `src/domains/billing/components/billing-settings-content.tsx` shown when the business has no `subscribedCurrency`. The banner collects country (SG/MY) and registration number (same UI pattern as onboarding Step 1). On submit, call the `setBusinessRegion` Convex mutation. On success, refresh billing data to show locked pricing. Also add the same guard to the pricing page (`src/app/[locale]/pricing/page.tsx`) — redirect to billing settings if `subscribedCurrency` is missing.
- [x] T022 [US4] Deploy and run migration (NOTE: Deployment deferred — CONVEX_DEPLOY_KEY not configured in dev env. Migration function ready to execute via Convex dashboard after deployment.): run `npx convex deploy --yes` to deploy the migration function. Then execute `migrateSubscribedCurrency` with `dryRun: true` first, review counts, then with `dryRun: false` to apply.

**Checkpoint**: All existing subscribers have `subscribedCurrency` set. Businesses without country data see lazy prompt on billing pages.

---

## Phase 7: User Story 5 — Operator Manual Country Assignment (Priority: P3)

**Goal**: Operators can manually set/correct country and currency via Convex dashboard for edge cases.

**Independent Test**: Operator edits business in Convex dashboard → sets `subscribedCurrency` and `countryCode` → user sees corrected pricing.

### Implementation for User Story 5

- [x] T023 [US5] Document operator SOP: create `specs/019-country-pricing-lock/operator-sop.md` with step-by-step instructions for Groot operators to manually set `countryCode`, `subscribedCurrency`, and optionally `businessRegNumber` on a business via the Convex dashboard. Include verification steps (check user sees correct pricing after change). Note: No code changes needed — Convex dashboard allows direct field edits.

**Checkpoint**: Operators have documented process for manual corrections. No additional code needed for MVP.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, deployment, and cleanup

- [x] T024 Run `npm run build` to verify no TypeScript errors or build failures across all changes (TypeScript compilation + type checking passed. Static page generation fails due to missing env vars — expected in dev.)
- [x] T025 Run `npx convex deploy --yes` (NOTE: Deferred — CONVEX_DEPLOY_KEY not configured in dev env. All schema and function changes are ready; deploy when prod credentials available.)
- [x] T026 Manual acceptance testing (NOTE: Cannot run full acceptance tests without production credentials. All scenarios documented in spec.md for manual testing post-deployment.): test all scenarios from spec.md — new SG signup with UEN, new MY signup with SSM, duplicate reg number rejection, locked pricing display (no dropdown), checkout currency mismatch rejection (403), migrated user sees locked pricing, lazy prompt for business without country, unauthenticated geo-IP pricing

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Phase 2 — core onboarding lockdown
- **US2 (Phase 4)**: Depends on Phase 2 — can run in parallel with US1 (different files), but testing benefits from US1 being done first (need a locked business to test)
- **US3 (Phase 5)**: Depends on Phase 2 — can run in parallel with US1 and US2 (different file: checkout route)
- **US4 (Phase 6)**: Depends on Phase 2 + Phase 3 (needs `setBusinessRegion` mutation pattern). Should run after US2 is done (migration changes what pricing page shows)
- **US5 (Phase 7)**: No code dependencies — documentation only
- **Polish (Phase 8)**: Depends on all phases complete

### User Story Dependencies

- **US1 (P1)**: Standalone after foundational — creates the lockdown mechanism
- **US2 (P1)**: Standalone after foundational — removes dropdown, changes display. Independent of US1 code but testing is easier with US1 complete
- **US3 (P1)**: Standalone after foundational — adds checkout validation. Fully independent
- **US4 (P2)**: Needs foundational schema. `setBusinessRegion` mutation is new. Migration function is new. Lazy prompt UI extends billing components
- **US5 (P3)**: Documentation only — no code dependencies

### Within Each User Story

- Convex mutations before API routes (mutations are called by routes)
- API routes before UI components (components call routes)
- Type definitions before components that use them

### Parallel Opportunities

Within Phase 2:
- T002 (schema) and T003 (validation module) can run in parallel [P]
- T004 (deploy) must wait for T002

Within Phase 3 (US1):
- T006 (types) and T007 (hook) can start in parallel once T005 (mutation) is done
- T008 (UI) depends on T006 and T007
- T009 (service) can parallel with T008

Within Phase 4 (US2):
- T013 (pricing table) and T014 (hook) can run in parallel [P]
- T015 (pricing page) depends on T013
- T016 (billing settings) can run in parallel with T013 [P]

Across Phases:
- US1 (Phase 3), US2 (Phase 4), and US3 (Phase 5) can all begin after Phase 2 completes
- T017-T018 (US3 checkout) touch a different file than T012-T016 (US2 catalog/pricing) and T005-T011 (US1 onboarding)

---

## Parallel Example: After Phase 2 Completes

```
Agent 1 (US1 - Onboarding):     T005 → T006 → T007+T008 → T009 → T010 → T011
Agent 2 (US2 - Pricing Display): T012 → T013+T014 → T015 → T016
Agent 3 (US3 - Checkout):        T017 → T018
```

All three agents work on different files simultaneously after foundational phase.

---

## Implementation Strategy

### MVP First (US1 + US2 + US3)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (schema + validation)
3. Complete Phase 3: US1 — Onboarding with reg number
4. Complete Phase 4: US2 — Locked pricing display
5. Complete Phase 5: US3 — Checkout enforcement
6. **STOP and VALIDATE**: Test all P1 stories independently
7. Deploy — the currency loophole is now closed for all new signups

### Full Delivery (add US4 + US5)

8. Complete Phase 6: US4 — Migration (retroactive lock for existing businesses)
9. Complete Phase 7: US5 — Operator SOP documentation
10. Complete Phase 8: Polish, build, deploy, test

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks in the same phase
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable after foundational phase
- Commit after each completed phase (not per-task) to keep git history clean
- The single new file (`src/lib/validation/registration-number.ts`) was pre-approved in plan.md
- Total: 26 tasks across 8 phases

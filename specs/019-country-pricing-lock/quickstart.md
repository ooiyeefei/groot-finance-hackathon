# Quickstart: Country-Based Pricing Lockdown

**Branch**: `019-country-pricing-lock` | **Date**: 2026-02-25

## Build Sequence

Implementation should follow this order due to dependencies between components.

### Phase A: Foundation (Schema + Validation)

**Goal**: Data model and shared validation in place.

1. **Convex Schema** — Add `businessRegNumber` and `subscribedCurrency` fields to `businesses` table in `convex/schema.ts`. Add `by_businessRegNumber` index. Deploy schema with `npx convex deploy --yes`.

2. **Registration Number Validator** — Create `src/lib/validation/registration-number.ts` with `isValidRegNumber()`, `normalizeRegNumber()`, and `getRegNumberFormatHint()`. This is a pure utility with no dependencies — can be validated with unit tests immediately.

### Phase B: Backend Enforcement (Mutations + API Routes)

**Goal**: Server-side lockdown enforced. Even without frontend changes, the system rejects invalid operations.

3. **Convex Mutation: `initializeBusinessFromOnboarding`** — Extend to accept `businessRegNumber` and `subscribedCurrency`. Add uniqueness check via index query before insert.

4. **Convex Mutation: `setBusinessRegion`** — New mutation for lazy-prompt flow (existing businesses declaring country). Includes ownership check, uniqueness check, and lock guard.

5. **Checkout API Route** — Add currency mismatch validation to `POST /api/v1/billing/checkout`. Fetch business's `subscribedCurrency`, compare with Stripe price currency, reject with 403 on mismatch. Log attempts.

6. **Catalog API Route** — Modify `GET /api/v1/billing/catalog` to override currency with `subscribedCurrency` for authenticated businesses. Return `currencyLocked: true` in response.

7. **Initialize Business API Route** — Modify `POST /api/v1/onboarding/initialize-business` to require and validate `businessRegNumber`. Call `normalizeRegNumber()` before storage. Return 409 on duplicate.

8. **Start Trial API Route** — Modify `POST /api/v1/onboarding/start-trial` to select currency-matched Stripe price based on `subscribedCurrency`.

### Phase C: Frontend Changes (Onboarding + Pricing UI)

**Goal**: Users see and interact with the lockdown.

9. **Onboarding Wizard Step 1** — Add registration number input field to `business-onboarding-modal.tsx` Step 1. Wire to `wizardData.businessRegNumber`. Add real-time validation using `isValidRegNumber()`. Show country-specific format hints.

10. **Onboarding Types & Hook** — Add `businessRegNumber` to `OnboardingWizardData` interface. Add Step 1 validation rule requiring `businessRegNumber` when `countryCode` is `'SG'` or `'MY'`.

11. **Business Initialization Service** — Pass `businessRegNumber` through `InitializeBusinessInput` to Convex mutation.

12. **Pricing Table** — Remove currency dropdown from `pricing-table.tsx`. Use `currencyLocked` flag from catalog API to determine display behavior. For unauthenticated visitors, use geo-IP-detected currency with no switcher.

13. **Billing Settings** — Update `billing-settings-content.tsx` to show locked currency label. Remove any currency-switching affordance.

### Phase D: Migration + Lazy Prompt

**Goal**: All accounts locked, existing users covered.

14. **Migration Function** — Create `migrateSubscribedCurrency` Convex mutation. Run in dry-run mode first, then apply.

15. **Lazy Prompt UI** — Create a country declaration prompt component shown on billing pages for businesses missing `subscribedCurrency`. Redirects to a simplified version of the country + reg number form from onboarding.

### Phase E: Verification

16. **Build Verification** — Run `npm run build` to ensure no type errors or build failures.

17. **Convex Deployment** — Run `npx convex deploy --yes` to deploy all schema and function changes to production.

18. **Manual Testing** — Test all acceptance scenarios from the spec:
    - New signup with SG UEN → SGD pricing locked
    - New signup with MY SSM → MYR pricing locked
    - Existing user sees locked pricing (no dropdown)
    - Currency mismatch checkout rejected
    - Migration run on staging

## Files Changed (Summary)

| File | Change Type | Phase |
|------|-------------|-------|
| `convex/schema.ts` | Modified — add 2 fields + 1 index | A |
| `src/lib/validation/registration-number.ts` | **New file** | A |
| `convex/functions/businesses.ts` | Modified — extend mutation + new mutation | B |
| `src/app/api/v1/billing/checkout/route.ts` | Modified — add currency validation | B |
| `src/app/api/v1/billing/catalog/route.ts` | Modified — override currency resolution | B |
| `src/app/api/v1/onboarding/initialize-business/route.ts` | Modified — require reg number | B |
| `src/app/api/v1/onboarding/start-trial/route.ts` | Modified — currency-matched price | B |
| `src/domains/onboarding/components/business-onboarding-modal.tsx` | Modified — add reg number field | C |
| `src/domains/onboarding/types/index.ts` | Modified — add field to interface | C |
| `src/domains/onboarding/hooks/use-onboarding-flow.ts` | Modified — add validation | C |
| `src/domains/onboarding/lib/business-initialization.service.ts` | Modified — pass reg number | C |
| `src/domains/billing/components/pricing-table.tsx` | Modified — remove currency dropdown | C |
| `src/domains/billing/components/billing-settings-content.tsx` | Modified — show locked currency | C |
| `src/app/[locale]/pricing/page.tsx` | Modified — remove currency prop logic | C |

## Critical Dependencies

- Convex schema must be deployed before any mutation changes (Phase A before B)
- Validation module must exist before onboarding UI uses it (Phase A before C)
- Backend enforcement should be in place before frontend changes go live (Phase B before C)
- Migration should run after all code is deployed (Phase D after B+C)

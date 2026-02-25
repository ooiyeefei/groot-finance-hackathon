# Research: Country-Based Pricing Lockdown

**Branch**: `019-country-pricing-lock` | **Date**: 2026-02-25

## R1: Registration Number Validation Patterns

**Decision**: Use regex-based format validation for UEN (Singapore) and SSM/ROC (Malaysia).

**Rationale**: Groot Admin already implements and validates these patterns in production. Format-only validation is sufficient for MVP — it prevents casual fraud without the complexity/cost of external government API calls (ACRA for SG, SSM for MY). Business registration numbers are public data, so format validation combined with uniqueness constraints provides adequate protection.

**Patterns**:
- **Singapore UEN**: `^([0-9]{8}[A-Z]|[STURF][0-9]{2}[A-Z]{2}[0-9]{4}[A-Z])$`
  - Examples: `200012345X`, `T20SS0001A`
- **Malaysia SSM/ROC**: `^([0-9]{7}-[A-Z]|[0-9]{12}|[A-Z]{2}[0-9]{7}-[A-Z])$`
  - Examples: `1234567-H`, `202301234567`, `SA0012345-A`

**Alternatives considered**:
- External API verification (ACRA/SSM): Too expensive and complex for MVP, adds external dependency
- No validation (free text): Too weak — doesn't prevent obviously fake entries
- IP-based geolocation: Easily bypassed with VPN, not authoritative

## R2: Convex Schema Extension Strategy

**Decision**: Add `businessRegNumber` (optional string) and `subscribedCurrency` (optional string) to the existing `businesses` table. Add a Convex index on `businessRegNumber` for uniqueness lookups.

**Rationale**: The businesses table already has `countryCode` and `homeCurrency`. Adding two fields keeps the schema simple. Convex doesn't support native unique constraints, so uniqueness must be enforced at the application layer (query + check before insert/update). An index on `businessRegNumber` enables efficient duplicate lookups.

**Alternatives considered**:
- Separate `business_registrations` table: Over-engineered for two fields; adds join complexity
- Storing on user record instead of business: Wrong — currency lock is per-business, not per-user (users can own multiple businesses in different countries)

## R3: Currency Lock Immutability Enforcement

**Decision**: Enforce immutability at the application layer (Convex mutations + Next.js API routes), not at the database level.

**Rationale**: Convex doesn't support database-level constraints (CHECK, triggers). The three enforcement points are:
1. **Convex mutation**: Reject writes to `subscribedCurrency` if already set (except operator override)
2. **Checkout API route**: Validate Stripe price currency matches `subscribedCurrency` before creating checkout session
3. **Catalog API route**: Return only locked-currency prices for authenticated businesses

**Alternatives considered**:
- Database-level constraint: Not available in Convex
- Stripe-side restriction: Stripe doesn't support per-customer currency restrictions natively

## R4: Currency Dropdown Removal Strategy

**Decision**: Remove the currency dropdown entirely from `PricingTable`. Currency is determined by: (1) business's `subscribedCurrency` for authenticated users, or (2) geo-IP for unauthenticated visitors. No manual switching.

**Rationale**: The dropdown is the root of the problem. Even showing it "disabled" could confuse users. Clean removal with server-determined currency is the simplest and most secure approach. Matches Groot Admin's implementation.

**Key files affected**:
- `src/domains/billing/components/pricing-table.tsx` — Remove dropdown UI (lines 151-168)
- `src/app/api/v1/billing/catalog/route.ts` — Override query param with locked currency (lines 26-64)
- `src/app/[locale]/pricing/page.tsx` — Pass locked currency from business context or geo-IP

**Alternatives considered**:
- Disabled dropdown showing locked currency: More complex UI, no benefit
- Hide only for locked businesses: Inconsistent UX between locked/unlocked states

## R5: Onboarding Flow Modification

**Decision**: Add business registration number field to Step 1 (Business Details) of the existing 5-step onboarding wizard, below the country dropdown. The field appears after country is selected and validates in real-time.

**Rationale**: Step 1 already collects `countryCode` and `homeCurrency`. Adding registration number here is the natural fit — it's part of business identity. No need for a new step (which would change the WIZARD_STEPS array and break the progress indicator).

**Key files affected**:
- `src/domains/onboarding/components/business-onboarding-modal.tsx` — Add field to Step 1 (lines 365-451)
- `src/domains/onboarding/types/index.ts` — Add `businessRegNumber` to `OnboardingWizardData`
- `src/domains/onboarding/hooks/use-onboarding-flow.ts` — Add Step 1 validation for reg number
- `src/app/api/v1/onboarding/initialize-business/route.ts` — Accept and validate reg number
- `src/domains/onboarding/lib/business-initialization.service.ts` — Pass reg number to Convex
- `convex/functions/businesses.ts` — Add `businessRegNumber` to `initializeBusinessFromOnboarding` mutation

**Alternatives considered**:
- New wizard step (Step 1.5): Increases friction, changes progress UX
- Post-onboarding prompt: Allows businesses to exist without reg number, weakens enforcement

## R6: Migration Strategy for Existing Businesses

**Decision**: One-time Convex migration function that:
1. Businesses with active Stripe subscriptions: Auto-lock `subscribedCurrency` based on Stripe subscription's price currency
2. Businesses with `countryCode` but no subscription: Auto-lock based on `COUNTRY_TO_CURRENCY[countryCode]`
3. Businesses with neither: Leave unlocked (lazy prompt on billing page access)

**Rationale**: Most existing businesses are MYR (the original and primary market). The migration should be non-disruptive — users don't need to do anything. Only the small number of businesses without country data need manual intervention.

**Alternatives considered**:
- Force all users to re-declare country: Too disruptive for existing paying customers
- Admin manually sets each account: Doesn't scale even for current user base

## R7: Existing `businessRegistrationNumber` Field

**Decision**: The `businesses` table already has a field called `businessRegistrationNumber` (used for LHDN e-Invoice). We will add a **new** field `businessRegNumber` specifically for country-pricing lockdown, keeping them separate.

**Rationale**: The existing `businessRegistrationNumber` field is used for LHDN/Peppol e-Invoice submission and may contain partial or country-specific tax data. The new `businessRegNumber` field serves a different purpose (billing country lockdown) and has different validation rules (UEN format for SG vs SSM format for MY). Conflating the two would create ambiguity and coupling between billing and e-invoice features.

**Alternatives considered**:
- Reuse existing `businessRegistrationNumber`: Risk of breaking e-invoice functionality; different validation rules per feature
- Rename existing field: Breaking change across e-invoice codebase

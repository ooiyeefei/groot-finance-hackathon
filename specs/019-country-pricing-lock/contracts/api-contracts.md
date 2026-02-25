# API Contracts: Country-Based Pricing Lockdown

**Branch**: `019-country-pricing-lock` | **Date**: 2026-02-25

## Modified Endpoints

### 1. POST `/api/v1/onboarding/initialize-business` (Modified)

**Change**: Add `businessRegNumber` to request body.

**Request Body** (additions in bold):
```typescript
{
  name: string
  countryCode: string          // 'SG' | 'MY'
  homeCurrency: string         // 'SGD' | 'MYR'
  businessType: string
  selectedPlan: string
  customCOGSNames: string[]
  customExpenseNames: string[]
  forceCreateNew?: boolean
  businessRegNumber: string    // NEW: UEN (SG) or SSM/ROC (MY) — required
}
```

**New Validation**:
- `businessRegNumber` is required (non-empty after trim)
- Must match format for declared `countryCode` (UEN for SG, SSM for MY)
- Must be unique across all businesses (409 Conflict if duplicate)

**New Error Responses**:
| Status | Condition | Body |
|--------|-----------|------|
| 400 | Invalid registration number format | `{ error: "Invalid registration number format for [country]. Expected format: [example]" }` |
| 409 | Registration number already in use | `{ error: "This registration number is already associated with another business account" }` |

**Side Effect**: Sets `subscribedCurrency` based on `COUNTRY_TO_CURRENCY[countryCode]` during business creation.

---

### 2. GET `/api/v1/billing/catalog` (Modified)

**Change**: Override currency resolution for authenticated businesses with locked currency.

**Current Resolution Chain** (priority order):
1. `?currency=` query parameter
2. User's business `homeCurrency`
3. `x-vercel-ip-country` header → `COUNTRY_TO_CURRENCY`
4. Default: `'MYR'`

**New Resolution Chain**:
1. **Authenticated + `subscribedCurrency` set** → Use `subscribedCurrency` (ignore all other sources)
2. Unauthenticated → `x-vercel-ip-country` header → `COUNTRY_TO_CURRENCY`
3. Default: `'MYR'`

**New Response Field**:
```typescript
{
  data: {
    plans: CatalogPlan[]
    currency: string
    availableCurrencies: string[]   // Now returns single-item array for locked businesses
    currencyLocked: boolean         // NEW: true if business has subscribedCurrency set
  }
}
```

---

### 3. POST `/api/v1/billing/checkout` (Modified)

**Change**: Add currency mismatch validation before creating Stripe checkout session.

**New Validation** (after authentication, before Stripe call):
1. Fetch business from Convex (already done)
2. If `business.subscribedCurrency` is set:
   - Resolve the Stripe price's currency from the price ID
   - If price currency ≠ `subscribedCurrency` → reject with 403
3. If `business.subscribedCurrency` is NOT set:
   - Set `subscribedCurrency` based on checkout currency (first-checkout lock)

**New Error Response**:
| Status | Condition | Body |
|--------|-----------|------|
| 403 | Currency mismatch | `{ error: "This account is configured for [currency] billing. Cannot checkout with [attempted currency] pricing." }` |

**Logging**: Currency mismatch attempts logged with business ID, attempted currency, and locked currency for fraud monitoring.

---

### 4. POST `/api/v1/onboarding/start-trial` (Modified)

**Change**: Use `subscribedCurrency` to select the correct Stripe price for trial subscription.

**Current Behavior**: Uses a hardcoded Pro plan price ID.

**New Behavior**:
1. Fetch business from Convex
2. Determine currency from `business.subscribedCurrency` (set during `initialize-business`)
3. Select the Pro plan price ID matching that currency from Stripe catalog
4. Create trial subscription with the currency-matched price

---

## Modified Convex Functions

### 5. `initializeBusinessFromOnboarding` Mutation (Modified)

**Change**: Accept `businessRegNumber` and `subscribedCurrency` in args.

**New Args**:
```typescript
businessRegNumber: v.optional(v.string())    // Normalized UEN/SSM
subscribedCurrency: v.optional(v.string())   // 'SGD' | 'MYR'
```

**New Logic**:
1. If `businessRegNumber` provided: Query `by_businessRegNumber` index to check uniqueness
2. If duplicate found: Throw error (caller returns 409)
3. Store `businessRegNumber` and `subscribedCurrency` on business record

---

### 6. New: `setBusinessRegion` Mutation

**Purpose**: For existing businesses (lazy prompt flow) to declare country + reg number.

**Args**:
```typescript
{
  businessId: v.id("businesses")
  countryCode: v.string()          // 'SG' | 'MY'
  businessRegNumber: v.string()    // Validated format
  subscribedCurrency: v.string()   // 'SGD' | 'MYR'
}
```

**Logic**:
1. Verify caller is business owner
2. Verify `subscribedCurrency` is not already set (409 if locked)
3. Check `businessRegNumber` uniqueness via index
4. Update business record with all three fields

**Error Cases**:
| Condition | Error |
|-----------|-------|
| Already locked | `"Country and currency are already locked for this business"` |
| Duplicate reg number | `"Registration number already in use"` |
| Not business owner | `"Only business owners can set country"` |

---

### 7. New: `migrateSubscribedCurrency` Mutation

**Purpose**: One-time migration to backfill `subscribedCurrency` for existing businesses.

**Args**:
```typescript
{
  dryRun: v.boolean()   // true = report only, false = apply changes
}
```

**Logic**:
1. Query all businesses where `subscribedCurrency` is undefined
2. For each business:
   - If has Stripe subscription → determine currency from subscription price
   - Else if has `countryCode` → map to currency via `COUNTRY_TO_CURRENCY`
   - Else → skip (leave for lazy prompt)
3. Return count of businesses updated/skipped

---

## New Validation Module

### 8. `src/lib/validation/registration-number.ts`

**Exports**:
```typescript
// Validate registration number format against country
export function isValidRegNumber(value: string, country: 'SG' | 'MY'): boolean

// Normalize registration number (trim + uppercase)
export function normalizeRegNumber(value: string): string

// Get human-readable format description for error messages
export function getRegNumberFormatHint(country: 'SG' | 'MY'): string
```

**Shared**: Used by both Next.js API routes (server-side) and onboarding components (client-side) for consistent validation.

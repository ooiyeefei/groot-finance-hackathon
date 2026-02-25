# Data Model: Country-Based Pricing Lockdown

**Branch**: `019-country-pricing-lock` | **Date**: 2026-02-25

## Entity: Business Profile (Extended)

### New Fields on `businesses` Table

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `businessRegNumber` | `string` (optional) | Required for new businesses | `undefined` | Normalized business registration number (UEN for SG, SSM/ROC for MY). Trimmed and uppercased before storage. |
| `subscribedCurrency` | `string` (optional) | Set during onboarding or migration | `undefined` | Locked billing currency: `'SGD'` or `'MYR'`. Immutable after first subscription checkout (application-enforced). |

### New Index

| Index Name | Fields | Purpose |
|------------|--------|---------|
| `by_businessRegNumber` | `["businessRegNumber"]` | Enable efficient uniqueness checks — query by reg number to detect duplicates before insert |

### Existing Fields (Context — No Changes)

| Field | Type | Current Use | Relationship to New Fields |
|-------|------|-------------|---------------------------|
| `countryCode` | `string` (optional) | ISO country code (e.g., `'SG'`, `'MY'`) | Source of truth for country; determines which reg number format to validate against |
| `homeCurrency` | `string` (required) | Default operating currency for the business | May differ from `subscribedCurrency` in edge cases; `subscribedCurrency` takes precedence for billing |
| `businessRegistrationNumber` | `string` (optional) | LHDN/Peppol e-Invoice field | **Separate purpose** — not used for pricing lockdown. Keep independent. |
| `stripeCustomerId` | `string` (optional) | Stripe customer link | Used during checkout to validate currency match |
| `subscriptionStatus` | `string` (optional) | Current subscription state | Used during migration to identify active subscribers |
| `planName` | `string` (optional) | Current plan tier | Not affected by this feature |

## State Machine: Currency Lock Lifecycle

```
                    ┌─────────────┐
                    │   UNLOCKED  │  subscribedCurrency = undefined
                    │  (new biz)  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
     ┌────────────┐ ┌───────────┐ ┌──────────────┐
     │ ONBOARDING │ │ MIGRATION │ │ LAZY PROMPT  │
     │  (new biz) │ │ (existing)│ │(no country)  │
     └─────┬──────┘ └─────┬─────┘ └──────┬───────┘
           │              │              │
           │  Country +   │ Auto-lock    │ User declares
           │  Reg number  │ from data    │ country + reg#
           │  declared    │              │
           ▼              ▼              ▼
     ┌─────────────────────────────────────────┐
     │              DECLARED                    │  subscribedCurrency = 'SGD' | 'MYR'
     │  (country set, awaiting first checkout)  │  (set from countryCode mapping)
     └───────────────────┬─────────────────────┘
                         │
                         │ First checkout completes
                         │ (Stripe webhook confirms)
                         ▼
     ┌─────────────────────────────────────────┐
     │               LOCKED                     │  subscribedCurrency = 'SGD' | 'MYR'
     │  (immutable — no changes permitted)      │  (immutable from this point)
     └─────────────────────────────────────────┘
                         │
                         │ Operator override only
                         ▼
     ┌─────────────────────────────────────────┐
     │           OPERATOR CORRECTED             │  subscribedCurrency changed
     │  (manual correction via Convex dashboard)│  (rare support case)
     └─────────────────────────────────────────┘
```

**Transition Rules**:
- UNLOCKED → DECLARED: Set during onboarding (new) or migration (existing with `countryCode`)
- DECLARED → LOCKED: Set when first Stripe checkout succeeds (webhook confirmation)
- LOCKED → OPERATOR CORRECTED: Only via direct Convex dashboard edit (no API)
- **No user-facing path from LOCKED back to DECLARED or UNLOCKED**

## Validation Rules

### Business Registration Number

| Country | Format | Regex | Examples |
|---------|--------|-------|----------|
| SG (Singapore) | UEN | `^([0-9]{8}[A-Z]\|[STURF][0-9]{2}[A-Z]{2}[0-9]{4}[A-Z])$` | `200012345X`, `T20SS0001A` |
| MY (Malaysia) | SSM/ROC | `^([0-9]{7}-[A-Z]\|[0-9]{12}\|[A-Z]{2}[0-9]{7}-[A-Z])$` | `1234567-H`, `202301234567`, `SA0012345-A` |

**Normalization**: Before validation, input is trimmed of whitespace and converted to uppercase.

**Uniqueness**: Application-enforced via Convex index query before insert. Two businesses cannot share the same `businessRegNumber`.

### Subscribed Currency

| Rule | Enforcement Point |
|------|-------------------|
| Must be `'SGD'` or `'MYR'` (or `undefined`) | Convex mutation argument validation |
| Immutable after first checkout | Convex mutation rejects update if already set |
| Must match `COUNTRY_TO_CURRENCY[countryCode]` | API route validates mapping before setting |
| Checkout price currency must match | Checkout API route validates before creating Stripe session |

## Country-to-Currency Mapping

| Country Code | Currency Code | Currency Symbol |
|-------------|---------------|-----------------|
| `SG` | `SGD` | `S$` |
| `MY` | `MYR` | `RM` |

All other countries default to `MYR` for unauthenticated pricing display.

## Migration Data Mapping

| Source Condition | `subscribedCurrency` Value | `businessRegNumber` Value |
|-----------------|---------------------------|--------------------------|
| Active Stripe subscription with MYR price | `'MYR'` | `undefined` (not required retroactively) |
| Active Stripe subscription with SGD price | `'SGD'` | `undefined` (not required retroactively) |
| Trial with `countryCode = 'SG'` | `'SGD'` | `undefined` |
| Trial with `countryCode = 'MY'` or other | `'MYR'` | `undefined` |
| No subscription, has `countryCode` | Mapped from `countryCode` | `undefined` |
| No subscription, no `countryCode` | `undefined` (lazy prompt) | `undefined` |

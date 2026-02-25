# Operator SOP: Manual Country & Currency Assignment

**Feature**: 019-Country-Based-Pricing-Lock
**Audience**: Groot Finance operators (internal team)

## When to Use

- Business contacted support to correct their country/currency
- Migration missed a business (no `subscribedCurrency` set)
- Edge case where automated flows didn't set the fields correctly

## Prerequisites

- Access to the [Convex Dashboard](https://dashboard.convex.dev/)
- Knowledge of the business's correct country (SG or MY) and registration number

## Steps

### 1. Find the Business

1. Open Convex Dashboard → Data → `businesses` table
2. Search by business name or ID
3. Confirm the business identity with the support requester

### 2. Set Country & Currency Fields

Edit the business document and set these fields:

| Field | Value | Example |
|-------|-------|---------|
| `countryCode` | `"SG"` or `"MY"` | `"SG"` |
| `subscribedCurrency` | `"SGD"` or `"MYR"` | `"SGD"` |
| `businessRegNumber` | Valid UEN (SG) or SSM/ROC (MY) number | `"200012345X"` |

**Currency mapping**:
- Singapore (`SG`) → `SGD`
- Malaysia (`MY`) → `MYR`

### 3. Validate Registration Number Format

Before saving, verify the registration number format:

**Singapore UEN**:
- 9 characters: 8 digits + 1 letter (e.g., `200012345X`)
- Or entity prefix format: `S/T/U/R/F` + 2 digits + 2 letters + 4 digits + 1 letter (e.g., `T08LL0001A`)

**Malaysia SSM/ROC**:
- Old format: 7 digits + hyphen + 1 letter (e.g., `1234567-H`)
- New format: 12 digits (e.g., `202001012345`)
- Entity prefix: 2 letters + 7 digits + hyphen + 1 letter (e.g., `LL1234567-A`)

### 4. Check for Duplicates

Before saving `businessRegNumber`:
1. In the businesses table, search/filter for the same registration number
2. If another business already has this number, do NOT proceed — investigate the conflict

### 5. Verify After Saving

1. Ask the business owner to refresh their billing page
2. Confirm they see the correct currency (SGD or MYR)
3. Confirm the currency dropdown is not visible (locked)
4. Confirm the pricing page shows prices in the locked currency only

## Important Notes

- `subscribedCurrency` is **permanent** — once set, it cannot be changed through the UI
- To correct an incorrect `subscribedCurrency`, it must be changed directly in the Convex dashboard
- Always set all three fields together (`countryCode`, `subscribedCurrency`, `businessRegNumber`)
- The `businessRegNumber` field is separate from `businessRegistrationNumber` (which is for LHDN e-Invoice)

# Data Model: ROI Calculator

## Entities

### CalculationInput (client-side only)
No persistence — lives in React state and URL query params.

| Field | Type | Constraints | URL Param |
|-------|------|-------------|-----------|
| purchaseInvoices | number | 0–10,000, integer | `pi` |
| salesInvoices | number | 0–10,000, integer | `si` |
| expenseReceipts | number | 0–10,000, integer | `er` |
| financeStaff | number | 1–100, integer | `staff` |
| monthlySalary | number | 0–100,000, 2 decimals | `salary` |
| currency | 'MYR' \| 'SGD' \| 'USD' | default: 'MYR' | `currency` |

### CalculationResult (derived, not stored)

| Field | Type | Derived From |
|-------|------|-------------|
| hoursSavedPerMonth | number | (pi×8 + si×6 + er×4) / 60 |
| annualCostSavings | number | hoursSaved × (salary/176) × 12 |
| paybackPeriodMonths | number | grootPrice / monthlySavings |
| timeSpentPercent | number | hoursSaved / (staff × 176) × 100 |

### Partner (static config)

| Field | Type | Description |
|-------|------|-------------|
| code | string | URL identifier (e.g., "acme") |
| name | string | Display name (e.g., "Acme Consulting") |
| contactUrl | string | Email mailto: or booking page URL |

## State Transitions
None — this feature is stateless. All data lives in client state and URL params.

## No Database Tables
No Convex tables created. Zero bandwidth impact.

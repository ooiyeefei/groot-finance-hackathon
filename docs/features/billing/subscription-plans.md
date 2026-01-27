# Subscription Plans & Billing

FinanSEAL uses a tiered subscription model with features controlled via Stripe product metadata.

## Plan Overview

| Plan | In Stripe? | Pricing | Notes |
|------|------------|---------|-------|
| **Trial** | No | Free (14 days) | Hardcoded in `TRIAL_PLAN` constant |
| **Starter** | Yes | MYR 99/month | Fetched from Stripe product metadata |
| **Pro** | Yes | MYR 299/month | Fetched from Stripe product metadata |
| **Enterprise** | No | Custom | Hardcoded in `FALLBACK_PLANS.enterprise` |

## Stripe Product Metadata

### Required Fields

```
plan_key: 'starter' | 'pro'
ocr_limit: number (e.g., '30', '100')
team_limit: number (e.g., '5', '13')
```

### Feature Flags

| Metadata Key | Display Name | Starter | Pro | Enterprise |
|--------------|--------------|:-------:|:---:|:----------:|
| `feature_custom_categories` | Custom business categories | ✓ | ✓ | ✓ |
| `feature_ai_categorization` | AI auto categorization | ✓ | ✓ | ✓ |
| `feature_approval_workflow` | Advanced approval workflow | ✓ | ✓ | ✓ |
| `feature_multi_currency` | Multi-currency tracking | ✓ | ✓ | ✓ |
| `feature_rbac` | Role-based access control | ✓ | ✓ | ✓ |
| `feature_ai_chat` | AI chat assistant | | ✓ | ✓ |
| `feature_multi_tenancy` | Multi-tenancy support | | ✓ | ✓ |
| `feature_vendor_management` | Vendor management | | | ✓ |
| `feature_dedicated_manager` | Dedicated account manager | | | ✓ |
| `feature_custom_integrations` | Custom integrations | | | ✓ |
| `feature_sla_guarantee` | SLA guarantee | | | ✓ |
| `feature_on_premise` | On-premise option | | | ✓ |
| `feature_unlimited_ocr` | Unlimited OCR scans | | | ✓ |

### Auto-Generated Features

From limits:
- `ocr_limit: 30` → "30 OCR scans/month"
- `team_limit: 5` → "Up to 5 team members"
- `ocr_limit: -1` → "Unlimited OCR scans"
- `team_limit: -1` → "Unlimited team members"

## Key Files

| File | Purpose |
|------|---------|
| `src/lib/stripe/catalog.ts` | Plan config, feature mapping, Stripe fetching |
| `src/lib/stripe/plans.ts` | Public API for plan data |
| `src/app/api/v1/billing/subscription/route.ts` | Subscription API endpoint |
| `src/domains/billing/hooks/use-subscription.ts` | Client hook for subscription data |
| `src/app/[locale]/settings/billing/page.tsx` | Billing settings UI |

## Feature Resolution Flow

```
1. Start with fallback defaults (TRIAL_PLAN, FALLBACK_PLANS)
2. Fetch products from Stripe
3. Parse metadata for each product with plan_key
4. Build features array from feature_* metadata fields
5. Override fallback with Stripe data
6. Return to client via /api/v1/billing/subscription
```

## Adding New Features

1. Add to `FEATURE_METADATA_MAP` in `catalog.ts`
2. Add to relevant `FALLBACK_PLANS` features array
3. Set `feature_xxx: true` in Stripe product metadata
4. Update this documentation

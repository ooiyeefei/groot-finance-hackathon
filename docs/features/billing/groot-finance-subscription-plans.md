# Subscription Plans & Billing

FinanSEAL uses a tiered subscription model with features controlled via Stripe product metadata.

> **Full pricing strategy:** See [pricing-strategy.md](./pricing-strategy.md) for complete tier details, feature matrix, and decision rationale.

## Plan Overview

| Plan | In Stripe? | Pricing | Team | OCR | AI Chat | Invoices |
|------|------------|---------|------|-----|---------|----------|
| **Trial** | No | Free (14 days) | 3 pax | 100 total | 30 total | 10 total |
| **Starter** | Yes | MYR 249/month (launch) / MYR 299 (list) | 20 pax | 150/mo | 30 msg/mo | 10/mo |
| **Pro** | Yes | MYR 599/month | 50 pax | 500/mo | 300 msg/mo | Unlimited |
| **Enterprise** | No | Custom | Unlimited | Unlimited | Unlimited | Unlimited |

## Stripe Product Metadata

> **Enterprise is NOT in Stripe.** Custom pricing handled via manual invoicing / offline contract.

### Complete Metadata — Starter

```
# Identity & Limits
plan_key                    = starter
team_limit                  = 20
ocr_limit                   = 150
ai_message_limit            = 30
invoice_limit               = 10
einvoice_limit              = 100
action_center_limit         = 0
is_custom_pricing           = false

# All-plan features (true for both Starter and Pro — pricing card bullet points)
feature_custom_categories   = true
feature_ai_categorization   = true
feature_approval_workflow   = true
feature_multi_currency      = true
feature_rbac                = true
feature_ai_chat             = true
feature_basic_invoicing     = true
feature_batch_submissions   = true
feature_leave_management    = true
feature_basic_sst           = true
feature_einvoice            = true
feature_multilang_chat      = true
feature_rag_compliance      = true

# Pro-only features (false for Starter)
feature_duplicate_detection = false
feature_full_ar             = false
feature_full_ap             = false
feature_full_sst            = false
feature_action_cards        = false
feature_export_templates    = false
feature_scheduled_exports   = false
feature_audit_trail         = false
feature_advanced_analytics  = false
```

### Complete Metadata — Pro

```
# Identity & Limits
plan_key                    = pro
team_limit                  = 50
ocr_limit                   = 500
ai_message_limit            = 300
invoice_limit               = -1
einvoice_limit              = -1
action_center_limit         = 15
is_custom_pricing           = false

# All-plan features (true for both Starter and Pro — pricing card bullet points)
feature_custom_categories   = true
feature_ai_categorization   = true
feature_approval_workflow   = true
feature_multi_currency      = true
feature_rbac                = true
feature_ai_chat             = true
feature_basic_invoicing     = true
feature_batch_submissions   = true
feature_leave_management    = true
feature_basic_sst           = true
feature_einvoice            = true
feature_multilang_chat      = true
feature_rag_compliance      = true

# Pro-only features (true for Pro)
feature_duplicate_detection = true
feature_full_ar             = true
feature_full_ap             = true
feature_full_sst            = true
feature_action_cards        = true
feature_export_templates    = true
feature_scheduled_exports   = true
feature_audit_trail         = true
feature_advanced_analytics  = true
```

### Design Principles

1. **Limits gate quantity, flags gate capability.** Capped features use `*_limit` (-1 = unlimited).
2. **All-plan features are `true` on BOTH plans.** They generate pricing card bullet points. Code does NOT gate on these — they're always enabled. They exist in Stripe for UI display.
3. **Tier-gated features differ between plans.** `false` on Starter, `true` on Pro. Code checks these to gate access.
4. **No `feature_multi_tenancy`.** Internal architecture, not customer-facing. Always enabled.

### Auto-Generated Feature Labels (from limits)

- `ocr_limit: 150` → "150 OCR scans/month"
- `team_limit: 20` → "Up to 20 team members"
- `ai_message_limit: 30` → "30 AI chat messages/month"
- `invoice_limit: 10` → "10 sales invoices/month"
- `einvoice_limit: 100` → "100 LHDN e-invoices/month"
- `action_center_limit: 15` → "15 proactive insights/month"
- `*_limit: -1` → "Unlimited" variant

## Add-On Products

| Product | Stripe Metadata | Price |
|---|---|---|
| AI Chat Boost (50 msgs) | `addon_type: ai_credits`, `message_count: 50` | MYR 79 |
| AI Chat Power (150 msgs) | `addon_type: ai_credits`, `message_count: 150` | MYR 199 |
| Extra OCR Pack (100 scans) | `addon_type: ocr_credits`, `scan_count: 100` | MYR 49 |

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
4. Update this documentation and `pricing-strategy.md`

## Usage Tracking

| Resource | Tracking Location | Reset Cycle |
|---|---|---|
| OCR scans | `ocr_usage` table (per-business, per-month) | Monthly |
| AI chat messages | `ai_message_usage` (per-business, per-month) | Monthly |
| Sales invoices | Count from `sales_invoices` table (per-business, per-month) | Monthly |
| LHDN e-invoices | `einvoice_usage` table (per-business, per-month) | Monthly |
| Team members | Count from `business_memberships` table (per-business) | N/A (hard limit) |
| Credit packs | Separate tracking with 90-day expiry | 90-day expiry |

## Tax on Subscriptions

| Market | Tax | Rate | Display |
|---|---|---|---|
| Malaysia | Service Tax (SST) | 8% | Prices exclusive + SST line item |
| Singapore | GST | 9% | Prices exclusive + GST line item |

Stripe Tax handles calculation and collection automatically.

## Annual Billing

### Standard Annual (10% off — permanent baseline)

| Plan | Monthly | Annual (10% off) | Savings |
|---|---|---|---|
| Starter | RM 249/mo | RM 2,689/yr | 10% |
| Pro | RM 599/mo | RM 6,469/yr | 10% |

### Launch Promo Annual (17% off — first term only, expires June 30, 2026)

| Plan | Monthly | Launch Annual (17% off) | Renewal Annual (10% off) |
|---|---|---|---|
| Starter | RM 249/mo | RM 2,490/yr | RM 2,689/yr |
| Pro | RM 599/mo | RM 5,990/yr | RM 6,469/yr |

> **Note:** Launch promo annual prices are separate Stripe price IDs. After June 30, 2026, archive the promo prices so new customers only see the standard 10% annual rate. Existing promo customers renew at standard rate via Stripe subscription schedule.
>
> **Singapore (SGD)** pricing is managed as a separate market with separate Stripe products/prices. Will be configured when SG market launches.

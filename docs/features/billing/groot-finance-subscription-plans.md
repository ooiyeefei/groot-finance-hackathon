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

### Required Fields

```
plan_key: 'starter' | 'pro'
team_limit: number (e.g., '20', '50')
ocr_limit: number (e.g., '150', '500')
ai_message_limit: number (e.g., '30', '300')
invoice_limit: number (e.g., '10', '-1' for unlimited)
einvoice_limit: number (e.g., '100', '-1' for unlimited)
```

### Feature Flags

| Metadata Key | Display Name | Starter | Pro | Enterprise |
|--------------|--------------|:-------:|:---:|:----------:|
| `feature_custom_categories` | Custom business categories | ✓ | ✓ | ✓ |
| `feature_ai_categorization` | AI auto categorization | ✓ | ✓ | ✓ |
| `feature_approval_workflow` | Approval workflow | ✓ | ✓ | ✓ |
| `feature_multi_currency` | Multi-currency tracking | ✓ | ✓ | ✓ |
| `feature_rbac` | Role-based access control | ✓ | ✓ | ✓ |
| `feature_basic_invoicing` | Basic invoicing (10/mo) | ✓ | ✓ | ✓ |
| `feature_ai_chat` | AI chat assistant (limited) | ✓ | ✓ | ✓ |
| `feature_einvoice` | LHDN e-Invoice / SG InvoiceNow | ✓ | ✓ | ✓ |
| `feature_basic_sst` | Basic SST rate tracking (8%/5%/10%) | ✓ | ✓ | ✓ |
| `feature_full_sst` | Full SST category management & input tax | | ✓ | ✓ |
| `feature_batch_submissions` | Batch receipt submission | | ✓ | ✓ |
| `feature_duplicate_detection` | Duplicate expense detection | | ✓ | ✓ |
| `feature_full_ar` | Full AR suite (debtors, aging, recurring) | | ✓ | ✓ |
| `feature_full_ap` | Full AP suite (vendors, aging, price intel) | | ✓ | ✓ |
| `feature_advanced_leave` | Advanced leave (calendar, custom types) | | ✓ | ✓ |
| `feature_action_cards` | Chat action cards | | ✓ | ✓ |
| `feature_rag_compliance` | RAG regulatory compliance | | ✓ | ✓ |
| `feature_multilang_chat` | Multi-language chat (TH, ID, ZH) | | ✓ | ✓ |
| `feature_action_center` | Proactive AI insights | | ✓ | ✓ |
| `feature_anomaly_detection` | Anomaly detection | | ✓ | ✓ |
| `feature_advanced_analytics` | Advanced analytics & charts | | ✓ | ✓ |
| `feature_export_templates` | Pre-built export templates | | ✓ | ✓ |
| `feature_scheduled_exports` | Scheduled CSV exports | | ✓ | ✓ |
| `feature_audit_trail` | Audit trail | | ✓ | ✓ |
| `feature_cash_flow_forecast` | Cash flow forecasting | | | ✓ |
| `feature_financial_intelligence` | Financial intelligence | | | ✓ |
| `feature_mcp_api` | MCP Server / API access | | | ✓ |
| `feature_custom_integrations` | Custom integrations | | | ✓ |
| `feature_dedicated_manager` | Dedicated account manager | | | ✓ |
| `feature_sla_guarantee` | SLA guarantee | | | ✓ |
| `feature_unlimited_ocr` | Unlimited OCR scans | | | ✓ |

### Auto-Generated Features

From limits:
- `ocr_limit: 150` -> "150 OCR scans/month"
- `team_limit: 20` -> "Up to 20 team members"
- `ai_message_limit: 30` -> "30 AI chat messages/month"
- `invoice_limit: 10` -> "10 sales invoices/month"
- `einvoice_limit: 100` -> "100 LHDN e-invoices/month"
- `*_limit: -1` -> "Unlimited" variant

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

| Plan | Monthly | Annual | Savings |
|---|---|---|---|
| Starter (MY) | RM 249/mo | RM 2,490/yr | 17% (2 months free) |
| Pro (MY) | RM 599/mo | RM 5,990/yr | 17% (2 months free) |
| Starter (SG) | SGD 149/mo | SGD 1,490/yr | 17% (2 months free) |
| Pro (SG) | SGD 349/mo | SGD 3,490/yr | 17% (2 months free) |

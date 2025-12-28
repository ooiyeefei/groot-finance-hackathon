# Billing Domain

**Purpose**: Stripe subscription billing, plan management, and OCR usage tracking.

**Pattern**: Following [Next.js SaaS Starter](https://github.com/nextjs/saas-starter)

---

## Architecture Overview

```
📁 billing/
├── CLAUDE.md              # This file
├── components/
│   ├── pricing-table.tsx  # Plan selection UI
│   ├── billing-settings.tsx # Subscription management
│   ├── usage-dashboard.tsx  # OCR usage display
│   ├── invoice-list.tsx     # Invoice history
│   ├── subscription-card.tsx # Compact subscription summary (Settings)
│   └── upgrade-banner.tsx   # Free plan upgrade CTA (Dashboard)
├── hooks/
│   ├── use-subscription.ts  # Subscription state
│   └── use-usage.ts         # Usage tracking
├── services/
│   └── (future services)
└── types/
    └── billing.ts           # Type definitions
```

---

## Design Principles

### 1. Stripe is Source of Truth
- Local database caches subscription status for fast queries
- All subscription operations go through Stripe API
- Webhooks keep local state in sync

### 2. Hosted Solutions Over Custom
- **Stripe Checkout**: PCI-compliant payment collection
- **Stripe Customer Portal**: Self-service subscription management
- Reduces development complexity and security burden

### 3. Per-Business Billing
- Subscriptions are linked to businesses, not users
- Team members share the business subscription
- `businesses.plan_name` determines feature access

---

## Database Schema

### businesses table (5 new columns)
```sql
stripe_customer_id TEXT UNIQUE       -- cus_xxx
stripe_subscription_id TEXT UNIQUE   -- sub_xxx
stripe_product_id TEXT               -- prod_xxx
plan_name TEXT DEFAULT 'free'        -- 'free' | 'pro' | 'enterprise'
subscription_status TEXT             -- 'active' | 'canceled' | 'past_due' | ...
```

### stripe_events table (idempotency)
```sql
event_id TEXT PRIMARY KEY            -- evt_xxx (Stripe event ID)
event_type TEXT NOT NULL             -- e.g., 'customer.subscription.updated'
processed_at TIMESTAMPTZ
```

### ocr_usage table (usage tracking)
```sql
id UUID PRIMARY KEY
business_id UUID REFERENCES businesses(id)
credits_used INTEGER DEFAULT 1
period_start DATE                    -- First day of billing period
created_at TIMESTAMPTZ
```

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/v1/billing/checkout` | POST | Create Stripe Checkout session |
| `/api/v1/billing/portal` | POST | Create Customer Portal session |
| `/api/v1/billing/webhooks` | POST | Handle Stripe webhook events |
| `/api/v1/billing/subscription` | GET | Get current subscription status |
| `/api/v1/billing/usage` | GET | Get current OCR usage |
| `/api/v1/billing/invoices` | GET | Get invoice history |

---

## Webhook Events

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Link customer to business, activate plan |
| `customer.subscription.created` | Update subscription fields on business |
| `customer.subscription.updated` | Update plan_name, status |
| `customer.subscription.deleted` | Downgrade to free |
| `invoice.payment_failed` | Mark past_due, trigger notification |
| `invoice.payment_succeeded` | Clear past_due status |

---

## Plan Configuration

Located in `src/lib/stripe/plans.ts`:

| Plan | Price (MYR) | OCR Limit | Features |
|------|-------------|-----------|----------|
| Free | RM 0 | 5/month | Read-only, basic reports |
| Pro | RM 79 | 100/month | Full access, advanced reports |
| Enterprise | RM 199 | Unlimited | API access, custom branding |

---

## Usage Tracking Flow

```
1. OCR request received
   └─→ Check usage: GET /api/v1/billing/usage/check

2. If within limit (canUse: true)
   └─→ Process OCR
   └─→ Record usage: POST /api/v1/billing/usage

3. If at/over limit (canUse: false)
   └─→ Return soft-block error
   └─→ Frontend shows upgrade modal
```

---

## Key Files Reference

### Configuration
- `src/lib/stripe/client.ts` - Stripe SDK initialization
- `src/lib/stripe/plans.ts` - Plan definitions and helpers
- `src/lib/stripe/webhook-handlers.ts` - Event type handlers

### Components
- `src/domains/billing/components/pricing-table.tsx` - Plan selection
- `src/domains/billing/components/billing-settings.tsx` - Subscription UI
- `src/domains/billing/components/usage-dashboard.tsx` - Usage display
- `src/domains/billing/components/invoice-list.tsx` - Invoice history
- `src/domains/billing/components/subscription-card.tsx` - Compact plan summary (Settings page)
- `src/domains/billing/components/upgrade-banner.tsx` - Dismissible upgrade CTA (Dashboard)

### Hooks
- `src/domains/billing/hooks/use-subscription.ts` - Subscription state
- `src/domains/billing/hooks/use-usage.ts` - Usage tracking

### Pages
- `src/app/(authenticated)/pricing/page.tsx` - Pricing page
- `src/app/(authenticated)/settings/billing/page.tsx` - Billing settings

---

## Testing

### Local Development
```bash
# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/v1/billing/webhooks

# Trigger test events
stripe trigger customer.subscription.created
stripe trigger invoice.payment_succeeded
```

### Test Cards
| Card Number | Result |
|-------------|--------|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 0002` | Decline |
| `4000 0000 0000 9995` | Insufficient funds |

---

## Implementation Status

- [x] Phase 1: Setup (Stripe SDK, env vars, plans config)
- [x] Phase 2: Database + Webhooks (migrations applied, webhook handlers created)
- [x] Phase 3: US1 - Subscribe to Plan (checkout flow, pricing page)
- [x] Phase 4: US2 - Manage Subscription (portal API, billing settings page)
- [x] Phase 5: US3 - Invoice History (invoices API, InvoiceList component)
- [x] Phase 6: US4 - Usage Tracking (soft-block, usage API, UI components)
- [x] Phase 7: UI Discoverability (sidebar nav, settings card, dashboard banner)

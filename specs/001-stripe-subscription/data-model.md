# Data Model: Stripe Subscription Integration (Simplified)

**Feature**: 001-stripe-subscription
**Date**: 2025-12-27
**Status**: Design
**Pattern**: [Next.js SaaS Starter](https://github.com/nextjs/saas-starter)

## Design Philosophy

> "Don't reinvent the wheel" - Follow the official Vercel SaaS starter pattern

**Key Principle**: Subscription fields live directly on the `businesses` table, NOT in a separate subscriptions table. Stripe is the source of truth; our database caches status for fast access.

## Schema Diagram (Simplified)

```
┌─────────────────────────────────────┐       ┌─────────────────┐
│            businesses               │       │  stripe_events  │
│  (existing table - add columns)     │       │  (idempotency)  │
│                                     │       │                 │
│ + stripe_customer_id     (NEW)      │       │ event_id (PK)   │
│ + stripe_subscription_id (NEW)      │       │ event_type      │
│ + stripe_product_id      (NEW)      │       │ processed_at    │
│ + plan_name              (NEW)      │       └─────────────────┘
│ + subscription_status    (NEW)      │
└─────────────────────────────────────┘
                  │
                  │ 1:N (for OCR tracking only)
                  ▼
          ┌──────────────────┐
          │    ocr_usage     │
          │                  │
          │ business_id      │
          │ credits_used     │
          │ period_start     │
          └──────────────────┘
```

## Table Changes

### 1. businesses (Existing Table - Add 5 Columns)

Add subscription fields directly to businesses table (SaaS starter pattern):

```sql
-- Migration: Add Stripe subscription columns to businesses
-- Following Next.js SaaS Starter pattern: https://github.com/nextjs/saas-starter

ALTER TABLE businesses
ADD COLUMN stripe_customer_id TEXT UNIQUE,
ADD COLUMN stripe_subscription_id TEXT UNIQUE,
ADD COLUMN stripe_product_id TEXT,
ADD COLUMN plan_name TEXT DEFAULT 'free' CHECK (plan_name IN ('free', 'pro', 'enterprise')),
ADD COLUMN subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN (
  'active', 'canceled', 'incomplete', 'incomplete_expired',
  'past_due', 'paused', 'trialing', 'unpaid'
));

-- Indexes for lookup
CREATE INDEX idx_businesses_stripe_customer ON businesses(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX idx_businesses_subscription_status ON businesses(subscription_status);

-- Comments
COMMENT ON COLUMN businesses.stripe_customer_id IS 'Stripe Customer ID (cus_xxx)';
COMMENT ON COLUMN businesses.stripe_subscription_id IS 'Stripe Subscription ID (sub_xxx)';
COMMENT ON COLUMN businesses.stripe_product_id IS 'Stripe Product ID (prod_xxx)';
COMMENT ON COLUMN businesses.plan_name IS 'Current plan: free, pro, enterprise';
COMMENT ON COLUMN businesses.subscription_status IS 'Stripe subscription status';
```

### 2. stripe_events (New Table - Idempotency)

Simple idempotency table for webhook deduplication:

```sql
-- Webhook idempotency tracking
CREATE TABLE stripe_events (
  event_id TEXT PRIMARY KEY,           -- Stripe event ID (evt_xxx)
  event_type TEXT NOT NULL,            -- e.g., 'customer.subscription.updated'
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-cleanup old events (optional - via scheduled job)
CREATE INDEX idx_stripe_events_processed_at ON stripe_events(processed_at);
```

### 3. ocr_usage (New Table - Usage Tracking)

Track OCR credits for soft-block feature:

```sql
-- OCR usage tracking for billing limits
CREATE TABLE ocr_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  document_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  credits_used INTEGER NOT NULL DEFAULT 1,
  period_start DATE NOT NULL,  -- First day of billing period
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast usage queries
CREATE INDEX idx_ocr_usage_business_period ON ocr_usage(business_id, period_start);

-- RLS
ALTER TABLE ocr_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business members can view usage"
ON ocr_usage FOR SELECT
USING (
  business_id IN (
    SELECT business_id FROM users WHERE clerk_user_id = auth.jwt()->>'sub'
  )
);
```

## Plan Configuration (Application Code)

```typescript
// src/lib/stripe/plans.ts
export const PLANS = {
  free: {
    name: 'Free',
    priceId: null,  // No Stripe product
    ocrLimit: 5,
    features: ['read_only', 'basic_reports', 'limited_ocr']
  },
  pro: {
    name: 'Pro',
    priceId: process.env.STRIPE_PRO_PRICE_ID!,
    ocrLimit: 100,
    features: ['full_access', 'priority_support', 'advanced_reports']
  },
  enterprise: {
    name: 'Enterprise',
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID!,
    ocrLimit: -1,  // Unlimited
    features: ['full_access', 'priority_support', 'api_access', 'custom_branding']
  }
} as const;

export type PlanName = keyof typeof PLANS;
```

## Helper Functions

### Get OCR Usage for Current Period

```sql
CREATE OR REPLACE FUNCTION get_monthly_ocr_usage(p_business_id UUID)
RETURNS INTEGER AS $$
BEGIN
  RETURN COALESCE(
    (SELECT SUM(credits_used)::INTEGER
     FROM ocr_usage
     WHERE business_id = p_business_id
       AND period_start = date_trunc('month', CURRENT_DATE)::DATE),
    0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## Webhook Data Flow (Simplified)

```
Stripe Event → Webhook Handler → Check stripe_events → Update businesses table
```

### checkout.session.completed
```typescript
// Set customer ID and subscription details
await supabase.from('businesses').update({
  stripe_customer_id: session.customer,
  stripe_subscription_id: session.subscription,
  stripe_product_id: subscription.items.data[0].price.product,
  plan_name: getPlanFromProductId(subscription.items.data[0].price.product),
  subscription_status: subscription.status
}).eq('id', businessId);
```

### customer.subscription.updated
```typescript
// Update subscription status
await supabase.from('businesses').update({
  stripe_subscription_id: subscription.id,
  stripe_product_id: subscription.items.data[0].price.product,
  plan_name: getPlanFromProductId(subscription.items.data[0].price.product),
  subscription_status: subscription.status
}).eq('stripe_customer_id', subscription.customer);
```

### customer.subscription.deleted
```typescript
// Downgrade to free
await supabase.from('businesses').update({
  stripe_subscription_id: null,
  stripe_product_id: null,
  plan_name: 'free',
  subscription_status: 'canceled'
}).eq('stripe_customer_id', subscription.customer);
```

## Migration Files

1. `20250127_add_stripe_to_businesses.sql` - Add 5 columns to businesses
2. `20250127_create_stripe_events.sql` - Idempotency table
3. `20250127_create_ocr_usage.sql` - Usage tracking table

## Comparison: Our Approach vs Over-Engineered

| Aspect | Over-Engineered | Our Approach (SaaS Starter) |
|--------|-----------------|---------------------------|
| Tables | 4 new tables | 2 new tables + 5 columns |
| Subscription data | Full mirror of Stripe | Just status cache |
| Complexity | High | Low |
| Maintenance | Sync issues possible | Stripe is truth, simple cache |
| Query pattern | JOIN subscriptions | Direct on businesses |

## Why This Works

1. **Stripe is source of truth** - We don't need to duplicate all subscription data
2. **Fast access** - `plan_name` and `subscription_status` on businesses = no JOINs
3. **Portal handles complexity** - Stripe Customer Portal manages upgrades/downgrades
4. **Webhooks keep sync** - Simple status updates, not complex state machines

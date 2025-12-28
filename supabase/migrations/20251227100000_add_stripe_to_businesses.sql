-- Migration: Add Stripe subscription columns to businesses table
-- Feature: 001-stripe-subscription
-- Pattern: Following Next.js SaaS Starter (subscription fields on teams/businesses table)
-- Date: 2025-12-27

-- Add Stripe subscription columns to businesses table
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS stripe_product_id TEXT,
ADD COLUMN IF NOT EXISTS plan_name TEXT DEFAULT 'free',
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';

-- Add constraints for plan_name
ALTER TABLE businesses
ADD CONSTRAINT businesses_plan_name_check
CHECK (plan_name IN ('free', 'pro', 'enterprise'));

-- Add constraints for subscription_status (Stripe subscription statuses)
ALTER TABLE businesses
ADD CONSTRAINT businesses_subscription_status_check
CHECK (subscription_status IN (
  'active', 'canceled', 'incomplete', 'incomplete_expired',
  'past_due', 'paused', 'trialing', 'unpaid'
));

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_businesses_stripe_customer_id
ON businesses(stripe_customer_id)
WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_businesses_subscription_status
ON businesses(subscription_status);

CREATE INDEX IF NOT EXISTS idx_businesses_plan_name
ON businesses(plan_name);

-- Add comments for documentation
COMMENT ON COLUMN businesses.stripe_customer_id IS 'Stripe Customer ID (cus_xxx) - links business to Stripe customer';
COMMENT ON COLUMN businesses.stripe_subscription_id IS 'Stripe Subscription ID (sub_xxx) - active subscription';
COMMENT ON COLUMN businesses.stripe_product_id IS 'Stripe Product ID (prod_xxx) - identifies the subscribed plan';
COMMENT ON COLUMN businesses.plan_name IS 'Current plan tier: free, pro, enterprise';
COMMENT ON COLUMN businesses.subscription_status IS 'Stripe subscription status: active, canceled, past_due, etc.';

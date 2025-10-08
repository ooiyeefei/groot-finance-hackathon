-- Create financial_analytics table for dashboard analytics
-- This table stores computed financial analytics for performance

BEGIN;

-- Create the financial_analytics table
CREATE TABLE IF NOT EXISTS financial_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_income DECIMAL(15,2) DEFAULT 0,
  total_expenses DECIMAL(15,2) DEFAULT 0,
  net_profit DECIMAL(15,2) DEFAULT 0,
  currency_breakdown JSONB,
  category_breakdown JSONB,
  compliance_summary JSONB,
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, period_start, period_end)
);

-- Add business_id for multi-tenant support
ALTER TABLE financial_analytics
ADD COLUMN IF NOT EXISTS business_id UUID REFERENCES businesses(id) ON DELETE CASCADE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_financial_analytics_user_id ON financial_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_analytics_business_id ON financial_analytics(business_id);
CREATE INDEX IF NOT EXISTS idx_financial_analytics_period ON financial_analytics(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_financial_analytics_calculated_at ON financial_analytics(calculated_at DESC);

-- Enable RLS
ALTER TABLE financial_analytics ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "users_own_financial_analytics" ON financial_analytics
  FOR ALL USING (user_id IN (
    SELECT id FROM users WHERE clerk_user_id::text = auth.uid()::text
  ));

COMMIT;
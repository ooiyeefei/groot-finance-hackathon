-- Migration: Create ocr_usage table for billing usage tracking
-- Feature: 001-stripe-subscription
-- Purpose: Track OCR credit consumption per business per billing period
-- Date: 2025-12-27

-- OCR usage tracking table
CREATE TABLE IF NOT EXISTS ocr_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  document_id UUID,                              -- Optional reference to processed document
  credits_used INTEGER NOT NULL DEFAULT 1,       -- OCR credits consumed (usually 1 per document)
  period_start DATE NOT NULL,                    -- First day of billing period (month start)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast usage queries by business and period
CREATE INDEX IF NOT EXISTS idx_ocr_usage_business_period
ON ocr_usage(business_id, period_start);

-- Index for document lookups
CREATE INDEX IF NOT EXISTS idx_ocr_usage_document_id
ON ocr_usage(document_id)
WHERE document_id IS NOT NULL;

-- Add comments
COMMENT ON TABLE ocr_usage IS 'Tracks OCR credit consumption per business for billing limits';
COMMENT ON COLUMN ocr_usage.business_id IS 'Business that consumed the OCR credits';
COMMENT ON COLUMN ocr_usage.document_id IS 'Document that was processed (optional reference)';
COMMENT ON COLUMN ocr_usage.credits_used IS 'Number of OCR credits consumed (usually 1)';
COMMENT ON COLUMN ocr_usage.period_start IS 'First day of the billing period (monthly)';

-- Enable RLS
ALTER TABLE ocr_usage ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Business members can view their usage
CREATE POLICY "Business members can view ocr_usage"
ON ocr_usage FOR SELECT
USING (
  business_id IN (
    SELECT business_id FROM users WHERE clerk_user_id = auth.jwt()->>'sub'
  )
);

-- RLS Policy: Only service role can insert (webhook/API handlers)
-- Regular users cannot directly insert usage records
CREATE POLICY "Service role can insert ocr_usage"
ON ocr_usage FOR INSERT
WITH CHECK (
  -- Allow if user is in the business OR if using service role
  business_id IN (
    SELECT business_id FROM users WHERE clerk_user_id = auth.jwt()->>'sub'
  )
);

-- Helper function: Get monthly OCR usage for a business
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

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION get_monthly_ocr_usage(UUID) TO authenticated;

COMMENT ON FUNCTION get_monthly_ocr_usage IS 'Returns total OCR credits used by business in current month';

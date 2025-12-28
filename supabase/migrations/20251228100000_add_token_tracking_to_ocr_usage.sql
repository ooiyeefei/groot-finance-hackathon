-- Migration: Add token tracking columns to ocr_usage table
-- Feature: 001-stripe-subscription (fair billing)
-- Purpose: Track actual Gemini API token consumption for billing fairness
-- Date: 2025-12-28
--
-- BILLING FAIRNESS LOGIC:
-- - Only charge if API tokens were consumed (tokens_used > 0)
-- - System errors (network failures, timeouts) = no charge
-- - User errors (bad image) that reach API = charges apply

-- Add token tracking columns
ALTER TABLE ocr_usage
ADD COLUMN IF NOT EXISTS tokens_used INTEGER,
ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER,
ADD COLUMN IF NOT EXISTS completion_tokens INTEGER,
ADD COLUMN IF NOT EXISTS model_used TEXT;

-- Add comments
COMMENT ON COLUMN ocr_usage.tokens_used IS 'Total API tokens consumed by Gemini (prompt + completion)';
COMMENT ON COLUMN ocr_usage.prompt_tokens IS 'Prompt/input tokens sent to Gemini API';
COMMENT ON COLUMN ocr_usage.completion_tokens IS 'Completion/output tokens from Gemini API';
COMMENT ON COLUMN ocr_usage.model_used IS 'AI model used for OCR (e.g., gemini-2.5-flash)';

-- Index for analyzing token usage patterns by model
CREATE INDEX IF NOT EXISTS idx_ocr_usage_model_period
ON ocr_usage(model_used, period_start)
WHERE model_used IS NOT NULL;

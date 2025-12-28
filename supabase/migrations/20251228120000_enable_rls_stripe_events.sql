-- Migration: Enable RLS on stripe_events for defense-in-depth security
-- Feature: 001-stripe-subscription (security hardening)
-- Date: 2025-12-28
--
-- SECURITY RATIONALE:
-- While webhook handlers use service role key (which bypasses RLS),
-- enabling RLS provides defense-in-depth against:
-- 1. Accidental exposure through anon key
-- 2. Future application bugs that might use wrong client
-- 3. DoS attacks via fake event_id insertion
--
-- Service role key ALWAYS bypasses RLS in Supabase, so webhook
-- processing continues to work normally.

-- Enable RLS on stripe_events table
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

-- Create explicit deny-all policy
-- This blocks anon key and authenticated user access
-- Service role bypasses this automatically
CREATE POLICY "service_role_only_access" ON stripe_events
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- Add comment explaining the security model
COMMENT ON TABLE stripe_events IS 'Stripe webhook idempotency table. RLS enabled with deny-all policy - only service role (webhooks) can access. Prevents DoS attacks via fake event insertion.';

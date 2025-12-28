-- Migration: Create stripe_events table for webhook idempotency
-- Feature: 001-stripe-subscription
-- Purpose: Prevent duplicate webhook processing
-- Date: 2025-12-27

-- Stripe events table for webhook idempotency
CREATE TABLE IF NOT EXISTS stripe_events (
  event_id TEXT PRIMARY KEY,                    -- Stripe event ID (evt_xxx)
  event_type TEXT NOT NULL,                     -- e.g., 'customer.subscription.updated'
  processed_at TIMESTAMPTZ DEFAULT NOW()        -- When the event was processed
);

-- Index for cleanup queries (delete old events periodically)
CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at
ON stripe_events(processed_at);

-- Add comments
COMMENT ON TABLE stripe_events IS 'Tracks processed Stripe webhook events for idempotency';
COMMENT ON COLUMN stripe_events.event_id IS 'Stripe event ID (evt_xxx) - unique identifier';
COMMENT ON COLUMN stripe_events.event_type IS 'Type of Stripe event, e.g., customer.subscription.updated';
COMMENT ON COLUMN stripe_events.processed_at IS 'Timestamp when the event was processed';

-- Note: This table does NOT need RLS as it's only accessed by webhook handler (server-side)
-- The webhook handler uses the service role key which bypasses RLS

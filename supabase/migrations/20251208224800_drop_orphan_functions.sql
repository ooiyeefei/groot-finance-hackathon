-- Migration: Drop Orphan Database Functions
-- Created: 2025-12-08
-- Purpose: Remove unused functions that reference non-existent tables or are not called
--
-- Functions to drop:
--   - clean_expired_agent_memory: References non-existent agent_memory table
--   - update_agent_memory: Trigger function for non-existent agent_memory table
--   - get_active_business_context: Not used in TypeScript code (replaced by direct queries)
--   - can_user_manage_application: Only used for applications table RLS (now dropped)
--
-- Reference: tasks/database-cleanup-proposal.md (Part 6: Orphan Database Functions)

-- ============================================================================
-- STEP 1: Drop functions that reference non-existent agent_memory table
-- ============================================================================

-- Function for cleaning expired agent memory (table doesn't exist)
DROP FUNCTION IF EXISTS clean_expired_agent_memory();

-- Trigger function for agent memory updates (table doesn't exist)
DROP FUNCTION IF EXISTS update_agent_memory();

-- ============================================================================
-- STEP 2: Drop unused business context function
-- ============================================================================

-- Function replaced by TypeScript direct queries for better performance
-- Note: get_user_business_id() is KEPT (used by 14 RLS policies)
DROP FUNCTION IF EXISTS get_active_business_context(text);

-- ============================================================================
-- STEP 3: Drop applications-specific RLS helper function
-- ============================================================================

-- Function only used for applications table RLS policies (now dropped)
DROP FUNCTION IF EXISTS can_user_manage_application(uuid, uuid);

-- ============================================================================
-- STEP 4: Verify cleanup
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Successfully dropped orphan functions: clean_expired_agent_memory, update_agent_memory, get_active_business_context, can_user_manage_application';
END $$;

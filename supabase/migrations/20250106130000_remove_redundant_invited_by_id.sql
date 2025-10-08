-- Remove redundant invited_by_id field from business_memberships
-- Created: 2025-01-06
-- Purpose: Eliminate relationship ambiguity and reduce unnecessary complexity

BEGIN;

-- =============================================================================
-- 1. REMOVE REDUNDANT INVITED_BY_ID COLUMN
-- =============================================================================

-- Drop the invited_by_id column from business_memberships table
-- This field is redundant as invitation tracking is already handled via users.invited_by
ALTER TABLE business_memberships DROP COLUMN IF EXISTS invited_by_id;

-- =============================================================================
-- 2. VALIDATION
-- =============================================================================

DO $$
DECLARE
    column_exists INTEGER;
BEGIN
    -- Check if the column was successfully removed
    SELECT COUNT(*)
    INTO column_exists
    FROM information_schema.columns
    WHERE table_name = 'business_memberships'
      AND column_name = 'invited_by_id';

    IF column_exists = 0 THEN
        RAISE NOTICE 'Column removal successful: invited_by_id dropped from business_memberships';
        RAISE NOTICE 'Relationship ambiguity resolved - only user_id -> users relationship remains';
        RAISE NOTICE 'Invitation tracking still available via users.invited_by field';
    ELSE
        RAISE EXCEPTION 'Column removal failed: invited_by_id still exists in business_memberships';
    END IF;
END
$$;

COMMIT;

-- =============================================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- =============================================================================

/*
-- To rollback this change (add the column back):

BEGIN;

-- Add the column back (but data will be lost)
ALTER TABLE business_memberships
ADD COLUMN invited_by_id TEXT REFERENCES users(id);

-- Add comment explaining the field
COMMENT ON COLUMN business_memberships.invited_by_id IS 'Supabase user ID of who invited this user (redundant with users.invited_by)';

COMMIT;

-- Note: Historical data for invited_by_id will be lost and would need to be
-- reconstructed from users.invited_by if the rollback is needed.
*/
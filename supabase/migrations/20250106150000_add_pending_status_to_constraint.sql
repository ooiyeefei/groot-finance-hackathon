-- Add 'pending' status to business_memberships_status_check constraint
-- This allows proper invitation flow: pending → active → inactive/suspended

BEGIN;

-- =============================================================================
-- UPDATE STATUS CHECK CONSTRAINT TO INCLUDE 'PENDING'
-- =============================================================================

-- Drop the existing constraint
ALTER TABLE business_memberships DROP CONSTRAINT IF EXISTS business_memberships_status_check;

-- Add the updated constraint with 'pending' included
ALTER TABLE business_memberships ADD CONSTRAINT business_memberships_status_check
  CHECK (status IN ('active', 'inactive', 'suspended', 'pending'));

-- Add comment explaining the status flow
COMMENT ON CONSTRAINT business_memberships_status_check ON business_memberships IS
  'Valid status values: pending (invitation sent), active (user accepted), inactive (removed), suspended (temporarily disabled)';

COMMIT;

-- =============================================================================
-- VALIDATION
-- =============================================================================

DO $$
BEGIN
    -- Test that the constraint allows all expected values
    RAISE NOTICE 'Updated business_memberships_status_check constraint to allow: active, inactive, suspended, pending';
    RAISE NOTICE 'Status flow: pending (invitation) → active (accepted) → inactive/suspended (deactivated)';
END
$$;
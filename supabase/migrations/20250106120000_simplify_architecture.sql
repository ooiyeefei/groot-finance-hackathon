-- Simplify Multi-Tenant Architecture
-- Created: 2025-01-06
-- Remove over-engineered audit table and functions for cleaner CRUD operations

BEGIN;

-- =============================================================================
-- 1. DROP AUDIT TABLE (UNNECESSARY COMPLEXITY)
-- =============================================================================

-- Drop the audit table - can be added later if compliance requires it
DROP TABLE IF EXISTS business_memberships_audit CASCADE;

-- =============================================================================
-- 2. DROP OVER-ENGINEERED DATABASE FUNCTIONS
-- =============================================================================

-- Remove functions - standard SQL operations are cleaner
DROP FUNCTION IF EXISTS remove_user_from_business(TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS get_user_business_count(TEXT);
DROP FUNCTION IF EXISTS reactivate_user_membership(TEXT, UUID);

-- =============================================================================
-- 3. CREATE SIMPLE HELPER VIEWS FOR COMMON QUERIES
-- =============================================================================

-- Keep these useful views for easier querying
CREATE OR REPLACE VIEW active_business_memberships AS
SELECT
  bm.id,
  bm.user_id,
  bm.business_id,
  bm.role,
  bm.status,
  bm.joined_at,
  bm.invited_at,
  bm.invited_by_id,
  bm.updated_at,
  u.email,
  u.full_name,
  u.clerk_user_id,
  b.name as business_name,
  b.owner_id = bm.user_id as is_owner
FROM business_memberships bm
JOIN users u ON bm.user_id = u.id
JOIN businesses b ON bm.business_id = b.id
WHERE bm.status = 'active';

-- View for user business summary (simplified)
CREATE OR REPLACE VIEW user_business_summary AS
SELECT
  u.id as user_id,
  u.email,
  u.full_name,
  u.clerk_user_id,
  u.status as user_status,
  COUNT(CASE WHEN bm.status = 'active' THEN 1 END) as active_memberships,
  COUNT(CASE WHEN b.owner_id = u.id THEN 1 END) as owned_businesses,
  COALESCE(
    json_agg(
      CASE WHEN bm.status = 'active' THEN
        json_build_object(
          'membership_id', bm.id,
          'business_id', bm.business_id,
          'business_name', b.name,
          'role', bm.role,
          'is_owner', b.owner_id = u.id,
          'joined_at', bm.joined_at
        )
      END
    ) FILTER (WHERE bm.status = 'active'),
    '[]'::json
  ) as active_businesses
FROM users u
LEFT JOIN business_memberships bm ON u.id = bm.user_id
LEFT JOIN businesses b ON bm.business_id = b.id
GROUP BY u.id, u.email, u.full_name, u.clerk_user_id, u.status;

-- =============================================================================
-- 4. VALIDATION
-- =============================================================================

DO $$
DECLARE
    total_memberships INTEGER;
    active_memberships INTEGER;
BEGIN
    -- Check current membership state
    SELECT COUNT(*) INTO total_memberships FROM business_memberships;
    SELECT COUNT(*) INTO active_memberships FROM business_memberships WHERE status = 'active';

    RAISE NOTICE 'Architecture simplification completed:';
    RAISE NOTICE 'Total memberships: %', total_memberships;
    RAISE NOTICE 'Active memberships: %', active_memberships;
    RAISE NOTICE 'Removed: audit table, complex functions';
    RAISE NOTICE 'Added: simple helper views for common queries';
END
$$;

COMMIT;

-- =============================================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- =============================================================================

/*
-- To rollback this simplification:

BEGIN;

-- Recreate audit table if needed
CREATE TABLE business_memberships_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  business_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  old_role TEXT,
  new_role TEXT,
  performed_by TEXT NOT NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

-- Recreate functions if needed (copy from previous migration)

COMMIT;
*/
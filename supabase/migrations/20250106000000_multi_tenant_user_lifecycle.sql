-- Multi-Tenant User Lifecycle Enhancement
-- Created: 2025-01-06
-- Comprehensive user removal and cross-business membership support

BEGIN;

-- =============================================================================
-- 1. EXTEND STATUS VALUES FOR COMPREHENSIVE USER LIFECYCLE
-- =============================================================================

-- Add new status values to business_memberships for complete lifecycle tracking
ALTER TABLE business_memberships DROP CONSTRAINT IF EXISTS business_memberships_status_check;
ALTER TABLE business_memberships ADD CONSTRAINT business_memberships_status_check
  CHECK (status IN ('active', 'suspended', 'inactive', 'removed', 'pending'));

-- Add status to users table for global user state tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
  CHECK (status IN ('active', 'removed', 'pending', 'suspended'));

-- Create index for efficient status-based queries
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_memberships_status_business ON business_memberships(business_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_user_status ON business_memberships(user_id, status);

-- =============================================================================
-- 2. CREATE USER LIFECYCLE HELPER FUNCTIONS
-- =============================================================================

-- Function to soft-remove user from business
CREATE OR REPLACE FUNCTION remove_user_from_business(
  target_user_id TEXT,
  target_business_id UUID,
  removed_by_user_id TEXT
)
RETURNS JSON AS $$
DECLARE
  membership_record business_memberships%ROWTYPE;
  owner_check BOOLEAN;
  result JSON;
BEGIN
  -- Check if target user is business owner
  SELECT EXISTS(
    SELECT 1 FROM businesses
    WHERE id = target_business_id AND owner_id = target_user_id
  ) INTO owner_check;

  IF owner_check THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Cannot remove business owner from business'
    );
  END IF;

  -- Get current membership
  SELECT * INTO membership_record
  FROM business_memberships
  WHERE user_id = target_user_id AND business_id = target_business_id;

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User is not a member of this business'
    );
  END IF;

  -- Soft remove: Update status to 'removed'
  UPDATE business_memberships
  SET
    status = 'removed',
    updated_at = now()
  WHERE user_id = target_user_id AND business_id = target_business_id;

  -- Log the removal (audit trail)
  INSERT INTO business_memberships_audit (
    user_id,
    business_id,
    action,
    old_status,
    new_status,
    performed_by,
    performed_at
  ) VALUES (
    target_user_id,
    target_business_id,
    'removed',
    membership_record.status,
    'removed',
    removed_by_user_id,
    now()
  );

  RETURN json_build_object(
    'success', true,
    'message', 'User removed from business successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check user's business associations
CREATE OR REPLACE FUNCTION get_user_business_count(target_user_id TEXT)
RETURNS JSON AS $$
DECLARE
  active_count INTEGER;
  total_count INTEGER;
  owned_count INTEGER;
  result JSON;
BEGIN
  -- Count active memberships
  SELECT COUNT(*) INTO active_count
  FROM business_memberships
  WHERE user_id = target_user_id AND status = 'active';

  -- Count total memberships (including removed)
  SELECT COUNT(*) INTO total_count
  FROM business_memberships
  WHERE user_id = target_user_id;

  -- Count owned businesses
  SELECT COUNT(*) INTO owned_count
  FROM businesses
  WHERE owner_id = target_user_id;

  RETURN json_build_object(
    'active_memberships', active_count,
    'total_memberships', total_count,
    'owned_businesses', owned_count,
    'has_other_associations', (active_count > 1 OR owned_count > 0)
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to reactivate user membership
CREATE OR REPLACE FUNCTION reactivate_user_membership(
  target_user_id TEXT,
  target_business_id UUID
)
RETURNS JSON AS $$
DECLARE
  membership_exists BOOLEAN;
BEGIN
  -- Check if removed membership exists
  SELECT EXISTS(
    SELECT 1 FROM business_memberships
    WHERE user_id = target_user_id
      AND business_id = target_business_id
      AND status = 'removed'
  ) INTO membership_exists;

  IF NOT membership_exists THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No removed membership found to reactivate'
    );
  END IF;

  -- Reactivate membership
  UPDATE business_memberships
  SET
    status = 'active',
    joined_at = now(),
    updated_at = now()
  WHERE user_id = target_user_id AND business_id = target_business_id;

  RETURN json_build_object(
    'success', true,
    'message', 'User membership reactivated successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- 3. CREATE AUDIT TABLE FOR MEMBERSHIP CHANGES
-- =============================================================================

CREATE TABLE IF NOT EXISTS business_memberships_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  business_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'added', 'removed', 'role_changed', 'reactivated'
  old_status TEXT,
  new_status TEXT,
  old_role TEXT,
  new_role TEXT,
  performed_by TEXT NOT NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

-- Enable RLS on audit table
ALTER TABLE business_memberships_audit ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only admins can view audit logs for their business
CREATE POLICY "admins_view_audit_logs" ON business_memberships_audit
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM business_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.business_id = business_memberships_audit.business_id
        AND bm.role = 'admin'
        AND bm.status = 'active'
    )
  );

-- =============================================================================
-- 4. UPDATE RLS POLICIES FOR ENHANCED MULTI-TENANCY
-- =============================================================================

-- Update business_memberships RLS to include removed status visibility for admins
DROP POLICY IF EXISTS "admins_manage_business_memberships" ON business_memberships;

CREATE POLICY "admins_manage_business_memberships" ON business_memberships
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM business_memberships bm
      WHERE bm.user_id = auth.uid()
        AND bm.business_id = business_memberships.business_id
        AND bm.role = 'admin'
        AND bm.status = 'active'
    )
  );

-- Policy for users to see their own memberships (including removed ones)
DROP POLICY IF EXISTS "users_see_own_memberships" ON business_memberships;

CREATE POLICY "users_see_own_memberships" ON business_memberships
  FOR SELECT USING (user_id = auth.uid());

-- =============================================================================
-- 5. CREATE HELPER VIEWS FOR EASIER QUERYING
-- =============================================================================

-- View for active business memberships with user details
CREATE OR REPLACE VIEW active_business_memberships AS
SELECT
  bm.id,
  bm.user_id,
  bm.business_id,
  bm.role,
  bm.joined_at,
  bm.last_accessed_at,
  u.email,
  u.full_name,
  u.clerk_user_id,
  b.name as business_name,
  b.owner_id = bm.user_id as is_owner
FROM business_memberships bm
JOIN users u ON bm.user_id = u.id
JOIN businesses b ON bm.business_id = b.id
WHERE bm.status = 'active';

-- View for user business summary
CREATE OR REPLACE VIEW user_business_summary AS
SELECT
  u.id as user_id,
  u.email,
  u.full_name,
  u.clerk_user_id,
  COUNT(CASE WHEN bm.status = 'active' THEN 1 END) as active_memberships,
  COUNT(CASE WHEN b.owner_id = u.id THEN 1 END) as owned_businesses,
  COALESCE(
    json_agg(
      CASE WHEN bm.status = 'active' THEN
        json_build_object(
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
GROUP BY u.id, u.email, u.full_name, u.clerk_user_id;

-- =============================================================================
-- 6. VALIDATION AND DATA INTEGRITY CHECKS
-- =============================================================================

-- Ensure no user without any business association exists
-- (This constraint will be enforced at application level)

-- Check current state
DO $$
DECLARE
    users_without_business INTEGER;
    orphaned_memberships INTEGER;
BEGIN
    -- Count users without any business association
    SELECT COUNT(*) INTO users_without_business
    FROM users u
    WHERE NOT EXISTS (
        SELECT 1 FROM business_memberships bm
        WHERE bm.user_id = u.id AND bm.status IN ('active', 'pending')
    )
    AND NOT EXISTS (
        SELECT 1 FROM businesses b
        WHERE b.owner_id = u.id
    );

    -- Count memberships pointing to non-existent users
    SELECT COUNT(*) INTO orphaned_memberships
    FROM business_memberships bm
    WHERE NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = bm.user_id
    );

    RAISE NOTICE 'Multi-tenant lifecycle migration summary:';
    RAISE NOTICE 'Users without business association: %', users_without_business;
    RAISE NOTICE 'Orphaned memberships: %', orphaned_memberships;

    IF orphaned_memberships > 0 THEN
        RAISE WARNING 'Found % orphaned memberships - cleanup recommended', orphaned_memberships;
    END IF;

    RAISE NOTICE 'Multi-tenant user lifecycle migration completed successfully';
END
$$;

COMMIT;

-- =============================================================================
-- USAGE EXAMPLES
-- =============================================================================

/*
-- Remove user from business (soft delete)
SELECT remove_user_from_business('user_123', 'business_uuid', 'admin_user_456');

-- Check user's business associations
SELECT get_user_business_count('user_123');

-- Reactivate removed user
SELECT reactivate_user_membership('user_123', 'business_uuid');

-- Get active business memberships for a business
SELECT * FROM active_business_memberships WHERE business_id = 'business_uuid';

-- Get user's complete business summary
SELECT * FROM user_business_summary WHERE user_id = 'user_123';
*/
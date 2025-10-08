-- Create missing get_manager_team_employees RPC function
-- This function returns active team members for efficient team management

BEGIN;

-- =============================================================================
-- CREATE get_manager_team_employees RPC FUNCTION
-- =============================================================================

-- Drop the function if it exists (for migration safety)
DROP FUNCTION IF EXISTS get_manager_team_employees(TEXT);

-- Create the function that returns active team members only
CREATE OR REPLACE FUNCTION get_manager_team_employees(manager_user_id TEXT)
RETURNS TABLE (
  employee_id TEXT,
  user_id UUID,
  business_id UUID,
  full_name TEXT,
  email TEXT,
  role_permissions JSONB,
  home_currency TEXT,
  manager_id TEXT,
  manager_name TEXT,
  manager_user_id_field TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    bm.id::TEXT as employee_id,
    bm.user_id,
    bm.business_id,
    u.full_name,
    u.email,
    JSONB_BUILD_OBJECT(
      'employee', true,
      'manager', (bm.role = 'admin' OR bm.role = 'manager'),
      'admin', (bm.role = 'admin')
    ) as role_permissions,
    u.home_currency,
    NULL::TEXT as manager_id, -- TODO: Add manager relationships later
    NULL::TEXT as manager_name,
    NULL::TEXT as manager_user_id_field,
    bm.created_at,
    bm.updated_at
  FROM business_memberships bm
  INNER JOIN users u ON bm.user_id = u.id
  WHERE bm.status = 'active' -- Only active members
    AND u.clerk_user_id IS NOT NULL -- Only users who have signed up
    AND bm.business_id = (
      SELECT business_id
      FROM users
      WHERE clerk_user_id = manager_user_id
    )
  ORDER BY bm.created_at DESC;
END;
$$;

-- Add function comment
COMMENT ON FUNCTION get_manager_team_employees(TEXT) IS 'Returns active team members for a business. Used by team management API.';

COMMIT;

-- =============================================================================
-- USAGE EXAMPLE
-- =============================================================================

/*
-- Example usage:
SELECT * FROM get_manager_team_employees('user_31B9ml2Dwl2q8qxYFS4E13ABXSe');

-- This will return all active team members for the business associated with the given Clerk user ID
*/
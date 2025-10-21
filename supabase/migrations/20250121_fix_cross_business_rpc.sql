-- =====================================================
-- FIX CROSS-BUSINESS MEMBERSHIP RPC FUNCTION
-- Replace get_manager_team_employees to handle multi-tenancy properly
-- =====================================================

-- Drop existing function to replace it
DROP FUNCTION IF EXISTS get_manager_team_employees(TEXT, UUID);

-- Create new RPC function that properly handles cross-business memberships
CREATE OR REPLACE FUNCTION get_manager_team_employees(
  manager_user_id TEXT,
  business_id_param UUID
)
RETURNS TABLE (
  employee_id TEXT,
  user_id UUID,
  business_id UUID,
  full_name TEXT,
  email TEXT,
  role_permissions JSONB,
  home_currency TEXT,
  manager_id UUID,
  manager_name TEXT,
  manager_user_id_field TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  clerk_user_id TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- CRITICAL FIX: Query based on business_memberships table, not users.business_id
  -- This allows users who own their own business to also be members of other businesses

  RETURN QUERY
  SELECT
    bm.id::TEXT as employee_id,
    bm.user_id,
    bm.business_id,
    u.full_name,
    u.email,
    -- Convert role to permissions JSON for compatibility
    CASE
      WHEN bm.role = 'admin' THEN '{"admin": true, "manager": true, "employee": true}'::jsonb
      WHEN bm.role = 'manager' THEN '{"admin": false, "manager": true, "employee": true}'::jsonb
      ELSE '{"admin": false, "manager": false, "employee": true}'::jsonb
    END as role_permissions,
    b.home_currency,
    bm.manager_id,
    manager_user.full_name as manager_name,
    manager_user.clerk_user_id as manager_user_id_field,
    bm.created_at,
    bm.updated_at,
    u.clerk_user_id
  FROM business_memberships bm
  INNER JOIN users u ON bm.user_id = u.id
  INNER JOIN businesses b ON bm.business_id = b.id
  LEFT JOIN users manager_user ON bm.manager_id = manager_user.id
  WHERE
    -- Filter by the specific business being queried
    bm.business_id = business_id_param
    AND bm.status = 'active'
  ORDER BY
    bm.created_at ASC;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_manager_team_employees(TEXT, UUID) TO authenticated;

-- Add function comment
COMMENT ON FUNCTION get_manager_team_employees IS 'Get team members for a business based on business_memberships table, supporting cross-business user scenarios';
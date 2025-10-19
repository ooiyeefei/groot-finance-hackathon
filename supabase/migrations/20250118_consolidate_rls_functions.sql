-- =====================================================
-- CONSOLIDATE RLS FUNCTIONS - ELIMINATE REDUNDANCY
-- Single user context lookup with composite return type
-- =====================================================

-- Create composite type for user context (user_id + business_id in single query)
CREATE TYPE user_context AS (
  user_id uuid,
  business_id uuid
);

-- Single optimized function that gets both user_id and business_id in one query
CREATE OR REPLACE FUNCTION get_user_context()
RETURNS user_context
LANGUAGE plpgsql
SECURITY DEFINER
STABLE  -- Critical: STABLE for caching optimization
AS $$
DECLARE
  result user_context;
BEGIN
  -- Single query gets both user_id and business_id from JWT
  SELECT u.id, u.business_id INTO result
  FROM users u
  WHERE u.clerk_user_id = get_jwt_claim('sub')
  LIMIT 1;

  -- Return composite type with both values
  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    -- Return null composite on any error
    RETURN (NULL, NULL)::user_context;
END;
$$;

-- Helper function for business_id (calls get_user_context once, cached)
CREATE OR REPLACE FUNCTION get_user_business_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE  -- Critical: STABLE for caching optimization
AS $$
BEGIN
  RETURN (get_user_context()).business_id;
END;
$$;

-- Helper function for user_id (calls get_user_context once, cached)
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE  -- Critical: STABLE for caching optimization
AS $$
BEGIN
  RETURN (get_user_context()).user_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_user_context() TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_business_id() TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_user_id() TO authenticated;

-- =====================================================
-- PERFORMANCE VALIDATION
-- =====================================================

-- Add comment explaining the optimization
COMMENT ON FUNCTION get_user_context IS 'Consolidated user context lookup - single query for both user_id and business_id with caching';
COMMENT ON FUNCTION get_user_business_id IS 'Business ID helper - uses cached get_user_context() result';
COMMENT ON FUNCTION get_current_user_id IS 'User ID helper - uses cached get_user_context() result';

-- Test the consolidated functions (should work after deployment)
-- SELECT get_user_context();
-- SELECT get_user_business_id();
-- SELECT get_current_user_id();
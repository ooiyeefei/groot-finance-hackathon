-- =====================================================
-- STANDARDIZE RLS POLICIES FOR PERFORMANCE OPTIMIZATION
-- Replace inconsistent JWT parsing with optimized functions
-- =====================================================

-- First, let's add the get_current_user_id function if it doesn't exist
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE  -- Critical: STABLE for caching optimization
AS $$
DECLARE
  user_uuid uuid;
BEGIN
  -- Use optimized get_jwt_claim function
  SELECT u.id INTO user_uuid
  FROM users u
  WHERE u.clerk_user_id = get_jwt_claim('sub')
  LIMIT 1;

  RETURN user_uuid;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_current_user_id() TO authenticated;

-- =====================================================
-- OPTIMIZE ACCOUNTING_ENTRIES POLICIES
-- =====================================================

-- Drop old policies
DROP POLICY IF EXISTS "Users can access business transactions" ON accounting_entries;
DROP POLICY IF EXISTS "Users can create business transactions" ON accounting_entries;
DROP POLICY IF EXISTS "Users can update business transactions" ON accounting_entries;

-- Create optimized policies
CREATE POLICY "Business accounting entries access"
ON accounting_entries
FOR ALL
TO public
USING (business_id = get_user_business_id());

-- =====================================================
-- OPTIMIZE INVOICES POLICIES
-- =====================================================

-- Drop old policy
DROP POLICY IF EXISTS "Users can access business documents" ON invoices;

-- Create optimized policy
CREATE POLICY "Business invoices access"
ON invoices
FOR ALL
TO public
USING (business_id = get_user_business_id());

-- =====================================================
-- OPTIMIZE VENDORS POLICIES
-- =====================================================

-- Drop old policy
DROP POLICY IF EXISTS "Users can access business vendors" ON vendors;

-- Create optimized policy
CREATE POLICY "Business vendors access"
ON vendors
FOR ALL
TO public
USING (business_id = get_user_business_id());

-- =====================================================
-- OPTIMIZE AUDIT_EVENTS POLICIES
-- =====================================================

-- Drop old policy
DROP POLICY IF EXISTS "Users can access business audit events" ON audit_events;

-- Create optimized policy (admins only for audit events)
CREATE POLICY "Admins can access business audit events"
ON audit_events
FOR SELECT
TO public
USING (
  business_id = get_user_business_id() AND
  EXISTS (
    SELECT 1 FROM business_memberships bm
    WHERE bm.user_id = get_current_user_id()
    AND bm.business_id = get_user_business_id()
    AND bm.role = 'admin'
    AND bm.status = 'active'
  )
);

-- =====================================================
-- OPTIMIZE LINE_ITEMS POLICIES
-- =====================================================

-- Drop old policy
DROP POLICY IF EXISTS "Users can access business line items" ON line_items;

-- Create optimized policy using relationship
CREATE POLICY "Line items access via accounting entries"
ON line_items
FOR ALL
TO public
USING (
  EXISTS (
    SELECT 1 FROM accounting_entries ae
    WHERE ae.id = line_items.accounting_entry_id
    AND ae.business_id = get_user_business_id()
  )
);

-- =====================================================
-- OPTIMIZE USERS POLICIES
-- =====================================================

-- Drop old policy
DROP POLICY IF EXISTS "Users can access their own profile" ON users;

-- Create optimized policies
CREATE POLICY "Users can access their own profile"
ON users
FOR ALL
TO public
USING (id = get_current_user_id());

-- Add policy for admins to see business users
CREATE POLICY "Admins can access business users"
ON users
FOR SELECT
TO public
USING (
  business_id = get_user_business_id() AND
  EXISTS (
    SELECT 1 FROM business_memberships bm
    WHERE bm.user_id = get_current_user_id()
    AND bm.business_id = get_user_business_id()
    AND bm.role = 'admin'
    AND bm.status = 'active'
  )
);

-- =====================================================
-- OPTIMIZE CONVERSATIONS POLICIES
-- =====================================================

-- Drop old policy
DROP POLICY IF EXISTS "Users can access their own conversations" ON conversations;

-- Create optimized policy
CREATE POLICY "Users can access their own conversations"
ON conversations
FOR ALL
TO public
USING (user_id = get_current_user_id()::text);

-- =====================================================
-- OPTIMIZE MESSAGES POLICIES
-- =====================================================

-- Drop old policy
DROP POLICY IF EXISTS "Users can access their own messages" ON messages;

-- Create optimized policy
CREATE POLICY "Messages access via conversations"
ON messages
FOR ALL
TO public
USING (
  user_id = get_current_user_id() OR
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
    AND c.user_id = get_current_user_id()::text
  )
);

-- =====================================================
-- OPTIMIZE BUSINESS_MEMBERSHIPS POLICIES
-- =====================================================

-- Drop old policies
DROP POLICY IF EXISTS "Users can view their own memberships" ON business_memberships;
DROP POLICY IF EXISTS "Users can create their own memberships" ON business_memberships;
DROP POLICY IF EXISTS "Users can update their own memberships" ON business_memberships;

-- Create optimized policies
CREATE POLICY "Users can see their own membership"
ON business_memberships
FOR ALL
TO public
USING (user_id = get_current_user_id());

-- Add policy for admins to manage business memberships
CREATE POLICY "Admins can manage business memberships"
ON business_memberships
FOR ALL
TO public
USING (
  business_id = get_user_business_id() AND
  EXISTS (
    SELECT 1 FROM business_memberships bm
    WHERE bm.user_id = get_current_user_id()
    AND bm.business_id = get_user_business_id()
    AND bm.role = 'admin'
    AND bm.status = 'active'
  )
);

-- =====================================================
-- OPTIMIZE BUSINESSES POLICIES
-- =====================================================

-- Drop old policies
DROP POLICY IF EXISTS "Users can access business via membership" ON businesses;
DROP POLICY IF EXISTS "users_can_create_businesses" ON businesses;

-- Create optimized policy
CREATE POLICY "Users can access their business"
ON businesses
FOR ALL
TO public
USING (id = get_user_business_id());

-- =====================================================
-- OPTIMIZE APPLICATION_DOCUMENTS POLICIES
-- =====================================================

-- Drop old policies
DROP POLICY IF EXISTS "Users can access business application documents" ON application_documents;
DROP POLICY IF EXISTS "Service role can manage all application documents" ON application_documents;

-- Create optimized policy
CREATE POLICY "Application documents access"
ON application_documents
FOR ALL
TO public
USING (
  user_id = get_current_user_id() OR
  (business_id = get_user_business_id() AND
   EXISTS (
     SELECT 1 FROM business_memberships bm
     WHERE bm.user_id = get_current_user_id()
     AND bm.business_id = get_user_business_id()
     AND bm.role = 'admin'
     AND bm.status = 'active'
   ))
);

-- Keep service role policy for system operations
CREATE POLICY "Service role can manage all application documents"
ON application_documents
FOR ALL
TO public
USING ((auth.jwt() ->> 'role') = 'service_role');

-- =====================================================
-- PERFORMANCE INDEXES FOR OPTIMIZED FUNCTIONS
-- =====================================================

-- Ensure critical indexes exist for function performance
CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id_business_id
ON users(clerk_user_id, business_id)
WHERE clerk_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_business_memberships_user_business_role_status
ON business_memberships(user_id, business_id, role, status)
WHERE status = 'active';

-- =====================================================
-- VALIDATION AND COMMENTS
-- =====================================================

COMMENT ON FUNCTION get_current_user_id IS 'Get current user UUID from JWT with caching optimization';

-- Test the optimized functions (should work after deployment)
-- SELECT get_current_user_id();
-- SELECT get_user_business_id();
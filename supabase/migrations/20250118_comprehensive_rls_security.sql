-- =====================================================
-- COMPREHENSIVE RLS SECURITY FOUNDATION
-- Implementing defense-in-depth security for FinanSEAL
-- =====================================================

-- Step 1: Create optimized security functions for JWT claim extraction
-- These functions are STABLE and SECURITY DEFINER for optimal caching

CREATE OR REPLACE FUNCTION get_jwt_claim(claim_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE  -- Critical: STABLE functions can be cached within transaction
AS $$
DECLARE
  jwt_claims jsonb;
  claim_value text;
BEGIN
  -- Get JWT claims once and cache within transaction
  jwt_claims := current_setting('request.jwt.claims', true)::jsonb;

  -- Extract specific claim
  claim_value := jwt_claims ->> claim_name;

  RETURN claim_value;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- Step 2: Create optimized business context resolution function
CREATE OR REPLACE FUNCTION get_user_business_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE  -- Critical: STABLE for caching optimization
AS $$
DECLARE
  user_business_id uuid;
  clerk_user_id text;
BEGIN
  -- Get clerk user ID from JWT (cached by get_jwt_claim)
  clerk_user_id := get_jwt_claim('sub');

  IF clerk_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Single optimized query to get business_id
  SELECT u.business_id INTO user_business_id
  FROM users u
  WHERE u.clerk_user_id = clerk_user_id
  LIMIT 1;

  RETURN user_business_id;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- Step 3: Create user ID resolution function
CREATE OR REPLACE FUNCTION get_current_user_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE  -- Critical: STABLE for caching optimization
AS $$
DECLARE
  user_uuid uuid;
  clerk_user_id text;
BEGIN
  -- Get clerk user ID from JWT (cached by get_jwt_claim)
  clerk_user_id := get_jwt_claim('sub');

  IF clerk_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Single optimized query to get user UUID
  SELECT u.id INTO user_uuid
  FROM users u
  WHERE u.clerk_user_id = clerk_user_id
  LIMIT 1;

  RETURN user_uuid;
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

-- Step 4: Create role checking function for permission-based policies
CREATE OR REPLACE FUNCTION user_has_role(required_role text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE  -- Critical: STABLE for caching optimization
AS $$
DECLARE
  user_uuid uuid;
  user_business_id uuid;
  has_role boolean := false;
BEGIN
  -- Get current user context (cached by previous functions)
  user_uuid := get_current_user_id();
  user_business_id := get_user_business_id();

  IF user_uuid IS NULL OR user_business_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check role in business_memberships
  SELECT EXISTS(
    SELECT 1 FROM business_memberships bm
    WHERE bm.user_id = user_uuid
    AND bm.business_id = user_business_id
    AND bm.role = required_role
    AND bm.status = 'active'
  ) INTO has_role;

  RETURN has_role;
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

-- =====================================================
-- COMPREHENSIVE RLS POLICIES FOR ALL TABLES
-- =====================================================

-- TABLE: users
-- Security: Users can see their own profile + admins can see business users
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their own profile"
ON users
FOR ALL
TO public
USING (
  id = get_current_user_id()
);

CREATE POLICY "Admins can access business users"
ON users
FOR SELECT
TO public
USING (
  user_has_role('admin') AND
  business_id = get_user_business_id()
);

-- TABLE: businesses
-- Security: Users can only see their current business
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their business"
ON businesses
FOR ALL
TO public
USING (
  id = get_user_business_id()
);

-- TABLE: business_memberships
-- Security: Users see their own membership + admins see business memberships
ALTER TABLE business_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their own membership"
ON business_memberships
FOR ALL
TO public
USING (
  user_id = get_current_user_id()
);

CREATE POLICY "Admins can manage business memberships"
ON business_memberships
FOR ALL
TO public
USING (
  user_has_role('admin') AND
  business_id = get_user_business_id()
);

-- TABLE: accounting_entries (transactions)
-- Security: Business-scoped access with role-based permissions
ALTER TABLE accounting_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business accounting entries access"
ON accounting_entries
FOR ALL
TO public
USING (
  business_id = get_user_business_id()
);

-- TABLE: expense_claims
-- Security: Own claims + manager/admin can see business claims
ALTER TABLE expense_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own expense claims"
ON expense_claims
FOR ALL
TO public
USING (
  user_id = get_current_user_id()
);

CREATE POLICY "Managers and admins can access business expense claims"
ON expense_claims
FOR ALL
TO public
USING (
  (user_has_role('manager') OR user_has_role('admin')) AND
  business_id = get_user_business_id()
);

-- TABLE: invoices
-- Security: Business-scoped access for document processing
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business invoices access"
ON invoices
FOR ALL
TO public
USING (
  business_id = get_user_business_id()
);

-- TABLE: line_items
-- Security: Access via parent accounting_entry relationship
ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;

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

-- TABLE: applications
-- Security: Own applications + admins can see business applications
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own applications"
ON applications
FOR ALL
TO public
USING (
  user_id = get_current_user_id()
);

CREATE POLICY "Admins can access business applications"
ON applications
FOR ALL
TO public
USING (
  user_has_role('admin') AND
  business_id = get_user_business_id()
);

-- TABLE: application_documents
-- Security: Access via parent application relationship
ALTER TABLE application_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Application documents access via applications"
ON application_documents
FOR ALL
TO public
USING (
  user_id = get_current_user_id() OR
  (user_has_role('admin') AND business_id = get_user_business_id())
);

-- TABLE: vendors
-- Security: Business-scoped vendor management
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Business vendors access"
ON vendors
FOR ALL
TO public
USING (
  business_id = get_user_business_id()
);

-- TABLE: conversations (chat)
-- Security: Own conversations + business-scoped for admins
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their own conversations"
ON conversations
FOR ALL
TO public
USING (
  user_id = get_current_user_id()::text
);

CREATE POLICY "Admins can access business conversations"
ON conversations
FOR SELECT
TO public
USING (
  user_has_role('admin') AND
  business_id = get_user_business_id()
);

-- TABLE: messages
-- Security: Access via parent conversation relationship
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Messages access via conversations"
ON messages
FOR ALL
TO public
USING (
  user_id = get_current_user_id() OR
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
    AND (c.user_id = get_current_user_id()::text OR
         (c.business_id = get_user_business_id() AND user_has_role('admin')))
  )
);

-- TABLE: audit_events
-- Security: Admins only, business-scoped
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can access business audit events"
ON audit_events
FOR SELECT
TO public
USING (
  user_has_role('admin') AND
  business_id = get_user_business_id()
);

-- =====================================================
-- PERFORMANCE INDEXES FOR RLS OPTIMIZATION
-- =====================================================

-- Critical indexes for RLS function performance
CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id_business_id
ON users(clerk_user_id, business_id)
WHERE clerk_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_business_memberships_user_business_role_status
ON business_memberships(user_id, business_id, role, status)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_accounting_entries_business_id_user_id
ON accounting_entries(business_id, user_id);

CREATE INDEX IF NOT EXISTS idx_expense_claims_business_id_user_id
ON expense_claims(business_id, user_id);

CREATE INDEX IF NOT EXISTS idx_invoices_business_id_user_id
ON invoices(business_id, user_id);

-- =====================================================
-- GRANT PERMISSIONS
-- =====================================================

-- Grant execute permissions on security functions to authenticated users
GRANT EXECUTE ON FUNCTION get_jwt_claim(text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_business_id() TO authenticated;
GRANT EXECUTE ON FUNCTION get_current_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION user_has_role(text) TO authenticated;

-- =====================================================
-- VALIDATION QUERIES
-- =====================================================

-- Test security functions (these should work after deployment)
-- SELECT get_jwt_claim('sub');
-- SELECT get_current_user_id();
-- SELECT get_user_business_id();
-- SELECT user_has_role('admin');

COMMENT ON FUNCTION get_jwt_claim IS 'Optimized JWT claim extraction with caching';
COMMENT ON FUNCTION get_user_business_id IS 'Get current user business ID from JWT with caching';
COMMENT ON FUNCTION get_current_user_id IS 'Get current user UUID from JWT with caching';
COMMENT ON FUNCTION user_has_role IS 'Check if current user has specific role in their business';
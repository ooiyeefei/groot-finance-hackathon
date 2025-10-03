-- Multi-Tenant RBAC Migration: Owner vs Admin Separation
-- Created: 2025-01-01
-- Phase 1: Database Schema Migration

BEGIN;

-- =============================================================================
-- 1. ADD OWNER_ID TO BUSINESSES TABLE
-- =============================================================================

-- Add owner_id column to businesses (business-level ownership)
ALTER TABLE businesses
ADD COLUMN owner_id TEXT REFERENCES users(id);

-- Create index for fast owner lookups
CREATE INDEX idx_businesses_owner_id ON businesses(owner_id);

-- =============================================================================
-- 2. CREATE BUSINESS_MEMBERSHIPS TABLE
-- =============================================================================

-- Junction table for operational roles (many-to-many)
CREATE TABLE business_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- Operational Role (NOT ownership) - Application defines permissions
  role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'employee')),

  -- Membership Metadata
  invited_by_id TEXT REFERENCES users(id),
  invited_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_accessed_at TIMESTAMPTZ,

  -- Status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Constraints
  UNIQUE(user_id, business_id)
);

-- Performance Indexes
CREATE INDEX idx_memberships_user ON business_memberships(user_id, status) WHERE status = 'active';
CREATE INDEX idx_memberships_business ON business_memberships(business_id, role);
CREATE INDEX idx_memberships_last_accessed ON business_memberships(user_id, last_accessed_at DESC);

-- Enable RLS
ALTER TABLE business_memberships ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "users_see_own_memberships" ON business_memberships
  FOR SELECT USING (user_id = auth.uid());

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

-- =============================================================================
-- 3. DATA MIGRATION
-- =============================================================================

-- Step 3.1: Populate owner_id from existing data
-- Find the first admin user for each business and make them owner
UPDATE businesses
SET owner_id = (
  SELECT ep.user_id
  FROM employee_profiles ep
  WHERE ep.business_id = businesses.id
    AND (ep.role_permissions->>'admin')::boolean = true
  LIMIT 1
);

-- Step 3.2: For businesses without admin, use the first user
UPDATE businesses
SET owner_id = (
  SELECT ep.user_id
  FROM employee_profiles ep
  WHERE ep.business_id = businesses.id
  LIMIT 1
)
WHERE owner_id IS NULL;

-- Step 3.3: Make owner_id NOT NULL after population
ALTER TABLE businesses
ALTER COLUMN owner_id SET NOT NULL;

-- Step 3.4: Migrate employee_profiles to business_memberships
INSERT INTO business_memberships (user_id, business_id, role, joined_at, status)
SELECT
  ep.user_id,
  ep.business_id,
  CASE
    WHEN (ep.role_permissions->>'admin')::boolean THEN 'admin'
    WHEN (ep.role_permissions->>'manager')::boolean THEN 'manager'
    ELSE 'employee'
  END as role,
  ep.created_at,
  'active'
FROM employee_profiles ep
WHERE ep.user_id IS NOT NULL
  AND ep.business_id IS NOT NULL
ON CONFLICT (user_id, business_id) DO NOTHING;

-- =============================================================================
-- 4. CREATE HELPER FUNCTIONS FOR RLS CONTEXT
-- =============================================================================

-- Function to set tenant context (called from application with JWT business_id)
CREATE OR REPLACE FUNCTION set_tenant_context(business_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_business_id', business_id::text, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get current business context
CREATE OR REPLACE FUNCTION current_business_id()
RETURNS UUID AS $$
BEGIN
  RETURN current_setting('app.current_business_id', true)::uuid;
EXCEPTION
  WHEN OTHERS THEN RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- 5. UPDATE RLS POLICIES FOR MULTI-TENANT ACCESS
-- =============================================================================

-- Update transactions RLS for multi-tenant context
DROP POLICY IF EXISTS "transactions_user_access" ON transactions;

CREATE POLICY "transactions_business_access" ON transactions
  FOR ALL USING (
    business_id = current_business_id()
    AND business_id IN (
      SELECT bm.business_id FROM business_memberships bm
      WHERE bm.user_id = auth.uid() AND bm.status = 'active'
    )
  );

-- Update documents RLS
DROP POLICY IF EXISTS "documents_user_access" ON documents;

CREATE POLICY "documents_business_access" ON documents
  FOR ALL USING (
    business_id = current_business_id()
    AND business_id IN (
      SELECT bm.business_id FROM business_memberships bm
      WHERE bm.user_id = auth.uid() AND bm.status = 'active'
    )
  );

-- Update expense_claims RLS
DROP POLICY IF EXISTS "expense_claims_user_access" ON expense_claims;

CREATE POLICY "expense_claims_business_access" ON expense_claims
  FOR ALL USING (
    business_id = current_business_id()
    AND business_id IN (
      SELECT bm.business_id FROM business_memberships bm
      WHERE bm.user_id = auth.uid() AND bm.status = 'active'
    )
  );

-- Update conversations RLS
DROP POLICY IF EXISTS "conversations_user_access" ON conversations;

CREATE POLICY "conversations_business_access" ON conversations
  FOR ALL USING (
    business_id = current_business_id()
    AND business_id IN (
      SELECT bm.business_id FROM business_memberships bm
      WHERE bm.user_id = auth.uid() AND bm.status = 'active'
    )
  );

-- =============================================================================
-- 6. VALIDATION QUERIES
-- =============================================================================

-- Validate data migration
DO $$
DECLARE
    original_count INTEGER;
    migrated_count INTEGER;
    businesses_without_owner INTEGER;
BEGIN
    -- Check employee_profiles vs business_memberships counts
    SELECT COUNT(*) INTO original_count FROM employee_profiles WHERE user_id IS NOT NULL;
    SELECT COUNT(*) INTO migrated_count FROM business_memberships;

    -- Check businesses without owners
    SELECT COUNT(*) INTO businesses_without_owner FROM businesses WHERE owner_id IS NULL;

    -- Raise notices about migration status
    RAISE NOTICE 'Migration Summary:';
    RAISE NOTICE 'Original employee_profiles: %', original_count;
    RAISE NOTICE 'Migrated business_memberships: %', migrated_count;
    RAISE NOTICE 'Businesses without owner: %', businesses_without_owner;

    -- Fail migration if critical issues found
    IF businesses_without_owner > 0 THEN
        RAISE EXCEPTION 'Migration failed: % businesses without owner_id', businesses_without_owner;
    END IF;

    IF migrated_count = 0 AND original_count > 0 THEN
        RAISE EXCEPTION 'Migration failed: No data migrated to business_memberships';
    END IF;

    RAISE NOTICE 'Migration validation completed successfully';
END
$$;

COMMIT;

-- =============================================================================
-- ROLLBACK INSTRUCTIONS (for emergencies)
-- =============================================================================

/*
-- To rollback this migration:

BEGIN;

-- 1. Drop new table and functions
DROP TABLE IF EXISTS business_memberships CASCADE;
DROP FUNCTION IF EXISTS set_tenant_context(UUID);
DROP FUNCTION IF EXISTS current_business_id();

-- 2. Remove owner_id column
ALTER TABLE businesses DROP COLUMN IF EXISTS owner_id;

-- 3. Restore original RLS policies (need to recreate based on your current policies)
-- Note: You'll need to restore the original RLS policies for transactions, documents, etc.

COMMIT;
*/
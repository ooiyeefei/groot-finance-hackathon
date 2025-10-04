-- Comprehensive UUID Migration: Fix all TEXT->UUID type mismatches
-- This resolves PGRST301 "No suitable key or wrong key type" errors

-- Step 1: Drop all foreign key constraints that reference users.id
ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_actor_user_id_fkey;
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_owner_id_fkey;
ALTER TABLE expense_claims DROP CONSTRAINT IF EXISTS expense_claims_current_approver_id_fkey;
ALTER TABLE business_memberships DROP CONSTRAINT IF EXISTS business_memberships_user_id_fkey;
ALTER TABLE business_memberships DROP CONSTRAINT IF EXISTS business_memberships_invited_by_id_fkey;
ALTER TABLE transaction_sequences DROP CONSTRAINT IF EXISTS transaction_sequences_user_id_fkey;
ALTER TABLE employee_profiles DROP CONSTRAINT IF EXISTS employee_profiles_user_id_fkey;

-- Step 2: Drop all RLS policies that depend on users.id
DROP POLICY IF EXISTS "Users can access business via membership" ON businesses;
DROP POLICY IF EXISTS "Users can access their business via membership" ON businesses;
DROP POLICY IF EXISTS "Users can access their own memberships" ON business_memberships;
DROP POLICY IF EXISTS "Users can access their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can access their own messages" ON messages;
DROP POLICY IF EXISTS "Users can create their own employee profile" ON employee_profiles;
DROP POLICY IF EXISTS "Users can update their own employee profile" ON employee_profiles;
DROP POLICY IF EXISTS "Users can view their own employee profile" ON employee_profiles;
DROP POLICY IF EXISTS "Users can access their own profile" ON users;

-- Step 3: Convert all foreign key columns to UUID type
ALTER TABLE audit_events ALTER COLUMN actor_user_id SET DATA TYPE uuid USING actor_user_id::uuid;
ALTER TABLE businesses ALTER COLUMN owner_id SET DATA TYPE uuid USING owner_id::uuid;
ALTER TABLE expense_claims ALTER COLUMN current_approver_id SET DATA TYPE uuid USING current_approver_id::uuid;
ALTER TABLE business_memberships ALTER COLUMN user_id SET DATA TYPE uuid USING user_id::uuid;
ALTER TABLE business_memberships ALTER COLUMN invited_by_id SET DATA TYPE uuid USING invited_by_id::uuid;
ALTER TABLE transaction_sequences ALTER COLUMN user_id SET DATA TYPE uuid USING user_id::uuid;
ALTER TABLE employee_profiles ALTER COLUMN user_id SET DATA TYPE uuid USING user_id::uuid;

-- Step 4: Convert users.id to UUID type
ALTER TABLE users ALTER COLUMN id SET DATA TYPE uuid USING id::uuid;

-- Step 5: Recreate foreign key constraints
ALTER TABLE audit_events
    ADD CONSTRAINT audit_events_actor_user_id_fkey
    FOREIGN KEY (actor_user_id) REFERENCES users(id);

ALTER TABLE businesses
    ADD CONSTRAINT businesses_owner_id_fkey
    FOREIGN KEY (owner_id) REFERENCES users(id);

ALTER TABLE expense_claims
    ADD CONSTRAINT expense_claims_current_approver_id_fkey
    FOREIGN KEY (current_approver_id) REFERENCES users(id);

ALTER TABLE business_memberships
    ADD CONSTRAINT business_memberships_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE business_memberships
    ADD CONSTRAINT business_memberships_invited_by_id_fkey
    FOREIGN KEY (invited_by_id) REFERENCES users(id);

ALTER TABLE transaction_sequences
    ADD CONSTRAINT transaction_sequences_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE employee_profiles
    ADD CONSTRAINT employee_profiles_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

-- Step 6: Recreate RLS policies with correct UUID handling
CREATE POLICY "Users can access their own profile" ON users
    FOR ALL USING (clerk_user_id::text = requesting_user_id());

CREATE POLICY "Users can access their own memberships" ON business_memberships
    FOR ALL USING (user_id IN (
        SELECT users.id FROM users
        WHERE users.clerk_user_id::text = requesting_user_id()
    ));

CREATE POLICY "Users can access business via membership" ON businesses
    FOR ALL USING (
        id IN (
            SELECT bm.business_id
            FROM business_memberships bm
            JOIN users u ON u.id = bm.user_id
            WHERE u.clerk_user_id::text = requesting_user_id()
            AND bm.status = 'active'
        )
        OR id IN (
            SELECT u.business_id
            FROM users u
            WHERE u.clerk_user_id::text = requesting_user_id()
        )
    );

CREATE POLICY "Users can access their own conversations" ON conversations
    FOR ALL USING (user_id IN (
        SELECT users.id FROM users
        WHERE users.clerk_user_id::text = requesting_user_id()
    ));

CREATE POLICY "Users can access their own messages" ON messages
    FOR ALL USING (user_id IN (
        SELECT users.id FROM users
        WHERE users.clerk_user_id::text = requesting_user_id()
    ));

CREATE POLICY "Users can create their own employee profile" ON employee_profiles
    FOR INSERT WITH CHECK (user_id IN (
        SELECT users.id FROM users
        WHERE users.clerk_user_id::text = requesting_user_id()
    ));

CREATE POLICY "Users can update their own employee profile" ON employee_profiles
    FOR UPDATE USING (user_id IN (
        SELECT users.id FROM users
        WHERE users.clerk_user_id::text = requesting_user_id()
    ));

CREATE POLICY "Users can view their own employee profile" ON employee_profiles
    FOR SELECT USING (user_id IN (
        SELECT users.id FROM users
        WHERE users.clerk_user_id::text = requesting_user_id()
    ));
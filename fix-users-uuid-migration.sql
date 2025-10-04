-- Fix users.id to be proper UUID type
-- This resolves PGRST301 "No suitable key or wrong key type" errors

-- Step 1: Drop all policies that depend on users.id
DROP POLICY IF EXISTS "Users can access business via membership" ON businesses;
DROP POLICY IF EXISTS "Users can access their business via membership" ON businesses;
DROP POLICY IF EXISTS "Users can access their own memberships" ON business_memberships;
DROP POLICY IF EXISTS "Users can access their own conversations" ON conversations;
DROP POLICY IF EXISTS "Users can access their own messages" ON messages;
DROP POLICY IF EXISTS "Users can create their own employee profile" ON employee_profiles;
DROP POLICY IF EXISTS "Users can update their own employee profile" ON employee_profiles;
DROP POLICY IF EXISTS "Users can view their own employee profile" ON employee_profiles;
DROP POLICY IF EXISTS "Users can access their own profile" ON users;

-- Step 2: Change users.id to proper UUID type
ALTER TABLE users ALTER COLUMN id SET DATA TYPE uuid USING id::uuid;

-- Step 3: Recreate all RLS policies with correct UUID handling
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
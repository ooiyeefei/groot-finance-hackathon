-- Add invited_role field to users table for storing role during invitation
-- This serves as a fallback when business_memberships doesn't exist yet

BEGIN;

-- Add the invited_role column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_role TEXT CHECK (invited_role IN ('admin', 'manager', 'employee'));

-- Update the specific invitation that's showing as employee
UPDATE users
SET invited_role = 'manager'
WHERE id = '662a571c-f3f0-4dec-8722-6a52285688d3'::uuid
  AND clerk_user_id IS NULL
  AND invited_by IS NOT NULL;

-- Create business_memberships record for existing invitations that don't have one
INSERT INTO business_memberships (user_id, business_id, role, invited_by_id, invited_at, status)
SELECT
  u.id,
  u.business_id,
  COALESCE(u.invited_role, 'employee') as role,
  -- Find the user ID of the inviter by their clerk_user_id
  (SELECT u2.id FROM users u2 WHERE u2.clerk_user_id = u.invited_by LIMIT 1),
  u.created_at,
  'active'
FROM users u
LEFT JOIN business_memberships bm ON bm.user_id = u.id AND bm.business_id = u.business_id
WHERE u.clerk_user_id IS NULL
  AND u.invited_by IS NOT NULL
  AND bm.id IS NULL -- Only insert where business_memberships doesn't exist
ON CONFLICT (user_id, business_id) DO NOTHING;

COMMIT;
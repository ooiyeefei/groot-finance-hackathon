-- Test SQL syntax for key problematic sections
-- This validates the main syntax fixes

-- Test 1: ENUM creation with IF NOT EXISTS
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'test_expense_claim_event_type') THEN
        CREATE TYPE test_expense_claim_event_type AS ENUM ('created', 'submitted');
    END IF;
END $$;

-- Test 2: Policy creation with proper syntax
CREATE TABLE IF NOT EXISTS test_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type test_expense_claim_event_type NOT NULL
);

ALTER TABLE test_events ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'test_events' AND policyname = 'test_events_access'
    ) THEN
        CREATE POLICY "test_events_access" ON test_events
        FOR SELECT USING (true); -- Simplified policy for testing
    END IF;
END $$;

-- Test 3: Index creation
CREATE INDEX IF NOT EXISTS idx_test_events_id ON test_events(id);

-- Clean up test objects
DROP POLICY IF EXISTS "test_events_access" ON test_events;
DROP TABLE IF EXISTS test_events;
DROP TYPE IF EXISTS test_expense_claim_event_type;

SELECT 'Syntax validation completed successfully' as status;
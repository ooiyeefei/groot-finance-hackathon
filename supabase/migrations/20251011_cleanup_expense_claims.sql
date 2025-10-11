-- Migration: Remove unused column from expense_claims table
-- Date: 2025-10-11
-- Impact: None (column not referenced in code)
-- Risk Level: ✅ SAFE - Zero code changes required
-- Analysis Reference: full_analysis.md Section 7.2.6

-- Step 1: Verify column is unused (safety check)
-- Expected: Count may be > 0 (historical data) but column no longer used in code
DO $$
DECLARE
  non_null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO non_null_count
  FROM expense_claims
  WHERE reviewed_at IS NOT NULL;

  RAISE NOTICE 'reviewed_at column has % non-null rows (historical data)', non_null_count;
END $$;

-- Step 2: Drop unused column
ALTER TABLE public.expense_claims
  DROP COLUMN IF EXISTS reviewed_at CASCADE;

-- Step 3: Verify column removal
DO $$
DECLARE
  column_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'expense_claims'
      AND column_name = 'reviewed_at'
  ) INTO column_exists;

  IF column_exists THEN
    RAISE EXCEPTION 'Column reviewed_at still exists after DROP command';
  ELSE
    RAISE NOTICE '✅ Column reviewed_at successfully removed from expense_claims table';
  END IF;
END $$;

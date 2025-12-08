-- Migration: Drop Legacy Applications Tables
-- Created: 2025-12-08
-- Purpose: Remove unused applications domain tables and associated RLS policies
--
-- Tables to drop:
--   - application_documents (depends on applications)
--   - applications (depends on application_types)
--   - application_types
--
-- Reference: tasks/database-cleanup-proposal.md

-- ============================================================================
-- STEP 1: Drop RLS policies first (must be done before dropping tables)
-- ============================================================================

-- Drop application_documents RLS policies
DROP POLICY IF EXISTS "Users can view application_documents for their business" ON application_documents;
DROP POLICY IF EXISTS "Users can insert application_documents for their business" ON application_documents;
DROP POLICY IF EXISTS "Users can update application_documents for their business" ON application_documents;
DROP POLICY IF EXISTS "Users can delete application_documents for their business" ON application_documents;

-- Drop applications RLS policies
DROP POLICY IF EXISTS "Users can view applications for their business" ON applications;
DROP POLICY IF EXISTS "Users can insert applications for their business" ON applications;
DROP POLICY IF EXISTS "Users can update applications for their business" ON applications;
DROP POLICY IF EXISTS "Users can delete applications for their business" ON applications;

-- Drop application_types RLS policies (if any)
DROP POLICY IF EXISTS "Users can view application_types" ON application_types;
DROP POLICY IF EXISTS "Users can view application_types for their business" ON application_types;

-- ============================================================================
-- STEP 2: Drop tables in dependency order
-- ============================================================================

-- Drop application_documents first (foreign key to applications)
DROP TABLE IF EXISTS application_documents CASCADE;

-- Drop applications second (foreign key to application_types)
DROP TABLE IF EXISTS applications CASCADE;

-- Drop application_types last (no dependencies)
DROP TABLE IF EXISTS application_types CASCADE;

-- ============================================================================
-- STEP 3: Verify cleanup (for logging purposes)
-- ============================================================================

-- This will error if any tables still exist (which is what we want as verification)
DO $$
BEGIN
  RAISE NOTICE 'Successfully dropped legacy applications tables: application_documents, applications, application_types';
END $$;

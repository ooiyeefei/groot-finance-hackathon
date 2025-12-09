-- Migration: Drop Unused Database Columns
-- Created: 2025-12-08
-- Purpose: Remove columns that are not actively used in the codebase
--
-- Analysis Summary:
-- - Total columns to drop: 21
-- - All columns verified to have 0 or only default data
-- - Code references verified via grep across TypeScript codebase
--
-- Reference: Database column cleanup analysis session

-- ============================================================================
-- STEP 1: Drop accounting_entries columns (3 columns)
-- ============================================================================

-- vendor_details: 0/44 rows have data, never written in code
ALTER TABLE accounting_entries DROP COLUMN IF EXISTS vendor_details;

-- compliance_analysis: 1/44 rows have data, AI tool rarely used
ALTER TABLE accounting_entries DROP COLUMN IF EXISTS compliance_analysis;

-- compliance_status: All 'unchecked' default values, not actively used
ALTER TABLE accounting_entries DROP COLUMN IF EXISTS compliance_status;

-- ============================================================================
-- STEP 2: Drop conversations columns (1 column)
-- ============================================================================

-- context_summary: 0/94 rows have data, never written
ALTER TABLE conversations DROP COLUMN IF EXISTS context_summary;

-- ============================================================================
-- STEP 3: Drop expense_claims columns (2 columns)
-- ============================================================================

-- reviewed_at: 0 code references, not used
ALTER TABLE expense_claims DROP COLUMN IF EXISTS reviewed_at;

-- current_approver_id: 0/24 rows have data, deprecated for approved_by_ids pattern
-- Note: Need to drop FK constraint first if exists
ALTER TABLE expense_claims DROP CONSTRAINT IF EXISTS expense_claims_current_approver_id_fkey;
ALTER TABLE expense_claims DROP COLUMN IF EXISTS current_approver_id;

-- ============================================================================
-- STEP 4: Drop invoices columns (10 columns)
-- ============================================================================

-- Annotation columns (feature dormant): 0 code references
ALTER TABLE invoices DROP COLUMN IF EXISTS annotated_metadata_path;
ALTER TABLE invoices DROP COLUMN IF EXISTS annotation_status;
ALTER TABLE invoices DROP COLUMN IF EXISTS annotation_error_message;
ALTER TABLE invoices DROP COLUMN IF EXISTS annotation_processed_at;
ALTER TABLE invoices DROP COLUMN IF EXISTS annotated_image_path;

-- Duplicate detection columns (not implemented): 0 code references
ALTER TABLE invoices DROP COLUMN IF EXISTS duplicate_risk_score;
ALTER TABLE invoices DROP COLUMN IF EXISTS ocr_metadata;
ALTER TABLE invoices DROP COLUMN IF EXISTS image_hash;
ALTER TABLE invoices DROP COLUMN IF EXISTS metadata_hash;

-- ============================================================================
-- STEP 5: Drop line_items columns (2 columns)
-- ============================================================================

-- category: 0/146 rows have data, 0 code references
ALTER TABLE line_items DROP COLUMN IF EXISTS category;

-- item_category: copies parent category, not granular AI categorization
-- Note: 89/146 rows have data but it's just copying parent invoice category
ALTER TABLE line_items DROP COLUMN IF EXISTS item_category;

-- ============================================================================
-- STEP 6: Drop messages columns (1 column)
-- ============================================================================

-- token_count: 0/664 rows have data, never written
ALTER TABLE messages DROP COLUMN IF EXISTS token_count;

-- ============================================================================
-- STEP 7: Drop vendors columns (3 columns)
-- ============================================================================

-- verification_status: All 'unverified', no verification workflow implemented
ALTER TABLE vendors DROP COLUMN IF EXISTS verification_status;

-- risk_level: All 'low', no risk assessment logic implemented
ALTER TABLE vendors DROP COLUMN IF EXISTS risk_level;

-- metadata: All empty {}, never populated
ALTER TABLE vendors DROP COLUMN IF EXISTS metadata;

-- ============================================================================
-- STEP 8: Verify cleanup
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Successfully dropped 21 unused columns:';
  RAISE NOTICE '  - accounting_entries: vendor_details, compliance_analysis, compliance_status';
  RAISE NOTICE '  - conversations: context_summary';
  RAISE NOTICE '  - expense_claims: reviewed_at, current_approver_id';
  RAISE NOTICE '  - invoices: annotated_metadata_path, annotation_status, annotation_error_message, annotation_processed_at, annotated_image_path, duplicate_risk_score, ocr_metadata, image_hash, metadata_hash';
  RAISE NOTICE '  - line_items: category, item_category';
  RAISE NOTICE '  - messages: token_count';
  RAISE NOTICE '  - vendors: verification_status, risk_level, metadata';
END $$;

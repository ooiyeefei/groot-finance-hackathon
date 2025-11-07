-- Performance Optimization: Add comprehensive indexes for expense_claims table
-- These indexes target the most frequently filtered columns identified in the performance analysis

-- ✅ PRIMARY PERFORMANCE INDEX: Multi-column index for common filtering patterns
-- Covers: business_id + status + deleted_at (most common combination)
CREATE INDEX IF NOT EXISTS idx_expense_claims_business_status_deleted
ON expense_claims (business_id, status, deleted_at)
WHERE deleted_at IS NULL;

-- ✅ USER ACCESS INDEX: For employee dashboard (user_id + status + deleted_at)
CREATE INDEX IF NOT EXISTS idx_expense_claims_user_status_deleted
ON expense_claims (user_id, status, deleted_at)
WHERE deleted_at IS NULL;

-- ✅ MANAGER APPROVAL INDEX: For manager dashboard (reviewed_by + status + business_id)
CREATE INDEX IF NOT EXISTS idx_expense_claims_reviewer_status_business
ON expense_claims (reviewed_by, status, business_id)
WHERE deleted_at IS NULL AND reviewed_by IS NOT NULL;

-- ✅ DATE FILTERING INDEX: For date range queries (submitted_at + business_id)
CREATE INDEX IF NOT EXISTS idx_expense_claims_submitted_date_business
ON expense_claims (submitted_at, business_id)
WHERE deleted_at IS NULL;

-- ✅ SEARCH INDEX: For business_purpose and vendor_name text searches
CREATE INDEX IF NOT EXISTS idx_expense_claims_text_search_gin
ON expense_claims USING gin (
  to_tsvector('english', COALESCE(business_purpose, '') || ' ' || COALESCE(vendor_name, ''))
)
WHERE deleted_at IS NULL;

-- ✅ CATEGORY FILTERING INDEX: For expense category filtering
CREATE INDEX IF NOT EXISTS idx_expense_claims_category_business
ON expense_claims (expense_category, business_id)
WHERE deleted_at IS NULL AND expense_category IS NOT NULL;

-- ✅ PROCESSING STATUS INDEX: For background job monitoring
CREATE INDEX IF NOT EXISTS idx_expense_claims_processing_status
ON expense_claims (status, created_at)
WHERE deleted_at IS NULL AND status IN ('analyzing', 'processing', 'uploading');

-- ✅ COMPOSITE INDEX: For complex manager queries (business + user OR reviewer logic)
-- This helps with the OR condition: user_id = X OR reviewed_by = X
CREATE INDEX IF NOT EXISTS idx_expense_claims_manager_access
ON expense_claims (business_id, user_id, reviewed_by, status)
WHERE deleted_at IS NULL;

-- ✅ SUMMARY CALCULATION INDEX: Optimizes the RPC summary function
CREATE INDEX IF NOT EXISTS idx_expense_claims_summary_calc
ON expense_claims (business_id, status, home_currency_amount, total_amount)
WHERE deleted_at IS NULL;

-- Add performance monitoring comments
COMMENT ON INDEX idx_expense_claims_business_status_deleted IS 'Primary performance index for common business + status filtering';
COMMENT ON INDEX idx_expense_claims_user_status_deleted IS 'Employee dashboard access optimization';
COMMENT ON INDEX idx_expense_claims_reviewer_status_business IS 'Manager approval workflow optimization';
COMMENT ON INDEX idx_expense_claims_submitted_date_business IS 'Date range filtering optimization';
COMMENT ON INDEX idx_expense_claims_text_search_gin IS 'Full-text search optimization for business_purpose and vendor_name';
COMMENT ON INDEX idx_expense_claims_category_business IS 'Category filtering optimization';
COMMENT ON INDEX idx_expense_claims_processing_status IS 'Background job status monitoring';
COMMENT ON INDEX idx_expense_claims_manager_access IS 'Complex manager query optimization (OR conditions)';
COMMENT ON INDEX idx_expense_claims_summary_calc IS 'Summary RPC function optimization';

-- ✅ ANALYZE TABLE: Update statistics for query planner optimization
ANALYZE expense_claims;
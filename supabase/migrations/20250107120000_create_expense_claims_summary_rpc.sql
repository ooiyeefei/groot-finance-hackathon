-- Performance Optimization: Create RPC function for efficient expense claims summary calculation
-- This replaces the expensive JavaScript aggregation with database-level calculation

CREATE OR REPLACE FUNCTION get_expense_claims_summary(
  p_business_id UUID,
  p_user_id UUID,
  p_is_admin BOOLEAN DEFAULT FALSE,
  p_is_manager BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (
  total_claims INTEGER,
  pending_approval INTEGER,
  approved_amount DECIMAL(15,2),
  rejected_count INTEGER
)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered_claims AS (
    SELECT
      status,
      COALESCE(home_currency_amount, total_amount, 0) as amount
    FROM expense_claims ec
    WHERE
      ec.business_id = p_business_id
      AND ec.deleted_at IS NULL
      AND (
        CASE
          -- Admin can see all claims in business
          WHEN p_is_admin THEN TRUE
          -- Manager can see own claims OR claims assigned to them
          WHEN p_is_manager THEN (
            ec.user_id = p_user_id OR ec.reviewed_by = p_user_id
          )
          -- Employee can see only own claims
          ELSE ec.user_id = p_user_id
        END
      )
  )
  SELECT
    COUNT(*)::INTEGER as total_claims,
    COUNT(*) FILTER (WHERE status = 'submitted')::INTEGER as pending_approval,
    COALESCE(
      SUM(amount) FILTER (WHERE status IN ('approved', 'reimbursed')),
      0
    )::DECIMAL(15,2) as approved_amount,
    COUNT(*) FILTER (WHERE status = 'rejected')::INTEGER as rejected_count
  FROM filtered_claims;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_expense_claims_summary TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION get_expense_claims_summary IS 'Efficiently calculates expense claims summary statistics with role-based access control. Used for dashboard performance optimization.';
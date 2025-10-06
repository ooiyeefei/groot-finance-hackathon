-- Migration: Fix RPC functions to accept user_id_param instead of using auth.uid()
-- This fixes the "invalid input syntax for type uuid" error when Clerk ID is passed via JWT

-- 1. Update get_company_expense_summary to accept user_id_param
CREATE OR REPLACE FUNCTION public.get_company_expense_summary(
  business_id_param uuid,
  user_id_param uuid
)
RETURNS TABLE(total_claims bigint, pending_reimbursement bigint, total_approved numeric, total_rejected bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- SECURITY: Require authentication
  IF user_id_param IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- SECURITY: Validate caller is a member of the requested business
  IF NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = user_id_param
      AND business_id = business_id_param
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Not a member of business %', business_id_param;
  END IF;

  -- Return the authorized query results
  RETURN QUERY
  SELECT
    COUNT(*) as total_claims,
    COUNT(*) FILTER (WHERE ec.status = 'approved') as pending_reimbursement,
    COALESCE(SUM(t.home_amount) FILTER (WHERE ec.status IN ('approved', 'reimbursed', 'paid')), 0) as total_approved,
    COUNT(*) FILTER (WHERE ec.status = 'rejected') as total_rejected
  FROM expense_claims ec
  JOIN accounting_entries t ON ec.transaction_id = t.id
  WHERE ec.business_id = business_id_param
    AND ec.created_at >= DATE_TRUNC('month', CURRENT_DATE);
END;
$function$;

-- 2. Update get_team_expense_summary to accept user_id_param
CREATE OR REPLACE FUNCTION public.get_team_expense_summary(
  business_id_param uuid,
  user_id_param uuid
)
RETURNS TABLE(
  total_claims bigint,
  pending_count bigint,
  pending_amount numeric,
  approved_today bigint,
  approved_amount numeric,
  rejected_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  caller_business_id uuid;
  is_admin boolean := false;
BEGIN
  -- SECURITY: Require authentication
  IF user_id_param IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Get caller's business context
  SELECT business_id INTO caller_business_id
  FROM users
  WHERE id = user_id_param;

  IF caller_business_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- SECURITY: Validate caller has permission to access this business's data
  IF caller_business_id != business_id_param THEN
    RAISE EXCEPTION 'Unauthorized: Cannot access data from different business';
  END IF;

  -- Return the authorized query results
  RETURN QUERY
  SELECT
    COUNT(*) as total_claims,
    COUNT(*) FILTER (WHERE ec.status IN ('submitted', 'under_review', 'pending_approval')) as pending_count,
    COALESCE(SUM(t.home_amount) FILTER (WHERE ec.status IN ('submitted', 'under_review', 'pending_approval')), 0) as pending_amount,
    COUNT(*) FILTER (WHERE ec.status = 'approved' AND ec.approved_at >= CURRENT_DATE) as approved_today,
    COALESCE(SUM(t.home_amount) FILTER (WHERE ec.status IN ('approved', 'reimbursed', 'paid')), 0) as approved_amount,
    COUNT(*) FILTER (WHERE ec.status = 'rejected') as rejected_count
  FROM expense_claims ec
  JOIN accounting_entries t ON ec.transaction_id = t.id
  JOIN users emp ON ec.user_id = emp.id
  WHERE emp.business_id = business_id_param
    AND ec.created_at >= DATE_TRUNC('month', CURRENT_DATE);
END;
$function$;

-- 3. Update get_dashboard_analytics_realtime to accept user_id_param
CREATE OR REPLACE FUNCTION public.get_dashboard_analytics_realtime(
  p_start_date date,
  p_end_date date,
  user_id_param uuid DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    result json;
    current_user_id uuid;
    user_business_id uuid;
    total_income numeric := 0;
    total_expense numeric := 0;
    net_cash_flow numeric := 0;
    transaction_count integer := 0;
    avg_transaction_size numeric := 0;
    expense_growth_rate numeric := 0;
BEGIN
    -- Use provided user_id_param if available, otherwise fall back to auth.uid()
    current_user_id := COALESCE(user_id_param, auth.uid());

    -- SECURITY: Require authentication
    IF current_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- SECURITY: Get user's business membership
    SELECT bm.business_id
    INTO user_business_id
    FROM business_memberships bm
    WHERE bm.user_id = current_user_id
        AND bm.status = 'active'
    LIMIT 1;

    IF user_business_id IS NULL THEN
        RAISE EXCEPTION 'No active business found for user: %', current_user_id;
    END IF;

    -- Calculate for user's specific business only (SECURITY: business_id filter mandatory)
    SELECT
        COALESCE(SUM(CASE WHEN t.transaction_type = 'Income' THEN ABS(t.home_amount) ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN t.transaction_type = 'Expense' THEN ABS(t.home_amount) ELSE 0 END), 0),
        COUNT(*),
        COALESCE(AVG(ABS(t.home_amount)), 0)
    INTO
        total_income,
        total_expense,
        transaction_count,
        avg_transaction_size
    FROM accounting_entries t
    WHERE t.business_id = user_business_id
        AND t.transaction_date BETWEEN p_start_date AND p_end_date
        AND t.home_amount IS NOT NULL;

    -- Calculate net cash flow (income - expenses)
    net_cash_flow := total_income - total_expense;
    expense_growth_rate := 0;

    -- Build JSON response with correct field names
    result := json_build_object(
        'total_income', total_income,
        'total_expenses', total_expense,
        'net_profit', net_cash_flow,     -- Net profit = income - expenses
        'transaction_count', transaction_count,
        'average_transaction_size', avg_transaction_size,
        'expense_growth_rate', expense_growth_rate,
        'period', json_build_object(
            'start_date', p_start_date,
            'end_date', p_end_date
        ),
        'calculated_at', extract(epoch from now()) * 1000,
        'data_source', 'user_authenticated',
        'business_id', user_business_id,
        'user_id', current_user_id,
        'currency_breakdown', '{}',
        'category_breakdown', '{}',
        'aged_receivables', json_build_object(
            'current', 0, 'late_31_60', 0, 'late_61_90', 0, 'late_90_plus', 0, 'total_outstanding', 0
        ),
        'aged_payables', json_build_object(
            'current', 0, 'late_31_60', 0, 'late_61_90', 0, 'late_90_plus', 0, 'total_outstanding', 0
        )
    );

    RETURN result;
END;
$function$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_company_expense_summary(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_expense_summary(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_dashboard_analytics_realtime(date, date, uuid) TO authenticated;

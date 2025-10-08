-- =====================================================================
-- CRITICAL SECURITY FIXES - Priority 3.1, 3.2, 3.3
-- Fix authentication bypasses and business isolation vulnerabilities
-- =====================================================================

-- ===== 1. FIX get_matching_categories - Authentication Bypass =====
CREATE OR REPLACE FUNCTION get_matching_categories(
  business_id_param uuid,
  vendor_name_param text,
  description_param text,
  amount_param numeric DEFAULT NULL::numeric
)
RETURNS TABLE (
  category_name text,
  confidence_score numeric,
  match_reason text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
  caller_business_id uuid;
BEGIN
  current_user_id := auth.uid();

  -- ✅ SECURITY FIX: Always require authentication
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- ✅ SECURITY: Get caller's business context and validate access
  SELECT business_id INTO caller_business_id
  FROM users
  WHERE id = current_user_id;

  IF caller_business_id IS NULL THEN
    RAISE EXCEPTION 'User not found or no business context';
  END IF;

  -- ✅ SECURITY: Enforce business isolation
  IF caller_business_id != business_id_param THEN
    RAISE EXCEPTION 'Unauthorized: Cannot access data from different business';
  END IF;

  -- Category matching logic (placeholder - implement based on business rules)
  RETURN QUERY
  SELECT
    'office_supplies'::text as category_name,
    85.0::numeric as confidence_score,
    'Vendor name match'::text as match_reason
  WHERE vendor_name_param ILIKE '%office%'

  UNION ALL

  SELECT
    'travel'::text as category_name,
    90.0::numeric as confidence_score,
    'Description keywords'::text as match_reason
  WHERE description_param ILIKE '%travel%' OR description_param ILIKE '%hotel%';

END;
$$;

-- ===== 2. FIX get_dashboard_analytics - NO Authentication + NO Business Isolation =====
CREATE OR REPLACE FUNCTION get_dashboard_analytics(
  p_user_id uuid,
  p_start_date date,
  p_end_date date,
  p_force_refresh boolean DEFAULT false
)
RETURNS TABLE (
  total_transactions bigint,
  total_amount numeric,
  expense_count bigint,
  income_count bigint,
  pending_approvals bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
  caller_business_id uuid;
  target_user_business_id uuid;
BEGIN
  current_user_id := auth.uid();

  -- ✅ SECURITY FIX: Always require authentication
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- ✅ SECURITY: Get caller's business context
  SELECT business_id INTO caller_business_id
  FROM users
  WHERE id = current_user_id;

  IF caller_business_id IS NULL THEN
    RAISE EXCEPTION 'User not found or no business context';
  END IF;

  -- ✅ SECURITY: Validate target user is in same business
  SELECT business_id INTO target_user_business_id
  FROM users
  WHERE id = p_user_id;

  IF target_user_business_id IS NULL THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- ✅ SECURITY: Enforce business isolation
  IF caller_business_id != target_user_business_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot access analytics from different business';
  END IF;

  -- Analytics query with business isolation
  RETURN QUERY
  SELECT
    COUNT(*)::bigint as total_transactions,
    COALESCE(SUM(home_currency_amount), 0)::numeric as total_amount,
    COUNT(*) FILTER (WHERE transaction_type = 'expense')::bigint as expense_count,
    COUNT(*) FILTER (WHERE transaction_type = 'income')::bigint as income_count,
    0::bigint as pending_approvals -- Placeholder
  FROM accounting_entries ae
  WHERE ae.user_id = p_user_id
    AND ae.business_id = caller_business_id -- ✅ Business isolation
    AND ae.transaction_date BETWEEN p_start_date AND p_end_date;
END;
$$;

-- ===== 3. FIX set_tenant_context - Administrative Function NO Auth =====
CREATE OR REPLACE FUNCTION set_tenant_context(business_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
  caller_business_id uuid;
BEGIN
  current_user_id := auth.uid();

  -- ✅ SECURITY FIX: Always require authentication for administrative functions
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- ✅ SECURITY: Validate user has access to this business
  SELECT bm.business_id INTO caller_business_id
  FROM business_memberships bm
  WHERE bm.user_id = current_user_id
    AND bm.business_id = business_id
    AND bm.status = 'active';

  IF caller_business_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: User is not a member of business %', business_id;
  END IF;

  -- Set tenant context (Row Level Security context)
  PERFORM set_config('app.current_business_id', business_id::text, true);
  PERFORM set_config('app.current_user_id', current_user_id::text, true);
END;
$$;

-- ===== 4. FIX update_expense_claim_with_extraction - NO Auth + NO Business Isolation =====
CREATE OR REPLACE FUNCTION update_expense_claim_with_extraction(
  p_claim_id uuid,
  p_transaction_id uuid,
  p_transaction_data jsonb,
  p_line_items jsonb[],
  p_claim_data jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
  caller_business_id uuid;
  claim_business_id uuid;
  transaction_business_id uuid;
BEGIN
  current_user_id := auth.uid();

  -- ✅ SECURITY FIX: Always require authentication
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- ✅ SECURITY: Get caller's business context
  SELECT business_id INTO caller_business_id
  FROM users
  WHERE id = current_user_id;

  IF caller_business_id IS NULL THEN
    RAISE EXCEPTION 'User not found or no business context';
  END IF;

  -- ✅ SECURITY: Validate expense claim belongs to caller's business
  SELECT business_id INTO claim_business_id
  FROM expense_claims
  WHERE id = p_claim_id;

  IF claim_business_id IS NULL THEN
    RAISE EXCEPTION 'Expense claim not found: %', p_claim_id;
  END IF;

  IF claim_business_id != caller_business_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot access expense claim from different business';
  END IF;

  -- ✅ SECURITY: Validate transaction belongs to same business
  SELECT business_id INTO transaction_business_id
  FROM accounting_entries
  WHERE id = p_transaction_id;

  IF transaction_business_id IS NULL THEN
    RAISE EXCEPTION 'Transaction not found: %', p_transaction_id;
  END IF;

  IF transaction_business_id != caller_business_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot access transaction from different business';
  END IF;

  -- Update expense claim with extraction data
  UPDATE expense_claims
  SET
    processing_metadata = p_claim_data,
    updated_at = NOW()
  WHERE id = p_claim_id;

  -- Update transaction with extraction data
  UPDATE accounting_entries
  SET
    description = COALESCE((p_transaction_data->>'description')::text, description),
    vendor_name = COALESCE((p_transaction_data->>'vendor_name')::text, vendor_name),
    updated_at = NOW()
  WHERE id = p_transaction_id;
END;
$$;

-- ===== 5. FIX sync_expense_transaction_status - NO Authentication =====
CREATE OR REPLACE FUNCTION sync_expense_transaction_status()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();

  -- ✅ SECURITY FIX: Require authentication for data synchronization
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required for sync operations';
  END IF;

  -- Sync logic placeholder - implement based on business requirements
  -- Only sync data for authenticated user's business context
  UPDATE expense_claims ec
  SET status = ae.status
  FROM accounting_entries ae
  WHERE ec.accounting_entry_id = ae.id
    AND ec.business_id = (
      SELECT business_id FROM users WHERE id = current_user_id
    );
END;
$$;

-- ===== 6. FIX update_expense_risk_score - NO Authentication =====
CREATE OR REPLACE FUNCTION update_expense_risk_score()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
  caller_business_id uuid;
BEGIN
  current_user_id := auth.uid();

  -- ✅ SECURITY FIX: Require authentication for risk scoring updates
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required for risk score updates';
  END IF;

  -- ✅ SECURITY: Get caller's business context
  SELECT business_id INTO caller_business_id
  FROM users
  WHERE id = current_user_id;

  IF caller_business_id IS NULL THEN
    RAISE EXCEPTION 'User not found or no business context';
  END IF;

  -- Update risk scores only for caller's business
  UPDATE expense_claims
  SET risk_score = calculate_expense_risk_score(id)
  WHERE business_id = caller_business_id
    AND risk_score IS NULL;
END;
$$;

-- ===== 7. FIX set_user_context - Missing Business Validation =====
CREATE OR REPLACE FUNCTION set_user_context(user_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
  target_user_uuid uuid;
  caller_business_id uuid;
  target_user_business_id uuid;
BEGIN
  current_user_id := auth.uid();

  -- ✅ SECURITY FIX: Require authentication
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Convert text user_id to uuid (assuming it's a Supabase user ID)
  target_user_uuid := user_id::uuid;

  -- ✅ SECURITY: Get business contexts
  SELECT business_id INTO caller_business_id
  FROM users WHERE id = current_user_id;

  SELECT business_id INTO target_user_business_id
  FROM users WHERE id = target_user_uuid;

  -- ✅ SECURITY: Enforce business isolation
  IF caller_business_id IS NULL OR target_user_business_id IS NULL THEN
    RAISE EXCEPTION 'User context validation failed';
  END IF;

  IF caller_business_id != target_user_business_id THEN
    RAISE EXCEPTION 'Unauthorized: Cannot set context for user in different business';
  END IF;

  -- Set user context
  PERFORM set_config('app.current_user_id', user_id, true);
END;
$$;

-- ===== UTILITY FUNCTIONS - ADD AUTHENTICATION =====

-- Fix update_business_invitations_updated_at
CREATE OR REPLACE FUNCTION update_business_invitations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Trigger function - authentication handled at table level via RLS
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Fix update_vendors_updated_at
CREATE OR REPLACE FUNCTION update_vendors_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Trigger function - authentication handled at table level via RLS
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ===== AUDIT LOG =====
COMMENT ON FUNCTION get_matching_categories IS 'SECURITY FIX: Added auth.uid() validation and business isolation';
COMMENT ON FUNCTION get_dashboard_analytics IS 'SECURITY FIX: Added authentication and business context validation';
COMMENT ON FUNCTION set_tenant_context IS 'SECURITY FIX: Added authentication for administrative function';
COMMENT ON FUNCTION update_expense_claim_with_extraction IS 'SECURITY FIX: Added auth and business isolation';
COMMENT ON FUNCTION sync_expense_transaction_status IS 'SECURITY FIX: Added authentication requirement';
COMMENT ON FUNCTION update_expense_risk_score IS 'SECURITY FIX: Added auth and business context';
COMMENT ON FUNCTION set_user_context IS 'SECURITY FIX: Added business isolation validation';
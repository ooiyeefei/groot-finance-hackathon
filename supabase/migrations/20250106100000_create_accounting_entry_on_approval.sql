-- Create RPC function to atomically create accounting_entries and line_items when expense claim is approved
-- This enforces proper accounting flow: Only approved claims create general ledger entries

CREATE OR REPLACE FUNCTION create_accounting_entry_from_approved_claim(
  p_claim_id uuid,
  p_approver_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_claim expense_claims%ROWTYPE;
  v_metadata jsonb;
  v_financial_data jsonb;
  v_line_items jsonb;
  v_transaction_id uuid;
  v_business_id uuid;
  v_line_item jsonb;
BEGIN
  -- Step 1: Get expense claim with processing metadata
  SELECT * INTO v_claim
  FROM expense_claims
  WHERE id = p_claim_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found: %', p_claim_id;
  END IF;

  -- Verify claim has metadata
  IF v_claim.processing_metadata IS NULL THEN
    RAISE EXCEPTION 'Expense claim has no extraction metadata: %', p_claim_id;
  END IF;

  v_metadata := v_claim.processing_metadata;
  v_financial_data := v_metadata->'financial_data';
  v_line_items := v_metadata->'line_items';

  -- Verify financial data exists
  IF v_financial_data IS NULL THEN
    RAISE EXCEPTION 'No financial data in metadata for claim: %', p_claim_id;
  END IF;

  -- Get business_id for the transaction
  v_business_id := v_claim.business_id;

  -- Step 2: Create accounting_entries record (general ledger posting)
  INSERT INTO accounting_entries (
    user_id,
    business_id,
    description,
    original_amount,
    original_currency,
    home_currency,
    home_currency_amount,
    exchange_rate,
    transaction_date,
    transaction_type,
    category,
    vendor_name,
    reference_number,
    status,
    notes,
    created_at,
    updated_at
  )
  VALUES (
    v_claim.user_id,
    v_business_id,
    (v_financial_data->>'description')::text,
    (v_financial_data->>'total_amount')::numeric,
    (v_financial_data->>'original_currency')::text,
    (v_financial_data->>'home_currency')::text,
    (v_financial_data->>'home_currency_amount')::numeric,
    (v_financial_data->>'exchange_rate')::numeric,
    (v_financial_data->>'transaction_date')::date,
    'expense'::transaction_type,
    v_claim.expense_category,
    (v_financial_data->>'vendor_name')::text,
    (v_financial_data->>'reference_number')::text,
    'awaiting_payment',
    'Created from approved expense claim ' || p_claim_id::text,
    NOW(),
    NOW()
  )
  RETURNING id INTO v_transaction_id;

  -- Step 3: Create line_items if they exist
  IF v_line_items IS NOT NULL AND jsonb_array_length(v_line_items) > 0 THEN
    FOR v_line_item IN SELECT * FROM jsonb_array_elements(v_line_items)
    LOOP
      INSERT INTO line_items (
        transaction_id,
        item_description,
        quantity,
        unit_price,
        total_amount,
        currency,
        tax_amount,
        tax_rate,
        item_category,
        line_order,
        created_at,
        updated_at
      )
      VALUES (
        v_transaction_id,
        (v_line_item->>'item_description')::text,
        (v_line_item->>'quantity')::numeric,
        (v_line_item->>'unit_price')::numeric,
        (v_line_item->>'total_amount')::numeric,
        (v_line_item->>'currency')::text,
        COALESCE((v_line_item->>'tax_amount')::numeric, 0),
        COALESCE((v_line_item->>'tax_rate')::numeric, 0),
        (v_line_item->>'item_category')::text,
        (v_line_item->>'line_order')::integer,
        NOW(),
        NOW()
      );
    END LOOP;
  END IF;

  -- Step 4: Update expense_claims.accounting_entry_id to link to accounting entry
  UPDATE expense_claims
  SET
    accounting_entry_id = v_transaction_id,
    updated_at = NOW()
  WHERE id = p_claim_id;

  -- Return the new transaction_id for confirmation
  RETURN v_transaction_id;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error and re-raise
    RAISE EXCEPTION 'Failed to create accounting entry for claim %: %', p_claim_id, SQLERRM;
END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION create_accounting_entry_from_approved_claim IS
'Atomically creates accounting_entries and line_items from expense claim metadata when approved.
This enforces proper accounting flow: Only approved claims create general ledger entries.
Parameters: claim_id (uuid), approver_id (uuid)
Returns: accounting_entry_id (uuid) of newly created accounting entry';

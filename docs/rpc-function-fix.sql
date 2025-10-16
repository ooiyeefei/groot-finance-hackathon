-- Updated RPC function to fix line_items constraint violation
-- Copy and paste this into your Supabase SQL Editor

CREATE OR REPLACE FUNCTION create_accounting_entry_from_approved_claim(
  p_claim_id uuid,
  p_approver_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  claim_record expense_claims%ROWTYPE;
  financial_data JSONB;
  line_items_data JSONB;
  accounting_entry_id uuid;
  line_item JSONB;
BEGIN
  -- Get the expense claim with processing metadata
  SELECT * INTO claim_record
  FROM expense_claims
  WHERE id = p_claim_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense claim not found: %', p_claim_id;
  END IF;

  -- Extract financial data from processing_metadata
  financial_data := claim_record.processing_metadata -> 'financial_data';
  line_items_data := claim_record.processing_metadata -> 'line_items';

  IF financial_data IS NULL THEN
    RAISE EXCEPTION 'No financial data found in processing_metadata for claim: %', p_claim_id;
  END IF;

  -- ✅ POLYMORPHIC SCHEMA: Create accounting entry with proper source linking
  INSERT INTO accounting_entries (
    user_id,
    business_id,
    transaction_type,
    description,
    original_amount,
    original_currency,
    home_currency,
    home_currency_amount,
    exchange_rate,
    transaction_date,
    -- ✅ CRITICAL FIX: Use EXACT expense_category value (no mapping!)
    category,
    vendor_name,
    reference_number,
    status,
    created_at,
    updated_at,
    -- ✅ POLYMORPHIC FIELDS: Link to expense_claims table
    source_document_type,
    source_record_id
  ) VALUES (
    claim_record.user_id,
    claim_record.business_id,
    'Expense',
    COALESCE(financial_data ->> 'description', claim_record.vendor_name),
    (financial_data ->> 'total_amount')::decimal,
    financial_data ->> 'original_currency',
    COALESCE(financial_data ->> 'home_currency', financial_data ->> 'original_currency'),
    COALESCE((financial_data ->> 'home_currency_amount')::decimal, (financial_data ->> 'total_amount')::decimal),
    COALESCE((financial_data ->> 'exchange_rate')::decimal, 1.0),
    (financial_data ->> 'transaction_date')::date,
    -- ✅ CRITICAL: Use expense_category directly (no IFRS mapping)
    claim_record.expense_category,
    COALESCE(financial_data ->> 'vendor_name', claim_record.vendor_name),
    financial_data ->> 'reference_number',
    'pending',
    NOW(),
    NOW(),
    -- ✅ POLYMORPHIC LINKING: Identify this as expense_claim source
    'expense_claim',
    p_claim_id
  )
  RETURNING id INTO accounting_entry_id;

  -- Create line items if they exist
  IF line_items_data IS NOT NULL AND jsonb_array_length(line_items_data) > 0 THEN
    FOR line_item IN SELECT * FROM jsonb_array_elements(line_items_data)
    LOOP
      INSERT INTO line_items (
        accounting_entry_id,
        item_description,
        quantity,
        unit_price,
        total_amount,
        currency,
        tax_amount,
        tax_rate,
        item_category,
        line_order
      ) VALUES (
        accounting_entry_id,
        -- ✅ CRITICAL FIX: Handle both field names with COALESCE
        COALESCE(line_item ->> 'item_description', line_item ->> 'description'),
        COALESCE((line_item ->> 'quantity')::decimal, 1),
        COALESCE((line_item ->> 'unit_price')::decimal, 0),
        (line_item ->> 'total_amount')::decimal,
        COALESCE(line_item ->> 'currency', financial_data ->> 'original_currency'),
        COALESCE((line_item ->> 'tax_amount')::decimal, 0),
        COALESCE((line_item ->> 'tax_rate')::decimal, 0),
        line_item ->> 'item_category',
        COALESCE((line_item ->> 'line_order')::integer, 1)
      );
    END LOOP;
  END IF;

  RETURN accounting_entry_id;
END;
$$;
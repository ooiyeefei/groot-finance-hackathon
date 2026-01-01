-- Migration: Add business_id parameter to get_invoices_with_linked_transactions RPC
-- Purpose: Enable multi-tenant data isolation so users only see invoices for their active business
-- Issue: Users with multiple businesses were seeing invoices from ALL their businesses

-- First drop the old function signature (without p_business_id)
DROP FUNCTION IF EXISTS public.get_invoices_with_linked_transactions(
    uuid,  -- p_user_id
    text,  -- p_status
    text,  -- p_file_type
    timestamp with time zone,  -- p_date_from
    timestamp with time zone,  -- p_date_to
    text,  -- p_search
    integer,  -- p_limit
    timestamp with time zone   -- p_cursor
);

-- Create the new function with business_id parameter
CREATE OR REPLACE FUNCTION public.get_invoices_with_linked_transactions(
    p_user_id uuid,
    p_business_id uuid,  -- NEW: Required business context for multi-tenant isolation
    p_status text DEFAULT NULL::text,
    p_file_type text DEFAULT NULL::text,
    p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
    p_search text DEFAULT NULL::text,
    p_limit integer DEFAULT 20,
    p_cursor timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_result json;
BEGIN
    -- Single optimized query with proper indexes
    WITH filtered_invoices AS (
        SELECT
            i.*,
            CASE
                WHEN ae.id IS NOT NULL THEN json_build_object(
                    'id', ae.id,
                    'description', ae.description,
                    'original_amount', ae.original_amount,
                    'original_currency', ae.original_currency,
                    'created_at', ae.created_at
                )
                ELSE NULL
            END as linked_transaction
        FROM invoices i
        LEFT JOIN accounting_entries ae ON (
            ae.source_record_id = i.id
            AND ae.source_document_type = 'invoice'
            AND ae.deleted_at IS NULL
        )
        WHERE i.user_id = p_user_id
            AND i.business_id = p_business_id  -- NEW: Filter by business context
            AND i.deleted_at IS NULL
            AND (p_status IS NULL OR i.status = p_status)
            AND (p_file_type IS NULL OR i.file_type = p_file_type)
            AND (p_date_from IS NULL OR i.created_at >= p_date_from)
            AND (p_date_to IS NULL OR i.created_at <= p_date_to)
            AND (p_search IS NULL OR i.file_name ILIKE '%' || p_search || '%')
            AND (p_cursor IS NULL OR i.created_at < p_cursor)
        ORDER BY i.created_at DESC
        LIMIT p_limit
    ),
    count_query AS (
        -- Optimized count query using the same filters and indexes
        SELECT COUNT(*) as total
        FROM invoices i
        WHERE i.user_id = p_user_id
            AND i.business_id = p_business_id  -- NEW: Filter by business context
            AND i.deleted_at IS NULL
            AND (p_status IS NULL OR i.status = p_status)
            AND (p_file_type IS NULL OR i.file_type = p_file_type)
            AND (p_date_from IS NULL OR i.created_at >= p_date_from)
            AND (p_date_to IS NULL OR i.created_at <= p_date_to)
            AND (p_search IS NULL OR i.file_name ILIKE '%' || p_search || '%')
    )
    SELECT json_build_object(
        'documents', COALESCE(json_agg(row_to_json(fi) ORDER BY fi.created_at DESC), '[]'::json),
        'total_count', (SELECT total FROM count_query)
    ) INTO v_result
    FROM filtered_invoices fi;

    RETURN v_result;
END;
$function$;

-- Add comment documenting the change
COMMENT ON FUNCTION public.get_invoices_with_linked_transactions IS
'Fetches invoices with linked accounting entries for a specific user and business.
Added p_business_id parameter for multi-tenant data isolation (2025-12-31).
Users must specify their active business to only see invoices for that business context.';

-- Migration: Drop unused document_type column from invoices table
-- Date: 2025-01-24
-- Reason: Document type classification is now handled in classify-document.ts after conversion
--         The actual document type is not needed at upload time, only after AI classification

-- Step 1: Drop the index on document_type column
DROP INDEX IF EXISTS public.idx_invoices_document_type;

-- Step 2: Drop the check constraint on document_type column
ALTER TABLE public.invoices
DROP CONSTRAINT IF EXISTS documents_document_type_check;

-- Step 3: Drop the document_type column
ALTER TABLE public.invoices
DROP COLUMN IF EXISTS document_type;

-- Note: The RPC function get_invoices_with_linked_transactions uses SELECT i.*
--       which will automatically exclude the dropped column without breaking
-- Add document_type column to transactions table
-- This bridges the context gap between documents and transactions

-- Add the document_type column
ALTER TABLE public.transactions 
ADD COLUMN document_type text;

-- Add a check constraint to ensure valid document types
ALTER TABLE public.transactions 
ADD CONSTRAINT transactions_document_type_check 
CHECK (document_type IN ('invoice', 'receipt', 'bill', 'statement', 'contract', 'other'));

-- Add a comment explaining the column
COMMENT ON COLUMN public.transactions.document_type IS 'Document type extracted from OCR processing (invoice, receipt, bill, etc.)';

-- Create an index for efficient filtering by document type
CREATE INDEX IF NOT EXISTS idx_transactions_document_type 
ON public.transactions(document_type) 
WHERE document_type IS NOT NULL;

-- Update RLS policies to include the new column (if needed)
-- The existing RLS policies should automatically cover this column since it's part of the transactions table
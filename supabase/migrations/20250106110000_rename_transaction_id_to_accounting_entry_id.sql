-- Rename transaction_id to accounting_entry_id in expense_claims table for consistency
-- The accounting_entries table is the source of truth, so foreign key should match table name

-- Step 1: Drop existing foreign key constraint
ALTER TABLE expense_claims
DROP CONSTRAINT IF EXISTS expense_claims_transaction_id_fkey;

-- Step 2: Rename the column
ALTER TABLE expense_claims
RENAME COLUMN transaction_id TO accounting_entry_id;

-- Step 3: Re-add foreign key constraint with new name
ALTER TABLE expense_claims
ADD CONSTRAINT expense_claims_accounting_entry_id_fkey
FOREIGN KEY (accounting_entry_id)
REFERENCES accounting_entries(id)
ON DELETE SET NULL;

-- Step 4: Update column comment
COMMENT ON COLUMN expense_claims.accounting_entry_id IS
'Links to accounting_entries after approval. NULL until claim is approved.
Accounting principle: Only approved expenses should be posted to general ledger.
Renamed from transaction_id for consistency with accounting_entries table name.';

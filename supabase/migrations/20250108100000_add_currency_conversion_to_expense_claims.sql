-- Add currency conversion fields to expense_claims table
-- This allows draft claims to display converted amounts before accounting entry creation

ALTER TABLE expense_claims
ADD COLUMN IF NOT EXISTS home_currency VARCHAR(3),
ADD COLUMN IF NOT EXISTS home_currency_amount DECIMAL(15,4),
ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(10,6) DEFAULT 1.0;

-- Add helpful comments
COMMENT ON COLUMN expense_claims.home_currency IS 'User or business home currency (e.g., SGD, USD)';
COMMENT ON COLUMN expense_claims.home_currency_amount IS 'Amount converted to home currency';
COMMENT ON COLUMN expense_claims.exchange_rate IS 'Exchange rate used for conversion (original to home)';

-- Add index for currency queries
CREATE INDEX IF NOT EXISTS idx_expense_claims_currency ON expense_claims(currency);
CREATE INDEX IF NOT EXISTS idx_expense_claims_home_currency ON expense_claims(home_currency);
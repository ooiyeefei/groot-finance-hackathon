-- Migration: Create Transaction and Line Items Tables
-- Version: 001
-- Description: Add transaction management capabilities with multi-currency support

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Primary Transactions Table
CREATE TABLE transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id TEXT NOT NULL,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  
  -- Transaction Classification
  transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('income', 'expense', 'transfer')),
  category VARCHAR(100) NOT NULL,
  subcategory VARCHAR(100),
  description TEXT,
  reference_number VARCHAR(255),
  
  -- Multi-Currency Support (SEA SME focused)
  original_currency VARCHAR(3) NOT NULL, -- ISO 4217: THB, IDR, MYR, SGD, USD, etc.
  original_amount DECIMAL(15,2) NOT NULL CHECK (original_amount > 0),
  home_currency VARCHAR(3) NOT NULL,
  home_amount DECIMAL(15,2) NOT NULL CHECK (home_amount > 0),
  exchange_rate DECIMAL(10,6) NOT NULL CHECK (exchange_rate > 0),
  exchange_rate_date DATE NOT NULL,
  
  -- Business Context Fields
  transaction_date DATE NOT NULL,
  vendor_name VARCHAR(255),
  vendor_details JSONB, -- Store additional vendor information
  
  -- System Fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by_method VARCHAR(20) NOT NULL CHECK (created_by_method IN ('manual', 'document_extract')),
  
  -- Metadata for integration
  processing_metadata JSONB
);

-- Line Items for Detailed Transactions (invoices with multiple items)
CREATE TABLE line_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  
  -- Line Item Details
  description TEXT NOT NULL,
  quantity DECIMAL(10,3) DEFAULT 1 CHECK (quantity > 0),
  unit_price DECIMAL(15,2) NOT NULL,
  line_total DECIMAL(15,2) NOT NULL CHECK (line_total >= 0),
  
  -- Tax and Discount Information
  tax_amount DECIMAL(15,2) DEFAULT 0 CHECK (tax_amount >= 0),
  discount_amount DECIMAL(15,2) DEFAULT 0 CHECK (discount_amount >= 0),
  tax_rate DECIMAL(5,4), -- e.g., 0.0700 for 7% VAT in Thailand
  
  -- Classification
  item_category VARCHAR(100),
  
  -- System Fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  line_order INTEGER DEFAULT 1 -- For maintaining item order
);

-- Performance and Query Optimization Indexes
CREATE INDEX idx_transactions_user_date ON transactions(user_id, transaction_date DESC);
CREATE INDEX idx_transactions_user_category ON transactions(user_id, category);
CREATE INDEX idx_transactions_user_type ON transactions(user_id, transaction_type);
CREATE INDEX idx_transactions_document ON transactions(document_id) WHERE document_id IS NOT NULL;
CREATE INDEX idx_transactions_created_by_method ON transactions(user_id, created_by_method);
CREATE INDEX idx_transactions_currency ON transactions(user_id, original_currency);
CREATE INDEX idx_line_items_transaction ON line_items(transaction_id);

-- Full-text search for transaction descriptions and vendor names
CREATE INDEX idx_transactions_search ON transactions USING GIN (
  to_tsvector('english', coalesce(description, '') || ' ' || coalesce(vendor_name, ''))
);

-- Row Level Security (RLS) Policies
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_items ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own transactions
CREATE POLICY "Users can access own transactions" ON transactions
  FOR ALL USING (user_id = auth.uid()::text);

-- RLS Policy: Users can only access line items for their own transactions
CREATE POLICY "Users can access own line items" ON line_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM transactions 
      WHERE transactions.id = line_items.transaction_id 
      AND transactions.user_id = auth.uid()::text
    )
  );

-- Update trigger for transactions updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_transactions_updated_at 
  BEFORE UPDATE ON transactions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE transactions IS 'Financial transactions for Southeast Asian SMEs with multi-currency support';
COMMENT ON TABLE line_items IS 'Detailed line items for transactions (invoices, receipts with multiple items)';
COMMENT ON COLUMN transactions.original_currency IS 'Currency as it appears on the original document';
COMMENT ON COLUMN transactions.home_currency IS 'User''s preferred reporting currency';
COMMENT ON COLUMN transactions.exchange_rate IS 'Rate used for conversion: 1 original_currency = exchange_rate * home_currency';
COMMENT ON COLUMN transactions.created_by_method IS 'How transaction was created: manual entry vs document extraction';
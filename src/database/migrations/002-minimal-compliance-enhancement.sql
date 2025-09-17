-- Minimal Compliance Enhancement Migration (Production-Safe)
-- Based on Otto's requirements + Gemini Pro's architectural analysis
-- Implements hybrid approach: 3 new tables + JSONB extensions + audit consolidation

-- ============================================================================
-- PHASE 1: SAFE ADDITIONS ONLY (Zero Breaking Changes)
-- ============================================================================

-- 1.1 Create ENUM for expense claim events (Otto's audit requirement)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'expense_claim_event_type') THEN
        CREATE TYPE expense_claim_event_type AS ENUM (
            'created',
            'submitted', 
            'approved',
            'rejected',
            'changes_requested',
            'recalled',
            'reimbursed',
            'paid',
            'comment_added',
            'edited',
            'policy_override'
        );
    END IF;
END $$;

-- 1.2 Consolidated audit trail (Gemini Pro's consolidation strategy)
CREATE TABLE IF NOT EXISTS expense_claim_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_claim_id UUID NOT NULL REFERENCES expense_claims(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES employee_profiles(id),
    event_type expense_claim_event_type NOT NULL,
    details JSONB DEFAULT '{}', -- Flexible context: {from_status, to_status, comment, etc}
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for performance (Gemini Pro's recommendation)
CREATE INDEX IF NOT EXISTS idx_expense_claim_events_claim_id ON expense_claim_events(expense_claim_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_claim_events_actor_id ON expense_claim_events(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_claim_events_type ON expense_claim_events(event_type, created_at DESC);

-- 1.3 Vendors table (Otto's vendor verification requirement)
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),  -- User-scoped instead of business-scoped for now
    name TEXT NOT NULL,
    tax_id TEXT,
    risk_rating TEXT DEFAULT 'medium' CHECK (risk_rating IN ('low', 'medium', 'high')),
    verification_status TEXT DEFAULT 'unverified' 
        CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
    verification_notes TEXT,
    verified_by_id UUID REFERENCES employee_profiles(id),
    verified_at TIMESTAMPTZ,
    
    -- Flexible metadata for address, contact info, etc
    metadata JSONB DEFAULT '{}',
    
    -- System fields
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    
    -- Prevent duplicate vendors per user
    UNIQUE(user_id, name)
);

-- Vendor indexes
CREATE INDEX IF NOT EXISTS idx_vendors_user_id ON vendors(user_id, verification_status);
CREATE INDEX IF NOT EXISTS idx_vendors_risk_rating ON vendors(user_id, risk_rating);

-- 1.4 Policy overrides table (Otto's exception handling requirement)
CREATE TABLE IF NOT EXISTS policy_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_claim_id UUID NOT NULL REFERENCES expense_claims(id) ON DELETE CASCADE,
    policy_violation_code TEXT NOT NULL,
    violation_description TEXT NOT NULL,
    justification TEXT NOT NULL,
    
    -- Override authority
    granted_by_id UUID NOT NULL REFERENCES employee_profiles(id),
    override_authority TEXT NOT NULL CHECK (override_authority IN ('manager', 'admin', 'super_admin')),
    
    -- Audit fields
    granted_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    ip_address INET,
    
    -- Allow multiple overrides per claim but only one per violation type
    UNIQUE(expense_claim_id, policy_violation_code)
);

CREATE INDEX IF NOT EXISTS idx_policy_overrides_claim ON policy_overrides(expense_claim_id);
CREATE INDEX IF NOT EXISTS idx_policy_overrides_granted_by ON policy_overrides(granted_by_id, granted_at DESC);

-- 1.5 Periodic reviews table (Otto's compliance review requirement)
CREATE TABLE IF NOT EXISTS periodic_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),  -- User-scoped instead of business-scoped for now
    reviewer_id UUID REFERENCES employee_profiles(id),
    
    -- Review metadata
    review_period TEXT NOT NULL, -- 'YYYY-Q1', '2024-09'
    review_type TEXT NOT NULL CHECK (review_type IN ('monthly', 'quarterly', 'annual')),
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
    
    -- Review content
    scope_description TEXT,
    summary TEXT, -- Reviewer's findings and comments
    findings_details JSONB DEFAULT '[]', -- Structured findings
    
    -- Timestamps
    scheduled_date DATE,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    
    -- One review per period per user
    UNIQUE(user_id, review_period, review_type)
);

CREATE INDEX IF NOT EXISTS idx_periodic_reviews_user ON periodic_reviews(user_id, status);
CREATE INDEX IF NOT EXISTS idx_periodic_reviews_schedule ON periodic_reviews(scheduled_date, status);

-- ============================================================================
-- PHASE 2: EXTEND EXISTING TABLES (Backward Compatible)
-- ============================================================================

-- 2.1 Add Otto's compliance fields to expense_claims (nullable for safety)
ALTER TABLE expense_claims 
ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
ADD COLUMN IF NOT EXISTS business_purpose_details JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS vendor_verification_required BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS current_approver_id UUID REFERENCES employee_profiles(id);

-- 2.2 Link transactions to vendors (nullable for backward compatibility)
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id);

-- Index for vendor lookups (non-concurrent for migration safety)
CREATE INDEX IF NOT EXISTS idx_transactions_vendor_id ON transactions(vendor_id);

-- ============================================================================
-- PHASE 3: BACKFILL OPERATIONS (Idempotent)
-- ============================================================================

-- 3.1 Populate vendors table from existing transaction data
-- This is idempotent and can be run multiple times safely
INSERT INTO vendors (name, user_id, verification_status)
SELECT DISTINCT ON (t.vendor_name, t.user_id)
    t.vendor_name,
    t.user_id,
    'unverified' -- All historical vendors start as unverified
FROM transactions t
WHERE t.vendor_name IS NOT NULL 
AND t.vendor_name != ''
AND t.vendor_id IS NULL -- Only process transactions not yet linked
ON CONFLICT (user_id, name) DO NOTHING;

-- 3.2 Link existing transactions to vendors
UPDATE transactions 
SET vendor_id = v.id
FROM vendors v
WHERE transactions.vendor_name = v.name 
AND transactions.user_id = v.user_id
AND transactions.vendor_id IS NULL; -- Only update unlinked transactions

-- ============================================================================
-- PHASE 4: ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE expense_claim_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodic_reviews ENABLE ROW LEVEL SECURITY;

-- Expense claim events - readable by claim owner, approvers, and admins
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'expense_claim_events' AND policyname = 'expense_claim_events_access'
    ) THEN
        CREATE POLICY "expense_claim_events_access" ON expense_claim_events
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM expense_claims ec
                JOIN employee_profiles ep ON (ec.employee_id = ep.id OR ec.current_approver_id = ep.id)
                WHERE ec.id = expense_claim_events.expense_claim_id
                AND ep.user_id = auth.uid()
            ) OR
            EXISTS (
                SELECT 1 FROM employee_profiles ep 
                WHERE ep.user_id = auth.uid() 
                AND (ep.role_permissions->>'admin')::boolean = true
            )
        );
    END IF;
END $$;

-- Vendors - user scoped access
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'vendors' AND policyname = 'vendors_user_access'
    ) THEN
        CREATE POLICY "vendors_user_access" ON vendors
        FOR ALL USING (user_id = auth.uid());
    END IF;
END $$;

-- Policy overrides - viewable by granter and claim owner
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'policy_overrides' AND policyname = 'policy_overrides_access'
    ) THEN
        CREATE POLICY "policy_overrides_access" ON policy_overrides
        FOR SELECT USING (
            EXISTS (
                SELECT 1 FROM employee_profiles ep 
                WHERE ep.user_id = auth.uid() 
                AND (
                    ep.id = granted_by_id OR
                    ep.id IN (
                        SELECT ec.employee_id FROM expense_claims ec 
                        WHERE ec.id = expense_claim_id
                    )
                )
            )
        );
    END IF;
END $$;

-- Periodic reviews - user scoped and assigned reviewers
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'periodic_reviews' AND policyname = 'periodic_reviews_access'
    ) THEN
        CREATE POLICY "periodic_reviews_access" ON periodic_reviews
        FOR ALL USING (
            user_id = auth.uid() OR
            EXISTS (
                SELECT 1 FROM employee_profiles ep 
                WHERE ep.user_id = auth.uid() 
                AND ep.id = reviewer_id
            )
        );
    END IF;
END $$;

-- ============================================================================
-- PHASE 5: UTILITY FUNCTIONS
-- ============================================================================

-- 5.1 Function to calculate risk score (Otto's algorithm)
CREATE OR REPLACE FUNCTION calculate_expense_risk_score(
    claim_id UUID
) RETURNS INTEGER AS $$
DECLARE
    score INTEGER := 0;
    claim_amount NUMERIC;
    vendor_status TEXT;
    override_count INTEGER;
    employee_velocity INTEGER;
BEGIN
    -- Get claim data
    SELECT 
        t.home_currency_amount,
        v.verification_status,
        COUNT(po.id)
    INTO claim_amount, vendor_status, override_count
    FROM expense_claims ec
    JOIN transactions t ON ec.transaction_id = t.id
    LEFT JOIN vendors v ON t.vendor_id = v.id
    LEFT JOIN policy_overrides po ON ec.id = po.expense_claim_id
    WHERE ec.id = claim_id
    GROUP BY t.home_currency_amount, v.verification_status;
    
    -- Amount-based risk (Otto's requirements)
    IF claim_amount > 10000 THEN score := score + 30;
    ELSIF claim_amount > 5000 THEN score := score + 20;
    ELSIF claim_amount > 1000 THEN score := score + 10;
    END IF;
    
    -- Vendor risk
    CASE vendor_status
        WHEN 'unverified' THEN score := score + 25;
        WHEN 'rejected' THEN score := score + 40;
        WHEN 'pending' THEN score := score + 15;
        ELSE score := score + 0; -- verified vendors add no risk
    END CASE;
    
    -- Policy override risk
    score := score + (override_count * 15);
    
    -- Cap at 100
    RETURN LEAST(score, 100);
END;
$$ LANGUAGE plpgsql;

-- 5.2 Trigger to auto-update risk scores
CREATE OR REPLACE FUNCTION update_expense_risk_score()
RETURNS TRIGGER AS $$
BEGIN
    NEW.risk_score := calculate_expense_risk_score(NEW.id);
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger (only if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'trigger_expense_claims_risk_score'
    ) THEN
        CREATE TRIGGER trigger_expense_claims_risk_score
            BEFORE INSERT OR UPDATE ON expense_claims
            FOR EACH ROW EXECUTE FUNCTION update_expense_risk_score();
    END IF;
END $$;

-- 5.3 Auto-update timestamps on vendors
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'trigger_vendors_updated_at'
    ) THEN
        CREATE TRIGGER trigger_vendors_updated_at
            BEFORE UPDATE ON vendors
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
END $$;

-- ============================================================================
-- PHASE 6: VALIDATION AND CLEANUP
-- ============================================================================

-- 6.1 Validate migration success
DO $$
DECLARE
    vendor_count INTEGER;
    event_table_exists BOOLEAN;
    risk_score_exists BOOLEAN;
BEGIN
    -- Check vendors table population
    SELECT COUNT(*) INTO vendor_count FROM vendors;
    
    -- Check new table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'expense_claim_events'
    ) INTO event_table_exists;
    
    -- Check new column exists
    SELECT EXISTS (
        SELECT FROM information_schema.columns 
        WHERE table_name = 'expense_claims' AND column_name = 'risk_score'
    ) INTO risk_score_exists;
    
    RAISE NOTICE 'Migration validation: vendors=%, events_table=%, risk_score=%', 
        vendor_count, event_table_exists, risk_score_exists;
    
    IF NOT event_table_exists OR NOT risk_score_exists THEN
        RAISE EXCEPTION 'Migration validation failed';
    END IF;
END $$;

-- 6.2 Grant permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- ============================================================================
-- COMMENTS AND DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE vendors IS 'Otto requirement: Vendor verification and risk management';
COMMENT ON TABLE policy_overrides IS 'Otto requirement: Formal policy exception tracking with audit trail';
COMMENT ON TABLE periodic_reviews IS 'Otto requirement: Scheduled compliance review process';
COMMENT ON TABLE expense_claim_events IS 'Gemini Pro recommendation: Consolidated audit trail for all claim events';
COMMENT ON FUNCTION calculate_expense_risk_score IS 'Otto requirement: Automated risk scoring algorithm';

-- Final success message
SELECT 
    'Minimal compliance enhancement completed successfully' as status,
    (SELECT COUNT(*) FROM vendors) as vendors_migrated,
    (SELECT COUNT(*) FROM expense_claim_events) as events_created,
    now() as completed_at;
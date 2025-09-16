-- Enhanced Expense Management System Schema
-- Implements Otto's compliance requirements and Gemini Pro's architecture
-- 100% backward compatible - only additions, no breaking changes

-- ============================================================================
-- PHASE 1: FOUNDATION ENHANCEMENTS
-- ============================================================================

-- 1.1 Enhanced Business Purpose Documentation
ALTER TABLE expense_claims 
ADD COLUMN IF NOT EXISTS business_purpose_details JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS risk_score INTEGER DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
ADD COLUMN IF NOT EXISTS risk_metadata JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS vendor_verification_status TEXT DEFAULT 'not_required' 
  CHECK (vendor_verification_status IN ('not_required', 'pending', 'verified', 'rejected')),
ADD COLUMN IF NOT EXISTS compliance_flags JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS approval_chain JSONB DEFAULT '[]';

-- Add indexes for performance (Gemini Pro's recommendation)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expense_claims_risk_score ON expense_claims(risk_score);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expense_claims_vendor_verification ON expense_claims(vendor_verification_status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_expense_claims_status_business ON expense_claims(status, employee_id) 
  INCLUDE (created_at, updated_at);

-- 1.2 Vendor Management System (Otto's vendor verification requirement)
CREATE TABLE IF NOT EXISTS vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) NOT NULL,
    name TEXT NOT NULL,
    tax_id TEXT,
    bank_details JSONB, -- Will be encrypted
    verification_status TEXT NOT NULL DEFAULT 'unverified' 
      CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
    risk_rating TEXT NOT NULL DEFAULT 'medium'
      CHECK (risk_rating IN ('low', 'medium', 'high')),
    verified_by_id UUID REFERENCES employee_profiles(id),
    verified_at TIMESTAMPTZ,
    verification_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    
    UNIQUE(business_id, name)
);

-- Vendor indexes for performance
CREATE INDEX IF NOT EXISTS idx_vendors_business_status ON vendors(business_id, verification_status);
CREATE INDEX IF NOT EXISTS idx_vendors_risk_rating ON vendors(business_id, risk_rating);

-- Link transactions to vendors (backward compatible - nullable)
ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_vendor ON transactions(vendor_id);

-- 1.3 Policy Override System (Otto's exception handling)
CREATE TABLE IF NOT EXISTS policy_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_claim_id UUID REFERENCES expense_claims(id) NOT NULL,
    policy_violation_code TEXT NOT NULL,
    violation_description TEXT NOT NULL,
    justification TEXT NOT NULL,
    granted_by_id UUID REFERENCES employee_profiles(id) NOT NULL,
    granted_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    override_authority TEXT NOT NULL 
      CHECK (override_authority IN ('manager', 'admin', 'super_admin')),
    
    -- Audit fields
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    ip_address INET,
    
    -- Ensure one override per violation per claim
    UNIQUE(expense_claim_id, policy_violation_code)
);

CREATE INDEX IF NOT EXISTS idx_policy_overrides_claim ON policy_overrides(expense_claim_id);
CREATE INDEX IF NOT EXISTS idx_policy_overrides_granted_by ON policy_overrides(granted_by_id, granted_at DESC);

-- 1.4 Comprehensive Audit Trail (Gemini Pro's recommendation)
CREATE TABLE IF NOT EXISTS audit_trail (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ DEFAULT now() NOT NULL,
    user_id UUID REFERENCES users(id),
    user_name TEXT,
    impersonator_id UUID REFERENCES users(id), -- For admin actions
    ip_address INET,
    user_agent TEXT,
    
    -- Event details
    entity_type TEXT NOT NULL, -- 'expense_claim', 'vendor', 'policy_override'
    entity_id UUID NOT NULL,
    event_type TEXT NOT NULL, -- 'create', 'update', 'status_change', 'approve', 'reject'
    before_state JSONB, -- State before change
    after_state JSONB,  -- State after change
    comment TEXT,
    
    -- Risk and compliance
    risk_implications JSONB DEFAULT '[]',
    compliance_impact TEXT
);

-- Audit trail indexes - critical for performance
CREATE INDEX IF NOT EXISTS idx_audit_trail_timestamp ON audit_trail(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_entity ON audit_trail(entity_type, entity_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_user ON audit_trail(user_id, timestamp DESC);

-- Make audit trail append-only (Otto's compliance requirement)
ALTER TABLE audit_trail ENABLE ROW LEVEL SECURITY;

-- Allow insert only - no updates or deletes
CREATE POLICY IF NOT EXISTS "audit_trail_insert_only" 
ON audit_trail FOR INSERT 
WITH CHECK (true);

-- Allow read based on business context
CREATE POLICY IF NOT EXISTS "audit_trail_read_policy" 
ON audit_trail FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM employee_profiles ep 
    WHERE ep.user_id = auth.uid() 
    AND (ep.role_permissions->>'admin')::boolean = true
  )
);

-- ============================================================================
-- PHASE 2: PERIODIC REVIEW SYSTEM (Otto's requirement)
-- ============================================================================

-- 2.1 Periodic Reviews
CREATE TABLE IF NOT EXISTS periodic_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) NOT NULL,
    review_period TEXT NOT NULL, -- 'YYYY-Q1', '2024-01'
    review_type TEXT NOT NULL CHECK (review_type IN ('monthly', 'quarterly', 'annual')),
    status TEXT NOT NULL DEFAULT 'pending' 
      CHECK (status IN ('pending', 'in_progress', 'completed')),
    
    -- Review details
    reviewer_id UUID REFERENCES employee_profiles(id),
    scope_description TEXT,
    findings TEXT,
    action_items JSONB DEFAULT '[]',
    
    -- Timestamps
    scheduled_date DATE,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    
    -- Ensure one review per period per business
    UNIQUE(business_id, review_period, review_type)
);

-- 2.2 Review Items (claims included in review)
CREATE TABLE IF NOT EXISTS periodic_review_items (
    review_id UUID REFERENCES periodic_reviews(id) ON DELETE CASCADE,
    expense_claim_id UUID REFERENCES expense_claims(id) ON DELETE CASCADE,
    review_status TEXT DEFAULT 'pending' 
      CHECK (review_status IN ('pending', 'reviewed', 'flagged')),
    reviewer_notes TEXT,
    flagged_issues JSONB DEFAULT '[]',
    
    PRIMARY KEY (review_id, expense_claim_id)
);

CREATE INDEX IF NOT EXISTS idx_periodic_reviews_business ON periodic_reviews(business_id, status);
CREATE INDEX IF NOT EXISTS idx_periodic_reviews_schedule ON periodic_reviews(scheduled_date, status);

-- ============================================================================
-- PHASE 3: COMPLIANCE FRAMEWORK (ASEAN Requirements)
-- ============================================================================

-- 3.1 Compliance Rules Engine
CREATE TABLE IF NOT EXISTS compliance_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES businesses(id) NOT NULL,
    jurisdiction TEXT NOT NULL CHECK (jurisdiction IN ('TH', 'ID', 'MY', 'SG', 'VN', 'PH', 'MM', 'KH', 'LA', 'BN')),
    rule_type TEXT NOT NULL,
    rule_name TEXT NOT NULL,
    parameters JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    effective_date DATE DEFAULT CURRENT_DATE,
    expiry_date DATE,
    
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Insert default ASEAN compliance rules (Otto's requirements)
INSERT INTO compliance_rules (business_id, jurisdiction, rule_type, rule_name, parameters) 
SELECT 
    b.id,
    'TH' as jurisdiction,
    'receipt_threshold',
    'Thailand Receipt Requirement',
    '{"currency": "THB", "threshold_amount": 300, "required_documents": ["receipt", "tax_invoice"]}'::jsonb
FROM businesses b
ON CONFLICT DO NOTHING;

INSERT INTO compliance_rules (business_id, jurisdiction, rule_type, rule_name, parameters)
SELECT 
    b.id,
    'SG' as jurisdiction,
    'receipt_threshold', 
    'Singapore GST Documentation',
    '{"currency": "SGD", "threshold_amount": 25, "required_documents": ["receipt", "gst_invoice"]}'::jsonb
FROM businesses b  
ON CONFLICT DO NOTHING;

-- Add more ASEAN rules as needed...

-- ============================================================================
-- PERFORMANCE OPTIMIZATIONS (Gemini Pro's recommendations)
-- ============================================================================

-- 4.1 Materialized View for Manager Dashboard
CREATE MATERIALIZED VIEW IF NOT EXISTS manager_dashboard_stats AS
SELECT
    ep.manager_id,
    COUNT(*) FILTER (WHERE ec.status IN ('submitted', 'under_review')) AS pending_count,
    SUM(t.home_currency_amount) FILTER (WHERE ec.status IN ('submitted', 'under_review')) AS pending_amount,
    COUNT(*) FILTER (WHERE ec.status = 'approved' AND DATE(ec.updated_at) = CURRENT_DATE) AS approved_today,
    AVG(ec.risk_score) FILTER (WHERE ec.status IN ('submitted', 'under_review')) AS avg_risk_score,
    COUNT(*) FILTER (WHERE ec.vendor_verification_status = 'pending') AS pending_verification
FROM expense_claims ec
JOIN employee_profiles ep ON ec.employee_id = ep.id
JOIN transactions t ON ec.transaction_id = t.id
WHERE ec.deleted_at IS NULL
GROUP BY ep.manager_id;

-- Create unique index for materialized view refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_manager_dashboard_stats_manager 
ON manager_dashboard_stats(manager_id);

-- 4.2 Function to refresh dashboard stats (call every 5 minutes)
CREATE OR REPLACE FUNCTION refresh_manager_dashboard_stats()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY manager_dashboard_stats;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- BULK OPERATIONS OPTIMIZATION (Gemini Pro's recommendation)
-- ============================================================================

-- 5.1 Atomic bulk approval function
CREATE OR REPLACE FUNCTION bulk_approve_claims(
    claim_ids uuid[],
    approver_id uuid,
    action_type text,
    notes text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
    processed_count int := 0;
    failed_count int := 0;
    result_data json;
BEGIN
    -- Validate inputs
    IF action_type NOT IN ('approve', 'reject') THEN
        RAISE EXCEPTION 'Invalid action_type. Must be approve or reject.';
    END IF;
    
    -- Update claims atomically
    WITH updated_claims AS (
        UPDATE expense_claims 
        SET 
            status = CASE 
                WHEN action_type = 'approve' THEN 
                    CASE WHEN status = 'under_review' THEN 'approved'::text ELSE status END
                WHEN action_type = 'reject' THEN 'rejected'::text
            END,
            approved_at = CASE WHEN action_type = 'approve' THEN now() ELSE approved_at END,
            rejected_by_id = CASE WHEN action_type = 'reject' THEN approver_id ELSE rejected_by_id END,
            updated_at = now()
        WHERE id = ANY(claim_ids)
        AND status IN ('submitted', 'under_review')  -- Only process valid states
        RETURNING id, status
    ),
    audit_inserts AS (
        INSERT INTO audit_trail (
            user_id, entity_type, entity_id, event_type, 
            comment, after_state, timestamp
        )
        SELECT 
            approver_id, 'expense_claim', uc.id, 'bulk_' || action_type,
            notes, json_build_object('status', uc.status), now()
        FROM updated_claims uc
        RETURNING 1
    )
    SELECT count(*) INTO processed_count FROM updated_claims;
    
    -- Calculate failed count
    failed_count := array_length(claim_ids, 1) - processed_count;
    
    -- Build result
    result_data := json_build_object(
        'success', true,
        'processed_count', processed_count,
        'failed_count', failed_count,
        'action', action_type
    );
    
    RETURN result_data;
EXCEPTION
    WHEN OTHERS THEN
        RETURN json_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS AND AUTOMATION
-- ============================================================================

-- 6.1 Auto-update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to relevant tables
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_vendors_updated_at') THEN
        CREATE TRIGGER trigger_vendors_updated_at
            BEFORE UPDATE ON vendors
            FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    END IF;
END $$;

-- 6.2 Automatic risk score calculation
CREATE OR REPLACE FUNCTION calculate_risk_score(claim_id uuid)
RETURNS integer AS $$
DECLARE
    score integer := 0;
    claim_amount numeric;
    vendor_status text;
    override_count integer;
BEGIN
    -- Get claim data
    SELECT 
        t.home_currency_amount,
        v.verification_status,
        (SELECT count(*) FROM policy_overrides po WHERE po.expense_claim_id = claim_id)
    INTO claim_amount, vendor_status, override_count
    FROM expense_claims ec
    JOIN transactions t ON ec.transaction_id = t.id
    LEFT JOIN vendors v ON t.vendor_id = v.id
    WHERE ec.id = claim_id;
    
    -- Amount-based risk
    IF claim_amount > 10000 THEN score := score + 30;
    ELSIF claim_amount > 5000 THEN score := score + 20;
    ELSIF claim_amount > 1000 THEN score := score + 10;
    END IF;
    
    -- Vendor risk
    IF vendor_status = 'unverified' THEN score := score + 25;
    ELSIF vendor_status IS NULL THEN score := score + 15;
    END IF;
    
    -- Override risk
    score := score + (override_count * 15);
    
    RETURN LEAST(score, 100);
END;
$$ LANGUAGE plpgsql;

-- 6.3 Auto-calculate risk score on changes
CREATE OR REPLACE FUNCTION auto_update_risk_score()
RETURNS TRIGGER AS $$
BEGIN
    NEW.risk_score := calculate_risk_score(NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_expense_claims_risk_score') THEN
        CREATE TRIGGER trigger_expense_claims_risk_score
            BEFORE INSERT OR UPDATE ON expense_claims
            FOR EACH ROW EXECUTE FUNCTION auto_update_risk_score();
    END IF;
END $$;

-- ============================================================================
-- ROW LEVEL SECURITY ENHANCEMENTS
-- ============================================================================

-- Enhanced RLS for new tables
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodic_reviews ENABLE ROW LEVEL SECURITY;

-- Vendors - business scoped access
CREATE POLICY IF NOT EXISTS "vendors_business_access" ON vendors
FOR ALL USING (
    business_id IN (
        SELECT ep.business_id FROM employee_profiles ep 
        WHERE ep.user_id = auth.uid()
    )
);

-- Policy overrides - admin and involved users only
CREATE POLICY IF NOT EXISTS "policy_overrides_access" ON policy_overrides
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM employee_profiles ep 
        WHERE ep.user_id = auth.uid() 
        AND (
            ep.role_permissions->>'admin' = 'true' OR
            ep.id = granted_by_id OR
            ep.id IN (
                SELECT ec.employee_id FROM expense_claims ec 
                WHERE ec.id = expense_claim_id
            )
        )
    )
);

-- Periodic reviews - business admins and assigned reviewers
CREATE POLICY IF NOT EXISTS "periodic_reviews_access" ON periodic_reviews
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM employee_profiles ep 
        WHERE ep.user_id = auth.uid() 
        AND ep.business_id = periodic_reviews.business_id
        AND (
            ep.role_permissions->>'admin' = 'true' OR
            ep.id = reviewer_id
        )
    )
);

-- ============================================================================
-- COMMENTS AND DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE vendors IS 'Otto requirement: Vendor verification system for high-value expenses';
COMMENT ON TABLE policy_overrides IS 'Otto requirement: Formal policy exception handling with audit trail';
COMMENT ON TABLE periodic_reviews IS 'Otto requirement: Monthly/quarterly expense pattern review system';
COMMENT ON TABLE audit_trail IS 'Gemini Pro requirement: Comprehensive append-only audit system';
COMMENT ON FUNCTION bulk_approve_claims IS 'Gemini Pro requirement: Atomic bulk operations for performance';
COMMENT ON MATERIALIZED VIEW manager_dashboard_stats IS 'Gemini Pro requirement: Performance optimization for dashboard queries';

-- ============================================================================
-- VALIDATION AND HEALTH CHECKS
-- ============================================================================

-- Validate schema deployment
DO $$
DECLARE
    table_count int;
    function_count int;
    policy_count int;
BEGIN
    -- Check tables exist
    SELECT count(*) INTO table_count 
    FROM information_schema.tables 
    WHERE table_name IN ('vendors', 'policy_overrides', 'periodic_reviews', 'audit_trail');
    
    IF table_count != 4 THEN
        RAISE EXCEPTION 'Schema validation failed: Missing tables. Expected 4, found %', table_count;
    END IF;
    
    -- Check functions exist
    SELECT count(*) INTO function_count
    FROM information_schema.routines 
    WHERE routine_name IN ('bulk_approve_claims', 'calculate_risk_score', 'update_updated_at');
    
    IF function_count < 3 THEN
        RAISE EXCEPTION 'Schema validation failed: Missing functions. Expected at least 3, found %', function_count;
    END IF;
    
    RAISE NOTICE 'Schema deployment successful: % tables, % functions deployed', table_count, function_count;
END $$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Final success message
SELECT 'Enhanced expense management schema deployed successfully' as deployment_status;
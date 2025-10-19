-- Performance Optimization Indexes
-- Addresses TTFB regression in getCurrentBusinessContextOptimized function
-- Generated: 2025-01-17

-- Index 1: Primary lookup index for users.clerk_user_id
-- Optimizes: WHERE clerk_user_id = ?
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_clerk_user_id
ON users (clerk_user_id);

-- Index 2: Composite index for users table with ordering
-- Optimizes: WHERE clerk_user_id = ? ORDER BY created_at DESC
-- Includes business_id for covering index benefits
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_clerk_user_id_created_at_business_id
ON users (clerk_user_id, created_at DESC, business_id);

-- Index 3: Composite index for business_memberships primary lookup
-- Optimizes: WHERE user_id = ? AND business_id = ? AND status = 'active'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_memberships_user_business_status
ON business_memberships (user_id, business_id, status);

-- Index 4: Alternative composite index for business_memberships (status first)
-- Optimizes: Faster filtering when status = 'active' is most selective
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_memberships_status_user_business
ON business_memberships (status, user_id, business_id)
WHERE status = 'active';

-- Index 5: Covering index for business_memberships with role column
-- Optimizes: Includes role in index to avoid table lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_business_memberships_lookup_covering
ON business_memberships (user_id, business_id, status)
INCLUDE (role, joined_at, created_at);

-- Index 6: Ensure businesses.id is properly indexed (should exist as PK, but verify)
-- Optimizes: WHERE id = ? on businesses table
-- Note: This should already exist as primary key, but included for completeness
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_businesses_id ON businesses (id);

-- Performance Analysis Comments:
--
-- BEFORE (Sequential Scans):
-- - users table: Full table scan on clerk_user_id lookup (~10ms per 1000 users)
-- - business_memberships: Full table scan on composite WHERE (~15ms per 1000 memberships)
-- - Sort operation: In-memory sort of users.created_at (~5ms)
-- - Total estimated: ~30ms base + scaling issues
--
-- AFTER (Index Lookups):
-- - users table: B-tree index lookup on clerk_user_id (~0.1ms)
-- - business_memberships: B-tree index lookup on composite key (~0.1ms)
-- - Sort operation: Index-provided ordering (~0ms)
-- - Total estimated: ~0.3ms base + minimal scaling
--
-- Expected Performance Improvement:
-- - Single user lookup: 30ms → 0.3ms (99% improvement)
-- - Under load: Eliminates lock contention from sequential scans
-- - Memory usage: Reduces buffer cache pressure

-- Monitoring Queries (for validation):
--
-- Check if indexes are being used:
-- EXPLAIN (ANALYZE, BUFFERS) SELECT id, business_id FROM users WHERE clerk_user_id = 'user_test';
--
-- Check index usage stats:
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE indexname LIKE 'idx_%'
-- ORDER BY idx_scan DESC;
--
-- Check for unused indexes:
-- SELECT schemaname, tablename, indexname, idx_scan
-- FROM pg_stat_user_indexes
-- WHERE idx_scan = 0 AND indexname LIKE 'idx_%';
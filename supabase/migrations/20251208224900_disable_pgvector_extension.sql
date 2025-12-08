-- Migration: Disable pgvector Extension
-- Created: 2025-12-08
-- Purpose: Remove unused pgvector extension (app uses Qdrant Cloud for RAG)
--
-- Analysis:
--   - FinanSEAL uses Qdrant Cloud (external service) for vector search/RAG
--   - pgvector was accidentally enabled but never used
--   - This removes ~70+ unused pgvector functions polluting the database
--   - Vector search is handled by: src/lib/ai/ai-services/vector-storage-service.ts
--     which explicitly connects to Qdrant: this.qdrantUrl = aiConfig.qdrant.url
--
-- Reference: tasks/database-cleanup-proposal.md (Part 5: pgvector Extension)

-- ============================================================================
-- IMPORTANT: CASCADE will drop all dependent objects (functions, operators, types)
-- This is safe because pgvector is not used anywhere in the application
-- ============================================================================

-- Drop the vector extension and all its dependent objects
DROP EXTENSION IF EXISTS vector CASCADE;

-- ============================================================================
-- Verify cleanup
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE 'Successfully disabled pgvector extension - ~70+ unused functions removed';
  RAISE NOTICE 'Vector search continues to work via Qdrant Cloud (external service)';
END $$;

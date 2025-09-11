-- PostgreSQL/Supabase Compatible Migration: JSONB Metadata Indexes
-- Date: 2025-01-09  
-- Purpose: Optimize queries on messages.metadata for LangGraph agent state retrieval

-- Add GIN index on metadata JSONB column for general JSON operations
CREATE INDEX IF NOT EXISTS idx_messages_metadata_gin 
ON messages USING GIN (metadata);

-- Add specific indexes for clarification state queries
CREATE INDEX IF NOT EXISTS idx_messages_clarification_pending 
ON messages USING BTREE ((metadata->>'clarification_pending')) 
WHERE metadata->>'clarification_pending' IS NOT NULL;

-- Add compound index for user-specific metadata queries
CREATE INDEX IF NOT EXISTS idx_messages_user_clarification 
ON messages USING BTREE (user_id, (metadata->>'clarification_pending'))
WHERE metadata->>'clarification_pending' IS NOT NULL;

-- Add compound index for conversation-specific metadata queries
CREATE INDEX IF NOT EXISTS idx_messages_conversation_metadata 
ON messages USING BTREE (conversation_id)
WHERE metadata IS NOT NULL;

-- Add index for agent state presence queries
CREATE INDEX IF NOT EXISTS idx_messages_agent_state 
ON messages USING BTREE ((metadata ? 'agent_state'))
WHERE metadata ? 'agent_state';

-- Add partial index for recent messages with metadata (simplified)
CREATE INDEX IF NOT EXISTS idx_messages_recent_metadata 
ON messages USING BTREE (created_at DESC, user_id)
WHERE metadata IS NOT NULL;

-- Add expression index for extracting citation count
CREATE INDEX IF NOT EXISTS idx_messages_citation_count 
ON messages USING BTREE ((COALESCE(jsonb_array_length(metadata->'citations'), 0)))
WHERE metadata ? 'citations';

-- Add compound index optimized for clarification response detection
CREATE INDEX IF NOT EXISTS idx_messages_clarification_lookup 
ON messages USING BTREE (conversation_id, user_id, created_at DESC, role)
WHERE metadata IS NOT NULL;

-- Add comments for documentation
COMMENT ON INDEX idx_messages_metadata_gin IS 'GIN index for general JSONB operations on metadata column';
COMMENT ON INDEX idx_messages_clarification_pending IS 'Optimizes clarification state queries';
COMMENT ON INDEX idx_messages_user_clarification IS 'Optimizes user-specific clarification queries';
COMMENT ON INDEX idx_messages_conversation_metadata IS 'Optimizes conversation-specific metadata queries';
COMMENT ON INDEX idx_messages_agent_state IS 'Optimizes agent state presence checks';
COMMENT ON INDEX idx_messages_recent_metadata IS 'Optimizes recent messages with metadata queries';
COMMENT ON INDEX idx_messages_citation_count IS 'Optimizes citation count queries';
COMMENT ON INDEX idx_messages_clarification_lookup IS 'Optimizes clarification response detection queries';

-- Analyze table to update statistics after index creation
ANALYZE messages;
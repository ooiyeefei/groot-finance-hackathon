-- Migration: Add JSONB metadata indexes for agent state optimization
-- Date: 2025-01-09
-- Purpose: Optimize queries on messages.metadata for LangGraph agent state retrieval

-- Add GIN index on metadata JSONB column for general JSON operations
CREATE INDEX IF NOT EXISTS idx_messages_metadata_gin ON messages USING GIN (metadata);

-- Add specific indexes for clarification state queries
-- This optimizes queries like: WHERE metadata->>'clarification_pending' = 'true'
CREATE INDEX IF NOT EXISTS idx_messages_clarification_pending ON messages 
USING BTREE ((metadata->>'clarification_pending')) 
WHERE metadata->>'clarification_pending' IS NOT NULL;

-- Add compound index for user-specific metadata queries
-- This optimizes queries like: WHERE user_id = ? AND metadata->>'clarification_pending' = 'true'
CREATE INDEX IF NOT EXISTS idx_messages_user_clarification ON messages 
USING BTREE (user_id, (metadata->>'clarification_pending'))
WHERE metadata->>'clarification_pending' IS NOT NULL;

-- Add compound index for conversation-specific metadata queries
-- This optimizes queries like: WHERE conversation_id = ? AND metadata IS NOT NULL
CREATE INDEX IF NOT EXISTS idx_messages_conversation_metadata ON messages 
USING BTREE (conversation_id)
WHERE metadata IS NOT NULL;

-- Add index for agent state presence queries
-- This optimizes queries checking for saved agent state
CREATE INDEX IF NOT EXISTS idx_messages_agent_state ON messages 
USING BTREE ((metadata ? 'agent_state'))
WHERE metadata ? 'agent_state';

-- Add partial index for recent messages with metadata (performance optimization)
-- This helps with queries on recent conversations with agent state
CREATE INDEX IF NOT EXISTS idx_messages_recent_metadata ON messages 
USING BTREE (created_at DESC, user_id)
WHERE metadata IS NOT NULL;

-- Add expression index for extracting citation count (if citations are frequently queried)
CREATE INDEX IF NOT EXISTS idx_messages_citation_count ON messages 
USING BTREE ((COALESCE(jsonb_array_length(metadata->'citations'), 0)))
WHERE metadata ? 'citations';

-- Add compound index optimized for clarification response detection
-- This supports the checkIfClarificationResponse function queries
CREATE INDEX IF NOT EXISTS idx_messages_clarification_lookup ON messages 
USING BTREE (conversation_id, user_id, created_at DESC, role)
WHERE metadata IS NOT NULL;

-- Performance statistics update (optional, run manually if needed)
-- ANALYZE messages;

-- Add comments for documentation
COMMENT ON INDEX idx_messages_metadata_gin IS 'GIN index for general JSONB operations on metadata column';
COMMENT ON INDEX idx_messages_clarification_pending IS 'Optimizes clarification state queries';
COMMENT ON INDEX idx_messages_user_clarification IS 'Optimizes user-specific clarification queries';
COMMENT ON INDEX idx_messages_conversation_metadata IS 'Optimizes conversation-specific metadata queries';
COMMENT ON INDEX idx_messages_agent_state IS 'Optimizes agent state presence checks';
COMMENT ON INDEX idx_messages_recent_metadata IS 'Optimizes recent messages with metadata queries';
COMMENT ON INDEX idx_messages_citation_count IS 'Optimizes citation count queries';
COMMENT ON INDEX idx_messages_clarification_lookup IS 'Optimizes clarification response detection queries';

-- Migration completed successfully
-- These indexes will significantly improve performance for:
-- 1. Agent state restoration from database metadata  
-- 2. Clarification flow detection and processing
-- 3. Conversation context retrieval
-- 4. Citation-related queries
-- 5. Recent conversation metadata lookups
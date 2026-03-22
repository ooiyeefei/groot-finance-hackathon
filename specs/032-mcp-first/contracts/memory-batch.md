# MCP Contracts: Memory Batch

**Tools**: 4 tools migrating from tool-factory to MCP server

## memory_store
- **Input**: `{ business_id?, user_id, content, topic_tags?, metadata? }`
- **Output**: `{ memory_id, stored: true, contradiction_detected?, conflicting_memory_id? }`
- **RBAC**: all roles (scoped to own user_id)

## memory_search
- **Input**: `{ business_id?, user_id, query, limit?, similarity_threshold? }`
- **Output**: `{ memories: Memory[], count }`
- **RBAC**: all roles (scoped to own user_id)

## memory_recall
- **Input**: `{ business_id?, user_id, query, top_k? }`
- **Output**: `{ memories: Memory[], count }`
- **RBAC**: all roles (scoped to own user_id)
- **Note**: Semantic alias for memory_search (agent-facing)

## memory_forget
- **Input**: `{ business_id?, user_id, memory_id }`
- **Output**: `{ forgotten: true, memory_id }`
- **RBAC**: all roles (scoped to own user_id)
- **Note**: Soft delete (sets archivedAt)

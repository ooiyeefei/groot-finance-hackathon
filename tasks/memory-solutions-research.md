# AI Agent Memory Solutions Research (2025-2026)

## Executive Summary

This document analyzes state-of-the-art memory storage solutions for AI agents, with specific focus on compatibility with FinanSEAL's architecture (Convex database, Qdrant vector search, LangGraph StateGraph, multi-tenant isolation).

---

## 1. Mem0 (mem0ai/mem0)

### Overview
Mem0 is a "Universal memory layer for AI Agents" providing intelligent, hierarchical memory management. It's the most feature-complete dedicated memory solution available in 2025-2026.

### Architecture & Memory Types
Mem0 implements a **layered memory system** (not traditional episodic/semantic/procedural):

| Layer | Purpose | Persistence |
|-------|---------|-------------|
| **Conversation Memory** | Short-term context from current interactions | Session-scoped |
| **Session Memory** | Medium-term retention across related interactions | Session-scoped |
| **User Memory** | Long-term personal preferences and history | Permanent |
| **Agent Memory** | AI assistant configurations and learned behaviors | Permanent |
| **Graph Memory** | Entity relationships for multi-hop recall (Pro+) | Permanent |

### Entity Scoping (Multi-Tenant)
Memories can be partitioned by:
- `user_id` - Individual user preferences
- `agent_id` - AI assistant-specific context
- `app_id` / `application_id` - Service-level isolation
- `session_id` - Conversation thread scoping

**This maps well to FinanSEAL's `businessId` scoping requirement.**

### Pricing

| Tier | Cost | Memories | Retrieval API Calls | Key Features |
|------|------|----------|---------------------|--------------|
| **Hobby (Free)** | $0/month | 10,000 | 1,000/month | Community support |
| **Starter** | $19/month | 50,000 | 5,000/month | Community support |
| **Pro** | $249/month | Unlimited | 50,000/month | Graph Memory, Analytics, Multiple projects |
| **Enterprise** | Custom | Unlimited | Unlimited | On-prem, SSO, SLA, Audit logs |

### Vector Database Support
Mem0 supports **25+ vector databases** including:
- **Qdrant** (FinanSEAL's current choice)
- Chroma, PgVector, Milvus, Pinecone
- MongoDB, Redis, Elasticsearch
- Supabase, Weaviate, FAISS

### LangGraph Integration
Official integration available via `mem0ai` package:

```python
from langgraph.graph import StateGraph, START
from mem0 import MemoryClient
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4")
mem0 = MemoryClient()

# In your graph node:
def chatbot_node(state):
    # Retrieve relevant memories
    memories = mem0.search(state["messages"][-1].content, user_id=state["user_id"])

    # Generate response with memory context
    response = llm.invoke(...)

    # Store interaction
    mem0.add(messages=[...], user_id=state["user_id"])
    return {"messages": [...]}
```

### Self-Hosted vs Cloud

| Aspect | Self-Hosted (OSS) | Mem0 Cloud |
|--------|-------------------|------------|
| License | Apache 2.0 | Managed service |
| Infrastructure | You manage | Fully managed |
| LLM Providers | 15+ configurable | Default GPT-4.1-nano |
| Vector DBs | 20+ configurable | Built-in |
| Graph Memory | Yes | Yes (Pro+) |
| SOC 2 / GDPR | Your responsibility | Included |

### Pros
- Most comprehensive memory solution
- Native Qdrant support
- Flexible entity scoping for multi-tenancy
- LangGraph integration documented
- Self-hosted option with full control
- Graph memory for entity relationships

### Cons
- Free tier limited (10K memories, 1K API calls)
- Graph Memory requires Pro ($249/month)
- No native Convex integration (would need custom adapter)

---

## 2. LangGraph Native Memory

### Overview
LangGraph provides built-in memory capabilities through **checkpointers** (thread-level state) and **stores** (cross-thread memory).

### Memory Architecture

| Component | Purpose | Scope |
|-----------|---------|-------|
| **Checkpointer** | Save/restore graph execution state | Thread-level (conversation) |
| **Store** | Arbitrary key-value + vector memory | Cross-thread (user-level) |

### Checkpointer Options

| Checkpointer | Use Case | Backend |
|--------------|----------|---------|
| `InMemorySaver` | Development/testing only | RAM |
| `SqliteSaver` | Simple persistence | SQLite |
| `PostgresSaver` | Production (sync) | PostgreSQL |
| `AsyncPostgresSaver` | Production (async) | PostgreSQL |
| `MongoDBSaver` | Document-oriented | MongoDB |

**Note:** No native Convex checkpointer exists. Would require custom implementation.

### InMemoryStore for Long-Term Memory

```python
from langgraph.store.memory import InMemoryStore
from langchain_openai import OpenAIEmbeddings

store = InMemoryStore(
    index={
        "embed": OpenAIEmbeddings(model="text-embedding-3-small"),
        "dims": 1536,
    }
)

# Namespace by user + context
namespace = (user_id, "preferences")
store.put(namespace, "memory-key", {"data": "value"})

# Search with embeddings
items = store.search(namespace, query="language preferences")
```

### Pros
- Native LangGraph integration (no external dependencies)
- No additional cost
- Simple API for thread-level persistence
- Multiple production-ready backends

### Cons
- Limited memory abstraction (no hierarchical memory types)
- InMemoryStore is development-only; production stores are basic
- No built-in semantic memory extraction
- Checkpointers don't support Convex natively
- No graph memory for entity relationships

---

## 3. Zep (getzep/zep)

### Overview
Zep is a "context engineering platform" focusing on relationship-aware context delivery with sub-200ms latency. It uses **Graphiti** (open-source temporal knowledge graph) under the hood.

### Architecture
- **Episodes** - Conversation units (1 credit each)
- **Facts** - Timestamped entity relationships
- **Summaries** - Contextualized entity histories
- **Temporal Knowledge Graph** - Tracks relationship changes over time

### Multi-Tenant Support
- User management with individual user graphs
- **Group graphs** for shared memory across users
- Graph namespacing via `group_id`
- RBAC (Enterprise)

### Pricing

| Tier | Cost | Features |
|------|------|----------|
| **Free** | $0/month | 1,000 credits, rate-limited |
| **Flex** | $25/month | 20,000 credits, 5 projects |
| **Enterprise** | Custom | SOC 2, HIPAA, BYOK, BYOM, BYOC |

### Persistence Backends
Graphiti supports:
- Neo4j
- FalkorDB
- AWS Neptune
- Kuzu DB

### Pros
- Sophisticated temporal knowledge graph
- Sub-200ms latency guarantee
- Native multi-tenant support
- Strong enterprise compliance

### Cons
- Community Edition deprecated (Cloud-first)
- Credit-based pricing can get expensive
- No native Qdrant support
- Graph DB focus may not align with Convex/Qdrant stack
- Limited free tier

---

## 4. Letta (formerly MemGPT)

### Overview
Letta is a platform for "stateful AI agents with persistent memory that can learn over time." It pioneered the concept of LLM-managed memory blocks.

### Memory Types

| Type | Purpose | Management |
|------|---------|------------|
| **Core Memory** | Agent persona + user context | LLM-managed, always in context |
| **Archival Memory** | Long-term vector storage | LLM-triggered retrieval |
| **Recall Memory** | Recent conversation history | Automatic |
| **Shared Memory** | Multi-agent coordination | Explicit sharing |

### Pricing

| Tier | Cost | Credits | Storage |
|------|------|---------|---------|
| **Free** | $0/month | 5,000 | 1 GB |
| **Pro** | $20/month | 20,000 | 10 GB |
| **Enterprise** | Custom | Custom | Unlimited |

### Multi-Tenant Support
- User identities management
- RBAC (Enterprise)
- BYOC deployment options

### Pros
- Pioneering LLM-managed memory concept
- Self-hosted option available
- Multi-agent memory sharing
- Reasonable free tier

### Cons
- Credit-based model
- No explicit Qdrant integration
- No explicit Convex integration
- Less documentation on LangGraph integration
- Focus on their own agent framework

---

## 5. Comparison Table

| Feature | Mem0 | LangGraph Native | Zep | Letta |
|---------|------|------------------|-----|-------|
| **Free Tier** | 10K memories, 1K calls | Unlimited (self-managed) | 1K credits | 5K credits |
| **Open Source** | Apache 2.0 | MIT | Cloud-first | Apache 2.0 |
| **Self-Hosted** | Yes | Yes | No (deprecated) | Yes |
| **Qdrant Support** | Native | Custom only | No | No |
| **Convex Support** | Custom adapter | Custom checkpointer | No | No |
| **LangGraph Integration** | Official docs | Native | Examples | Limited |
| **Multi-Tenant Isolation** | Entity scoping | Namespace-based | Group graphs | User identities |
| **Memory Types** | Hierarchical layers | Thread + Cross-thread | Temporal graph | Core/Archival/Recall |
| **Graph Memory** | Yes (Pro+) | No | Native | No |
| **Entity Extraction** | Automatic | Manual | Automatic | LLM-managed |
| **Vector Embeddings** | 25+ backends | OpenAI, custom | Built-in | Built-in |
| **Real-Time Sync** | Via vector DB | Via checkpointer | Not specified | Not specified |
| **Production Ready** | Yes | Yes | Yes | Yes |

### Scoring for FinanSEAL Requirements

| Requirement | Mem0 | LangGraph | Zep | Letta |
|-------------|------|-----------|-----|-------|
| Convex integration | 3/5 (adapter) | 3/5 (custom checkpointer) | 1/5 | 1/5 |
| Qdrant support | 5/5 (native) | 2/5 (custom) | 1/5 | 2/5 |
| Multi-tenant (businessId) | 5/5 (entity scoping) | 4/5 (namespaces) | 4/5 (groups) | 3/5 |
| LangGraph StateGraph | 5/5 (documented) | 5/5 (native) | 3/5 | 2/5 |
| Free tier adequacy | 3/5 | 5/5 | 2/5 | 3/5 |
| Ease of integration | 4/5 | 5/5 | 3/5 | 2/5 |
| **Total** | **25/30** | **24/30** | **14/30** | **13/30** |

---

## 6. Recommendation for FinanSEAL

### Primary Recommendation: Hybrid Approach

**Use LangGraph Native Memory + Custom Mem0 Integration**

#### Phase 1: LangGraph Native (Immediate)
1. Implement custom **ConvexCheckpointer** extending `BaseCheckpointSaver`
2. Use Convex for conversation state persistence (thread-level memory)
3. Leverage existing Qdrant `VectorStorageService` for semantic search

```typescript
// Example ConvexCheckpointer structure
class ConvexCheckpointer extends BaseCheckpointSaver {
  constructor(private convex: ConvexClient) {}

  async put(config, checkpoint, metadata) {
    await this.convex.mutation(api.checkpoints.save, {
      threadId: config.configurable.thread_id,
      businessId: config.configurable.business_id,
      checkpoint: JSON.stringify(checkpoint),
      metadata
    })
  }

  async get(config) {
    return await this.convex.query(api.checkpoints.get, {
      threadId: config.configurable.thread_id,
      businessId: config.configurable.business_id
    })
  }
}
```

#### Phase 2: Enhanced Memory (Future)
1. Integrate **Mem0 Open Source** for hierarchical memory
2. Configure Mem0 with existing Qdrant instance
3. Add entity scoping using `businessId` as `app_id`

```python
# Mem0 OSS configuration for FinanSEAL
config = {
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "url": os.environ["QDRANT_URL"],
            "api_key": os.environ["QDRANT_API_KEY"],
            "collection_name": "finanseal_memories"
        }
    },
    "llm": {
        "provider": "anthropic",
        "config": {
            "model": "claude-3-5-sonnet-20241022"
        }
    }
}

memory = Memory.from_config(config)

# Store with businessId isolation
memory.add(
    messages=[...],
    user_id=user_id,
    metadata={"business_id": business_id}
)

# Search with businessId filter
memories = memory.search(
    query="recent transactions",
    user_id=user_id,
    filters={"business_id": business_id}
)
```

### Why This Approach?

1. **Immediate Value**: LangGraph native memory works today with minimal changes
2. **Existing Infrastructure**: Leverages Convex + Qdrant already in place
3. **Multi-Tenant Ready**: Both solutions support businessId scoping
4. **Cost Effective**: No additional SaaS costs initially (Mem0 OSS is free)
5. **Incremental Enhancement**: Can add Mem0's advanced features (graph memory, auto-extraction) later
6. **Production Proven**: LangGraph checkpointers are battle-tested

### Implementation Priority

| Priority | Task | Effort | Value |
|----------|------|--------|-------|
| P0 | Create ConvexCheckpointer for LangGraph | 1-2 days | Thread-level persistence |
| P1 | Enhance VectorStorageService for cross-thread memory | 1 day | Long-term user preferences |
| P2 | Integrate Mem0 OSS with Qdrant | 2-3 days | Hierarchical memory, auto-extraction |
| P3 | Add graph memory (Mem0 Pro or custom) | 1 week | Entity relationship tracking |

---

## 7. Architecture Diagram

```
                    FinanSEAL AI Agent Memory Architecture
                    =====================================

    +-----------------+     +-----------------+     +-----------------+
    |   User Query    |---->|   LangGraph     |---->|   AI Response   |
    +-----------------+     |   StateGraph    |     +-----------------+
                            +--------+--------+
                                     |
            +------------------------+------------------------+
            |                        |                        |
            v                        v                        v
    +---------------+       +----------------+       +---------------+
    |   Convex      |       |    Qdrant      |       |   Mem0 OSS    |
    | Checkpointer  |       | Vector Store   |       | (Optional)    |
    +---------------+       +----------------+       +---------------+
            |                        |                        |
            v                        v                        v
    +---------------+       +----------------+       +---------------+
    | Thread State  |       | Semantic       |       | Hierarchical  |
    | (per convo)   |       | Memory Search  |       | Memory Layers |
    +---------------+       +----------------+       +---------------+
            |                        |                        |
            +------------------------+------------------------+
                                     |
                            +--------+--------+
                            |  businessId     |
                            |  Isolation      |
                            +-----------------+
```

---

## 8. References

- [Mem0 GitHub](https://github.com/mem0ai/mem0)
- [Mem0 Documentation](https://docs.mem0.ai)
- [LangGraph Memory Concepts](https://langchain-ai.github.io/langgraph/concepts/memory/)
- [Zep Documentation](https://help.getzep.com/)
- [Letta Documentation](https://docs.letta.com/)
- [Graphiti (Zep's Graph Framework)](https://github.com/getzep/graphiti)

---

*Research conducted: January 2026*
*Author: Claude Code Research Agent*

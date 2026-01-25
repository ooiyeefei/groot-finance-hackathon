# Quickstart Guide: Next-Gen Agent Architecture

**Branch**: `001-ai-agent-modernization` | **Date**: 2026-01-12
**Purpose**: Implementation guide for the AI agent modernization feature

## Overview

This guide walks through implementing the Next-Gen Agent Architecture in order of dependencies:

```
Phase 1: Core Infrastructure
├── 1.1 Convex Schema Extensions
├── 1.2 Mem0 OSS Setup (memory layer)
└── 1.3 Neo4j Aura Setup (graph memory)

Phase 2: Streaming & Context
├── 2.1 LangGraph Streaming
├── 2.2 SSE API Endpoint
└── 2.3 Context Builder

Phase 3: Action Center
├── 3.1 Insight Detection Jobs
├── 3.2 Action Center API
└── 3.3 Action Center UI

Phase 4: Proactive AI
├── 4.1 Context Injection
├── 4.2 Proactive Behaviors
└── 4.3 Memory Recall

Phase 5: MCP Server
├── 5.1 Server Setup
├── 5.2 OAuth2 Auth
├── 5.3 Domain Intelligence Tools

Phase 6: Notifications
├── 6.1 Notification Queue
└── 6.2 Web Push
```

---

## Phase 1: Core Infrastructure

### 1.1 Convex Schema Extensions

**Files to modify:**
- `convex/schema.ts`

**Steps:**
1. Add `actionCenterInsights` table definition
2. Add `agentNotifications` table definition
3. Add `userPreferences` table definition
4. Deploy schema: `npx convex deploy --yes`

> **Note**: Memory storage is handled by Mem0 OSS externally. No Convex table needed.

**Verification:**
```bash
# Check schema deployed
npx convex dashboard
# Navigate to Tables, verify new tables exist
```

### 1.2 Mem0 OSS Setup

Mem0 provides automatic fact extraction, deduplication, and graph relationships for memories.

**Install dependencies:**
```bash
npm install mem0ai neo4j-driver
```

**Files to create:**
- `src/lib/ai/agent/memory/mem0-config.ts`
- `src/lib/ai/agent/memory/mem0-service.ts`

**Mem0 Configuration:**
```typescript
// src/lib/ai/agent/memory/mem0-config.ts
import { Memory } from 'mem0ai';
import { aiConfig } from '../config/ai-config';

export const createMem0 = () => {
  return new Memory({
    // Vector store - use existing Qdrant (new collection)
    vector_store: {
      provider: "qdrant",
      config: {
        url: aiConfig.qdrant.url,
        api_key: aiConfig.qdrant.apiKey,
        collection_name: "user_memories",
      }
    },

    // Graph store - Neo4j Aura Free
    graph_store: {
      provider: "neo4j",
      config: {
        url: process.env.NEO4J_URL,
        username: process.env.NEO4J_USERNAME,
        password: process.env.NEO4J_PASSWORD,
      }
    },

    // LLM for fact extraction - Gemini 3.0 Flash Preview
    llm: {
      provider: "google_ai",
      config: {
        api_key: aiConfig.gemini.apiKey,
        model: "gemini-3.0-flash-preview",
      }
    },

    // Embeddings - use existing endpoint
    embedder: {
      provider: "openai",  // OpenAI-compatible
      config: {
        api_key: aiConfig.embedding.apiKey,
        base_url: aiConfig.embedding.endpointUrl,
        model: aiConfig.embedding.modelId,
      }
    }
  });
};
```

**Mem0 Service:**
```typescript
// src/lib/ai/agent/memory/mem0-service.ts
import { createMem0 } from './mem0-config';

const mem0 = createMem0();

// Add memories after conversation (auto-extracts facts)
export async function addConversationMemories(
  messages: { role: string; content: string }[],
  context: { userId: string; businessId: string }
) {
  return mem0.add(messages, {
    user_id: context.userId,
    app_id: context.businessId,  // Multi-tenant isolation
    agent_id: 'finanseal-assistant',
    metadata: {
      source: 'conversation',
      timestamp: Date.now()
    }
  });
}

// Search memories with graph relationships
export async function searchMemories(
  query: string,
  context: { userId: string; businessId: string }
) {
  return mem0.search(query, {
    user_id: context.userId,
    app_id: context.businessId,
    limit: 10
  });
}

// Get all memories for a user (for Action Center)
export async function getAllUserMemories(
  context: { userId: string; businessId: string }
) {
  return mem0.getAll({
    user_id: context.userId,
    app_id: context.businessId
  });
}
```

### 1.3 Neo4j Aura Setup

Neo4j Aura Free provides graph memory for entity relationships.

**Steps:**
1. Create free instance at https://neo4j.com/aura/
2. Get connection credentials (URL, username, password)
3. Add environment variables

**Environment variables:**
```bash
# .env.local
NEO4J_URL=neo4j+s://xxxxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password
```

**Verification:**
```typescript
// Test Neo4j connection
import neo4j from 'neo4j-driver';

const driver = neo4j.driver(
  process.env.NEO4J_URL!,
  neo4j.auth.basic(process.env.NEO4J_USERNAME!, process.env.NEO4J_PASSWORD!)
);

const session = driver.session();
const result = await session.run('RETURN 1 as n');
console.log('Neo4j connected:', result.records[0].get('n'));
await session.close();
```

---

## Phase 2: Streaming & Context

### 2.1 LangGraph Streaming

**Files to modify:**
- `src/lib/ai/langgraph-agent.ts`

**Key changes:**
```typescript
// Add streaming support to existing agent
export async function* streamAgentResponse(
  messages: BaseMessage[],
  config: AgentConfig
): AsyncGenerator<StreamEvent> {
  const eventStream = await graph.astream_events(
    { messages },
    { version: "v2", configurable: { thread_id: config.conversationId } }
  );

  for await (const event of eventStream) {
    yield transformToStreamEvent(event);
  }
}
```

### 2.2 SSE API Endpoint

**Files to modify:**
- `src/app/api/v1/chat/route.ts`

**Key implementation:**
```typescript
export async function POST(req: Request) {
  // ... auth validation ...

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      for await (const event of streamAgentResponse(messages, config)) {
        const sseData = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(sseData));
      }

      controller.close();
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    }
  });
}
```

### 2.3 Context Builder

**Files to create:**
- `src/lib/ai/agent/memory/context-builder.ts`

**Key responsibilities:**
1. Retrieve user preferences (semantic memory)
2. Search relevant episodic memories
3. Get cached entities
4. Fetch pending Action Center insights
5. Build combined context for agent injection

---

## Phase 3: Action Center

### 3.1 Insight Detection Jobs

**Files to create:**
- `convex/functions/actionCenterInsights.ts`
- `convex/functions/actionCenterJobs.ts`

**Detection algorithms to implement:**
| Algorithm | File | Trigger |
|-----------|------|---------|
| Anomaly Detection | `detectAnomalies.ts` | Scheduled (4h) |
| Compliance Gaps | `detectComplianceGaps.ts` | Scheduled (4h) |
| Cash Flow Forecast | `forecastCashFlow.ts` | Scheduled (4h) |
| Deadline Tracking | `trackDeadlines.ts` | Scheduled (daily) |
| Duplicate Detection | `detectDuplicates.ts` | Scheduled (4h) |

**Convex scheduled function:**
```typescript
// convex/crons.ts
export default cronJobs({
  "run-proactive-analysis": {
    schedule: "0 */4 * * *", // Every 4 hours
    handler: internal.actionCenterJobs.runProactiveAnalysis
  },
  "track-deadlines": {
    schedule: "0 6 * * *", // Daily at 6 AM
    handler: internal.actionCenterJobs.trackDeadlines
  }
});
```

### 3.2 Action Center API

**Files to create:**
- `src/app/api/v1/insights/route.ts`
- `src/app/api/v1/insights/[insightId]/route.ts`
- `src/app/api/v1/insights/summary/route.ts`

**Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/insights` | List insights with filters |
| GET | `/api/v1/insights/:id` | Get insight detail |
| PATCH | `/api/v1/insights/:id` | Update status |
| GET | `/api/v1/insights/summary` | Dashboard summary |
| POST | `/api/v1/insights/:id/deep-dive` | Start deep dive chat |

### 3.3 Action Center UI

**Files to modify:**
- `src/domains/analytics/components/action-center/ActionCenter.tsx`

**Files to create:**
- `src/domains/analytics/components/action-center/InsightCard.tsx`
- `src/domains/analytics/components/action-center/InsightDetail.tsx`
- `src/domains/analytics/hooks/useInsights.ts`

**Key features:**
- Real-time updates via Convex subscription
- Priority-sorted card list
- Category filtering
- One-click status updates
- Deep Dive button → opens AI chat with context

---

## Phase 4: Proactive AI

### 4.1 Context Injection

**Modify agent initialization to inject:**
1. User preferences from memory
2. Relevant episodic memories
3. Pending Action Center insights

**Implementation location:**
- `src/lib/ai/langgraph-agent.ts` - Add context node

### 4.2 Proactive Behaviors

**System prompt modifications:**
```typescript
const proactiveSystemPrompt = `
You are a proactive financial assistant. In addition to answering questions:

1. If there are unreviewed Action Center items, mention them
2. Connect conversation topics to relevant insights
3. Reference past conversations when relevant
4. Anticipate follow-up questions

Current pending insights: {pendingInsights}
Relevant memories: {relevantMemories}
`;
```

### 4.3 Memory Recall

**Implement `remember()` and `recall()` tools:**
- `remember()` - Store user-explicit preferences
- `recall()` - Retrieve memories by semantic search

**Files to create:**
- `src/lib/ai/tools/remember-tool.ts`
- `src/lib/ai/tools/recall-tool.ts`

---

## Phase 5: MCP Server

### 5.1 Server Setup

**Directory structure:**
```
mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts      # Entry point
│   ├── server.ts     # MCP server setup
│   ├── auth.ts       # OAuth2 handler
│   ├── resources.ts  # MCP resources
│   ├── tools.ts      # Domain intelligence tools
│   └── prompts.ts    # Prompt templates
└── README.md
```

**Dependencies:**
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "convex": "^1.0.0"
  }
}
```

### 5.2 OAuth2 Auth

**Implementation:**
- Use Clerk as identity provider
- Exchange OAuth code for Clerk session token
- Validate on each tool invocation

### 5.3 Domain Intelligence Tools

**Tools to implement (wrapping existing ToolFactory):**
| MCP Tool | Wraps |
|----------|-------|
| `analyze_cash_flow` | New domain intelligence |
| `assess_cross_border_compliance` | `CrossBorderTaxComplianceTool` |
| `evaluate_vendor_risk` | New domain intelligence |
| `forecast_expenses` | New domain intelligence |
| `suggest_tax_optimization` | New domain intelligence |

---

## Phase 6: Notifications

### 6.1 Notification Queue

**Files to create:**
- `convex/functions/agentNotifications.ts`

**Functions:**
- `queueNotification` - Add to delivery queue
- `processNotificationQueue` - Scheduled delivery
- `markDelivered` - Update status

### 6.2 Web Push

**Implementation:**
- Use Convex real-time subscriptions for immediate delivery
- Web Push API for browser notifications

**Files to create:**
- `src/lib/notifications/push-service.ts`
- `src/app/api/v1/notifications/subscribe/route.ts`

---

## Testing Checklist

### Unit Tests
- [ ] Mem0 service operations (add, search, getAll)
- [ ] Context builder output format
- [ ] Insight detection algorithms
- [ ] Streaming event transformation

### Integration Tests
- [ ] SSE streaming end-to-end
- [ ] Convex subscription updates
- [ ] MCP server authentication
- [ ] Deep Dive conversation creation

### E2E Tests (Playwright)
- [ ] Action Center card interactions
- [ ] Streaming chat UI
- [ ] Notification preferences
- [ ] Memory recall in conversation

---

## Environment Variables

Add to `.env.local`:
```bash
# Neo4j Aura (Graph Memory)
NEO4J_URL=neo4j+s://xxxxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password

# Memory/RAG (Mem0 uses existing Qdrant + new collection)
QDRANT_MEMORIES_COLLECTION=user_memories

# MCP Server
MCP_SERVER_PORT=3001
MCP_OAUTH_CLIENT_ID=your-client-id
MCP_OAUTH_CLIENT_SECRET=your-client-secret

# Notifications
VAPID_PUBLIC_KEY=your-vapid-public
VAPID_PRIVATE_KEY=your-vapid-private
```

---

## Deployment Sequence

1. **Neo4j Aura** → Create free instance, get credentials
2. **Environment Variables** → Add NEO4J_* to .env.local
3. **Convex Schema** → `npx convex deploy --yes`
4. **Application Code** → Deploy to Vercel (Mem0 auto-creates Qdrant collection)
5. **MCP Server** → Deploy standalone (separate process)
6. **Cron Jobs** → Verify in Convex dashboard

---

## Success Metrics to Monitor

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Time-to-first-token | <1s | API response timing |
| Memory recall accuracy | 95% | User feedback sampling |
| Insights per user/week | 3+ | Convex query |
| Insight action rate | 70% | Status tracking |
| Streaming reliability | 99.9% | Error rate monitoring |

---

**Document Status**: COMPLETE
**Ready for**: Task Generation (`/speckit.tasks`)

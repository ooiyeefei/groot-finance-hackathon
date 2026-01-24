# Phase 0 Research: Next-Gen Agent Architecture

**Branch**: `001-ai-agent-modernization` | **Date**: 2026-01-12
**Purpose**: Resolve technical unknowns before implementation planning

## 1. LangGraph Streaming Implementation

### 1.1 Streaming API (`astream_events`)

LangGraph v0.2+ provides `astream_events()` for real-time token streaming:

```typescript
// Pattern: Stream events from LangGraph StateGraph
const eventStream = await graph.astream_events(
  { messages: userMessages },
  {
    version: "v2",
    configurable: { thread_id: conversationId }
  }
);

for await (const event of eventStream) {
  switch (event.event) {
    case "on_chat_model_stream":
      // Token-by-token streaming
      const token = event.data.chunk.content;
      yield { type: "token", content: token };
      break;

    case "on_tool_start":
      // Tool execution started
      yield {
        type: "tool_status",
        tool: event.name,
        status: "executing"
      };
      break;

    case "on_tool_end":
      // Tool execution completed
      yield {
        type: "tool_status",
        tool: event.name,
        status: "completed",
        result: event.data.output
      };
      break;
  }
}
```

### 1.2 SSE Integration Pattern

Next.js API route for Server-Sent Events:

```typescript
// app/api/v1/chat/route.ts
export async function POST(req: Request) {
  const { messages, conversationId } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const eventStream = await agent.astream_events(
        { messages },
        { version: "v2", configurable: { thread_id: conversationId } }
      );

      for await (const event of eventStream) {
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

### 1.3 Event Types for UI

| Event Type | Purpose | UI Action |
|------------|---------|-----------|
| `on_chat_model_stream` | Token streaming | Append to message display |
| `on_tool_start` | Tool invocation begins | Show tool indicator |
| `on_tool_end` | Tool returns result | Hide indicator, optionally show result |
| `on_chain_start` | Agent reasoning begins | Show thinking indicator |
| `on_chain_end` | Agent reasoning complete | Hide thinking indicator |

---

## 2. MCP Server Implementation

### 2.1 Architecture Decision: Domain Intelligence (Type 3)

Based on industry best practices and FinanSEAL's existing Type 3 tools (`analyze_cross_border_compliance`), the MCP server will embed domain-specific intelligence rather than exposing raw CRUD operations.

**Key Principle**: Tools perform server-side analysis and return actionable insights, not raw data for LLM to analyze.

### 2.2 OAuth2 Authentication Pattern

```typescript
// mcp-server/src/auth.ts
import { OAuth2Server } from '@modelcontextprotocol/sdk/auth';

export class FinansealOAuth2 extends OAuth2Server {
  async validateToken(token: string): Promise<AuthContext | null> {
    // Validate against Clerk/Convex backend
    const session = await verifyClerkToken(token);
    if (!session) return null;

    return {
      userId: session.userId,
      businessId: session.businessId,
      scopes: session.scopes
    };
  }

  async generateToken(code: string): Promise<TokenResponse> {
    // Exchange OAuth code for access token
    const { accessToken, refreshToken, expiresIn } =
      await exchangeCodeForTokens(code);

    return { accessToken, refreshToken, expiresIn };
  }
}
```

### 2.3 MCP Resources (Static Context)

```typescript
// mcp-server/src/resources.ts
export const resources = [
  {
    uri: "finanseal://schema",
    name: "Database Schema",
    description: "Entity relationships and field definitions",
    mimeType: "application/json"
  },
  {
    uri: "finanseal://preferences/{userId}",
    name: "User Preferences",
    description: "Currency, language, notification settings",
    mimeType: "application/json"
  },
  {
    uri: "finanseal://jurisdictions",
    name: "Tax Jurisdictions",
    description: "Supported ASEAN tax jurisdictions and rules",
    mimeType: "application/json"
  }
];
```

### 2.4 MCP Tools (Domain Intelligence)

| Tool | Type | Domain Intelligence |
|------|------|---------------------|
| `analyze_cash_flow` | Type 3 | Pattern detection, anomaly flagging, trend analysis |
| `assess_cross_border_compliance` | Type 3 | RAG + Gemini + domain rules → actionable recommendations |
| `evaluate_vendor_risk` | Type 3 | Historical patterns, reliability scoring, risk assessment |
| `forecast_expenses` | Type 3 | ML-based predictions, seasonal adjustments, confidence intervals |
| `suggest_tax_optimization` | Type 3 | RAG + jurisdiction-specific recommendations |

```typescript
// mcp-server/src/tools.ts
export const tools = [
  {
    name: "analyze_cash_flow",
    description: "Analyze cash flow patterns with anomaly detection and trend forecasting",
    inputSchema: {
      type: "object",
      properties: {
        timeRange: { type: "string", enum: ["7d", "30d", "90d", "1y"] },
        includeForecasting: { type: "boolean", default: true }
      },
      required: ["timeRange"]
    },
    handler: async (input, authContext) => {
      // Server-side intelligence - NOT delegated to LLM
      const transactions = await getTransactions(authContext.businessId, input.timeRange);
      const analysis = await runCashFlowAnalysis(transactions);
      const anomalies = detectAnomalies(transactions, analysis.baseline);
      const forecast = input.includeForecasting
        ? await forecastCashFlow(transactions, 30)
        : null;

      return {
        summary: analysis.summary,
        currentBalance: analysis.currentBalance,
        burnRate: analysis.burnRate,
        anomalies: anomalies.map(a => ({
          date: a.date,
          amount: a.amount,
          deviation: a.stdDeviation,
          description: a.description
        })),
        forecast: forecast,
        recommendations: generateCashFlowRecommendations(analysis, anomalies)
      };
    }
  }
];
```

### 2.5 MCP Prompts (Interaction Templates)

```typescript
// mcp-server/src/prompts.ts
export const prompts = [
  {
    name: "financial_health_check",
    description: "Comprehensive business financial health assessment",
    arguments: [
      { name: "period", description: "Analysis period", required: false }
    ]
  },
  {
    name: "compliance_review",
    description: "Cross-border compliance status review",
    arguments: [
      { name: "jurisdiction", description: "Target jurisdiction", required: false }
    ]
  },
  {
    name: "expense_optimization",
    description: "Identify expense reduction opportunities",
    arguments: []
  }
];
```

---

## 3. Memory Architecture

### 3.1 Decision: Mem0 OSS

After evaluating multiple memory solutions (LangGraph native, Zep, LangMem, custom DIY), **Mem0 OSS** was selected for FinanSEAL's memory layer.

**Why Mem0:**

| Requirement | Mem0 Solution |
|-------------|---------------|
| Automatic fact extraction | ✅ Built-in (extracts entities/facts from conversations) |
| Graph relationships | ✅ Neo4j integration (connects vendor → expense → compliance) |
| Deduplication | ✅ Automatic (prevents duplicate facts) |
| Conflict resolution | ✅ Timestamps + versioning |
| Cross-context insights | ✅ Graph traversal enables multi-hop queries |
| Multi-tenant isolation | ✅ Entity scoping (user_id, app_id) |

**Alternatives Considered:**

| Solution | Status | Reason Not Chosen |
|----------|--------|-------------------|
| LangGraph Native | ✅ Good | No automatic fact extraction, no graph |
| Zep | ❌ Dead | Community Edition deprecated |
| LangMem | ⚠️ New | Python-only, immature |
| Custom DIY | ✅ Possible | More code to maintain, no graph |

### 3.2 Mem0 OSS Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Mem0 Memory Layer                           │
├─────────────────────────────────────────────────────────────────┤
│  LLM (Fact Extraction)                                          │
│  └── Gemini 3.0 Flash Preview (gemini-3.0-flash-preview)        │
│      - Automatic entity extraction                              │
│      - Deduplication logic                                      │
│      - Conflict resolution                                      │
├─────────────────────────────────────────────────────────────────┤
│  Vector Store (Semantic Search)                                 │
│  └── Qdrant Cloud (existing instance)                           │
│      - Collection: user_memories (NEW)                          │
│      - Uses existing embedding endpoint                         │
├─────────────────────────────────────────────────────────────────┤
│  Graph Store (Relationships)                                    │
│  └── Neo4j Aura Free                                            │
│      - Entity relationships                                     │
│      - Cross-context queries                                    │
│      - Multi-hop reasoning                                      │
├─────────────────────────────────────────────────────────────────┤
│  Multi-Tenant Isolation                                         │
│  └── app_id = businessId, user_id = clerkUserId                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Memory Types (Handled by Mem0)

| Type | Description | Mem0 Handling |
|------|-------------|---------------|
| **Episodic** | Past conversations, interactions | Auto-extracted, vector search |
| **Semantic** | User preferences, business facts | Auto-extracted, graph relationships |
| **Procedural** | Learned workflows, patterns | Auto-extracted from repeated actions |
| **Entity** | Vendors, categories, accounts | Auto-extracted, graph nodes |

### 3.4 Mem0 Configuration

```typescript
// src/lib/ai/memory/mem0-config.ts
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

### 3.5 Memory Operations

```typescript
// src/lib/ai/memory/mem0-service.ts
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

### 3.6 Context Injection Pattern

```typescript
// src/lib/ai/agent/memory/context-builder.ts
import { searchMemories } from '../memory/mem0-service';

export class ContextBuilder {
  async buildContext(
    userId: string,
    businessId: string,
    currentMessage: string
  ): Promise<ContextInjection> {
    // 1. Search relevant memories via Mem0 (includes graph relationships)
    const memories = await searchMemories(currentMessage, { userId, businessId });

    // 2. Fetch pending Action Center insights
    const pendingInsights = await this.convex.query(
      api.actionCenterInsights.getPending,
      { userId, businessId, limit: 3 }
    );

    return {
      memories: memories.results.map(m => m.memory),
      insights: pendingInsights,
    };
  }
}
```

### 3.7 Memory Retention Policy

Mem0 handles retention automatically, but we configure:

- **Default retention**: 12 months (via Mem0 config)
- **Graph cleanup**: Automatic via Neo4j TTL indexes
- **Vector cleanup**: Scheduled Qdrant maintenance

---

## 4. Action Center Intelligence Layer

### 4.1 Background Analysis Engine

The proactive intelligence layer runs continuously on user data to detect actionable insights.

```typescript
// Convex scheduled function pattern
// convex/functions/actionCenterJobs.ts
export const runProactiveAnalysis = internalAction({
  handler: async (ctx) => {
    // Get all active businesses
    const businesses = await ctx.runQuery(api.businesses.getActive);

    for (const business of businesses) {
      // Run detection algorithms
      await Promise.all([
        detectAnomalies(ctx, business.id),
        checkComplianceGaps(ctx, business.id),
        forecastCashFlow(ctx, business.id),
        detectDuplicatePayments(ctx, business.id),
        checkUpcomingDeadlines(ctx, business.id)
      ]);
    }
  }
});

// Schedule: Every 4 hours
export const scheduleProactiveAnalysis = cronJobs({
  "run-proactive-analysis": {
    schedule: "0 */4 * * *",
    handler: runProactiveAnalysis
  }
});
```

### 4.2 Anomaly Detection Algorithm

```typescript
async function detectAnomalies(ctx: ActionContext, businessId: string) {
  // Get transaction history (90 days)
  const transactions = await ctx.runQuery(api.transactions.getByBusiness, {
    businessId,
    days: 90
  });

  // Calculate baseline statistics per category
  const categoryStats = calculateCategoryStats(transactions);

  // Check recent transactions (7 days) against baseline
  const recentTransactions = transactions.filter(
    t => isWithinDays(t.date, 7)
  );

  for (const tx of recentTransactions) {
    const stats = categoryStats[tx.category];
    if (!stats) continue;

    const deviation = Math.abs(tx.amount - stats.mean) / stats.stdDev;

    if (deviation > 2) { // >2 standard deviations
      await ctx.runMutation(api.actionCenterInsights.create, {
        businessId,
        userId: tx.createdBy,
        category: "anomaly",
        priority: deviation > 3 ? "critical" : "high",
        title: `Unusual ${tx.category} expense detected`,
        description: `${formatCurrency(tx.amount)} is ${Math.round(deviation * 100)}% above your average`,
        affectedEntities: [tx._id],
        recommendedAction: "Review transaction details",
        metadata: { deviation, baseline: stats.mean }
      });
    }
  }
}
```

### 4.3 Insight Categories & Detection Methods

| Category | Detection Method | Trigger Condition |
|----------|------------------|-------------------|
| **Anomaly** | Statistical analysis | >2σ from historical average |
| **Compliance** | RAG + rule engine | Missing documentation, regulatory gaps |
| **Deadline** | Calendar + jurisdiction rules | Within 14 days of tax/filing deadline |
| **Cash Flow** | Trend analysis + forecasting | Projected negative balance within 30 days |
| **Optimization** | Pattern recognition | Duplicate payments, vendor consolidation opportunities |
| **Categorization** | Data quality analysis | Uncategorized transactions > 10% |

---

## 5. Integration with Existing Architecture

### 5.1 ToolFactory Enhancement

The existing ToolFactory pattern will be extended to support domain intelligence tools:

```typescript
// src/lib/ai/tools/tool-factory.ts
export class ToolFactory {
  private tools: Map<ToolName, () => BaseTool>;

  constructor() {
    // Existing CRUD tools
    this.tools.set('get_transactions', () => new GetTransactionsTool());
    this.tools.set('search_documents', () => new SearchDocumentsTool());

    // NEW: Domain Intelligence tools (Type 3)
    this.tools.set('analyze_cash_flow', () => new AnalyzeCashFlowTool());
    this.tools.set('evaluate_vendor_risk', () => new EvaluateVendorRiskTool());
    this.tools.set('forecast_expenses', () => new ForecastExpensesTool());

    // Existing Type 3 tools
    this.tools.set('analyze_cross_border_compliance', () => new CrossBorderComplianceTool());
    this.tools.set('searchRegulatoryKnowledgeBase', () => new RegulatoryKnowledgeTool());
  }
}
```

### 5.2 Convex Schema Extensions

```typescript
// convex/schema.ts additions
export default defineSchema({
  // ... existing tables ...

  agentMemories: defineTable({
    userId: v.string(),
    businessId: v.string(),
    namespace: v.string(),
    key: v.string(),
    value: v.string(),
    memoryType: v.union(
      v.literal("episodic"),
      v.literal("semantic"),
      v.literal("procedural"),
      v.literal("entity")
    ),
    embedding: v.optional(v.array(v.float64())),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
    metadata: v.optional(v.any())
  })
    .index("by_user_namespace", ["userId", "namespace"])
    .index("by_business", ["businessId"])
    .index("by_expiry", ["expiresAt"]),

  actionCenterInsights: defineTable({
    userId: v.string(),
    businessId: v.string(),
    category: v.union(
      v.literal("anomaly"),
      v.literal("compliance"),
      v.literal("deadline"),
      v.literal("cashflow"),
      v.literal("optimization"),
      v.literal("categorization")
    ),
    priority: v.union(
      v.literal("critical"),
      v.literal("high"),
      v.literal("medium"),
      v.literal("low")
    ),
    status: v.union(
      v.literal("new"),
      v.literal("reviewed"),
      v.literal("dismissed"),
      v.literal("actioned")
    ),
    title: v.string(),
    description: v.string(),
    affectedEntities: v.array(v.string()),
    recommendedAction: v.string(),
    detectedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    metadata: v.optional(v.any())
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_business_priority", ["businessId", "priority"])
    .index("by_category", ["category"]),

  agentNotifications: defineTable({
    userId: v.string(),
    insightId: v.id("actionCenterInsights"),
    channel: v.union(v.literal("web"), v.literal("email")),
    status: v.union(
      v.literal("pending"),
      v.literal("delivered"),
      v.literal("read"),
      v.literal("failed")
    ),
    deliveredAt: v.optional(v.number()),
    readAt: v.optional(v.number())
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_insight", ["insightId"])
});
```

---

## 6. Performance Considerations

### 6.1 Streaming Latency

| Metric | Target | Implementation |
|--------|--------|----------------|
| Time-to-first-token | <1s | SSE streaming, edge deployment |
| Tool execution feedback | <100ms | Immediate event emission |
| Memory retrieval | <200ms | Qdrant vector search with caching |
| Context injection | <300ms | Parallel data fetching |

### 6.2 Memory Storage Limits

| Constraint | Value | Enforcement |
|------------|-------|-------------|
| Episodic memory per user | 1000 entries | FIFO eviction |
| Memory retention | 12 months | Scheduled cleanup job |
| Vector embedding dimension | 1536 | text-embedding-3-small |
| Entity cache per session | 100 items | LRU eviction |

### 6.3 Action Center Processing

| Metric | Target | Implementation |
|--------|--------|----------------|
| Analysis cycle | Every 4 hours | Convex scheduled function |
| Insight delivery | <5 minutes | Real-time Convex subscriptions |
| Concurrent businesses | 1000+ | Batch processing with pagination |

---

## 7. Security Considerations

### 7.1 Multi-Tenant Isolation

- All memory operations scoped by `userId` AND `businessId`
- MCP tools validate `authContext.businessId` before data access
- Convex queries enforce business isolation via authenticated context

### 7.2 Memory Data Protection

- Encryption at rest via Convex/Qdrant infrastructure
- User-scoped access control (only owner can access memories)
- Memory deletion on user/business deletion

### 7.3 MCP Authentication

- OAuth2 flow with Clerk as identity provider
- Token validation on every tool invocation
- Scope-based authorization for sensitive operations

---

## 8. Open Questions Resolved

| Question | Resolution |
|----------|------------|
| LangGraph streaming API stability | v0.2+ `astream_events()` is production-ready |
| MCP server architecture | Domain Intelligence (Type 3) with OAuth2 |
| Memory persistence backend | **Mem0 OSS** with Qdrant (vectors) + Neo4j Aura (graph) |
| Memory fact extraction | Automatic via Mem0 + Gemini 3.0 Flash Preview |
| Graph relationships | Neo4j Aura Free for entity relationships |
| Action Center update frequency | Every 4 hours via Convex scheduled functions |
| Notification delivery method | Web push via Convex real-time subscriptions |

---

## 9. Dependencies Confirmed

| Dependency | Version | Purpose |
|------------|---------|---------|
| @langchain/langgraph | 0.2+ | Agent framework with streaming |
| @modelcontextprotocol/sdk | 1.0+ | MCP server implementation |
| mem0ai | 0.1+ | Memory layer with fact extraction |
| neo4j-driver | 5.0+ | Graph database for memory relationships |
| @qdrant/js-client-rest | 1.7+ | Vector similarity search (existing) |
| convex | 1.0+ | Real-time database (Action Center, preferences) |

---

**Research Status**: COMPLETE
**Next Phase**: Data Model Design (Phase 1)

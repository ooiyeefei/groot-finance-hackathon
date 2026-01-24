# Data Model: Next-Gen Agent Architecture

**Branch**: `001-ai-agent-modernization` | **Date**: 2026-01-12
**Purpose**: Entity schemas for action center, notification, and preference systems

> **Note**: Memory storage is handled by **Mem0 OSS** (external service) with Qdrant (vectors) + Neo4j Aura (graph). No custom Convex table needed for memories.

## 1. Entity Relationship Diagram

```
┌─────────────────────┐       ┌─────────────────────────┐
│       users         │       │       businesses        │
│  (existing table)   │       │    (existing table)     │
└──────────┬──────────┘       └───────────┬─────────────┘
           │                              │
           │ userId                       │ businessId
           │                              │
           ▼                              ▼
┌──────────────────────────────────────────────────────────┐
│                  actionCenterInsights                    │
│  (NEW: Proactive intelligence insights)                  │
├──────────────────────────────────────────────────────────┤
│ - userId (FK)                                            │
│ - businessId (FK)                                        │
│ - category (anomaly|compliance|deadline|cashflow|...)    │
│ - priority (critical|high|medium|low)                    │
│ - status (new|reviewed|dismissed|actioned)               │
│ - title, description, recommendedAction                  │
│ - affectedEntities[]                                     │
└─────────────────────────┬────────────────────────────────┘
                          │ insightId
                          ▼
┌──────────────────────────────────────────────────────────┐
│                   agentNotifications                     │
│  (NEW: Notification delivery tracking)                   │
├──────────────────────────────────────────────────────────┤
│ - userId (FK)                                            │
│ - insightId (FK → actionCenterInsights)                  │
│ - channel (web|email)                                    │
│ - status (pending|delivered|read|failed)                 │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                     userPreferences                      │
│  (NEW: User-specific AI settings)                        │
├──────────────────────────────────────────────────────────┤
│ - userId (FK)                                            │
│ - preferredCurrency                                      │
│ - notificationSettings                                   │
│ - language                                               │
│ - frequentVendors[]                                      │
└──────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────┐
│                    EXTERNAL: Mem0 OSS                    │
│  (Memory Layer - NOT in Convex)                          │
├──────────────────────────────────────────────────────────┤
│ Vector Store: Qdrant Cloud (user_memories collection)    │
│ Graph Store: Neo4j Aura Free (entity relationships)      │
│ LLM: Gemini 3.0 Flash Preview (fact extraction)          │
│ Multi-tenant: app_id=businessId, user_id=clerkUserId     │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Table Schemas (Convex)

> **Memory Storage**: Handled by Mem0 OSS externally. See Section 3 for Mem0 configuration.

### 2.1 actionCenterInsights

Stores proactive intelligence insights from the background analysis engine.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | Id | Yes | Convex document ID |
| `userId` | string | Yes | Target user for the insight |
| `businessId` | string | Yes | Business context |
| `category` | enum | Yes | Insight type (see below) |
| `priority` | enum | Yes | `critical` \| `high` \| `medium` \| `low` |
| `status` | enum | Yes | `new` \| `reviewed` \| `dismissed` \| `actioned` |
| `title` | string | Yes | Short description (max 100 chars) |
| `description` | string | Yes | Detailed explanation |
| `affectedEntities` | string[] | Yes | IDs of related transactions/documents |
| `recommendedAction` | string | Yes | Suggested next step |
| `detectedAt` | number | Yes | When the insight was generated |
| `reviewedAt` | number | No | When user viewed the insight |
| `actionedAt` | number | No | When user took action |
| `dismissedAt` | number | No | When user dismissed |
| `expiresAt` | number | No | Auto-expire for time-sensitive insights |
| `metadata` | object | No | Category-specific data (see below) |

**Category Enum:**
| Value | Description | Metadata Fields |
|-------|-------------|-----------------|
| `anomaly` | Statistical outlier detection | `deviation`, `baseline`, `category` |
| `compliance` | Regulatory gap detection | `regulation`, `jurisdiction`, `missingDocs` |
| `deadline` | Upcoming filing/payment | `deadlineDate`, `filingType`, `jurisdiction` |
| `cashflow` | Cash flow warning/forecast | `projectedBalance`, `daysUntilNegative` |
| `optimization` | Cost savings opportunity | `potentialSavings`, `duplicateIds` |
| `categorization` | Data quality issue | `uncategorizedCount`, `percentageAffected` |

**Priority Calculation:**
- `critical`: Compliance violation, negative cash flow imminent (<7 days)
- `high`: Large anomaly (>3σ), deadline <14 days, significant savings
- `medium`: Moderate anomaly (>2σ), deadline <30 days
- `low`: Categorization suggestions, minor optimizations

**Indexes:**
- `by_user_status`: `[userId, status]` - Active insights for user
- `by_business_priority`: `[businessId, priority]` - Dashboard sorting
- `by_category`: `[category]` - Category-specific queries
- `by_detected`: `[detectedAt]` - Chronological listing

---

### 2.2 agentNotifications

Tracks notification delivery for critical insights.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | Id | Yes | Convex document ID |
| `userId` | string | Yes | Notification recipient |
| `insightId` | Id | Yes | Reference to actionCenterInsights |
| `channel` | enum | Yes | `web` \| `email` |
| `status` | enum | Yes | `pending` \| `delivered` \| `read` \| `failed` |
| `scheduledAt` | number | Yes | When to deliver |
| `deliveredAt` | number | No | Actual delivery timestamp |
| `readAt` | number | No | When user clicked/opened |
| `failureReason` | string | No | Error message if failed |
| `retryCount` | number | Yes | Number of delivery attempts |

**Indexes:**
- `by_user_status`: `[userId, status]` - Pending notifications
- `by_insight`: `[insightId]` - Notifications for an insight
- `by_scheduled`: `[scheduledAt]` - Delivery queue

**Business Rules:**
- Max 1 notification per insight per channel
- Max 3 retry attempts for failed deliveries
- Web notifications: real-time via Convex subscriptions
- Email notifications: batched every 4 hours (unless critical)

---

### 2.3 userPreferences

Stores user-specific AI assistant preferences (semantic memory shortcut).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `_id` | Id | Yes | Convex document ID |
| `userId` | string | Yes | Unique per user |
| `preferredCurrency` | string | Yes | ISO currency code (default: "MYR") |
| `language` | string | Yes | ISO language code (default: "en") |
| `notificationSettings` | object | Yes | Per-category notification preferences |
| `frequentVendors` | string[] | No | Recently/frequently accessed vendor IDs |
| `dashboardLayout` | object | No | Action Center customization |
| `aiPersonalization` | object | No | Assistant behavior preferences |
| `createdAt` | number | Yes | Account creation |
| `updatedAt` | number | Yes | Last preference change |

**notificationSettings Schema:**
```typescript
{
  anomaly: { web: boolean, email: boolean, minPriority: "critical" | "high" | "medium" | "low" },
  compliance: { web: boolean, email: boolean, minPriority: string },
  deadline: { web: boolean, email: boolean, minPriority: string },
  cashflow: { web: boolean, email: boolean, minPriority: string },
  optimization: { web: boolean, email: boolean, minPriority: string },
  categorization: { web: boolean, email: boolean, minPriority: string }
}
```

**aiPersonalization Schema:**
```typescript
{
  proactiveLevel: "aggressive" | "balanced" | "minimal",  // How often AI initiates
  verbosity: "concise" | "detailed",                      // Response length preference
  expertiseLevel: "beginner" | "intermediate" | "expert", // Technical depth
  focusAreas: string[]                                    // e.g., ["compliance", "cashflow"]
}
```

**Indexes:**
- `by_user`: `[userId]` - Unique constraint

---

## 3. External Memory Storage (Mem0 OSS)

Memory storage is handled by **Mem0 OSS** - a mature, production-ready memory layer with automatic fact extraction, deduplication, and graph relationships.

### 3.1 Mem0 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Mem0 Memory Layer                           │
├─────────────────────────────────────────────────────────────────┤
│  LLM (Fact Extraction)                                          │
│  └── Gemini 3.0 Flash Preview                                   │
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

### 3.2 Memory Types (Handled by Mem0)

| Type | Description | Mem0 Handling |
|------|-------------|---------------|
| **Episodic** | Past conversations, interactions | Auto-extracted, vector search |
| **Semantic** | User preferences, business facts | Auto-extracted, graph relationships |
| **Procedural** | Learned workflows, patterns | Auto-extracted from repeated actions |
| **Entity** | Vendors, categories, accounts | Auto-extracted, graph nodes |

### 3.3 Mem0 Configuration

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

### 3.4 Existing Qdrant Collections (Unchanged)

The following existing collections remain unchanged:

| Collection | Purpose | Migration |
|------------|---------|-----------|
| `financial_documents` | User document embeddings | No change |
| `regulatory_kb` | Compliance RAG knowledge base | No change |
| `user_memories` | **NEW**: Mem0 managed collection | Auto-created by Mem0 |

---

## 4. Convex Schema Definition

> **Note**: Memory storage is handled by Mem0 OSS (external). Only Action Center, Notifications, and Preferences tables are defined in Convex.

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ... existing tables ...

  // Memory storage handled by Mem0 OSS externally
  // No agentMemories table needed - Mem0 uses Qdrant + Neo4j

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
    actionedAt: v.optional(v.number()),
    dismissedAt: v.optional(v.number()),
    expiresAt: v.optional(v.number()),
    metadata: v.optional(v.any())
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_business_priority", ["businessId", "priority"])
    .index("by_category", ["category"])
    .index("by_detected", ["detectedAt"]),

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
    scheduledAt: v.number(),
    deliveredAt: v.optional(v.number()),
    readAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    retryCount: v.number()
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_insight", ["insightId"])
    .index("by_scheduled", ["scheduledAt"]),

  userPreferences: defineTable({
    userId: v.string(),
    preferredCurrency: v.string(),
    language: v.string(),
    notificationSettings: v.object({
      anomaly: v.object({
        web: v.boolean(),
        email: v.boolean(),
        minPriority: v.string()
      }),
      compliance: v.object({
        web: v.boolean(),
        email: v.boolean(),
        minPriority: v.string()
      }),
      deadline: v.object({
        web: v.boolean(),
        email: v.boolean(),
        minPriority: v.string()
      }),
      cashflow: v.object({
        web: v.boolean(),
        email: v.boolean(),
        minPriority: v.string()
      }),
      optimization: v.object({
        web: v.boolean(),
        email: v.boolean(),
        minPriority: v.string()
      }),
      categorization: v.object({
        web: v.boolean(),
        email: v.boolean(),
        minPriority: v.string()
      })
    }),
    frequentVendors: v.optional(v.array(v.string())),
    dashboardLayout: v.optional(v.any()),
    aiPersonalization: v.optional(v.object({
      proactiveLevel: v.union(
        v.literal("aggressive"),
        v.literal("balanced"),
        v.literal("minimal")
      ),
      verbosity: v.union(v.literal("concise"), v.literal("detailed")),
      expertiseLevel: v.union(
        v.literal("beginner"),
        v.literal("intermediate"),
        v.literal("expert")
      ),
      focusAreas: v.optional(v.array(v.string()))
    })),
    createdAt: v.number(),
    updatedAt: v.number()
  })
    .index("by_user", ["userId"])
});
```

---

## 5. Migration Strategy

### 5.1 New Convex Tables (No Migration Required)
- `actionCenterInsights` - New table, starts empty
- `agentNotifications` - New table, starts empty
- `userPreferences` - New table, populated on first user interaction

### 5.2 External Services Setup
- **Mem0 OSS**: Install `mem0ai` package
- **Neo4j Aura Free**: Create free instance at https://neo4j.com/aura/
- **Qdrant**: `user_memories` collection auto-created by Mem0

### 5.3 Existing Table Modifications
None required. New tables are additive and don't modify existing schema.

### 5.4 Deployment Order
1. Create Neo4j Aura Free instance, get credentials
2. Add environment variables (NEO4J_URL, NEO4J_USERNAME, NEO4J_PASSWORD)
3. Deploy Convex schema changes (`npx convex deploy`)
4. Deploy application code (Mem0 auto-creates Qdrant collection)
5. Run initial preference population for existing users

---

## 6. Data Retention & Cleanup

### 6.1 Memory Retention (Handled by Mem0)

Mem0 OSS handles memory retention automatically:
- **Default retention**: 12 months (configurable)
- **Graph cleanup**: Automatic via Neo4j TTL
- **Vector cleanup**: Mem0 manages Qdrant lifecycle

### 6.2 Scheduled Cleanup Jobs (Convex)

```typescript
// convex/functions/maintenance.ts

// Run weekly: Archive old insights
export const archiveOldInsights = internalMutation({
  handler: async (ctx) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const old = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_detected")
      .filter(q =>
        q.and(
          q.lt(q.field("detectedAt"), thirtyDaysAgo),
          q.neq(q.field("status"), "new")
        )
      )
      .collect();

    // Archive to cold storage or delete
    for (const insight of old) {
      await ctx.db.delete(insight._id);
    }

    return { archived: old.length };
  }
});
```

---

**Data Model Status**: COMPLETE
**Next Step**: API Contracts (Phase 1)

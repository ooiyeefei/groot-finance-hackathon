/**
 * Memory Tools - Convex Functions (029-dspy-mem0-activation)
 *
 * Implements:
 * - T025: Topic-based contradiction detection
 * - T026: 200-memory limit enforcement with LRU eviction
 * - storeMemory, recallMemory, searchMemories, forgetMemory
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

/**
 * Financial domain topics for contradiction detection (T025)
 */
const TOPIC_KEYWORDS = {
  currency_preference: ["currency", "sgd", "myr", "usd", "thb", "baht", "dollar", "ringgit"],
  team_roles: ["handles", "responsible", "reports to", "manages", "approves", "team", "person"],
  reporting_periods: ["fiscal", "quarter", "monthly", "weekly", "period", "close"],
  approval_limits: ["approve", "limit", "threshold", "up to", "maximum"],
  fiscal_calendar: ["fiscal year", "year end", "quarter end", "close date"],
  payment_terms: ["net", "payment terms", "days", "vendor payment", "due"],
};

type MemoryTopic = keyof typeof TOPIC_KEYWORDS;

/**
 * Classify memory content into a topic (T025)
 */
function classifyTopic(content: string): MemoryTopic | null {
  const lowerContent = content.toLowerCase();

  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    const matches = keywords.filter((kw) => lowerContent.includes(kw.toLowerCase())).length;
    if (matches >= 2) {
      return topic as MemoryTopic;
    }
  }

  return null;
}

/**
 * Extract value from memory content based on topic
 * Simplified: extracts first capitalized word or currency code
 */
function extractValue(content: string, topic: MemoryTopic): string | null {
  const lowerContent = content.toLowerCase();

  if (topic === "currency_preference") {
    // Look for currency codes
    const currencies = ["SGD", "MYR", "USD", "THB", "EUR", "GBP"];
    for (const currency of currencies) {
      if (lowerContent.includes(currency.toLowerCase())) {
        return currency;
      }
    }
  }

  // Generic extraction: first quoted string or capitalized word
  const quotedMatch = content.match(/"([^"]+)"|'([^']+)'/);
  if (quotedMatch) {
    return quotedMatch[1] || quotedMatch[2];
  }

  const capitalizedMatch = content.match(/\b[A-Z][a-z]+\b/);
  if (capitalizedMatch) {
    return capitalizedMatch[0];
  }

  return null;
}

/**
 * Check if two values conflict for a given topic
 */
function isConflicting(value1: string, value2: string, topic: MemoryTopic): boolean {
  // Exclusive topics: only one value allowed
  const exclusiveTopics: MemoryTopic[] = ["currency_preference"];

  if (exclusiveTopics.includes(topic)) {
    return value1.toLowerCase() !== value2.toLowerCase();
  }

  return false; // Other topics allow multiple values
}

/**
 * Store memory with contradiction detection (T025) and limit enforcement (T026)
 */
export const storeMemory = mutation({
  args: {
    content: v.string(),
    businessId: v.id("businesses"),
    userId: v.string(),
    memoryType: v.string(),
    source: v.string(),
    sourceConversationId: v.optional(v.string()),
    embeddings: v.array(v.float64()),
    topicTags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Step 1: Check memory limit (T026)
    const activeMemories = await ctx.db
      .query("mem0_memories")
      .withIndex("by_user_business_active", (q) =>
        q.eq("businessId", args.businessId).eq("userId", args.userId).eq("archivedAt", undefined)
      )
      .collect();

    if (activeMemories.length >= 200) {
      // LRU eviction: archive least-accessed memory
      const lru = activeMemories.sort(
        (a, b) => (a.lastAccessedAt || 0) - (b.lastAccessedAt || 0)
      )[0];

      await ctx.db.patch(lru._id, { archivedAt: Date.now() });
      console.log(`[MemoryTools] LRU evicted memory ${lru._id} for user ${args.userId}`);
    }

    // Step 2: Contradiction detection (T025)
    const topic = classifyTopic(args.content);
    let conflict: {
      topic: string;
      existingMemory: { id: string; content: string; createdAt: number };
      options: Array<{ action: string; label: string }>;
    } | null = null;

    if (topic) {
      const newValue = extractValue(args.content, topic);

      if (newValue) {
        // Check for conflicting memories
        for (const existing of activeMemories) {
          const existingTopic = classifyTopic(existing.content);
          if (existingTopic === topic) {
            const existingValue = extractValue(existing.content, topic);
            if (existingValue && isConflicting(newValue, existingValue, topic)) {
              conflict = {
                topic,
                existingMemory: {
                  id: existing._id,
                  content: existing.content,
                  createdAt: existing._creationTime,
                },
                options: [
                  {
                    action: "replace",
                    label: `Replace old with new (use ${newValue} going forward)`,
                  },
                  {
                    action: "keep_both",
                    label: "Keep both (context-dependent preference)",
                  },
                  { action: "cancel", label: "Cancel (don't save new memory)" },
                ],
              };
              console.log(
                `[MemoryTools] Contradiction detected: ${topic} - ${existingValue} vs ${newValue}`
              );
              break;
            }
          }
        }
      }
    }

    // Step 3: If conflict detected, return for user resolution
    if (conflict) {
      return {
        memoryId: null,
        conflict,
      };
    }

    // Step 4: Store memory
    const memoryId = await ctx.db.insert("mem0_memories", {
      businessId: args.businessId,
      userId: args.userId,
      content: args.content,
      memoryType: args.memoryType,
      source: args.source,
      sourceConversationId: args.sourceConversationId,
      embeddings: args.embeddings,
      topicTags: args.topicTags,
      accessCount: 0,
    });

    console.log(`[MemoryTools] Stored memory ${memoryId} for user ${args.userId}`);

    return {
      memoryId,
      conflict: null,
    };
  },
});

/**
 * Recall memories by semantic search (for auto-recall T029)
 */
export const recallMemory = query({
  args: {
    query: v.string(),
    businessId: v.id("businesses"),
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // TODO: Implement actual semantic search with embeddings
    // For now, return simple text matching
    const memories = await ctx.db
      .query("mem0_memories")
      .withIndex("by_user_business_active", (q) =>
        q.eq("businessId", args.businessId).eq("userId", args.userId).eq("archivedAt", undefined)
      )
      .collect();

    // Simple keyword matching (placeholder for proper semantic search)
    const queryLower = args.query.toLowerCase();
    const relevant = memories.filter((m) => m.content.toLowerCase().includes(queryLower));

    const limit = args.limit || 5;
    return relevant.slice(0, limit).map((m) => ({
      id: m._id,
      content: m.content,
      score: 1.0, // Placeholder score
      createdAt: m._creationTime,
    }));
  },
});

/**
 * Search all memories for a user (T023)
 */
export const searchMemories = query({
  args: {
    query: v.string(),
    businessId: v.id("businesses"),
    userId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const memories = await ctx.db
      .query("mem0_memories")
      .withIndex("by_user_business_active", (q) =>
        q.eq("businessId", args.businessId).eq("userId", args.userId).eq("archivedAt", undefined)
      )
      .collect();

    // If no query, return all (up to limit)
    if (!args.query || args.query.trim() === "") {
      const limit = args.limit || 200;
      return memories.slice(0, limit).map((m) => ({
        id: m._id,
        content: m.content,
        score: 1.0,
        createdAt: m._creationTime,
      }));
    }

    // Otherwise, filter by query
    const queryLower = args.query.toLowerCase();
    const relevant = memories.filter((m) => m.content.toLowerCase().includes(queryLower));

    const limit = args.limit || 10;
    return relevant.slice(0, limit).map((m) => ({
      id: m._id,
      content: m.content,
      score: 1.0,
      createdAt: m._creationTime,
    }));
  },
});

/**
 * Forget (soft delete) a memory (T024)
 */
export const forgetMemory = mutation({
  args: {
    memoryId: v.id("mem0_memories"),
    businessId: v.id("businesses"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const memory = await ctx.db.get(args.memoryId);

    // Validate ownership
    if (!memory) {
      throw new Error(`Memory not found: ${args.memoryId}`);
    }

    if (memory.businessId !== args.businessId || memory.userId !== args.userId) {
      throw new Error("Unauthorized: Cannot forget another user's memory");
    }

    // Soft delete
    await ctx.db.patch(args.memoryId, { archivedAt: Date.now() });

    console.log(`[MemoryTools] Forgot memory ${args.memoryId} for user ${args.userId}`);

    return {
      success: true,
      archivedAt: Date.now(),
    };
  },
});

/**
 * Resolve a memory contradiction (T025)
 * Called when user clicks Replace, Keep Both, or Cancel in the confirmation toast.
 */
export const resolveMemoryConflict = mutation({
  args: {
    action: v.union(v.literal("replace"), v.literal("keep_both"), v.literal("cancel")),
    existingMemoryId: v.id("mem0_memories"),
    // New memory fields (needed for replace/keep_both to store the new memory)
    content: v.string(),
    businessId: v.id("businesses"),
    userId: v.string(),
    memoryType: v.string(),
    source: v.string(),
    sourceConversationId: v.optional(v.string()),
    embeddings: v.array(v.float64()),
    topicTags: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.action === "cancel") {
      console.log(`[MemoryTools] User cancelled contradiction resolution`);
      return { success: true, action: "cancel" };
    }

    if (args.action === "replace") {
      // Archive the existing memory
      await ctx.db.patch(args.existingMemoryId, { archivedAt: Date.now() });
      console.log(`[MemoryTools] Archived existing memory ${args.existingMemoryId}`);
    }

    // Store the new memory (for both replace and keep_both)
    const memoryId = await ctx.db.insert("mem0_memories", {
      businessId: args.businessId,
      userId: args.userId,
      content: args.content,
      memoryType: args.memoryType,
      source: args.source,
      sourceConversationId: args.sourceConversationId,
      embeddings: args.embeddings,
      topicTags: args.topicTags,
      accessCount: 0,
    });

    console.log(
      `[MemoryTools] Resolved contradiction (${args.action}): stored ${memoryId}`
    );

    return { success: true, action: args.action, memoryId };
  },
});

/**
 * Update memory access tracking (called after auto-recall)
 */
export const updateMemoryAccess = mutation({
  args: {
    memoryIds: v.array(v.id("mem0_memories")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    for (const id of args.memoryIds) {
      const memory = await ctx.db.get(id);
      if (memory) {
        await ctx.db.patch(id, {
          lastAccessedAt: now,
          accessCount: (memory.accessCount || 0) + 1,
        });
      }
    }

    console.log(`[MemoryTools] Updated access tracking for ${args.memoryIds.length} memories`);
  },
});

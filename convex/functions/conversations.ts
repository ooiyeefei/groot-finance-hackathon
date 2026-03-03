/**
 * Conversations Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Chat conversation CRUD operations
 * - Real-time conversation list with denormalized preview data
 * - Context linking (documents, transactions)
 * - Role-based access control
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

// Message roles
const MESSAGE_ROLES = ["user", "assistant", "system"] as const;

// ============================================
// QUERIES
// ============================================

/**
 * List conversations for current user with optional business filter
 * Returns conversations sorted by last message time (newest first)
 */
export const list = query({
  args: {
    businessId: v.optional(v.string()), // Accepts Convex ID or legacy UUID
    isActive: v.optional(v.boolean()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    console.log("[Convex conversations.list] Called with args:", JSON.stringify(args));

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      console.log("[Convex conversations.list] ❌ No identity found - user not authenticated");
      return { conversations: [], nextCursor: null };
    }

    console.log("[Convex conversations.list] ✅ Identity found:", identity.subject);

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      console.log("[Convex conversations.list] ❌ User not found for Clerk ID:", identity.subject);
      return { conversations: [], nextCursor: null };
    }

    console.log("[Convex conversations.list] ✅ User found:", user._id);

    const limit = args.limit ?? 50;

    // Resolve businessId if provided (supports both Convex ID and legacy UUID)
    let resolvedBusinessId = null;
    if (args.businessId) {
      const business = await resolveById(ctx.db, "businesses", args.businessId);
      resolvedBusinessId = business?._id ?? null;
    }

    // Get user's conversations
    let conversations = await ctx.db
      .query("conversations")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Apply business filter if provided — strict match only
    if (resolvedBusinessId) {
      conversations = conversations.filter(
        (conv) => conv.businessId === resolvedBusinessId
      );
    } else if (args.businessId) {
      // businessId was provided but didn't resolve (deleted business) — return nothing
      return { conversations: [], nextCursor: null, totalCount: 0 };
    } else {
      // No businessId provided — filter out conversations whose business no longer exists
      // to prevent orphaned data from deleted businesses from leaking
      const businessCache = new Map<string, boolean>();
      const validConversations = [];
      for (const conv of conversations) {
        if (!conv.businessId) {
          validConversations.push(conv);
          continue;
        }
        if (!businessCache.has(conv.businessId)) {
          const exists = await ctx.db.get(conv.businessId);
          businessCache.set(conv.businessId, !!exists);
        }
        if (businessCache.get(conv.businessId)) {
          validConversations.push(conv);
        }
      }
      conversations = validConversations;
    }

    // Apply active filter
    if (args.isActive !== undefined) {
      conversations = conversations.filter(
        (conv) => conv.isActive === args.isActive
      );
    }

    // Sort by last message time (newest first)
    conversations.sort((a, b) => {
      const timeA = a.lastMessageAt ?? a._creationTime;
      const timeB = b.lastMessageAt ?? b._creationTime;
      return timeB - timeA;
    });

    // Pagination
    const startIndex = args.cursor ? parseInt(args.cursor, 10) : 0;
    const paginatedConversations = conversations.slice(
      startIndex,
      startIndex + limit
    );
    const nextCursor =
      startIndex + limit < conversations.length
        ? String(startIndex + limit)
        : null;

    return {
      conversations: paginatedConversations,
      nextCursor,
      totalCount: conversations.length,
    };
  },
});

/**
 * Get single conversation by ID with access control
 */
export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    // Resolve ID (supports both Convex ID and legacy UUID)
    const conversation = await resolveById(ctx.db, "conversations", args.id);
    if (!conversation) {
      return null;
    }

    // Check access - user owns conversation
    if (conversation.userId !== user._id) {
      // Check if user has access via business membership
      if (conversation.businessId) {
        const membership = await ctx.db
          .query("business_memberships")
          .withIndex("by_userId_businessId", (q) =>
            q.eq("userId", user._id).eq("businessId", conversation.businessId!)
          )
          .first();

        if (!membership || membership.status !== "active") {
          return null;
        }
      } else {
        return null;
      }
    }

    return conversation;
  },
});

/**
 * Get conversations by business ID for admins/owners
 */
export const getByBusinessId = query({
  args: {
    businessId: v.string(), // Accepts Convex ID or legacy UUID
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Resolve businessId (supports both Convex ID and legacy UUID)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    // Verify admin/owner access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.role !== "owner") {
      return [];
    }

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Sort by last message time
    conversations.sort((a, b) => {
      const timeA = a.lastMessageAt ?? a._creationTime;
      const timeB = b.lastMessageAt ?? b._creationTime;
      return timeB - timeA;
    });

    return args.limit ? conversations.slice(0, args.limit) : conversations;
  },
});

/**
 * Get active conversation for a specific context (document or transaction)
 */
export const getByContext = query({
  args: {
    contextDocumentId: v.optional(v.id("invoices")),
    contextTransactionId: v.optional(v.id("accounting_entries")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    // Get user's conversations
    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Find conversation with matching context
    const conversation = conversations.find((conv) => {
      if (args.contextDocumentId && conv.contextDocumentId === args.contextDocumentId) {
        return true;
      }
      if (args.contextTransactionId && conv.contextTransactionId === args.contextTransactionId) {
        return true;
      }
      return false;
    });

    return conversation ?? null;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new conversation
 */
export const create = mutation({
  args: {
    businessId: v.optional(v.string()), // Accepts Convex ID or legacy UUID
    title: v.optional(v.string()),
    language: v.optional(v.string()),
    contextDocumentId: v.optional(v.id("invoices")),
    contextTransactionId: v.optional(v.id("accounting_entries")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    // Resolve businessId if provided (supports both Convex ID and legacy UUID)
    let resolvedBusinessId = undefined;
    if (args.businessId) {
      const business = await resolveById(ctx.db, "businesses", args.businessId);
      if (!business) {
        throw new Error("Business not found");
      }
      resolvedBusinessId = business._id;

      // Verify membership
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", resolvedBusinessId!)
        )
        .first();

      if (!membership || membership.status !== "active") {
        throw new Error("Not a member of this business");
      }
    }

    const conversationId = await ctx.db.insert("conversations", {
      userId: user._id,
      businessId: resolvedBusinessId,
      title: args.title,
      language: args.language ?? "en",
      isActive: true,
      contextDocumentId: args.contextDocumentId,
      contextTransactionId: args.contextTransactionId,
      messageCount: 0,
      updatedAt: Date.now(),
    });

    return conversationId;
  },
});

/**
 * Update conversation metadata
 */
export const update = mutation({
  args: {
    id: v.string(),
    title: v.optional(v.string()),
    language: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    contextDocumentId: v.optional(v.id("invoices")),
    contextTransactionId: v.optional(v.id("accounting_entries")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    const conversation = await resolveById(ctx.db, "conversations", args.id);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // Check ownership
    if (conversation.userId !== user._id) {
      throw new Error("Not authorized to update this conversation");
    }

    const { id, ...updates } = args;
    const updateData: Record<string, unknown> = { updatedAt: Date.now() };

    // Only include provided fields
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.language !== undefined) updateData.language = updates.language;
    if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
    if (updates.contextDocumentId !== undefined)
      updateData.contextDocumentId = updates.contextDocumentId;
    if (updates.contextTransactionId !== undefined)
      updateData.contextTransactionId = updates.contextTransactionId;

    await ctx.db.patch(conversation._id, updateData);
    return conversation._id;
  },
});

/**
 * Update denormalized message preview (called internally when messages are added)
 */
export const updateMessagePreview = mutation({
  args: {
    id: v.string(),
    lastMessageContent: v.string(),
    lastMessageRole: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    incrementCount: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const conversation = await resolveById(ctx.db, "conversations", args.id);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    const now = Date.now();
    const updateData: Record<string, unknown> = {
      lastMessageContent: args.lastMessageContent,
      lastMessageRole: args.lastMessageRole,
      lastMessageAt: now,
      updatedAt: now,
    };

    if (args.incrementCount !== false) {
      updateData.messageCount = (conversation.messageCount ?? 0) + 1;
    }

    await ctx.db.patch(conversation._id, updateData);
    return conversation._id;
  },
});

/**
 * Archive (deactivate) a conversation
 */
export const archive = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    const conversation = await resolveById(ctx.db, "conversations", args.id);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // Check ownership
    if (conversation.userId !== user._id) {
      throw new Error("Not authorized to archive this conversation");
    }

    await ctx.db.patch(conversation._id, {
      isActive: false,
      updatedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Delete a conversation (hard delete - conversations don't use soft delete)
 * Also deletes all associated messages
 */
export const remove = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    console.log(`[Convex conversations.remove] Starting deletion for id: ${args.id}`);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      console.error("[Convex conversations.remove] ❌ Not authenticated");
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      console.error(`[Convex conversations.remove] ❌ User not found for Clerk ID: ${identity.subject}`);
      throw new Error("User not found");
    }

    console.log(`[Convex conversations.remove] ✅ User found: ${user._id}`);

    const conversation = await resolveById(ctx.db, "conversations", args.id);
    if (!conversation) {
      console.error(`[Convex conversations.remove] ❌ Conversation not found: ${args.id}`);
      throw new Error("Conversation not found");
    }

    console.log(`[Convex conversations.remove] ✅ Conversation found: ${conversation._id}, owner: ${conversation.userId}`);

    // Check ownership
    if (conversation.userId !== user._id) {
      console.error(`[Convex conversations.remove] ❌ Ownership check failed - conversation.userId: ${conversation.userId}, user._id: ${user._id}`);
      throw new Error("Not authorized to delete this conversation");
    }

    console.log("[Convex conversations.remove] ✅ Ownership check passed");

    // Delete all messages in the conversation
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId", (q) =>
        q.eq("conversationId", conversation._id)
      )
      .collect();

    console.log(`[Convex conversations.remove] Found ${messages.length} messages to delete`);

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    console.log(`[Convex conversations.remove] ✅ Deleted ${messages.length} messages`);

    // Delete the conversation
    await ctx.db.delete(conversation._id);

    console.log(`[Convex conversations.remove] ✅ Deleted conversation: ${conversation._id}`);

    return true;
  },
});

/**
 * DEBUG: List all conversations (admin only - no auth required)
 * Use this to debug data during migration
 */
export const listAll = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const conversations = await ctx.db
      .query("conversations")
      .order("desc")
      .take(limit);

    return conversations;
  },
});

/**
 * MIGRATION: Fix orphaned conversations by linking to business owners
 * Conversations migrated from Supabase have businessId but no userId
 * This links them to the business owner (first owner found in memberships)
 */
export const fixOrphanedConversations = mutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const results: { conversationId: string; businessId: string; userId: string; title: string }[] = [];
    const errors: { conversationId: string; error: string }[] = [];

    // Get all conversations without userId
    const allConversations = await ctx.db.query("conversations").collect();
    const orphanedConversations = allConversations.filter(
      (conv) => !conv.userId && conv.businessId
    );

    console.log(`[Migration] Found ${orphanedConversations.length} orphaned conversations`);

    for (const conv of orphanedConversations) {
      if (!conv.businessId) continue;

      // Find business owner from memberships
      const memberships = await ctx.db
        .query("business_memberships")
        .withIndex("by_businessId", (q) => q.eq("businessId", conv.businessId!))
        .collect();

      // Find owner or first active member
      const ownerMembership = memberships.find((m) => m.role === "owner" && m.status === "active");
      const anyActiveMembership = memberships.find((m) => m.status === "active");
      const targetMembership = ownerMembership || anyActiveMembership;

      if (!targetMembership) {
        errors.push({
          conversationId: conv._id,
          error: `No active membership found for business ${conv.businessId}`,
        });
        continue;
      }

      results.push({
        conversationId: conv._id,
        businessId: conv.businessId,
        userId: targetMembership.userId,
        title: conv.title || "Untitled",
      });

      if (!dryRun) {
        await ctx.db.patch(conv._id, {
          userId: targetMembership.userId,
          updatedAt: Date.now(),
        });
      }
    }

    return {
      dryRun,
      total: orphanedConversations.length,
      fixed: results.length,
      errors: errors.length,
      results: results.slice(0, 20), // Show first 20 for preview
      errorDetails: errors,
    };
  },
});

/**
 * Recalculate message counts for all conversations
 * Useful after migration from Supabase where messageCount wasn't tracked
 */
export const recalculateMessageCounts = mutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const updates: { conversationId: string; title: string; oldCount: number; newCount: number }[] = [];

    // Get all conversations
    const allConversations = await ctx.db.query("conversations").collect();
    console.log(`[Migration] Checking ${allConversations.length} conversations`);

    for (const conv of allConversations) {
      // Count actual messages for this conversation
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversationId", (q) => q.eq("conversationId", conv._id))
        .collect();

      const actualCount = messages.length;
      const currentCount = conv.messageCount ?? 0;

      // Only update if counts differ
      if (actualCount !== currentCount) {
        updates.push({
          conversationId: conv._id,
          title: conv.title || "Untitled",
          oldCount: currentCount,
          newCount: actualCount,
        });

        if (!dryRun) {
          // Also update last message info if messages exist
          const lastMsg = messages.sort((a, b) => b._creationTime - a._creationTime)[0];

          await ctx.db.patch(conv._id, {
            messageCount: actualCount,
            ...(lastMsg && {
              lastMessageContent: lastMsg.content?.substring(0, 100),
              lastMessageRole: lastMsg.role,
              lastMessageAt: lastMsg._creationTime,
            }),
            updatedAt: Date.now(),
          });
        }
      }
    }

    return {
      dryRun,
      totalConversations: allConversations.length,
      updatesNeeded: updates.length,
      updates: updates.slice(0, 30), // Show first 30
    };
  },
});

// ============================================
// INTERNAL MUTATIONS (PDPA data retention cleanup)
// ============================================

const CHAT_RETENTION_DAYS = 730; // 2 years
const CHAT_CLEANUP_BATCH_SIZE = 500;

/**
 * Delete expired conversations and their messages (PDPA compliance)
 *
 * Called daily by cron at 3:30 AM UTC.
 * Deletes conversations where lastMessageAt (or _creationTime for empty
 * conversations) is older than 2 years (730 days).
 * All associated messages are cascade-deleted first.
 */
export const deleteExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff =
      Date.now() - CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    // Query conversations — use all and filter since we need the fallback logic
    const conversations = await ctx.db
      .query("conversations")
      .collect();

    const expired = conversations.filter((conv) => {
      const age = conv.lastMessageAt ?? conv._creationTime;
      return age < cutoff;
    });

    // Limit to batch size to avoid mutation timeout
    const batch = expired.slice(0, CHAT_CLEANUP_BATCH_SIZE);

    let deleted = 0;
    let messagesDeleted = 0;

    for (const conv of batch) {
      try {
        // Delete all messages belonging to this conversation first
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_conversationId", (q) =>
            q.eq("conversationId", conv._id)
          )
          .collect();

        for (const msg of messages) {
          await ctx.db.delete(msg._id);
          messagesDeleted++;
        }

        // Delete the conversation
        await ctx.db.delete(conv._id);
        deleted++;
      } catch (error) {
        console.error(
          `[Retention Cleanup] Failed to delete conversation ${conv._id}:`,
          error
        );
      }
    }

    console.log(
      JSON.stringify({
        type: "retention_cleanup",
        table: "conversations",
        deleted,
        messagesDeleted,
        remaining: expired.length - batch.length,
        timestamp: new Date().toISOString(),
      })
    );

    return { deleted, messagesDeleted };
  },
});

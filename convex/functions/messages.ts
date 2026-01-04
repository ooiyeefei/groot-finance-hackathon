/**
 * Messages Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Chat message CRUD operations
 * - Real-time message streaming for conversations
 * - Tool calls and citations tracking for AI responses
 * - Automatic conversation preview updates (denormalization)
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";
import { api } from "../_generated/api";

// Message roles
const MESSAGE_ROLES = ["user", "assistant", "system"] as const;

// ============================================
// QUERIES
// ============================================

/**
 * List messages for a conversation with pagination
 * Messages are sorted by creation time (oldest first for chat display)
 */
export const list = query({
  args: {
    conversationId: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { messages: [], nextCursor: null };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { messages: [], nextCursor: null };
    }

    // Resolve conversation (supports both Convex ID and legacy UUID)
    const conversation = await resolveById(ctx.db, "conversations", args.conversationId);
    if (!conversation) {
      return { messages: [], nextCursor: null };
    }

    // Check access - user owns conversation or has business membership
    if (conversation.userId !== user._id) {
      if (conversation.businessId) {
        const membership = await ctx.db
          .query("business_memberships")
          .withIndex("by_userId_businessId", (q) =>
            q.eq("userId", user._id).eq("businessId", conversation.businessId!)
          )
          .first();

        if (!membership || membership.status !== "active") {
          return { messages: [], nextCursor: null };
        }
      } else {
        return { messages: [], nextCursor: null };
      }
    }

    const limit = args.limit ?? 100;

    // Get messages with native Convex cursor-based pagination
    // Using .order("asc") for oldest-first display in chat
    const result = await ctx.db
      .query("messages")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", conversation._id))
      .order("asc")
      .paginate({ numItems: limit, cursor: args.cursor ?? null });

    return {
      messages: result.page,
      nextCursor: result.continueCursor,
      isDone: result.isDone,
    };
  },
});

/**
 * Get single message by ID with access control
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
    const message = await resolveById(ctx.db, "messages", args.id);
    if (!message) {
      return null;
    }

    // Get parent conversation to check access
    const conversation = await ctx.db.get(message.conversationId);
    if (!conversation) {
      return null;
    }

    // Check access - user owns conversation or has business membership
    if (conversation.userId !== user._id) {
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

    return message;
  },
});

/**
 * Get recent messages for a conversation (for AI context)
 */
export const getRecentForContext = query({
  args: {
    conversationId: v.string(),
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

    // Resolve conversation
    const conversation = await resolveById(ctx.db, "conversations", args.conversationId);
    if (!conversation) {
      return [];
    }

    // Check access
    if (conversation.userId !== user._id) {
      if (conversation.businessId) {
        const membership = await ctx.db
          .query("business_memberships")
          .withIndex("by_userId_businessId", (q) =>
            q.eq("userId", user._id).eq("businessId", conversation.businessId!)
          )
          .first();

        if (!membership || membership.status !== "active") {
          return [];
        }
      } else {
        return [];
      }
    }

    const limit = args.limit ?? 20;

    // Get messages for conversation
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversationId", (q) => q.eq("conversationId", conversation._id))
      .collect();

    // Sort by creation time (oldest first) and take last N
    messages.sort((a, b) => a._creationTime - b._creationTime);
    const recentMessages = messages.slice(-limit);

    // Return simplified format for AI context
    return recentMessages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      toolCalls: msg.toolCalls,
    }));
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new message in a conversation
 * Also updates the conversation's denormalized preview data
 */
export const create = mutation({
  args: {
    conversationId: v.string(),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system")
    ),
    content: v.string(),
    metadata: v.optional(v.any()),
    toolCalls: v.optional(
      v.array(
        v.object({
          toolName: v.string(),
          args: v.any(),
          result: v.optional(v.any()),
        })
      )
    ),
    citations: v.optional(
      v.array(
        v.object({
          sourceType: v.string(),
          sourceId: v.string(),
          content: v.optional(v.string()),
        })
      )
    ),
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

    // Resolve conversation
    const conversation = await resolveById(ctx.db, "conversations", args.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // Check access - user owns conversation or has business membership
    if (conversation.userId !== user._id) {
      if (conversation.businessId) {
        const membership = await ctx.db
          .query("business_memberships")
          .withIndex("by_userId_businessId", (q) =>
            q.eq("userId", user._id).eq("businessId", conversation.businessId!)
          )
          .first();

        if (!membership || membership.status !== "active") {
          throw new Error("Not authorized to post to this conversation");
        }
      } else {
        throw new Error("Not authorized to post to this conversation");
      }
    }

    // Create the message
    const messageId = await ctx.db.insert("messages", {
      conversationId: conversation._id,
      userId: args.role === "user" ? user._id : undefined,
      role: args.role,
      content: args.content,
      metadata: args.metadata,
      toolCalls: args.toolCalls,
      citations: args.citations,
      updatedAt: Date.now(),
    });

    // Update conversation preview (denormalized fields)
    const now = Date.now();
    await ctx.db.patch(conversation._id, {
      lastMessageContent: args.content.substring(0, 200), // Truncate for preview
      lastMessageRole: args.role,
      lastMessageAt: now,
      messageCount: (conversation.messageCount ?? 0) + 1,
      updatedAt: now,
    });

    return messageId;
  },
});

/**
 * Create a system/assistant message (internal use)
 * This mutation doesn't require user authentication for AI-generated responses
 */
export const createSystemMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: v.union(v.literal("assistant"), v.literal("system")),
    content: v.string(),
    metadata: v.optional(v.any()),
    toolCalls: v.optional(
      v.array(
        v.object({
          toolName: v.string(),
          args: v.any(),
          result: v.optional(v.any()),
        })
      )
    ),
    citations: v.optional(
      v.array(
        v.object({
          sourceType: v.string(),
          sourceId: v.string(),
          content: v.optional(v.string()),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    // This is called internally, so no auth check
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // Create the message
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: args.role,
      content: args.content,
      metadata: args.metadata,
      toolCalls: args.toolCalls,
      citations: args.citations,
      updatedAt: Date.now(),
    });

    // Update conversation preview
    const now = Date.now();
    await ctx.db.patch(conversation._id, {
      lastMessageContent: args.content.substring(0, 200),
      lastMessageRole: args.role,
      lastMessageAt: now,
      messageCount: (conversation.messageCount ?? 0) + 1,
      updatedAt: now,
    });

    return messageId;
  },
});

/**
 * Update message content or metadata
 * Only message owner or admin can update
 */
export const update = mutation({
  args: {
    id: v.string(),
    content: v.optional(v.string()),
    metadata: v.optional(v.any()),
    toolCalls: v.optional(
      v.array(
        v.object({
          toolName: v.string(),
          args: v.any(),
          result: v.optional(v.any()),
        })
      )
    ),
    citations: v.optional(
      v.array(
        v.object({
          sourceType: v.string(),
          sourceId: v.string(),
          content: v.optional(v.string()),
        })
      )
    ),
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

    const message = await resolveById(ctx.db, "messages", args.id);
    if (!message) {
      throw new Error("Message not found");
    }

    // Get parent conversation
    const conversation = await ctx.db.get(message.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // Check authorization - must own the message or be admin of the business
    const isOwner = message.userId === user._id;
    let isAdmin = false;

    if (conversation.businessId) {
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", conversation.businessId!)
        )
        .first();

      isAdmin = membership?.role === "owner" || membership?.role === "admin";
    }

    if (!isOwner && !isAdmin) {
      throw new Error("Not authorized to update this message");
    }

    const { id, ...updates } = args;
    const updateData: Record<string, unknown> = { updatedAt: Date.now() };

    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.metadata !== undefined) updateData.metadata = updates.metadata;
    if (updates.toolCalls !== undefined) updateData.toolCalls = updates.toolCalls;
    if (updates.citations !== undefined) updateData.citations = updates.citations;

    await ctx.db.patch(message._id, updateData);
    return message._id;
  },
});

/**
 * Delete a message (hard delete)
 * Only message owner or admin can delete
 */
export const remove = mutation({
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

    const message = await resolveById(ctx.db, "messages", args.id);
    if (!message) {
      throw new Error("Message not found");
    }

    // Get parent conversation
    const conversation = await ctx.db.get(message.conversationId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }

    // Check authorization
    const isOwner = message.userId === user._id;
    let isAdmin = false;

    if (conversation.businessId) {
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", conversation.businessId!)
        )
        .first();

      isAdmin = membership?.role === "owner" || membership?.role === "admin";
    }

    if (!isOwner && !isAdmin) {
      throw new Error("Not authorized to delete this message");
    }

    // Delete the message
    await ctx.db.delete(message._id);

    // Update conversation message count
    await ctx.db.patch(conversation._id, {
      messageCount: Math.max(0, (conversation.messageCount ?? 1) - 1),
      updatedAt: Date.now(),
    });

    return true;
  },
});

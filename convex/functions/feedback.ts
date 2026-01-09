/**
 * Feedback Functions - Convex queries and mutations for user feedback collection
 *
 * These functions handle:
 * - Feedback submission with optional screenshots
 * - Feedback retrieval and filtering
 * - Status management for admin triage
 * - GitHub issue integration tracking
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { feedbackTypeValidator, feedbackStatusValidator } from "../lib/validators";
import { resolveUserByClerkId } from "../lib/resolvers";

// ============================================
// QUERIES
// ============================================

/**
 * List feedback with optional filters
 * Admin-only access for feedback management
 */
export const list = query({
  args: {
    type: v.optional(feedbackTypeValidator),
    status: v.optional(feedbackStatusValidator),
    limit: v.optional(v.number()),
    cursor: v.optional(v.id("feedback")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const limit = args.limit ?? 50;

    // Build and execute query based on filters
    let feedbackItems;
    if (args.status) {
      feedbackItems = await ctx.db
        .query("feedback")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(limit + 1);
    } else if (args.type) {
      feedbackItems = await ctx.db
        .query("feedback")
        .withIndex("by_type", (q) => q.eq("type", args.type!))
        .order("desc")
        .take(limit + 1);
    } else {
      feedbackItems = await ctx.db
        .query("feedback")
        .order("desc")
        .take(limit + 1);
    }

    // Enrich with user info and screenshot URLs
    const enrichedItems = await Promise.all(
      feedbackItems.slice(0, limit).map(async (item) => {
        let user = null;
        if (item.userId) {
          const userDoc = await ctx.db.get(item.userId);
          if (userDoc) {
            user = {
              name: userDoc.fullName || userDoc.email,
              email: userDoc.email,
            };
          }
        }

        return {
          ...item,
          user,
          // screenshotUrl is now stored directly as S3 URL
        };
      })
    );

    const hasMore = feedbackItems.length > limit;
    const nextCursor = hasMore ? feedbackItems[limit - 1]._id : null;

    return {
      items: enrichedItems,
      nextCursor,
    };
  },
});

/**
 * Get single feedback item by ID
 */
export const get = query({
  args: { id: v.id("feedback") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const feedback = await ctx.db.get(args.id);
    if (!feedback) {
      return null;
    }

    // Enrich with user info
    let user = null;
    if (feedback.userId) {
      const userDoc = await ctx.db.get(feedback.userId);
      if (userDoc) {
        user = {
          name: userDoc.fullName || userDoc.email,
          email: userDoc.email,
        };
      }
    }

    return {
      ...feedback,
      user,
      // screenshotUrl is now stored directly in feedback record as S3 URL
    };
  },
});

/**
 * Get feedback counts by status (for admin dashboard)
 */
export const getCounts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const [newCount, reviewedCount, resolvedCount] = await Promise.all([
      ctx.db
        .query("feedback")
        .withIndex("by_status", (q) => q.eq("status", "new"))
        .collect()
        .then((items) => items.length),
      ctx.db
        .query("feedback")
        .withIndex("by_status", (q) => q.eq("status", "reviewed"))
        .collect()
        .then((items) => items.length),
      ctx.db
        .query("feedback")
        .withIndex("by_status", (q) => q.eq("status", "resolved"))
        .collect()
        .then((items) => items.length),
    ]);

    return {
      new: newCount,
      reviewed: reviewedCount,
      resolved: resolvedCount,
      total: newCount + reviewedCount + resolvedCount,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

// Note: Screenshot uploads now go directly to S3 via /api/v1/feedback/upload-url
// The generateUploadUrl function has been removed as we no longer use Convex storage

/**
 * Create new feedback submission
 */
export const create = mutation({
  args: {
    type: feedbackTypeValidator,
    message: v.string(),
    screenshotUrl: v.optional(v.string()), // S3 URL for permanent hosting
    pageUrl: v.string(),
    userAgent: v.string(),
    isAnonymous: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get user ID if not anonymous
    let userId = undefined;
    let businessId = undefined;

    if (!args.isAnonymous) {
      const user = await resolveUserByClerkId(ctx.db, identity.subject);
      if (user) {
        userId = user._id;
        businessId = user.businessId;
      }
    }

    const feedbackId = await ctx.db.insert("feedback", {
      type: args.type,
      message: args.message,
      screenshotUrl: args.screenshotUrl, // Permanent S3 URL
      pageUrl: args.pageUrl,
      userAgent: args.userAgent,
      userId,
      businessId,
      isAnonymous: args.isAnonymous,
      status: "new",
    });

    return feedbackId;
  },
});

/**
 * Update feedback status (admin only)
 */
export const updateStatus = mutation({
  args: {
    id: v.id("feedback"),
    status: feedbackStatusValidator,
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const feedback = await ctx.db.get(args.id);
    if (!feedback) {
      throw new Error("Feedback not found");
    }

    // Validate status transition (no backward transitions)
    const statusOrder = { new: 0, reviewed: 1, resolved: 2 };
    if (statusOrder[args.status] < statusOrder[feedback.status]) {
      throw new Error("Cannot transition to earlier status");
    }

    await ctx.db.patch(args.id, {
      status: args.status,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

/**
 * Update feedback with GitHub issue details
 * Called after GitHub issue is created
 */
export const updateGitHubIssue = mutation({
  args: {
    id: v.id("feedback"),
    githubIssueUrl: v.string(),
    githubIssueNumber: v.number(),
  },
  handler: async (ctx, args) => {
    const feedback = await ctx.db.get(args.id);
    if (!feedback) {
      throw new Error("Feedback not found");
    }

    await ctx.db.patch(args.id, {
      githubIssueUrl: args.githubIssueUrl,
      githubIssueNumber: args.githubIssueNumber,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

/**
 * Internal mutation to update GitHub issue (for system use)
 */
export const internalUpdateGitHubIssue = internalMutation({
  args: {
    id: v.id("feedback"),
    githubIssueUrl: v.string(),
    githubIssueNumber: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      githubIssueUrl: args.githubIssueUrl,
      githubIssueNumber: args.githubIssueNumber,
      updatedAt: Date.now(),
    });
  },
});

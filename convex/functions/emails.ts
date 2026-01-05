/**
 * Email Convex Functions
 *
 * Queries and mutations for email preferences, logs, and suppressions.
 * Used by Lambda functions for delivery tracking and preference checks.
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import {
  emailTemplateTypeValidator,
  emailStatusValidator,
  emailSuppressionReasonValidator,
} from "../lib/validators";

// ============================================
// QUERIES
// ============================================

/**
 * Get all memberships for a user (no auth required - use from authenticated API routes)
 *
 * This is designed for use by Next.js API routes that have already verified
 * Clerk authentication. It returns all memberships for a given user ID.
 */
export const getMembershipsForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const memberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    return memberships;
  },
});

/**
 * Check if an email address is suppressed
 *
 * MUST be called before sending ANY email to avoid bounces/complaints.
 */
export const isEmailSuppressed = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const suppression = await ctx.db
      .query("email_suppressions")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();

    return suppression !== null;
  },
});

/**
 * Get suppression details for an email address
 */
export const getEmailSuppression = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("email_suppressions")
      .withIndex("by_email", (q) => q.eq("email", args.email.toLowerCase()))
      .first();
  },
});

/**
 * Get user email preferences
 *
 * Reads from users.emailPreferences field (simpler, no JOIN needed).
 * Returns default preferences if none are set for the user.
 */
export const getEmailPreferences = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);

    if (!user) {
      throw new Error(`User not found: ${args.userId}`);
    }

    // Return preferences from user record, with defaults
    const prefs = user.emailPreferences;
    return {
      userId: args.userId,
      marketingEnabled: prefs?.marketingEnabled ?? true,
      onboardingTipsEnabled: prefs?.onboardingTipsEnabled ?? true,
      productUpdatesEnabled: prefs?.productUpdatesEnabled ?? true,
      globalUnsubscribe: prefs?.globalUnsubscribe ?? false,
      unsubscribedAt: prefs?.unsubscribedAt,
    };
  },
});

/**
 * Get email log by SES Message ID
 *
 * Used for delivery event updates from SNS.
 */
export const getEmailLogByMessageId = query({
  args: { sesMessageId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("email_logs")
      .withIndex("by_sesMessageId", (q) => q.eq("sesMessageId", args.sesMessageId))
      .first();
  },
});

/**
 * Get email logs for a user
 */
export const getEmailLogsForUser = query({
  args: {
    userId: v.id("users"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    return await ctx.db
      .query("email_logs")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(limit);
  },
});

/**
 * Get email logs for a business (admin view)
 */
export const getEmailLogsForBusiness = query({
  args: {
    businessId: v.id("businesses"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    return await ctx.db
      .query("email_logs")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .order("desc")
      .take(limit);
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Log an email send
 *
 * Called after successfully sending an email via SES.
 */
export const logEmailSend = mutation({
  args: {
    sesMessageId: v.string(),
    configurationSet: v.string(),
    templateType: emailTemplateTypeValidator,
    recipientEmail: v.string(),
    subject: v.string(),
    senderEmail: v.string(),
    businessId: v.optional(v.id("businesses")),
    userId: v.optional(v.id("users")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("email_logs", {
      ...args,
      status: "sent",
    });
  },
});

/**
 * Log a delivery event from SES SNS notifications
 *
 * Updates the email log with delivery status.
 */
export const logDeliveryEvent = mutation({
  args: {
    sesMessageId: v.string(),
    eventType: v.string(), // "send", "delivery", "bounce", "complaint", etc.
    timestamp: v.number(),
    recipient: v.string(),
    details: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    // Find existing email log
    const emailLog = await ctx.db
      .query("email_logs")
      .withIndex("by_sesMessageId", (q) => q.eq("sesMessageId", args.sesMessageId))
      .first();

    if (!emailLog) {
      console.warn(`Email log not found for messageId: ${args.sesMessageId}`);
      return null;
    }

    // Update based on event type
    const updates: Record<string, unknown> = {};

    switch (args.eventType.toLowerCase()) {
      case "delivery":
        updates.status = "delivered";
        updates.deliveredAt = args.timestamp;
        break;
      case "bounce":
        updates.status = "bounced";
        updates.bouncedAt = args.timestamp;
        if (args.details?.bounce) {
          updates.bounceType = args.details.bounce.bounceType;
          updates.bounceSubType = args.details.bounce.bounceSubType;
        }
        break;
      case "complaint":
        updates.status = "complained";
        updates.complainedAt = args.timestamp;
        break;
      case "reject":
        updates.status = "rejected";
        break;
      case "open":
        // Don't override delivered status
        if (emailLog.status === "delivered") {
          updates.status = "opened";
        }
        updates.openedAt = args.timestamp;
        break;
      case "click":
        // Keep the highest engagement status
        if (emailLog.status === "delivered" || emailLog.status === "opened") {
          updates.status = "clicked";
        }
        updates.clickedAt = args.timestamp;
        break;
    }

    if (Object.keys(updates).length > 0) {
      await ctx.db.patch(emailLog._id, updates);
    }

    return emailLog._id;
  },
});

/**
 * Mark an email address as undeliverable (suppressed)
 *
 * Called when we receive a bounce or complaint from SES.
 */
export const markEmailUndeliverable = mutation({
  args: {
    email: v.string(),
    reason: emailSuppressionReasonValidator,
    bounceType: v.optional(v.string()),
    bounceSubType: v.optional(v.string()),
    sourceMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normalizedEmail = args.email.toLowerCase();

    // Check if already suppressed
    const existing = await ctx.db
      .query("email_suppressions")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .first();

    if (existing) {
      // Update with latest info
      return await ctx.db.patch(existing._id, {
        reason: args.reason,
        bounceType: args.bounceType,
        bounceSubType: args.bounceSubType,
        sourceMessageId: args.sourceMessageId,
        suppressedAt: Date.now(),
      });
    }

    // Create new suppression
    return await ctx.db.insert("email_suppressions", {
      email: normalizedEmail,
      reason: args.reason,
      bounceType: args.bounceType,
      bounceSubType: args.bounceSubType,
      sourceMessageId: args.sourceMessageId,
      suppressedAt: Date.now(),
    });
  },
});

/**
 * Update email preferences for a user
 *
 * Updates the users.emailPreferences field directly (no separate table).
 */
export const updateEmailPreferences = mutation({
  args: {
    userId: v.id("users"),
    marketingEnabled: v.optional(v.boolean()),
    onboardingTipsEnabled: v.optional(v.boolean()),
    productUpdatesEnabled: v.optional(v.boolean()),
    globalUnsubscribe: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId, ...updates } = args;

    // Get current user
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    const now = Date.now();
    const currentPrefs = user.emailPreferences ?? {};

    // Build updated preferences
    const newPrefs: Record<string, unknown> = {
      marketingEnabled: updates.marketingEnabled ?? currentPrefs.marketingEnabled ?? true,
      onboardingTipsEnabled: updates.onboardingTipsEnabled ?? currentPrefs.onboardingTipsEnabled ?? true,
      productUpdatesEnabled: updates.productUpdatesEnabled ?? currentPrefs.productUpdatesEnabled ?? true,
      globalUnsubscribe: updates.globalUnsubscribe ?? currentPrefs.globalUnsubscribe ?? false,
    };

    // Track global unsubscribe timestamp
    if (updates.globalUnsubscribe === true && !currentPrefs.globalUnsubscribe) {
      newPrefs.unsubscribedAt = now;
    } else if (updates.globalUnsubscribe === false) {
      newPrefs.unsubscribedAt = undefined;
    } else {
      newPrefs.unsubscribedAt = currentPrefs.unsubscribedAt;
    }

    // Update user record
    await ctx.db.patch(userId, {
      emailPreferences: newPrefs,
      updatedAt: now,
    });

    return userId;
  },
});

/**
 * Get or create email preferences for a user
 *
 * Returns preferences from users.emailPreferences, creating defaults if needed.
 */
export const getOrCreateEmailPreferences = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);

    if (!user) {
      throw new Error(`User not found: ${args.userId}`);
    }

    // If preferences already exist, return them
    if (user.emailPreferences) {
      return {
        userId: args.userId,
        marketingEnabled: user.emailPreferences.marketingEnabled ?? true,
        onboardingTipsEnabled: user.emailPreferences.onboardingTipsEnabled ?? true,
        productUpdatesEnabled: user.emailPreferences.productUpdatesEnabled ?? true,
        globalUnsubscribe: user.emailPreferences.globalUnsubscribe ?? false,
        unsubscribedAt: user.emailPreferences.unsubscribedAt,
      };
    }

    // Initialize with defaults
    const defaultPrefs = {
      marketingEnabled: true,
      onboardingTipsEnabled: true,
      productUpdatesEnabled: true,
      globalUnsubscribe: false,
    };

    await ctx.db.patch(args.userId, {
      emailPreferences: defaultPrefs,
      updatedAt: Date.now(),
    });

    return {
      userId: args.userId,
      ...defaultPrefs,
    };
  },
});

/**
 * Get email statistics for a business (admin view)
 *
 * Returns aggregated stats including:
 * - Total emails sent
 * - Delivery rate
 * - Bounce rate
 * - Complaint rate
 * - Open rate
 * - Click rate
 * - Stats by template type
 */
export const getEmailStatsForBusiness = query({
  args: {
    businessId: v.id("businesses"),
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const daysBack = args.daysBack ?? 30;
    const cutoffTime = Date.now() - (daysBack * 24 * 60 * 60 * 1000);

    // Get all logs for the business (limited to recent timeframe)
    const logs = await ctx.db
      .query("email_logs")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Filter to recent logs (Convex doesn't support range queries on non-index fields)
    const recentLogs = logs.filter(log => {
      // Use _creationTime as a proxy for when the email was sent
      return log._creationTime >= cutoffTime;
    });

    // Calculate stats
    const total = recentLogs.length;
    const delivered = recentLogs.filter(l => l.status === "delivered" || l.status === "opened" || l.status === "clicked").length;
    const bounced = recentLogs.filter(l => l.status === "bounced").length;
    const complained = recentLogs.filter(l => l.status === "complained").length;
    const opened = recentLogs.filter(l => l.openedAt).length;
    const clicked = recentLogs.filter(l => l.clickedAt).length;

    // Stats by template type
    const templateStats: Record<string, { sent: number; delivered: number; bounced: number; opened: number }> = {};
    for (const log of recentLogs) {
      if (!templateStats[log.templateType]) {
        templateStats[log.templateType] = { sent: 0, delivered: 0, bounced: 0, opened: 0 };
      }
      templateStats[log.templateType].sent++;
      if (log.status === "delivered" || log.status === "opened" || log.status === "clicked") {
        templateStats[log.templateType].delivered++;
      }
      if (log.status === "bounced") {
        templateStats[log.templateType].bounced++;
      }
      if (log.openedAt) {
        templateStats[log.templateType].opened++;
      }
    }

    // Get suppression count
    const suppressions = await ctx.db
      .query("email_suppressions")
      .collect();

    return {
      period: {
        daysBack,
        from: new Date(cutoffTime).toISOString(),
        to: new Date().toISOString(),
      },
      totals: {
        sent: total,
        delivered,
        bounced,
        complained,
        opened,
        clicked,
      },
      rates: {
        deliveryRate: total > 0 ? ((delivered / total) * 100).toFixed(2) : "0.00",
        bounceRate: total > 0 ? ((bounced / total) * 100).toFixed(2) : "0.00",
        complaintRate: total > 0 ? ((complained / total) * 100).toFixed(2) : "0.00",
        openRate: delivered > 0 ? ((opened / delivered) * 100).toFixed(2) : "0.00",
        clickRate: opened > 0 ? ((clicked / opened) * 100).toFixed(2) : "0.00",
      },
      byTemplate: templateStats,
      suppressions: {
        total: suppressions.length,
        bounces: suppressions.filter(s => s.reason === "bounce").length,
        complaints: suppressions.filter(s => s.reason === "complaint").length,
        unsubscribes: suppressions.filter(s => s.reason === "unsubscribe").length,
      },
    };
  },
});

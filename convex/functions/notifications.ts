/**
 * Notification Functions - Convex queries, mutations, and internal functions
 *
 * Handles the notification lifecycle:
 * - Listing notifications with filtering/pagination
 * - Unread count for bell badge (real-time)
 * - Mark as read / dismiss / mark all as read
 * - Create notifications (internal, called by triggers)
 * - Role-based broadcast notifications
 * - 90-day retention cleanup
 * - Transactional email sending
 * - Notification preferences
 *
 * Security: Multi-tenant isolation via businessId + recipientUserId
 */

import { v } from "convex/values";
import { query, mutation, internalMutation, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";

// ============================================
// NOTIFICATION TYPE/SEVERITY VALIDATORS
// ============================================

const notificationTypeValidator = v.union(
  v.literal("approval"),
  v.literal("anomaly"),
  v.literal("compliance"),
  v.literal("insight"),
  v.literal("invoice_processing"),
  v.literal("lhdn_submission")
);

const severityValidator = v.union(
  v.literal("info"),
  v.literal("warning"),
  v.literal("critical")
);

const statusValidator = v.union(
  v.literal("unread"),
  v.literal("read"),
  v.literal("dismissed")
);

const resourceTypeValidator = v.union(
  v.literal("expense_claim"),
  v.literal("invoice"),
  v.literal("sales_invoice"),
  v.literal("insight"),
  v.literal("dashboard")
);

// Default notification preferences
const DEFAULT_PREFERENCES = {
  inApp: {
    approval: true,
    anomaly: true,
    compliance: true,
    insight: true,
    invoice_processing: true,
    lhdn_submission: true,
  },
  email: {
    approval: true,
    anomaly: true,
    compliance: false,
    insight: false,
    invoice_processing: false,
    lhdn_submission: false,
  },
  digestFrequency: "daily" as const,
  digestTime: 8, // 8 AM UTC
};

type NotificationType = "approval" | "anomaly" | "compliance" | "insight" | "invoice_processing" | "lhdn_submission";

// ============================================
// QUERIES
// ============================================

/**
 * List notifications for the current user and business
 */
export const listForUser = query({
  args: {
    businessId: v.id("businesses"),
    status: v.optional(statusValidator),
    type: v.optional(notificationTypeValidator),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()), // createdAt timestamp for cursor-based pagination
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { notifications: [], hasMore: false };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { notifications: [], hasMore: false };
    }

    // Verify membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { notifications: [], hasMore: false };
    }

    const limit = Math.min(args.limit ?? 20, 100);

    // Query using the by_recipient_business_created index for efficient sorted access
    let notifications = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_business_created", (q) =>
        q.eq("recipientUserId", user._id).eq("businessId", args.businessId)
      )
      .order("desc")
      .collect();

    // Apply filters
    if (args.status) {
      notifications = notifications.filter((n) => n.status === args.status);
    } else {
      // By default, exclude dismissed notifications
      notifications = notifications.filter((n) => n.status !== "dismissed");
    }
    if (args.type) {
      notifications = notifications.filter((n) => n.type === args.type);
    }

    // Apply cursor-based pagination
    if (args.cursor) {
      notifications = notifications.filter((n) => n.createdAt < args.cursor!);
    }

    // Check if there are more results
    const hasMore = notifications.length > limit;
    const paginatedNotifications = notifications.slice(0, limit);

    return {
      notifications: paginatedNotifications,
      hasMore,
    };
  },
});

/**
 * Get unread notification count for the bell badge
 */
export const getUnreadCount = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return 0;

    // Verify membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") return 0;

    const unreadNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_business_status", (q) =>
        q.eq("recipientUserId", user._id).eq("businessId", args.businessId).eq("status", "unread")
      )
      .collect();

    return unreadNotifications.length;
  },
});

/**
 * Get notification preferences for the current user
 */
export const getPreferences = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return DEFAULT_PREFERENCES;

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return DEFAULT_PREFERENCES;

    const prefs = user.notificationPreferences;
    if (!prefs) return DEFAULT_PREFERENCES;

    // Merge with defaults to ensure all fields present
    return {
      inApp: {
        approval: prefs.inApp?.approval ?? DEFAULT_PREFERENCES.inApp.approval,
        anomaly: prefs.inApp?.anomaly ?? DEFAULT_PREFERENCES.inApp.anomaly,
        compliance: prefs.inApp?.compliance ?? DEFAULT_PREFERENCES.inApp.compliance,
        insight: prefs.inApp?.insight ?? DEFAULT_PREFERENCES.inApp.insight,
        invoice_processing: prefs.inApp?.invoice_processing ?? DEFAULT_PREFERENCES.inApp.invoice_processing,
      },
      email: {
        approval: prefs.email?.approval ?? DEFAULT_PREFERENCES.email.approval,
        anomaly: prefs.email?.anomaly ?? DEFAULT_PREFERENCES.email.anomaly,
        compliance: prefs.email?.compliance ?? DEFAULT_PREFERENCES.email.compliance,
        insight: prefs.email?.insight ?? DEFAULT_PREFERENCES.email.insight,
        invoice_processing: prefs.email?.invoice_processing ?? DEFAULT_PREFERENCES.email.invoice_processing,
      },
      digestFrequency: prefs.digestFrequency ?? DEFAULT_PREFERENCES.digestFrequency,
      digestTime: prefs.digestTime ?? DEFAULT_PREFERENCES.digestTime,
    };
  },
});

/**
 * 034-leave-enhance: Get notification preferences by user ID string.
 * For server-to-server calls (no Clerk auth context).
 * Returns only the approval preference needed for push notification gating (FR-009).
 */
export const getPreferencesByUserId = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await resolveById(ctx.db, "users", args.userId);
    if (!user) return DEFAULT_PREFERENCES;

    const prefs = (user as any).notificationPreferences;
    if (!prefs) return DEFAULT_PREFERENCES;

    return {
      inApp: {
        approval: prefs.inApp?.approval ?? DEFAULT_PREFERENCES.inApp.approval,
      },
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Mark a single notification as read
 */
export const markAsRead = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const notification = await ctx.db.get(args.notificationId);
    if (!notification) throw new Error("Notification not found");

    // Verify ownership
    if (notification.recipientUserId !== user._id) {
      throw new Error("Not authorized");
    }

    // No-op if already read or dismissed
    if (notification.status === "read" || notification.status === "dismissed") {
      return null;
    }

    await ctx.db.patch(args.notificationId, {
      status: "read",
      readAt: Date.now(),
    });
    return null;
  },
});

/**
 * Mark all unread notifications as read for current user + business
 */
export const markAllAsRead = mutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    // Verify membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    const unreadNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_business_status", (q) =>
        q.eq("recipientUserId", user._id).eq("businessId", args.businessId).eq("status", "unread")
      )
      .collect();

    const now = Date.now();
    for (const notification of unreadNotifications) {
      await ctx.db.patch(notification._id, {
        status: "read",
        readAt: now,
      });
    }

    return { count: unreadNotifications.length };
  },
});

/**
 * Dismiss a notification
 */
export const dismiss = mutation({
  args: {
    notificationId: v.id("notifications"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const notification = await ctx.db.get(args.notificationId);
    if (!notification) throw new Error("Notification not found");

    // Verify ownership
    if (notification.recipientUserId !== user._id) {
      throw new Error("Not authorized");
    }

    await ctx.db.patch(args.notificationId, {
      status: "dismissed",
      dismissedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Dismiss all notifications for current user + business
 */
export const dismissAll = mutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();
    if (!membership) throw new Error("Not a member of this business");

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_business_status", (q) =>
        q.eq("recipientUserId", user._id).eq("businessId", args.businessId)
      )
      .collect();

    const active = notifications.filter((n) => n.status !== "dismissed");
    const now = Date.now();
    for (const notification of active) {
      await ctx.db.patch(notification._id, {
        status: "dismissed",
        dismissedAt: now,
      });
    }

    return { count: active.length };
  },
});

/**
 * Update notification preferences for the current user
 */
export const updatePreferences = mutation({
  args: {
    inApp: v.optional(v.object({
      approval: v.optional(v.boolean()),
      anomaly: v.optional(v.boolean()),
      compliance: v.optional(v.boolean()),
      insight: v.optional(v.boolean()),
      invoice_processing: v.optional(v.boolean()),
    })),
    email: v.optional(v.object({
      approval: v.optional(v.boolean()),
      anomaly: v.optional(v.boolean()),
      compliance: v.optional(v.boolean()),
      insight: v.optional(v.boolean()),
      invoice_processing: v.optional(v.boolean()),
    })),
    digestFrequency: v.optional(v.union(v.literal("daily"), v.literal("weekly"))),
    digestTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const currentPrefs = user.notificationPreferences || {};

    // Merge provided fields into existing preferences
    const updatedPrefs = {
      inApp: args.inApp
        ? { ...(currentPrefs.inApp || {}), ...args.inApp }
        : currentPrefs.inApp,
      email: args.email
        ? { ...(currentPrefs.email || {}), ...args.email }
        : currentPrefs.email,
      digestFrequency: args.digestFrequency ?? currentPrefs.digestFrequency,
      digestTime: args.digestTime ?? currentPrefs.digestTime,
    };

    await ctx.db.patch(user._id, {
      notificationPreferences: updatedPrefs,
      updatedAt: Date.now(),
    });
    return null;
  },
});

// ============================================
// PUBLIC MUTATION: Create from Workflow
// (Used by enhanced-workflow-engine.ts which runs client-side)
// ============================================

/**
 * Create a notification from the workflow engine (authenticated endpoint)
 * This is a public mutation because the workflow engine runs client-side
 * via ConvexHttpClient and cannot call internal mutations.
 */
export const createFromWorkflow = mutation({
  args: {
    recipientUserId: v.id("users"),
    businessId: v.id("businesses"),
    type: notificationTypeValidator,
    severity: severityValidator,
    title: v.string(),
    body: v.string(),
    resourceType: v.optional(resourceTypeValidator),
    resourceId: v.optional(v.string()),
    resourceUrl: v.optional(v.string()),
    sourceEvent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Auth check - only authenticated users can create workflow notifications
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    // Verify caller has active membership in the business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized for this business");
    }

    // Check recipient's in-app preference
    const recipient = await ctx.db.get(args.recipientUserId);
    if (!recipient) return null;

    type NotifType = "approval" | "anomaly" | "compliance" | "insight" | "invoice_processing";
    const inAppEnabled = recipient.notificationPreferences?.inApp?.[args.type as NotifType] ?? true;
    if (!inAppEnabled) return null;

    // Dedup via sourceEvent
    if (args.sourceEvent) {
      const existing = await ctx.db
        .query("notifications")
        .withIndex("by_sourceEvent", (q) => q.eq("sourceEvent", args.sourceEvent!))
        .collect();

      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
      const dup = existing.find(
        (n) => n.recipientUserId === args.recipientUserId && n.createdAt > twentyFourHoursAgo
      );
      if (dup) return dup._id;
    }

    // Create notification
    const notificationId = await ctx.db.insert("notifications", {
      recipientUserId: args.recipientUserId,
      businessId: args.businessId,
      type: args.type,
      severity: args.severity,
      status: "unread",
      title: args.title,
      body: args.body,
      resourceType: args.resourceType,
      resourceId: args.resourceId,
      resourceUrl: args.resourceUrl,
      sourceEvent: args.sourceEvent,
      emailSent: false,
      createdAt: Date.now(),
    });

    // Schedule transactional email for approval requests and critical anomalies
    const shouldSendEmail =
      (args.type === "approval" || (args.type === "anomaly" && args.severity === "critical"));

    if (shouldSendEmail && recipient.email) {
      const emailEnabled = recipient.notificationPreferences?.email?.[args.type as NotifType] ??
        DEFAULT_PREFERENCES.email[args.type as NotifType];
      const globalUnsubscribe = recipient.emailPreferences?.globalUnsubscribe ?? false;

      if (emailEnabled && !globalUnsubscribe) {
        let templateType = "notification_approval_request";
        if (args.type === "anomaly") templateType = "notification_critical_anomaly";

        await ctx.scheduler.runAfter(0, internal.functions.notifications.sendTransactionalEmail, {
          notificationId,
          recipientEmail: recipient.email,
          recipientName: recipient.fullName || recipient.email,
          templateType,
          templateData: {
            recipientName: recipient.fullName || recipient.email,
            title: args.title,
            body: args.body,
            resourceUrl: args.resourceUrl || "",
          },
          userId: recipient._id,
        });
      }
    }

    return notificationId;
  },
});

// ============================================
// INTERNAL MUTATIONS (Server-Side Only)
// ============================================

/**
 * Create a notification for a specific user
 * Called by trigger functions, not directly by clients
 */
export const create = internalMutation({
  args: {
    recipientUserId: v.id("users"),
    businessId: v.id("businesses"),
    type: notificationTypeValidator,
    severity: severityValidator,
    title: v.string(),
    body: v.string(),
    resourceType: v.optional(resourceTypeValidator),
    resourceId: v.optional(v.string()),
    resourceUrl: v.optional(v.string()),
    sourceEvent: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Check user's in-app preference for this type
    const user = await ctx.db.get(args.recipientUserId);
    if (!user) {
      throw new Error(`Recipient user not found: ${args.recipientUserId}`);
    }

    const prefs = user.notificationPreferences;
    const inAppEnabled = prefs?.inApp?.[args.type as NotificationType] ?? true;
    if (!inAppEnabled) {
      // User has disabled in-app notifications for this type — skip
      return null as unknown as Id<"notifications">;
    }

    // Dedup via sourceEvent within 24h
    if (args.sourceEvent) {
      const existingByEvent = await ctx.db
        .query("notifications")
        .withIndex("by_sourceEvent", (q) => q.eq("sourceEvent", args.sourceEvent!))
        .collect();

      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
      const recentDuplicate = existingByEvent.find(
        (n) =>
          n.recipientUserId === args.recipientUserId &&
          n.createdAt > twentyFourHoursAgo
      );

      if (recentDuplicate) {
        // Duplicate within 24h — skip
        return recentDuplicate._id;
      }
    }

    // Bulk batching check: 5+ notifications of same type within 60s for same recipient
    const sixtySecondsAgo = Date.now() - 60 * 1000;
    const recentSameType = await ctx.db
      .query("notifications")
      .withIndex("by_recipient_business_created", (q) =>
        q.eq("recipientUserId", args.recipientUserId).eq("businessId", args.businessId)
      )
      .order("desc")
      .collect();

    const recentCount = recentSameType.filter(
      (n) => n.type === args.type && n.createdAt > sixtySecondsAgo
    ).length;

    if (recentCount >= 5) {
      // Check if we already have a summary notification
      const hasSummary = recentSameType.some(
        (n) =>
          n.type === args.type &&
          n.createdAt > sixtySecondsAgo &&
          n.title.startsWith("Multiple ")
      );

      if (hasSummary) {
        // Update the existing summary count
        const summary = recentSameType.find(
          (n) =>
            n.type === args.type &&
            n.createdAt > sixtySecondsAgo &&
            n.title.startsWith("Multiple ")
        )!;
        await ctx.db.patch(summary._id, {
          title: `Multiple ${args.type} notifications (${recentCount + 1})`,
          body: `You have ${recentCount + 1} new ${args.type} notifications.`,
        });
        return summary._id;
      }

      // Create a summary notification instead
      const notificationId = await ctx.db.insert("notifications", {
        recipientUserId: args.recipientUserId,
        businessId: args.businessId,
        type: args.type,
        severity: args.severity,
        status: "unread",
        title: `Multiple ${args.type} notifications (${recentCount + 1})`,
        body: `You have ${recentCount + 1} new ${args.type} notifications.`,
        resourceType: args.resourceType,
        resourceUrl: args.resourceUrl,
        sourceEvent: args.sourceEvent,
        createdAt: Date.now(),
        expiresAt: args.expiresAt,
      });
      return notificationId;
    }

    // Create notification
    const notificationId = await ctx.db.insert("notifications", {
      recipientUserId: args.recipientUserId,
      businessId: args.businessId,
      type: args.type,
      severity: args.severity,
      status: "unread",
      title: args.title,
      body: args.body,
      resourceType: args.resourceType,
      resourceId: args.resourceId,
      resourceUrl: args.resourceUrl,
      sourceEvent: args.sourceEvent,
      emailSent: false,
      createdAt: Date.now(),
      expiresAt: args.expiresAt,
    });

    // Check if transactional email should be sent
    const shouldSendEmail =
      (args.type === "approval" || (args.type === "anomaly" && args.severity === "critical"));

    if (shouldSendEmail) {
      const emailEnabled = prefs?.email?.[args.type as NotificationType] ?? DEFAULT_PREFERENCES.email[args.type as NotificationType];
      const globalUnsubscribe = user.emailPreferences?.globalUnsubscribe ?? false;

      if (emailEnabled && !globalUnsubscribe && user.email) {
        // Schedule transactional email
        let templateType = "notification_approval_request";
        if (args.type === "anomaly") {
          templateType = "notification_critical_anomaly";
        }

        await ctx.scheduler.runAfter(0, internal.functions.notifications.sendTransactionalEmail, {
          notificationId,
          recipientEmail: user.email,
          recipientName: user.fullName || user.email,
          templateType,
          templateData: {
            recipientName: user.fullName || user.email,
            title: args.title,
            body: args.body,
            resourceUrl: args.resourceUrl || "",
          },
          userId: user._id,
        });
      }
    }

    // Schedule push notification for approval requests
    if (args.type === "approval") {
      await ctx.scheduler.runAfter(0, internal.functions.notifications.sendPushNotification, {
        recipientUserId: args.recipientUserId,
        title: args.title,
        body: args.body,
        resourceUrl: args.resourceUrl,
      });
    }

    return notificationId;
  },
});

/**
 * Create notifications for all users with specific roles in a business
 */
export const createForRole = internalMutation({
  args: {
    businessId: v.id("businesses"),
    targetRoles: v.array(v.string()),
    type: notificationTypeValidator,
    severity: severityValidator,
    title: v.string(),
    body: v.string(),
    resourceType: v.optional(resourceTypeValidator),
    resourceId: v.optional(v.string()),
    resourceUrl: v.optional(v.string()),
    sourceEvent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Find all active members with matching roles
    const memberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const targetMembers = memberships.filter(
      (m) => m.status === "active" && args.targetRoles.includes(m.role)
    );

    let created = 0;
    let skipped = 0;

    for (const member of targetMembers) {
      // Call create logic for each member
      const user = await ctx.db.get(member.userId);
      if (!user) {
        skipped++;
        continue;
      }

      const prefs = user.notificationPreferences;
      const inAppEnabled = prefs?.inApp?.[args.type as NotificationType] ?? true;
      if (!inAppEnabled) {
        skipped++;
        continue;
      }

      // Dedup check
      if (args.sourceEvent) {
        const existingByEvent = await ctx.db
          .query("notifications")
          .withIndex("by_sourceEvent", (q) => q.eq("sourceEvent", args.sourceEvent!))
          .collect();

        const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
        const recentDuplicate = existingByEvent.find(
          (n) =>
            n.recipientUserId === member.userId &&
            n.createdAt > twentyFourHoursAgo
        );

        if (recentDuplicate) {
          skipped++;
          continue;
        }
      }

      // Create notification
      await ctx.db.insert("notifications", {
        recipientUserId: member.userId,
        businessId: args.businessId,
        type: args.type,
        severity: args.severity,
        status: "unread",
        title: args.title,
        body: args.body,
        resourceType: args.resourceType,
        resourceId: args.resourceId,
        resourceUrl: args.resourceUrl,
        sourceEvent: args.sourceEvent,
        emailSent: false,
        createdAt: Date.now(),
      });

      // Check if transactional email should be sent
      const shouldSendEmail =
        (args.type === "approval" || (args.type === "anomaly" && args.severity === "critical"));

      if (shouldSendEmail) {
        const emailEnabled = prefs?.email?.[args.type as NotificationType] ??
          DEFAULT_PREFERENCES.email[args.type as NotificationType];
        const globalUnsubscribe = user.emailPreferences?.globalUnsubscribe ?? false;

        if (emailEnabled && !globalUnsubscribe && user.email) {
          let templateType = "notification_approval_request";
          if (args.type === "anomaly") {
            templateType = "notification_critical_anomaly";
          }

          await ctx.scheduler.runAfter(0, internal.functions.notifications.sendTransactionalEmail, {
            notificationId: "" as Id<"notifications">, // Will be updated by the notification creation
            recipientEmail: user.email,
            recipientName: user.fullName || user.email,
            templateType,
            templateData: {
              recipientName: user.fullName || user.email,
              title: args.title,
              body: args.body,
              resourceUrl: args.resourceUrl || "",
            },
            userId: user._id,
          });
        }
      }

      created++;
    }

    return { created, skipped };
  },
});

/**
 * Delete notifications older than 90 days (cleanup cron)
 */
export const deleteExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;

    const expiredNotifications = await ctx.db
      .query("notifications")
      .withIndex("by_createdAt", (q) => q.lt("createdAt", ninetyDaysAgo))
      .collect();

    for (const notification of expiredNotifications) {
      await ctx.db.delete(notification._id);
    }

    return { deleted: expiredNotifications.length };
  },
});

// ============================================
// INTERNAL ACTIONS (Email Sending)
// ============================================

/**
 * Send transactional email for a notification
 */
export const sendTransactionalEmail = internalAction({
  args: {
    notificationId: v.id("notifications"),
    recipientEmail: v.string(),
    recipientName: v.string(),
    templateType: v.string(),
    templateData: v.any(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    try {
      // Generate unsubscribe URL
      const baseUrl = process.env.APP_URL || "https://finance.hellogroot.com/en";
      const unsubscribeUrl = `${baseUrl}/api/v1/unsubscribe?userId=${args.userId}`;

      // Enrich template data with common fields
      const templateData = {
        ...args.templateData,
        recipientName: args.recipientName,
        unsubscribeUrl,
      };

      // Call the email-sending Convex action or HTTP endpoint
      // Since Lambda email service isn't directly callable from Convex actions,
      // we use fetch to call our API endpoint
      const apiUrl = process.env.APP_URL || "https://finance.hellogroot.com";
      const response = await fetch(`${apiUrl}/api/v1/notifications/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.INTERNAL_API_KEY || "",
        },
        body: JSON.stringify({
          to: args.recipientEmail,
          subject: getEmailSubject(args.templateType, args.templateData),
          templateType: args.templateType,
          templateData,
          unsubscribeToken: args.userId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to send notification email: ${errorText}`);

        // Update notification record
        await ctx.runMutation(internal.functions.notifications.updateEmailStatus, {
          notificationId: args.notificationId,
          emailSent: false,
        });

        return {
          success: false,
          error: errorText,
        };
      }

      const result = await response.json();

      // Update notification record with email status
      await ctx.runMutation(internal.functions.notifications.updateEmailStatus, {
        notificationId: args.notificationId,
        emailSent: true,
        emailMessageId: result.messageId,
      });

      return {
        success: true,
        messageId: result.messageId,
      };
    } catch (error) {
      console.error("Error sending transactional email:", error);

      await ctx.runMutation(internal.functions.notifications.updateEmailStatus, {
        notificationId: args.notificationId,
        emailSent: false,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Helper: Update email status on a notification (used by actions)
 */
export const updateEmailStatus = internalMutation({
  args: {
    notificationId: v.id("notifications"),
    emailSent: v.boolean(),
    emailMessageId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const notification = await ctx.db.get(args.notificationId);
    if (!notification) return;

    await ctx.db.patch(args.notificationId, {
      emailSent: args.emailSent,
      emailMessageId: args.emailMessageId,
    });
  },
});

// ============================================
// HELPER FUNCTION: Create Rejection Notification
// ============================================

/**
 * Helper function to create a notification when an e-invoice is rejected.
 * Used by the rejection mutation to notify stakeholders (AP invoice creator or expense claim submitter).
 *
 * @param ctx - Convex mutation context
 * @param userId - Recipient user ID (invoice creator or claim submitter)
 * @param businessId - Business ID
 * @param supplierName - Name of the supplier whose e-invoice was rejected
 * @param reason - Rejection reason provided by the user
 * @param resourceUrl - Deep link to the affected invoice or claim
 * @returns The created notification ID
 */
export async function createRejectionNotification(
  ctx: any,
  userId: string,
  businessId: Id<"businesses">,
  supplierName: string,
  reason: string,
  resourceUrl: string
): Promise<Id<"notifications">> {
  const notificationId = await ctx.db.insert("notifications", {
    recipientUserId: userId,
    businessId,
    type: "lhdn_submission" as const,
    severity: "warning" as const,
    title: "E-Invoice Rejected",
    message: `E-invoice from ${supplierName} was rejected: ${reason}`,
    resourceUrl,
    status: "unread" as const,
    read: false,
    dismissed: false,
    createdAt: Date.now(),
    emailSent: false, // Email notifications handled by separate preferences system
  });

  return notificationId;
}

// ============================================
// INTERNAL ACTION: Send Push Notification via APNs
// ============================================

/**
 * Send push notification to all active device subscriptions for a user.
 * Called via ctx.scheduler.runAfter after creating an approval notification.
 */
export const sendPushNotification = internalAction({
  args: {
    recipientUserId: v.id("users"),
    title: v.string(),
    body: v.string(),
    resourceUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      // Get active push subscriptions for the recipient
      const subscriptions = await ctx.runQuery(
        internal.functions.pushSubscriptions.getByUserId,
        { userId: args.recipientUserId }
      );

      if (!subscriptions || subscriptions.length === 0) {
        return { sent: 0, failed: 0 };
      }

      const apiUrl = process.env.APP_URL || "https://finance.hellogroot.com";
      let sent = 0;
      let failed = 0;

      for (const sub of subscriptions) {
        try {
          const response = await fetch(`${apiUrl}/api/v1/notifications/send-push`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": process.env.INTERNAL_API_KEY || "",
            },
            body: JSON.stringify({
              deviceToken: sub.deviceToken,
              title: args.title,
              body: args.body,
              resourceUrl: args.resourceUrl,
            }),
          });

          if (response.status === 410) {
            // Token unregistered — deactivate subscription
            await ctx.runMutation(
              internal.functions.pushSubscriptions.deactivateByToken,
              { deviceToken: sub.deviceToken }
            );
            failed++;
          } else if (response.ok) {
            sent++;
          } else {
            console.error(`[Push] Failed for token ${sub.deviceToken.substring(0, 10)}:`, await response.text());
            failed++;
          }
        } catch (err) {
          console.error(`[Push] Error sending to ${sub.deviceToken.substring(0, 10)}:`, err);
          failed++;
        }
      }

      return { sent, failed };
    } catch (error) {
      console.error("[Push] sendPushNotification error:", error);
      return { sent: 0, failed: 0 };
    }
  },
});

// ============================================
// HELPERS
// ============================================

function getEmailSubject(templateType: string, templateData: any): string {
  switch (templateType) {
    case "notification_approval_request":
      return `[Action Required] Expense claim requires your approval`;
    case "notification_approval_status":
      return `Your expense claim has been ${templateData?.status || "updated"}`;
    case "notification_critical_anomaly":
      return `[Critical] Anomaly detected: ${templateData?.title || "Financial anomaly"}`;
    case "notification_digest":
      return `Your notification digest - ${new Date().toLocaleDateString()}`;
    case "notification_lhdn_status_change":
      return `[LHDN] ${templateData?.title || "E-Invoice status changed"}`;
    default:
      return "Notification from Groot Finance";
  }
}

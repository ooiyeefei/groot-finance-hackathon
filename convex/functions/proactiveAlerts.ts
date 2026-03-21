/**
 * Proactive Alerts — Push Action Center insights to chat
 *
 * When high/critical insights are created, this module:
 * 1. Finds or creates a system conversation for the user
 * 2. Creates a system message with proactive_alert action card
 * 3. Batches 3+ alerts in a 5-minute window into a summary
 * 4. Sends mobile push for critical alerts
 * 5. Tracks delivery in proactive_alert_delivery table
 */

import { v } from "convex/values";
import { query, mutation, internalMutation, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveUserByClerkId } from "../lib/resolvers";
import { type Id } from "../_generated/dataModel";

const BATCH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const BATCH_THRESHOLD = 3;
const BADGE_CAP = 20;

// ============================================
// CORE: Push insight to chat
// ============================================

export const pushToChat = internalMutation({
  args: {
    insightId: v.string(),
    userId: v.string(),
    businessId: v.string(),
    category: v.string(),
    priority: v.union(v.literal("critical"), v.literal("high")),
    title: v.string(),
    description: v.string(),
    recommendedAction: v.string(),
    affectedEntities: v.array(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Resolve userId — actionCenterInsights stores Clerk userId string,
    // but conversations/messages use Convex user _id
    const userDoc = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("clerkUserId"), args.userId))
      .first();

    if (!userDoc) {
      console.log(`[ProactiveAlerts] User not found for clerkId: ${args.userId}`);
      return { delivered: false, batched: false };
    }

    const userId = userDoc._id;
    const businessId = args.businessId as Id<"businesses">;

    // Find or create system conversation for this user+business
    const conversation = await findOrCreateAlertConversation(ctx, userId, businessId);

    // Check batching window: count recent deliveries in last 5 minutes
    const windowStart = now - BATCH_WINDOW_MS;
    const recentDeliveries = await ctx.db
      .query("proactive_alert_delivery")
      .withIndex("by_user_business", (q) =>
        q.eq("userId", userId).eq("businessId", businessId)
      )
      .filter((q) => q.gte(q.field("deliveredAt"), windowStart))
      .collect();

    const pendingCount = recentDeliveries.length;

    if (pendingCount >= BATCH_THRESHOLD - 1) {
      // This is the 3rd+ alert in the window — batch them
      return await createBatchedAlert(ctx, {
        ...args,
        userId,
        businessId,
        conversationId: conversation._id,
        recentDeliveries,
        now,
      });
    }

    // Individual delivery
    const messageId = await createAlertMessage(ctx, {
      conversationId: conversation._id,
      insightId: args.insightId,
      category: args.category,
      priority: args.priority,
      title: args.title,
      description: args.description,
      recommendedAction: args.recommendedAction,
      affectedEntities: args.affectedEntities,
      now,
    });

    // Record delivery
    await ctx.db.insert("proactive_alert_delivery", {
      insightId: args.insightId,
      userId,
      businessId,
      conversationId: conversation._id,
      messageId,
      priority: args.priority,
      category: args.category,
      status: "delivered",
      deliveredAt: now,
    });

    // Schedule mobile push for critical alerts
    if (args.priority === "critical") {
      const pushSubs = await ctx.db
        .query("push_subscriptions")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .filter((q) => q.eq(q.field("isActive"), true))
        .collect();

      if (pushSubs.length > 0) {
        // @ts-ignore — Convex type instantiation depth limit (new module)
        await ctx.scheduler.runAfter(0, internal.functions.proactiveAlerts.sendMobilePush, {
          devices: pushSubs.map((s) => ({ token: s.deviceToken, platform: s.platform })),
          title: `Critical: ${args.title}`,
          body: args.description.substring(0, 200),
          conversationId: conversation._id.toString(),
        });
      }
    }

    console.log(`[ProactiveAlerts] Delivered alert for insight ${args.insightId} to user ${userId}`);
    return { delivered: true, batched: false, messageId: messageId.toString() };
  },
});

// ============================================
// ACTIONS: Investigate / Dismiss
// ============================================

export const handleAction = mutation({
  args: {
    messageId: v.id("messages"),
    action: v.union(v.literal("investigate"), v.literal("dismiss")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");

    const meta = message.metadata as Record<string, unknown> | undefined;
    if (!meta || meta.type !== "proactive_alert") {
      throw new Error("Not a proactive alert message");
    }

    const now = Date.now();

    if (args.action === "dismiss") {
      // Update message metadata
      await ctx.db.patch(args.messageId, {
        metadata: { ...meta, dismissed: true, dismissedAt: now },
      });

      // Update the linked insight status
      const insightId = meta.insightId as string;
      if (insightId) {
        try {
          const insightDocId = insightId as Id<"actionCenterInsights">;
          const insight = await ctx.db.get(insightDocId);
          if (insight && insight.status !== "dismissed") {
            await ctx.db.patch(insightDocId, {
              status: "dismissed",
              dismissedAt: now,
            });
          }
        } catch {
          // insightId might be a string ID, not a Convex ID — skip
          console.warn(`[ProactiveAlerts] Could not update insight ${insightId}`);
        }
      }

      // Update delivery record
      const delivery = await ctx.db
        .query("proactive_alert_delivery")
        .withIndex("by_insight", (q) => q.eq("insightId", insightId))
        .first();
      if (delivery) {
        await ctx.db.patch(delivery._id, { status: "dismissed", interactedAt: now });
      }
    } else if (args.action === "investigate") {
      // Update message metadata
      await ctx.db.patch(args.messageId, {
        metadata: { ...meta, investigated: true },
      });

      // Update delivery record
      const insightId = meta.insightId as string;
      const delivery = await ctx.db
        .query("proactive_alert_delivery")
        .withIndex("by_insight", (q) => q.eq("insightId", insightId))
        .first();
      if (delivery) {
        await ctx.db.patch(delivery._id, { status: "investigated", interactedAt: now });
      }

      // Insert a user-like message that the AI agent can respond to
      const alertTitle = meta.title as string || "this alert";
      const alertCategory = meta.category as string || "unknown";
      const alertDescription = meta.description as string || "";

      await ctx.db.insert("messages", {
        conversationId: message.conversationId,
        role: "user",
        content: `Investigate this ${alertCategory} alert: "${alertTitle}". ${alertDescription}`,
        metadata: {
          type: "investigate_alert",
          sourceInsightId: insightId,
          autoGenerated: true,
        },
        updatedAt: now,
      });

      // Update conversation preview
      const conversation = await ctx.db.get(message.conversationId);
      if (conversation) {
        await ctx.db.patch(conversation._id, {
          lastMessageContent: `Investigate this ${alertCategory} alert: "${alertTitle}"`.substring(0, 200),
          lastMessageRole: "user",
          lastMessageAt: now,
          messageCount: (conversation.messageCount ?? 0) + 1,
          updatedAt: now,
        });
      }
    }

    return { success: true };
  },
});

// ============================================
// QUERY: Unread badge count
// ============================================

export const getUnreadCount = query({
  args: {
    businessId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity || !args.businessId) return { count: 0, capped: false };

      const user = await resolveUserByClerkId(ctx.db, identity.subject);
      if (!user) return { count: 0, capped: false };

      // Count unread proactive alert deliveries (delivered but not interacted)
      const unread = await ctx.db
        .query("proactive_alert_delivery")
        .withIndex("by_user_status", (q) =>
          q.eq("userId", user._id).eq("status", "delivered")
        )
        .collect();

      // Filter to only this business
      const businessUnread = unread.filter(
        (d) => d.businessId.toString() === args.businessId
      );

      const count = businessUnread.length;
      return {
        count: Math.min(count, BADGE_CAP),
        capped: count > BADGE_CAP,
      };
    } catch (error) {
      console.error("[ProactiveAlerts] getUnreadCount error:", error);
      return { count: 0, capped: false };
    }
  },
});

// ============================================
// INTERNAL: Mobile push for critical alerts
// ============================================

export const sendMobilePush = internalAction({
  args: {
    devices: v.array(v.object({ token: v.string(), platform: v.string() })),
    title: v.string(),
    body: v.string(),
    conversationId: v.string(),
  },
  handler: async (_ctx, args) => {
    if (args.devices.length === 0) {
      return { sent: false, deviceCount: 0 };
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://finance.hellogroot.com";
    let sentCount = 0;

    for (const device of args.devices) {
      try {
        const response = await fetch(`${baseUrl}/api/v1/notifications/send-push`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceToken: device.token,
            platform: device.platform,
            title: args.title,
            body: args.body,
            data: {
              screen: "chat",
              conversationId: args.conversationId,
            },
          }),
        });

        if (response.ok) {
          sentCount++;
        } else {
          console.warn(`[ProactiveAlerts] Push failed for device ${device.token}: ${response.status}`);
        }
      } catch (err) {
        console.warn(`[ProactiveAlerts] Push error for device ${device.token}:`, err);
      }
    }

    console.log(`[ProactiveAlerts] Sent ${sentCount}/${args.devices.length} push notifications`);
    return { sent: sentCount > 0, deviceCount: sentCount };
  },
});

// ============================================
// HELPERS
// ============================================

async function findOrCreateAlertConversation(
  ctx: any,
  userId: Id<"users">,
  businessId: Id<"businesses">
) {
  // Find the most recent active conversation for this user+business
  const existing = await ctx.db
    .query("conversations")
    .withIndex("by_userId", (q: any) => q.eq("userId", userId))
    .filter((q: any) =>
      q.and(
        q.eq(q.field("businessId"), businessId),
        q.eq(q.field("isActive"), true)
      )
    )
    .order("desc")
    .first();

  if (existing) return existing;

  // Create a new system-initiated conversation
  const now = Date.now();
  const conversationId = await ctx.db.insert("conversations", {
    userId,
    businessId,
    title: "Groot Alerts",
    isActive: true,
    lastMessageAt: now,
    messageCount: 0,
    updatedAt: now,
  });

  return await ctx.db.get(conversationId);
}

async function createAlertMessage(
  ctx: any,
  args: {
    conversationId: Id<"conversations">;
    insightId: string;
    category: string;
    priority: string;
    title: string;
    description: string;
    recommendedAction: string;
    affectedEntities: string[];
    now: number;
  }
) {
  const content = `**${args.priority === "critical" ? "🚨 Critical" : "⚠️ High Priority"} Alert — ${args.category}**\n\n${args.title}\n\n${args.description}\n\n**Recommended action:** ${args.recommendedAction}`;

  const messageId = await ctx.db.insert("messages", {
    conversationId: args.conversationId,
    role: "system",
    content,
    metadata: {
      type: "proactive_alert",
      insightId: args.insightId,
      category: args.category,
      priority: args.priority,
      title: args.title,
      description: args.description,
      recommendedAction: args.recommendedAction,
      affectedEntities: args.affectedEntities,
      dismissed: false,
      investigated: false,
      actions: [
        {
          type: "proactive_alert_card",
          id: `alert-${args.insightId}`,
          data: {
            insightId: args.insightId,
            category: args.category,
            priority: args.priority,
            title: args.title,
            description: args.description,
            recommendedAction: args.recommendedAction,
            affectedEntities: args.affectedEntities,
          },
        },
      ],
    },
    updatedAt: args.now,
  });

  // Update conversation preview
  const conversation = await ctx.db.get(args.conversationId);
  if (conversation) {
    await ctx.db.patch(args.conversationId, {
      lastMessageContent: content.substring(0, 200),
      lastMessageRole: "system",
      lastMessageAt: args.now,
      messageCount: (conversation.messageCount ?? 0) + 1,
      updatedAt: args.now,
    });
  }

  return messageId;
}

async function createBatchedAlert(
  ctx: any,
  args: {
    insightId: string;
    userId: Id<"users">;
    businessId: Id<"businesses">;
    conversationId: Id<"conversations">;
    category: string;
    priority: "critical" | "high";
    title: string;
    description: string;
    recommendedAction: string;
    affectedEntities: string[];
    recentDeliveries: any[];
    now: number;
    metadata?: any;
  }
) {
  // Collect all insights in this batch (previous + current)
  const batchedInsights = [
    ...args.recentDeliveries.map((d) => ({
      insightId: d.insightId,
      category: d.category,
      priority: d.priority,
    })),
    {
      insightId: args.insightId,
      category: args.category,
      priority: args.priority,
    },
  ];

  const totalCount = batchedInsights.length;
  const criticalCount = batchedInsights.filter((i) => i.priority === "critical").length;

  const content = `**${criticalCount > 0 ? "🚨" : "⚠️"} ${totalCount} Alerts Detected**\n\nMultiple insights require your attention. ${criticalCount > 0 ? `${criticalCount} are critical priority.` : ""}\n\nView all alerts to take action.`;

  const messageId = await ctx.db.insert("messages", {
    conversationId: args.conversationId,
    role: "system",
    content,
    metadata: {
      type: "proactive_alert",
      batchSummary: true,
      batchedInsights,
      dismissed: false,
      investigated: false,
      actions: [
        {
          type: "proactive_alert_card",
          id: `batch-${args.now}`,
          data: {
            batchSummary: true,
            batchedInsights,
            totalCount,
            criticalCount,
          },
        },
      ],
    },
    updatedAt: args.now,
  });

  // Update conversation preview
  const conversation = await ctx.db.get(args.conversationId);
  if (conversation) {
    await ctx.db.patch(args.conversationId, {
      lastMessageContent: content.substring(0, 200),
      lastMessageRole: "system",
      lastMessageAt: args.now,
      messageCount: (conversation.messageCount ?? 0) + 1,
      updatedAt: args.now,
    });
  }

  // Record delivery for the new insight
  await ctx.db.insert("proactive_alert_delivery", {
    insightId: args.insightId,
    userId: args.userId,
    businessId: args.businessId,
    conversationId: args.conversationId,
    messageId,
    priority: args.priority,
    category: args.category,
    status: "batched",
    deliveredAt: args.now,
  });

  // Update previous deliveries to point to the batch message
  for (const delivery of args.recentDeliveries) {
    await ctx.db.patch(delivery._id, { status: "batched", messageId });
  }

  // Critical push for batch with critical items
  if (criticalCount > 0) {
    const pushSubs = await ctx.db
      .query("push_subscriptions")
      .withIndex("by_userId", (q: any) => q.eq("userId", args.userId))
      .filter((q: any) => q.eq(q.field("isActive"), true))
      .collect();

    if (pushSubs.length > 0) {
      // @ts-ignore — Convex type instantiation depth limit (new module)
      await ctx.scheduler.runAfter(0, internal.functions.proactiveAlerts.sendMobilePush, {
        devices: pushSubs.map((s: any) => ({ token: s.deviceToken, platform: s.platform })),
        title: `${totalCount} Alerts (${criticalCount} critical)`,
        body: "Multiple financial alerts require your attention.",
        conversationId: args.conversationId.toString(),
      });
    }
  }

  console.log(`[ProactiveAlerts] Batched ${totalCount} alerts for user ${args.userId}`);
  return { delivered: true, batched: true, messageId: messageId.toString() };
}

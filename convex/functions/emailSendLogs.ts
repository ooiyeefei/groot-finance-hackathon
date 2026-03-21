/**
 * Email Send Logs — Audit + Rate Limiting (031-chat-cross-biz-voice)
 *
 * Tracks financial report emails sent via the chat agent.
 * Used for audit trail (FR-007) and daily rate limiting (FR-007a: 50/business/day).
 *
 * NOTE: Using public mutation/query (not internal) because the MCP server Lambda
 * calls these via ConvexHttpClient which can only access public functions.
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";

/**
 * Create a new email send log entry.
 * Called by MCP server after successfully sending an email.
 */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    userId: v.string(),
    userRole: v.string(),
    reportType: v.string(),
    recipients: v.array(v.string()),
    subject: v.string(),
    status: v.string(),
    sesMessageId: v.optional(v.string()),
    sentAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("email_send_logs", args);
  },
});

/**
 * Count emails sent by a business today (UTC).
 * Used for rate limiting: max 50 emails per business per day.
 */
export const countTodayByBusiness = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const now = new Date();
    const startOfDayUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    ).getTime();

    const logs = await ctx.db
      .query("email_send_logs")
      .withIndex("by_business_date", (q) =>
        q.eq("businessId", args.businessId).gte("sentAt", startOfDayUTC)
      )
      .collect();

    return logs.length;
  },
});

/**
 * Get email send logs for a business (audit trail).
 */
export const getByBusiness = query({
  args: {
    businessId: v.id("businesses"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    return await ctx.db
      .query("email_send_logs")
      .withIndex("by_business_date", (q) =>
        q.eq("businessId", args.businessId)
      )
      .order("desc")
      .take(limit);
  },
});

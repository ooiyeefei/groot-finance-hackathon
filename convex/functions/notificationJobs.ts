/**
 * Notification Jobs - Digest aggregation and sending
 *
 * Handles the scheduled digest email workflow:
 * 1. Query all businesses
 * 2. For each business, find users with digest enabled
 * 3. Query unread notifications since last digest
 * 4. Group by category and send digest email
 * 5. Update notification_digests record
 */

import { v } from "convex/values";
import { internalMutation, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

// Default notification preferences for digest
const DEFAULT_DIGEST_FREQUENCY = "daily";

/**
 * Main digest cron job entry point
 * Runs daily at 8:00 AM UTC
 */
export const runDigest = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Get all active business memberships to find users
    // We process per-user rather than per-business for efficiency
    const allUsers = await ctx.db.query("users").collect();

    let digestsSent = 0;
    let digestsSkipped = 0;

    for (const user of allUsers) {
      // Check if user has digest enabled
      const prefs = user.notificationPreferences;
      const digestFrequency = prefs?.digestFrequency ?? DEFAULT_DIGEST_FREQUENCY;

      // Check if it's time for this user's digest
      // Daily: always send
      // Weekly: only send on Mondays (day 1)
      const today = new Date();
      if (digestFrequency === "weekly" && today.getUTCDay() !== 1) {
        continue;
      }

      // Get user's active business memberships
      const memberships = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();

      const activeMemberships = memberships.filter((m) => m.status === "active");

      for (const membership of activeMemberships) {
        // Get last digest timestamp for this user+business
        const digestRecord = await ctx.db
          .query("notification_digests")
          .withIndex("by_userId_businessId", (q) =>
            q.eq("userId", user._id).eq("businessId", membership.businessId)
          )
          .first();

        const lastDigestAt = digestRecord?.lastDigestSentAt ?? 0;

        // Query unread notifications since last digest
        const notifications = await ctx.db
          .query("notifications")
          .withIndex("by_recipient_business_status", (q) =>
            q
              .eq("recipientUserId", user._id)
              .eq("businessId", membership.businessId)
              .eq("status", "unread")
          )
          .collect();

        // Filter to only those created after last digest
        const newNotifications = notifications.filter((n) => n.createdAt > lastDigestAt);

        if (newNotifications.length === 0) {
          digestsSkipped++;
          continue;
        }

        // Check email preferences
        const globalUnsubscribe = user.emailPreferences?.globalUnsubscribe ?? false;
        if (globalUnsubscribe) {
          digestsSkipped++;
          continue;
        }

        // Group notifications by type
        const grouped: Record<string, typeof newNotifications> = {};
        for (const n of newNotifications) {
          if (!grouped[n.type]) grouped[n.type] = [];
          grouped[n.type].push(n);
        }

        // Build category groups HTML for the email template
        let categoryGroupsHtml = "";
        const typeLabels: Record<string, string> = {
          approval: "Approval Requests",
          anomaly: "Anomaly Alerts",
          compliance: "Compliance Warnings",
          insight: "AI Insights",
          invoice_processing: "Invoice Processing",
        };

        for (const [type, items] of Object.entries(grouped)) {
          categoryGroupsHtml += `<div class="category-section">`;
          categoryGroupsHtml += `<div class="category-header">${typeLabels[type] || type} (${items.length})</div>`;
          for (const item of items.slice(0, 5)) {
            categoryGroupsHtml += `<div class="notification-row">`;
            categoryGroupsHtml += `<span class="notification-title">${item.title}</span>`;
            categoryGroupsHtml += `</div>`;
          }
          if (items.length > 5) {
            categoryGroupsHtml += `<div class="notification-row">`;
            categoryGroupsHtml += `<span class="notification-title">... and ${items.length - 5} more</span>`;
            categoryGroupsHtml += `</div>`;
          }
          categoryGroupsHtml += `</div>`;
        }

        // Schedule digest email send
        await ctx.scheduler.runAfter(0, internal.functions.notifications.sendTransactionalEmail, {
          notificationId: newNotifications[0]._id, // Reference first notification
          recipientEmail: user.email,
          recipientName: user.fullName || user.email,
          templateType: "notification_digest",
          templateData: {
            recipientName: user.fullName || user.email,
            digestPeriod: digestFrequency === "daily" ? "Daily" : "Weekly",
            totalCount: String(newNotifications.length),
            categoryGroups: categoryGroupsHtml,
            dashboardUrl: `${process.env.APP_URL || "https://finance.hellogroot.com"}/en/dashboard`,
            title: `Your ${digestFrequency} notification digest`,
            body: `You have ${newNotifications.length} unread notifications.`,
            resourceUrl: `${process.env.APP_URL || "https://finance.hellogroot.com"}/en/dashboard`,
          },
          userId: user._id,
        });

        // Update or create notification_digests record
        if (digestRecord) {
          await ctx.db.patch(digestRecord._id, {
            lastDigestSentAt: now,
            notificationCount: newNotifications.length,
          });
        } else {
          await ctx.db.insert("notification_digests", {
            userId: user._id,
            businessId: membership.businessId,
            lastDigestSentAt: now,
            notificationCount: newNotifications.length,
          });
        }

        digestsSent++;
      }
    }

    console.log(`[Notification Digest] Sent: ${digestsSent}, Skipped: ${digestsSkipped}`);
    return { sent: digestsSent, skipped: digestsSkipped };
  },
});

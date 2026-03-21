/**
 * Weekly Email Digest Jobs
 *
 * Called by EventBridge → Lambda (weekly-email-digest module).
 * Generates and sends weekly summary emails to business owners/finance admins.
 *
 * Content: Top 5 Action Center insights, cash flow summary, overdue invoices.
 * Skip businesses with zero insights in the past week.
 */

import { internalAction, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Gather weekly digest data for all businesses
 */
export const getWeeklyDigestData = internalQuery({
  args: {},
  handler: async (ctx) => {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Get all active businesses
    const businesses = await ctx.db.query("businesses").collect();

    const digestData = [];

    for (const business of businesses) {
      // Get insights from the past 7 days
      const insights = await ctx.db
        .query("actionCenterInsights")
        .withIndex("by_business_priority", (q) =>
          q.eq("businessId", business._id.toString())
        )
        .filter((q) => q.gte(q.field("detectedAt"), oneWeekAgo))
        .collect();

      // Skip businesses with zero insights
      if (insights.length === 0) continue;

      // Sort by priority (critical first) then by detectedAt (newest first)
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const sortedInsights = insights
        .sort((a, b) => {
          const pDiff = (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
          if (pDiff !== 0) return pDiff;
          return b.detectedAt - a.detectedAt;
        })
        .slice(0, 5); // Top 5

      // Get overdue invoices count (AP invoices with unpaid status past due)
      const allInvoices = await ctx.db
        .query("invoices")
        .withIndex("by_businessId", (q) =>
          q.eq("businessId", business._id)
        )
        .filter((q) =>
          q.eq(q.field("paymentStatus"), "unpaid")
        )
        .collect();

      const today = new Date().toISOString().split("T")[0];
      const overdueInvoices = allInvoices.filter((inv) => {
        const dueDate = inv.dueDate as string | undefined;
        return dueDate && dueDate < today;
      });

      // Sum paid amounts (paidAmount tracks what's been paid; for unpaid, the total is in extractedData)
      const overdueTotal = overdueInvoices.reduce((sum, inv) => {
        const extracted = inv.extractedData as Record<string, unknown> | undefined;
        const amount = (extracted?.totalAmount as number) || (extracted?.total as number) || 0;
        return sum + amount;
      }, 0);

      // Get eligible recipients (owner + finance_admin roles)
      const memberships = await ctx.db
        .query("business_memberships")
        .withIndex("by_businessId", (q) =>
          q.eq("businessId", business._id)
        )
        .filter((q) =>
          q.and(
            q.eq(q.field("status"), "active"),
            q.or(
              q.eq(q.field("role"), "owner"),
              q.eq(q.field("role"), "finance_admin")
            )
          )
        )
        .collect();

      const recipientIds = memberships.map((m) => m.userId);
      const recipients = [];

      for (const userId of recipientIds) {
        const user = await ctx.db.get(userId);
        if (user?.email) {
          // Check email digest preference (stored on user document)
          const emailPrefs = (user as any).emailPreferences;
          const notifPrefs = (user as any).notificationPreferences;

          // Skip if globally unsubscribed
          if (emailPrefs?.globalUnsubscribe === true) continue;

          // Skip if insight email notifications are explicitly disabled
          const insightEmailEnabled = notifPrefs?.email?.insight !== false;
          const digestEnabled = insightEmailEnabled;

          if (digestEnabled) {
            recipients.push({
              userId: userId.toString(),
              email: user.email,
              name: user.fullName || user.email,
            });
          }
        }
      }

      if (recipients.length === 0) continue;

      digestData.push({
        businessId: business._id.toString(),
        businessName: (business as any).name || "Your Business",
        currency: (business as any).defaultCurrency || "MYR",
        insights: sortedInsights.map((i) => ({
          title: i.title,
          description: i.description,
          category: i.category,
          priority: i.priority,
          detectedAt: i.detectedAt,
        })),
        overdueInvoiceCount: overdueInvoices.length,
        overdueInvoiceTotal: overdueTotal,
        totalInsightsThisWeek: insights.length,
        recipients,
      });
    }

    return digestData;
  },
});

/**
 * Run weekly email digest for all active businesses
 */
export const runWeeklyDigest: ReturnType<typeof internalAction> = internalAction({
  args: {},
  handler: async (ctx) => {
    const startTime = Date.now();
    console.log("[EmailDigest] Weekly digest job started");

    // Get aggregated data for all businesses
    const digestData = await ctx.runQuery(
      // @ts-ignore — Convex type instantiation depth limit (new query, types not yet generated)
      internal.functions.emailDigestJobs.getWeeklyDigestData,
      {}
    );

    let emailsSent = 0;
    const apiUrl = process.env.APP_URL || "https://finance.hellogroot.com";

    for (const business of digestData) {
      for (const recipient of business.recipients) {
        try {
          const response = await fetch(`${apiUrl}/api/v1/notifications/send-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": process.env.INTERNAL_API_KEY || process.env.MCP_INTERNAL_SERVICE_KEY || "",
            },
            body: JSON.stringify({
              to: recipient.email,
              subject: `Weekly Finance Digest — ${business.businessName}`,
              templateType: "weekly_digest",
              templateData: {
                recipientName: recipient.name,
                businessName: business.businessName,
                currency: business.currency,
                insights: business.insights,
                totalInsightsThisWeek: business.totalInsightsThisWeek,
                overdueInvoiceCount: business.overdueInvoiceCount,
                overdueInvoiceTotal: business.overdueInvoiceTotal,
                weekEndDate: new Date().toISOString().split("T")[0],
                appUrl: apiUrl,
                unsubscribeUrl: `${apiUrl}/api/v1/unsubscribe?userId=${recipient.userId}`,
              },
              unsubscribeToken: recipient.userId,
            }),
          });

          if (response.ok) {
            emailsSent++;
          } else {
            const errorText = await response.text();
            console.error(
              `[EmailDigest] Failed to send to ${recipient.email}: ${errorText}`
            );
          }
        } catch (err) {
          console.error(
            `[EmailDigest] Error sending to ${recipient.email}:`,
            err
          );
        }
      }
    }

    const durationMs = Date.now() - startTime;
    console.log(
      `[EmailDigest] Complete: ${digestData.length} businesses, ${emailsSent} emails in ${durationMs}ms`
    );

    return {
      businessesProcessed: digestData.length,
      emailsSent,
      durationMs,
    };
  },
});

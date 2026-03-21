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
      // Build styled HTML digest email
      const weekDate = new Date().toISOString().split("T")[0];

      const priorityColors: Record<string, { bg: string; text: string; label: string }> = {
        critical: { bg: "#fef2f2", text: "#dc2626", label: "CRITICAL" },
        high: { bg: "#fffbeb", text: "#d97706", label: "HIGH" },
        medium: { bg: "#eff6ff", text: "#2563eb", label: "MEDIUM" },
        low: { bg: "#f0fdf4", text: "#16a34a", label: "LOW" },
      };

      const insightCards = business.insights.map((i: any) => {
        const p = priorityColors[i.priority] || priorityColors.medium;
        const desc = i.description.length > 150 ? i.description.substring(0, 150) + "..." : i.description;
        return `<div style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:12px;overflow:hidden;">
          <div style="padding:12px 16px;display:flex;align-items:center;gap:8px;">
            <span style="background:${p.bg};color:${p.text};font-size:10px;font-weight:600;padding:2px 8px;border-radius:10px;">${p.label}</span>
            <span style="color:#6b7280;font-size:12px;text-transform:capitalize;">${i.category}</span>
          </div>
          <div style="padding:0 16px 12px;">
            <p style="color:#111827;font-size:14px;font-weight:600;margin:0 0 4px;">${i.title}</p>
            <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:0;">${desc}</p>
          </div>
        </div>`;
      }).join("");

      const overdueSection = business.overdueInvoiceCount > 0
        ? `<div style="display:flex;gap:24px;margin-top:8px;">
            <div>
              <p style="color:#6b7280;font-size:12px;margin:0;">Overdue Invoices</p>
              <p style="color:#dc2626;font-size:20px;font-weight:700;margin:4px 0 0;">${business.overdueInvoiceCount}</p>
            </div>
            <div>
              <p style="color:#6b7280;font-size:12px;margin:0;">Total Overdue</p>
              <p style="color:#dc2626;font-size:20px;font-weight:700;margin:4px 0 0;">${business.currency} ${business.overdueInvoiceTotal.toLocaleString()}</p>
            </div>
          </div>`
        : `<p style="color:#16a34a;font-size:14px;margin:8px 0 0;">No overdue invoices</p>`;

      for (const recipient of business.recipients) {
        try {
          const unsubUrl = `${apiUrl}/api/v1/unsubscribe?userId=${recipient.userId}`;
          const htmlBody = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>Weekly Finance Digest</title></head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:12px 12px 0 0;padding:24px;">
      <h1 style="color:#ffffff;font-size:20px;margin:0;">Weekly Finance Digest</h1>
      <p style="color:#bfdbfe;font-size:13px;margin:6px 0 0;">${business.businessName} &middot; Week ending ${weekDate}</p>
    </div>

    <!-- Main Content -->
    <div style="background:#ffffff;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">
      <!-- Greeting -->
      <div style="padding:20px 24px 8px;">
        <p style="color:#374151;font-size:14px;margin:0;">Hi ${recipient.name},</p>
        <p style="color:#6b7280;font-size:13px;margin:6px 0 0;">Here's your weekly financial summary with ${business.totalInsightsThisWeek} insight${business.totalInsightsThisWeek !== 1 ? "s" : ""} detected.</p>
      </div>

      <!-- Insights Section -->
      <div style="padding:16px 24px;">
        <h2 style="color:#111827;font-size:15px;font-weight:600;margin:0 0 12px;display:flex;align-items:center;gap:6px;">
          Top ${business.insights.length} Insights
        </h2>
        ${insightCards}
        ${business.totalInsightsThisWeek > business.insights.length
          ? `<p style="color:#6b7280;font-size:12px;margin:4px 0 0;">+${business.totalInsightsThisWeek - business.insights.length} more insights in your Action Center</p>`
          : ""}
      </div>

      <!-- Overdue Invoices Section -->
      <div style="padding:16px 24px;border-top:1px solid #f3f4f6;">
        <h2 style="color:#111827;font-size:15px;font-weight:600;margin:0 0 4px;">Accounts Payable</h2>
        ${overdueSection}
      </div>

      <!-- CTA -->
      <div style="padding:20px 24px;text-align:center;">
        <a href="${apiUrl}/en" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:14px;font-weight:600;padding:12px 32px;border-radius:8px;text-decoration:none;">Open Groot Finance</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:20px 0;color:#9ca3af;font-size:11px;">
      <p style="margin:0;">Groot Finance — Financial Co-pilot for Southeast Asian SMEs</p>
      <p style="margin:8px 0 0;"><a href="${unsubUrl}" style="color:#9ca3af;">Unsubscribe</a></p>
    </div>
  </div>
</body>
</html>`;

          const textBody = `Hi ${recipient.name},\n\nWeekly Finance Digest — ${business.businessName}\nWeek ending ${weekDate}\n\n${business.insights.map((i: any, idx: number) => `${idx + 1}. [${i.priority.toUpperCase()}] ${i.title}\n   ${i.description.substring(0, 120)}`).join("\n\n")}\n\nOverdue invoices: ${business.overdueInvoiceCount}\nTotal overdue: ${business.currency} ${business.overdueInvoiceTotal.toLocaleString()}\n\nView details: ${apiUrl}/en`;

          const response = await fetch(`${apiUrl}/api/v1/notifications/send-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": process.env.INTERNAL_API_KEY || process.env.MCP_INTERNAL_SERVICE_KEY || "",
            },
            body: JSON.stringify({
              to: recipient.email,
              subject: `Weekly Finance Digest — ${business.businessName}`,
              templateType: "raw_html",
              templateData: { htmlBody, textBody },
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

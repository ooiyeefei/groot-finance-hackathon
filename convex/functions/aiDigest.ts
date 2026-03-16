/**
 * Daily AI Intelligence Digest
 *
 * Aggregates AI activity across AR matching, bank recon, and fee classification
 * for the last 24 hours. Sends a "Senior Accountant Summary" email at 6 PM local.
 *
 * Bridge Pattern: Queries existing scattered tables (sales_orders, bank_transactions,
 * corrections) and normalizes into a common shape. When ai_traces table is built,
 * only gatherAIActivity() needs to change.
 *
 * Email delivery via existing SES infrastructure (notifications.hellogroot.com).
 */

import { v } from "convex/values";
import { internalAction, internalQuery } from "../_generated/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _internal: any = require("../_generated/api").internal;

// Time saved estimates per feature (seconds)
const TIME_SAVED = {
  ar_matching: 120,     // 2 min per manual AR match
  bank_recon: 90,       // 1.5 min per bank classification
  fee_classification: 60, // 1 min per fee classification
  auto_agent: 300,      // 5 min saved by full auto-approval (match + review + post)
};

interface NormalizedActivity {
  totalAiActions: number;
  tier1Count: number;
  tier2Count: number;
  autoApprovedCount: number;
  correctedCount: number;
  pendingReviewCount: number;
  totalTimeSavedSeconds: number;
  autonomyRate: number; // percentage
  featureBreakdown: {
    ar: { total: number; matched: number; pending: number };
    bank: { total: number; classified: number; pending: number };
    fee: { total: number; classified: number };
  };
  topPendingItems: Array<{
    id: string;
    type: string;
    description: string;
    confidence: number;
    deepLink: string;
  }>;
  trustedAliases: number;
  totalCorrections: number;
  newCorrectionsToday: number;
  // 001-surface-automation-rate: Milestone achievements in last 24h
  milestoneAchievements?: Array<{
    threshold: number;  // 90, 95, 99
    achievedAt: number; // Unix timestamp
  }>;
}

/**
 * Gather AI activity from existing tables for the last 24 hours.
 * Bridge query — will be replaced by ai_traces when that table is built.
 */
export const gatherAIActivity = internalQuery({
  args: {
    businessId: v.string(),
    sinceTimestamp: v.number(),
  },
  handler: async (ctx, args): Promise<NormalizedActivity> => {
    const since = args.sinceTimestamp;

    // ── AR Matching Activity ──
    const allOrders = await ctx.db
      .query("sales_orders")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId as any))
      .collect();

    const recentOrders = allOrders.filter((o) => o.updatedAt > since);
    const arTier1 = recentOrders.filter((o) => o.aiMatchTier === 1).length;
    const arTier2 = recentOrders.filter((o) => o.aiMatchTier === 2).length;
    const arAutoApproved = recentOrders.filter((o) => o.aiMatchStatus === "auto_approved").length;
    const arApproved = recentOrders.filter((o) => o.aiMatchStatus === "approved").length;
    const arPending = recentOrders.filter((o) => o.aiMatchStatus === "pending_review").length;
    const arCorrected = recentOrders.filter((o) => o.aiMatchStatus === "corrected").length;

    // Top pending AR items for exceptions list
    const pendingOrders = recentOrders
      .filter((o) => o.aiMatchStatus === "pending_review" && o.aiMatchSuggestions?.length)
      .sort((a, b) => (a.aiMatchSuggestions?.[0]?.confidence ?? 0) - (b.aiMatchSuggestions?.[0]?.confidence ?? 0))
      .slice(0, 3);

    const topPendingItems = pendingOrders.map((o) => ({
      id: o._id.toString(),
      type: "ar_matching",
      description: `${o.orderReference} — ${o.customerName ?? "Unknown"} — ${o.grossAmount.toFixed(2)} ${o.currency}`,
      confidence: o.aiMatchSuggestions?.[0]?.confidence ?? 0,
      deepLink: `/en/sales-invoices?tab=ar-recon&orderId=${o._id}`,
    }));

    // ── Bank Recon Activity ──
    let bankClassified = 0;
    let bankPending = 0;
    let bankTotal = 0;
    try {
      const bankTxns = await ctx.db
        .query("bank_transactions")
        .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId as any))
        .collect();

      const recentBankTxns = bankTxns.filter((t) => {
        const updatedAt = (t as any).updatedAt ?? (t as any).createdAt ?? 0;
        return updatedAt > since;
      });

      bankTotal = recentBankTxns.length;
      bankClassified = recentBankTxns.filter((t) => (t as any).classificationTier === 2 && (t as any).suggestedDebitAccountCode).length;
      bankPending = recentBankTxns.filter((t) => (t as any).classificationTier === 2 && !(t as any).confirmedAt).length;
    } catch {
      // Bank tables might not exist on all branches
    }

    // ── Fee Classification Activity ──
    let feeTotal = 0;
    let feeClassified = 0;
    const recentFeeOrders = recentOrders.filter((o) => o.classifiedFees && o.classifiedFees.length > 0);
    for (const order of recentFeeOrders) {
      const fees = order.classifiedFees ?? [];
      feeTotal += fees.length;
      feeClassified += fees.filter((f) => f.tier === 2).length;
    }

    // ── Corrections (Learning Progress) ──
    const allCorrections = await ctx.db
      .query("order_matching_corrections")
      .withIndex("by_businessId_createdAt", (q) =>
        q.eq("businessId", args.businessId as any)
      )
      .collect();

    const totalCorrections = allCorrections.length;
    const newCorrectionsToday = allCorrections.filter((c) => c.createdAt > since).length;
    const trustedAliases = new Set(
      allCorrections.map((c) => c.correctedInvoiceCustomerName.toLowerCase().trim())
    ).size;

    // ── Aggregate Metrics ──
    const totalAiActions = arTier1 + arTier2 + bankClassified + feeClassified;
    const successfulActions = arTier1 + arApproved + arAutoApproved + bankClassified + feeClassified;
    const autonomyRate = totalAiActions > 0 ? (successfulActions / totalAiActions) * 100 : 0;

    const totalTimeSavedSeconds =
      (arTier1 + arApproved) * TIME_SAVED.ar_matching +
      arAutoApproved * TIME_SAVED.auto_agent +
      bankClassified * TIME_SAVED.bank_recon +
      feeClassified * TIME_SAVED.fee_classification;

    return {
      totalAiActions,
      tier1Count: arTier1,
      tier2Count: arTier2 + bankClassified + feeClassified,
      autoApprovedCount: arAutoApproved,
      correctedCount: arCorrected,
      pendingReviewCount: arPending + bankPending,
      totalTimeSavedSeconds,
      autonomyRate: Math.round(autonomyRate * 10) / 10,
      featureBreakdown: {
        ar: { total: arTier1 + arTier2, matched: arTier1 + arApproved + arAutoApproved, pending: arPending },
        bank: { total: bankTotal, classified: bankClassified, pending: bankPending },
        fee: { total: feeTotal, classified: feeClassified },
      },
      topPendingItems,
      trustedAliases,
      totalCorrections,
      newCorrectionsToday,
      // 001-surface-automation-rate: Check for milestone achievements in last 24h
      milestoneAchievements: await (async () => {
        const biz: any = await ctx.db.get(args.businessId as any);
        if (!biz?.automationMilestones) return [];
        const achievements: Array<{ threshold: number; achievedAt: number }> = [];
        const m = biz.automationMilestones as any;
        if (m.milestone_90 && m.milestone_90 >= since) achievements.push({ threshold: 90, achievedAt: m.milestone_90 });
        if (m.milestone_95 && m.milestone_95 >= since) achievements.push({ threshold: 95, achievedAt: m.milestone_95 });
        if (m.milestone_99 && m.milestone_99 >= since) achievements.push({ threshold: 99, achievedAt: m.milestone_99 });
        return achievements;
      })(),
    };
  },
});

/**
 * Get businesses that have AI activity and their admin recipients.
 */
export const getDigestRecipients = internalQuery({
  args: {},
  handler: async (ctx) => {
    const businesses = await ctx.db.query("businesses").collect();
    const recipients: Array<{
      businessId: string;
      businessName: string;
      adminEmail: string;
      adminName: string;
      timezone: string;
    }> = [];

    for (const biz of businesses) {
      // Find admin/owner members
      const memberships = await ctx.db
        .query("business_memberships")
        .withIndex("by_businessId", (q) => q.eq("businessId", biz._id))
        .collect();

      const adminMemberships = memberships.filter(
        (m) => (m.role === "finance_admin" || m.role === "owner") && m.status === "active"
      );

      for (const membership of adminMemberships) {
        const user = await ctx.db.get(membership.userId);
        if (!user || !user.email) continue;

        // Check unsubscribe preference
        if (user.emailPreferences?.globalUnsubscribe) continue;

        recipients.push({
          businessId: biz._id.toString(),
          businessName: (biz as any).companyName ?? (biz as any).name ?? "Your Business",
          adminEmail: user.email,
          adminName: user.fullName ?? user.email.split("@")[0],
          timezone: user.preferences?.timezone ?? "Asia/Kuala_Lumpur",
        });
      }
    }

    return recipients;
  },
});

/**
 * Build the digest email HTML.
 */
function buildDigestHTML(
  recipientName: string,
  businessName: string,
  activity: NormalizedActivity,
  dateStr: string,
  baseUrl: string,
): string {
  const hoursSaved = (activity.totalTimeSavedSeconds / 3600).toFixed(1);
  const autonomyRate = activity.autonomyRate.toFixed(0);

  // Build exceptions rows
  const exceptionsHTML = activity.topPendingItems.length > 0
    ? activity.topPendingItems.map((item) => `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 8px 12px; font-size: 13px; color: #374151;">${item.description}</td>
          <td style="padding: 8px 12px; font-size: 13px; text-align: center; color: ${item.confidence >= 0.85 ? '#059669' : item.confidence >= 0.6 ? '#d97706' : '#dc2626'};">${(item.confidence * 100).toFixed(0)}%</td>
          <td style="padding: 8px 12px; text-align: center;"><a href="${baseUrl}${item.deepLink}" style="color: #0891b2; text-decoration: none; font-size: 13px;">Review &rarr;</a></td>
        </tr>
      `).join("")
    : `<tr><td colspan="3" style="padding: 16px; text-align: center; color: #9ca3af; font-size: 13px;">No items need your attention today</td></tr>`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px;">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0891b2 0%, #0e7490 100%); border-radius: 12px 12px 0 0; padding: 24px 32px;">
      <h1 style="margin: 0; color: #fff; font-size: 20px; font-weight: 600;">Groot Intelligence Digest</h1>
      <p style="margin: 4px 0 0; color: rgba(255,255,255,0.8); font-size: 13px;">${businessName} &middot; ${dateStr}</p>
    </div>

    <!-- Hero Metric -->
    <div style="background: #fff; padding: 32px; text-align: center; border-bottom: 1px solid #e5e7eb;">
      <p style="margin: 0; color: #6b7280; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Time Saved Today</p>
      <p style="margin: 8px 0 0; color: #0891b2; font-size: 48px; font-weight: 700; line-height: 1;">${hoursSaved}h</p>
      <p style="margin: 8px 0 0; color: #9ca3af; font-size: 13px;">${activity.totalAiActions} AI actions across ${activity.featureBreakdown.ar.total > 0 ? 'AR' : ''}${activity.featureBreakdown.bank.total > 0 ? ', Bank' : ''}${activity.featureBreakdown.fee.total > 0 ? ', Fee' : ''} modules</p>
    </div>

    <!-- Three Stats -->
    <div style="background: #fff; display: flex; border-bottom: 1px solid #e5e7eb;">
      <div style="flex: 1; padding: 20px; text-align: center; border-right: 1px solid #e5e7eb;">
        <p style="margin: 0; color: #6b7280; font-size: 11px; text-transform: uppercase;">Autonomy Rate</p>
        <p style="margin: 4px 0 0; color: #059669; font-size: 28px; font-weight: 700;">${autonomyRate}%</p>
      </div>
      <div style="flex: 1; padding: 20px; text-align: center; border-right: 1px solid #e5e7eb;">
        <p style="margin: 0; color: #6b7280; font-size: 11px; text-transform: uppercase;">Trusted Suppliers</p>
        <p style="margin: 4px 0 0; color: #0891b2; font-size: 28px; font-weight: 700;">${activity.trustedAliases}</p>
      </div>
      <div style="flex: 1; padding: 20px; text-align: center;">
        <p style="margin: 0; color: #6b7280; font-size: 11px; text-transform: uppercase;">Auto-Approved</p>
        <p style="margin: 4px 0 0; color: #7c3aed; font-size: 28px; font-weight: 700;">${activity.autoApprovedCount}</p>
      </div>
    </div>

    <!-- Exceptions -->
    <div style="background: #fff; padding: 20px 32px;">
      <h2 style="margin: 0 0 12px; color: #374151; font-size: 15px; font-weight: 600;">Needs Your Attention (${activity.pendingReviewCount})</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="border-bottom: 2px solid #e5e7eb;">
            <th style="padding: 8px 12px; text-align: left; font-size: 11px; color: #6b7280; text-transform: uppercase;">Item</th>
            <th style="padding: 8px 12px; text-align: center; font-size: 11px; color: #6b7280; text-transform: uppercase;">Confidence</th>
            <th style="padding: 8px 12px; text-align: center; font-size: 11px; color: #6b7280; text-transform: uppercase;">Action</th>
          </tr>
        </thead>
        <tbody>
          ${exceptionsHTML}
        </tbody>
      </table>
    </div>

    <!-- Milestone Celebrations (001-surface-automation-rate) -->
    ${activity.milestoneAchievements && activity.milestoneAchievements.length > 0 ? activity.milestoneAchievements.map((m) => `
    <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 20px 32px; text-align: center;">
      <p style="margin: 0; color: #fff; font-size: 24px; font-weight: 700;">AI Automation Rate Hit ${m.threshold}%!</p>
      <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">${m.threshold === 99 ? 'Only 1 in 100 documents needs your review!' : m.threshold === 95 ? 'Only 1 in 20 documents needs your review!' : 'Only 1 in 10 documents needs your review!'}</p>
    </div>
    `).join('') : ''}

    <!-- Learning Progress -->
    ${activity.newCorrectionsToday > 0 ? `
    <div style="background: #f0fdfa; padding: 16px 32px; border-top: 1px solid #ccfbf1;">
      <p style="margin: 0; color: #0d9488; font-size: 13px;">
        <strong>Learning:</strong> ${activity.newCorrectionsToday} new correction${activity.newCorrectionsToday > 1 ? 's' : ''} captured today.
        Groot has learned ${activity.totalCorrections} patterns total.
        ${activity.totalCorrections >= 100 ? 'Next MIPROv2 optimization is scheduled.' : `${100 - activity.totalCorrections} more corrections until next AI optimization.`}
      </p>
    </div>
    ` : ''}

    <!-- Footer -->
    <div style="background: #f9fafb; padding: 20px 32px; border-radius: 0 0 12px 12px; text-align: center;">
      <a href="${baseUrl}/en/sales-invoices?tab=ar-recon" style="display: inline-block; background: #0891b2; color: #fff; text-decoration: none; padding: 10px 24px; border-radius: 6px; font-size: 14px; font-weight: 500;">Open Groot Dashboard</a>
      <p style="margin: 16px 0 0; color: #9ca3af; font-size: 11px;">
        This is an automated digest from Groot Finance.
        <a href="${baseUrl}/api/v1/unsubscribe?type=ai_digest" style="color: #9ca3af;">Unsubscribe</a>
      </p>
    </div>

  </div>
</body>
</html>`;
}

/**
 * Generate and send digest for a single business.
 */
export const generateDigestForBusiness = internalAction({
  args: {
    businessId: v.string(),
    recipientEmail: v.string(),
    recipientName: v.string(),
    businessName: v.string(),
  },
  handler: async (ctx, args) => {
    const twentyFourHoursAgo = Date.now() - (24 * 60 * 60 * 1000);

    // Gather activity
    const activity = await ctx.runQuery(
      _internal.functions.aiDigest.gatherAIActivity,
      { businessId: args.businessId, sinceTimestamp: twentyFourHoursAgo }
    ) as NormalizedActivity;

    // Skip if zero activity
    if (activity.totalAiActions === 0) {
      console.log(`[AI Digest] Skipping ${args.businessName}: zero AI activity`);
      return;
    }

    const baseUrl = process.env.APP_URL || "https://finance.hellogroot.com";
    const dateStr = new Date().toLocaleDateString("en-MY", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const html = buildDigestHTML(
      args.recipientName,
      args.businessName,
      activity,
      dateStr,
      baseUrl,
    );

    const hoursSaved = (activity.totalTimeSavedSeconds / 3600).toFixed(1);
    const subject = `Groot saved you ${hoursSaved} hours today — ${activity.totalAiActions} AI actions`;

    // Send via existing email infrastructure
    try {
      const response = await fetch(`${baseUrl}/api/v1/notifications/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.INTERNAL_API_KEY || "",
        },
        body: JSON.stringify({
          to: args.recipientEmail,
          subject,
          html,
          templateType: "ai_digest",
          templateData: { recipientName: args.recipientName },
        }),
      });

      if (!response.ok) {
        console.error(`[AI Digest] Email send failed for ${args.recipientEmail}: ${await response.text()}`);
      } else {
        console.log(`[AI Digest] Sent to ${args.recipientEmail} for ${args.businessName}: ${hoursSaved}h saved, ${activity.totalAiActions} actions`);
      }
    } catch (error) {
      console.error(`[AI Digest] Failed to send for ${args.businessName}:`, error);
    }
  },
});

/**
 * Daily digest runner — called hourly by cron.
 * Checks each business's timezone. If it's 6 PM local, sends the digest.
 */
export const dailyDigest = internalAction({
  args: {},
  handler: async (ctx) => {
    const recipients = await ctx.runQuery(
      _internal.functions.aiDigest.getDigestRecipients,
      {}
    ) as Array<{
      businessId: string;
      businessName: string;
      adminEmail: string;
      adminName: string;
      timezone: string;
    }>;

    const now = new Date();
    let sent = 0;
    let skipped = 0;

    for (const recipient of recipients) {
      // Check if it's 6 PM in the recipient's timezone
      try {
        const localHour = parseInt(
          now.toLocaleString("en-US", {
            timeZone: recipient.timezone,
            hour: "numeric",
            hour12: false,
          })
        );

        // Only send at 6 PM local (18:00)
        // Skip weekends (Saturday=6, Sunday=0)
        const localDay = parseInt(
          now.toLocaleString("en-US", {
            timeZone: recipient.timezone,
            weekday: "narrow",
          }).charAt(0) // This doesn't work for day-of-week detection
        );

        if (localHour !== 18) {
          skipped++;
          continue;
        }

        // Check day of week (skip weekends)
        const dayOfWeek = new Date(
          now.toLocaleString("en-US", { timeZone: recipient.timezone })
        ).getDay();

        if (dayOfWeek === 0 || dayOfWeek === 6) {
          skipped++;
          continue;
        }

        await ctx.runAction(
          _internal.functions.aiDigest.generateDigestForBusiness,
          {
            businessId: recipient.businessId,
            recipientEmail: recipient.adminEmail,
            recipientName: recipient.adminName,
            businessName: recipient.businessName,
          }
        );
        sent++;
      } catch (error) {
        console.error(`[AI Digest] Error processing ${recipient.adminEmail}:`, error);
      }
    }

    console.log(`[AI Digest] Daily run: ${sent} sent, ${skipped} skipped (wrong hour/weekend)`);
  },
});

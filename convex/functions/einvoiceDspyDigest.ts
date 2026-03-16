/**
 * E-Invoice DSPy Weekly Intelligence Digest
 *
 * Cron job (weekly, Monday 9 AM MYT / 1 AM UTC) that:
 * 1. Queries getEinvoiceDspyDashboard for last 7 days
 * 2. Formats a structured email digest
 * 3. Sends to dev+einvoiceMY@hellogroot.com
 *
 * This replaces the need for a live admin dashboard — trend analysis
 * at a weekly cadence is the right granularity for the current scale.
 */

import { internalAction } from "../_generated/server";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const api: any = require("../_generated/api").api;

const DEV_EMAIL = "dev+einvoiceMY@hellogroot.com";

export const sendWeeklyDigest = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("[DSPy Digest] Starting weekly intelligence digest...");

    // Query the dashboard for the last 7 days
    const dashboard = await ctx.runQuery(api.functions.system.getEinvoiceDspyDashboard, {
      dayWindow: 7,
    });

    const { period, tierUsage, failureCategories, gatekeeperStats, moduleVersions, needsAttention } = dashboard;

    // ── Format the email ──
    const lines: string[] = [];

    // Header
    lines.push("E-Invoice DSPy Intelligence — Weekly Digest");
    lines.push(`Period: Last 7 days (${new Date().toISOString().split("T")[0]})`);
    lines.push("=".repeat(55));
    lines.push("");

    // Overall stats
    lines.push("📊 OVERALL");
    lines.push(`  Attempts: ${period.totalAttempts} total, ${period.completedAttempts} completed`);
    lines.push(`  Success Rate: ${period.overallSuccessRate}%`);
    lines.push("");

    // Tier usage
    lines.push("⚡ TIER USAGE");
    const tierEntries = Object.entries(tierUsage as Record<string, { count: number; successes: number; avgCostUsd: number }>);
    if (tierEntries.length > 0) {
      for (const [tier, stats] of tierEntries.sort((a, b) => b[1].count - a[1].count)) {
        const rate = stats.count > 0 ? Math.round((stats.successes / stats.count) * 100) : 0;
        lines.push(`  ${tier}: ${stats.count} attempts, ${rate}% success, avg $${stats.avgCostUsd}/attempt`);
      }
    } else {
      lines.push("  No completed attempts this period.");
    }
    lines.push("");

    // Failure categories
    const failEntries = Object.entries(failureCategories as Record<string, { count: number; merchants: string[] }>);
    if (failEntries.length > 0) {
      lines.push("❌ FAILURE BREAKDOWN");
      for (const [cat, data] of failEntries.sort((a, b) => b[1].count - a[1].count)) {
        const merchantList = data.merchants.slice(0, 3).join(", ");
        const more = data.merchants.length > 3 ? ` +${data.merchants.length - 3} more` : "";
        lines.push(`  ${cat}: ${data.count}x (${merchantList}${more})`);
      }

      // Prompt vs infra recommendation
      const promptCats = ["form_validation", "session", "unknown"];
      const infraCats = ["connectivity", "captcha"];
      const promptCount = failEntries.filter(([c]) => promptCats.includes(c)).reduce((s, [, d]) => s + d.count, 0);
      const infraCount = failEntries.filter(([c]) => infraCats.includes(c)).reduce((s, [, d]) => s + d.count, 0);
      const total = promptCount + infraCount;
      if (total > 0) {
        lines.push("");
        lines.push(`  💡 ${Math.round((promptCount / total) * 100)}% prompt-fixable (DSPy can help)`);
        lines.push(`  🔧 ${Math.round((infraCount / total) * 100)}% infra-fixable (Browserbase/CapSolver)`);
      }
    }
    lines.push("");

    // Gatekeeper stats
    if (gatekeeperStats.totalGated > 0) {
      lines.push("🚦 GATEKEEPER (Tier 0 / 0.5)");
      lines.push(`  Total gated: ${gatekeeperStats.totalGated}`);
      lines.push(`  Proceed→Success: ${gatekeeperStats.proceedSucceeded}`);
      lines.push(`  Proceed→Failed: ${gatekeeperStats.proceedFailed} (overconfident)`);
      lines.push(`  Skipped (→Tier 2): ${gatekeeperStats.skipCount}`);
      if (gatekeeperStats.overconfidentRate !== null) {
        lines.push(`  Overconfident Rate: ${gatekeeperStats.overconfidentRate}%`);
      }
      if (gatekeeperStats.avgConfidence !== null) {
        lines.push(`  Avg Confidence: ${gatekeeperStats.avgConfidence}`);
      }
      lines.push("");
    }

    // DSPy module versions
    const versionEntries = Object.entries(moduleVersions as Record<string, number>);
    if (versionEntries.length > 0) {
      lines.push("🧠 DSPY MODULE VERSIONS");
      for (const [ver, count] of versionEntries.sort((a, b) => b[1] - a[1])) {
        lines.push(`  ${ver}: ${count} invocations`);
      }
      lines.push("");
    }

    // Needs attention
    const attentionList = needsAttention as Array<{
      merchantName: string;
      attempts: number;
      successRate: number;
      topFailure: string;
      isNewMerchant: boolean;
    }>;
    if (attentionList.length > 0) {
      lines.push("🚨 NEEDS ATTENTION");
      for (const m of attentionList.slice(0, 10)) {
        const tag = m.isNewMerchant ? "[NEW] " : "";
        lines.push(`  ${tag}${m.merchantName}: ${m.successRate}% success (${m.attempts} attempts, top failure: ${m.topFailure})`);
      }
      if (attentionList.length > 10) {
        lines.push(`  ... and ${attentionList.length - 10} more`);
      }
      lines.push("");
    }

    // Footer
    lines.push("---");
    lines.push("Automated by E-Invoice DSPy Intelligence Pipeline.");
    lines.push("For real-time data: Convex Dashboard → einvoice_request_logs table.");

    const emailBody = lines.join("\n");
    const subject = `[E-Invoice DSPy] Weekly Digest — ${period.overallSuccessRate}% success, ${attentionList.length} merchants need attention`;

    // Send email
    const apiUrl = process.env.APP_URL || "https://finance.hellogroot.com";
    try {
      await fetch(`${apiUrl}/api/v1/notifications/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.INTERNAL_API_KEY || "",
        },
        body: JSON.stringify({
          to: DEV_EMAIL,
          subject,
          templateType: "plain_text",
          templateData: { body: emailBody },
        }),
      });
      console.log(`[DSPy Digest] Sent weekly digest to ${DEV_EMAIL}: ${period.overallSuccessRate}% success, ${attentionList.length} flagged`);
    } catch (emailErr) {
      console.error("[DSPy Digest] Failed to send email:", emailErr);
    }
  },
});

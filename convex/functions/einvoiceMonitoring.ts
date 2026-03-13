/**
 * E-Invoice Monitoring — Self-Improving System
 *
 * Cron-driven analysis that:
 * 1. Cleans up stale in_progress records (>15 min without callback)
 * 2. Categorizes new failures into error patterns
 * 3. Detects NEW unresolved patterns and emails dev team
 * 4. Tracks resolution status for continuous improvement
 */

import { v } from "convex/values";
import { internalMutation, internalAction, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

// ── Error categorization rules ──
// Order matters: first match wins
const CATEGORY_RULES: Array<{
  category: string;
  fingerprint: string;
  patterns: string[];
}> = [
  {
    category: "browserbase_limit",
    fingerprint: "402_PAYMENT_REQUIRED",
    patterns: ["402", "Payment Required", "Free plan browser minutes"],
  },
  {
    category: "rate_limited",
    fingerprint: "429_TOO_MANY_REQUESTS",
    patterns: ["429", "Too Many Requests", "exceeded your max concurrent"],
  },
  {
    category: "bot_blocked",
    fingerprint: "BOT_BLOCKED_WAF",
    patterns: ["BOT_BLOCKED", "403", "Cloudflare", "WAF"],
  },
  {
    category: "captcha_blocked",
    fingerprint: "CAPTCHA",
    patterns: ["CAPTCHA", "reCAPTCHA", "captcha"],
  },
  {
    category: "infra_bug",
    fingerprint: "PLAYWRIGHT_SYNC",
    patterns: ["Playwright Sync API inside the asyncio"],
  },
  {
    category: "infra_bug",
    fingerprint: "NAME_REF_UNDEFINED",
    patterns: ["name 'ref' is not defined"],
  },
  {
    category: "infra_bug",
    fingerprint: "AGENT_NO_BROWSER",
    patterns: ["'Agent' object has no attribute 'browser'"],
  },
  {
    category: "infra_bug",
    fingerprint: "READ_ONLY_FS",
    patterns: ["Read-only file system"],
  },
  {
    category: "network_error",
    fingerprint: "DNS_NOT_RESOLVED",
    patterns: ["ERR_NAME_NOT_RESOLVED"],
  },
  {
    category: "network_error",
    fingerprint: "SOCKET_NOT_CONNECTED",
    patterns: ["ERR_SOCKET_NOT_CONNECTED"],
  },
  {
    category: "network_error",
    fingerprint: "NAVIGATION_TIMEOUT",
    patterns: ["page.goto: Timeout", "Page.goto: Timeout"],
  },
  {
    category: "gemini_api",
    fingerprint: "GEMINI_ERROR",
    patterns: ["Gemini API error"],
  },
  {
    category: "form_validation",
    fingerprint: "FORM_VALIDATION",
    patterns: [
      "Store Code is required",
      "Invalid Transaction",
      "receipt number",
      "Please fill out this field",
      "Please select and upload",
      "Authentication failed",
      "Please enter a",
    ],
  },
  {
    category: "merchant_logic",
    fingerprint: "FORM_STILL_VISIBLE",
    patterns: ["form is still visible", "same form is still visible", "fields are still editable"],
  },
  {
    category: "merchant_logic",
    fingerprint: "DEDICATED_FLOW_FAILED",
    patterns: ["dedicated flow failed"],
  },
  {
    category: "merchant_logic",
    fingerprint: "MANUAL_ONLY",
    patterns: ["MANUAL_ONLY", "OTP verification"],
  },
];

function categorizeError(errorMessage: string): { category: string; fingerprint: string } {
  for (const rule of CATEGORY_RULES) {
    if (rule.patterns.some((p) => errorMessage.includes(p))) {
      return { category: rule.category, fingerprint: rule.fingerprint };
    }
  }
  return { category: "unknown", fingerprint: "UNKNOWN" };
}

function extractDomain(url: string): string {
  try {
    const match = url.match(/^https?:\/\/([^/]+)/);
    return match ? match[1] : "unknown";
  } catch {
    return "unknown";
  }
}

// ============================================
// STEP 1: Clean up stale in_progress records
// ============================================

export const cleanupStaleRequests = internalMutation({
  args: {},
  handler: async (ctx) => {
    const fifteenMinAgo = Date.now() - 15 * 60 * 1000;
    let cleaned = 0;

    // Find all in_progress request logs older than 15 min
    const staleLogs = await ctx.db
      .query("einvoice_request_logs")
      .filter((q) => q.eq(q.field("status"), "in_progress"))
      .collect();

    for (const log of staleLogs) {
      if (log.startedAt < fifteenMinAgo) {
        // Mark the log as failed
        await ctx.db.patch(log._id, {
          status: "failed" as const,
          errorMessage: "Lambda timeout: no completion callback received within 15 minutes",
          completedAt: Date.now(),
        });

        // Also update the expense claim if still in "requesting"
        const claim = await ctx.db.get(log.expenseClaimId);
        if (claim && claim.einvoiceRequestStatus === "requesting") {
          await ctx.db.patch(claim._id, {
            einvoiceRequestStatus: "failed" as const,
            einvoiceAgentError: "Request timed out. Please try again.",
            updatedAt: Date.now(),
          });
        }

        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[EinvoiceMonitor] Cleaned ${cleaned} stale in_progress records`);
    }
    return { cleaned };
  },
});

// ============================================
// STEP 2: Analyze new failures into patterns
// ============================================

export const analyzeFailurePatterns = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all failed logs from the last 24 hours
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;

    const recentFailures = await ctx.db
      .query("einvoice_request_logs")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "failed"),
          q.gte(q.field("startedAt"), oneDayAgo)
        )
      )
      .collect();

    let patternsUpdated = 0;
    let patternsCreated = 0;

    for (const log of recentFailures) {
      const errorMsg = log.errorMessage || "No error message";
      const { category, fingerprint } = categorizeError(errorMsg);
      const domain = extractDomain(log.merchantFormUrl);

      // Check if pattern already exists
      const existing = await ctx.db
        .query("einvoice_error_patterns")
        .withIndex("by_fingerprint", (q) =>
          q.eq("errorFingerprint", fingerprint).eq("merchantDomain", domain)
        )
        .first();

      const claimIdStr = log.expenseClaimId as string;

      if (existing) {
        // Update existing pattern
        const sampleMessages = existing.sampleErrorMessages.length < 3
          ? [...existing.sampleErrorMessages, errorMsg.substring(0, 200)]
          : existing.sampleErrorMessages;
        const affectedIds = existing.affectedClaimIds.length < 10
          ? Array.from(new Set([...existing.affectedClaimIds, claimIdStr]))
          : existing.affectedClaimIds;

        // Only update if this log is newer
        if (log.startedAt > existing.lastSeenAt) {
          await ctx.db.patch(existing._id, {
            occurrenceCount: existing.occurrenceCount + 1,
            lastSeenAt: log.startedAt,
            sampleErrorMessages: sampleMessages,
            affectedClaimIds: affectedIds.slice(0, 10),
          });
          patternsUpdated++;
        }
      } else {
        // Create new pattern
        await ctx.db.insert("einvoice_error_patterns", {
          category,
          merchantDomain: domain,
          errorFingerprint: fingerprint,
          occurrenceCount: 1,
          firstSeenAt: log.startedAt,
          lastSeenAt: log.startedAt,
          sampleErrorMessages: [errorMsg.substring(0, 200)],
          affectedClaimIds: [claimIdStr],
          status: "new",
        });
        patternsCreated++;
      }
    }

    console.log(`[EinvoiceMonitor] Patterns: ${patternsCreated} new, ${patternsUpdated} updated`);
    return { created: patternsCreated, updated: patternsUpdated };
  },
});

// ============================================
// STEP 3: Notify dev team about new patterns
// ============================================

export const notifyNewPatterns = internalAction({
  args: {},
  handler: async (ctx): Promise<{ notified: number }> => {
    // Find unnotified "new" patterns
    const newPatterns: Array<{ _id: string; category: string; merchantDomain: string; errorFingerprint: string; occurrenceCount: number; firstSeenAt: number; sampleErrorMessages: string[] }> = await ctx.runMutation(internal.functions.einvoiceMonitoring.getUnnotifiedPatterns, {});

    if (newPatterns.length === 0) return { notified: 0 };

    // Build email body
    const lines = newPatterns.map((p: { category: string; merchantDomain: string; errorFingerprint: string; occurrenceCount: number; firstSeenAt: number; sampleErrorMessages: string[] }) =>
      `• [${p.category}] ${p.merchantDomain} — "${p.errorFingerprint}" (${p.occurrenceCount}x since ${new Date(p.firstSeenAt).toISOString().split("T")[0]})\n  Sample: ${p.sampleErrorMessages[0]?.substring(0, 120) || "N/A"}`
    );

    const emailBody = `E-Invoice Monitoring Alert\n\n${newPatterns.length} new error pattern(s) detected that need investigation:\n\n${lines.join("\n\n")}\n\nReview and update status at: https://finance.hellogroot.com/en/admin/einvoice-monitoring\n\n---\nThis is an automated alert from the E-Invoice Self-Improving Monitoring System.`;

    // Send email via the notifications API
    const apiUrl = process.env.APP_URL || "https://finance.hellogroot.com";
    try {
      await fetch(`${apiUrl}/api/v1/notifications/send-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": process.env.INTERNAL_API_KEY || "",
        },
        body: JSON.stringify({
          to: "dev@hellogroot.com",
          subject: `[E-Invoice Monitor] ${newPatterns.length} new error pattern(s) detected`,
          templateType: "plain_text",
          templateData: { body: emailBody },
        }),
      });
      console.log(`[EinvoiceMonitor] Notified dev@hellogroot.com about ${newPatterns.length} patterns`);
    } catch (emailErr) {
      console.error("[EinvoiceMonitor] Failed to send email:", emailErr);
    }

    // Mark patterns as notified
    for (const p of newPatterns) {
      await ctx.runMutation(internal.functions.einvoiceMonitoring.markNotified, {
        patternId: p._id as Id<"einvoice_error_patterns">,
      });
    }

    return { notified: newPatterns.length };
  },
});

// Helper query for the action above
export const getUnnotifiedPatterns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const patterns = await ctx.db
      .query("einvoice_error_patterns")
      .withIndex("by_status", (q) => q.eq("status", "new"))
      .collect();

    // Only notify patterns that haven't been notified yet
    return patterns.filter((p) => !p.notifiedAt);
  },
});

export const markNotified = internalMutation({
  args: { patternId: v.id("einvoice_error_patterns") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.patternId, { notifiedAt: Date.now() });
  },
});

// ============================================
// STEP 4: Resolution management (admin API)
// ============================================

export const updatePatternStatus = mutation({
  args: {
    patternId: v.id("einvoice_error_patterns"),
    status: v.union(
      v.literal("investigating"),
      v.literal("resolved"),
      v.literal("wont_fix")
    ),
    resolution: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const update: Record<string, unknown> = { status: args.status };
    if (args.resolution) update.resolution = args.resolution;
    if (args.status === "resolved" || args.status === "wont_fix") {
      update.resolvedAt = Date.now();
    }
    await ctx.db.patch(args.patternId, update);
    return { success: true };
  },
});

export const listPatterns = mutation({
  args: {
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("einvoice_error_patterns")
        .withIndex("by_status", (q) => q.eq("status", args.status as "new" | "investigating" | "resolved" | "wont_fix"))
        .collect();
    }
    return await ctx.db.query("einvoice_error_patterns").collect();
  },
});

// ============================================
// ORCHESTRATOR: Runs all 3 steps in sequence
// ============================================

export const runMonitoringCycle = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("[EinvoiceMonitor] Starting monitoring cycle...");

    // Step 1: Clean stale records
    const { cleaned } = await ctx.runMutation(
      internal.functions.einvoiceMonitoring.cleanupStaleRequests, {}
    );

    // Step 2: Analyze patterns
    const { created, updated } = await ctx.runMutation(
      internal.functions.einvoiceMonitoring.analyzeFailurePatterns, {}
    );

    // Step 3: Notify new patterns
    const { notified } = await ctx.runAction(
      internal.functions.einvoiceMonitoring.notifyNewPatterns, {}
    );

    console.log(`[EinvoiceMonitor] Cycle complete: cleaned=${cleaned}, patterns=${created} new/${updated} updated, notified=${notified}`);
  },
});

// ============================================
// ONE-TIME MIGRATIONS
// ============================================

/**
 * Mark McDonald's as manual-only (Cloudflare WAF blocks all automation).
 * Run via: npx convex run --prod functions/einvoiceMonitoring:markMcdonaldsManualOnly
 */
export const markMcdonaldsManualOnly = mutation({
  args: {},
  handler: async (ctx) => {
    const merchants = await ctx.db
      .query("merchant_einvoice")
      .collect();

    let updated = 0;
    for (const m of merchants) {
      const name = m.merchantName.toLowerCase();
      if (name.includes("mcdonald")) {
        await ctx.db.patch(m._id, {
          notes: "MANUAL_ONLY: Cloudflare WAF blocks all automation. Users must fill the form manually.",
          isActive: false,
        });
        updated++;
      }
    }

    console.log(`[EinvoiceMonitor] Marked ${updated} McDonald's entries as manual-only`);
    return { updated };
  },
});

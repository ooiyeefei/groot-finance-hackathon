# E-Invoice Self-Improving Monitoring System

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix quick-win e-invoice failures and build a self-improving monitoring system that auto-detects new error patterns, notifies the team, and tracks resolutions.

**Architecture:** Add an `einvoice_error_patterns` table to Convex that aggregates recurring failure patterns. A cron job runs every 2 hours to: (1) clean up stale in_progress records, (2) categorize new failures into patterns, (3) email dev@hellogroot.com about unresolved new patterns. The Lambda sanitizes Browserbase billing errors into generic user-facing messages. McDonald's is flagged as manual-only.

**Tech Stack:** Convex (schema + crons + internal functions), Python Lambda (error sanitization), existing SES email via notifications system.

---

### Task 1: Add `einvoice_error_patterns` Table to Schema

**Files:**
- Modify: `convex/schema.ts:2619` (before closing `});`)

**Step 1: Add the new table definition**

Insert before the final `});` in `convex/schema.ts` (line 2620):

```typescript
  // ============================================
  // E-INVOICE ERROR PATTERNS (self-improving monitoring)
  // ============================================

  einvoice_error_patterns: defineTable({
    // Pattern identification
    category: v.string(),                              // "captcha_blocked", "bot_blocked", "rate_limited", "form_validation", "infra_bug", "browserbase_limit", "network_error", "merchant_logic", "unknown"
    merchantDomain: v.string(),                        // "einvoice.7eleven.com.my" or "*" for cross-merchant
    errorFingerprint: v.string(),                      // Normalized error substring for dedup (e.g., "CAPTCHA", "429", "402")

    // Aggregation
    occurrenceCount: v.number(),                       // How many times this pattern has occurred
    firstSeenAt: v.number(),                           // Timestamp of first occurrence
    lastSeenAt: v.number(),                            // Timestamp of most recent occurrence
    sampleErrorMessages: v.array(v.string()),          // Up to 3 sample error messages for context
    affectedClaimIds: v.array(v.string()),             // Up to 10 recent claim IDs

    // Resolution tracking
    status: v.union(
      v.literal("new"),                                // Just detected, not yet investigated
      v.literal("investigating"),                      // Dev is looking into it
      v.literal("resolved"),                           // Fix deployed
      v.literal("wont_fix"),                           // Accepted limitation (e.g., manual-only merchant)
    ),
    resolution: v.optional(v.string()),                // How it was resolved: "marked manual-only", "fixed captcha solver", etc.
    resolvedAt: v.optional(v.number()),
    notifiedAt: v.optional(v.number()),                // When dev@hellogroot.com was emailed

    // Metadata
    lastAnalyzedLogId: v.optional(v.string()),         // Bookmark for incremental processing
  })
    .index("by_status", ["status"])
    .index("by_category_domain", ["category", "merchantDomain"])
    .index("by_fingerprint", ["errorFingerprint", "merchantDomain"]),
```

**Step 2: Verify schema compiles**

Run: `cd /home/fei/fei/code/groot-finance/groot-finance && npx tsc --noEmit convex/schema.ts 2>&1 | head -20`

**Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat(einvoice): add einvoice_error_patterns table for self-improving monitoring"
```

---

### Task 2: Build Stale Record Cleanup + Error Pattern Analyzer

**Files:**
- Create: `convex/functions/einvoiceMonitoring.ts`

**Step 1: Write the internal mutations and actions**

Create `convex/functions/einvoiceMonitoring.ts` with:

```typescript
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
          ? [...new Set([...existing.affectedClaimIds, claimIdStr])]
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
  handler: async (ctx) => {
    // Find unnotified "new" patterns
    const newPatterns = await ctx.runQuery(internal.functions.einvoiceMonitoring.getUnnotifiedPatterns, {});

    if (newPatterns.length === 0) return { notified: 0 };

    // Build email body
    const lines = newPatterns.map((p) =>
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
        patternId: p._id,
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
```

**Step 2: Verify TypeScript compiles**

Run: `cd /home/fei/fei/code/groot-finance/groot-finance && npx tsc --noEmit convex/functions/einvoiceMonitoring.ts 2>&1 | head -20`

**Step 3: Commit**

```bash
git add convex/functions/einvoiceMonitoring.ts
git commit -m "feat(einvoice): add self-improving monitoring functions (stale cleanup + pattern analysis + email alerts)"
```

---

### Task 3: Register Cron Job

**Files:**
- Modify: `convex/crons.ts:232` (after the LHDN polling comment)

**Step 1: Add the monitoring cron**

Insert after line 233 (`// Lambda queries Convex for businesses with pending requests, polls LHDN directly.`):

```typescript

/**
 * E-Invoice Monitoring: Self-Improving Error Detection
 *
 * Runs every 2 hours to:
 * 1. Clean up stale in_progress records (Lambda timeout >15 min)
 * 2. Categorize new failures into error patterns
 * 3. Email dev@hellogroot.com about unresolved new patterns
 *
 * This enables the system to self-improve by catching new error types
 * as merchants update their forms or new merchants are added.
 */
crons.interval(
  "einvoice-monitoring",
  { hours: 2 },
  internal.functions.einvoiceMonitoring.runMonitoringCycle
);
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | tail -20`

**Step 3: Commit**

```bash
git add convex/crons.ts
git commit -m "feat(einvoice): register monitoring cron job (every 2 hours)"
```

---

### Task 4: Sanitize Browserbase 402 Errors in Lambda

**Files:**
- Modify: `src/lambda/einvoice-form-fill-python/handler.py:820-843` (launch_browserbase function)
- Modify: `src/lambda/einvoice-form-fill-python/handler.py:2966-2970` (main exception handler)

**Step 1: Add Browserbase limit detection and email notification**

In `handler.py`, after the `launch_browserbase` function (around line 843), add a helper:

```python
def _notify_browserbase_limit(claim_id: str, error_str: str):
    """Email dev@hellogroot.com when Browserbase credits are exhausted."""
    try:
        import smtplib
        # Use Convex mutation to trigger email via existing notification system
        convex_mutation("functions/system:reportEinvoiceFormFillResult", {
            "expenseClaimId": claim_id,
            "emailRef": "",
            "status": "failed",
            "errorMessage": "Our e-invoice processing service is temporarily at capacity. Our support team has been notified and is working on it.",
        })
        # The actual email is sent by the monitoring cron — it will pick up
        # the "browserbase_limit" category and notify dev@hellogroot.com
        print(f"[Browser] Browserbase limit hit — will be caught by monitoring cron")
    except Exception as e:
        print(f"[Browser] Failed to notify about limit: {e}")
```

**Step 2: Wrap `launch_browserbase` calls to catch 402**

In the main `handler()` function's exception handler (around line 2966), add 402 detection before the general error reporting:

Find this block (approx line 2966-2970):
```python
    except Exception as e:
        dur = int((time.time() - start) * 1000)
        error = str(e)
        print(f"[Form Fill] FAILED in {dur}ms: {error}")
```

Replace with:
```python
    except Exception as e:
        dur = int((time.time() - start) * 1000)
        error = str(e)
        print(f"[Form Fill] FAILED in {dur}ms: {error}")

        # Sanitize Browserbase billing errors — don't expose to users
        user_facing_error = error
        if "402" in error or "Payment Required" in error or "Free plan browser minutes" in error:
            user_facing_error = "Our e-invoice processing service is temporarily at capacity. Our support team has been notified and is working on it."
            print("[Browser] Browserbase limit hit — sanitizing error for user")
```

Then update all `convex_mutation("functions/system:reportEinvoiceFormFillResult", ...)` calls in the exception handler to use `user_facing_error` instead of `error` for the `errorMessage` field.

Specifically, around line 3120-3123:
```python
        try:
            convex_mutation("functions/system:reportEinvoiceFormFillResult", {
                "expenseClaimId": claim_id, "emailRef": event["emailRef"],
                "status": "failed", "errorMessage": user_facing_error, "durationMs": dur,
                **_debug_fields(),
            })
```

**Step 3: Commit**

```bash
git add src/lambda/einvoice-form-fill-python/handler.py
git commit -m "fix(einvoice): sanitize Browserbase 402 errors — show generic message to users"
```

---

### Task 5: Mark McDonald's as Manual-Only

**Files:**
- Modify: `convex/functions/system.ts` (the `reportEinvoiceFormFillResult` mutation)

This is a data fix, not a code change. We'll update the `merchant_einvoice` table entry for McDonald's via a one-time mutation.

**Step 1: Create a one-time migration script**

Add to `convex/functions/einvoiceMonitoring.ts`:

```typescript
/**
 * One-time: Mark McDonald's as manual-only (Cloudflare WAF blocks all automation).
 * Run via: npx convex run --prod functions/einvoiceMonitoring:markMcdonaldsManualOnly
 */
export const markMcdonaldsManualOnly = mutation({
  args: {},
  handler: async (ctx) => {
    // Find McDonald's entries
    const merchants = await ctx.db
      .query("merchant_einvoice")
      .collect();

    let updated = 0;
    for (const m of merchants) {
      const name = m.merchantName.toLowerCase();
      if (name.includes("mcdonald") || name.includes("mcdonalds")) {
        await ctx.db.patch(m._id, {
          notes: "MANUAL_ONLY: Cloudflare WAF blocks all automation. Users must fill the form manually.",
          isActive: false,
        });
        updated++;
      }
    }

    return { updated };
  },
});
```

**Step 2: Run after deploy**

Run: `npx convex run --prod functions/einvoiceMonitoring:markMcdonaldsManualOnly '{}'`

**Step 3: Commit**

```bash
git add convex/functions/einvoiceMonitoring.ts
git commit -m "fix(einvoice): mark McDonald's as manual-only (WAF blocks automation)"
```

---

### Task 6: Add Rate Limiting Check in Lambda

**Files:**
- Modify: `src/lambda/einvoice-form-fill-python/handler.py` (near top, after imports)

**Step 1: Add a simple per-domain rate limiter**

Add after line 29 (after `dspy = None`):

```python
# ── Per-domain rate limiting (prevents 429s from merchants) ──
_domain_last_request: dict[str, float] = {}  # domain → last request timestamp
DOMAIN_MIN_INTERVAL_S = 10  # Minimum seconds between requests to same domain

def _rate_limit_domain(url: str):
    """Enforce minimum interval between requests to same merchant domain."""
    from urllib.parse import urlparse
    domain = urlparse(url).netloc
    now = time.time()
    last = _domain_last_request.get(domain, 0)
    wait = DOMAIN_MIN_INTERVAL_S - (now - last)
    if wait > 0:
        print(f"[RateLimit] Waiting {wait:.1f}s before requesting {domain}")
        time.sleep(wait)
    _domain_last_request[domain] = time.time()
```

**Step 2: Call it before navigation**

In the `handler()` function, just before line 2574 (`resp = page.goto(url, ...)`), add:

```python
        _rate_limit_domain(url)
```

**Step 3: Commit**

```bash
git add src/lambda/einvoice-form-fill-python/handler.py
git commit -m "fix(einvoice): add per-domain rate limiting to prevent merchant 429s"
```

---

### Task 7: Deploy to Production

**Step 1: Deploy Convex schema + functions**

Run: `npx convex deploy --yes`

**Step 2: Run McDonald's manual-only migration**

Run: `npx convex run --prod functions/einvoiceMonitoring:markMcdonaldsManualOnly '{}'`

**Step 3: Deploy Lambda (if Lambda deployment is set up)**

Follow existing CDK deployment for the einvoice-form-fill Lambda:
```bash
cd infra
npx cdk deploy --profile groot-finanseal --region us-west-2
```

**Step 4: Verify build passes**

Run: `npm run build`

**Step 5: Commit any remaining changes**

```bash
git add -A
git commit -m "feat(einvoice): deploy self-improving monitoring system"
```

---

## Architecture Summary

```
Every 2 hours (Convex cron):
  ┌─────────────────────────────────────┐
  │ runMonitoringCycle                   │
  │                                     │
  │ 1. cleanupStaleRequests             │
  │    - Find in_progress > 15 min      │
  │    - Mark as failed + update claim  │
  │                                     │
  │ 2. analyzeFailurePatterns           │
  │    - Read last 24h failed logs      │
  │    - Categorize by error rules      │
  │    - Upsert einvoice_error_patterns │
  │                                     │
  │ 3. notifyNewPatterns                │
  │    - Find status="new" unnotified   │
  │    - Email dev@hellogroot.com       │
  │    - Mark as notified               │
  └─────────────────────────────────────┘

On each form fill (Lambda):
  ┌─────────────────────────────────────┐
  │ Browserbase 402 → sanitized error   │
  │ "Service at capacity, team notified"│
  │                                     │
  │ Rate limiter: 10s between same-     │
  │ domain requests (prevents 429s)     │
  │                                     │
  │ McDonald's isActive=false →         │
  │ skipped by merchant lookup          │
  └─────────────────────────────────────┘

Resolution workflow:
  1. Cron detects new pattern → emails dev
  2. Dev reviews → sets status="investigating"
  3. Dev deploys fix → sets status="resolved"
  4. Pattern tracks if it recurs after resolution
```

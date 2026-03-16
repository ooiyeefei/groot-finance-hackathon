/**
 * LHDN Submission Jobs — Convex Functions
 *
 * Manages the async submission pipeline:
 * - Job creation and tracking
 * - Status updates
 * - Scheduled polling with progressive backoff
 * - Retry logic after timeouts
 */

import { v } from "convex/values";
import { internalMutation, internalQuery, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

// ============================================
// INTERNAL QUERIES
// ============================================

/**
 * Get a submission job by ID (internal).
 */
export const getJob = internalQuery({
  args: {
    jobId: v.id("lhdn_submission_jobs"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

// ============================================
// INTERNAL MUTATIONS
// ============================================

/**
 * Create a new submission job.
 */
export const createJob = internalMutation({
  args: {
    businessId: v.id("businesses"),
    sourceType: v.string(),
    sourceId: v.string(),
    documentType: v.string(),
  },
  handler: async (ctx, args) => {
    const jobId = await ctx.db.insert("lhdn_submission_jobs", {
      businessId: args.businessId,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      documentType: args.documentType,
      status: "queued",
      pollAttempts: 0,
      retryCount: 0,
      createdAt: Date.now(),
    });

    return jobId;
  },
});

/**
 * Update job status.
 */
export const updateJobStatus = internalMutation({
  args: {
    jobId: v.id("lhdn_submission_jobs"),
    status: v.string(),
    submissionUid: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = { status: args.status };

    if (args.submissionUid !== undefined) {
      patch.submissionUid = args.submissionUid;
    }
    if (args.error !== undefined) {
      patch.error = args.error;
    }
    if (args.status === "completed" || args.status === "failed") {
      patch.completedAt = Date.now();
    }

    await ctx.db.patch(args.jobId, patch);
  },
});

/**
 * Schedule polling for a submission.
 * Uses progressive backoff: 5s for first 2 min, then 30s up to 30 min.
 */
export const schedulePoll = internalMutation({
  args: {
    jobId: v.id("lhdn_submission_jobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return;

    // Calculate delay based on elapsed time
    const elapsed = Date.now() - job.createdAt;
    const INITIAL_PHASE_MS = 2 * 60 * 1000; // 2 minutes
    const MAX_POLL_MS = 30 * 60 * 1000; // 30 minutes
    const RETRY_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

    if (elapsed >= MAX_POLL_MS) {
      // Timeout reached — check if we can retry
      if (job.retryCount < 3) {
        // Schedule a retry in 1 hour
        await ctx.db.patch(args.jobId, {
          retryCount: job.retryCount + 1,
          pollAttempts: 0,
          status: "polling",
        });
        await ctx.scheduler.runAfter(
          RETRY_INTERVAL_MS,
          internal.functions.lhdnJobs.pollForResults,
          { jobId: args.jobId }
        );
      } else {
        // Exhausted retries — mark as failed
        await ctx.db.patch(args.jobId, {
          status: "failed",
          error: "Polling timeout: no response from LHDN after 30 minutes and 3 retries",
          completedAt: Date.now(),
        });

        // Notify on failure after exhausted retries
        const resourceType = job.sourceType === "sales_invoice"
          ? "sales_invoice" as const
          : job.sourceType === "expense_claim"
            ? "expense_claim" as const
            : "invoice" as const;

        const resourceUrl = job.sourceType === "sales_invoice"
          ? `/sales-invoices/${job.sourceId}`
          : job.sourceType === "expense_claim"
            ? `/expense-claims/${job.sourceId}`
            : `/invoices/${job.sourceId}`;

        await ctx.runMutation(internal.functions.notifications.createForRole, {
          businessId: job.businessId,
          targetRoles: ["owner", "finance_admin", "manager"],
          type: "lhdn_submission",
          severity: "critical",
          title: "E-Invoice Submission Failed",
          body: "LHDN did not respond after multiple retries. Please try submitting again.",
          resourceType,
          resourceId: job.sourceId,
          resourceUrl,
          sourceEvent: `lhdn_failed_${args.jobId}`,
        });
      }
      return;
    }

    // Determine delay: 5s for first 2 min, 30s after
    const delay = elapsed < INITIAL_PHASE_MS ? 5_000 : 30_000;

    await ctx.scheduler.runAfter(
      delay,
      internal.functions.lhdnJobs.pollForResults,
      { jobId: args.jobId }
    );
  },
});

/**
 * Poll LHDN for validation results.
 * Called by the scheduler. Reschedules itself until resolved or timeout.
 */
export const pollForResults = internalMutation({
  args: {
    jobId: v.id("lhdn_submission_jobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return;

    // Skip if already completed or failed
    if (job.status === "completed" || job.status === "failed") return;

    // Skip if no submission UID yet
    if (!job.submissionUid) {
      // Re-schedule in case the submission is still in progress
      await ctx.scheduler.runAfter(
        5_000,
        internal.functions.lhdnJobs.pollForResults,
        { jobId: args.jobId }
      );
      return;
    }

    // Update poll count
    await ctx.db.patch(args.jobId, {
      pollAttempts: job.pollAttempts + 1,
      lastPollAt: Date.now(),
    });

    // The actual LHDN API call happens in the Next.js API route.
    // This scheduled function just manages timing. The API route
    // will call updateSourceRecord when it gets a result.
    // Schedule the next poll
    await ctx.scheduler.runAfter(
      0,
      internal.functions.lhdnJobs.schedulePoll,
      { jobId: args.jobId }
    );
  },
});

/**
 * Update the source record with LHDN validation results.
 * Called from the API route after polling LHDN.
 */
export const updateSourceRecord = internalMutation({
  args: {
    jobId: v.id("lhdn_submission_jobs"),
    status: v.string(),
    documentUuid: v.optional(v.string()),
    longId: v.optional(v.string()),
    validatedAt: v.optional(v.number()),
    validationErrors: v.optional(
      v.array(
        v.object({
          code: v.string(),
          message: v.string(),
          target: v.optional(v.string()),
        })
      )
    ),
    documentHash: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return;

    // Build the patch for the source record
    const patch: Record<string, unknown> = {
      lhdnStatus: args.status,
      updatedAt: Date.now(),
    };

    if (args.documentUuid) patch.lhdnDocumentUuid = args.documentUuid;
    if (args.longId) patch.lhdnLongId = args.longId;
    if (args.validatedAt) patch.lhdnValidatedAt = args.validatedAt;
    if (args.validationErrors) patch.lhdnValidationErrors = args.validationErrors;
    if (args.documentHash) patch.lhdnDocumentHash = args.documentHash;

    // Update the source record based on sourceType
    const sourceId = job.sourceId as Id<"sales_invoices"> | Id<"expense_claims"> | Id<"invoices">;

    if (job.sourceType === "sales_invoice") {
      await ctx.db.patch(sourceId as Id<"sales_invoices">, patch);
    } else if (job.sourceType === "expense_claim") {
      await ctx.db.patch(sourceId as Id<"expense_claims">, patch);
    } else if (job.sourceType === "invoice") {
      await ctx.db.patch(sourceId as Id<"invoices">, patch);
    }

    // Update job status
    const jobStatus = args.status === "valid" || args.status === "invalid"
      ? "completed"
      : args.status === "cancelled"
        ? "completed"
        : "polling";

    await ctx.db.patch(args.jobId, {
      status: jobStatus,
      ...(jobStatus === "completed" ? { completedAt: Date.now() } : {}),
    });

    // Create notifications for terminal statuses
    if (args.status === "valid" || args.status === "invalid") {
      const resourceType = job.sourceType === "sales_invoice"
        ? "sales_invoice" as const
        : job.sourceType === "expense_claim"
          ? "expense_claim" as const
          : "invoice" as const;

      const resourceUrl = job.sourceType === "sales_invoice"
        ? `/sales-invoices/${job.sourceId}`
        : job.sourceType === "expense_claim"
          ? `/expense-claims/${job.sourceId}`
          : `/invoices/${job.sourceId}`;

      if (args.status === "valid") {
        await ctx.runMutation(internal.functions.notifications.createForRole, {
          businessId: job.businessId,
          targetRoles: ["owner", "finance_admin", "manager"],
          type: "lhdn_submission",
          severity: "info",
          title: "E-Invoice Validated by LHDN",
          body: `Your ${job.documentType === "11" ? "self-billed " : ""}e-invoice has been validated and accepted by LHDN.`,
          resourceType,
          resourceId: job.sourceId,
          resourceUrl,
          sourceEvent: `lhdn_valid_${args.jobId}`,
        });

        // 022-einvoice-lhdn-buyer-flows: Trigger auto-delivery of validated PDF to buyer
        if (job.sourceType === "sales_invoice") {
          const business = await ctx.db.get(job.businessId);
          // Auto-delivery is ON by default (einvoiceAutoDelivery === undefined treated as true)
          if (business && business.einvoiceAutoDelivery !== false) {
            // Schedule the auto-delivery action (runs async, non-blocking)
            await ctx.scheduler.runAfter(5000, internal.functions.lhdnJobs.triggerAutoDelivery, {
              invoiceId: job.sourceId,
              businessId: job.businessId,
            });
          }
        }
      } else {
        const errorSummary = args.validationErrors?.length
          ? `: ${args.validationErrors[0].message}`
          : "";
        await ctx.runMutation(internal.functions.notifications.createForRole, {
          businessId: job.businessId,
          targetRoles: ["owner", "finance_admin", "manager"],
          type: "lhdn_submission",
          severity: "warning",
          title: "E-Invoice Rejected by LHDN",
          body: `Your ${job.documentType === "11" ? "self-billed " : ""}e-invoice was rejected${errorSummary}. Please review and resubmit.`,
          resourceType,
          resourceId: job.sourceId,
          resourceUrl,
          sourceEvent: `lhdn_invalid_${args.jobId}`,
        });
      }
    }
  },
});

// ============================================
// AUTO-DELIVERY ACTION (022-einvoice-lhdn-buyer-flows)
// ============================================

/**
 * Trigger auto-delivery of validated e-invoice PDF to buyer.
 * Calls the Next.js API route to generate PDF server-side and email it.
 */
export const triggerAutoDelivery = internalAction({
  args: {
    invoiceId: v.string(),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";
    const internalKey = process.env.MCP_INTERNAL_SERVICE_KEY;

    if (!internalKey) {
      console.error("[triggerAutoDelivery] MCP_INTERNAL_SERVICE_KEY not configured, skipping");
      return;
    }

    try {
      const response = await fetch(
        `${baseUrl}/api/v1/sales-invoices/${args.invoiceId}/lhdn/deliver`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Key": internalKey,
          },
          body: JSON.stringify({ businessId: args.businessId }),
        }
      );

      const result = await response.json();
      if (!result.success) {
        console.error(`[triggerAutoDelivery] Delivery failed for ${args.invoiceId}:`, result.error);

        // 001-einv-pdf-gen: Create failure notification
        await ctx.runMutation(internal.functions.notifications.createForRole, {
          businessId: args.businessId,
          targetRoles: ["owner", "finance_admin", "manager"],
          type: "lhdn_submission",
          severity: "warning",
          title: "E-Invoice Delivery Failed",
          body: `Failed to deliver validated e-invoice to buyer: ${result.error || "Unknown error"}. You can manually retry from the invoice page.`,
          resourceType: "sales_invoice",
          resourceId: args.invoiceId,
          resourceUrl: `/sales-invoices/${args.invoiceId}`,
          sourceEvent: `lhdn_delivery_failed_${args.invoiceId}`,
        });
      } else {
        console.log(`[triggerAutoDelivery] E-invoice ${args.invoiceId} delivered to ${result.data?.deliveredTo || "buyer"}`);
      }
    } catch (error) {
      console.error(`[triggerAutoDelivery] Error for ${args.invoiceId}:`, error);

      // 001-einv-pdf-gen: Create failure notification for network/unexpected errors
      await ctx.runMutation(internal.functions.notifications.createForRole, {
        businessId: args.businessId,
        targetRoles: ["owner", "finance_admin", "manager"],
        type: "lhdn_submission",
        severity: "warning",
        title: "E-Invoice Delivery Failed",
        body: `Failed to deliver validated e-invoice to buyer due to system error. You can manually retry from the invoice page.`,
        resourceType: "sales_invoice",
        resourceId: args.invoiceId,
        resourceUrl: `/sales-invoices/${args.invoiceId}`,
        sourceEvent: `lhdn_delivery_error_${args.invoiceId}`,
      });
    }
  },
});

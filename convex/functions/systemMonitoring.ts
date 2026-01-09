/**
 * System Monitoring Functions - Stuck Record Detection & Recovery
 *
 * Monitors and fixes stuck records across domains:
 * - invoices (OCR processing)
 * - expense_claims (receipt processing)
 *
 * Access: Admin/Manager only via authenticated queries
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

// Default timeout: 10 minutes in milliseconds
const STUCK_TIMEOUT_MS = 10 * 60 * 1000;

// Max records to process per call
const MAX_RECORDS = 50;

// Stuck statuses per domain
const INVOICE_STUCK_STATUSES = ["processing", "extracting", "classifying"] as const;
const EXPENSE_CLAIM_STUCK_STATUSES = ["processing"] as const;

// ============================================
// HELPER: Create failure metadata
// ============================================

function createStuckRecordFailureMetadata(
  minutesStuck: number,
  domain: string,
  overrideReason?: string
) {
  const now = new Date().toISOString();
  const isManualOverride = !!overrideReason;

  return {
    extraction_method: "ai",
    extraction_timestamp: now,
    ai_processing_status: "failed",
    processing_status: "failed",
    error_category: isManualOverride ? "admin_override" : "system_timeout",
    error_code: isManualOverride ? "MANUAL_OVERRIDE" : "STUCK_RECORD_TIMEOUT",
    error_message: overrideReason ||
      `Processing timed out after ${minutesStuck} minutes. Please try uploading again or contact support if the issue persists.`,
    technical_error: isManualOverride
      ? `Manually failed by admin`
      : `Record was stuck in processing status for ${minutesStuck} minutes without updates from Trigger.dev task`,
    failed_at: now,
    processing_stage: isManualOverride ? "admin_manual_override" : "stuck_record_monitoring",
    failure_level: isManualOverride ? "admin_action" : "system",
    timeout_duration: `${minutesStuck} minutes`,
    monitoring_action: isManualOverride ? "manual_override" : "auto_failed_by_monitor",
    domain,
  };
}

// ============================================
// QUERIES
// ============================================

/**
 * Find stuck invoice records
 * Returns invoices with processing status that have been stuck longer than timeout threshold
 */
export const findStuckInvoices = query({
  args: {
    businessId: v.string(),
    timeoutMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { error: "Not authenticated", invoices: [] };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { error: "User not found", invoices: [] };
    }

    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return { error: "Business not found", invoices: [] };
    }

    // Check membership and permissions
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { error: "Not a member of this business", invoices: [] };
    }

    // Only admin/manager can view stuck records
    if (!["owner", "admin", "manager"].includes(membership.role)) {
      return { error: "Insufficient permissions", invoices: [] };
    }

    const timeoutMs = (args.timeoutMinutes ?? 10) * 60 * 1000;
    const timeoutThreshold = Date.now() - timeoutMs;

    // Get all invoices for business with stuck statuses
    let invoices = await ctx.db
      .query("invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter to stuck records
    const stuckInvoices = invoices.filter((invoice) => {
      // Must be in a stuck status
      if (!INVOICE_STUCK_STATUSES.includes(invoice.status as any)) {
        return false;
      }

      // Check if stuck longer than threshold
      const processingStarted = invoice.processingStartedAt ?? invoice._creationTime;
      return processingStarted < timeoutThreshold;
    });

    // Limit to max records
    const limitedInvoices = stuckInvoices.slice(0, MAX_RECORDS);

    return {
      invoices: limitedInvoices.map((invoice) => ({
        _id: invoice._id,
        legacyId: invoice.legacyId,
        fileName: invoice.fileName,
        status: invoice.status,
        processingStartedAt: invoice.processingStartedAt,
        _creationTime: invoice._creationTime,
        minutesStuck: Math.floor(
          (Date.now() - (invoice.processingStartedAt ?? invoice._creationTime)) / 60000
        ),
      })),
      totalFound: stuckInvoices.length,
      timeoutThreshold: new Date(timeoutThreshold).toISOString(),
    };
  },
});

/**
 * Find stuck expense claim records
 * Returns expense claims with processing status that have been stuck longer than timeout threshold
 */
export const findStuckExpenseClaims = query({
  args: {
    businessId: v.string(),
    timeoutMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { error: "Not authenticated", claims: [] };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { error: "User not found", claims: [] };
    }

    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return { error: "Business not found", claims: [] };
    }

    // Check membership and permissions
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { error: "Not a member of this business", claims: [] };
    }

    // Only admin/manager can view stuck records
    if (!["owner", "admin", "manager"].includes(membership.role)) {
      return { error: "Insufficient permissions", claims: [] };
    }

    const timeoutMs = (args.timeoutMinutes ?? 10) * 60 * 1000;
    const timeoutThreshold = Date.now() - timeoutMs;

    // Get all expense claims for business with stuck statuses
    let claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter to stuck records
    const stuckClaims = claims.filter((claim) => {
      // Skip deleted claims
      if (claim.deletedAt) return false;

      // Must be in a stuck status
      if (!EXPENSE_CLAIM_STUCK_STATUSES.includes(claim.status as any)) {
        return false;
      }

      // Check if stuck longer than threshold
      const processingStarted = claim.processingStartedAt ?? claim._creationTime;
      return processingStarted < timeoutThreshold;
    });

    // Limit to max records
    const limitedClaims = stuckClaims.slice(0, MAX_RECORDS);

    return {
      claims: limitedClaims.map((claim) => ({
        _id: claim._id,
        legacyId: claim.legacyId,
        businessPurpose: claim.businessPurpose,
        status: claim.status,
        processingStartedAt: claim.processingStartedAt,
        _creationTime: claim._creationTime,
        minutesStuck: Math.floor(
          (Date.now() - (claim.processingStartedAt ?? claim._creationTime)) / 60000
        ),
      })),
      totalFound: stuckClaims.length,
      timeoutThreshold: new Date(timeoutThreshold).toISOString(),
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Mark stuck invoices as failed
 * Updates status to 'failed' with failure metadata
 */
export const markInvoiceAsFailed = mutation({
  args: {
    invoiceId: v.string(),
    reason: v.optional(v.string()), // Optional manual override reason
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    // Resolve invoice
    const invoice = await resolveById(ctx.db, "invoices", args.invoiceId);
    if (!invoice) {
      throw new Error("Invoice not found");
    }

    // Check if invoice has a businessId
    if (!invoice.businessId) {
      throw new Error("Invoice has no business association");
    }

    // Check membership and permissions
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", invoice.businessId!)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    // Only owner can manually override
    if (membership.role !== "owner") {
      throw new Error("Insufficient permissions");
    }

    // Calculate how long it was stuck
    const processingStarted = invoice.processingStartedAt ?? invoice._creationTime;
    const minutesStuck = Math.floor((Date.now() - processingStarted) / 60000);

    // Create failure metadata
    const failureMetadata = createStuckRecordFailureMetadata(
      minutesStuck,
      "invoices",
      args.reason
    );

    // Update invoice
    await ctx.db.patch(invoice._id, {
      status: "failed",
      processingMetadata: {
        ...(invoice.processingMetadata || {}),
        ...failureMetadata,
      },
      failedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      success: true,
      invoiceId: invoice._id,
      minutesStuck,
      originalStatus: invoice.status,
    };
  },
});

/**
 * Mark stuck expense claim as failed
 * Updates status to 'failed' with failure metadata
 */
export const markExpenseClaimAsFailed = mutation({
  args: {
    claimId: v.string(),
    reason: v.optional(v.string()), // Optional manual override reason
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    // Resolve claim
    const claim = await resolveById(ctx.db, "expense_claims", args.claimId);
    if (!claim || claim.deletedAt) {
      throw new Error("Expense claim not found");
    }

    // Check membership and permissions
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", claim.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    // Only owner can manually override
    if (membership.role !== "owner") {
      throw new Error("Insufficient permissions");
    }

    // Calculate how long it was stuck
    const processingStarted = claim.processingStartedAt ?? claim._creationTime;
    const minutesStuck = Math.floor((Date.now() - processingStarted) / 60000);

    // Create failure metadata
    const failureMetadata = createStuckRecordFailureMetadata(
      minutesStuck,
      "expense_claims",
      args.reason
    );

    // Update claim
    await ctx.db.patch(claim._id, {
      status: "failed",
      processingMetadata: {
        ...(claim.processingMetadata || {}),
        ...failureMetadata,
      },
      failedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      success: true,
      claimId: claim._id,
      minutesStuck,
      originalStatus: claim.status,
    };
  },
});

/**
 * Batch mark stuck records as failed
 * Used by the monitor to fix all stuck records at once
 */
export const batchMarkStuckRecordsAsFailed = mutation({
  args: {
    businessId: v.string(),
    timeoutMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Check membership and permissions
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    // Only admin/manager can run monitor
    if (!["owner", "admin", "manager"].includes(membership.role)) {
      throw new Error("Insufficient permissions");
    }

    const timeoutMs = (args.timeoutMinutes ?? 10) * 60 * 1000;
    const timeoutThreshold = Date.now() - timeoutMs;

    const results = {
      invoices: { found: 0, fixed: 0, failed: 0, details: [] as any[] },
      expense_claims: { found: 0, fixed: 0, failed: 0, details: [] as any[] },
    };

    // Process invoices
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const stuckInvoices = invoices.filter((inv) => {
      if (!INVOICE_STUCK_STATUSES.includes(inv.status as any)) return false;
      const started = inv.processingStartedAt ?? inv._creationTime;
      return started < timeoutThreshold;
    }).slice(0, MAX_RECORDS);

    results.invoices.found = stuckInvoices.length;

    for (const invoice of stuckInvoices) {
      try {
        const minutesStuck = Math.floor(
          (Date.now() - (invoice.processingStartedAt ?? invoice._creationTime)) / 60000
        );
        const failureMetadata = createStuckRecordFailureMetadata(minutesStuck, "invoices");

        await ctx.db.patch(invoice._id, {
          status: "failed",
          processingMetadata: {
            ...(invoice.processingMetadata || {}),
            ...failureMetadata,
          },
          failedAt: Date.now(),
          updatedAt: Date.now(),
        });

        results.invoices.fixed++;
        results.invoices.details.push({
          _id: invoice._id,
          minutesStuck,
          success: true,
        });
      } catch (error) {
        results.invoices.failed++;
        results.invoices.details.push({
          _id: invoice._id,
          success: false,
          error: String(error),
        });
      }
    }

    // Process expense claims
    const claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const stuckClaims = claims.filter((claim) => {
      if (claim.deletedAt) return false;
      if (!EXPENSE_CLAIM_STUCK_STATUSES.includes(claim.status as any)) return false;
      const started = claim.processingStartedAt ?? claim._creationTime;
      return started < timeoutThreshold;
    }).slice(0, MAX_RECORDS);

    results.expense_claims.found = stuckClaims.length;

    for (const claim of stuckClaims) {
      try {
        const minutesStuck = Math.floor(
          (Date.now() - (claim.processingStartedAt ?? claim._creationTime)) / 60000
        );
        const failureMetadata = createStuckRecordFailureMetadata(minutesStuck, "expense_claims");

        await ctx.db.patch(claim._id, {
          status: "failed",
          processingMetadata: {
            ...(claim.processingMetadata || {}),
            ...failureMetadata,
          },
          failedAt: Date.now(),
          updatedAt: Date.now(),
        });

        results.expense_claims.fixed++;
        results.expense_claims.details.push({
          _id: claim._id,
          minutesStuck,
          success: true,
        });
      } catch (error) {
        results.expense_claims.failed++;
        results.expense_claims.details.push({
          _id: claim._id,
          success: false,
          error: String(error),
        });
      }
    }

    return {
      success: true,
      timeoutThreshold: new Date(timeoutThreshold).toISOString(),
      results,
      totals: {
        found: results.invoices.found + results.expense_claims.found,
        fixed: results.invoices.fixed + results.expense_claims.fixed,
        failed: results.invoices.failed + results.expense_claims.failed,
      },
    };
  },
});

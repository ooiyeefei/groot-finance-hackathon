/**
 * Report Functions - Convex queries and mutations
 *
 * CRUD operations for aging reports and debtor statement tracking.
 * Part of 035-aging-payable-receivable-report feature.
 *
 * Security: Multi-tenant isolation via businessId + role checks (finance_admin/owner)
 */

import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "../_generated/server";
import { Id } from "../_generated/dataModel";

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

// ============================================
// QUERIES
// ============================================

/**
 * List generated reports for a business
 */
export const listReports = query({
  args: {
    businessId: v.string(),
    reportType: v.optional(v.union(v.literal("ap_aging"), v.literal("ar_aging"))),
    periodMonth: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const limit = args.limit ?? 50;
    let results;

    if (args.periodMonth) {
      results = await ctx.db
        .query("generated_reports")
        .withIndex("by_business_period", (q) =>
          q.eq("businessId", args.businessId as Id<"businesses">).eq("periodMonth", args.periodMonth!)
        )
        .order("desc")
        .take(limit);
    } else if (args.reportType) {
      results = await ctx.db
        .query("generated_reports")
        .withIndex("by_business_type", (q) =>
          q.eq("businessId", args.businessId as Id<"businesses">).eq("reportType", args.reportType!)
        )
        .order("desc")
        .take(limit);
    } else {
      results = await ctx.db
        .query("generated_reports")
        .withIndex("by_business_period", (q) =>
          q.eq("businessId", args.businessId as Id<"businesses">)
        )
        .order("desc")
        .take(limit);
    }

    // Filter to consolidated reports only for the history list
    return results.filter((r) => r.reportScope === "consolidated");
  },
});

/**
 * List debtor statement sends for a period
 */
export const listStatementSends = query({
  args: {
    businessId: v.string(),
    periodMonth: v.string(),
    sendStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("sent"),
        v.literal("auto_sent"),
        v.literal("failed"),
        v.literal("no_email")
      )
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    if (args.sendStatus) {
      return await ctx.db
        .query("debtor_statement_sends")
        .withIndex("by_business_status", (q) =>
          q
            .eq("businessId", args.businessId as Id<"businesses">)
            .eq("sendStatus", args.sendStatus!)
        )
        .collect();
    }

    return await ctx.db
      .query("debtor_statement_sends")
      .withIndex("by_business_period", (q) =>
        q
          .eq("businessId", args.businessId as Id<"businesses">)
          .eq("periodMonth", args.periodMonth)
      )
      .collect();
  },
});

/**
 * Get report settings for a business
 */
export const getReportSettings = query({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const business = await ctx.db.get(args.businessId as Id<"businesses">);
    if (!business) return null;

    return business.reportSettings ?? {
      autoGenerateMonthly: true,
      autoSendGlobal: false,
      autoSendDebtors: [],
      notifyEmail: true,
    };
  },
});

/**
 * Get a single debtor statement send by ID
 */
export const getStatementById = query({
  args: {
    statementId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db.get(args.statementId as Id<"debtor_statement_sends">);
  },
});

/**
 * Get a single report by ID
 */
export const getReportById = query({
  args: {
    reportId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db.get(args.reportId as Id<"generated_reports">);
  },
});

/**
 * Get pending statement count for a business (for banner display)
 */
export const getPendingStatementCount = query({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return 0;

    const pending = await ctx.db
      .query("debtor_statement_sends")
      .withIndex("by_business_status", (q) =>
        q
          .eq("businessId", args.businessId as Id<"businesses">)
          .eq("sendStatus", "pending")
      )
      .collect();

    return pending.length;
  },
});

// ============================================
// MUTATIONS (public - for frontend)
// ============================================

/**
 * Update statement send status after email is sent
 */
export const updateStatementStatus = mutation({
  args: {
    statementId: v.string(),
    sendStatus: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("auto_sent"),
      v.literal("failed"),
      v.literal("no_email")
    ),
    sentAt: v.optional(v.number()),
    emailDeliveryStatus: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    await ctx.db.patch(args.statementId as Id<"debtor_statement_sends">, {
      sendStatus: args.sendStatus,
      ...(args.sentAt !== undefined && { sentAt: args.sentAt }),
      ...(args.emailDeliveryStatus !== undefined && {
        emailDeliveryStatus: args.emailDeliveryStatus,
      }),
    });
  },
});

/**
 * Create a report record (public - called from API routes)
 */
export const createReportPublic = mutation({
  args: {
    businessId: v.string(),
    reportType: v.union(v.literal("ap_aging"), v.literal("ar_aging")),
    reportScope: v.union(
      v.literal("consolidated"),
      v.literal("debtor_statement"),
      v.literal("vendor_statement")
    ),
    asOfDate: v.string(),
    periodMonth: v.string(),
    generationMethod: v.union(v.literal("manual"), v.literal("auto_monthly")),
    generatedBy: v.string(),
    s3Key: v.string(),
    s3Bucket: v.string(),
    fileSizeBytes: v.optional(v.number()),
    entityId: v.optional(v.string()),
    entityName: v.optional(v.string()),
    totalOutstanding: v.number(),
    currency: v.string(),
    hasWarnings: v.boolean(),
    aiInsightsSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;
    const expiresAt = Date.now() + TWELVE_MONTHS_MS;

    return await ctx.db.insert("generated_reports", {
      businessId: args.businessId as Id<"businesses">,
      reportType: args.reportType,
      reportScope: args.reportScope,
      asOfDate: args.asOfDate,
      periodMonth: args.periodMonth,
      generationMethod: args.generationMethod,
      generatedBy: args.generatedBy,
      s3Key: args.s3Key,
      s3Bucket: args.s3Bucket,
      fileSizeBytes: args.fileSizeBytes,
      entityId: args.entityId,
      entityName: args.entityName,
      totalOutstanding: args.totalOutstanding,
      currency: args.currency,
      hasWarnings: args.hasWarnings,
      aiInsightsSummary: args.aiInsightsSummary,
      expiresAt,
    });
  },
});

/**
 * Create a debtor statement send record (public - called from API routes)
 */
export const createStatementSendPublic = mutation({
  args: {
    businessId: v.string(),
    reportId: v.string(),
    customerId: v.string(),
    customerName: v.string(),
    customerEmail: v.optional(v.string()),
    totalOutstanding: v.number(),
    invoiceCount: v.number(),
    sendStatus: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("auto_sent"),
      v.literal("failed"),
      v.literal("no_email")
    ),
    periodMonth: v.string(),
    hasDisclaimer: v.boolean(),
    autoSendEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    return await ctx.db.insert("debtor_statement_sends", {
      businessId: args.businessId as Id<"businesses">,
      reportId: args.reportId as Id<"generated_reports">,
      customerId: args.customerId,
      customerName: args.customerName,
      customerEmail: args.customerEmail,
      totalOutstanding: args.totalOutstanding,
      invoiceCount: args.invoiceCount,
      sendStatus: args.sendStatus,
      periodMonth: args.periodMonth,
      hasDisclaimer: args.hasDisclaimer,
      autoSendEnabled: args.autoSendEnabled,
    });
  },
});

/**
 * Update report settings for a business
 */
export const updateReportSettings = mutation({
  args: {
    businessId: v.string(),
    autoGenerateMonthly: v.optional(v.boolean()),
    autoSendGlobal: v.optional(v.boolean()),
    autoSendDebtors: v.optional(v.array(v.string())),
    notifyEmail: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const business = await ctx.db.get(args.businessId as Id<"businesses">);
    if (!business) throw new Error("Business not found");

    const current = business.reportSettings ?? {};
    const updated = {
      ...current,
      ...(args.autoGenerateMonthly !== undefined && {
        autoGenerateMonthly: args.autoGenerateMonthly,
      }),
      ...(args.autoSendGlobal !== undefined && {
        autoSendGlobal: args.autoSendGlobal,
      }),
      ...(args.autoSendDebtors !== undefined && {
        autoSendDebtors: args.autoSendDebtors,
      }),
      ...(args.notifyEmail !== undefined && {
        notifyEmail: args.notifyEmail,
      }),
    };

    await ctx.db.patch(args.businessId as Id<"businesses">, {
      reportSettings: updated,
    });
  },
});

// ============================================
// INTERNAL MUTATIONS (for backend actions)
// ============================================

/**
 * Create a generated report record
 */
export const createReport = internalMutation({
  args: {
    businessId: v.string(),
    reportType: v.union(v.literal("ap_aging"), v.literal("ar_aging")),
    reportScope: v.union(
      v.literal("consolidated"),
      v.literal("debtor_statement"),
      v.literal("vendor_statement")
    ),
    asOfDate: v.string(),
    periodMonth: v.string(),
    generationMethod: v.union(v.literal("manual"), v.literal("auto_monthly")),
    generatedBy: v.string(),
    s3Key: v.string(),
    s3Bucket: v.string(),
    fileSizeBytes: v.optional(v.number()),
    entityId: v.optional(v.string()),
    entityName: v.optional(v.string()),
    totalOutstanding: v.number(),
    currency: v.string(),
    hasWarnings: v.boolean(),
    aiInsightsSummary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const expiresAt = Date.now() + TWELVE_MONTHS_MS;

    return await ctx.db.insert("generated_reports", {
      businessId: args.businessId as Id<"businesses">,
      reportType: args.reportType,
      reportScope: args.reportScope,
      asOfDate: args.asOfDate,
      periodMonth: args.periodMonth,
      generationMethod: args.generationMethod,
      generatedBy: args.generatedBy,
      s3Key: args.s3Key,
      s3Bucket: args.s3Bucket,
      fileSizeBytes: args.fileSizeBytes,
      entityId: args.entityId,
      entityName: args.entityName,
      totalOutstanding: args.totalOutstanding,
      currency: args.currency,
      hasWarnings: args.hasWarnings,
      aiInsightsSummary: args.aiInsightsSummary,
      expiresAt,
    });
  },
});

/**
 * Create a debtor statement send record
 */
export const createStatementSend = internalMutation({
  args: {
    businessId: v.string(),
    reportId: v.string(),
    customerId: v.string(),
    customerName: v.string(),
    customerEmail: v.optional(v.string()),
    totalOutstanding: v.number(),
    invoiceCount: v.number(),
    sendStatus: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("auto_sent"),
      v.literal("failed"),
      v.literal("no_email")
    ),
    periodMonth: v.string(),
    hasDisclaimer: v.boolean(),
    autoSendEnabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("debtor_statement_sends", {
      businessId: args.businessId as Id<"businesses">,
      reportId: args.reportId as Id<"generated_reports">,
      customerId: args.customerId,
      customerName: args.customerName,
      customerEmail: args.customerEmail,
      totalOutstanding: args.totalOutstanding,
      invoiceCount: args.invoiceCount,
      sendStatus: args.sendStatus,
      periodMonth: args.periodMonth,
      hasDisclaimer: args.hasDisclaimer,
      autoSendEnabled: args.autoSendEnabled,
    });
  },
});

/**
 * Delete expired reports (12-month retention cleanup)
 */
export const deleteExpiredReports = internalMutation({
  args: {
    before: v.number(),
  },
  handler: async (ctx, args) => {
    const expired = await ctx.db
      .query("generated_reports")
      .withIndex("by_expiry", (q) => q.lt("expiresAt", args.before))
      .take(100); // batch to avoid timeout

    let deleted = 0;
    for (const report of expired) {
      // Delete related statement sends
      const sends = await ctx.db
        .query("debtor_statement_sends")
        .withIndex("by_report", (q) => q.eq("reportId", report._id))
        .collect();

      for (const send of sends) {
        await ctx.db.delete(send._id);
      }

      await ctx.db.delete(report._id);
      deleted++;
    }

    return { deleted };
  },
});

// ============================================
// PRE-GENERATION RECONCILIATION CHECK (FR-015)
// ============================================

/**
 * Check for unreconciled bank deposits that might match outstanding AR invoices.
 * Runs before monthly report generation to flag potential accuracy issues.
 *
 * Tier 1 matching: amount + date proximity (within 7 days of invoice due date).
 * Returns potential matches for owner review.
 */
export const checkUnreconciledMatches = internalQuery({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const businessId = args.businessId as Id<"businesses">;

    // Get unreconciled bank deposits from last 45 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 45);
    const cutoffStr = cutoffDate.toISOString().split("T")[0];

    const bankTxns = await ctx.db
      .query("bank_transactions")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();

    const unreconciledDeposits = bankTxns.filter(
      (t) =>
        !t.deletedAt &&
        t.reconciliationStatus === "unmatched" &&
        t.direction === "credit" &&
        t.transactionDate >= cutoffStr
    );

    if (unreconciledDeposits.length === 0) {
      return { matches: [], matchCount: 0 };
    }

    // Get outstanding AR invoices
    const arInvoices = await ctx.db
      .query("sales_invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();

    const outstandingInvoices = arInvoices.filter(
      (inv) =>
        !inv.deletedAt &&
        inv.balanceDue > 0 &&
        ["sent", "partially_paid", "overdue"].includes(inv.status)
    );

    // Tier 1 matching: amount match + date proximity
    const matches: Array<{
      bankTransactionId: string;
      bankDescription: string;
      bankAmount: number;
      bankDate: string;
      matchedInvoiceId: string;
      matchedInvoiceNumber: string;
      matchedCustomerName: string;
      matchedAmount: number;
      confidence: number;
    }> = [];

    for (const deposit of unreconciledDeposits) {
      for (const invoice of outstandingInvoices) {
        // Amount match (exact or within 1% tolerance for rounding)
        const amountDiff = Math.abs(deposit.amount - invoice.balanceDue);
        const tolerance = invoice.balanceDue * 0.01;

        if (amountDiff <= tolerance) {
          // Date proximity check (deposit within 7 days of due date)
          const depositDate = new Date(deposit.transactionDate + "T00:00:00Z");
          const dueDate = new Date((invoice.dueDate || deposit.transactionDate) + "T00:00:00Z");
          const daysDiff = Math.abs(
            (depositDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysDiff <= 7) {
            matches.push({
              bankTransactionId: deposit._id,
              bankDescription: deposit.description,
              bankAmount: deposit.amount,
              bankDate: deposit.transactionDate,
              matchedInvoiceId: invoice._id,
              matchedInvoiceNumber: invoice.invoiceNumber || "N/A",
              matchedCustomerName: invoice.customerSnapshot?.businessName || "Unknown",
              matchedAmount: invoice.balanceDue,
              confidence: amountDiff === 0 ? 0.95 : 0.85,
            });
          }
        }
      }
    }

    return { matches, matchCount: matches.length };
  },
});

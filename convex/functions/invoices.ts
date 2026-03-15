/**
 * Invoice Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Invoice/document CRUD operations
 * - Document processing workflow (upload → classify → extract → complete)
 * - Role-based access control
 * - Processing status management
 */

import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";
import { internal } from "../_generated/api";
import { createInvoiceJournalEntry, createPaymentJournalEntry } from "../lib/journal_entry_helpers";

// Helper: require finance admin role (owner/finance_admin/manager)
async function requireFinanceAdminForInvoices(
  ctx: { db: import("../_generated/server").DatabaseReader; auth: { getUserIdentity: () => Promise<{ subject: string } | null> } },
  businessId: Id<"businesses">
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const user = await resolveUserByClerkId(ctx.db, identity.subject);
  if (!user) throw new Error("User not found");

  const membership = await ctx.db
    .query("business_memberships")
    .withIndex("by_userId_businessId", (q) =>
      q.eq("userId", user._id).eq("businessId", businessId)
    )
    .first();

  if (!membership || membership.status !== "active") {
    throw new Error("Not a member of this business");
  }

  if (!["owner", "finance_admin", "manager"].includes(membership.role)) {
    throw new Error("Not authorized: finance admin required");
  }

  return { user, membership };
}

// Processing status values for invoices
const INVOICE_STATUSES = [
  "pending",
  "uploading",
  "classifying",
  "extracting",
  "processing",
  "completed",
  "failed",
  "cancelled",
  "paid",
  "overdue",
  "classification_failed",
] as const;

// ============================================
// QUERIES
// ============================================

/**
 * List invoices with filtering and role-based access
 * - Owners/Admins: See all invoices in business
 * - Managers: See their own + direct reports
 * - Employees: See only their own invoices
 */
export const list = query({
  args: {
    businessId: v.optional(v.id("businesses")),
    status: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { invoices: [], nextCursor: null };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { invoices: [], nextCursor: null };
    }

    const limit = args.limit ?? 50;

    // If businessId provided, apply business-level access control
    if (args.businessId) {
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", args.businessId!)
        )
        .first();

      if (!membership || membership.status !== "active") {
        return { invoices: [], nextCursor: null };
      }

      let invoices = await ctx.db
        .query("invoices")
        .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId!))
        .collect();

      // Apply role-based filtering
      const role = membership.role;
      if (role === "employee") {
        invoices = invoices.filter((inv) => inv.userId === user._id);
      } else if (role === "manager") {
        // Get all memberships for business, then filter by managerId in JS
        // (Convex doesn't support .filter() after .withIndex())
        const allMemberships = await ctx.db
          .query("business_memberships")
          .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId!))
          .collect();

        const directReports = allMemberships.filter((m) => m.managerId === user._id);
        const reportIds = new Set(directReports.map((m) => m.userId));
        reportIds.add(user._id);

        invoices = invoices.filter((inv) => reportIds.has(inv.userId));
      }

      // Apply status filter
      if (args.status) {
        invoices = invoices.filter((inv) => inv.status === args.status);
      }

      // Apply user filter
      if (args.userId) {
        invoices = invoices.filter((inv) => inv.userId === args.userId);
      }

      // Filter soft-deleted
      invoices = invoices.filter((inv) => !inv.deletedAt);

      // Only show supplier invoices (AP domain). Exclude any records tagged as expense_claims,
      // or any records whose storagePath indicates they came from the expense_claims pipeline.
      invoices = invoices.filter((inv) => {
        if (inv.documentDomain === "expense_claims") return false;
        if (inv.storagePath && inv.storagePath.startsWith("expense_claims/")) return false;
        return true;
      });

      // Sort by creation time (newest first)
      invoices.sort((a, b) => b._creationTime - a._creationTime);

      // Pagination
      const startIndex = args.cursor ? parseInt(args.cursor, 10) : 0;
      const paginatedInvoices = invoices.slice(startIndex, startIndex + limit);
      const nextCursor =
        startIndex + limit < invoices.length
          ? String(startIndex + limit)
          : null;

      // Fetch linked journal entries for invoices that have journalEntryId
      const journalEntryIds = paginatedInvoices
        .map((inv) => inv.journalEntryId)
        .filter(Boolean);
      const journalEntries = await Promise.all(
        journalEntryIds.map((id) => ctx.db.get(id as any))
      );
      const jeMap = new Map(
        journalEntries.filter(Boolean).map((je) => [je!._id.toString(), je!])
      );

      const invoicesWithLinks = paginatedInvoices.map((invoice) => {
        const je = invoice.journalEntryId ? jeMap.get(invoice.journalEntryId.toString()) : null;
        return {
          ...invoice,
          linkedTransaction: je
            ? {
                id: je._id,
                description: (je as any).description || "",
                originalAmount: (je as any).totalDebit,
                originalCurrency: (je as any).homeCurrency || "MYR",
                createdAt: je._creationTime,
              }
            : null,
        };
      });

      return {
        invoices: invoicesWithLinks,
        nextCursor,
        totalCount: invoices.length,
      };
    }

    // No businessId - return user's own invoices across all businesses
    let invoices = await ctx.db
      .query("invoices")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Apply status filter
    if (args.status) {
      invoices = invoices.filter((inv) => inv.status === args.status);
    }

    // Filter soft-deleted
    invoices = invoices.filter((inv) => !inv.deletedAt);

    // Sort
    invoices.sort((a, b) => b._creationTime - a._creationTime);

    // Pagination
    const startIndex = args.cursor ? parseInt(args.cursor, 10) : 0;
    const paginatedInvoices = invoices.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < invoices.length
        ? String(startIndex + limit)
        : null;

    // Use journalEntryId directly on invoices (no accounting_entries lookup needed)
    const jeIds2 = paginatedInvoices.map((inv) => inv.journalEntryId).filter(Boolean);
    const jes2 = await Promise.all(jeIds2.map((id) => ctx.db.get(id as any)));
    const jeMap2 = new Map(jes2.filter(Boolean).map((je) => [je!._id.toString(), je!]));

    const invoicesWithLinks = paginatedInvoices.map((invoice) => {
      const je = invoice.journalEntryId ? jeMap2.get(invoice.journalEntryId.toString()) : null;
      return {
        ...invoice,
        linkedTransaction: je
          ? {
              id: je._id,
              description: (je as any).description || "",
              originalAmount: (je as any).totalDebit,
              originalCurrency: (je as any).homeCurrency || "MYR",
              createdAt: je._creationTime,
            }
          : null,
      };
    });

    return {
      invoices: invoicesWithLinks,
      nextCursor,
      totalCount: invoices.length,
    };
  },
});

/**
 * Get single invoice by ID with access control
 */
export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    console.log(`[getById] Looking up invoice: ${args.id}`);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      console.log(`[getById] No auth identity for invoice: ${args.id}`);
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      console.log(`[getById] User not found for clerk ID: ${identity.subject}, invoice: ${args.id}`);
      return null;
    }

    // Resolve ID (supports both Convex ID and legacy UUID)
    const invoice = await resolveById(ctx.db, "invoices", args.id);
    if (!invoice || invoice.deletedAt) {
      console.log(`[getById] Invoice not found or deleted: ${args.id}, found: ${!!invoice}, deleted: ${invoice?.deletedAt}`);
      return null;
    }

    console.log(`[getById] Found invoice ${args.id}, owner: ${invoice.userId}, current user: ${user._id}`);

    // Check access - user owns invoice or has business membership
    if (invoice.userId === user._id) {
      return invoice;
    }

    // Check business membership if businessId exists
    if (invoice.businessId) {
      console.log(`[getById] Invoice ${args.id} has businessId: ${invoice.businessId}, checking membership...`);

      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", invoice.businessId!)
        )
        .first();

      if (!membership || membership.status !== "active") {
        console.log(`[getById] ACCESS DENIED: No active membership for user ${user._id} in business ${invoice.businessId}, invoice: ${args.id}, membership: ${membership ? membership.status : 'none'}`);
        return null;
      }

      // Role-based access
      const role = membership.role;
      console.log(`[getById] User ${user._id} has role '${role}' in business ${invoice.businessId}`);

      if (role === "employee" && invoice.userId !== user._id) {
        console.log(`[getById] ACCESS DENIED: Employee ${user._id} cannot access invoice ${args.id} owned by ${invoice.userId}`);
        return null;
      }

      if (role === "manager" && invoice.userId !== user._id) {
        const submitterMembership = await ctx.db
          .query("business_memberships")
          .withIndex("by_userId_businessId", (q) =>
            q.eq("userId", invoice.userId).eq("businessId", invoice.businessId!)
          )
          .first();

        if (!submitterMembership || submitterMembership.managerId !== user._id) {
          console.log(`[getById] ACCESS DENIED: Manager ${user._id} not direct manager of invoice owner ${invoice.userId}, invoice: ${args.id}`);
          return null;
        }
      }

      console.log(`[getById] ACCESS GRANTED via business membership for invoice ${args.id}`);
      return invoice;
    }

    // No businessId set and user doesn't own invoice
    console.log(`[getById] ACCESS DENIED: Invoice ${args.id} has no businessId and user ${user._id} doesn't own it (owner: ${invoice.userId})`);
    return null;
  },
});

/**
 * Get invoices by processing status
 */
export const getByStatus = query({
  args: {
    businessId: v.id("businesses"),
    status: v.union(
      v.literal("pending"),
      v.literal("uploading"),
      v.literal("analyzing"),
      v.literal("classifying"),
      v.literal("extracting"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
      v.literal("paid"),
      v.literal("overdue"),
      v.literal("disputed"),
      v.literal("classification_failed")
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Verify membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    // Fetch all invoices for business, then filter by status in JS
    // (Convex doesn't support .filter() after .withIndex())
    const allInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    return allInvoices.filter((inv) => inv.status === args.status && !inv.deletedAt);
  },
});

/**
 * Get processing statistics for dashboard
 */
export const getProcessingStats = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    // Verify finance_admin/owner access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.role !== "owner") {
      return null;
    }

    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const activeInvoices = invoices.filter((inv) => !inv.deletedAt);

    // Calculate stats
    const statusCounts: Record<string, number> = {};
    let totalProcessingTime = 0;
    let completedCount = 0;
    let failedCount = 0;
    let requiresReviewCount = 0;

    for (const inv of activeInvoices) {
      statusCounts[inv.status] = (statusCounts[inv.status] || 0) + 1;

      if (inv.status === "completed" && inv.processingStartedAt && inv.processedAt) {
        totalProcessingTime += inv.processedAt - inv.processingStartedAt;
        completedCount++;
      }

      if (inv.status === "failed" || inv.status === "classification_failed") {
        failedCount++;
      }

      if (inv.requiresReview) {
        requiresReviewCount++;
      }
    }

    return {
      totalInvoices: activeInvoices.length,
      statusCounts,
      averageProcessingTime: completedCount > 0 ? totalProcessingTime / completedCount : 0,
      successRate: activeInvoices.length > 0
        ? ((activeInvoices.length - failedCount) / activeInvoices.length) * 100
        : 0,
      requiresReviewCount,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new invoice record
 */
export const create = mutation({
  args: {
    businessId: v.optional(v.id("businesses")),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    storagePath: v.optional(v.string()), // Optional - set after upload with Convex ID
    status: v.optional(
      v.union(v.literal("pending"), v.literal("uploading"))
    ),
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

    // If businessId provided, verify membership
    if (args.businessId) {
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", args.businessId!)
        )
        .first();

      if (!membership || membership.status !== "active") {
        throw new Error("Not a member of this business");
      }
    }

    const invoiceId = await ctx.db.insert("invoices", {
      businessId: args.businessId,
      userId: user._id,
      fileName: args.fileName,
      fileType: args.fileType,
      fileSize: args.fileSize,
      storagePath: args.storagePath ?? "", // Empty string if not provided
      status: args.status ?? "uploading", // Default to 'uploading' when creating
      documentDomain: "invoices", // Tag all records created through invoices.create as supplier invoices
      updatedAt: Date.now(),
    });

    return invoiceId;
  },
});

/**
 * Update invoice fields
 */
export const update = mutation({
  args: {
    id: v.string(),
    storagePath: v.optional(v.string()),  // S3 storage path (without domain prefix)
    convertedImagePath: v.optional(v.string()),
    convertedImageWidth: v.optional(v.number()),
    convertedImageHeight: v.optional(v.number()),
    processingMethod: v.optional(v.string()),
    processingTier: v.optional(v.number()),
    confidenceScore: v.optional(v.number()),
    documentClassificationConfidence: v.optional(v.number()),
    classificationMethod: v.optional(v.string()),
    classificationTaskId: v.optional(v.string()),
    extractionTaskId: v.optional(v.string()),
    extractedData: v.optional(v.any()),
    processingMetadata: v.optional(v.any()),
    documentMetadata: v.optional(v.any()),
    errorMessage: v.optional(v.any()),
    requiresReview: v.optional(v.boolean()),
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

    const invoice = await resolveById(ctx.db, "invoices", args.id);
    if (!invoice || invoice.deletedAt) {
      throw new Error("Invoice not found");
    }

    // Check ownership or finance_admin access
    if (invoice.userId !== user._id && invoice.businessId) {
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", invoice.businessId!)
        )
        .first();

      if (!membership || membership.role !== "owner") {
        throw new Error("Not authorized to update this invoice");
      }
    }

    const { id, ...updates } = args;
    const updateData: Record<string, unknown> = { updatedAt: Date.now() };

    // Only include provided fields
    if (updates.storagePath !== undefined)
      updateData.storagePath = updates.storagePath;
    if (updates.convertedImagePath !== undefined)
      updateData.convertedImagePath = updates.convertedImagePath;
    if (updates.convertedImageWidth !== undefined)
      updateData.convertedImageWidth = updates.convertedImageWidth;
    if (updates.convertedImageHeight !== undefined)
      updateData.convertedImageHeight = updates.convertedImageHeight;
    if (updates.processingMethod !== undefined)
      updateData.processingMethod = updates.processingMethod;
    if (updates.processingTier !== undefined)
      updateData.processingTier = updates.processingTier;
    if (updates.confidenceScore !== undefined)
      updateData.confidenceScore = updates.confidenceScore;
    if (updates.documentClassificationConfidence !== undefined)
      updateData.documentClassificationConfidence = updates.documentClassificationConfidence;
    if (updates.classificationMethod !== undefined)
      updateData.classificationMethod = updates.classificationMethod;
    if (updates.classificationTaskId !== undefined)
      updateData.classificationTaskId = updates.classificationTaskId;
    if (updates.extractionTaskId !== undefined)
      updateData.extractionTaskId = updates.extractionTaskId;
    if (updates.extractedData !== undefined)
      updateData.extractedData = updates.extractedData;
    if (updates.processingMetadata !== undefined)
      updateData.processingMetadata = updates.processingMetadata;
    if (updates.documentMetadata !== undefined)
      updateData.documentMetadata = updates.documentMetadata;
    if (updates.errorMessage !== undefined)
      updateData.errorMessage = updates.errorMessage;
    if (updates.requiresReview !== undefined)
      updateData.requiresReview = updates.requiresReview;

    await ctx.db.patch(invoice._id, updateData);
    return invoice._id;
  },
});

/**
 * Update invoice processing status with workflow logic
 */
export const updateStatus = mutation({
  args: {
    id: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("uploading"),
      v.literal("analyzing"),
      v.literal("classifying"),
      v.literal("extracting"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("cancelled"),
      v.literal("paid"),
      v.literal("overdue"),
      v.literal("disputed"),
      v.literal("classification_failed")
    ),
    errorMessage: v.optional(v.any()),
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

    const invoice = await resolveById(ctx.db, "invoices", args.id);
    if (!invoice || invoice.deletedAt) {
      throw new Error("Invoice not found");
    }

    // Check authorization
    if (invoice.userId !== user._id && invoice.businessId) {
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", invoice.businessId!)
        )
        .first();

      if (!membership || membership.status !== "active") {
        throw new Error("Not authorized");
      }
    }

    const now = Date.now();
    const updateData: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };

    // Status transition logic
    switch (args.status) {
      case "uploading":
      case "classifying":
      case "extracting":
      case "processing":
        if (!invoice.processingStartedAt) {
          updateData.processingStartedAt = now;
        }
        break;

      case "completed":
        updateData.processedAt = now;

        // Trigger auto-matching if invoice has a PO reference
        const extracted = (invoice as any).extractedData as any;
        if (extracted) {
          const purchaseOrderRef =
            extracted.purchase_order_number?.value ??
            extracted.purchase_order_number ??
            extracted.purchaseOrderNumber ??
            extracted.po_number ??
            extracted.poNumber ??
            extracted.po_ref ??
            extracted.purchaseOrderRef ??
            null;

          if (purchaseOrderRef && typeof purchaseOrderRef === "string" && purchaseOrderRef.trim() !== "") {
            // Schedule async auto-match
            await ctx.scheduler.runAfter(0, internal.functions.poMatches.tryAutoMatchInternal, {
              invoiceId: invoice._id,
            });
          }
        }
        break;

      case "failed":
      case "classification_failed":
        updateData.failedAt = now;
        if (args.errorMessage) {
          updateData.errorMessage = args.errorMessage;
        }
        break;

      case "cancelled":
        // No special handling
        break;

      case "paid":
        // Mark as paid (usually after transaction created)
        break;

      case "overdue":
        // Mark as overdue
        break;
    }

    await ctx.db.patch(invoice._id, updateData);
    return invoice._id;
  },
});

/**
 * Soft delete invoice
 */
export const softDelete = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    console.log(`[softDelete] Attempting to delete invoice: ${args.id}`);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      console.log(`[softDelete] No auth identity for invoice: ${args.id}`);
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      console.log(`[softDelete] User not found for clerk ID: ${identity.subject}`);
      throw new Error("User not found");
    }

    const invoice = await resolveById(ctx.db, "invoices", args.id);
    if (!invoice || invoice.deletedAt) {
      console.log(`[softDelete] Invoice not found: ${args.id}, found: ${!!invoice}, deleted: ${invoice?.deletedAt}`);
      throw new Error(`Invoice not found: ${args.id}`);
    }

    console.log(`[softDelete] Found invoice ${args.id}, owner: ${invoice.userId}, current user: ${user._id}`);

    // Check ownership or finance_admin access
    if (invoice.userId !== user._id && invoice.businessId) {
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", invoice.businessId!)
        )
        .first();

      if (!membership || membership.role !== "owner") {
        throw new Error("Not authorized to delete this invoice");
      }
    }

    // Can't delete completed invoices that may have transactions
    if (invoice.status === "completed" || invoice.status === "paid") {
      throw new Error("Cannot delete processed invoices");
    }

    await ctx.db.patch(invoice._id, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Get invoice by task ID (from processingMetadata)
 * Used by task.service.ts to look up document processing status
 */
export const getByTaskId = query({
  args: {
    taskId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    // Get user's invoices and filter by task_id in processingMetadata
    const invoices = await ctx.db
      .query("invoices")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Filter by task_id in processingMetadata (JSON field)
    const matchingInvoice = invoices.find((invoice) => {
      if (!invoice.processingMetadata || invoice.deletedAt) {
        return false;
      }
      // processingMetadata.task_id or processingMetadata.classification_task_id
      const metadata = invoice.processingMetadata as Record<string, unknown>;
      return (
        metadata.task_id === args.taskId ||
        metadata.classification_task_id === args.taskId ||
        metadata.extraction_task_id === args.taskId
      );
    });

    return matchingInvoice || null;
  },
});

/**
 * Retry failed invoice processing
 */
export const retryProcessing = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    const invoice = await resolveById(ctx.db, "invoices", args.id);
    if (!invoice || invoice.deletedAt) {
      throw new Error("Invoice not found");
    }

    // Can only retry failed invoices
    if (invoice.status !== "failed" && invoice.status !== "classification_failed") {
      throw new Error("Can only retry failed invoices");
    }

    // Check authorization
    if (invoice.userId !== user._id && invoice.businessId) {
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", invoice.businessId!)
        )
        .first();

      if (!membership || membership.status !== "active") {
        throw new Error("Not authorized");
      }
    }

    // Reset to pending for reprocessing
    await ctx.db.patch(invoice._id, {
      status: "pending",
      errorMessage: undefined,
      failedAt: undefined,
      processingStartedAt: undefined,
      processedAt: undefined,
      updatedAt: Date.now(),
    });

    return invoice._id;
  },
});

// ============================================
// INTERNAL MUTATIONS (for Trigger.dev tasks)
// These bypass user auth - only call from trusted backend
// ============================================

/**
 * Internal: Get invoice by ID (no auth required)
 * Used by Trigger.dev tasks to fetch document details
 */
export const internalGetById = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const invoice = await resolveById(ctx.db, "invoices", args.id);
    if (!invoice || invoice.deletedAt) {
      return null;
    }
    return invoice;
  },
});

/**
 * Internal: Update invoice status (no auth required)
 * Used by Trigger.dev tasks during document processing
 */
export const internalUpdateStatus = internalMutation({
  args: {
    id: v.string(),
    status: v.string(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const invoice = await resolveById(ctx.db, "invoices", args.id);
    if (!invoice) {
      throw new Error(`Invoice not found: ${args.id}`);
    }

    const now = Date.now();
    const updateData: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };

    // Status transition logic
    if (["classifying", "extracting", "processing", "analyzing"].includes(args.status)) {
      if (!invoice.processingStartedAt) {
        updateData.processingStartedAt = now;
      }
    }

    if (args.status === "completed" || args.status === "pending") {
      updateData.processedAt = now;
    }

    if (args.status === "failed" || args.status === "classification_failed") {
      updateData.failedAt = now;
      if (args.errorMessage) {
        updateData.errorMessage = args.errorMessage;
      }
    }

    await ctx.db.patch(invoice._id, updateData);
    console.log(`[Convex Internal] Updated invoice ${args.id} status to: ${args.status}`);
    return invoice._id;
  },
});

/**
 * Internal: Update extraction results (no auth required)
 * Used by Trigger.dev after successful document extraction
 */
export const internalUpdateExtraction = internalMutation({
  args: {
    id: v.string(),
    extractedData: v.any(),
    confidenceScore: v.optional(v.number()),
    extractionMethod: v.optional(v.string()),
    modelUsed: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const invoice = await resolveById(ctx.db, "invoices", args.id);
    if (!invoice) {
      throw new Error(`Invoice not found: ${args.id}`);
    }

    const now = Date.now();
    const updateData: Record<string, unknown> = {
      status: "pending", // Extraction complete, ready for review
      extractedData: args.extractedData,
      processedAt: now,
      updatedAt: now,
      // Clear stale error fields from any previous failed attempts
      errorMessage: undefined,
      failedAt: undefined,
    };

    if (args.confidenceScore !== undefined) {
      updateData.confidenceScore = args.confidenceScore;
    }
    if (args.extractionMethod !== undefined) {
      updateData.processingMethod = args.extractionMethod;
    }

    await ctx.db.patch(invoice._id, updateData);
    console.log(`[Convex Internal] Updated invoice ${args.id} extraction results`);

    // ============================================
    // Auto-post journal entry for AP invoices
    // Mirrors expense claims (on approval) and sales invoices (on send)
    // ============================================
    if (invoice.businessId && invoice.documentDomain !== "expense_claims") {
      const extracted = args.extractedData as Record<string, unknown> | undefined;
      if (extracted) {
        // Duplicate guard: skip if already posted (check journalEntryId on invoice)
        if (!invoice.journalEntryId) {
          const vendorName = (extracted.vendor_name as string) ?? (extracted.vendorName as string) ?? "";
          const totalAmount = (extracted.total_amount as number) ?? (extracted.totalAmount as number) ?? 0;
          const currency = (extracted.currency as string) ?? "MYR";
          const invoiceDate = (extracted.invoice_date as string) ?? (extracted.invoiceDate as string) ?? new Date(now).toISOString().split("T")[0];
          const invoiceNumber = (extracted.invoice_number as string) ?? (extracted.invoiceNumber as string) ?? "";
          const description = vendorName
            ? `Invoice from ${vendorName}${invoiceNumber ? ` #${invoiceNumber}` : ""}`
            : `Supplier invoice${invoiceNumber ? ` #${invoiceNumber}` : ""}`;

          // Look up vendor record for entityId link
          let matchedVendor: { _id: any } | undefined;
          if (vendorName && invoice.businessId) {
            const vendors = await ctx.db
              .query("vendors")
              .withIndex("by_businessId", (q) => q.eq("businessId", invoice.businessId!))
              .collect();
            matchedVendor = vendors.find((v) => v.name === vendorName);
          }

          // Get expense account (default 5200)
          const expenseAccount = await ctx.db
            .query("chart_of_accounts")
            .withIndex("by_business_code", (q) =>
              q.eq("businessId", invoice.businessId!).eq("accountCode", "5200")
            )
            .first();

          if (!expenseAccount) {
            throw new Error("Expense account 5200 not found");
          }

          // Get AP account (2100)
          const apAccount = await ctx.db
            .query("chart_of_accounts")
            .withIndex("by_business_code", (q) =>
              q.eq("businessId", invoice.businessId!).eq("accountCode", "2100")
            )
            .first();

          if (!apAccount) {
            throw new Error("AP account 2100 not found");
          }

          // Create journal entry lines
          const lines = createInvoiceJournalEntry({
            amount: totalAmount,
            expenseAccountId: expenseAccount._id,
            expenseAccountCode: expenseAccount.accountCode,
            expenseAccountName: expenseAccount.accountName,
            description,
            apAccountId: apAccount._id,
            apAccountCode: apAccount.accountCode,
            apAccountName: apAccount.accountName,
          });

          // Create journal entry via internal API
          const { entryId: journalEntryId } = await ctx.runMutation(
            internal.functions.journalEntries.createInternal,
            {
              businessId: invoice.businessId!,
              transactionDate: invoiceDate,
              description,
              sourceType: "vendor_invoice",
              sourceId: invoice._id,
              lines: lines.map((l, index) => ({
                accountCode: l.accountCode,
                debitAmount: l.debitAmount,
                creditAmount: l.creditAmount,
                lineDescription: l.lineDescription,
                // Add vendor entity tracking to AP line (credit line)
                ...(index === 1 && matchedVendor ? {
                  entityType: "vendor" as const,
                  entityId: matchedVendor._id,
                  entityName: vendorName,
                } : {}),
              })),
            }
          );

          // Update invoice with journal entry reference
          await ctx.db.patch(invoice._id, {
            journalEntryId,
            accountingStatus: "posted",
          });

          console.log(`[Convex Internal] Auto-posted journal entry ${journalEntryId} for AP invoice ${args.id}`);
        } else {
          console.log(`[Convex Internal] Skipped auto-post for invoice ${args.id} — accounting entry already exists`);
        }
      }
    }

    return invoice._id;
  },
});

/**
 * Internal: Update classification results (no auth required)
 * Used by Trigger.dev after document classification
 */
export const internalUpdateClassification = internalMutation({
  args: {
    id: v.string(),
    classification: v.object({
      isSupported: v.boolean(),
      documentType: v.optional(v.string()),
      confidenceScore: v.optional(v.number()),
      classificationMethod: v.optional(v.string()),
      modelUsed: v.optional(v.string()),
      reasoning: v.optional(v.string()),
      detectedElements: v.optional(v.any()),
      userMessage: v.optional(v.string()),
    }),
    taskId: v.string(),
  },
  handler: async (ctx, args) => {
    const invoice = await resolveById(ctx.db, "invoices", args.id);
    if (!invoice) {
      throw new Error(`Invoice not found: ${args.id}`);
    }

    const now = Date.now();
    const status = args.classification.isSupported ? "analyzing" : "classification_failed";

    const updateData: Record<string, unknown> = {
      status,
      documentClassificationConfidence: args.classification.confidenceScore,
      classificationMethod: args.classification.classificationMethod,
      classificationTaskId: args.taskId,
      documentMetadata: {
        isSupported: args.classification.isSupported,
        documentType: args.classification.documentType,
        reasoning: args.classification.reasoning,
        detectedElements: args.classification.detectedElements,
        userMessage: args.classification.userMessage,
        modelUsed: args.classification.modelUsed,
        confidenceScore: args.classification.confidenceScore,
      },
      updatedAt: now,
    };

    if (!args.classification.isSupported) {
      updateData.failedAt = now;
    }

    await ctx.db.patch(invoice._id, updateData);
    console.log(`[Convex Internal] Updated invoice ${args.id} classification`);
    return invoice._id;
  },
});

/**
 * Internal: Create vendor and record price history from extracted data
 * Called after invoice extraction completes to populate vendor master data
 */
export const internalProcessVendorFromExtraction = internalMutation({
  args: {
    invoiceId: v.string(),
  },
  handler: async (ctx, args): Promise<
    | { success: false; reason: string }
    | { success: true; vendorId: Id<"vendors">; vendorCreated: boolean; priceObservationsCount: number }
  > => {
    const invoice = await resolveById(ctx.db, "invoices", args.invoiceId);
    if (!invoice) {
      throw new Error(`Invoice not found: ${args.invoiceId}`);
    }

    if (!invoice.businessId) {
      console.log(`[Vendor Integration] Skipping - no businessId on invoice ${args.invoiceId}`);
      return { success: false, reason: "no_business_id" };
    }

    const extractedData = invoice.extractedData as {
      vendor_name?: string;
      vendor_address?: string;
      vendor_contact?: string;
      vendor_tax_id?: string;
      vendor_email?: string;
      vendor_phone?: string;
      line_items?: Array<{
        item_description?: string;
        description?: string;
        item_code?: string;
        unit_price?: number;
        quantity?: number;
        currency?: string;
        total_amount?: number;
      }>;
      transaction_date?: string;
      invoice_date?: string;
      currency?: string;
    } | null;

    if (!extractedData) {
      console.log(`[Vendor Integration] Skipping - no extractedData on invoice ${args.invoiceId}`);
      return { success: false, reason: "no_extracted_data" };
    }

    const vendorName = extractedData.vendor_name?.trim();
    if (!vendorName) {
      console.log(`[Vendor Integration] Skipping - no vendor name in extraction for ${args.invoiceId}`);
      return { success: false, reason: "no_vendor_name" };
    }

    // Upsert vendor - creates if new (prospective status), returns existing if found
    const vendorResult = await ctx.runMutation(internal.functions.vendors.upsertByName, {
      businessId: invoice.businessId,
      vendorName: vendorName,
      email: extractedData.vendor_email,
      phone: extractedData.vendor_phone,
      address: extractedData.vendor_address,
      taxId: extractedData.vendor_tax_id,
    });

    console.log(`[Vendor Integration] Vendor upserted for invoice ${args.invoiceId}: ${vendorResult.vendorId} (created: ${vendorResult.created})`);

    // Record price observations from line items
    const lineItems = extractedData.line_items ?? [];
    const observedAt = extractedData.transaction_date || extractedData.invoice_date || new Date().toISOString().split("T")[0];
    const defaultCurrency = extractedData.currency || "MYR";

    const priceObservations = lineItems
      .filter((item) => {
        const desc = item.item_description || item.description;
        return desc && item.unit_price !== undefined && item.unit_price > 0;
      })
      .map((item) => ({
        itemDescription: (item.item_description || item.description)!,
        itemCode: item.item_code,
        unitPrice: item.unit_price!,
        currency: item.currency || defaultCurrency,
        quantity: item.quantity ?? 1,
      }));

    if (priceObservations.length > 0) {
      await ctx.runMutation(internal.functions.vendorPriceHistory.recordPriceObservationsBatch, {
        businessId: invoice.businessId,
        vendorId: vendorResult.vendorId,
        sourceType: "invoice",
        sourceId: args.invoiceId,
        observedAt,
        lineItems: priceObservations,
      });
      console.log(`[Vendor Integration] Recorded ${priceObservations.length} price observations for invoice ${args.invoiceId}`);
    }

    return {
      success: true,
      vendorId: vendorResult.vendorId,
      vendorCreated: vendorResult.created,
      priceObservationsCount: priceObservations.length,
    };
  },
});

// ============================================
// STUCK RECORDS MONITORING (for finance_admin operations)
// ============================================

/**
 * Get stuck invoices/documents for monitoring
 * Finds documents in processing status older than the timeout threshold
 * Used by: /api/v1/system/monitor-stuck-records
 */
export const getStuckInvoices = query({
  args: {
    businessId: v.string(),
    timeoutThreshold: v.number(), // Unix timestamp - records older than this are stuck
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    // Verify finance_admin/manager role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    if (!["owner", "finance_admin", "manager"].includes(membership.role)) {
      return [];
    }

    const limit = args.limit ?? 50;

    // Get invoices/documents in processing status
    let invoices = await ctx.db
      .query("invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter for stuck records (processing/analyzing status + older than threshold)
    invoices = invoices.filter((invoice) => {
      // Check processing statuses that could be "stuck"
      if (!["processing", "analyzing", "classifying", "extracting", "uploading"].includes(invoice.status)) {
        return false;
      }

      // Use processingStartedAt or updatedAt to determine if stuck
      const startTime = invoice.processingStartedAt || invoice.updatedAt || invoice._creationTime;
      return startTime < args.timeoutThreshold;
    });

    // Filter out deleted
    invoices = invoices.filter((invoice) => !invoice.deletedAt);

    // Limit results
    invoices = invoices.slice(0, limit);

    return invoices.map((invoice) => ({
      id: invoice._id,
      status: invoice.status,
      processingStartedAt: invoice.processingStartedAt,
      updatedAt: invoice.updatedAt,
      userId: invoice.userId,
      fileName: invoice.fileName,
    }));
  },
});

/**
 * Batch update stuck invoices/documents to failed status
 * Used by: /api/v1/system/monitor-stuck-records
 */
export const markStuckInvoicesFailed = mutation({
  args: {
    businessId: v.string(),
    records: v.array(
      v.object({
        id: v.string(),
        minutesStuck: v.number(),
        errorMetadata: v.any(),
      })
    ),
    actorUserId: v.string(), // User performing the action (for audit)
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

    // Verify finance_admin/manager role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    if (!["owner", "finance_admin", "manager"].includes(membership.role)) {
      throw new Error("Insufficient permissions");
    }

    const now = Date.now();
    const results = {
      fixed: [] as string[],
      failed: [] as { id: string; error: string }[],
    };

    for (const record of args.records) {
      try {
        const invoice = await resolveById(ctx.db, "invoices", record.id);
        if (!invoice) {
          results.failed.push({ id: record.id, error: "Not found" });
          continue;
        }

        // Verify invoice belongs to this business
        if (invoice.businessId !== business._id) {
          results.failed.push({ id: record.id, error: "Wrong business" });
          continue;
        }

        // Update to failed status
        await ctx.db.patch(invoice._id, {
          status: "failed",
          processingMetadata: record.errorMetadata,
          failedAt: now,
          updatedAt: now,
        });

        results.fixed.push(record.id);
      } catch (error) {
        results.failed.push({
          id: record.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    console.log(
      `[Convex] Marked ${results.fixed.length} stuck invoices as failed`
    );
    return results;
  },
});

// ============================================
// TWO-PHASE EXTRACTION INTERNAL MUTATIONS
// Phase 1: Core fields → immediate render
// Phase 2: Line items → real-time update
// ============================================

/**
 * Internal: Update invoice line items (Phase 2 of two-phase extraction)
 * Called by system.updateInvoiceLineItems after Phase 1 completes
 *
 * Merges line_items into extractedData and updates lineItemsStatus
 */
export const internalUpdateLineItems = internalMutation({
  args: {
    id: v.string(),
    lineItems: v.array(
      v.object({
        description: v.string(),
        quantity: v.optional(v.number()),
        unit_price: v.optional(v.number()),
        line_total: v.number(),
        // Additional fields from Lambda extraction
        item_code: v.optional(v.string()),
        unit_measurement: v.optional(v.string()),
      })
    ),
    lineItemsStatus: v.union(
      v.literal("pending"),
      v.literal("extracting"),
      v.literal("complete"),
      v.literal("skipped")
    ),
  },
  handler: async (ctx, args) => {
    const invoice = await resolveById(ctx.db, "invoices", args.id);
    if (!invoice) {
      throw new Error(`Invoice not found: ${args.id}`);
    }

    const now = Date.now();

    // Merge line_items into existing extractedData
    const existingData = (invoice.extractedData as Record<string, unknown>) || {};
    const updatedExtractedData = {
      ...existingData,
      line_items: args.lineItems,
    };

    await ctx.db.patch(invoice._id, {
      extractedData: updatedExtractedData,
      lineItemsStatus: args.lineItemsStatus,
      updatedAt: now,
    });

    console.log(`[Convex Internal] Updated invoice ${args.id} with ${args.lineItems.length} line items (status: ${args.lineItemsStatus})`);
    return invoice._id;
  },
});

/**
 * Internal: Update invoice lineItemsStatus only (for state transitions)
 * Called by system.updateInvoiceLineItemsStatus
 *
 * Used to mark lineItemsStatus as 'extracting' before Phase 2 starts,
 * or 'skipped' if line items extraction is not needed
 */
export const internalUpdateLineItemsStatus = internalMutation({
  args: {
    id: v.string(),
    lineItemsStatus: v.union(
      v.literal("pending"),
      v.literal("extracting"),
      v.literal("complete"),
      v.literal("skipped")
    ),
  },
  handler: async (ctx, args) => {
    const invoice = await resolveById(ctx.db, "invoices", args.id);
    if (!invoice) {
      throw new Error(`Invoice not found: ${args.id}`);
    }

    await ctx.db.patch(invoice._id, {
      lineItemsStatus: args.lineItemsStatus,
      updatedAt: Date.now(),
    });

    console.log(`[Convex Internal] Updated invoice ${args.id} lineItemsStatus to: ${args.lineItemsStatus}`);
    return invoice._id;
  },
});

/**
 * Force-fail a single invoice/document (finance_admin override)
 * Used by: POST /api/v1/system/monitor-stuck-records
 */
export const forceFailInvoice = mutation({
  args: {
    businessId: v.string(),
    invoiceId: v.string(),
    reason: v.optional(v.string()),
    errorMetadata: v.any(),
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

    // Verify finance_admin role (only finance_admins can force-fail)
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    if (membership.role !== "owner") {
      throw new Error("Owner role required for manual override");
    }

    // Get the invoice
    const invoice = await resolveById(ctx.db, "invoices", args.invoiceId);
    if (!invoice) {
      throw new Error("Invoice not found");
    }

    // Verify invoice belongs to this business
    if (invoice.businessId !== business._id) {
      throw new Error("Invoice not found in this business");
    }

    const now = Date.now();
    const originalStatus = invoice.status;

    // Calculate how long it was stuck
    let minutesStuck = 0;
    if (invoice.processingStartedAt) {
      minutesStuck = Math.floor((now - invoice.processingStartedAt) / (1000 * 60));
    }

    // Update to failed status
    await ctx.db.patch(invoice._id, {
      status: "failed",
      processingMetadata: args.errorMetadata,
      failedAt: now,
      updatedAt: now,
      errorMessage: args.reason || "Manual finance_admin override",
    });

    console.log(
      `[Convex] Admin ${user._id} force-failed invoice ${args.invoiceId}`
    );

    return {
      invoiceId: invoice._id,
      originalStatus,
      minutesStuck,
      fileName: invoice.fileName,
    };
  },
});

/**
 * Reset stuck lineItemsStatus to 'skipped' (finance_admin override)
 * Used when Phase 2 extraction gets stuck at 'extracting' status
 */
export const resetStuckLineItemsStatus = mutation({
  args: {
    businessId: v.string(),
    invoiceId: v.string(),
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

    // Verify membership and finance_admin/owner role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    if (!["owner", "finance_admin"].includes(membership.role)) {
      throw new Error("Admin or owner role required");
    }

    // Get the invoice
    const invoice = await resolveById(ctx.db, "invoices", args.invoiceId);
    if (!invoice) {
      throw new Error("Invoice not found");
    }

    // Verify invoice belongs to this business
    if (invoice.businessId !== business._id) {
      throw new Error("Invoice not found in this business");
    }

    const originalStatus = invoice.lineItemsStatus;

    // Reset lineItemsStatus to 'skipped'
    await ctx.db.patch(invoice._id, {
      lineItemsStatus: "skipped",
      updatedAt: Date.now(),
    });

    console.log(
      `[Convex] Admin ${user._id} reset lineItemsStatus for invoice ${args.invoiceId}: ${originalStatus} → skipped`
    );

    return {
      invoiceId: invoice._id,
      originalLineItemsStatus: originalStatus,
      newLineItemsStatus: "skipped",
      fileName: invoice.fileName,
    };
  },
});

// ============================================
// ONE-TIME CLEANUP: Remove misrouted test/dev records from invoices table
// ============================================

/**
 * DRY RUN: Lists invoice records that are candidates for cleanup.
 * These are records NOT tagged as documentDomain:"invoices" (created before the domain tag was added)
 * that also have classification_failed or storagePath starting with "expense_claims/".
 * Call this first to see what would be deleted before running the actual cleanup.
 */
export const listMisroutedInvoices = query({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) throw new Error("Business not found");

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || !["owner", "finance_admin"].includes(membership.role)) {
      throw new Error("Owner/finance_admin required");
    }

    const all = await ctx.db
      .query("invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    return all
      .filter((inv) => !inv.deletedAt)
      .filter((inv) => {
        // Not tagged as a proper supplier invoice
        const notTagged = inv.documentDomain !== "invoices";
        // Either classification_failed (rejected as non-invoice) or expense_claims storagePath
        const isExpenseLike =
          inv.status === "classification_failed" ||
          (inv.storagePath && inv.storagePath.startsWith("expense_claims/")) ||
          inv.documentDomain === "expense_claims";
        return notTagged && isExpenseLike;
      })
      .map((inv) => ({
        id: inv._id,
        fileName: inv.fileName,
        status: inv.status,
        storagePath: inv.storagePath,
        documentDomain: inv.documentDomain,
        createdAt: new Date(inv._creationTime).toISOString(),
      }));
  },
});

/**
 * CLEANUP: Soft-deletes misrouted invoice records (test data uploaded to wrong section).
 * Run listMisroutedInvoices first to preview what will be deleted.
 * Only deletes records that are: NOT tagged as "invoices" domain AND are classification_failed
 * or have expense_claims storagePath.
 */
export const cleanupMisroutedInvoices = mutation({
  args: { businessId: v.string(), dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) throw new Error("Business not found");

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || !["owner", "finance_admin"].includes(membership.role)) {
      throw new Error("Owner/finance_admin required");
    }

    const all = await ctx.db
      .query("invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const candidates = all
      .filter((inv) => !inv.deletedAt)
      .filter((inv) => {
        const notTagged = inv.documentDomain !== "invoices";
        const isExpenseLike =
          inv.status === "classification_failed" ||
          (inv.storagePath && inv.storagePath.startsWith("expense_claims/")) ||
          inv.documentDomain === "expense_claims";
        return notTagged && isExpenseLike;
      });

    const now = Date.now();
    const results = [];
    for (const inv of candidates) {
      if (!args.dryRun) {
        await ctx.db.patch(inv._id, { deletedAt: now, updatedAt: now });
      }
      results.push({ id: inv._id, fileName: inv.fileName, status: inv.status });
    }

    return {
      dryRun: args.dryRun ?? false,
      deletedCount: candidates.length,
      records: results,
    };
  },
});

// ============================================
// AI TOOL QUERIES
// ============================================

/**
 * Get completed invoices with extracted data for the AI agent.
 * Returns invoices that have been OCR-processed and are ready to post.
 * Auth-required: uses authenticated Convex client.
 */
export const getCompletedForAI = query({
  args: {
    businessId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { invoices: [] };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { invoices: [] };
    }

    // Cast string businessId to typed ID
    const businessId = args.businessId as Id<"businesses">;

    // Verify membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { invoices: [] };
    }

    // Fetch completed invoices for the business
    const allInvoices = await ctx.db
      .query("invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();

    // Filter: any status where OCR is done (has extractedData), not deleted, supplier invoices only
    // "pending" = OCR done, awaiting payment. "completed"/"paid"/"overdue" = posted to accounting.
    // Exclude expense_claim domain records and processing/failed statuses.
    const EXCLUDED_STATUSES = new Set(["uploading", "classifying", "processing", "analyzing", "classification_failed", "failed"]);
    const completed = allInvoices
      .filter(
        (inv) =>
          !inv.deletedAt &&
          inv.extractedData &&
          !EXCLUDED_STATUSES.has(inv.status) &&
          inv.documentDomain !== "expense_claims" &&
          !(inv.storagePath && inv.storagePath.startsWith("expense_claims/"))
      )
      .sort((a, b) => (b._creationTime || 0) - (a._creationTime || 0))
      .slice(0, args.limit ?? 20);

    // Check which invoices already have journal entries posted
    const postedInvoiceIds = new Set(
      completed
        .filter((inv) => inv.journalEntryId || inv.accountingStatus === "posted")
        .map((inv) => inv._id.toString())
    );

    // Map to AI-friendly shape with normalized camelCase line items
    return {
      invoices: completed.map((inv) => {
        const extracted = inv.extractedData as Record<string, unknown> | undefined;
        const isPosted = postedInvoiceIds.has(inv._id.toString());

        // Normalize line items: OCR returns snake_case, card expects camelCase
        type RawLineItem = { item_description?: string; description?: string; quantity?: number; unit_price?: number; total_amount?: number };
        const rawLineItems = ((extracted?.line_items ?? extracted?.lineItems) as RawLineItem[] | undefined) ?? [];
        const lineItems = rawLineItems.map((item) => ({
          description: item.item_description ?? item.description ?? "",
          quantity: item.quantity ?? 1,
          unitPrice: item.unit_price ?? 0,
          totalAmount: item.total_amount ?? Math.round((item.unit_price ?? 0) * (item.quantity ?? 1) * 100) / 100,
        }));

        return {
          _id: inv._id,
          fileName: inv.fileName,
          status: isPosted ? "posted" : "ready",  // card-friendly status, not payment status
          isPosted,
          confidenceScore: inv.confidenceScore ?? 0.5,
          vendorName: (extracted?.vendor_name as string) ?? (extracted?.vendorName as string) ?? "Unknown",
          amount: (extracted?.total_amount as number) ?? (extracted?.totalAmount as number) ?? 0,
          currency: (extracted?.currency as string) ?? "MYR",
          invoiceDate: (extracted?.invoice_date as string) ?? (extracted?.invoiceDate as string) ?? "",
          invoiceNumber: (extracted?.invoice_number as string) ?? (extracted?.invoiceNumber as string),
          lineItems,
          processedAt: inv.processedAt,
        };
      }),
    };
  },
});

// ============================================
// LHDN SELF-BILLED E-INVOICE
// ============================================

/**
 * Initiate self-billed e-invoice submission for an AP invoice.
 * Self-billing: the business (buyer) issues the invoice on behalf of the vendor (seller).
 */
export const initiateSelfBill = mutation({
  args: {
    invoiceId: v.id("invoices"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdminForInvoices(ctx, args.businessId);

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.businessId !== args.businessId) {
      throw new Error("Invoice not found");
    }

    // AP invoice must be completed/processed before self-billing
    if (invoice.status !== "completed" && invoice.status !== "paid") {
      throw new Error("Invoice must be completed before self-billing");
    }

    // Allow resubmission only if previously invalid
    if (invoice.lhdnStatus && invoice.lhdnStatus !== "invalid") {
      throw new Error("Invoice already has an LHDN submission in progress or completed");
    }

    // Validate business has LHDN config
    const business = await ctx.db.get(args.businessId);
    if (!business || !business.lhdnTin) {
      throw new Error("Business does not have LHDN TIN configured");
    }

    await ctx.db.patch(args.invoiceId, {
      lhdnStatus: "pending",
      lhdnSubmittedAt: Date.now(),
      lhdnValidationErrors: undefined,
      updatedAt: Date.now(),
    });

    return args.invoiceId;
  },
});

/**
 * Update LHDN status on an AP invoice after polling returns a result.
 */
export const updateLhdnStatus = mutation({
  args: {
    invoiceId: v.id("invoices"),
    lhdnStatus: v.string(),
    lhdnDocumentUuid: v.optional(v.string()),
    lhdnLongId: v.optional(v.string()),
    lhdnValidatedAt: v.optional(v.number()),
    lhdnValidationErrors: v.optional(v.array(v.object({
      code: v.string(),
      message: v.string(),
      target: v.optional(v.string()),
    }))),
    lhdnDocumentHash: v.optional(v.string()),
    lhdnSubmissionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {
      lhdnStatus: args.lhdnStatus,
      updatedAt: Date.now(),
    };

    if (args.lhdnDocumentUuid !== undefined) patch.lhdnDocumentUuid = args.lhdnDocumentUuid;
    if (args.lhdnLongId !== undefined) patch.lhdnLongId = args.lhdnLongId;
    if (args.lhdnValidatedAt !== undefined) patch.lhdnValidatedAt = args.lhdnValidatedAt;
    if (args.lhdnValidationErrors !== undefined) patch.lhdnValidationErrors = args.lhdnValidationErrors;
    if (args.lhdnDocumentHash !== undefined) patch.lhdnDocumentHash = args.lhdnDocumentHash;
    if (args.lhdnSubmissionId !== undefined) patch.lhdnSubmissionId = args.lhdnSubmissionId;

    await ctx.db.patch(args.invoiceId, patch);
  },
});

/**
 * Cancel a validated self-billed e-invoice within 72-hour window.
 */
export const cancelLhdnSubmission = mutation({
  args: {
    invoiceId: v.id("invoices"),
    businessId: v.id("businesses"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdminForInvoices(ctx, args.businessId);

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.businessId !== args.businessId) {
      throw new Error("Invoice not found");
    }

    if (invoice.lhdnStatus !== "valid") {
      throw new Error("Can only cancel validated e-invoices");
    }

    if (!invoice.lhdnDocumentUuid) {
      throw new Error("No LHDN document UUID found");
    }

    const CANCELLATION_WINDOW_MS = 72 * 60 * 60 * 1000;
    const validatedAt = invoice.lhdnValidatedAt;
    if (!validatedAt) {
      throw new Error("No validation timestamp found");
    }

    const elapsed = Date.now() - validatedAt;
    if (elapsed > CANCELLATION_WINDOW_MS) {
      throw new Error("CANCELLATION_WINDOW_EXPIRED");
    }

    if (!args.reason.trim()) {
      throw new Error("Cancellation reason is required");
    }

    await ctx.db.patch(args.invoiceId, {
      lhdnStatus: "cancelled",
      updatedAt: Date.now(),
    });

    return { documentUuid: invoice.lhdnDocumentUuid };
  },
});

/**
 * Record a payment against a vendor invoice (AP subledger).
 *
 * Creates a double-entry journal entry:
 *   Debit  AP (2100)  — reduces liability
 *   Credit Cash (1000) — reduces asset
 *
 * Updates invoice payment tracking (paidAmount, paymentStatus, paymentHistory).
 */
export const recordPayment = mutation({
  args: {
    invoiceId: v.id("invoices"),
    amount: v.number(),
    paymentDate: v.string(),
    paymentMethod: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    paymentJournalEntryId: Id<"journal_entries">;
    newStatus: "unpaid" | "partial" | "paid";
    outstandingBalance: number;
    totalPaid: number;
  }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.deletedAt) throw new Error("Invoice not found");
    if (!invoice.businessId) throw new Error("Invoice has no business context");

    // Auth check
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", invoice.businessId!)
      )
      .first();
    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    // Must be posted to accept payments
    if (invoice.accountingStatus !== "posted") {
      throw new Error("Invoice must be posted before recording payments");
    }

    // Validate amount
    if (args.amount <= 0) throw new Error("Payment amount must be greater than 0");

    const journalEntry = invoice.journalEntryId
      ? await ctx.db.get(invoice.journalEntryId as any)
      : null;
    const totalAmount = (journalEntry as any)?.totalDebit ?? 0;
    const currentPaid = (invoice as any).paidAmount ?? 0;
    const outstanding = totalAmount - currentPaid;

    if (outstanding <= 0) throw new Error("Invoice is already fully paid");
    if (args.amount > outstanding + 0.01) {
      throw new Error(`Payment amount (${args.amount}) exceeds outstanding balance (${outstanding.toFixed(2)})`);
    }

    // Look up AP and Cash accounts
    const apAccount = await ctx.db
      .query("chart_of_accounts")
      .withIndex("by_business_code", (q: any) =>
        q.eq("businessId", invoice.businessId!).eq("accountCode", "2100")
      )
      .first();
    if (!apAccount) throw new Error("AP account 2100 not found");

    const cashAccount = await ctx.db
      .query("chart_of_accounts")
      .withIndex("by_business_code", (q: any) =>
        q.eq("businessId", invoice.businessId!).eq("accountCode", "1000")
      )
      .first();
    if (!cashAccount) throw new Error("Cash account 1000 not found");

    // Extract vendor info from invoice
    const extracted = (invoice as any).extractedData || {};
    const vendorName =
      extracted.vendor_name?.value || extracted.vendor_name || extracted.vendorName || "Vendor";
    const description = `Payment to ${vendorName} - ${extracted.invoice_number?.value || extracted.invoice_number || "Invoice"}`;

    // Create payment journal entry lines
    const lines = createPaymentJournalEntry({
      amount: args.amount,
      apAccountId: apAccount._id,
      apAccountCode: apAccount.accountCode,
      apAccountName: apAccount.accountName,
      description,
      cashAccountId: cashAccount._id,
      cashAccountCode: cashAccount.accountCode,
      cashAccountName: cashAccount.accountName,
    });

    // Create journal entry via internal API
    const result = await ctx.runMutation(
      internal.functions.journalEntries.createInternal,
      {
        businessId: invoice.businessId!,
        transactionDate: args.paymentDate,
        description,
        sourceType: "payment" as const,
        sourceId: args.invoiceId,
        lines: lines.map((l) => ({
          accountCode: l.accountCode,
          debitAmount: l.debitAmount,
          creditAmount: l.creditAmount,
          lineDescription: l.lineDescription,
        })),
      }
    );
    const paymentJournalEntryId = result.entryId;

    // Update invoice payment state
    const newPaidAmount = currentPaid + args.amount;
    const newPaymentStatus: "unpaid" | "partial" | "paid" =
      newPaidAmount >= totalAmount ? "paid" : newPaidAmount > 0 ? "partial" : "unpaid";

    const paymentRecord = {
      amount: args.amount,
      paymentDate: args.paymentDate,
      paymentMethod: args.paymentMethod,
      journalEntryId: paymentJournalEntryId,
      notes: args.notes,
      recordedBy: user._id.toString(),
      recordedAt: Date.now(),
    };

    const existingHistory = invoice.paymentHistory ?? [];

    await ctx.db.patch(args.invoiceId, {
      paidAmount: newPaidAmount,
      paymentStatus: newPaymentStatus,
      paymentHistory: [...existingHistory, paymentRecord] as any,
      updatedAt: Date.now(),
    });

    // If fully paid, update invoice status
    if (newPaymentStatus === "paid") {
      await ctx.db.patch(args.invoiceId, { status: "paid" as any });
    }

    return {
      success: true,
      paymentJournalEntryId,
      newStatus: newPaymentStatus,
      outstandingBalance: totalAmount - newPaidAmount,
      totalPaid: newPaidAmount,
    };
  },
});

/**
 * Post invoices to AP (Accounts Payable)
 * Creates journal entries: Debit Expense, Credit AP (2100)
 */
export const postToAP = mutation({
  args: {
    invoiceIds: v.array(v.id("invoices")),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdminForInvoices(ctx, args.businessId);

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const results: Array<{ invoiceId: string; success: boolean; error?: string }> = [];

    for (const invoiceId of args.invoiceIds) {
      try {
        const invoice = await ctx.db.get(invoiceId);

        // Validation checks
        if (!invoice || invoice.businessId !== args.businessId) {
          results.push({ invoiceId, success: false, error: "Invoice not found" });
          continue;
        }

        if (invoice.accountingStatus === "posted") {
          results.push({ invoiceId, success: false, error: "Already posted" });
          continue;
        }

        // Only post completed invoices with extracted data
        const isCompleted = ["completed", "pending", "paid", "overdue"].includes(invoice.status);
        if (!isCompleted || !invoice.extractedData) {
          results.push({ invoiceId, success: false, error: "Invoice not ready for posting" });
          continue;
        }

        // Extract invoice data
        const extractedData = invoice.extractedData as any;
        const vendorName = extractedData?.vendor_name
          || extractedData?.document_summary?.vendor_name?.value
          || "Unknown Vendor";
        const totalAmount = extractedData?.total_amount
          || extractedData?.document_summary?.total_amount?.value
          || 0;
        const invoiceNumber = extractedData?.document_number
          || extractedData?.invoice_number
          || extractedData?.document_summary?.document_number?.value
          || invoice.fileName;

        if (!totalAmount || totalAmount <= 0) {
          results.push({ invoiceId, success: false, error: "Invalid amount" });
          continue;
        }

        // Get default accounts from chart of accounts
        const accounts = await ctx.db
          .query("chart_of_accounts")
          .withIndex("by_business_code", (q) => q.eq("businessId", args.businessId))
          .collect();

        const expenseAccount = accounts.find(a => a.accountCode === "5100")
          || accounts.find(a => a.accountType === "Expense");
        const apAccount = accounts.find(a => a.accountCode === "2100")
          || accounts.find(a => a.accountType === "Liability");

        if (!expenseAccount || !apAccount) {
          results.push({ invoiceId, success: false, error: "Chart of accounts not configured" });
          continue;
        }

        // Create journal entry using internal mutation
        const { entryId: journalEntryId } = await ctx.runMutation(internal.functions.journalEntries.createInternal, {
          businessId: args.businessId,
          transactionDate: new Date().toISOString().split('T')[0],
          description: `AP Invoice - ${vendorName} (Invoice: ${invoiceNumber})`,
          sourceType: "vendor_invoice" as const,
          sourceId: invoiceId,
          lines: [
            {
              accountCode: expenseAccount.accountCode,
              debitAmount: totalAmount,
              creditAmount: 0,
              lineDescription: vendorName,
              entityType: "vendor" as const,
              entityName: vendorName,
            },
            {
              accountCode: apAccount.accountCode,
              debitAmount: 0,
              creditAmount: totalAmount,
              lineDescription: `Payable - ${vendorName}`,
              entityType: "vendor" as const,
              entityName: vendorName,
            },
          ],
        });

        // Update invoice with journal entry link
        await ctx.db.patch(invoiceId, {
          journalEntryId,
          accountingStatus: "posted",
          updatedAt: Date.now(),
        });

        results.push({ invoiceId, success: true });
      } catch (error: any) {
        results.push({
          invoiceId,
          success: false,
          error: error.message || "Unknown error"
        });
      }
    }

    return {
      total: args.invoiceIds.length,
      succeeded: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  },
});

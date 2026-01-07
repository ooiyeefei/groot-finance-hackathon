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
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

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

      // Sort by creation time (newest first)
      invoices.sort((a, b) => b._creationTime - a._creationTime);

      // Pagination
      const startIndex = args.cursor ? parseInt(args.cursor, 10) : 0;
      const paginatedInvoices = invoices.slice(startIndex, startIndex + limit);
      const nextCursor =
        startIndex + limit < invoices.length
          ? String(startIndex + limit)
          : null;

      // Fetch linked accounting entries for all invoices
      const invoicesWithLinks = await Promise.all(
        paginatedInvoices.map(async (invoice) => {
          // Look for accounting entry linked to this invoice
          const linkedEntry = await ctx.db
            .query("accounting_entries")
            .withIndex("by_sourceDocument", (q) =>
              q.eq("sourceDocumentType", "invoice").eq("sourceRecordId", invoice._id)
            )
            .first();

          return {
            ...invoice,
            linkedTransaction: linkedEntry
              ? {
                  id: linkedEntry._id,
                  description: linkedEntry.description || "",
                  originalAmount: linkedEntry.originalAmount,
                  originalCurrency: linkedEntry.originalCurrency,
                  createdAt: linkedEntry._creationTime,
                }
              : null,
          };
        })
      );

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

    // Fetch linked accounting entries for all invoices
    const invoicesWithLinks = await Promise.all(
      paginatedInvoices.map(async (invoice) => {
        // Look for accounting entry linked to this invoice
        const linkedEntry = await ctx.db
          .query("accounting_entries")
          .withIndex("by_sourceDocument", (q) =>
            q.eq("sourceDocumentType", "invoice").eq("sourceRecordId", invoice._id)
          )
          .first();

        return {
          ...invoice,
          linkedTransaction: linkedEntry
            ? {
                id: linkedEntry._id,
                description: linkedEntry.description || "",
                originalAmount: linkedEntry.originalAmount,
                originalCurrency: linkedEntry.originalCurrency,
                createdAt: linkedEntry._creationTime,
              }
            : null,
        };
      })
    );

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

    // Verify admin/owner access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
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
    storagePath: v.string(),
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
      storagePath: args.storagePath,
      status: args.status ?? "pending",
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

    // Check ownership or admin access
    if (invoice.userId !== user._id && invoice.businessId) {
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", invoice.businessId!)
        )
        .first();

      if (!membership || !["owner", "admin"].includes(membership.role)) {
        throw new Error("Not authorized to update this invoice");
      }
    }

    const { id, ...updates } = args;
    const updateData: Record<string, unknown> = { updatedAt: Date.now() };

    // Only include provided fields
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

    // Check ownership or admin access
    if (invoice.userId !== user._id && invoice.businessId) {
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", invoice.businessId!)
        )
        .first();

      if (!membership || !["owner", "admin"].includes(membership.role)) {
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

import { internalMutation, internalQuery } from "../_generated/server";

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

// ============================================
// STUCK RECORDS MONITORING (for admin operations)
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

    // Verify admin/manager role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    if (!["owner", "admin", "manager"].includes(membership.role)) {
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

    // Verify admin/manager role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    if (!["owner", "admin", "manager"].includes(membership.role)) {
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

/**
 * Force-fail a single invoice/document (admin override)
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

    // Verify admin role (only admins can force-fail)
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    if (!["owner", "admin"].includes(membership.role)) {
      throw new Error("Admin role required for manual override");
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
      errorMessage: args.reason || "Manual admin override",
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

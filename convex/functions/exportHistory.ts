/**
 * Export History Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Listing export history for a business
 * - Getting single export history record
 * - Re-downloading exports
 * - Archiving expired exports (cron job)
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";
import { exportModuleValidator, exportHistoryStatusValidator } from "../lib/validators";

// ============================================
// QUERIES
// ============================================

/**
 * List export history for a business
 */
export const list = query({
  args: {
    businessId: v.string(),
    module: v.optional(exportModuleValidator),
    templateId: v.optional(v.id("export_templates")),
    prebuiltTemplateId: v.optional(v.string()),
    status: v.optional(exportHistoryStatusValidator),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { items: [], hasMore: false };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { items: [], hasMore: false };
    }

    // Resolve businessId
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return { items: [], hasMore: false };
    }

    // Verify user has access to business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { items: [], hasMore: false };
    }

    const role = membership.role;
    const limit = args.limit ?? 50;

    // Query history
    let history;
    if (args.module) {
      history = await ctx.db
        .query("export_history")
        .withIndex("by_businessId_module", (q) =>
          q.eq("businessId", business._id).eq("module", args.module!)
        )
        .collect();
    } else {
      history = await ctx.db
        .query("export_history")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .collect();
    }

    // Apply role-based filtering
    // Employees only see their own exports
    // Managers/admins see all
    if (role === "employee") {
      history = history.filter((h) => h.initiatedBy === user._id);
    }

    // Apply filters
    if (args.templateId) {
      history = history.filter((h) => h.templateId === args.templateId);
    }
    if (args.prebuiltTemplateId) {
      history = history.filter(
        (h) => h.prebuiltTemplateId === args.prebuiltTemplateId
      );
    }
    if (args.status) {
      history = history.filter((h) => h.status === args.status);
    }

    // Sort by creation time (newest first)
    history.sort((a, b) => b._creationTime - a._creationTime);

    // Apply limit
    const hasMore = history.length > limit;
    const items = history.slice(0, limit);

    // Enrich with initiator info
    const enrichedItems = await Promise.all(
      items.map(async (item) => {
        const initiator = item.initiatedBy
          ? await ctx.db.get(item.initiatedBy)
          : null;
        return {
          ...item,
          initiator: initiator
            ? {
                _id: initiator._id,
                fullName: initiator.fullName,
                email: initiator.email,
              }
            : null,
        };
      })
    );

    return { items: enrichedItems, hasMore };
  },
});

/**
 * Get a single export history record
 */
export const get = query({
  args: {
    historyId: v.id("export_history"),
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

    const history = await ctx.db.get(args.historyId);
    if (!history) {
      return null;
    }

    // Verify user has access to business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", history.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    // Employees can only see their own exports
    if (membership.role === "employee" && history.initiatedBy !== user._id) {
      return null;
    }

    // Enrich with initiator info
    const initiator = history.initiatedBy
      ? await ctx.db.get(history.initiatedBy)
      : null;

    return {
      ...history,
      initiator: initiator
        ? {
            _id: initiator._id,
            fullName: initiator.fullName,
            email: initiator.email,
          }
        : null,
      canDownload: history.status === "completed" && !!history.storageId,
      isExpired: history.expiresAt ? history.expiresAt < Date.now() : false,
    };
  },
});

/**
 * Get export history stats for a business
 */
export const getStats = query({
  args: {
    businessId: v.string(),
    period: v.union(v.literal("week"), v.literal("month"), v.literal("year")),
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

    // Resolve businessId
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return null;
    }

    // Verify user has admin access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    if (membership.role !== "owner" && membership.role !== "finance_admin") {
      return null;
    }

    // Calculate date range
    const now = Date.now();
    let startTime: number;
    switch (args.period) {
      case "week":
        startTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case "month":
        startTime = now - 30 * 24 * 60 * 60 * 1000;
        break;
      case "year":
        startTime = now - 365 * 24 * 60 * 60 * 1000;
        break;
    }

    // Get all history in period
    const history = await ctx.db
      .query("export_history")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const periodHistory = history.filter((h) => h._creationTime >= startTime);

    // Calculate stats
    const totalExports = periodHistory.length;
    const successfulExports = periodHistory.filter(
      (h) => h.status === "completed"
    ).length;
    const failedExports = periodHistory.filter(
      (h) => h.status === "failed"
    ).length;
    const totalRecordsExported = periodHistory.reduce(
      (sum, h) => sum + (h.status === "completed" ? h.recordCount : 0),
      0
    );

    // Count by module
    const moduleCounts: Record<string, number> = {};
    for (const h of periodHistory) {
      moduleCounts[h.module] = (moduleCounts[h.module] || 0) + 1;
    }

    // Most used templates
    const templateCounts: Record<string, number> = {};
    for (const h of periodHistory) {
      const key = h.templateName;
      templateCounts[key] = (templateCounts[key] || 0) + 1;
    }
    const mostUsedTemplates = Object.entries(templateCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([templateName, count]) => ({ templateName, count }));

    return {
      totalExports,
      successfulExports,
      failedExports,
      totalRecordsExported,
      exportsByModule: {
        expense: moduleCounts["expense"] || 0,
        leave: moduleCounts["leave"] || 0,
        invoice: moduleCounts["invoice"] || 0,
        accounting: moduleCounts["accounting"] || 0,
      },
      mostUsedTemplates,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Request re-generation of an archived export
 */
export const requestRegeneration = mutation({
  args: {
    historyId: v.id("export_history"),
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

    const history = await ctx.db.get(args.historyId);
    if (!history) {
      throw new Error("Export not found");
    }

    // Verify user has access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", history.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    // Employees can only regenerate their own exports
    if (membership.role === "employee" && history.initiatedBy !== user._id) {
      throw new Error("Not authorized to regenerate this export");
    }

    // Check if archived
    if (history.status !== "archived") {
      throw new Error("Only archived exports can be regenerated");
    }

    // Create new history record and trigger export
    // This would reuse the execute mutation logic
    // For now, return a message indicating this feature
    throw new Error("Re-generation feature coming soon");
  },
});

// ============================================
// INTERNAL MUTATIONS (for cleanup cron)
// ============================================

/**
 * Archive expired exports (called by cleanup cron)
 * Marks exports older than 90 days as archived and deletes files
 */
export const archiveExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find all completed exports that have expired
    const expiredExports = await ctx.db
      .query("export_history")
      .withIndex("by_expiresAt")
      .collect();

    const toArchive = expiredExports.filter(
      (h) =>
        h.status === "completed" &&
        h.expiresAt &&
        h.expiresAt <= now &&
        h.storageId
    );

    let archivedCount = 0;
    for (const export_ of toArchive) {
      // Delete file from storage
      if (export_.storageId) {
        await ctx.storage.delete(export_.storageId);
      }

      // Update status to archived
      await ctx.db.patch(export_._id, {
        status: "archived",
        storageId: undefined,
      });

      archivedCount++;
    }

    console.log(`[Export Cleanup] Archived ${archivedCount} expired exports`);
    return { archivedCount };
  },
});

/**
 * Delete old failed export records (called by cleanup cron)
 * Removes failed export records older than 30 days
 */
export const deleteOldFailures = internalMutation({
  args: {},
  handler: async (ctx) => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    // Find all failed exports older than 30 days
    // Since we don't have a direct index for this, we'll query all failed
    // In production, consider adding an index
    const allHistory = await ctx.db.query("export_history").collect();

    const toDelete = allHistory.filter(
      (h) => h.status === "failed" && h._creationTime < thirtyDaysAgo
    );

    let deletedCount = 0;
    for (const export_ of toDelete) {
      await ctx.db.delete(export_._id);
      deletedCount++;
    }

    console.log(
      `[Export Cleanup] Deleted ${deletedCount} old failed export records`
    );
    return { deletedCount };
  },
});

const EXPORT_RETENTION_DAYS = 365; // 1 year
const EXPORT_CLEANUP_BATCH_SIZE = 500;

/**
 * Delete expired export history records (PDPA compliance)
 *
 * Called daily by cron at 4:30 AM UTC.
 * Permanently deletes export records older than 1 year (365 days).
 * Deletes associated Convex storage files before removing records.
 * If file deletion fails, skips that record (retried next run per FR-009).
 */
export const deleteExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff =
      Date.now() - EXPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    const allHistory = await ctx.db.query("export_history").collect();

    const expired = allHistory.filter((h) => h._creationTime < cutoff);

    const batch = expired.slice(0, EXPORT_CLEANUP_BATCH_SIZE);

    let deleted = 0;
    let filesDeleted = 0;

    for (const export_ of batch) {
      try {
        // Delete associated file first (if exists)
        if (export_.storageId) {
          try {
            await ctx.storage.delete(export_.storageId);
            filesDeleted++;
          } catch (fileError) {
            // FR-009: If file deletion fails, skip this record entirely
            console.error(
              `[Retention Cleanup] Failed to delete file ${export_.storageId} for export ${export_._id}:`,
              fileError
            );
            continue;
          }
        }

        // Delete the record
        await ctx.db.delete(export_._id);
        deleted++;
      } catch (error) {
        console.error(
          `[Retention Cleanup] Failed to delete export ${export_._id}:`,
          error
        );
      }
    }

    console.log(
      JSON.stringify({
        type: "retention_cleanup",
        table: "export_history",
        deleted,
        filesDeleted,
        remaining: expired.length - batch.length,
        timestamp: new Date().toISOString(),
      })
    );

    return { deleted, filesDeleted };
  },
});

/**
 * Export History API Contract
 *
 * Convex functions for viewing and managing export history.
 * Location: convex/functions/exportHistory.ts
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";

// ============================================
// QUERIES
// ============================================

/**
 * List export history for a business
 *
 * @param businessId - Business to list history for
 * @param module - Optional filter by module ("expense" | "leave")
 * @param templateId - Optional filter by template
 * @param startDate - Optional filter by date range start
 * @param endDate - Optional filter by date range end
 * @param status - Optional filter by status
 * @param limit - Max results (default 50, max 100)
 * @param cursor - Pagination cursor
 * @returns Paginated list of export history records
 *
 * Access: All business members (sees own exports + admins see all)
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    module: v.optional(v.union(v.literal("expense"), v.literal("leave"))),
    templateId: v.optional(v.id("export_templates")),
    prebuiltTemplateId: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    status: v.optional(v.union(
      v.literal("completed"),
      v.literal("failed"),
      v.literal("archived")
    )),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Get user's role
    // 2. If admin/owner, show all history
    // 3. If employee/manager, show only their initiated exports
    // 4. Apply filters
    // 5. Return paginated results sorted by _creationTime desc
    // Returns: { items: ExportHistory[], cursor: string | null, hasMore: boolean }
  },
});

/**
 * Get a single export history record
 *
 * @param historyId - History record ID
 * @returns Export history details
 *
 * Access: User who initiated, or business admin
 */
export const get = query({
  args: {
    historyId: v.id("export_history"),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Query history record
    // 2. Verify user has access (initiatedBy or admin)
    // 3. Return record with download availability info
  },
});

/**
 * Get export history stats for a business
 *
 * @param businessId - Business to get stats for
 * @param period - "week" | "month" | "year"
 * @returns Export statistics
 *
 * Access: finance_admin, owner
 */
export const getStats = query({
  args: {
    businessId: v.id("businesses"),
    period: v.union(v.literal("week"), v.literal("month"), v.literal("year")),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // Calculate and return:
    // - totalExports: number
    // - successfulExports: number
    // - failedExports: number
    // - totalRecordsExported: number
    // - mostUsedTemplates: { templateName, count }[]
    // - exportsByModule: { expense: number, leave: number }
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Request re-generation of an archived export
 *
 * When export file is older than 90 days and archived,
 * user can request re-generation.
 *
 * @param historyId - Archived history record ID
 * @returns New export history ID
 *
 * Access: User who initiated original, or business admin
 */
export const requestRegeneration = mutation({
  args: {
    historyId: v.id("export_history"),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Verify original export exists and is archived
    // 2. Verify user has access
    // 3. Create new export with same template and filters
    // 4. Schedule generateCsv action
    // 5. Return new history ID
  },
});

// ============================================
// INTERNAL MUTATIONS (for cleanup)
// ============================================

/**
 * Archive expired exports (called by cleanup cron)
 *
 * Marks exports older than 90 days as archived and deletes files.
 */
export const archiveExpired = internalMutation({
  args: {},
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Query exports where expiresAt <= now AND status = "completed"
    // 2. For each:
    //    a. Delete file from storage
    //    b. Update status to "archived"
    //    c. Clear storageId
    // 3. Log cleanup summary
  },
});

/**
 * Delete old failed export records (called by cleanup cron)
 *
 * Removes failed export records older than 30 days.
 */
export const deleteOldFailures = internalMutation({
  args: {},
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Query failed exports older than 30 days
    // 2. Delete records
    // 3. Log cleanup summary
  },
});

// ============================================
// CRON JOB (add to convex/crons.ts)
// ============================================

/**
 * Export file cleanup cron
 *
 * Runs daily at 3:00 AM UTC to:
 * - Archive exports older than 90 days
 * - Delete failed export records older than 30 days
 *
 * Add to convex/crons.ts:
 *
 * crons.daily(
 *   "cleanup-export-files",
 *   { hourUTC: 3, minuteUTC: 0 },
 *   internal.functions.exportHistory.archiveExpired
 * );
 */

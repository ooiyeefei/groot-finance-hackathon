/**
 * Export Execution API Contract
 *
 * Convex functions for executing exports and generating CSV files.
 * Location: convex/functions/exportJobs.ts
 */

import { v } from "convex/values";
import { query, mutation, action, internalAction } from "../_generated/server";

// ============================================
// QUERIES
// ============================================

/**
 * Preview export data before generating file
 *
 * @param businessId - Business to export from
 * @param module - "expense" or "leave"
 * @param templateId - Custom template ID (optional)
 * @param prebuiltId - Pre-built template ID (optional)
 * @param filters - Export filters (date range, status, employees)
 * @param limit - Preview limit (default 10, max 50)
 * @returns Preview data with column headers and sample rows
 *
 * Access: All business members (data filtered by role)
 */
export const preview = query({
  args: {
    businessId: v.id("businesses"),
    module: v.union(v.literal("expense"), v.literal("leave")),
    templateId: v.optional(v.id("export_templates")),
    prebuiltId: v.optional(v.string()),
    filters: v.optional(v.object({
      startDate: v.optional(v.string()),
      endDate: v.optional(v.string()),
      statusFilter: v.optional(v.array(v.string())),
      employeeIds: v.optional(v.array(v.string())),
    })),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Get template (custom or pre-built)
    // 2. Get user's role for data access filtering
    // 3. Query sample data based on role:
    //    - owner/finance_admin: all business records
    //    - manager: direct reports' records
    //    - employee: own records only
    // 4. Apply filters
    // 5. Map data through template field mappings
    // 6. Return { columns: string[], rows: any[][], totalCount: number }
  },
});

/**
 * Get available fields for a module
 *
 * @param module - "expense" or "leave"
 * @returns Array of field definitions
 *
 * Access: All users
 */
export const getAvailableFields = query({
  args: {
    module: v.union(v.literal("expense"), v.literal("leave")),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // Return EXPENSE_FIELDS or LEAVE_FIELDS from field-definitions.ts
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Execute an export (manual trigger)
 *
 * @param businessId - Business to export from
 * @param module - "expense" or "leave"
 * @param templateId - Custom template ID (optional)
 * @param prebuiltId - Pre-built template ID (optional)
 * @param filters - Export filters
 * @returns Export history ID (use to poll status and get download URL)
 *
 * Access: All business members (data filtered by role)
 */
export const execute = mutation({
  args: {
    businessId: v.id("businesses"),
    module: v.union(v.literal("expense"), v.literal("leave")),
    templateId: v.optional(v.id("export_templates")),
    prebuiltId: v.optional(v.string()),
    filters: v.optional(v.object({
      startDate: v.optional(v.string()),
      endDate: v.optional(v.string()),
      statusFilter: v.optional(v.array(v.string())),
      employeeIds: v.optional(v.array(v.string())),
    })),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Validate template exists
    // 2. Create export_history record with status="processing"
    // 3. Schedule generateCsv action
    // 4. Return history ID
  },
});

// ============================================
// ACTIONS (Server-side CSV generation)
// ============================================

/**
 * Generate CSV file (internal action)
 *
 * Called by execute mutation and scheduled export cron.
 *
 * @param historyId - Export history record ID
 * @param businessId - Business to export from
 * @param userId - User who initiated (for role-based filtering)
 * @param module - "expense" or "leave"
 * @param templateId - Custom template ID (optional)
 * @param prebuiltId - Pre-built template ID (optional)
 * @param filters - Export filters
 *
 * Side effects:
 * - Generates CSV content
 * - Stores file in Convex storage
 * - Updates export_history with status, storageId, recordCount, fileSize
 */
export const generateCsv = internalAction({
  args: {
    historyId: v.id("export_history"),
    businessId: v.id("businesses"),
    userId: v.id("users"),
    module: v.union(v.literal("expense"), v.literal("leave")),
    templateId: v.optional(v.id("export_templates")),
    prebuiltId: v.optional(v.string()),
    filters: v.optional(v.object({
      startDate: v.optional(v.string()),
      endDate: v.optional(v.string()),
      statusFilter: v.optional(v.array(v.string())),
      employeeIds: v.optional(v.array(v.string())),
    })),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Get template (custom or pre-built)
    // 2. Get user's role for data filtering
    // 3. Query all matching data (up to 10,000 limit)
    // 4. Generate CSV content:
    //    - Header row from template column names
    //    - Data rows with formatting applied
    // 5. Store CSV file via ctx.storage.store()
    // 6. Update export_history record:
    //    - status: "completed" or "failed"
    //    - storageId, recordCount, fileSize
    //    - errorMessage if failed
    //    - expiresAt (90 days from now)
    // 7. Create notification for user
  },
});

/**
 * Get download URL for export file
 *
 * @param historyId - Export history record ID
 * @returns Signed download URL (valid for 1 hour)
 *
 * Access: User who initiated the export, or business admin
 */
export const getDownloadUrl = action({
  args: {
    historyId: v.id("export_history"),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Get export history record
    // 2. Verify user has access (initiatedBy or admin)
    // 3. Verify status is "completed"
    // 4. Generate signed URL via ctx.storage.getUrl()
    // 5. Return URL
  },
});

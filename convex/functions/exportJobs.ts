/**
 * Export Jobs Functions - Convex queries, mutations, and actions
 *
 * These functions handle:
 * - Previewing export data
 * - Executing exports (manual and scheduled)
 * - Generating CSV files
 * - Creating download URLs
 */

import { v } from "convex/values";
import { query, mutation, action } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";
import { Id, Doc } from "../_generated/dataModel";
import { exportModuleValidator } from "../lib/validators";

// Role hierarchy for permission checks
const ROLE_HIERARCHY: Record<string, number> = {
  owner: 4,
  finance_admin: 3,
  manager: 2,
  employee: 1,
};

// Maximum records per export
const MAX_EXPORT_RECORDS = 10000;

// ============================================
// QUERIES
// ============================================

/**
 * Preview export data before generating file
 * Returns sample rows based on template and filters
 */
export const preview = query({
  args: {
    businessId: v.string(),
    module: exportModuleValidator,
    templateId: v.optional(v.id("export_templates")),
    prebuiltId: v.optional(v.string()),
    filters: v.optional(
      v.object({
        startDate: v.optional(v.string()),
        endDate: v.optional(v.string()),
        statusFilter: v.optional(v.array(v.string())),
        employeeIds: v.optional(v.array(v.string())),
      })
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { records: [], totalCount: 0, previewCount: 0 };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { records: [], totalCount: 0, previewCount: 0 };
    }

    // Resolve businessId
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return { records: [], totalCount: 0, previewCount: 0 };
    }

    // Verify user has access to business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { records: [], totalCount: 0, previewCount: 0 };
    }

    const role = membership.role;
    const previewLimit = Math.min(args.limit ?? 10, 50);

    // Get records based on module
    let records: Doc<"expense_claims">[] | Doc<"leave_requests">[] = [];

    if (args.module === "expense") {
      records = await getExpenseRecords(
        ctx,
        business._id,
        user._id,
        role,
        args.filters
      );
    } else {
      records = await getLeaveRecords(
        ctx,
        business._id,
        user._id,
        role,
        args.filters
      );
    }

    const totalCount = records.length;

    // Limit records for preview
    const previewRecords = records.slice(0, previewLimit);

    // Enrich records with related data
    const enrichedRecords = await enrichRecords(
      ctx,
      args.module,
      previewRecords
    );

    // Return preview with enriched data
    return {
      records: enrichedRecords,
      totalCount,
      previewCount: previewRecords.length,
    };
  },
});

/**
 * Get available fields for a module
 */
export const getAvailableFields = query({
  args: {
    module: exportModuleValidator,
  },
  handler: async (_ctx, args) => {
    // Return field definitions based on module
    if (args.module === "expense") {
      return {
        fields: [
          { id: "employee.name", label: "Employee Name", type: "text" },
          { id: "employee.email", label: "Employee Email", type: "text" },
          { id: "employee.employeeId", label: "Employee ID", type: "text" },
          { id: "employee.department", label: "Department", type: "text" },
          { id: "transactionDate", label: "Transaction Date", type: "date" },
          { id: "vendorName", label: "Vendor Name", type: "text" },
          { id: "totalAmount", label: "Amount", type: "number" },
          { id: "currency", label: "Currency", type: "text" },
          { id: "homeCurrencyAmount", label: "Amount (Home Currency)", type: "number" },
          { id: "exchangeRate", label: "Exchange Rate", type: "number" },
          { id: "expenseCategory", label: "Category", type: "text" },
          { id: "businessPurpose", label: "Business Purpose", type: "text" },
          { id: "description", label: "Description", type: "text" },
          { id: "referenceNumber", label: "Reference Number", type: "text" },
          { id: "status", label: "Status", type: "text" },
          { id: "submittedAt", label: "Submitted Date", type: "date" },
          { id: "approvedAt", label: "Approved Date", type: "date" },
          { id: "paidAt", label: "Paid Date", type: "date" },
          { id: "approver.name", label: "Approved By", type: "text" },
          { id: "reviewerNotes", label: "Reviewer Notes", type: "text" },
        ],
      };
    } else {
      return {
        fields: [
          { id: "employee.name", label: "Employee Name", type: "text" },
          { id: "employee.email", label: "Employee Email", type: "text" },
          { id: "employee.employeeId", label: "Employee ID", type: "text" },
          { id: "employee.department", label: "Department", type: "text" },
          { id: "leaveType.name", label: "Leave Type", type: "text" },
          { id: "leaveType.code", label: "Leave Code", type: "text" },
          { id: "startDate", label: "Start Date", type: "date" },
          { id: "endDate", label: "End Date", type: "date" },
          { id: "totalDays", label: "Days", type: "number" },
          { id: "notes", label: "Reason/Notes", type: "text" },
          { id: "status", label: "Status", type: "text" },
          { id: "submittedAt", label: "Submitted Date", type: "date" },
          { id: "approvedAt", label: "Approved Date", type: "date" },
          { id: "approver.name", label: "Approved By", type: "text" },
          { id: "approverNotes", label: "Approver Notes", type: "text" },
        ],
      };
    }
  },
});

/**
 * Get template for export (used by action)
 */
export const getTemplateForExport = query({
  args: {
    templateId: v.id("export_templates"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.templateId);
  },
});

/**
 * Get history record for download
 */
export const getHistoryForDownload = query({
  args: {
    historyId: v.id("export_history"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.historyId);
  },
});

/**
 * Get records for export
 */
export const getRecordsForExport = query({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
    userRole: v.string(),
    module: exportModuleValidator,
    filters: v.optional(
      v.object({
        startDate: v.optional(v.string()),
        endDate: v.optional(v.string()),
        statusFilter: v.optional(v.array(v.string())),
        employeeIds: v.optional(v.array(v.string())),
      })
    ),
  },
  handler: async (ctx, args) => {
    let records: Record<string, unknown>[] = [];

    if (args.module === "expense") {
      records = await getExpenseRecords(
        ctx,
        args.businessId,
        args.userId,
        args.userRole,
        args.filters
      );
    } else {
      records = await getLeaveRecords(
        ctx,
        args.businessId,
        args.userId,
        args.userRole,
        args.filters
      );
    }

    // Enrich records
    const enrichedRecords = await enrichRecords(ctx, args.module, records);

    return { records: enrichedRecords };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Execute an export (manual trigger)
 * Creates export_history record and generates CSV synchronously
 */
export const execute = mutation({
  args: {
    businessId: v.string(),
    module: exportModuleValidator,
    templateId: v.optional(v.id("export_templates")),
    prebuiltId: v.optional(v.string()),
    templateName: v.string(),
    filters: v.optional(
      v.object({
        startDate: v.optional(v.string()),
        endDate: v.optional(v.string()),
        statusFilter: v.optional(v.array(v.string())),
        employeeIds: v.optional(v.array(v.string())),
      })
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

    // Resolve businessId
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Verify user has access to business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    // Create export_history record with processing status
    const historyId = await ctx.db.insert("export_history", {
      businessId: business._id,
      templateId: args.templateId,
      prebuiltTemplateId: args.prebuiltId,
      templateName: args.templateName,
      module: args.module,
      recordCount: 0,
      fileSize: 0,
      filters: args.filters,
      status: "processing",
      triggeredBy: "manual",
      initiatedBy: user._id,
    });

    return historyId;
  },
});

// ============================================
// ACTIONS (Server-side CSV generation)
// ============================================

// NOTE: Actions removed to avoid circular type reference issues.
// Export functionality will be handled directly by mutations + client-side download.

/**
 * Update history with storage info (called by action)
 */
export const updateHistoryWithStorage = mutation({
  args: {
    historyId: v.id("export_history"),
    status: v.union(v.literal("completed"), v.literal("failed")),
    recordCount: v.optional(v.number()),
    fileSize: v.optional(v.number()),
    storageId: v.optional(v.id("_storage")),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updates: Record<string, unknown> = {
      status: args.status,
      completedAt: Date.now(),
    };

    if (args.recordCount !== undefined) {
      updates.recordCount = args.recordCount;
    }
    if (args.fileSize !== undefined) {
      updates.fileSize = args.fileSize;
    }
    if (args.storageId !== undefined) {
      updates.storageId = args.storageId;
      // Set expiration to 90 days from now
      updates.expiresAt = Date.now() + 90 * 24 * 60 * 60 * 1000;
    }
    if (args.errorMessage !== undefined) {
      updates.errorMessage = args.errorMessage;
    }

    await ctx.db.patch(args.historyId, updates);
  },
});

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getExpenseRecords(
  ctx: { db: any },
  businessId: Id<"businesses">,
  userId: Id<"users">,
  role: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    statusFilter?: string[];
    employeeIds?: string[];
  }
): Promise<any[]> {
  let claims = await ctx.db
    .query("expense_claims")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();

  // Apply role-based filtering
  if (role === "employee") {
    claims = claims.filter((claim: any) => claim.userId === userId);
  } else if (role === "manager") {
    const allMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .collect();
    const directReports = allMemberships.filter((m: any) => m.managerId === userId);
    const reportIds = new Set(directReports.map((m: any) => m.userId));
    reportIds.add(userId);
    claims = claims.filter((claim: any) => reportIds.has(claim.userId));
  }

  // Apply filters
  if (filters?.startDate) {
    claims = claims.filter(
      (claim: any) => claim.transactionDate && claim.transactionDate >= filters.startDate!
    );
  }
  if (filters?.endDate) {
    claims = claims.filter(
      (claim: any) => claim.transactionDate && claim.transactionDate <= filters.endDate!
    );
  }
  if (filters?.statusFilter && filters.statusFilter.length > 0) {
    claims = claims.filter((claim: any) => filters.statusFilter!.includes(claim.status));
  }

  // Filter out soft-deleted
  claims = claims.filter((claim: any) => !claim.deletedAt);

  // Limit
  return claims.slice(0, MAX_EXPORT_RECORDS);
}

async function getLeaveRecords(
  ctx: { db: any },
  businessId: Id<"businesses">,
  userId: Id<"users">,
  role: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    statusFilter?: string[];
    employeeIds?: string[];
  }
): Promise<any[]> {
  let requests = await ctx.db
    .query("leave_requests")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();

  // Apply role-based filtering
  if (role === "employee") {
    requests = requests.filter((req: any) => req.userId === userId);
  } else if (role === "manager") {
    requests = requests.filter(
      (req: any) => req.userId === userId || req.approverId === userId
    );
  }

  // Apply filters
  if (filters?.startDate) {
    requests = requests.filter((req: any) => req.startDate >= filters.startDate!);
  }
  if (filters?.endDate) {
    requests = requests.filter((req: any) => req.endDate <= filters.endDate!);
  }
  if (filters?.statusFilter && filters.statusFilter.length > 0) {
    requests = requests.filter((req: any) => filters.statusFilter!.includes(req.status));
  }

  // Limit
  return requests.slice(0, MAX_EXPORT_RECORDS);
}

async function enrichRecords(
  ctx: { db: any },
  module: "expense" | "leave",
  records: any[]
): Promise<Record<string, unknown>[]> {
  const enriched = await Promise.all(
    records.map(async (record: any) => {
      const user = await ctx.db.get(record.userId);
      const approver = record.approverId
        ? await ctx.db.get(record.approverId)
        : record.approvedBy
        ? await ctx.db.get(record.approvedBy)
        : null;

      const result: Record<string, unknown> = {
        ...record,
        employee: user
          ? {
              name: user.fullName || user.email,
              email: user.email,
              employeeId: "",
              department: user.department || "",
            }
          : null,
        approver: approver
          ? {
              name: approver.fullName || approver.email,
            }
          : null,
      };

      // Add leave type info for leave records
      if (module === "leave" && record.leaveTypeId) {
        const leaveType = await ctx.db.get(record.leaveTypeId);
        result.leaveType = leaveType
          ? {
              name: leaveType.name,
              code: leaveType.code,
            }
          : null;
      }

      return result;
    })
  );

  return enriched;
}

function extractValue(record: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = record;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

function formatValue(
  value: unknown,
  mapping: { dateFormat?: string; decimalPlaces?: number }
): string {
  if (value === null || value === undefined) {
    return "";
  }

  // Format dates
  if (typeof value === "number" && value > 1000000000000) {
    // Timestamp
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return formatDate(date, mapping.dateFormat);
    }
  }

  // Format numbers
  if (typeof value === "number") {
    const decimals = mapping.decimalPlaces ?? 2;
    return value.toFixed(decimals);
  }

  return String(value);
}

function formatDate(date: Date, format?: string): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  switch (format) {
    case "DD/MM/YYYY":
      return `${day}/${month}/${year}`;
    case "DD-MM-YYYY":
      return `${day}-${month}-${year}`;
    case "MM/DD/YYYY":
      return `${month}/${day}/${year}`;
    case "YYYY-MM-DD":
    default:
      return `${year}-${month}-${day}`;
  }
}

function escapeCsv(value: string): string {
  const str = String(value);
  const needsEscaping =
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r");

  if (needsEscaping) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

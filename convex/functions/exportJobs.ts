/**
 * Export Jobs Functions - Convex queries, mutations, and actions
 *
 * Handles:
 * - Previewing export data (all 4 modules)
 * - Executing exports (manual and scheduled)
 * - Data retrieval and enrichment for expense, invoice, leave, accounting modules
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";
import { exportModuleValidator } from "../lib/validators";

// Maximum records per export
const MAX_EXPORT_RECORDS = 10000;

// Shared filters validator used across preview, execute, and getRecordsForExport
const filtersValidator = v.optional(
  v.object({
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    statusFilter: v.optional(v.array(v.string())),
    employeeIds: v.optional(v.array(v.string())),
    invoiceType: v.optional(
      v.union(v.literal("AP"), v.literal("AR"), v.literal("All"))
    ),
    transactionTypeFilter: v.optional(
      v.union(
        v.literal("expense_claim"),
        v.literal("invoice"),
        v.literal("all")
      )
    ),
  })
);

// ============================================
// QUERIES
// ============================================

/**
 * Preview export data before generating file
 */
export const preview = query({
  args: {
    businessId: v.string(),
    module: exportModuleValidator,
    templateId: v.optional(v.id("export_templates")),
    prebuiltId: v.optional(v.string()),
    filters: filtersValidator,
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

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return { records: [], totalCount: 0, previewCount: 0 };
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { records: [], totalCount: 0, previewCount: 0 };
    }

    const role = membership.role;
    const previewLimit = Math.min(args.limit ?? 10, 50);

    const allRecords = await getRecordsByModule(
      ctx,
      args.module,
      business._id,
      user._id,
      role,
      args.filters
    );

    const totalCount = allRecords.length;
    const previewRecords = allRecords.slice(0, previewLimit);

    const enrichedRecords = await enrichByModule(
      ctx,
      args.module,
      previewRecords
    );

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
    return { fields: FIELD_DEFS[args.module] };
  },
});

/**
 * Get template for export
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
 * Get records for export (used by client-side generation)
 */
export const getRecordsForExport = query({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
    userRole: v.string(),
    module: exportModuleValidator,
    filters: filtersValidator,
  },
  handler: async (ctx, args) => {
    const records = await getRecordsByModule(
      ctx,
      args.module,
      args.businessId,
      args.userId,
      args.userRole,
      args.filters
    );

    const enrichedRecords = await enrichByModule(ctx, args.module, records);
    return { records: enrichedRecords };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Execute an export (manual trigger)
 */
export const execute = mutation({
  args: {
    businessId: v.string(),
    module: exportModuleValidator,
    templateId: v.optional(v.id("export_templates")),
    prebuiltId: v.optional(v.string()),
    templateName: v.string(),
    filters: filtersValidator,
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

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

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

/**
 * Update history with storage info
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
      updates.expiresAt = Date.now() + 90 * 24 * 60 * 60 * 1000;
    }
    if (args.errorMessage !== undefined) {
      updates.errorMessage = args.errorMessage;
    }

    await ctx.db.patch(args.historyId, updates);
  },
});

// ============================================
// FIELD DEFINITIONS (used by getAvailableFields)
// ============================================

const FIELD_DEFS: Record<string, { id: string; label: string; type: string }[]> = {
  expense: [
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
  leave: [
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
  accounting: [
    { id: "documentNumber", label: "Document Number", type: "text" },
    { id: "transactionDate", label: "Transaction Date", type: "date" },
    { id: "description", label: "Description", type: "text" },
    { id: "transactionType", label: "Transaction Type", type: "text" },
    { id: "sourceType", label: "Source Document Type", type: "text" },
    { id: "vendorName", label: "Vendor Name", type: "text" },
    { id: "category", label: "Category", type: "text" },
    { id: "originalAmount", label: "Amount", type: "number" },
    { id: "originalCurrency", label: "Currency", type: "text" },
    { id: "homeCurrencyAmount", label: "Amount (Home Currency)", type: "number" },
    { id: "exchangeRate", label: "Exchange Rate", type: "number" },
    { id: "status", label: "Status", type: "text" },
    { id: "employee.name", label: "Created By", type: "text" },
    { id: "lineItem.description", label: "Line Item Description", type: "text" },
    { id: "lineItem.quantity", label: "Line Item Quantity", type: "number" },
    { id: "lineItem.unitPrice", label: "Line Item Unit Price", type: "number" },
    { id: "lineItem.totalAmount", label: "Line Item Amount", type: "number" },
    { id: "lineItem.debitAmount", label: "Debit Amount", type: "number" },
    { id: "lineItem.creditAmount", label: "Credit Amount", type: "number" },
  ],
  invoice: [
    { id: "invoiceType", label: "Invoice Type (AP/AR)", type: "text" },
    { id: "invoiceNumber", label: "Invoice Number", type: "text" },
    { id: "invoiceDate", label: "Invoice Date", type: "date" },
    { id: "dueDate", label: "Due Date", type: "date" },
    { id: "entityName", label: "Vendor/Customer Name", type: "text" },
    { id: "entityCode", label: "Vendor/Customer Code", type: "text" },
    { id: "description", label: "Description", type: "text" },
    { id: "subtotal", label: "Subtotal", type: "number" },
    { id: "totalTax", label: "Total Tax", type: "number" },
    { id: "totalAmount", label: "Total Amount", type: "number" },
    { id: "currency", label: "Currency", type: "text" },
    { id: "status", label: "Status", type: "text" },
    { id: "lineItem.description", label: "Line Description", type: "text" },
    { id: "lineItem.quantity", label: "Quantity", type: "number" },
    { id: "lineItem.unitPrice", label: "Unit Price", type: "number" },
    { id: "lineItem.totalAmount", label: "Line Amount", type: "number" },
    { id: "lineItem.taxAmount", label: "Tax Amount", type: "number" },
    { id: "lineItem.itemCode", label: "Item Code", type: "text" },
  ],
};

// ============================================
// MODULE DISPATCHER
// ============================================

async function getRecordsByModule(
  ctx: { db: any },
  module: string,
  businessId: Id<"businesses">,
  userId: Id<"users">,
  role: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    statusFilter?: string[];
    employeeIds?: string[];
    invoiceType?: "AP" | "AR" | "All";
    transactionTypeFilter?: "expense_claim" | "invoice" | "all";
  }
): Promise<any[]> {
  switch (module) {
    case "expense":
      return getExpenseRecords(ctx, businessId, userId, role, filters);
    case "leave":
      return getLeaveRecords(ctx, businessId, userId, role, filters);
    case "accounting":
      return getAccountingRecords(ctx, businessId, userId, role, filters);
    case "invoice":
      return getInvoiceRecords(ctx, businessId, userId, role, filters);
    default:
      return [];
  }
}

async function enrichByModule(
  ctx: { db: any },
  module: string,
  records: any[]
): Promise<Record<string, unknown>[]> {
  switch (module) {
    case "expense":
      return enrichExpenseRecords(ctx, records);
    case "leave":
      return enrichLeaveRecords(ctx, records);
    case "accounting":
      return enrichAccountingRecords(ctx, records);
    case "invoice":
      return enrichInvoiceRecords(ctx, records);
    default:
      return records;
  }
}

// ============================================
// ROLE-BASED FILTERING HELPER
// ============================================

async function getManagerReportIds(
  ctx: { db: any },
  businessId: Id<"businesses">,
  userId: Id<"users">
): Promise<Set<string>> {
  const allMemberships = await ctx.db
    .query("business_memberships")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();
  const directReports = allMemberships.filter(
    (m: any) => m.managerId === userId
  );
  const reportIds = new Set<string>(
    directReports.map((m: any) => m.userId as string)
  );
  reportIds.add(userId as string);
  return reportIds;
}

// ============================================
// EXPENSE RECORDS
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

  // Role-based filtering
  if (role === "employee") {
    claims = claims.filter((c: any) => c.userId === userId);
  } else if (role === "manager") {
    const reportIds = await getManagerReportIds(ctx, businessId, userId);
    claims = claims.filter((c: any) => reportIds.has(c.userId));
  }

  // Date filters
  if (filters?.startDate) {
    claims = claims.filter(
      (c: any) => c.transactionDate && c.transactionDate >= filters.startDate!
    );
  }
  if (filters?.endDate) {
    claims = claims.filter(
      (c: any) => c.transactionDate && c.transactionDate <= filters.endDate!
    );
  }
  if (filters?.statusFilter?.length) {
    claims = claims.filter((c: any) =>
      filters.statusFilter!.includes(c.status)
    );
  }
  if (filters?.employeeIds?.length) {
    const idSet = new Set(filters.employeeIds);
    claims = claims.filter((c: any) => idSet.has(c.userId));
  }

  // Filter out soft-deleted
  claims = claims.filter((c: any) => !c.deletedAt);

  return claims.slice(0, MAX_EXPORT_RECORDS);
}

async function enrichExpenseRecords(
  ctx: { db: any },
  records: any[]
): Promise<Record<string, unknown>[]> {
  return Promise.all(
    records.map(async (record: any) => {
      const user = await ctx.db.get(record.userId);
      const approver = record.approverId
        ? await ctx.db.get(record.approverId)
        : record.approvedBy
          ? await ctx.db.get(record.approvedBy)
          : null;

      return {
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
          ? { name: approver.fullName || approver.email }
          : null,
      };
    })
  );
}

// ============================================
// LEAVE RECORDS
// ============================================

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

  if (role === "employee") {
    requests = requests.filter((r: any) => r.userId === userId);
  } else if (role === "manager") {
    requests = requests.filter(
      (r: any) => r.userId === userId || r.approverId === userId
    );
  }

  if (filters?.startDate) {
    requests = requests.filter(
      (r: any) => r.startDate >= filters.startDate!
    );
  }
  if (filters?.endDate) {
    requests = requests.filter((r: any) => r.endDate <= filters.endDate!);
  }
  if (filters?.statusFilter?.length) {
    requests = requests.filter((r: any) =>
      filters.statusFilter!.includes(r.status)
    );
  }
  if (filters?.employeeIds?.length) {
    const idSet = new Set(filters.employeeIds);
    requests = requests.filter((r: any) => idSet.has(r.userId));
  }

  return requests.slice(0, MAX_EXPORT_RECORDS);
}

async function enrichLeaveRecords(
  ctx: { db: any },
  records: any[]
): Promise<Record<string, unknown>[]> {
  return Promise.all(
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
          ? { name: approver.fullName || approver.email }
          : null,
      };

      if (record.leaveTypeId) {
        const leaveType = await ctx.db.get(record.leaveTypeId);
        result.leaveType = leaveType
          ? { name: leaveType.name, code: leaveType.code }
          : null;
      }

      return result;
    })
  );
}

// ============================================
// ACCOUNTING RECORDS
// ============================================

async function getAccountingRecords(
  ctx: { db: any },
  businessId: Id<"businesses">,
  userId: Id<"users">,
  role: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    statusFilter?: string[];
    transactionTypeFilter?: "expense_claim" | "invoice" | "all";
  }
): Promise<any[]> {
  let entries = await ctx.db
    .query("accounting_entries")
    .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
    .collect();

  // Filter out soft-deleted
  entries = entries.filter((e: any) => !e.deletedAt);

  // Role-based filtering
  if (role === "employee") {
    entries = entries.filter((e: any) => e.userId === userId);
  } else if (role === "manager") {
    const reportIds = await getManagerReportIds(ctx, businessId, userId);
    entries = entries.filter((e: any) => reportIds.has(e.userId));
  }

  // Date filter on transactionDate
  if (filters?.startDate) {
    entries = entries.filter(
      (e: any) => e.transactionDate >= filters.startDate!
    );
  }
  if (filters?.endDate) {
    entries = entries.filter(
      (e: any) => e.transactionDate <= filters.endDate!
    );
  }

  // Status filter
  if (filters?.statusFilter?.length) {
    entries = entries.filter((e: any) =>
      filters.statusFilter!.includes(e.status)
    );
  }

  // Transaction type filter (source document type)
  if (filters?.transactionTypeFilter && filters.transactionTypeFilter !== "all") {
    if (filters.transactionTypeFilter === "expense_claim") {
      entries = entries.filter(
        (e: any) => e.sourceDocumentType === "expense_claim"
      );
    } else if (filters.transactionTypeFilter === "invoice") {
      entries = entries.filter(
        (e: any) =>
          e.sourceDocumentType === "invoice" ||
          e.sourceDocumentType === "sales_invoice"
      );
    }
  }

  return entries.slice(0, MAX_EXPORT_RECORDS);
}

/**
 * Enrich accounting records with user data and derive journal lines (DR/CR).
 *
 * DR/CR derivation logic:
 * - Expense / Cost of Goods Sold: each line item → DEBIT, one balancing → CREDIT
 * - Income: each line item → CREDIT, one balancing → DEBIT
 */
async function enrichAccountingRecords(
  ctx: { db: any },
  records: any[]
): Promise<Record<string, unknown>[]> {
  return Promise.all(
    records.map(async (entry: any) => {
      // Fetch user
      const user = await ctx.db.get(entry.userId);

      // Fetch vendor if present
      let vendorData = null;
      if (entry.vendorId) {
        vendorData = await ctx.db.get(entry.vendorId);
      }

      const exchangeRate = entry.exchangeRate || 1.0;
      const lineItems = entry.lineItems || [];
      const isExpenseOrCogs =
        entry.transactionType === "Expense" ||
        entry.transactionType === "Cost of Goods Sold";

      // Derive journal lines from line items
      const journalLines: Record<string, unknown>[] = [];
      let totalLineAmount = 0;

      for (const item of lineItems) {
        const amount = item.totalAmount || 0;
        totalLineAmount += amount;

        journalLines.push({
          itemCode: item.itemCode || "",
          description: item.itemDescription || "",
          reference: entry.referenceNumber || "",
          project: "",
          debitAmount: isExpenseOrCogs ? amount : 0,
          debitLocal: isExpenseOrCogs ? amount * exchangeRate : 0,
          creditAmount: isExpenseOrCogs ? 0 : amount,
          creditLocal: isExpenseOrCogs ? 0 : amount * exchangeRate,
          taxCode: "",
          taxAmount: item.taxAmount || 0,
          taxInclusive: false,
          taxRate: item.taxRate != null ? String(item.taxRate) : "",
          currency: item.currency || entry.originalCurrency || "",
        });
      }

      // Generate balancing entry (if there are line items)
      if (journalLines.length > 0) {
        journalLines.push({
          itemCode: "",
          description: "Balancing Entry",
          reference: entry.referenceNumber || "",
          project: "",
          debitAmount: isExpenseOrCogs ? 0 : totalLineAmount,
          debitLocal: isExpenseOrCogs ? 0 : totalLineAmount * exchangeRate,
          creditAmount: isExpenseOrCogs ? totalLineAmount : 0,
          creditLocal: isExpenseOrCogs ? totalLineAmount * exchangeRate : 0,
          taxCode: "",
          taxAmount: 0,
          taxInclusive: false,
          taxRate: "",
          currency: entry.originalCurrency || "",
        });
      }

      return {
        ...entry,
        documentNumber: entry.referenceNumber || "",
        cancelled: entry.status === "cancelled",
        sourceType: entry.sourceDocumentType || "",
        vendorName: entry.vendorName || vendorData?.companyName || "",
        employee: user
          ? { name: user.fullName || user.email }
          : null,
        journalLines,
      };
    })
  );
}

// ============================================
// INVOICE RECORDS
// ============================================

async function getInvoiceRecords(
  ctx: { db: any },
  businessId: Id<"businesses">,
  userId: Id<"users">,
  role: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    statusFilter?: string[];
    invoiceType?: "AP" | "AR" | "All";
  }
): Promise<any[]> {
  const invoiceType = filters?.invoiceType || "All";
  const results: any[] = [];

  // Query AP invoices (invoices table)
  if (invoiceType === "AP" || invoiceType === "All") {
    let apRecords = await ctx.db
      .query("invoices")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .collect();

    apRecords = apRecords.filter((r: any) => !r.deletedAt);

    // Role-based filtering
    if (role === "employee") {
      apRecords = apRecords.filter((r: any) => r.userId === userId);
    } else if (role === "manager") {
      const reportIds = await getManagerReportIds(ctx, businessId, userId);
      apRecords = apRecords.filter((r: any) => reportIds.has(r.userId));
    }

    // Date filter on processedAt
    if (filters?.startDate) {
      apRecords = apRecords.filter((r: any) => {
        const dateStr =
          r.extractedData?.invoiceDate || r.processedAt
            ? new Date(r.processedAt).toISOString().split("T")[0]
            : null;
        return dateStr && dateStr >= filters.startDate!;
      });
    }
    if (filters?.endDate) {
      apRecords = apRecords.filter((r: any) => {
        const dateStr =
          r.extractedData?.invoiceDate || r.processedAt
            ? new Date(r.processedAt).toISOString().split("T")[0]
            : null;
        return dateStr && dateStr <= filters.endDate!;
      });
    }

    if (filters?.statusFilter?.length) {
      apRecords = apRecords.filter((r: any) =>
        filters.statusFilter!.includes(r.status)
      );
    }

    // Mark as AP
    for (const r of apRecords) {
      results.push({ ...r, _invoiceType: "AP" });
    }
  }

  // Query AR invoices (sales_invoices table)
  if (invoiceType === "AR" || invoiceType === "All") {
    let arRecords = await ctx.db
      .query("sales_invoices")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .collect();

    arRecords = arRecords.filter((r: any) => !r.deletedAt);

    // Role-based filtering
    if (role === "employee") {
      arRecords = arRecords.filter((r: any) => r.userId === userId);
    } else if (role === "manager") {
      const reportIds = await getManagerReportIds(ctx, businessId, userId);
      arRecords = arRecords.filter((r: any) => reportIds.has(r.userId));
    }

    if (filters?.startDate) {
      arRecords = arRecords.filter(
        (r: any) => r.invoiceDate >= filters.startDate!
      );
    }
    if (filters?.endDate) {
      arRecords = arRecords.filter(
        (r: any) => r.invoiceDate <= filters.endDate!
      );
    }

    if (filters?.statusFilter?.length) {
      arRecords = arRecords.filter((r: any) =>
        filters.statusFilter!.includes(r.status)
      );
    }

    // Mark as AR
    for (const r of arRecords) {
      results.push({ ...r, _invoiceType: "AR" });
    }
  }

  return results.slice(0, MAX_EXPORT_RECORDS);
}

/**
 * Normalize AP and AR invoices into a common export shape.
 */
async function enrichInvoiceRecords(
  ctx: { db: any },
  records: any[]
): Promise<Record<string, unknown>[]> {
  return Promise.all(
    records.map(async (record: any) => {
      const isAP = record._invoiceType === "AP";

      if (isAP) {
        // AP invoice (from invoices table) — normalize from extractedData
        const data = record.extractedData || {};
        const lineItems = (data.lineItems || []).map(
          (item: any, idx: number) => ({
            lineOrder: idx + 1,
            description: item.description || item.itemDescription || "",
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || 0,
            totalAmount: item.totalAmount || item.amount || 0,
            currency: item.currency || data.currency || "",
            taxRate: item.taxRate || 0,
            taxAmount: item.taxAmount || 0,
            itemCode: item.itemCode || "",
            unitMeasurement: item.unitMeasurement || "",
          })
        );

        // Try to get vendor info
        let entityName = data.vendorName || data.supplierName || "";
        let entityCode = "";
        if (!entityName) {
          // Check if there's an accounting entry with vendor
          const acctEntry = record.accountingEntryId
            ? await ctx.db.get(record.accountingEntryId)
            : null;
          if (acctEntry?.vendorId) {
            const vendor = await ctx.db.get(acctEntry.vendorId);
            entityName = vendor?.companyName || "";
            entityCode = vendor?.supplierCode || "";
          }
        }

        return {
          invoiceType: "AP",
          invoiceNumber: data.invoiceNumber || "",
          invoiceDate: data.invoiceDate || "",
          dueDate: data.dueDate || "",
          entityName,
          entityCode,
          description: data.description || "",
          subtotal: data.subtotal || data.totalAmount || 0,
          totalTax: data.totalTax || data.taxAmount || 0,
          totalAmount: data.totalAmount || 0,
          currency: data.currency || "",
          exchangeRate: data.exchangeRate || 1,
          status: record.status,
          lineItems,
        };
      } else {
        // AR invoice (from sales_invoices table) — already structured
        const lineItems = (record.lineItems || []).map((item: any) => ({
          lineOrder: item.lineOrder,
          description: item.description || "",
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || 0,
          totalAmount: item.totalAmount || 0,
          currency: item.currency || record.currency || "",
          taxRate: item.taxRate || 0,
          taxAmount: item.taxAmount || 0,
          itemCode: item.itemCode || "",
          unitMeasurement: item.unitMeasurement || "",
        }));

        return {
          invoiceType: "AR",
          invoiceNumber: record.invoiceNumber || "",
          invoiceDate: record.invoiceDate || "",
          dueDate: record.dueDate || "",
          entityName: record.customerSnapshot?.businessName || "",
          entityCode: record.customerSnapshot?.taxId || "",
          description: "",
          subtotal: record.subtotal || 0,
          totalTax: record.totalTax || 0,
          totalAmount: record.totalAmount || 0,
          currency: record.currency || "",
          exchangeRate: record.exchangeRate || 1,
          status: record.status,
          lineItems,
        };
      }
    })
  );
}

/**
 * Export Jobs Functions - Convex queries, mutations, and actions
 *
 * Handles:
 * - Previewing export data (all 5 modules)
 * - Executing exports (manual and scheduled)
 * - Data retrieval and enrichment for expense, invoice, leave, accounting, master-data modules
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

    // Force AR-only filter for Sales Book-Invoice template
    let effectiveFilters = args.filters ? { ...args.filters } : {};
    if (args.prebuiltId === "master-accounting-sales-invoice") {
      effectiveFilters = { ...effectiveFilters, invoiceType: "AR" as const };
    }

    const allRecords = await getRecordsByModule(
      ctx,
      args.module,
      business._id,
      user._id,
      role,
      effectiveFilters,
      args.prebuiltId
    );

    const totalCount = allRecords.length;
    const previewRecords = allRecords.slice(0, previewLimit);

    // Skip enrichment for master data templates (already enriched in getMasterDataRecords)
    const isMasterData = args.prebuiltId && MASTER_DATA_TEMPLATES[args.prebuiltId];
    let enrichedRecords = isMasterData
      ? previewRecords
      : await enrichByModule(ctx, args.module, previewRecords);

    // Apply saved code mappings for Master Accounting templates
    if (args.prebuiltId?.startsWith("master-accounting-") && !isMasterData) {
      enrichedRecords = await applyCodeMappings(
        ctx, business._id, enrichedRecords, args.module
      );
    }

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

// Master data template IDs that need special data sourcing
const MASTER_DATA_TEMPLATES: Record<string, string> = {
  // Existing Master Accounting templates
  "master-accounting-creditor": "vendors",
  "master-accounting-debtor": "customers",
  "master-accounting-chart-of-account": "categories",
  "master-accounting-stock-item": "stock_items",
  "master-accounting-category": "category_names",
  "master-accounting-cost-centre": "cost_centres",
  // New ERP-specific master data templates (same underlying data sources)
  "sql-accounting-creditor": "vendors",
  "sql-accounting-debtor": "customers",
  "sql-accounting-coa": "categories",
  "autocount-supplier": "vendors",
  "autocount-customer": "customers",
  "autocount-coa": "categories",
  "myob-supplier": "vendors",
  "myob-customer": "customers",
  "myob-coa": "categories",
};

// Templates that need special filtering on existing module data
const FILTERED_TEMPLATES: Record<string, { module: string; filter: string }> = {
  "master-accounting-purchases-bill-ap": { module: "invoice", filter: "ap_only" },
  "master-accounting-cashbook-receipt": { module: "invoice", filter: "ar_paid" },
  "master-accounting-sales-credit-note": { module: "invoice", filter: "ar_voided" },
  "master-accounting-purchases-debit-note": { module: "expense", filter: "rejected" },
};

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
  },
  prebuiltId?: string
): Promise<any[]> {
  // Master data templates query their own tables directly
  if (prebuiltId && MASTER_DATA_TEMPLATES[prebuiltId]) {
    return getMasterDataRecords(ctx, businessId, MASTER_DATA_TEMPLATES[prebuiltId]);
  }

  // Filtered templates apply special filters on existing module data
  if (prebuiltId && FILTERED_TEMPLATES[prebuiltId]) {
    const { module: fModule, filter } = FILTERED_TEMPLATES[prebuiltId];
    if (fModule === "invoice") {
      const invoiceFilter = filter === "ap_only" ? "AP"
        : filter === "ar_paid" ? "AR" : filter === "ar_voided" ? "AR" : "All";
      const statusFilter = filter === "ar_paid" ? ["paid"]
        : filter === "ar_voided" ? ["void"] : filters?.statusFilter;
      return getInvoiceRecords(ctx, businessId, userId, role, {
        ...filters,
        invoiceType: invoiceFilter as "AP" | "AR" | "All",
        statusFilter,
      });
    }
    if (fModule === "expense") {
      // Debit note = rejected/cancelled expense claims
      return getExpenseRecords(ctx, businessId, userId, role, {
        ...filters,
        statusFilter: ["rejected", "cancelled"],
      });
    }
  }

  switch (module) {
    case "expense":
      return getExpenseRecords(ctx, businessId, userId, role, filters);
    case "leave":
      return getLeaveRecords(ctx, businessId, userId, role, filters);
    case "accounting":
      return getAccountingRecords(ctx, businessId, userId, role, filters);
    case "invoice":
      return getInvoiceRecords(ctx, businessId, userId, role, filters);
    case "master-data":
      // Master data module always routes through MASTER_DATA_TEMPLATES lookup
      // If we get here without a prebuiltId match, return empty
      return [];
    default:
      return [];
  }
}

/**
 * Generate a short, consistent creditor/debtor code from a name.
 * Format: First 3 chars uppercase + "-" + 4-char hash = max 8 chars.
 * e.g., "McDonald's" → "MCD-A1B2", "Starbucks" → "STA-C3D4"
 */
function generateCodeFromName(name: string, prefix: string = ""): string {
  // Clean name: remove special chars, take first 3 alpha chars
  const alpha = name.replace(/[^a-zA-Z]/g, "").toUpperCase();
  const short = alpha.substring(0, 3) || "UNK";

  // Simple hash from full name for uniqueness
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  const hashStr = Math.abs(hash).toString(36).toUpperCase().substring(0, 4).padEnd(4, "0");

  return `${prefix}${short}-${hashStr}`;
}

// Names to filter out from merchant export (OCR artifacts, placeholders)
const EXCLUDED_MERCHANT_NAMES = new Set([
  "processing...",
  "processing",
  "unknown",
  "n/a",
  "na",
  "",
]);

/**
 * Fetch master data records for Master Accounting export.
 * Creditor/Supplier: Combines vendors table + unique merchants from expense claims.
 * Debtor/Customer: From customers table.
 * Returns deduplicated, enriched records.
 */
async function getMasterDataRecords(
  ctx: { db: any },
  businessId: Id<"businesses">,
  tableName: string
): Promise<any[]> {
  if (tableName === "vendors") {
    // 1. Get structured vendors from vendors table
    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .collect();

    const vendorRecords = vendors
      .filter((v: any) => v.status !== "inactive" && v.name)
      .map((v: any) => ({
        vendorName: v.supplierCode || generateCodeFromName(v.name, "CR-"),
        vendorFullName: v.name || "",
        vendorName2: "",
        registerNo: v.taxId || "",
        address1: v.address || "",
        address2: "",
        address3: "",
        address4: "",
        city: "",
        postalCode: "",
        state: "",
        countryCode: "",
        contactPerson: v.contactPerson || "",
        phone1: v.phone || "",
        phone2: "",
        fax1: "",
        fax2: "",
        email1: v.email || "",
        email2: "",
        homePage: v.website || "",
        businessNature: v.category || "",
        suspended: "N",
        controlAccountCode: "",
        areaCode: "",
        categoryCode: "",
        groupCode: "",
        termCode: "",
        staffCode: "",
        currencyCode: v.defaultCurrency || "MYR",
        tin: "",
        idType: "Business Reg. No",
        _source: "vendor",
      }));

    // 2. Get unique merchants from expense claims (not in vendors table)
    const claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .collect();

    // Collect unique merchant names not already in vendors
    const vendorNames = new Set(
      vendors.map((v: any) => (v.name || "").toLowerCase())
    );
    const seenMerchants = new Set<string>();
    const merchantRecords: any[] = [];

    for (const claim of claims) {
      const name = claim.vendorName?.trim();
      if (!name) continue;
      const nameLower = name.toLowerCase();
      // Skip placeholders, OCR artifacts, and already-seen names
      if (EXCLUDED_MERCHANT_NAMES.has(nameLower)) continue;
      if (vendorNames.has(nameLower) || seenMerchants.has(nameLower)) continue;
      seenMerchants.add(nameLower);

      merchantRecords.push({
        vendorName: generateCodeFromName(name, "CR-"),
        vendorFullName: name,
        vendorName2: "",
        registerNo: "",
        address1: "",
        address2: "",
        address3: "",
        address4: "",
        city: "",
        postalCode: "",
        state: "",
        countryCode: "",
        contactPerson: "",
        phone1: "",
        phone2: "",
        fax1: "",
        fax2: "",
        email1: "",
        email2: "",
        homePage: "",
        businessNature: "",
        suspended: "N",
        controlAccountCode: "",
        areaCode: "",
        categoryCode: "",
        groupCode: "",
        termCode: "",
        staffCode: "",
        currencyCode: "MYR",
        tin: "",
        idType: "Business Reg. No",
        _source: "merchant",
      });
    }

    // 3. Combine: vendors first, then merchants
    return [...vendorRecords, ...merchantRecords];
  }

  if (tableName === "customers") {
    // 1. Get structured customers from customers table
    const customers = await ctx.db
      .query("customers")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .collect();

    const customerRecords = customers
      .filter((c: any) => c.status !== "inactive" && c.businessName)
      .map((c: any) => ({
        entityCode: c.customerCode || generateCodeFromName(c.businessName || "", "D-"),
        entityName: c.businessName || "",
        entityName2: "",
        registerNo: c.taxId || c.brn || "",
        address1: c.addressLine1 || c.address || "",
        address2: c.addressLine2 || "",
        address3: c.addressLine3 || "",
        address4: "",
        city: c.city || "",
        postalCode: c.postalCode || "",
        state: c.stateCode || "",
        countryCode: c.countryCode || "",
        contactPerson: c.contactPerson || "",
        contactPersonPosition: "",
        phone1: c.phone || "",
        phone2: "",
        fax1: "",
        fax2: "",
        email1: c.email || "",
        email2: "",
        homePage: "",
        businessNature: "",
        suspended: "N",
        controlAccountCode: "",
        currencyCode: "MYR",
        tin: c.tin || "",
        idType: "Business Reg. No",
        _source: "customer",
      }));

    // 2. Get unique customers from sales_invoices not in customers table
    const invoices = await ctx.db
      .query("sales_invoices")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .collect();

    const customerNames = new Set(
      customers.map((c: any) => (c.businessName || "").toLowerCase())
    );
    const seenInvoiceCustomers = new Set<string>();
    const invoiceCustomerRecords: any[] = [];

    for (const inv of invoices) {
      const name = inv.customerSnapshot?.businessName?.trim();
      if (!name) continue;
      const nameLower = name.toLowerCase();
      if (customerNames.has(nameLower) || seenInvoiceCustomers.has(nameLower)) continue;
      seenInvoiceCustomers.add(nameLower);

      const snap = inv.customerSnapshot || {};
      invoiceCustomerRecords.push({
        entityCode: generateCodeFromName(name, "D-"),
        entityName: name,
        entityName2: "",
        registerNo: snap.taxId || snap.brn || "",
        address1: snap.addressLine1 || snap.address || "",
        address2: snap.addressLine2 || "",
        address3: snap.addressLine3 || "",
        address4: "",
        city: snap.city || "",
        postalCode: snap.postalCode || "",
        state: snap.stateCode || "",
        countryCode: snap.countryCode || "",
        contactPerson: snap.contactPerson || "",
        contactPersonPosition: "",
        phone1: snap.phone || "",
        phone2: "",
        fax1: "",
        fax2: "",
        email1: snap.email || "",
        email2: "",
        homePage: "",
        businessNature: "",
        suspended: "N",
        controlAccountCode: "",
        currencyCode: "MYR",
        tin: snap.tin || "",
        idType: "Business Reg. No",
        _source: "invoice_customer",
      });
    }

    return [...customerRecords, ...invoiceCustomerRecords];
  }

  if (tableName === "categories") {
    // Chart of Account export: read expense + COGS categories with glCode
    const business = await ctx.db.get(businessId);
    if (!business) return [];

    const expenseCats = (business.customExpenseCategories || []) as Array<{
      id?: string; category_name?: string; glCode?: string; is_active?: boolean;
    }>;
    const cogsCats = (business.customCogsCategories || []) as Array<{
      id?: string; category_name?: string; glCode?: string; is_active?: boolean;
    }>;

    const records: any[] = [];

    // Expense categories → EXP account type
    for (const cat of expenseCats) {
      if (!cat.glCode || !cat.is_active) continue;
      records.push({
        glCode: cat.glCode,
        categoryName: cat.category_name || "",
        accountType: "EXP",
        drCr: "DR",
      });
    }

    // COGS categories → COS account type
    for (const cat of cogsCats) {
      if (!cat.glCode || !cat.is_active) continue;
      records.push({
        glCode: cat.glCode,
        categoryName: cat.category_name || "",
        accountType: "COS",
        drCr: "DR",
      });
    }

    // Product catalog items → SALES account type (revenue)
    const catalogItems = await ctx.db
      .query("catalog_items")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .collect();
    const seenGlCodes = new Set(records.map((r: any) => r.glCode));
    for (const item of catalogItems) {
      if (!item.glCode || item.deletedAt || seenGlCodes.has(item.glCode)) continue;
      seenGlCodes.add(item.glCode);
      records.push({
        glCode: item.glCode,
        categoryName: item.name,
        accountType: "SALES",
        drCr: "CR",
      });
    }

    return records;
  }

  if (tableName === "stock_items") {
    // Export product catalog items as Stock Item master data
    const catalogItems = await ctx.db
      .query("catalog_items")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .collect();

    return catalogItems
      .filter((item: any) => !item.deletedAt && item.sku)
      .map((item: any) => ({
        itemCode: item.sku || "",
        description: item.name || "",
        unitMeasurement: item.unitMeasurement || "pcs",
        taxCode: item.taxRate && item.taxRate > 0 ? "SR" : "",
        refCost: 0,
        refPrice: item.unitPrice || 0,
      }));
  }

  if (tableName === "category_names") {
    // Export distinct product categories from catalog items as Category master data
    // Maps to Master Accounting's Category screen (product groupings like CPU, SOFTWARE, SVC)
    const catalogItems = await ctx.db
      .query("catalog_items")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .collect();

    const records: any[] = [];
    const seen = new Set<string>();

    for (const item of catalogItems) {
      if (item.deletedAt || !item.category) continue;
      const code = item.category.trim();
      if (!code || seen.has(code)) continue;
      seen.add(code);
      records.push({
        categoryCode: code.substring(0, 20),
        description: code,
      });
    }
    return records;
  }

  if (tableName === "cost_centres") {
    // Export departments from user profiles as Cost Centre master data
    const memberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .collect();

    const activeMemberships = memberships.filter(
      (m: any) => m.status === "active"
    );

    const departments = new Set<string>();
    for (const m of activeMemberships) {
      const user = await ctx.db.get(m.userId);
      if (user?.department?.trim()) {
        departments.add(user.department.trim());
      }
    }

    return [...departments].sort().map((dept) => ({
      costCentreCode: dept.replace(/[^a-zA-Z0-9 ]/g, "").substring(0, 20).trim(),
      description: dept,
    }));
  }

  return [];
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
    case "master-data":
      // Master data records are already flat and enriched from getMasterDataRecords
      return records;
    default:
      return records;
  }
}

// ============================================
// CODE MAPPING APPLICATION
// ============================================

/**
 * Apply saved code mappings to export records.
 * Replaces vendorName with mapped creditor code, expenseCategory with account code, etc.
 */
async function applyCodeMappings(
  ctx: { db: any },
  businessId: Id<"businesses">,
  records: any[],
  module: string
): Promise<any[]> {
  // Fetch all saved mappings for master-accounting
  const allMappings = await ctx.db
    .query("export_code_mappings")
    .withIndex("by_business_system", (q: any) =>
      q.eq("businessId", businessId).eq("targetSystem", "master-accounting")
    )
    .collect();

  // Build lookup maps: { mappingType: { sourceValue: targetCode } }
  const lookups: Record<string, Record<string, string>> = {};
  const defaults: Record<string, string> = {};
  for (const m of allMappings) {
    if (!lookups[m.mappingType]) lookups[m.mappingType] = {};
    if (m.isDefault && m.sourceValue === "__DEFAULT__") {
      defaults[m.mappingType] = m.targetCode;
    } else {
      lookups[m.mappingType][m.sourceValue] = m.targetCode;
    }
  }

  const getCode = (type: string, sourceValue: string): string => {
    return lookups[type]?.[sourceValue] || defaults[type] || sourceValue;
  };

  return records.map((record: any) => {
    const mapped = { ...record };

    // Map creditor code (vendor name → CR- code)
    if (module === "expense" && mapped.vendorName) {
      mapped.vendorName = getCode("creditor_code", mapped.vendorName);
    }

    // Map creditor code for AP invoices (entity name → creditor code)
    if (module === "invoice" && mapped.invoiceType === "AP" && mapped.entityName) {
      mapped.entityCode = getCode("creditor_code", mapped.entityName);
    }

    // Map debtor code (customer name → debtor code)
    if (module === "invoice") {
      const debtorSource = mapped.entityName || mapped.entityCode || "";
      if (debtorSource) {
        mapped.entityCode = getCode("debtor_code", debtorSource);
      }
    }

    // Map line item account codes (category → account code)
    const accountFallback = defaults["account_code"] || "";
    if (Array.isArray(mapped.lineItems)) {
      mapped.lineItems = mapped.lineItems.map((item: any) => {
        const sourceCode = item.itemCode || record.expenseCategory || "";
        let mappedCode = sourceCode;

        // Try explicit mapping first
        if (sourceCode && lookups["account_code"]?.[sourceCode]) {
          mappedCode = lookups["account_code"][sourceCode];
        } else if (accountFallback) {
          // No explicit mapping found - use user's saved default
          mappedCode = accountFallback;
        }

        return { ...item, itemCode: mappedCode };
      });
    }

    return mapped;
  });
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

  // Filter out claims with no vendor name and no reference number (invalid for accounting export)
  claims = claims.filter((c: any) => c.vendorName?.trim() || c.referenceNumber?.trim());

  // Deduplicate by referenceNumber (keep first occurrence)
  const seen = new Set<string>();
  claims = claims.filter((c: any) => {
    const key = c.referenceNumber?.trim();
    if (!key) return true; // Keep claims without reference (they'll be filtered by vendor check above)
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

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

      // Fetch line items via accountingEntryId → line_items table
      let lineItems: any[] = [];
      if (record.accountingEntryId) {
        const items = await ctx.db
          .query("line_items")
          .withIndex("by_accountingEntryId", (q: any) =>
            q.eq("accountingEntryId", record.accountingEntryId)
          )
          .collect();
        lineItems = items
          .filter((item: any) => !item.deletedAt)
          .sort((a: any, b: any) => (a.lineOrder ?? 0) - (b.lineOrder ?? 0))
          .map((item: any) => ({
            description: item.itemDescription || "",
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || 0,
            totalAmount: item.totalAmount || 0,
            currency: item.currency || "",
            taxAmount: item.taxAmount || 0,
            taxRate: item.taxRate || 0,
            itemCode: item.itemCode || record.expenseCategory || "",
            taxCode: item.taxRate && item.taxRate > 0 ? "TX" : "",
            unitMeasurement: item.unitMeasurement || "",
          }));
      }

      // If no line items found, synthesize one from the claim header
      if (lineItems.length === 0) {
        lineItems = [{
          description: record.description || record.businessPurpose || "",
          quantity: 1,
          unitPrice: record.totalAmount || 0,
          totalAmount: record.totalAmount || 0,
          currency: record.currency || "MYR",
          taxAmount: 0,
          taxRate: 0,
          itemCode: record.expenseCategory || "",
          taxCode: "",
          unitMeasurement: "",
        }];
      }

      return {
        ...record,
        lineItems,
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

    // Mark as AR, filter out 0-amount invoices with no line items
    for (const r of arRecords) {
      const hasContent = (r.totalAmount && r.totalAmount > 0) ||
        (r.lineItems && r.lineItems.length > 0 &&
         r.lineItems.some((li: any) => li.totalAmount > 0 || li.description));
      if (hasContent) {
        results.push({ ...r, _invoiceType: "AR" });
      }
    }
  }

  return results.slice(0, MAX_EXPORT_RECORDS);
}

/**
 * Normalize AP and AR invoices into a common export shape.
 */
// ============================================
// PDPA: DOWNLOAD MY DATA
// ============================================

/**
 * Get all personal data for the authenticated user across all businesses.
 * Used by "Download My Data" in profile settings (PDPA Right of Access).
 * Forces user-scoped filtering regardless of role.
 */
export const getMyDataExport = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    // Get profile data
    const profile = {
      email: user.email,
      fullName: user.fullName || null,
      homeCurrency: user.homeCurrency || null,
      timezone: user.preferences?.timezone || null,
      language: user.preferences?.language || null,
      createdAt: user._creationTime
        ? new Date(user._creationTime).toISOString()
        : null,
    };

    // Get all active business memberships
    const allMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId", (q: any) => q.eq("userId", user._id))
      .collect();

    const activeMemberships = allMemberships.filter(
      (m: any) => m.status === "active"
    );

    // For each business, get records across all 4 modules (forced own-records scope)
    const businesses = await Promise.all(
      activeMemberships.map(async (membership: any) => {
        const businessId = membership.businessId as Id<"businesses">;
        const business = await ctx.db.get(businessId);
        if (!business) return null;

        const [expenses, leaves, accounting, invoices] = await Promise.all([
          getExpenseRecords(ctx, businessId, user._id, "employee", {}),
          getLeaveRecords(ctx, businessId, user._id, "employee", {}),
          getAccountingRecords(ctx, businessId, user._id, "employee", {}),
          getInvoiceRecords(ctx, businessId, user._id, "employee", {}),
        ]);

        const [enrichedExpenses, enrichedLeaves, enrichedAccounting, enrichedInvoices] =
          await Promise.all([
            enrichExpenseRecords(ctx, expenses),
            enrichLeaveRecords(ctx, leaves),
            enrichAccountingRecords(ctx, accounting),
            enrichInvoiceRecords(ctx, invoices),
          ]);

        return {
          businessId: businessId,
          businessName: business.name || "Unnamed Business",
          role: membership.role || "employee",
          modules: {
            expense_claims: enrichedExpenses,
            invoices: enrichedInvoices,
            leave_requests: enrichedLeaves,
            accounting_entries: enrichedAccounting,
          },
        };
      })
    );

    return {
      profile,
      businesses: businesses.filter(Boolean),
    };
  },
});

async function enrichInvoiceRecords(
  ctx: { db: any },
  records: any[]
): Promise<Record<string, unknown>[]> {
  return Promise.all(
    records.map(async (record: any) => {
      const isAP = record._invoiceType === "AP";

      if (isAP) {
        // AP invoice (from invoices table) — normalize from extractedData
        // OCR stores fields in snake_case (vendor_name, total_amount, etc.)
        const data = record.extractedData || {};
        const summary = data.document_summary || {};
        const lineItems = (data.line_items || data.lineItems || []).map(
          (item: any, idx: number) => ({
            lineOrder: idx + 1,
            description: item.description || item.itemDescription || item.item_description || "",
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || item.unit_price || 0,
            totalAmount: item.totalAmount || item.total_amount || item.amount || 0,
            currency: item.currency || data.currency || "",
            taxRate: item.taxRate || item.tax_rate || 0,
            taxAmount: item.taxAmount || item.tax_amount || 0,
            itemCode: item.itemCode || item.item_code || "",
            unitMeasurement: item.unitMeasurement || item.unit_measurement || "",
          })
        );

        // Try to get vendor info (snake_case from OCR, camelCase fallback for legacy)
        let entityName = data.vendor_name || data.vendorName
          || summary.vendor_name?.value || data.supplierName || data.supplier_name || "";
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

        const invoiceNumber = data.document_number || data.invoice_number || data.invoiceNumber
          || summary.document_number?.value || "";
        const invoiceDate = data.transaction_date || data.invoice_date || data.invoiceDate
          || summary.transaction_date?.value || "";
        const totalAmount = data.total_amount || data.totalAmount || 0;
        const totalTax = data.total_tax || data.totalTax || data.tax_amount || data.taxAmount || 0;

        return {
          invoiceType: "AP",
          invoiceNumber,
          invoiceDate,
          dueDate: data.due_date || data.dueDate || "",
          entityName,
          entityCode,
          description: data.description || "",
          subtotal: data.subtotal || data.sub_total || totalAmount,
          totalTax,
          totalAmount,
          currency: data.currency || "",
          exchangeRate: data.exchange_rate || data.exchangeRate || 1,
          status: record.status,
          lineItems,
        };
      } else {
        // AR invoice (from sales_invoices table) — already structured
        const lineItems = (record.lineItems || [])
          .map((item: any) => ({
            lineOrder: item.lineOrder,
            description: (item.description || "").trim(),
            quantity: item.quantity || 1,
            unitPrice: item.unitPrice || 0,
            totalAmount: item.totalAmount || 0,
            currency: item.currency || record.currency || "",
            taxRate: item.taxRate || 0,
            taxAmount: item.taxAmount || 0,
            itemCode: item.itemCode || "",
            unitMeasurement: item.unitMeasurement || "",
          }))
          // Filter out empty line items (no description AND 0 amount)
          .filter((item: any) => item.description || item.totalAmount > 0);

        // Look up customerCode from customers table if available
        let customerCode = "";
        if (record.customerId) {
          const customer = await ctx.db.get(record.customerId);
          customerCode = customer?.customerCode || "";
        }

        return {
          invoiceType: "AR",
          invoiceNumber: record.invoiceNumber || "",
          invoiceDate: record.invoiceDate || "",
          dueDate: record.dueDate || "",
          entityName: record.customerSnapshot?.businessName || "",
          entityCode: customerCode || record.customerSnapshot?.taxId || "",
          description: (record.description || "").trim(),
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

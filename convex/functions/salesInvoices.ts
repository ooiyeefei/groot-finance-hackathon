/**
 * Sales Invoice Functions - Convex queries and mutations
 *
 * Handles the complete sales invoice lifecycle:
 * - CRUD operations (create, read, update, delete)
 * - Status transitions (draft → sent → paid/overdue → void)
 * - Payment recording
 * - Accounting entry integration
 * - Overdue marking (cron job)
 * - Recurring invoice generation (cron job)
 */

import { v } from "convex/values";
import { query, mutation, internalMutation, internalQuery, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";
import {
  salesInvoiceStatusValidator,
  paymentTermsValidator,
} from "../lib/validators";

// ============================================
// HELPER: Finance admin check
// ============================================
async function requireFinanceAdmin(
  ctx: { db: import("../_generated/server").DatabaseReader; auth: { getUserIdentity: () => Promise<{ subject: string } | null> } },
  businessId: import("../_generated/dataModel").Id<"businesses">
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

  // Finance admin = owner, finance_admin, or manager
  if (!["owner", "finance_admin", "manager"].includes(membership.role)) {
    throw new Error("Not authorized: finance admin required");
  }

  return { user, membership };
}

// ============================================
// QUERIES
// ============================================

/**
 * List sales invoices for a business with filtering and sorting
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    status: v.optional(v.string()),
    customerId: v.optional(v.string()),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
    sortBy: v.optional(v.union(
      v.literal("date"), v.literal("amount"), v.literal("status"), v.literal("dueDate")
    )),
    sortOrder: v.optional(v.union(v.literal("asc"), v.literal("desc"))),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { invoices: [], nextCursor: null, totalCount: 0, summary: { totalDraft: 0, totalSent: 0, totalOverdue: 0, totalPaid: 0, totalOutstanding: 0 } };

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return { invoices: [], nextCursor: null, totalCount: 0, summary: { totalDraft: 0, totalSent: 0, totalOverdue: 0, totalPaid: 0, totalOutstanding: 0 } };

    // Verify membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { invoices: [], nextCursor: null, totalCount: 0, summary: { totalDraft: 0, totalSent: 0, totalOverdue: 0, totalPaid: 0, totalOutstanding: 0 } };
    }

    // Query invoices
    let invoicesQuery;
    if (args.status) {
      invoicesQuery = ctx.db
        .query("sales_invoices")
        .withIndex("by_businessId_status", (q) =>
          q.eq("businessId", args.businessId).eq("status", args.status as never)
        );
    } else {
      invoicesQuery = ctx.db
        .query("sales_invoices")
        .withIndex("by_businessId", (q) =>
          q.eq("businessId", args.businessId)
        );
    }

    let invoices = await invoicesQuery.collect();

    // Filter out soft-deleted
    invoices = invoices.filter((inv) => !inv.deletedAt);

    // Filter by customer
    if (args.customerId) {
      invoices = invoices.filter((inv) => inv.customerId === args.customerId);
    }

    // Filter by date range
    if (args.dateFrom) {
      invoices = invoices.filter((inv) => inv.invoiceDate >= args.dateFrom!);
    }
    if (args.dateTo) {
      invoices = invoices.filter((inv) => inv.invoiceDate <= args.dateTo!);
    }

    const totalCount = invoices.length;

    // Calculate summary
    const summary = {
      totalDraft: 0,
      totalSent: 0,
      totalOverdue: 0,
      totalPaid: 0,
      totalOutstanding: 0,
    };

    for (const inv of invoices) {
      switch (inv.status) {
        case "draft": summary.totalDraft++; break;
        case "sent": summary.totalSent++; summary.totalOutstanding += inv.balanceDue; break;
        case "overdue": summary.totalOverdue++; summary.totalOutstanding += inv.balanceDue; break;
        case "paid": summary.totalPaid++; break;
        case "partially_paid": summary.totalOutstanding += inv.balanceDue; break;
      }
    }

    // Sort
    const sortBy = args.sortBy ?? "date";
    const sortOrder = args.sortOrder ?? "desc";

    invoices.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "date": cmp = a.invoiceDate.localeCompare(b.invoiceDate); break;
        case "amount": cmp = a.totalAmount - b.totalAmount; break;
        case "dueDate": cmp = a.dueDate.localeCompare(b.dueDate); break;
        case "status": cmp = a.status.localeCompare(b.status); break;
      }
      return sortOrder === "desc" ? -cmp : cmp;
    });

    // Pagination
    const limit = args.limit ?? 50;
    const startIndex = args.cursor ? parseInt(args.cursor, 10) : 0;
    const paged = invoices.slice(startIndex, startIndex + limit);
    const nextCursor = startIndex + limit < totalCount ? String(startIndex + limit) : null;

    return {
      invoices: paged,
      nextCursor,
      totalCount,
      summary,
    };
  },
});

/**
 * Get a single sales invoice by ID
 */
export const getById = query({
  args: {
    id: v.string(),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return null;

    // Verify membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") return null;

    // Try Convex ID first
    try {
      const invoice = await ctx.db.get(args.id as import("../_generated/dataModel").Id<"sales_invoices">);
      if (invoice && invoice.businessId === args.businessId && !invoice.deletedAt) {
        return invoice;
      }
    } catch {
      // Not a valid Convex ID
    }

    return null;
  },
});

/**
 * Get the next invoice number for a business
 */
export const getNextInvoiceNumber = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const business = await ctx.db.get(args.businessId);
    if (!business) return null;

    const settings = business.invoiceSettings;
    const prefix = settings?.invoiceNumberPrefix ?? "INV";
    const nextNum = settings?.nextInvoiceNumber ?? 1;
    const year = new Date().getFullYear();

    return `${prefix}-${year}-${String(nextNum).padStart(3, "0")}`;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new sales invoice (draft status)
 */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    customerId: v.optional(v.id("customers")),
    customerSnapshot: v.object({
      businessName: v.string(),
      contactPerson: v.optional(v.string()),
      email: v.string(),
      phone: v.optional(v.string()),
      address: v.optional(v.string()),
      taxId: v.optional(v.string()),
      // 016-e-invoice-schema-change: LHDN buyer compliance fields
      tin: v.optional(v.string()),
      brn: v.optional(v.string()),
      addressLine1: v.optional(v.string()),
      addressLine2: v.optional(v.string()),
      addressLine3: v.optional(v.string()),
      city: v.optional(v.string()),
      stateCode: v.optional(v.string()),
      postalCode: v.optional(v.string()),
      countryCode: v.optional(v.string()),
    }),
    lineItems: v.array(v.object({
      lineOrder: v.number(),
      description: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      taxRate: v.optional(v.number()),
      taxAmount: v.optional(v.number()),
      discountType: v.optional(v.union(v.literal("percentage"), v.literal("fixed"))),
      discountValue: v.optional(v.number()),
      discountAmount: v.optional(v.number()),
      totalAmount: v.number(),
      currency: v.string(),
      itemCode: v.optional(v.string()),
      unitMeasurement: v.optional(v.string()),
      catalogItemId: v.optional(v.string()),
      itemNotes: v.optional(v.string()),
      supplyDateStart: v.optional(v.string()),
      supplyDateEnd: v.optional(v.string()),
      isDiscountable: v.optional(v.boolean()),
    })),
    currency: v.string(),
    taxMode: v.union(v.literal("exclusive"), v.literal("inclusive")),
    invoiceDate: v.string(),
    paymentTerms: paymentTermsValidator,
    dueDate: v.string(),
    notes: v.optional(v.string()),
    paymentInstructions: v.optional(v.string()),
    templateId: v.optional(v.string()),
    signatureName: v.optional(v.string()),
    invoiceDiscountType: v.optional(v.union(v.literal("percentage"), v.literal("fixed"))),
    invoiceDiscountValue: v.optional(v.number()),
    footer: v.optional(v.string()),
    customFields: v.optional(v.array(v.object({ key: v.string(), value: v.string() }))),
    showTaxId: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireFinanceAdmin(ctx, args.businessId);

    // Pre-flight: check sales invoice limit
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new Error("Business not found");

    const planName = business.planName;
    const invoiceLimit =
      planName === "starter" ? 10 :
      planName === "pro" ? -1 :
      planName === "enterprise" ? -1 :
      -1; // Trial and unknown = Pro limits (unlimited)

    if (invoiceLimit !== -1) {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();

      const existingInvoices = await ctx.db
        .query("sales_invoices")
        .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
        .collect();

      const monthlyCount = existingInvoices.filter(
        (inv) => inv._creationTime >= monthStart && inv._creationTime < monthEnd
      ).length;

      if (monthlyCount >= invoiceLimit) {
        throw new Error(
          "Sales invoice limit reached for this month. Upgrade to Pro for unlimited invoices."
        );
      }
    }

    // Validate
    if (args.lineItems.length === 0) {
      throw new Error("At least one line item is required");
    }

    const settings = business.invoiceSettings;
    const prefix = settings?.invoiceNumberPrefix ?? "INV";
    const nextNum = settings?.nextInvoiceNumber ?? 1;
    const year = new Date().getFullYear();
    const invoiceNumber = `${prefix}-${year}-${String(nextNum).padStart(3, "0")}`;

    // Calculate totals
    const subtotal = args.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const totalTax = args.lineItems.reduce((sum, item) => sum + (item.taxAmount ?? 0), 0);
    const lineTotals = args.lineItems.reduce((sum, item) => sum + item.totalAmount, 0);

    let invoiceDiscount = 0;
    if (args.invoiceDiscountType && args.invoiceDiscountValue) {
      if (args.invoiceDiscountType === "percentage") {
        invoiceDiscount = Math.round(lineTotals * (args.invoiceDiscountValue / 100) * 100) / 100;
      } else {
        invoiceDiscount = Math.min(args.invoiceDiscountValue, lineTotals);
      }
    }

    const totalAmount = Math.round((lineTotals - invoiceDiscount) * 100) / 100;

    // Create invoice
    const invoiceId = await ctx.db.insert("sales_invoices", {
      businessId: args.businessId,
      userId: user._id,
      invoiceNumber,
      customerId: args.customerId,
      customerSnapshot: args.customerSnapshot,
      lineItems: args.lineItems,
      subtotal: Math.round(subtotal * 100) / 100,
      totalDiscount: invoiceDiscount > 0 ? invoiceDiscount : undefined,
      invoiceDiscountType: args.invoiceDiscountType,
      invoiceDiscountValue: args.invoiceDiscountValue,
      totalTax: Math.round(totalTax * 100) / 100,
      totalAmount,
      balanceDue: totalAmount,
      currency: args.currency,
      taxMode: args.taxMode,
      invoiceDate: args.invoiceDate,
      dueDate: args.dueDate,
      paymentTerms: args.paymentTerms,
      status: "draft",
      notes: args.notes,
      paymentInstructions: args.paymentInstructions,
      templateId: args.templateId,
      signatureName: args.signatureName,
      footer: args.footer,
      customFields: args.customFields,
      showTaxId: args.showTaxId,
      updatedAt: Date.now(),
    });

    // Atomically increment invoice number counter
    const currentSettings = business.invoiceSettings ?? {};
    await ctx.db.patch(args.businessId, {
      invoiceSettings: {
        ...currentSettings,
        nextInvoiceNumber: nextNum + 1,
      },
      updatedAt: Date.now(),
    });

    return invoiceId;
  },
});

/**
 * Update a draft invoice
 */
export const update = mutation({
  args: {
    id: v.id("sales_invoices"),
    businessId: v.id("businesses"),
    customerId: v.optional(v.id("customers")),
    customerSnapshot: v.optional(v.object({
      businessName: v.string(),
      contactPerson: v.optional(v.string()),
      email: v.string(),
      phone: v.optional(v.string()),
      address: v.optional(v.string()),
      taxId: v.optional(v.string()),
      // 016-e-invoice-schema-change: LHDN buyer compliance fields
      tin: v.optional(v.string()),
      brn: v.optional(v.string()),
      addressLine1: v.optional(v.string()),
      addressLine2: v.optional(v.string()),
      addressLine3: v.optional(v.string()),
      city: v.optional(v.string()),
      stateCode: v.optional(v.string()),
      postalCode: v.optional(v.string()),
      countryCode: v.optional(v.string()),
    })),
    lineItems: v.optional(v.array(v.object({
      lineOrder: v.number(),
      description: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      taxRate: v.optional(v.number()),
      taxAmount: v.optional(v.number()),
      discountType: v.optional(v.union(v.literal("percentage"), v.literal("fixed"))),
      discountValue: v.optional(v.number()),
      discountAmount: v.optional(v.number()),
      totalAmount: v.number(),
      currency: v.string(),
      itemCode: v.optional(v.string()),
      unitMeasurement: v.optional(v.string()),
      catalogItemId: v.optional(v.string()),
      itemNotes: v.optional(v.string()),
      supplyDateStart: v.optional(v.string()),
      supplyDateEnd: v.optional(v.string()),
      isDiscountable: v.optional(v.boolean()),
    }))),
    currency: v.optional(v.string()),
    taxMode: v.optional(v.union(v.literal("exclusive"), v.literal("inclusive"))),
    invoiceDate: v.optional(v.string()),
    paymentTerms: v.optional(paymentTermsValidator),
    dueDate: v.optional(v.string()),
    notes: v.optional(v.string()),
    paymentInstructions: v.optional(v.string()),
    templateId: v.optional(v.string()),
    signatureName: v.optional(v.string()),
    invoiceDiscountType: v.optional(v.union(v.literal("percentage"), v.literal("fixed"))),
    invoiceDiscountValue: v.optional(v.number()),
    footer: v.optional(v.string()),
    customFields: v.optional(v.array(v.object({ key: v.string(), value: v.string() }))),
    showTaxId: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const invoice = await ctx.db.get(args.id);
    if (!invoice || invoice.businessId !== args.businessId || invoice.deletedAt) {
      throw new Error("Invoice not found");
    }

    if (invoice.status !== "draft") {
      throw new Error("Cannot edit a sent/paid/void invoice");
    }

    // Build update object
    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    if (args.customerSnapshot) updates.customerSnapshot = args.customerSnapshot;
    if (args.customerId !== undefined) updates.customerId = args.customerId;
    if (args.currency) updates.currency = args.currency;
    if (args.taxMode) updates.taxMode = args.taxMode;
    if (args.invoiceDate) updates.invoiceDate = args.invoiceDate;
    if (args.paymentTerms) updates.paymentTerms = args.paymentTerms;
    if (args.dueDate) updates.dueDate = args.dueDate;
    if (args.notes !== undefined) updates.notes = args.notes;
    if (args.paymentInstructions !== undefined) updates.paymentInstructions = args.paymentInstructions;
    if (args.templateId !== undefined) updates.templateId = args.templateId;
    if (args.signatureName !== undefined) updates.signatureName = args.signatureName;
    if (args.invoiceDiscountType !== undefined) updates.invoiceDiscountType = args.invoiceDiscountType;
    if (args.invoiceDiscountValue !== undefined) updates.invoiceDiscountValue = args.invoiceDiscountValue;
    if (args.footer !== undefined) updates.footer = args.footer;
    if (args.customFields !== undefined) updates.customFields = args.customFields;
    if (args.showTaxId !== undefined) updates.showTaxId = args.showTaxId;

    // Recalculate totals if line items changed
    if (args.lineItems) {
      if (args.lineItems.length === 0) {
        throw new Error("At least one line item is required");
      }

      updates.lineItems = args.lineItems;
      const subtotal = args.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
      const totalTax = args.lineItems.reduce((sum, item) => sum + (item.taxAmount ?? 0), 0);
      const lineTotals = args.lineItems.reduce((sum, item) => sum + item.totalAmount, 0);

      const discType = args.invoiceDiscountType ?? invoice.invoiceDiscountType;
      const discVal = args.invoiceDiscountValue ?? invoice.invoiceDiscountValue;
      let invoiceDiscount = 0;
      if (discType && discVal) {
        invoiceDiscount = discType === "percentage"
          ? Math.round(lineTotals * (discVal / 100) * 100) / 100
          : Math.min(discVal, lineTotals);
      }

      const totalAmount = Math.round((lineTotals - invoiceDiscount) * 100) / 100;

      updates.subtotal = Math.round(subtotal * 100) / 100;
      updates.totalTax = Math.round(totalTax * 100) / 100;
      updates.totalAmount = totalAmount;
      updates.totalDiscount = invoiceDiscount > 0 ? invoiceDiscount : undefined;
      updates.balanceDue = totalAmount;
    }

    await ctx.db.patch(args.id, updates);
    return args.id;
  },
});

/**
 * Send an invoice (draft → sent)
 */
export const send = mutation({
  args: {
    id: v.id("sales_invoices"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const { user } = await requireFinanceAdmin(ctx, args.businessId);

    const invoice = await ctx.db.get(args.id);
    if (!invoice || invoice.businessId !== args.businessId || invoice.deletedAt) {
      throw new Error("Invoice not found");
    }

    if (invoice.status !== "draft") {
      throw new Error("Invoice not in sendable state");
    }

    // Validate required fields
    if (!invoice.customerSnapshot.email) {
      throw new Error("Customer email is required to send invoice");
    }
    if (invoice.lineItems.length === 0) {
      throw new Error("At least one line item is required");
    }
    if (invoice.totalAmount <= 0) {
      throw new Error("Invoice total must be greater than 0");
    }

    // Auto-create customer record if not linked (ensures debtor tracking works)
    let customerId = invoice.customerId;
    if (!customerId) {
      // Check if a customer with same email already exists for this business
      const existingCustomers = await ctx.db
        .query("customers")
        .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
        .collect();
      const existingCustomer = existingCustomers.find(
        (c) => c.email === invoice.customerSnapshot.email && !c.deletedAt
      );

      if (existingCustomer) {
        customerId = existingCustomer._id;
      } else {
        customerId = await ctx.db.insert("customers", {
          businessId: args.businessId,
          businessName: invoice.customerSnapshot.businessName,
          contactPerson: invoice.customerSnapshot.contactPerson,
          email: invoice.customerSnapshot.email,
          phone: invoice.customerSnapshot.phone,
          address: invoice.customerSnapshot.address,
          taxId: invoice.customerSnapshot.taxId,
          // 016-e-invoice-schema-change: Map snapshot e-invoice fields to customer record
          tin: invoice.customerSnapshot.tin,
          brn: invoice.customerSnapshot.brn,
          addressLine1: invoice.customerSnapshot.addressLine1,
          addressLine2: invoice.customerSnapshot.addressLine2,
          addressLine3: invoice.customerSnapshot.addressLine3,
          city: invoice.customerSnapshot.city,
          stateCode: invoice.customerSnapshot.stateCode,
          postalCode: invoice.customerSnapshot.postalCode,
          countryCode: invoice.customerSnapshot.countryCode,
          status: "active",
          updatedAt: Date.now(),
        });
      }
    }

    // Update status to sent + ensure customerId is linked
    await ctx.db.patch(args.id, {
      status: "sent",
      sentAt: Date.now(),
      customerId,
      updatedAt: Date.now(),
    });

    // Create journal entry (AR - Accounts Receivable / Sales Revenue)
    const lines: Array<{
      accountCode: string;
      debitAmount: number;
      creditAmount: number;
      lineDescription?: string;
      entityType?: "customer" | "vendor" | "employee";
      entityId?: string;
      entityName?: string;
    }> = [];

    // Line 1: Debit Accounts Receivable (full amount)
    lines.push({
      accountCode: "1200", // Accounts Receivable
      debitAmount: invoice.totalAmount,
      creditAmount: 0,
      lineDescription: `Invoice #${invoice.invoiceNumber}`,
      entityType: "customer",
      entityId: customerId,
      entityName: invoice.customerSnapshot.businessName,
    });

    // Line 2: Credit Sales Revenue (subtotal before tax)
    lines.push({
      accountCode: "4100", // Sales Revenue
      debitAmount: 0,
      creditAmount: invoice.subtotal,
      lineDescription: "Sales revenue",
    });

    // Line 3: Credit Sales Tax Payable (if tax included)
    if (invoice.totalTax && invoice.totalTax > 0) {
      lines.push({
        accountCode: "2200", // Sales Tax Payable
        debitAmount: 0,
        creditAmount: invoice.totalTax,
        lineDescription: "Sales tax",
      });
    }

    // Create journal entry via internal mutation
    const { entryId: journalEntryId } = await ctx.runMutation(
      internal.functions.journalEntries.createInternal,
      {
        businessId: args.businessId,
        transactionDate: invoice.invoiceDate,
        description: `Sales Invoice ${invoice.invoiceNumber} - ${invoice.customerSnapshot.businessName}`,
        sourceType: "sales_invoice",
        sourceId: args.id,
        lines,
      }
    );

    // Link journal entry to invoice
    await ctx.db.patch(args.id, {
      journalEntryId,
    });
    return args.id;
  },
});

/**
 * Void an invoice
 */
export const voidInvoice = mutation({
  args: {
    id: v.id("sales_invoices"),
    businessId: v.id("businesses"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const invoice = await ctx.db.get(args.id);
    if (!invoice || invoice.businessId !== args.businessId || invoice.deletedAt) {
      throw new Error("Invoice not found");
    }

    if (invoice.status === "void") {
      throw new Error("Invoice is already void");
    }

    await ctx.db.patch(args.id, {
      status: "void",
      voidedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Reverse the journal entry if one exists (proper audit trail)
    if (invoice.journalEntryId) {
      const originalJE = await ctx.db.get(invoice.journalEntryId);
      if (originalJE && (originalJE as any).status === "posted") {
        // Get original lines and reverse them
        const originalLines = await ctx.db
          .query("journal_entry_lines")
          .withIndex("by_journal_entry", (q: any) => q.eq("journalEntryId", invoice.journalEntryId))
          .collect();

        if (originalLines.length > 0) {
          await ctx.runMutation(internal.functions.journalEntries.createInternal, {
            businessId: args.businessId,
            transactionDate: new Date().toISOString().split("T")[0],
            description: `REVERSAL: ${(originalJE as any).description}${args.reason ? ` — ${args.reason}` : ""}`,
            sourceType: "sales_invoice" as const,
            sourceId: args.id,
            lines: originalLines.map((line: any) => ({
              accountCode: line.accountCode,
              debitAmount: line.creditAmount,   // Swap debit/credit to reverse
              creditAmount: line.debitAmount,
              lineDescription: `Void reversal: ${line.lineDescription || ""}`,
            })),
          });

          // Mark original as reversed
          await ctx.db.patch(invoice.journalEntryId, {
            status: "reversed",
            updatedAt: Date.now(),
          } as any);
        }
      }
    }

    return args.id;
  },
});

/**
 * Soft delete a draft invoice
 */
export const remove = mutation({
  args: {
    id: v.id("sales_invoices"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const invoice = await ctx.db.get(args.id);
    if (!invoice || invoice.businessId !== args.businessId) {
      throw new Error("Invoice not found");
    }

    if (invoice.status !== "draft") {
      throw new Error("Only draft invoices can be deleted");
    }

    // Delete stored PDF if exists
    if (invoice.pdfStorageId) {
      try {
        await ctx.storage.delete(invoice.pdfStorageId);
      } catch {
        // File may already be deleted
      }
    }

    await ctx.db.patch(args.id, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

// ============================================
// LHDN SUBMISSION (017-lhdn-submission-ui)
// ============================================

/**
 * Submit an invoice to LHDN MyInvois
 * Sets lhdnStatus to "pending" and records submission timestamp.
 * Actual LHDN API integration is handled separately (#75).
 */
export const submitToLhdn = mutation({
  args: {
    invoiceId: v.id("sales_invoices"),
    businessId: v.id("businesses"),
    useGeneralTin: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Auth: owner or finance_admin only
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (!["owner", "finance_admin"].includes(membership.role)) {
      throw new Error("Not authorized: owner or finance admin required");
    }

    // Validate invoice
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.businessId !== args.businessId || invoice.deletedAt) {
      throw new Error("Invoice not found");
    }

    if (invoice.status !== "sent") {
      throw new Error("Invoice must be sent before submitting to LHDN");
    }

    if (invoice.lhdnStatus !== undefined) {
      throw new Error("Invoice already submitted to LHDN");
    }

    // Validate business LHDN config
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new Error("Business not found");

    const missingFields: string[] = [];
    if (!business.lhdnTin) missingFields.push("lhdnTin");
    if (!business.businessRegistrationNumber) missingFields.push("businessRegistrationNumber");
    if (!business.msicCode) missingFields.push("msicCode");

    if (missingFields.length > 0) {
      throw new Error(`Business LHDN configuration incomplete: missing ${missingFields.join(", ")}`);
    }

    // Auto-determine einvoice type based on document (always "invoice" for sales invoices)
    const einvoiceType = "invoice" as const;

    // Set LHDN status to pending
    await ctx.db.patch(args.invoiceId, {
      lhdnStatus: "pending",
      lhdnSubmittedAt: Date.now(),
      einvoiceType,
      updatedAt: Date.now(),
    });

    return {
      success: true,
      invoiceId: args.invoiceId,
      lhdnStatus: "pending" as const,
    };
  },
});

/**
 * Resubmit an invalid invoice to LHDN
 * Clears previous validation data and resets to "pending".
 */
export const resubmitToLhdn = mutation({
  args: {
    invoiceId: v.id("sales_invoices"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    // Auth: owner or finance_admin only
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (!["owner", "finance_admin"].includes(membership.role)) {
      throw new Error("Not authorized: owner or finance admin required");
    }

    // Validate invoice
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.businessId !== args.businessId || invoice.deletedAt) {
      throw new Error("Invoice not found");
    }

    if (invoice.status !== "sent") {
      throw new Error("Invoice must be sent before submitting to LHDN");
    }

    if (invoice.lhdnStatus !== "invalid") {
      throw new Error("Only invalid invoices can be resubmitted to LHDN");
    }

    // Validate business LHDN config
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new Error("Business not found");

    const missingFields: string[] = [];
    if (!business.lhdnTin) missingFields.push("lhdnTin");
    if (!business.businessRegistrationNumber) missingFields.push("businessRegistrationNumber");
    if (!business.msicCode) missingFields.push("msicCode");

    if (missingFields.length > 0) {
      throw new Error(`Business LHDN configuration incomplete: missing ${missingFields.join(", ")}`);
    }

    // Reset LHDN fields and set to pending
    await ctx.db.patch(args.invoiceId, {
      lhdnStatus: "pending",
      lhdnSubmittedAt: Date.now(),
      lhdnValidationErrors: undefined,
      lhdnValidatedAt: undefined,
      lhdnDocumentUuid: undefined,
      lhdnLongId: undefined,
      lhdnDocumentHash: undefined,
      updatedAt: Date.now(),
    });

    return {
      success: true,
      invoiceId: args.invoiceId,
      lhdnStatus: "pending" as const,
    };
  },
});

// ============================================
// PDF STORAGE
// ============================================

/**
 * Generate an upload URL for storing invoice PDF in Convex storage
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Store the PDF storage ID on an invoice after upload
 */
export const storePdfStorageId = mutation({
  args: {
    id: v.id("sales_invoices"),
    businessId: v.id("businesses"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const invoice = await ctx.db.get(args.id);
    if (!invoice || invoice.businessId !== args.businessId || invoice.deletedAt) {
      throw new Error("Invoice not found");
    }

    // Delete old PDF if exists
    if (invoice.pdfStorageId) {
      try {
        await ctx.storage.delete(invoice.pdfStorageId);
      } catch {
        // Old file may already be deleted
      }
    }

    await ctx.db.patch(args.id, {
      pdfStorageId: args.storageId,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Get the PDF download URL for an invoice
 */
export const getPdfUrl = query({
  args: {
    id: v.string(),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return null;

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") return null;

    try {
      const invoice = await ctx.db.get(args.id as import("../_generated/dataModel").Id<"sales_invoices">);
      if (!invoice || invoice.businessId !== args.businessId || invoice.deletedAt) return null;
      if (!invoice.pdfStorageId) return null;

      return await ctx.storage.getUrl(invoice.pdfStorageId);
    } catch {
      return null;
    }
  },
});

// ============================================
// INTERNAL MUTATIONS (Cron Jobs)
// ============================================

/**
 * Mark overdue invoices - called daily by cron
 */
export const markOverdue = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = new Date().toISOString().split("T")[0];
    let markedCount = 0;

    // Find sent invoices that are past due
    const sentInvoices = await ctx.db
      .query("sales_invoices")
      .filter((q) =>
        q.and(
          q.or(
            q.eq(q.field("status"), "sent"),
            q.eq(q.field("status"), "partially_paid")
          ),
          q.lt(q.field("dueDate"), today),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .collect();

    // Group newly-overdue invoices by business for insight generation
    const byBusiness = new Map<string, typeof sentInvoices>();

    for (const invoice of sentInvoices) {
      await ctx.db.patch(invoice._id, {
        status: "overdue",
        updatedAt: Date.now(),
      });
      markedCount++;

      const businessKey = invoice.businessId.toString();
      const group = byBusiness.get(businessKey) ?? [];
      group.push(invoice);
      byBusiness.set(businessKey, group);
    }

    // Also check EXISTING overdue invoices for aging escalation
    const existingOverdue = await ctx.db
      .query("sales_invoices")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "overdue"),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .collect();

    for (const invoice of existingOverdue) {
      // Skip if already in newly-overdue batch
      if (sentInvoices.some((i) => i._id === invoice._id)) continue;
      const businessKey = invoice.businessId.toString();
      const group = byBusiness.get(businessKey) ?? [];
      group.push(invoice);
      byBusiness.set(businessKey, group);
    }

    // Generate insights per business (with dedup)
    const existingInsights = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_category", (q: any) => q.eq("category", "deadline"))
      .collect();

    const dedupCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000; // 3 months

    for (const [businessId, invoices] of byBusiness) {
      // Dedup: skip if we created an overdue AR insight for this business within 24h
      const isDuplicate = existingInsights.some(
        (i) =>
          i.businessId === businessId &&
          i.metadata?.insightType === "overdue_receivables_batch" &&
          i.detectedAt > dedupCutoff
      );
      if (isDuplicate) continue; // Skip — already surfaced within 3 months

      const totalOutstanding = invoices.reduce(
        (sum, inv) => sum + (inv.balanceDue ?? inv.totalAmount),
        0
      );

      // Aging: oldest overdue determines priority
      const oldestDueDate = invoices
        .map((inv) => inv.dueDate)
        .filter(Boolean)
        .sort()[0] || today;
      const daysOverdue = Math.floor(
        (Date.now() - new Date(oldestDueDate).getTime()) / (24 * 60 * 60 * 1000)
      );
      const priority = daysOverdue > 30 ? "critical" : daysOverdue > 14 ? "high" : "medium";

      // Get admin/owner members
      const firstInvoice = invoices[0];
      const members = await ctx.db
        .query("business_memberships")
        .withIndex("by_businessId", (q: any) => q.eq("businessId", firstInvoice.businessId))
        .collect();

      const targetMembers = members.filter(
        (m: any) => m.status === "active" && ["owner", "finance_admin", "admin"].includes(m.role)
      );

      for (const member of targetMembers) {
        await ctx.db.insert("actionCenterInsights", {
          userId: member.userId.toString(),
          businessId,
          category: "deadline" as const,
          priority: priority as "critical" | "high" | "medium",
          status: "new" as const,
          title: `${invoices.length} invoice${invoices.length > 1 ? "s" : ""} overdue${daysOverdue > 14 ? ` (${daysOverdue}+ days)` : ""}`,
          description: `${invoices.length} unpaid invoice${invoices.length > 1 ? "s" : ""} totaling ${totalOutstanding.toLocaleString()} are overdue. Follow up with customers to collect payment.`,
          affectedEntities: invoices.map((inv) => inv._id.toString()),
          recommendedAction: daysOverdue > 30
            ? "Urgent: Send final payment reminders and consider escalation for invoices 30+ days overdue."
            : "Send payment reminders to customers with overdue invoices.",
          detectedAt: Date.now(),
          // No expiresAt — persists until user acts
          metadata: {
            insightType: "overdue_receivables_batch",
            count: invoices.length,
            totalOutstanding,
            daysOverdue,
            oldestDueDate,
          },
        });
      }
    }

    console.log(`[markOverdue] Marked ${markedCount} invoices as overdue`);
    return { markedCount };
  },
});

/**
 * Generate due recurring invoices - called daily by cron
 */
export const generateDueInvoices = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = new Date().toISOString().split("T")[0];
    let generatedCount = 0;

    // Find active schedules due for generation
    const schedules = await ctx.db
      .query("recurring_invoice_schedules")
      .withIndex("by_isActive_nextDate", (q) =>
        q.eq("isActive", true)
      )
      .collect();

    const dueSchedules = schedules.filter(
      (s) => s.nextGenerationDate <= today && !s.deletedAt
    );

    for (const schedule of dueSchedules) {
      // Get source invoice
      const sourceInvoice = await ctx.db.get(schedule.sourceInvoiceId);
      if (!sourceInvoice || sourceInvoice.deletedAt) {
        // Deactivate broken schedules
        await ctx.db.patch(schedule._id, {
          isActive: false,
          updatedAt: Date.now(),
        });
        continue;
      }

      // Get business for invoice number
      const business = await ctx.db.get(sourceInvoice.businessId);
      if (!business) continue;

      const settings = business.invoiceSettings ?? {};
      const prefix = settings.invoiceNumberPrefix ?? "INV";
      const nextNum = settings.nextInvoiceNumber ?? 1;
      const year = new Date().getFullYear();
      const invoiceNumber = `${prefix}-${year}-${String(nextNum).padStart(3, "0")}`;

      // Clone invoice as new draft
      await ctx.db.insert("sales_invoices", {
        businessId: sourceInvoice.businessId,
        userId: sourceInvoice.userId,
        invoiceNumber,
        customerId: sourceInvoice.customerId,
        customerSnapshot: sourceInvoice.customerSnapshot,
        lineItems: sourceInvoice.lineItems,
        subtotal: sourceInvoice.subtotal,
        totalDiscount: sourceInvoice.totalDiscount,
        invoiceDiscountType: sourceInvoice.invoiceDiscountType,
        invoiceDiscountValue: sourceInvoice.invoiceDiscountValue,
        totalTax: sourceInvoice.totalTax,
        totalAmount: sourceInvoice.totalAmount,
        balanceDue: sourceInvoice.totalAmount,
        currency: sourceInvoice.currency,
        taxMode: sourceInvoice.taxMode,
        invoiceDate: today,
        dueDate: computeNextDueDate(today, sourceInvoice.paymentTerms),
        paymentTerms: sourceInvoice.paymentTerms,
        status: "draft",
        notes: sourceInvoice.notes,
        paymentInstructions: sourceInvoice.paymentInstructions,
        templateId: sourceInvoice.templateId,
        recurringScheduleId: schedule._id,
        updatedAt: Date.now(),
      });

      // Increment business invoice number
      await ctx.db.patch(sourceInvoice.businessId, {
        invoiceSettings: {
          ...settings,
          nextInvoiceNumber: nextNum + 1,
        },
        updatedAt: Date.now(),
      });

      // Advance schedule
      const nextDate = computeNextGenerationDate(schedule.nextGenerationDate, schedule.frequency);
      const shouldDeactivate = schedule.endDate && nextDate > schedule.endDate;

      await ctx.db.patch(schedule._id, {
        nextGenerationDate: shouldDeactivate ? schedule.nextGenerationDate : nextDate,
        isActive: !shouldDeactivate,
        lastGeneratedAt: Date.now(),
        generationCount: (schedule.generationCount ?? 0) + 1,
        updatedAt: Date.now(),
      });

      generatedCount++;
    }

    console.log(`[generateDueInvoices] Generated ${generatedCount} invoices`);
    return { generatedCount };
  },
});

// ============================================
// CUSTOM TEMPLATE QUERIES & MUTATIONS
// ============================================

export const getCustomTemplates = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { customNoteTemplates: [], customPaymentTemplates: [] };

    const business = await ctx.db.get(args.businessId);
    if (!business) return { customNoteTemplates: [], customPaymentTemplates: [] };

    const settings = (business as Record<string, unknown>).invoiceSettings as Record<string, unknown> | undefined;
    return {
      customNoteTemplates: (settings?.customNoteTemplates as Array<{ id: string; label: string; text: string }>) ?? [],
      customPaymentTemplates: (settings?.customPaymentTemplates as Array<{ id: string; label: string; text: string }>) ?? [],
    };
  },
});

export const addInvoiceTemplate = mutation({
  args: {
    businessId: v.id("businesses"),
    templateType: v.union(v.literal("note"), v.literal("payment")),
    label: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const business = await ctx.db.get(args.businessId);
    if (!business) throw new Error("Business not found");

    const settings = (business as Record<string, unknown>).invoiceSettings as Record<string, unknown> | undefined ?? {};
    const field = args.templateType === "note" ? "customNoteTemplates" : "customPaymentTemplates";
    const existing = (settings[field] as Array<{ id: string; label: string; text: string }>) ?? [];

    const newTemplate = {
      id: `${args.templateType}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      label: args.label,
      text: args.text,
    };

    await ctx.db.patch(args.businessId, {
      invoiceSettings: {
        ...settings,
        [field]: [...existing, newTemplate],
      } as never,
      updatedAt: Date.now(),
    });

    return newTemplate.id;
  },
});

export const getInvoiceDefaults = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const business = await ctx.db.get(args.businessId);
    if (!business) return null;

    const settings = business.invoiceSettings;

    // Resolve payment methods: prefer new rich format, fall back to old string array
    let paymentMethods: Array<{
      id: string;
      label: string;
      enabled: boolean;
      details?: string;
      qrCodeUrl?: string;
    }> = [];

    if (settings?.paymentMethods && settings.paymentMethods.length > 0) {
      // Resolve QR code URLs from storage IDs
      paymentMethods = await Promise.all(
        settings.paymentMethods.map(async (m) => {
          let qrCodeUrl: string | undefined;
          if (m.qrCodeStorageId) {
            qrCodeUrl = (await ctx.storage.getUrl(m.qrCodeStorageId as never)) ?? undefined;
          }
          return {
            id: m.id,
            label: m.label,
            enabled: m.enabled,
            details: m.details,
            qrCodeUrl,
          };
        })
      );
    } else if (settings?.acceptedPaymentMethods && settings.acceptedPaymentMethods.length > 0) {
      // Backward compat: convert old string array to new format
      const labelMap: Record<string, string> = {
        bank_transfer: "Bank Transfer",
        credit_card: "Credit Card",
        paynow: "PayNow (SG)",
        duitnow: "DuitNow (MY)",
        promptpay: "PromptPay (TH)",
        gcash: "GCash (PH)",
        grabpay: "GrabPay",
        paypal: "PayPal",
        cheque: "Cheque",
        cash: "Cash",
      };
      paymentMethods = settings.acceptedPaymentMethods.map((id) => ({
        id,
        label: labelMap[id] ?? id,
        enabled: true,
      }));
    }

    return {
      invoiceNumberPrefix: settings?.invoiceNumberPrefix ?? "INV",
      nextInvoiceNumber: settings?.nextInvoiceNumber ?? 1,
      defaultCurrency: settings?.defaultCurrency ?? "SGD",
      defaultPaymentTerms: settings?.defaultPaymentTerms ?? "net_30",
      defaultTaxMode: settings?.defaultTaxMode ?? "exclusive",
      defaultPaymentInstructions: settings?.defaultPaymentInstructions,
      defaultNotes: settings?.defaultNotes,
      defaultSignatureName: settings?.defaultSignatureName,
      selectedTemplate: settings?.selectedTemplate ?? "modern",
      acceptedPaymentMethods: settings?.acceptedPaymentMethods ?? ["bank_transfer"],
      bccOutgoingEmails: settings?.bccOutgoingEmails ?? true,
      paymentMethods,
      customerFieldsVisibility: settings?.customerFieldsVisibility ?? undefined,
    };
  },
});

export const updateInvoiceDefaults = mutation({
  args: {
    businessId: v.id("businesses"),
    defaultNotes: v.optional(v.string()),
    defaultFooter: v.optional(v.string()),
    defaultPaymentInstructions: v.optional(v.string()),
    defaultSignatureName: v.optional(v.string()),
    // Full settings fields
    invoiceNumberPrefix: v.optional(v.string()),
    nextInvoiceNumber: v.optional(v.number()),
    defaultCurrency: v.optional(v.string()),
    defaultPaymentTerms: v.optional(v.string()),
    defaultTaxMode: v.optional(v.string()),
    selectedTemplate: v.optional(v.string()),
    acceptedPaymentMethods: v.optional(v.array(v.string())),
    bccOutgoingEmails: v.optional(v.boolean()),
    paymentMethods: v.optional(v.array(v.object({
      id: v.string(),
      label: v.string(),
      enabled: v.boolean(),
      details: v.optional(v.string()),
      qrCodeStorageId: v.optional(v.string()),
    }))),
    customerFieldsVisibility: v.optional(v.object({
      contactPerson: v.optional(v.boolean()),
      email: v.optional(v.boolean()),
      phone: v.optional(v.boolean()),
      address: v.optional(v.boolean()),
      tin: v.optional(v.boolean()),
      brn: v.optional(v.boolean()),
      sstRegistration: v.optional(v.boolean()),
      idType: v.optional(v.boolean()),
    })),
    // 022-einvoice-lhdn-buyer-flows: LHDN buyer notification settings (on businesses table)
    einvoiceAutoDelivery: v.optional(v.boolean()),
    einvoiceBuyerNotifications: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const business = await ctx.db.get(args.businessId);
    if (!business) throw new Error("Business not found");

    const settings = (business as Record<string, unknown>).invoiceSettings as Record<string, unknown> | undefined ?? {};

    // Build patch: only include fields that were explicitly passed
    const patch: Record<string, unknown> = { ...settings };
    if (args.defaultNotes !== undefined) patch.defaultNotes = args.defaultNotes;
    if (args.defaultFooter !== undefined) patch.defaultFooter = args.defaultFooter;
    if (args.defaultPaymentInstructions !== undefined) patch.defaultPaymentInstructions = args.defaultPaymentInstructions;
    if (args.defaultSignatureName !== undefined) patch.defaultSignatureName = args.defaultSignatureName;
    if (args.invoiceNumberPrefix !== undefined) patch.invoiceNumberPrefix = args.invoiceNumberPrefix;
    if (args.nextInvoiceNumber !== undefined) patch.nextInvoiceNumber = args.nextInvoiceNumber;
    if (args.defaultCurrency !== undefined) patch.defaultCurrency = args.defaultCurrency;
    if (args.defaultPaymentTerms !== undefined) patch.defaultPaymentTerms = args.defaultPaymentTerms;
    if (args.defaultTaxMode !== undefined) patch.defaultTaxMode = args.defaultTaxMode;
    if (args.selectedTemplate !== undefined) patch.selectedTemplate = args.selectedTemplate;
    if (args.acceptedPaymentMethods !== undefined) patch.acceptedPaymentMethods = args.acceptedPaymentMethods;
    if (args.bccOutgoingEmails !== undefined) patch.bccOutgoingEmails = args.bccOutgoingEmails;
    if (args.paymentMethods !== undefined) patch.paymentMethods = args.paymentMethods;
    if (args.customerFieldsVisibility !== undefined) patch.customerFieldsVisibility = args.customerFieldsVisibility;

    // Build business-level patch for LHDN buyer settings
    const businessPatch: Record<string, unknown> = {
      invoiceSettings: patch as never,
      updatedAt: Date.now(),
    };
    if (args.einvoiceAutoDelivery !== undefined) businessPatch.einvoiceAutoDelivery = args.einvoiceAutoDelivery;
    if (args.einvoiceBuyerNotifications !== undefined) businessPatch.einvoiceBuyerNotifications = args.einvoiceBuyerNotifications;

    await ctx.db.patch(args.businessId, businessPatch as never);
  },
});

export const deleteInvoiceTemplate = mutation({
  args: {
    businessId: v.id("businesses"),
    templateType: v.union(v.literal("note"), v.literal("payment")),
    templateId: v.string(),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const business = await ctx.db.get(args.businessId);
    if (!business) throw new Error("Business not found");

    const settings = (business as Record<string, unknown>).invoiceSettings as Record<string, unknown> | undefined ?? {};
    const field = args.templateType === "note" ? "customNoteTemplates" : "customPaymentTemplates";
    const existing = (settings[field] as Array<{ id: string; label: string; text: string }>) ?? [];

    await ctx.db.patch(args.businessId, {
      invoiceSettings: {
        ...settings,
        [field]: existing.filter((t) => t.id !== args.templateId),
      } as never,
      updatedAt: Date.now(),
    });
  },
});

// ============================================
// LHDN STATUS POLLING (Internal)
// ============================================

/**
 * Get issued invoices that need LHDN status polling.
 * Returns invoices with lhdnStatus === "valid" validated within the last 72 hours.
 * Used by the LHDN polling Lambda to detect buyer rejections/cancellations.
 *
 * NOTE: This is a public query (not internalQuery) because the Lambda invokes it
 * via the Convex HTTP API (/api/query), which only supports public functions.
 * Same pattern as getBusinessesForLhdnPolling in system.ts.
 */
export const getIssuedInvoicesForStatusPolling = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const seventyTwoHoursAgo = now - 72 * 60 * 60 * 1000;

    // Tiered polling intervals to reduce API calls:
    // 0-24h: Poll every 5 min (most buyer rejections happen early)
    // 24-48h: Poll every 30 min (less frequent rejections)
    // 48-72h: Poll every 2 hours (rare rejections)
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    const fortyEightHoursAgo = now - 48 * 60 * 60 * 1000;
    const currentMinute = Math.floor(now / (60 * 1000));

    const invoices = await ctx.db
      .query("sales_invoices")
      .filter((q) =>
        q.and(
          q.eq(q.field("lhdnStatus"), "valid"),
          q.neq(q.field("lhdnValidatedAt"), undefined),
          q.gte(q.field("lhdnValidatedAt"), seventyTwoHoursAgo),
          q.eq(q.field("deletedAt"), undefined)
        )
      )
      .collect();

    // Apply tiered sampling to reduce polling frequency for older invoices
    return invoices
      .filter((inv) => {
        const age = now - (inv.lhdnValidatedAt || 0);

        // 0-24h: Poll every time (no filtering)
        if (age < 24 * 60 * 60 * 1000) return true;

        // 24-48h: Poll every 30 minutes (keep 1 in 6 invocations)
        if (age < 48 * 60 * 60 * 1000) {
          return currentMinute % 6 === 0;
        }

        // 48-72h: Poll every 2 hours (keep 1 in 24 invocations)
        return currentMinute % 24 === 0;
      })
      .map((inv) => ({
        _id: inv._id,
        businessId: inv.businessId,
        lhdnSubmissionId: inv.lhdnSubmissionId,
        lhdnDocumentUuid: inv.lhdnDocumentUuid,
        lhdnStatus: inv.lhdnStatus,
        lhdnValidatedAt: inv.lhdnValidatedAt,
        invoiceNumber: inv.invoiceNumber,
        journalEntryId: inv.journalEntryId,
      }));
  },
});

/**
 * Update LHDN status from polling when a buyer rejection or cancellation is detected.
 * Creates a notification for business admins/owners.
 *
 * NOTE: This is a public mutation (not internalMutation) because the Lambda invokes it
 * via the Convex HTTP API (/api/mutation), which only supports public functions.
 * Same pattern as processLhdnReceivedDocuments in system.ts.
 */
export const updateLhdnStatusFromPoll = mutation({
  args: {
    invoiceId: v.id("sales_invoices"),
    newStatus: v.union(v.literal("rejected"), v.literal("cancelled_by_buyer")),
    reason: v.optional(v.string()),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      console.error(`[updateLhdnStatusFromPoll] Invoice not found: ${args.invoiceId}`);
      return;
    }

    // Build patch
    const patch: Record<string, unknown> = {
      lhdnStatus: args.newStatus,
      lhdnStatusReason: args.reason,
      updatedAt: Date.now(),
    };

    if (args.newStatus === "rejected") {
      patch.lhdnRejectedAt = args.timestamp;
    }

    // If invoice has a journal entry, flag for review
    if (invoice.journalEntryId) {
      patch.lhdnReviewRequired = true;
    }

    await ctx.db.patch(args.invoiceId, patch);

    // Create notifications for business admins/owners
    const members = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", invoice.businessId))
      .collect();

    const targetMembers = members.filter(
      (m: any) => m.status === "active" && ["owner", "finance_admin", "manager"].includes(m.role)
    );

    const statusLabel = args.newStatus === "rejected" ? "rejected by buyer" : "cancelled by buyer";
    const title = `LHDN e-Invoice ${statusLabel}: ${invoice.invoiceNumber}`;
    const body = args.reason
      ? `Invoice ${invoice.invoiceNumber} has been ${statusLabel}. Reason: ${args.reason}`
      : `Invoice ${invoice.invoiceNumber} has been ${statusLabel}. Review the invoice and take appropriate action.`;

    // Check if business has email notifications enabled
    const business = await ctx.db.get(invoice.businessId);
    const emailEnabled = business?.einvoiceBuyerNotifications !== false;

    for (const member of targetMembers) {
      const notificationId = await ctx.db.insert("notifications", {
        recipientUserId: member.userId,
        businessId: invoice.businessId,
        type: "lhdn_submission",
        severity: "warning",
        status: "unread",
        title,
        body,
        resourceType: "sales_invoice",
        resourceId: invoice._id.toString(),
        createdAt: Date.now(),
      });

      // Schedule email notification if enabled
      if (emailEnabled) {
        const user = await ctx.db.get(member.userId);
        if (user?.email) {
          await ctx.scheduler.runAfter(
            0,
            internal.functions.notifications.sendTransactionalEmail,
            {
              notificationId,
              recipientEmail: user.email,
              recipientName: user.email,
              templateType: "notification_lhdn_status_change",
              templateData: {
                title,
                body,
                invoiceNumber: invoice.invoiceNumber,
                newStatus: args.newStatus,
                reason: args.reason,
              },
              userId: member.userId,
            }
          );
        }
      }
    }

    console.log(
      `[updateLhdnStatusFromPoll] Invoice ${invoice.invoiceNumber} status updated to ${args.newStatus}${emailEnabled ? " (emails scheduled)" : ""}`
    );
  },
});

// ============================================
// LHDN AUTO-DELIVERY QUERIES (no user auth — protected by internal service key at API route level)
// ============================================

/**
 * Get invoice data for auto-delivery. No user auth required.
 * Only used by the internal delivery API route (X-Internal-Key protected).
 */
export const getInvoiceForDelivery = query({
  args: {
    invoiceId: v.id("sales_invoices"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.businessId !== args.businessId || invoice.deletedAt) return null;
    return invoice;
  },
});

// ============================================
// LHDN AUTO-DELIVERY TRACKING
// ============================================

/**
 * Update delivery tracking after e-invoice PDF is emailed to buyer.
 * Extended in 001-einv-pdf-gen to support PDF storage and delivery status.
 */
export const updateLhdnDeliveryStatus = mutation({
  args: {
    invoiceId: v.id("sales_invoices"),
    businessId: v.id("businesses"),
    deliveredTo: v.optional(v.string()),
    s3Path: v.optional(v.string()),  // S3 key with prefix
    deliveryStatus: v.optional(v.string()),  // "pending" | "delivered" | "failed"
    deliveryError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.businessId !== args.businessId) return;

    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    // Legacy fields (when delivery succeeds)
    if (args.deliveredTo) {
      updates.lhdnPdfDeliveredAt = Date.now();
      updates.lhdnPdfDeliveredTo = args.deliveredTo;
    }

    // 001-einv-pdf-gen: New fields for PDF storage and status tracking
    if (args.s3Path !== undefined) {
      updates.lhdnPdfS3Path = args.s3Path;
    }
    if (args.deliveryStatus !== undefined) {
      updates.lhdnPdfDeliveryStatus = args.deliveryStatus;
    }
    if (args.deliveryError !== undefined) {
      updates.lhdnPdfDeliveryError = args.deliveryError;
    }

    await ctx.db.patch(args.invoiceId, updates);
  },
});

export const getLhdnPdfPath = query({
  args: {
    invoiceId: v.id("sales_invoices"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice || invoice.businessId !== args.businessId) return null;

    return invoice.lhdnPdfS3Path || null;
  },
});

/**
 * Get business info for invoice auto-delivery (minimal fields).
 */
export const getBusinessForInvoice = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    if (!business) return null;
    return {
      name: business.name,
      address: business.address,
      contactPhone: business.contactPhone,
      contactEmail: business.contactEmail,
      businessRegistrationNumber: business.businessRegistrationNumber,
      lhdnTin: business.lhdnTin,
      sstRegistrationNumber: business.sstRegistrationNumber,
      logoUrl: business.logoUrl,
      einvoiceAutoDelivery: business.einvoiceAutoDelivery,
      einvoiceBuyerNotifications: business.einvoiceBuyerNotifications,
    };
  },
});

// ============================================
// HELPER FUNCTIONS
// ============================================

// ============================================
// PEPPOL INVOICENOW MUTATIONS
// ============================================

/**
 * Initiate Peppol InvoiceNow transmission for a sales invoice.
 * Sets peppolStatus to "pending" after validating prerequisites.
 * Actual AP transmission is handled by backend integration (#196).
 */
export const initiatePeppolTransmission = mutation({
  args: {
    id: v.id("sales_invoices"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const invoice = await ctx.db.get(args.id);
    if (!invoice || invoice.businessId !== args.businessId || invoice.deletedAt) {
      throw new Error("Invoice not found");
    }

    if (invoice.status === "draft" || invoice.status === "void") {
      throw new Error("Invoice must be sent before transmitting via Peppol");
    }

    if (invoice.peppolStatus !== undefined) {
      throw new Error("Invoice already has a Peppol transmission in progress or completed");
    }

    // Validate sender has Peppol participant ID
    const business = await ctx.db.get(args.businessId);
    if (!business || !business.peppolParticipantId) {
      throw new Error("Business does not have a Peppol participant ID configured");
    }

    // Validate receiver has Peppol participant ID
    if (invoice.customerId) {
      const customer = await ctx.db.get(invoice.customerId);
      if (!customer || !customer.peppolParticipantId) {
        throw new Error("Customer does not have a Peppol participant ID configured");
      }
    } else {
      throw new Error("Customer does not have a Peppol participant ID configured");
    }

    await ctx.db.patch(args.id, {
      peppolStatus: "pending",
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

/**
 * Retry a failed Peppol transmission.
 * Resets peppolStatus to "pending" and clears previous errors.
 */
export const retryPeppolTransmission = mutation({
  args: {
    id: v.id("sales_invoices"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const invoice = await ctx.db.get(args.id);
    if (!invoice || invoice.businessId !== args.businessId || invoice.deletedAt) {
      throw new Error("Invoice not found");
    }

    if (invoice.peppolStatus !== "failed") {
      throw new Error("Can only retry transmission for invoices with failed Peppol status");
    }

    await ctx.db.patch(args.id, {
      peppolStatus: "pending",
      peppolErrors: undefined,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

// ============================================
// CREDIT NOTE MUTATIONS & QUERIES (001-peppol-integrate)
// ============================================

/**
 * Create a credit note linked to a parent invoice.
 * Generates a "CN-{originalInvoiceNumber}-{sequence}" number.
 */
export const createCreditNote = mutation({
  args: {
    originalInvoiceId: v.id("sales_invoices"),
    businessId: v.id("businesses"),
    lineItems: v.array(v.object({
      lineOrder: v.number(),
      description: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      totalAmount: v.number(),
      taxRate: v.optional(v.number()),
      taxAmount: v.optional(v.number()),
      currency: v.string(),
    })),
    creditNoteReason: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireFinanceAdmin(ctx, args.businessId);

    // Validate original invoice
    const originalInvoice = await ctx.db.get(args.originalInvoiceId);
    if (!originalInvoice || originalInvoice.businessId !== args.businessId || originalInvoice.deletedAt) {
      throw new Error("Original invoice not found");
    }

    if (!["sent", "paid", "overdue", "partially_paid"].includes(originalInvoice.status)) {
      throw new Error("Can only create credit notes for sent, paid, or overdue invoices");
    }

    if (args.lineItems.length === 0) {
      throw new Error("At least one line item is required");
    }

    // Calculate credit note totals
    const subtotal = args.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const totalTax = args.lineItems.reduce((sum, item) => sum + (item.taxAmount ?? 0), 0);
    const totalAmount = args.lineItems.reduce((sum, item) => sum + item.totalAmount, 0);

    if (totalAmount <= 0) {
      throw new Error("Credit note total must be greater than 0");
    }

    // Check total credited doesn't exceed original invoice
    const existingCreditNotes = await ctx.db
      .query("sales_invoices")
      .withIndex("by_originalInvoiceId", (q) =>
        q.eq("originalInvoiceId", args.originalInvoiceId)
      )
      .collect();

    const totalExistingCredit = existingCreditNotes
      .filter((cn) => !cn.deletedAt)
      .reduce((sum, cn) => sum + cn.totalAmount, 0);

    if (totalExistingCredit + totalAmount > originalInvoice.totalAmount) {
      throw new Error(
        `Credit note total (${totalAmount}) plus existing credits (${totalExistingCredit}) exceeds original invoice total (${originalInvoice.totalAmount})`
      );
    }

    // Generate credit note number: CN-{originalInvoiceNumber}-{sequence}
    const sequence = existingCreditNotes.filter((cn) => !cn.deletedAt).length + 1;
    const creditNoteNumber = `CN-${originalInvoice.invoiceNumber}-${sequence}`;

    // Create reversal journal entry for credit note (Debit Revenue, Credit AR)
    const arAccount = await ctx.db
      .query("chart_of_accounts")
      .withIndex("by_business_code", (q: any) => q.eq("businessId", args.businessId).eq("accountCode", "1200"))
      .first();
    const revenueAccount = await ctx.db
      .query("chart_of_accounts")
      .withIndex("by_business_code", (q: any) => q.eq("businessId", args.businessId).eq("accountCode", "4100"))
      .first();

    if (arAccount && revenueAccount) {
      const creditNoteNumber = `CN-${originalInvoice.invoiceNumber}-${existingCreditNotes.filter((cn) => !cn.deletedAt).length + 1}`;
      await ctx.runMutation(internal.functions.journalEntries.createInternal, {
        businessId: args.businessId,
        transactionDate: new Date().toISOString().split("T")[0],
        description: `Credit Note ${creditNoteNumber} - ${args.creditNoteReason}`,
        sourceType: "sales_invoice" as const,
        sourceId: args.originalInvoiceId,
        lines: [
          {
            accountCode: "4100",
            debitAmount: totalAmount,
            creditAmount: 0,
            lineDescription: `Credit note reversal - ${args.creditNoteReason}`,
          },
          {
            accountCode: "1200",
            debitAmount: 0,
            creditAmount: totalAmount,
            lineDescription: `Credit note reversal - reduce AR`,
          },
        ],
      });
    }

    // Create credit note
    const creditNoteId = await ctx.db.insert("sales_invoices", {
      businessId: args.businessId,
      userId: user._id,
      invoiceNumber: creditNoteNumber,
      customerId: originalInvoice.customerId,
      customerSnapshot: originalInvoice.customerSnapshot,
      lineItems: args.lineItems.map((item) => ({
        ...item,
        discountType: undefined,
        discountValue: undefined,
        discountAmount: undefined,
      })),
      subtotal: Math.round(subtotal * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
      balanceDue: Math.round(totalAmount * 100) / 100,
      currency: originalInvoice.currency,
      taxMode: originalInvoice.taxMode,
      invoiceDate: new Date().toISOString().split("T")[0],
      dueDate: new Date().toISOString().split("T")[0],
      paymentTerms: "due_on_receipt",
      status: "draft",
      notes: args.notes,
      einvoiceType: "credit_note",
      originalInvoiceId: args.originalInvoiceId,
      creditNoteReason: args.creditNoteReason,
      updatedAt: Date.now(),
    });

    return { creditNoteId };
  },
});

/**
 * 032-credit-debit-note: Create a debit note against a sales invoice.
 * Debit notes increase the amount receivable (additional charges, price increases).
 * Journal entry: Dr. AR 1200, Cr. Revenue 4100
 */
export const createDebitNote = mutation({
  args: {
    originalInvoiceId: v.id("sales_invoices"),
    businessId: v.id("businesses"),
    lineItems: v.array(v.object({
      lineOrder: v.number(),
      description: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      totalAmount: v.number(),
      taxRate: v.optional(v.number()),
      taxAmount: v.optional(v.number()),
      currency: v.string(),
    })),
    debitNoteReason: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireFinanceAdmin(ctx, args.businessId);

    const originalInvoice = await ctx.db.get(args.originalInvoiceId);
    if (!originalInvoice || originalInvoice.businessId !== args.businessId || originalInvoice.deletedAt) {
      throw new Error("Original invoice not found");
    }

    if (!["sent", "paid", "overdue", "partially_paid"].includes(originalInvoice.status)) {
      throw new Error("Can only create debit notes for sent, paid, or overdue invoices");
    }

    if (args.lineItems.length === 0) {
      throw new Error("At least one line item is required");
    }

    const subtotal = args.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const totalTax = args.lineItems.reduce((sum, item) => sum + (item.taxAmount ?? 0), 0);
    const totalAmount = args.lineItems.reduce((sum, item) => sum + item.totalAmount, 0);

    if (totalAmount <= 0) {
      throw new Error("Debit note total must be greater than 0");
    }

    // Generate debit note number: DN-{originalInvoiceNumber}-{sequence}
    const existingAdjustments = await ctx.db
      .query("sales_invoices")
      .withIndex("by_originalInvoiceId", (q) =>
        q.eq("originalInvoiceId", args.originalInvoiceId)
      )
      .collect();

    const existingDebitNotes = existingAdjustments.filter((a) => !a.deletedAt && a.einvoiceType === "debit_note");
    const sequence = existingDebitNotes.length + 1;
    const debitNoteNumber = `DN-${originalInvoice.invoiceNumber}-${sequence}`;

    // Create journal entry: Dr. AR 1200, Cr. Revenue 4100 (increases receivable)
    const arAccount = await ctx.db
      .query("chart_of_accounts")
      .withIndex("by_business_code", (q: any) => q.eq("businessId", args.businessId).eq("accountCode", "1200"))
      .first();
    const revenueAccount = await ctx.db
      .query("chart_of_accounts")
      .withIndex("by_business_code", (q: any) => q.eq("businessId", args.businessId).eq("accountCode", "4100"))
      .first();

    if (arAccount && revenueAccount) {
      await ctx.runMutation(internal.functions.journalEntries.createInternal, {
        businessId: args.businessId,
        transactionDate: new Date().toISOString().split("T")[0],
        description: `Debit Note ${debitNoteNumber} - ${args.debitNoteReason}`,
        sourceType: "sales_invoice" as const,
        sourceId: args.originalInvoiceId,
        lines: [
          {
            accountCode: "1200",
            debitAmount: totalAmount,
            creditAmount: 0,
            lineDescription: `Debit note - increase AR for additional charges`,
          },
          {
            accountCode: "4100",
            debitAmount: 0,
            creditAmount: totalAmount,
            lineDescription: `Debit note - additional revenue`,
          },
        ],
      });
    }

    const debitNoteId = await ctx.db.insert("sales_invoices", {
      businessId: args.businessId,
      userId: user._id,
      invoiceNumber: debitNoteNumber,
      customerId: originalInvoice.customerId,
      customerSnapshot: originalInvoice.customerSnapshot,
      lineItems: args.lineItems.map((item) => ({
        ...item,
        discountType: undefined,
        discountValue: undefined,
        discountAmount: undefined,
      })),
      subtotal: Math.round(subtotal * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
      balanceDue: Math.round(totalAmount * 100) / 100,
      currency: originalInvoice.currency,
      taxMode: originalInvoice.taxMode,
      invoiceDate: new Date().toISOString().split("T")[0],
      dueDate: new Date().toISOString().split("T")[0],
      paymentTerms: "due_on_receipt",
      status: "draft",
      notes: args.notes,
      einvoiceType: "debit_note",
      originalInvoiceId: args.originalInvoiceId,
      creditNoteReason: args.debitNoteReason,
      updatedAt: Date.now(),
    });

    return { debitNoteId };
  },
});

/**
 * Get all adjustment documents (credit notes + debit notes) linked to a parent invoice.
 * 032-credit-debit-note: Updated to return both types with einvoiceType field.
 */
export const getAdjustmentsForInvoice = query({
  args: {
    invoiceId: v.id("sales_invoices"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return [];

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") return [];

    const adjustments = await ctx.db
      .query("sales_invoices")
      .withIndex("by_originalInvoiceId", (q) =>
        q.eq("originalInvoiceId", args.invoiceId)
      )
      .collect();

    return adjustments
      .filter((a) => !a.deletedAt)
      .map((a) => ({
        _id: a._id,
        invoiceNumber: a.invoiceNumber,
        einvoiceType: a.einvoiceType,
        totalAmount: a.totalAmount,
        status: a.status,
        lhdnStatus: a.lhdnStatus,
        peppolStatus: a.peppolStatus,
        creditNoteReason: a.creditNoteReason,
        _creationTime: a._creationTime,
      }));
  },
});

/**
 * Backward-compatible alias for getAdjustmentsForInvoice.
 */
export const getCreditNotesForInvoice = getAdjustmentsForInvoice;

/**
 * Get net outstanding amount for an invoice (original - credits + debits).
 * 032-credit-debit-note: Updated to include debit notes in calculation.
 */
export const getNetOutstandingAmount = query({
  args: {
    invoiceId: v.id("sales_invoices"),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;

    const adjustments = await ctx.db
      .query("sales_invoices")
      .withIndex("by_originalInvoiceId", (q) =>
        q.eq("originalInvoiceId", args.invoiceId)
      )
      .collect();

    const active = adjustments.filter((a) => !a.deletedAt);

    const totalCredited = active
      .filter((a) => a.einvoiceType === "credit_note" || a.einvoiceType === "refund_note")
      .reduce((sum, a) => sum + a.totalAmount, 0);

    const totalDebited = active
      .filter((a) => a.einvoiceType === "debit_note")
      .reduce((sum, a) => sum + a.totalAmount, 0);

    return {
      originalAmount: invoice.totalAmount,
      totalCredited: Math.round(totalCredited * 100) / 100,
      totalDebited: Math.round(totalDebited * 100) / 100,
      netOutstanding: Math.round((invoice.totalAmount - totalCredited + totalDebited) * 100) / 100,
    };
  },
});

// ============================================
// PEPPOL STATUS UPDATE (Internal — called by webhook handler)
// ============================================

/**
 * Update Peppol status from webhook events.
 * Called by the Next.js webhook handler via ConvexHttpClient.
 * Auth is handled at the API route level (webhook secret verification).
 *
 * Status transitions are one-directional:
 * pending → transmitted → delivered
 * pending → failed
 * failed → pending (via retry)
 *
 * Idempotency: If invoice already has a later status, ignore earlier events.
 */
export const updatePeppolStatus = mutation({
  args: {
    peppolDocumentId: v.string(),
    status: v.string(),
    timestamp: v.number(),
    errors: v.optional(v.array(v.object({
      code: v.string(),
      message: v.string(),
    }))),
  },
  handler: async (ctx, args) => {
    // Find invoice by peppolDocumentId
    const invoices = await ctx.db
      .query("sales_invoices")
      .filter((q) =>
        q.eq(q.field("peppolDocumentId"), args.peppolDocumentId)
      )
      .collect();

    const invoice = invoices[0];
    if (!invoice) {
      console.warn(
        `[Peppol Webhook] No invoice found for peppolDocumentId: ${args.peppolDocumentId}`
      );
      return;
    }

    // Status priority for idempotency
    const statusPriority: Record<string, number> = {
      pending: 0,
      transmitted: 1,
      delivered: 2,
      failed: 1, // Same level as transmitted
    };

    const currentPriority = statusPriority[invoice.peppolStatus ?? "pending"] ?? 0;
    const newPriority = statusPriority[args.status] ?? 0;

    // Don't downgrade status (e.g., don't overwrite "delivered" with "transmitted")
    if (
      invoice.peppolStatus === "delivered" ||
      (invoice.peppolStatus === "failed" && args.status !== "pending") ||
      newPriority < currentPriority
    ) {
      console.log(
        `[Peppol Webhook] Ignoring ${args.status} for invoice ${invoice._id} (current: ${invoice.peppolStatus})`
      );
      return;
    }

    const updates: Record<string, unknown> = {
      peppolStatus: args.status,
      updatedAt: Date.now(),
    };

    if (args.status === "transmitted") {
      updates.peppolTransmittedAt = args.timestamp;
    } else if (args.status === "delivered") {
      updates.peppolDeliveredAt = args.timestamp;
    } else if (args.status === "failed") {
      updates.peppolErrors = args.errors ?? [];
    }

    await ctx.db.patch(invoice._id, updates);

    console.log(
      `[Peppol Webhook] Updated invoice ${invoice._id} peppolStatus: ${invoice.peppolStatus} → ${args.status}`
    );
  },
});

/**
 * Set Peppol document ID and status after successful Storecove submission.
 * Called by the transmit API route via ConvexHttpClient.
 * Auth is handled at the API route level (Clerk session verification).
 */
export const setPeppolDocumentId = mutation({
  args: {
    invoiceId: v.id("sales_invoices"),
    peppolDocumentId: v.string(),
    peppolStatus: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.invoiceId, {
      peppolDocumentId: args.peppolDocumentId,
      peppolStatus: args.peppolStatus as "pending",
      peppolTransmittedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Set Peppol errors on an invoice after a failed submission attempt.
 * Called by the transmit/retry API routes via ConvexHttpClient.
 */
export const setPeppolErrors = mutation({
  args: {
    invoiceId: v.id("sales_invoices"),
    errors: v.array(v.object({
      code: v.string(),
      message: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.invoiceId, {
      peppolStatus: "failed",
      peppolErrors: args.errors,
      updatedAt: Date.now(),
    });
  },
});

// ============================================
// LHDN MYINVOIS MUTATIONS (001-lhdn-einvoice-submission)
// ============================================

/**
 * Initiate LHDN e-invoice submission for a sales invoice.
 * Validates readiness and sets lhdnStatus to "pending".
 * The actual submission is handled by the API route.
 */
export const initiateLhdnSubmission = mutation({
  args: {
    id: v.id("sales_invoices"),
    businessId: v.id("businesses"),
    useGeneralBuyerTin: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const invoice = await ctx.db.get(args.id);
    if (!invoice || invoice.businessId !== args.businessId || invoice.deletedAt) {
      throw new Error("Invoice not found");
    }

    if (invoice.status !== "sent" && invoice.status !== "paid" && invoice.status !== "overdue" && invoice.status !== "partially_paid") {
      throw new Error("Invoice must be sent before submitting to LHDN");
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

    // If buyer has no TIN and useGeneralBuyerTin is not set, require confirmation
    const buyerTin = invoice.customerSnapshot?.tin;
    if (!buyerTin && !args.useGeneralBuyerTin) {
      throw new Error("BUYER_TIN_MISSING");
    }

    await ctx.db.patch(args.id, {
      lhdnStatus: "pending",
      lhdnSubmittedAt: Date.now(),
      lhdnValidationErrors: undefined,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

/**
 * Update LHDN status on a sales invoice after polling returns a result.
 */
export const updateLhdnStatus = mutation({
  args: {
    invoiceId: v.id("sales_invoices"),
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
 * Cancel LHDN e-invoice within 72-hour window.
 * Validates the cancellation window and requires a reason.
 */
export const cancelLhdnSubmission = mutation({
  args: {
    id: v.id("sales_invoices"),
    businessId: v.id("businesses"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const invoice = await ctx.db.get(args.id);
    if (!invoice || invoice.businessId !== args.businessId || invoice.deletedAt) {
      throw new Error("Invoice not found");
    }

    if (invoice.lhdnStatus !== "valid") {
      throw new Error("Can only cancel validated e-invoices");
    }

    if (!invoice.lhdnDocumentUuid) {
      throw new Error("No LHDN document UUID found");
    }

    // Check 72-hour cancellation window
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

    await ctx.db.patch(args.id, {
      lhdnStatus: "cancelled",
      updatedAt: Date.now(),
    });

    return { documentUuid: invoice.lhdnDocumentUuid };
  },
});

// ============================================
// E-INVOICE COMPLIANCE ANALYTICS
// ============================================

/**
 * Get e-invoice compliance analytics for the dashboard.
 * Aggregates LHDN submission stats, monthly breakdown, top errors, and recent activity.
 */
export const getEinvoiceAnalytics = query({
  args: {
    businessId: v.id("businesses"),
    dateFrom: v.optional(v.number()),
    dateTo: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Auth check
    await requireFinanceAdmin(ctx, args.businessId);

    // Fetch all sales invoices for this business
    const allInvoices = await ctx.db
      .query("sales_invoices")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Filter out soft-deleted
    const activeInvoices = allInvoices.filter((inv) => !inv.deletedAt);

    // Eligible invoices = those with status sent, paid, overdue, or partially_paid
    const eligibleStatuses = ["sent", "paid", "overdue", "partially_paid"];
    const totalEligible = activeInvoices.filter((inv) =>
      eligibleStatuses.includes(inv.status)
    ).length;

    // Invoices that have been submitted to LHDN (have lhdnStatus set)
    let lhdnInvoices = activeInvoices.filter((inv) => inv.lhdnStatus);

    // Optional date range filter on lhdnSubmittedAt
    if (args.dateFrom) {
      lhdnInvoices = lhdnInvoices.filter(
        (inv) => inv.lhdnSubmittedAt && inv.lhdnSubmittedAt >= args.dateFrom!
      );
    }
    if (args.dateTo) {
      lhdnInvoices = lhdnInvoices.filter(
        (inv) => inv.lhdnSubmittedAt && inv.lhdnSubmittedAt <= args.dateTo!
      );
    }

    // Aggregate status counts
    let validated = 0;
    let rejected = 0;
    let cancelled = 0;
    let invalid = 0;
    let pending = 0;
    let totalValidationTimeMs = 0;
    let validationCount = 0;

    // Monthly breakdown map: "2026-03" -> { submitted, validated, rejected }
    const monthlyMap = new Map<string, { submitted: number; validated: number; rejected: number }>();

    // Error aggregation
    const errorMap = new Map<string, { code: string; message: string; count: number }>();

    // Recent activity (collect all, sort later, take top 20)
    const recentActivity: Array<{
      invoiceNumber: string;
      event: string;
      timestamp: number;
      details?: string;
    }> = [];

    for (const inv of lhdnInvoices) {
      // Status aggregation
      switch (inv.lhdnStatus) {
        case "valid":
          validated++;
          break;
        case "rejected":
        case "cancelled_by_buyer":
          rejected++;
          break;
        case "cancelled":
          cancelled++;
          break;
        case "invalid":
          invalid++;
          break;
        case "pending":
        case "submitted":
          pending++;
          break;
      }

      // Average validation time
      if (inv.lhdnStatus === "valid" && inv.lhdnValidatedAt && inv.lhdnSubmittedAt) {
        totalValidationTimeMs += inv.lhdnValidatedAt - inv.lhdnSubmittedAt;
        validationCount++;
      }

      // Monthly breakdown (keyed by submission month)
      if (inv.lhdnSubmittedAt) {
        const d = new Date(inv.lhdnSubmittedAt);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const bucket = monthlyMap.get(monthKey) ?? { submitted: 0, validated: 0, rejected: 0 };
        bucket.submitted++;
        if (inv.lhdnStatus === "valid") bucket.validated++;
        if (inv.lhdnStatus === "rejected" || inv.lhdnStatus === "cancelled_by_buyer") bucket.rejected++;
        monthlyMap.set(monthKey, bucket);
      }

      // Top errors
      if (inv.lhdnValidationErrors && inv.lhdnValidationErrors.length > 0) {
        for (const err of inv.lhdnValidationErrors) {
          const key = `${err.code}::${err.message}`;
          const existing = errorMap.get(key);
          if (existing) {
            existing.count++;
          } else {
            errorMap.set(key, { code: err.code, message: err.message, count: 1 });
          }
        }
      }

      // Recent activity entries
      if (inv.lhdnSubmittedAt) {
        recentActivity.push({
          invoiceNumber: inv.invoiceNumber,
          event: "submitted",
          timestamp: inv.lhdnSubmittedAt,
        });
      }
      if (inv.lhdnValidatedAt && inv.lhdnStatus === "valid") {
        recentActivity.push({
          invoiceNumber: inv.invoiceNumber,
          event: "validated",
          timestamp: inv.lhdnValidatedAt,
        });
      }
      if (inv.lhdnRejectedAt) {
        recentActivity.push({
          invoiceNumber: inv.invoiceNumber,
          event: "rejected",
          timestamp: inv.lhdnRejectedAt,
          details: inv.lhdnStatusReason ?? undefined,
        });
      }
      if (inv.lhdnStatus === "cancelled") {
        recentActivity.push({
          invoiceNumber: inv.invoiceNumber,
          event: "cancelled",
          timestamp: inv.updatedAt ?? inv._creationTime,
          details: inv.lhdnStatusReason ?? undefined,
        });
      }
    }

    const totalSubmitted = lhdnInvoices.length;

    // Sort monthly breakdown by month key
    const monthlyBreakdown = Array.from(monthlyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data }));

    // Sort errors by count descending
    const topErrors = Array.from(errorMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Sort recent activity by timestamp descending, take top 20
    recentActivity.sort((a, b) => b.timestamp - a.timestamp);
    const recentActivityTop = recentActivity.slice(0, 20);

    // Compliance score: submitted / total eligible
    const complianceScore = totalEligible > 0 ? totalSubmitted / totalEligible : 0;

    return {
      totalSubmitted,
      validated,
      rejected,
      cancelled,
      invalid,
      pending,
      avgValidationTimeMs: validationCount > 0 ? totalValidationTimeMs / validationCount : null,
      complianceScore,
      totalEligible,
      monthlyBreakdown,
      topErrors,
      recentActivity: recentActivityTop,
    };
  },
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function computeNextDueDate(invoiceDate: string, paymentTerms: string): string {
  const daysMap: Record<string, number> = {
    due_on_receipt: 0,
    net_15: 15,
    net_30: 30,
    net_60: 60,
  };

  const days = daysMap[paymentTerms] ?? 30;
  const date = new Date(invoiceDate + "T00:00:00");
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

function computeNextGenerationDate(currentDate: string, frequency: string): string {
  const date = new Date(currentDate + "T00:00:00");

  switch (frequency) {
    case "weekly": date.setDate(date.getDate() + 7); break;
    case "monthly": date.setMonth(date.getMonth() + 1); break;
    case "quarterly": date.setMonth(date.getMonth() + 3); break;
    case "yearly": date.setFullYear(date.getFullYear() + 1); break;
  }

  return date.toISOString().split("T")[0];
}

// ============================================
// BUYER NOTIFICATION LOG (023-einv-buyer-notifications)
// ============================================

/**
 * Append a notification log entry to a sales invoice
 *
 * Used to track all buyer notification attempts (sent, skipped, failed)
 * for idempotency and audit purposes.
 *
 * This is an internalMutation - only callable from other Convex functions.
 */
export const appendNotificationLog = internalMutation({
  args: {
    invoiceId: v.id("sales_invoices"),
    logEntry: v.object({
      eventType: v.union(v.literal("validation"), v.literal("cancellation"), v.literal("rejection")),
      recipientEmail: v.string(),
      timestamp: v.number(),
      sendStatus: v.union(v.literal("sent"), v.literal("skipped"), v.literal("failed")),
      skipReason: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
      sesMessageId: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      throw new Error(`Invoice ${args.invoiceId} not found`);
    }

    const existingLog = invoice.buyerNotificationLog || [];
    const updatedLog = [...existingLog, args.logEntry];

    await ctx.db.patch(args.invoiceId, {
      buyerNotificationLog: updatedLog,
    });

    console.log(
      `[appendNotificationLog] Logged ${args.logEntry.eventType} notification for invoice ${invoice.invoiceNumber}: ` +
      `status=${args.logEntry.sendStatus}${args.logEntry.skipReason ? `, reason=${args.logEntry.skipReason}` : ""}`
    );
  },
});

/**
 * Public version of appendNotificationLog for API route usage.
 * Validates that the invoice belongs to the specified businessId.
 */
export const appendNotificationLogPublic = mutation({
  args: {
    invoiceId: v.id("sales_invoices"),
    businessId: v.id("businesses"),
    logEntry: v.object({
      eventType: v.union(v.literal("validation"), v.literal("cancellation"), v.literal("rejection")),
      recipientEmail: v.string(),
      timestamp: v.number(),
      sendStatus: v.union(v.literal("sent"), v.literal("skipped"), v.literal("failed")),
      skipReason: v.optional(v.string()),
      errorMessage: v.optional(v.string()),
      sesMessageId: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      throw new Error(`Invoice ${args.invoiceId} not found`);
    }

    // Validate that invoice belongs to the specified business
    if (invoice.businessId !== args.businessId) {
      throw new Error("Invoice does not belong to the specified business");
    }

    const existingLog = invoice.buyerNotificationLog || [];
    const updatedLog = [...existingLog, args.logEntry];

    await ctx.db.patch(args.invoiceId, {
      buyerNotificationLog: updatedLog,
    });

    console.log(
      `[appendNotificationLogPublic] Logged ${args.logEntry.eventType} notification for invoice ${invoice.invoiceNumber}: ` +
      `status=${args.logEntry.sendStatus}${args.logEntry.skipReason ? `, reason=${args.logEntry.skipReason}` : ""}`
    );
  },
});

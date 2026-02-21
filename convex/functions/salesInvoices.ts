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
import { query, mutation, internalMutation } from "../_generated/server";
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

    // Create accounting entry (AR - Accounts Receivable)
    const entryId = await ctx.db.insert("accounting_entries", {
      businessId: args.businessId,
      userId: user._id,
      transactionType: "Income",
      originalAmount: invoice.totalAmount,
      originalCurrency: invoice.currency,
      transactionDate: invoice.invoiceDate,
      description: `Sales Invoice ${invoice.invoiceNumber} - ${invoice.customerSnapshot.businessName}`,
      category: "Sales Revenue",
      status: "pending",
      sourceDocumentType: "sales_invoice",
      createdByMethod: "manual",
      updatedAt: Date.now(),
    });

    // Link accounting entry to invoice
    await ctx.db.patch(args.id, {
      accountingEntryId: entryId,
    });

    return args.id;
  },
});

/** @deprecated Use payments.recordPayment instead. Kept for backward compatibility. */
export const recordPayment = mutation({
  args: {
    id: v.id("sales_invoices"),
    businessId: v.id("businesses"),
    amount: v.number(),
    paymentDate: v.string(),
    paymentMethod: v.optional(v.string()),
    paymentReference: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const invoice = await ctx.db.get(args.id);
    if (!invoice || invoice.businessId !== args.businessId || invoice.deletedAt) {
      throw new Error("Invoice not found");
    }

    if (!["sent", "partially_paid", "overdue"].includes(invoice.status)) {
      throw new Error("Invoice is not in a payable state");
    }

    if (args.amount <= 0) {
      throw new Error("Payment amount must be greater than 0");
    }

    if (args.amount > invoice.balanceDue) {
      throw new Error("Payment amount exceeds balance due");
    }

    const newAmountPaid = (invoice.amountPaid ?? 0) + args.amount;
    const newBalanceDue = Math.round((invoice.totalAmount - newAmountPaid) * 100) / 100;

    const newStatus = newBalanceDue <= 0 ? "paid" : "partially_paid";

    const updates: Record<string, unknown> = {
      amountPaid: Math.round(newAmountPaid * 100) / 100,
      balanceDue: Math.max(0, newBalanceDue),
      status: newStatus,
      updatedAt: Date.now(),
    };

    if (newStatus === "paid") {
      updates.paidAt = args.paymentDate;
    }

    await ctx.db.patch(args.id, updates);

    // Update linked accounting entry
    if (invoice.accountingEntryId) {
      try {
        const entryId = invoice.accountingEntryId as import("../_generated/dataModel").Id<"accounting_entries">;
        const entry = await ctx.db.get(entryId);
        if (entry) {
          await ctx.db.patch(entryId, {
            status: newStatus === "paid" ? "paid" : "pending",
            updatedAt: Date.now(),
          });
        }
      } catch {
        // Accounting entry may not exist
      }
    }

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

    // Reverse/cancel linked accounting entry
    if (invoice.accountingEntryId) {
      try {
        const entryId = invoice.accountingEntryId as import("../_generated/dataModel").Id<"accounting_entries">;
        const entry = await ctx.db.get(entryId);
        if (entry) {
          await ctx.db.patch(entryId, {
            status: "cancelled",
            updatedAt: Date.now(),
          });
        }
      } catch {
        // Accounting entry may not exist
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

    for (const invoice of sentInvoices) {
      await ctx.db.patch(invoice._id, {
        status: "overdue",
        updatedAt: Date.now(),
      });
      markedCount++;
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

    await ctx.db.patch(args.businessId, {
      invoiceSettings: patch as never,
      updatedAt: Date.now(),
    });
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
 * Get all credit notes linked to a parent invoice.
 */
export const getCreditNotesForInvoice = query({
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

    const creditNotes = await ctx.db
      .query("sales_invoices")
      .withIndex("by_originalInvoiceId", (q) =>
        q.eq("originalInvoiceId", args.invoiceId)
      )
      .collect();

    return creditNotes
      .filter((cn) => !cn.deletedAt)
      .map((cn) => ({
        _id: cn._id,
        invoiceNumber: cn.invoiceNumber,
        totalAmount: cn.totalAmount,
        status: cn.status,
        peppolStatus: cn.peppolStatus,
        creditNoteReason: cn.creditNoteReason,
        _creationTime: cn._creationTime,
      }));
  },
});

/**
 * Get net outstanding amount for an invoice (original - total credited).
 */
export const getNetOutstandingAmount = query({
  args: {
    invoiceId: v.id("sales_invoices"),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) return null;

    const creditNotes = await ctx.db
      .query("sales_invoices")
      .withIndex("by_originalInvoiceId", (q) =>
        q.eq("originalInvoiceId", args.invoiceId)
      )
      .collect();

    const totalCredited = creditNotes
      .filter((cn) => !cn.deletedAt)
      .reduce((sum, cn) => sum + cn.totalAmount, 0);

    return {
      originalAmount: invoice.totalAmount,
      totalCredited: Math.round(totalCredited * 100) / 100,
      netOutstanding: Math.round((invoice.totalAmount - totalCredited) * 100) / 100,
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

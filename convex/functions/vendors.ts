/**
 * Vendors Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Vendor/supplier CRUD operations
 * - Business-level vendor management
 * - Vendor search and lookup for expense tracking
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { paymentTermsValidator } from "../lib/validators";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

// ============================================
// QUERIES
// ============================================

/**
 * List vendors for a business
 * Any active business member can view vendors
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    status: v.optional(v.union(v.literal("prospective"), v.literal("active"), v.literal("inactive"))),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { vendors: [], nextCursor: null };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { vendors: [], nextCursor: null };
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { vendors: [], nextCursor: null };
    }

    const limit = args.limit ?? 100;

    // Get vendors for business
    let vendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Apply status filter
    if (args.status !== undefined) {
      vendors = vendors.filter((v) => v.status === args.status);
    }

    // Apply category filter
    if (args.category) {
      vendors = vendors.filter((v) => v.category === args.category);
    }

    // Sort by name alphabetically
    vendors.sort((a, b) => a.name.localeCompare(b.name));

    // Pagination
    const startIndex = args.cursor ? parseInt(args.cursor, 10) : 0;
    const paginatedVendors = vendors.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < vendors.length
        ? String(startIndex + limit)
        : null;

    return {
      vendors: paginatedVendors,
      nextCursor,
      totalCount: vendors.length,
    };
  },
});

/**
 * Get single vendor by ID
 */
export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    // Resolve ID (supports both Convex ID and legacy UUID)
    const vendor = await resolveById(ctx.db, "vendors", args.id);
    if (!vendor) {
      return null;
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", vendor.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    return vendor;
  },
});

/**
 * Search vendors by name (for autocomplete)
 */
export const searchByName = query({
  args: {
    businessId: v.id("businesses"),
    searchTerm: v.string(),
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

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    const limit = args.limit ?? 10;
    const searchLower = args.searchTerm.toLowerCase();

    // Get all vendors for business and filter by name
    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Filter by search term (case-insensitive) - exclude inactive vendors
    const matchingVendors = vendors
      .filter((v) =>
        v.status !== "inactive" &&
        v.name.toLowerCase().includes(searchLower)
      )
      .slice(0, limit);

    return matchingVendors;
  },
});

/**
 * Get vendor categories for a business
 */
export const getCategories = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    // Get all vendors and extract unique categories
    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const categories = new Set<string>();
    for (const vendor of vendors) {
      if (vendor.category) {
        categories.add(vendor.category);
      }
    }

    return Array.from(categories).sort();
  },
});

/**
 * Get vendor context for invoice review.
 * Returns vendor profile, outstanding payable summary, and suggested due date.
 */
export const getVendorContext = query({
  args: {
    vendorId: v.id("vendors"),
    businessId: v.id("businesses"),
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

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor || vendor.businessId !== args.businessId) {
      return null;
    }

    // Fetch unpaid vendor journal entry lines (expense accounts 5000-5999)
    const vendorLines = await ctx.db
      .query("journal_entry_lines")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "vendor").eq("entityId", args.vendorId)
      )
      .collect();

    // Filter to expense account lines with outstanding debit amounts
    const expenseLines = vendorLines.filter(
      (line: any) =>
        line.businessId === args.businessId &&
        line.accountCode >= "5000" &&
        line.accountCode < "6000" &&
        line.debitAmount > 0
    );

    // Look up parent journal entries to get due dates and check status
    let totalAmount = 0;
    let oldestDueDate: string | undefined;

    for (const line of expenseLines) {
      const journalEntry = await ctx.db.get(line.journalEntryId);
      if (!journalEntry || journalEntry.status === "voided") continue;

      totalAmount += line.debitAmount - line.creditAmount;
      const dueDate = (journalEntry as any).dueDate;
      if (dueDate && (!oldestDueDate || dueDate < oldestDueDate)) {
        oldestDueDate = dueDate;
      }
    }

    // Calculate suggested due date from vendor payment terms
    const today = new Date();
    let dueDays = 30; // default
    if (vendor.paymentTerms === "due_on_receipt") dueDays = 0;
    else if (vendor.paymentTerms === "net_15") dueDays = 15;
    else if (vendor.paymentTerms === "net_30") dueDays = 30;
    else if (vendor.paymentTerms === "net_60") dueDays = 60;
    else if (vendor.paymentTerms === "custom" && vendor.customPaymentDays) {
      dueDays = vendor.customPaymentDays;
    }

    const suggestedDate = new Date(today);
    suggestedDate.setDate(suggestedDate.getDate() + dueDays);
    const suggestedDueDate = suggestedDate.toISOString().split("T")[0];

    return {
      vendor: {
        name: vendor.name,
        paymentTerms: vendor.paymentTerms,
        customPaymentDays: vendor.customPaymentDays,
        defaultCurrency: vendor.defaultCurrency,
      },
      outstanding: {
        totalAmount,
        entryCount: expenseLines.length,
        oldestDueDate,
      },
      suggestedDueDate,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new vendor
 * Any active business member can create vendors
 */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    taxId: v.optional(v.string()),
    category: v.optional(v.string()),
    supplierCode: v.optional(v.string()),
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

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    // Check for duplicate vendor name in same business
    const existingVendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const duplicate = existingVendors.find(
      (v) => v.name.toLowerCase() === args.name.toLowerCase()
    );

    if (duplicate) {
      throw new Error(`Vendor "${args.name}" already exists`);
    }

    // Manually created vendors are "active" (confirmed business relationship)
    const vendorId = await ctx.db.insert("vendors", {
      businessId: args.businessId,
      name: args.name,
      email: args.email,
      phone: args.phone,
      address: args.address,
      taxId: args.taxId,
      category: args.category,
      supplierCode: args.supplierCode,
      status: "active",
      updatedAt: Date.now(),
    });

    return vendorId;
  },
});

/**
 * Update vendor information
 * Any active business member can update vendors
 */
export const update = mutation({
  args: {
    id: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    taxId: v.optional(v.string()),
    category: v.optional(v.string()),
    supplierCode: v.optional(v.string()),
    // AP Vendor Management fields
    paymentTerms: v.optional(paymentTermsValidator),
    customPaymentDays: v.optional(v.number()),
    defaultCurrency: v.optional(v.string()),
    contactPerson: v.optional(v.string()),
    website: v.optional(v.string()),
    notes: v.optional(v.string()),
    bankDetails: v.optional(v.object({
      bankName: v.optional(v.string()),
      accountNumber: v.optional(v.string()),
      routingCode: v.optional(v.string()),
      accountHolderName: v.optional(v.string()),
    })),
    // LHDN exempt vendor flag
    isLhdnExempt: v.optional(v.boolean()),
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

    const vendor = await resolveById(ctx.db, "vendors", args.id);
    if (!vendor) {
      throw new Error("Vendor not found");
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", vendor.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    // Validate: if paymentTerms = "custom", customPaymentDays must be > 0
    if (args.paymentTerms === "custom") {
      if (!args.customPaymentDays || args.customPaymentDays <= 0) {
        throw new Error("Custom payment terms require customPaymentDays > 0");
      }
    }

    // Check for duplicate name if name is being changed
    if (args.name && args.name.toLowerCase() !== vendor.name.toLowerCase()) {
      const existingVendors = await ctx.db
        .query("vendors")
        .withIndex("by_businessId", (q) => q.eq("businessId", vendor.businessId))
        .collect();

      const duplicate = existingVendors.find(
        (v) => v._id !== vendor._id && v.name.toLowerCase() === args.name!.toLowerCase()
      );

      if (duplicate) {
        throw new Error(`Vendor "${args.name}" already exists`);
      }
    }

    const { id, ...updates } = args;
    const updateData: Record<string, unknown> = { updatedAt: Date.now() };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.email !== undefined) updateData.email = updates.email;
    if (updates.phone !== undefined) updateData.phone = updates.phone;
    if (updates.address !== undefined) updateData.address = updates.address;
    if (updates.taxId !== undefined) updateData.taxId = updates.taxId;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.supplierCode !== undefined) updateData.supplierCode = updates.supplierCode;
    if (updates.paymentTerms !== undefined) updateData.paymentTerms = updates.paymentTerms;
    if (updates.customPaymentDays !== undefined) updateData.customPaymentDays = updates.customPaymentDays;
    if (updates.defaultCurrency !== undefined) updateData.defaultCurrency = updates.defaultCurrency;
    if (updates.contactPerson !== undefined) updateData.contactPerson = updates.contactPerson;
    if (updates.website !== undefined) updateData.website = updates.website;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.bankDetails !== undefined) updateData.bankDetails = updates.bankDetails;
    if (updates.isLhdnExempt !== undefined) updateData.isLhdnExempt = updates.isLhdnExempt;

    await ctx.db.patch(vendor._id, updateData);
    return vendor._id;
  },
});

/**
 * Deactivate vendor (soft delete pattern)
 * Only admins/owners can deactivate
 */
export const deactivate = mutation({
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

    const vendor = await resolveById(ctx.db, "vendors", args.id);
    if (!vendor) {
      throw new Error("Vendor not found");
    }

    // Verify admin/owner access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", vendor.businessId)
      )
      .first();

    if (!membership || membership.role !== "owner") {
      throw new Error("Only owners can deactivate vendors");
    }

    await ctx.db.patch(vendor._id, {
      status: "inactive",
      updatedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Reactivate a deactivated vendor (sets status back to active)
 */
export const reactivate = mutation({
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

    const vendor = await resolveById(ctx.db, "vendors", args.id);
    if (!vendor) {
      throw new Error("Vendor not found");
    }

    // Verify admin/owner access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", vendor.businessId)
      )
      .first();

    if (!membership || membership.role !== "owner") {
      throw new Error("Only owners can reactivate vendors");
    }

    await ctx.db.patch(vendor._id, {
      status: "active",
      updatedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Hard delete vendor
 * Only owners can permanently delete vendors
 * Should check for linked transactions first
 */
export const remove = mutation({
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

    const vendor = await resolveById(ctx.db, "vendors", args.id);
    if (!vendor) {
      throw new Error("Vendor not found");
    }

    // Only owners can hard delete
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", vendor.businessId)
      )
      .first();

    if (!membership || membership.role !== "owner") {
      throw new Error("Only owners can permanently delete vendors");
    }

    // Check for linked journal entry lines (vendor has accounting activity)
    const linkedLines = await ctx.db
      .query("journal_entry_lines")
      .withIndex("by_entity", (q) =>
        q.eq("entityType", "vendor").eq("entityId", vendor._id)
      )
      .first();

    if (linkedLines) {
      throw new Error(
        "Cannot delete vendor with linked transactions. Deactivate instead."
      );
    }

    await ctx.db.delete(vendor._id);
    return true;
  },
});

// ============================================
// INTERNAL MUTATIONS (for system use)
// ============================================

import { internalMutation, internalQuery } from "../_generated/server";

/**
 * Upsert vendor by name (internal - for OCR/extraction pipelines)
 *
 * Creates a new vendor if not found, returns existing vendorId if found.
 * Case-insensitive exact match on name.
 * Does NOT change status of existing vendors.
 *
 * @param businessId - The business ID
 * @param vendorName - The vendor name to upsert
 * @param metadata - Optional vendor metadata (email, phone, address, taxId)
 * @returns vendorId and whether it was newly created
 */
export const upsertByName = internalMutation({
  args: {
    businessId: v.id("businesses"),
    vendorName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    taxId: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normalizedName = args.vendorName.trim();

    if (!normalizedName) {
      throw new Error("Vendor name is required");
    }

    // Search for existing vendor (case-insensitive exact match)
    const existingVendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const existingVendor = existingVendors.find(
      (v) => v.name.toLowerCase().trim() === normalizedName.toLowerCase()
    );

    if (existingVendor) {
      // Vendor exists - return existing ID without changing status
      return {
        vendorId: existingVendor._id,
        created: false,
        status: existingVendor.status,
      };
    }

    // Create new vendor with "prospective" status
    const vendorId = await ctx.db.insert("vendors", {
      businessId: args.businessId,
      name: normalizedName,
      email: args.email,
      phone: args.phone,
      address: args.address,
      taxId: args.taxId,
      category: args.category,
      status: "prospective",
      updatedAt: Date.now(),
    });

    return {
      vendorId,
      created: true,
      status: "prospective" as const,
    };
  },
});

/**
 * Promote vendor from prospective to active (internal)
 *
 * Called when first accounting entry is created for a vendor.
 * Only promotes if current status is "prospective".
 * Does not change "active" or "inactive" vendors.
 *
 * @param vendorId - The vendor ID to promote
 * @returns Whether promotion occurred
 */
export const promoteIfProspective = internalMutation({
  args: {
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args): Promise<
    | { promoted: true; newStatus: "active" }
    | { promoted: false; currentStatus: string | undefined }
  > => {
    const vendor = await ctx.db.get(args.vendorId);

    if (!vendor) {
      throw new Error("Vendor not found");
    }

    // Only promote if currently prospective
    if (vendor.status === "prospective") {
      await ctx.db.patch(args.vendorId, {
        status: "active",
        updatedAt: Date.now(),
      });
      return { promoted: true, newStatus: "active" as const };
    }

    // Vendor is already active or inactive - don't change
    return { promoted: false, currentStatus: vendor.status };
  },
});

/**
 * Migration: Demote vendors whose only accounting activity came from expense claims
 * back to "prospective" status. These were incorrectly promoted when expense claims
 * were approved. AP vendors (active) should only come from actual supplier invoices.
 *
 * Run via Convex dashboard:
 *   demoteExpenseClaimVendors({ businessId: "...", dryRun: true })   ← preview
 *   demoteExpenseClaimVendors({ businessId: "..." })                  ← execute
 */
export const demoteExpenseClaimVendors = internalMutation({
  args: {
    businessId: v.id("businesses"),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Internal mutation — no auth needed, callable from Convex dashboard

    // Get all active vendors for this business
    const activeVendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect()
      .then((vs) => vs.filter((v) => v.status === "active"));

    // For each active vendor: check if it has ANY invoice-sourced journal entry
    const results = [];
    const now = Date.now();

    for (const vendor of activeVendors) {
      // Get all journal entry lines for this vendor
      const vendorLines = await ctx.db
        .query("journal_entry_lines")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "vendor").eq("entityId", vendor._id)
        )
        .collect();

      // Check parent journal entries for non-expense-claim sources
      let hasInvoiceEntry = false;
      for (const line of vendorLines) {
        const je = await ctx.db.get(line.journalEntryId);
        if (je && (je as any).referenceType !== "expense_claim") {
          hasInvoiceEntry = true;
          break;
        }
      }

      if (!hasInvoiceEntry) {
        // All activity is from expense claims — demote to prospective
        results.push({
          vendorId: vendor._id,
          name: vendor.name,
          action: "demoted",
          entryCount: vendorLines.length,
        });

        if (!args.dryRun) {
          await ctx.db.patch(vendor._id, {
            status: "prospective",
            updatedAt: now,
          });
        }
      } else {
        results.push({
          vendorId: vendor._id,
          name: vendor.name,
          action: "kept_active",
          entryCount: vendorLines.length,
        });
      }
    }

    return {
      dryRun: args.dryRun ?? false,
      totalActive: activeVendors.length,
      demotedCount: results.filter((r) => r.action === "demoted").length,
      keptCount: results.filter((r) => r.action === "kept_active").length,
      records: results,
    };
  },
});

/**
 * Cleanup: delete vendor_price_history records for expense-claim-only vendors.
 * Run after demoteExpenseClaimVendors to remove the price history noise.
 * Pass vendorIds from the demote result (the "demoted" records).
 *
 * dryRun: true  → preview count only
 * dryRun: false → actually delete
 */
export const cleanupExpenseClaimPriceHistory = internalMutation({
  args: {
    businessId: v.id("businesses"),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Find all active/prospective vendors for this business
    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const results = [];

    for (const vendor of vendors) {
      // Get all price history for this vendor
      const priceHistory = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_vendorId", (q) => q.eq("vendorId", vendor._id))
        .collect();

      const expenseClaimEntries = priceHistory.filter(
        (p) => p.sourceType === "expense_claim"
      );

      if (expenseClaimEntries.length > 0) {
        results.push({
          vendorName: vendor.name,
          vendorStatus: vendor.status,
          expenseClaimPriceHistoryCount: expenseClaimEntries.length,
          invoicePriceHistoryCount: priceHistory.length - expenseClaimEntries.length,
        });

        if (!args.dryRun) {
          for (const entry of expenseClaimEntries) {
            await ctx.db.delete(entry._id);
          }
        }
      }
    }

    const totalDeleted = results.reduce((s, r) => s + r.expenseClaimPriceHistoryCount, 0);
    return {
      dryRun: args.dryRun ?? false,
      vendorsAffected: results.length,
      priceHistoryDeleted: totalDeleted,
      records: results,
    };
  },
});

/**
 * Cleanup: hard-delete all vendors that have ONLY expense_claim activity
 * (no invoice-sourced accounting entries). These are merchant names auto-created
 * from employee expense receipts and do not belong in the AP vendor list.
 * Also deletes their vendor_price_history records.
 *
 * Run via Convex dashboard:
 *   deleteExpenseOnlyVendors({ businessId: "...", dryRun: true })  ← preview
 *   deleteExpenseOnlyVendors({ businessId: "..." })                 ← execute
 */
export const deleteExpenseOnlyVendors = internalMutation({
  args: {
    businessId: v.id("businesses"),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const results = [];

    for (const vendor of vendors) {
      if (vendor.status === "inactive") continue; // leave manually managed vendors alone

      // Get all journal entry lines for this vendor
      const vendorLines = await ctx.db
        .query("journal_entry_lines")
        .withIndex("by_entity", (q) =>
          q.eq("entityType", "vendor").eq("entityId", vendor._id)
        )
        .collect();

      // Check parent journal entries for non-expense-claim sources
      let hasInvoiceEntry = false;
      for (const line of vendorLines) {
        const je = await ctx.db.get(line.journalEntryId);
        if (je && (je as any).referenceType !== "expense_claim") {
          hasInvoiceEntry = true;
          break;
        }
      }

      if (!hasInvoiceEntry) {
        // Delete price history first
        const priceHistory = await ctx.db
          .query("vendor_price_history")
          .withIndex("by_vendorId", (q) => q.eq("vendorId", vendor._id))
          .collect();

        results.push({
          name: vendor.name,
          status: vendor.status,
          entriesDeleted: priceHistory.length,
        });

        if (!args.dryRun) {
          for (const ph of priceHistory) await ctx.db.delete(ph._id);
          await ctx.db.delete(vendor._id);
        }
      }
    }

    return {
      dryRun: args.dryRun ?? false,
      vendorsDeleted: results.length,
      records: results,
    };
  },
});

/**
 * Cleanup: delete expense-only vendors across ALL businesses.
 * Run once after fixing the Lambda to stop creating vendors from expense claims.
 */
export const deleteExpenseOnlyVendorsAllBusinesses = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Get all businesses
    const businesses = await ctx.db.query("businesses").take(100);
    const allResults: Array<{ businessId: string; businessName: string; vendorsDeleted: number }> = [];

    for (const business of businesses) {
      const vendors = await ctx.db
        .query("vendors")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .collect();

      let vendorsDeleted = 0;

      for (const vendor of vendors) {
        if (vendor.status === "inactive") continue;

        // Check if vendor has any invoice-sourced journal entries
        const vendorLines = await ctx.db
          .query("journal_entry_lines")
          .withIndex("by_entity", (q) =>
            q.eq("entityType", "vendor").eq("entityId", vendor._id)
          )
          .take(20);

        let hasInvoiceEntry = false;
        for (const line of vendorLines) {
          const je = await ctx.db.get(line.journalEntryId);
          if (je && (je as any).referenceType !== "expense_claim") {
            hasInvoiceEntry = true;
            break;
          }
        }

        if (!hasInvoiceEntry) {
          if (!args.dryRun) {
            // Delete price history
            const priceHistory = await ctx.db
              .query("vendor_price_history")
              .withIndex("by_vendorId", (q) => q.eq("vendorId", vendor._id))
              .collect();
            for (const ph of priceHistory) await ctx.db.delete(ph._id);
            await ctx.db.delete(vendor._id);
          }
          vendorsDeleted++;
        }
      }

      if (vendorsDeleted > 0) {
        allResults.push({
          businessId: business._id,
          businessName: business.name,
          vendorsDeleted,
        });
      }
    }

    return {
      dryRun: args.dryRun ?? false,
      businessesAffected: allResults.length,
      totalVendorsDeleted: allResults.reduce((s, r) => s + r.vendorsDeleted, 0),
      details: allResults,
    };
  },
});

/**
 * Get vendor by name (internal query)
 *
 * Case-insensitive exact match lookup.
 * Returns null if not found.
 */
export const getByName = internalQuery({
  args: {
    businessId: v.id("businesses"),
    vendorName: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedName = args.vendorName.trim().toLowerCase();

    if (!normalizedName) {
      return null;
    }

    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    return vendors.find(
      (v) => v.name.toLowerCase().trim() === normalizedName
    ) || null;
  },
});

/**
 * Set vendor status (internal - for system operations)
 *
 * Allows setting vendor status directly without authentication checks.
 * Used for system operations like batch updates.
 */
export const setStatus = internalMutation({
  args: {
    vendorId: v.id("vendors"),
    status: v.union(v.literal("prospective"), v.literal("active"), v.literal("inactive")),
  },
  handler: async (ctx, args) => {
    const vendor = await ctx.db.get(args.vendorId);

    if (!vendor) {
      throw new Error("Vendor not found");
    }

    await ctx.db.patch(args.vendorId, {
      status: args.status,
      updatedAt: Date.now(),
    });

    return { vendorId: args.vendorId, status: args.status };
  },
});

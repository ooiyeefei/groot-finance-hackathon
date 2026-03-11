/**
 * Accounting Entries Functions - Convex queries and mutations
 *
 * These functions handle:
 * - General ledger transaction CRUD operations
 * - Support for Income, Cost of Goods Sold, and Expense types
 * - Role-based access control
 * - Multi-currency support with exchange rate tracking
 * - Line item management (embedded arrays)
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

// Transaction types for accounting entries
const TRANSACTION_TYPES = ["Income", "Cost of Goods Sold", "Expense"] as const;

// Status values for accounting entries
const ENTRY_STATUSES = [
  "pending",
  "paid",
  "cancelled",
  "overdue",
  "disputed",
] as const;

// Creation methods
const CREATION_METHODS = [
  "manual",
  "ocr",
  "import",
  "api",
  "document_extract",
] as const;

// ============================================
// QUERIES
// ============================================

/**
 * List accounting entries with filtering and role-based access
 * - Owners/Admins: See all entries in business
 * - Managers: See their own + direct reports
 * - Employees: See only their own entries
 */
export const list = query({
  args: {
    businessId: v.optional(v.id("businesses")),
    status: v.optional(v.string()),
    transactionType: v.optional(v.string()),
    category: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { entries: [], nextCursor: null };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { entries: [], nextCursor: null };
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
        return { entries: [], nextCursor: null };
      }

      let entries = await ctx.db
        .query("accounting_entries")
        .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId!))
        .collect();

      // Apply role-based filtering
      const role = membership.role;
      if (role === "employee") {
        entries = entries.filter((entry) => entry.userId === user._id);
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

        entries = entries.filter((entry) => reportIds.has(entry.userId));
      }

      // Apply status filter
      if (args.status) {
        entries = entries.filter((entry) => entry.status === args.status);
      }

      // Apply transaction type filter
      if (args.transactionType) {
        entries = entries.filter(
          (entry) => entry.transactionType === args.transactionType
        );
      }

      // Apply category filter
      if (args.category) {
        entries = entries.filter((entry) => entry.category === args.category);
      }

      // Apply date range filter
      if (args.startDate) {
        entries = entries.filter(
          (entry) => entry.transactionDate >= args.startDate!
        );
      }
      if (args.endDate) {
        entries = entries.filter(
          (entry) => entry.transactionDate <= args.endDate!
        );
      }

      // Filter soft-deleted
      entries = entries.filter((entry) => !entry.deletedAt);

      // Sort by transaction date (newest first)
      entries.sort((a, b) => {
        const dateA = new Date(a.transactionDate).getTime();
        const dateB = new Date(b.transactionDate).getTime();
        return dateB - dateA;
      });

      // Pagination
      const startIndex = args.cursor ? parseInt(args.cursor, 10) : 0;
      const paginatedEntries = entries.slice(startIndex, startIndex + limit);
      const nextCursor =
        startIndex + limit < entries.length
          ? String(startIndex + limit)
          : null;

      return {
        entries: paginatedEntries,
        nextCursor,
        totalCount: entries.length,
      };
    }

    // No businessId - return user's own entries across all businesses
    let entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    // Apply filters
    if (args.status) {
      entries = entries.filter((entry) => entry.status === args.status);
    }
    if (args.transactionType) {
      entries = entries.filter(
        (entry) => entry.transactionType === args.transactionType
      );
    }
    if (args.category) {
      entries = entries.filter((entry) => entry.category === args.category);
    }
    if (args.startDate) {
      entries = entries.filter(
        (entry) => entry.transactionDate >= args.startDate!
      );
    }
    if (args.endDate) {
      entries = entries.filter(
        (entry) => entry.transactionDate <= args.endDate!
      );
    }

    // Filter soft-deleted
    entries = entries.filter((entry) => !entry.deletedAt);

    // Sort by transaction date (newest first)
    entries.sort((a, b) => {
      const dateA = new Date(a.transactionDate).getTime();
      const dateB = new Date(b.transactionDate).getTime();
      return dateB - dateA;
    });

    // Pagination
    const startIndex = args.cursor ? parseInt(args.cursor, 10) : 0;
    const paginatedEntries = entries.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < entries.length ? String(startIndex + limit) : null;

    return {
      entries: paginatedEntries,
      nextCursor,
      totalCount: entries.length,
    };
  },
});

/**
 * Get single accounting entry by ID with access control
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
    const entry = await resolveById(ctx.db, "accounting_entries", args.id);
    if (!entry || entry.deletedAt) {
      return null;
    }

    // Check access - user owns entry or has business membership
    if (entry.userId === user._id) {
      return entry;
    }

    // Check business membership if businessId exists
    if (entry.businessId) {
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", entry.businessId!)
        )
        .first();

      if (!membership || membership.status !== "active") {
        return null;
      }

      // Role-based access
      const role = membership.role;
      if (role === "employee" && entry.userId !== user._id) {
        return null;
      }

      if (role === "manager" && entry.userId !== user._id) {
        const submitterMembership = await ctx.db
          .query("business_memberships")
          .withIndex("by_userId_businessId", (q) =>
            q.eq("userId", entry.userId).eq("businessId", entry.businessId!)
          )
          .first();

        if (!submitterMembership || submitterMembership.managerId !== user._id) {
          return null;
        }
      }

      return entry;
    }

    return null;
  },
});

/**
 * Get entries by transaction type
 */
export const getByTransactionType = query({
  args: {
    businessId: v.id("businesses"),
    transactionType: v.union(
      v.literal("Income"),
      v.literal("Cost of Goods Sold"),
      v.literal("Expense")
    ),
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

    // Fetch all entries for business, then filter by transaction type in JS
    // (Convex doesn't support .filter() after .withIndex())
    const allEntries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const entries = allEntries.filter(
      (e) => e.transactionType === args.transactionType && !e.deletedAt
    );
    return args.limit ? entries.slice(0, args.limit) : entries;
  },
});

/**
 * Get financial summary for dashboard
 */
export const getFinancialSummary = query({
  args: {
    businessId: v.id("businesses"),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
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

    // Verify admin/owner access for financial summary
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.role !== "owner") {
      return null;
    }

    let entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    entries = entries.filter((e) => !e.deletedAt);

    // Apply date filters
    if (args.startDate) {
      entries = entries.filter((e) => e.transactionDate >= args.startDate!);
    }
    if (args.endDate) {
      entries = entries.filter((e) => e.transactionDate <= args.endDate!);
    }

    // Calculate financial metrics
    let totalIncome = 0;
    let totalExpenses = 0;
    let totalCogs = 0;
    const categoryTotals: Record<string, number> = {};
    const statusCounts: Record<string, number> = {};

    for (const entry of entries) {
      const amount = entry.homeCurrencyAmount ?? entry.originalAmount;

      switch (entry.transactionType) {
        case "Income":
          totalIncome += amount;
          break;
        case "Expense":
          totalExpenses += amount;
          break;
        case "Cost of Goods Sold":
          totalCogs += amount;
          break;
      }

      // Category breakdown
      if (entry.category) {
        categoryTotals[entry.category] =
          (categoryTotals[entry.category] || 0) + amount;
      }

      // Status counts
      statusCounts[entry.status] = (statusCounts[entry.status] || 0) + 1;
    }

    return {
      totalEntries: entries.length,
      totalIncome,
      totalExpenses,
      totalCogs,
      grossProfit: totalIncome - totalCogs,
      netIncome: totalIncome - totalCogs - totalExpenses,
      categoryTotals,
      statusCounts,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new accounting entry
 */
export const create = mutation({
  args: {
    businessId: v.optional(v.id("businesses")),
    vendorId: v.optional(v.id("vendors")),
    transactionType: v.union(
      v.literal("Income"),
      v.literal("Cost of Goods Sold"),
      v.literal("Expense")
    ),
    description: v.optional(v.string()),
    originalAmount: v.number(),
    originalCurrency: v.string(),
    homeCurrency: v.optional(v.string()),
    homeCurrencyAmount: v.optional(v.number()),
    exchangeRate: v.optional(v.number()),
    exchangeRateDate: v.optional(v.string()),
    transactionDate: v.string(),
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
    vendorName: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("paid"),
        v.literal("cancelled"),
        v.literal("overdue"),
        v.literal("disputed")
      )
    ),
    dueDate: v.optional(v.string()),
    paymentDate: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),
    createdByMethod: v.optional(
      v.union(
        v.literal("manual"),
        v.literal("ocr"),
        v.literal("import"),
        v.literal("api"),
        v.literal("document_extract")
      )
    ),
    sourceRecordId: v.optional(v.string()),
    sourceDocumentType: v.optional(
      v.union(
        v.literal("expense_claim"),
        v.literal("invoice"),
        v.literal("manual")
      )
    ),
    processingMetadata: v.optional(v.any()),
    documentMetadata: v.optional(v.any()),
    lineItems: v.optional(
      v.array(
        v.object({
          itemDescription: v.string(),
          quantity: v.number(),
          unitPrice: v.number(),
          totalAmount: v.number(),
          currency: v.string(),
          taxAmount: v.optional(v.number()),
          taxRate: v.optional(v.number()),
          itemCategory: v.optional(v.string()),
          itemCode: v.optional(v.string()),
          unitMeasurement: v.optional(v.string()),
          lineOrder: v.number(),
          legacyId: v.optional(v.string()),
        })
      )
    ),
  },
  handler: async (ctx, args): Promise<Id<"accounting_entries">> => {
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

    // Duplicate detection: prevent posting the same source document twice
    if (args.sourceRecordId && args.sourceDocumentType) {
      const existing = await ctx.db
        .query("accounting_entries")
        .withIndex("by_sourceDocument", (q) =>
          q
            .eq("sourceDocumentType", args.sourceDocumentType!)
            .eq("sourceRecordId", args.sourceRecordId!)
        )
        .filter((q) =>
          args.businessId
            ? q.eq(q.field("businessId"), args.businessId)
            : q.eq(q.field("businessId"), undefined)
        )
        .first();

      if (existing) {
        throw new Error(
          `This ${args.sourceDocumentType} has already been posted to accounting (entry created ${new Date(existing._creationTime).toLocaleDateString()})`
        );
      }
    }

    const now = Date.now();
    const entryId = await ctx.db.insert("accounting_entries", {
      businessId: args.businessId,
      userId: user._id,
      vendorId: args.vendorId,
      transactionType: args.transactionType,
      description: args.description,
      originalAmount: args.originalAmount,
      originalCurrency: args.originalCurrency,
      homeCurrency: args.homeCurrency,
      homeCurrencyAmount: args.homeCurrencyAmount,
      exchangeRate: args.exchangeRate,
      exchangeRateDate: args.exchangeRateDate,
      transactionDate: args.transactionDate,
      category: args.category,
      subcategory: args.subcategory,
      vendorName: args.vendorName,
      referenceNumber: args.referenceNumber,
      notes: args.notes,
      status: args.status ?? "pending",
      dueDate: args.dueDate,
      paymentDate: args.paymentDate,
      paymentMethod: args.paymentMethod,
      createdByMethod: args.createdByMethod ?? "manual",
      sourceRecordId: args.sourceRecordId,
      sourceDocumentType: args.sourceDocumentType,
      processingMetadata: args.processingMetadata,
      documentMetadata: args.documentMetadata,
      lineItems: args.lineItems,
      updatedAt: now,
    });

    // ============================================
    // PHASE 2: Line items table population
    // Insert line items into normalized line_items table
    // This ensures invoice line items are properly indexed
    // ============================================
    if (args.lineItems && args.lineItems.length > 0) {
      for (const item of args.lineItems) {
        await ctx.db.insert("line_items", {
          accountingEntryId: entryId,
          itemDescription: item.itemDescription,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalAmount: item.totalAmount,
          currency: item.currency,
          taxAmount: item.taxAmount,
          taxRate: item.taxRate,
          lineOrder: item.lineOrder,
          itemCode: item.itemCode,
          unitMeasurement: item.unitMeasurement,
          updatedAt: now,
        });
      }
      console.log(`[Convex] Inserted ${args.lineItems.length} records into line_items table for accounting entry ${entryId}`);
    }

    // ============================================
    // PHASE 2: Vendor activation
    // Link vendor to accounting entry and promote from prospective to active
    // ============================================
    if (args.vendorId) {
      // VendorId explicitly provided - just promote
      // @ts-ignore - Convex internal API types cause "Type instantiation is excessively deep" error
      await ctx.runMutation(internal.functions.vendors.promoteIfProspective, {
        vendorId: args.vendorId,
      });
    } else if (args.vendorName && args.businessId) {
      // No vendorId but vendorName provided - look up vendor by name
      // This handles invoices where vendor was created during OCR extraction as "prospective"
      const vendor = await ctx.runQuery(internal.functions.vendors.getByName, {
        businessId: args.businessId,
        vendorName: args.vendorName,
      });

      if (vendor) {
        // Update accounting entry with vendorId
        await ctx.db.patch(entryId, {
          vendorId: vendor._id,
        });

        // Promote vendor from "prospective" to "active" (first accounting entry)
        // @ts-ignore - Convex internal API types cause "Type instantiation is excessively deep" error
        const promotionResult = await ctx.runMutation(internal.functions.vendors.promoteIfProspective, {
          vendorId: vendor._id,
        });

        if (promotionResult.promoted) {
          console.log(`[Convex] Promoted vendor ${vendor._id} to active status`);
        } else {
          // Type narrowing: when promoted === false, currentStatus exists
          const result = promotionResult as { promoted: false; currentStatus: string };
          console.log(`[Convex] Vendor ${vendor._id} already ${result.currentStatus}, not promoted`);
        }
      } else {
        console.log(`[Convex] No vendor found for name "${args.vendorName}" - skipping vendor linking`);
      }
    }

    // Schedule real-time anomaly detection for this transaction
    // Surfaces insights immediately instead of waiting for the 4h cron
    if (args.businessId) {
      await ctx.scheduler.runAfter(0, internal.functions.actionCenterJobs.analyzeNewTransaction, {
        transactionId: entryId,
        businessId: args.businessId,
      });
      // Layer 2: Schedule LLM enrichment for any new insights (runs after detection)
      await ctx.scheduler.runAfter(5000, internal.functions.actionCenterJobs.enrichRecentInsights, {
        businessId: args.businessId.toString(),
      });
    }

    return entryId;
  },
});

/**
 * Update accounting entry fields
 */
export const update = mutation({
  args: {
    id: v.string(),
    vendorId: v.optional(v.id("vendors")),
    description: v.optional(v.string()),
    originalAmount: v.optional(v.number()),
    originalCurrency: v.optional(v.string()),
    homeCurrency: v.optional(v.string()),
    homeCurrencyAmount: v.optional(v.number()),
    exchangeRate: v.optional(v.number()),
    exchangeRateDate: v.optional(v.string()),
    transactionDate: v.optional(v.string()),
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
    vendorName: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("paid"),
        v.literal("cancelled"),
        v.literal("overdue"),
        v.literal("disputed")
      )
    ),
    dueDate: v.optional(v.string()),
    paymentDate: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),
    processingMetadata: v.optional(v.any()),
    documentMetadata: v.optional(v.any()),
    lineItems: v.optional(
      v.array(
        v.object({
          itemDescription: v.string(),
          quantity: v.number(),
          unitPrice: v.number(),
          totalAmount: v.number(),
          currency: v.string(),
          taxAmount: v.optional(v.number()),
          taxRate: v.optional(v.number()),
          itemCategory: v.optional(v.string()),
          itemCode: v.optional(v.string()),
          unitMeasurement: v.optional(v.string()),
          lineOrder: v.number(),
          legacyId: v.optional(v.string()),
        })
      )
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

    const entry = await resolveById(ctx.db, "accounting_entries", args.id);
    if (!entry || entry.deletedAt) {
      throw new Error("Accounting entry not found");
    }

    // Check ownership or admin access
    if (entry.userId !== user._id && entry.businessId) {
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", entry.businessId!)
        )
        .first();

      if (!membership || membership.role !== "owner") {
        throw new Error("Not authorized to update this entry");
      }
    }

    const { id, ...updates } = args;
    const updateData: Record<string, unknown> = { updatedAt: Date.now() };

    // Only include provided fields
    if (updates.vendorId !== undefined) updateData.vendorId = updates.vendorId;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.originalAmount !== undefined)
      updateData.originalAmount = updates.originalAmount;
    if (updates.originalCurrency !== undefined)
      updateData.originalCurrency = updates.originalCurrency;
    if (updates.homeCurrency !== undefined)
      updateData.homeCurrency = updates.homeCurrency;
    if (updates.homeCurrencyAmount !== undefined)
      updateData.homeCurrencyAmount = updates.homeCurrencyAmount;
    if (updates.exchangeRate !== undefined)
      updateData.exchangeRate = updates.exchangeRate;
    if (updates.exchangeRateDate !== undefined)
      updateData.exchangeRateDate = updates.exchangeRateDate;
    if (updates.transactionDate !== undefined)
      updateData.transactionDate = updates.transactionDate;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.subcategory !== undefined)
      updateData.subcategory = updates.subcategory;
    if (updates.vendorName !== undefined)
      updateData.vendorName = updates.vendorName;
    if (updates.referenceNumber !== undefined)
      updateData.referenceNumber = updates.referenceNumber;
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.status !== undefined) updateData.status = updates.status;
    if (updates.dueDate !== undefined) updateData.dueDate = updates.dueDate;
    if (updates.paymentDate !== undefined)
      updateData.paymentDate = updates.paymentDate;
    if (updates.paymentMethod !== undefined)
      updateData.paymentMethod = updates.paymentMethod;
    if (updates.processingMetadata !== undefined)
      updateData.processingMetadata = updates.processingMetadata;
    if (updates.documentMetadata !== undefined)
      updateData.documentMetadata = updates.documentMetadata;
    if (updates.lineItems !== undefined)
      updateData.lineItems = updates.lineItems;

    await ctx.db.patch(entry._id, updateData);
    return entry._id;
  },
});

/**
 * Update accounting entry status
 */
export const updateStatus = mutation({
  args: {
    id: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("paid"),
      v.literal("cancelled"),
      v.literal("overdue"),
      v.literal("disputed")
    ),
    paymentDate: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),
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

    const entry = await resolveById(ctx.db, "accounting_entries", args.id);
    if (!entry || entry.deletedAt) {
      throw new Error("Accounting entry not found");
    }

    // Check authorization
    if (entry.userId !== user._id && entry.businessId) {
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", entry.businessId!)
        )
        .first();

      if (!membership || membership.status !== "active") {
        throw new Error("Not authorized");
      }
    }

    const updateData: Record<string, unknown> = {
      status: args.status,
      updatedAt: Date.now(),
    };

    // If marking as paid, record payment details
    if (args.status === "paid") {
      updateData.paymentDate = args.paymentDate ?? new Date().toISOString().split("T")[0];
      if (args.paymentMethod) {
        updateData.paymentMethod = args.paymentMethod;
      }
    }

    await ctx.db.patch(entry._id, updateData);
    return entry._id;
  },
});

/**
 * Record a full or partial payment against a pending/overdue accounting entry.
 * Appends to paymentHistory, updates paidAmount, and transitions status when fully paid.
 */
export const recordPayment = mutation({
  args: {
    entryId: v.id("accounting_entries"),
    amount: v.number(),
    paymentDate: v.string(),
    paymentMethod: v.string(),
    notes: v.optional(v.string()),
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

    const entry = await ctx.db.get(args.entryId);
    if (!entry || entry.deletedAt) {
      throw new Error("Accounting entry not found");
    }

    // Check authorization
    if (entry.businessId) {
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", entry.businessId!)
        )
        .first();

      if (!membership || membership.status !== "active") {
        throw new Error("Not authorized");
      }
    }

    // Validate entry status
    if (entry.status !== "pending" && entry.status !== "overdue") {
      throw new Error(`Cannot record payment for entry with status "${entry.status}"`);
    }

    // Validate amount
    if (args.amount <= 0) {
      throw new Error("Payment amount must be greater than 0");
    }

    const currentPaid = entry.paidAmount ?? 0;
    const outstandingBalance = entry.originalAmount - currentPaid;

    if (args.amount > outstandingBalance) {
      throw new Error(
        `Payment amount (${args.amount}) exceeds outstanding balance (${outstandingBalance})`
      );
    }

    // Build payment record
    const paymentRecord = {
      amount: args.amount,
      paymentDate: args.paymentDate,
      paymentMethod: args.paymentMethod,
      notes: args.notes,
      recordedAt: Date.now(),
    };

    const newPaidAmount = currentPaid + args.amount;
    const newOutstanding = entry.originalAmount - newPaidAmount;
    const isFullyPaid = newPaidAmount >= entry.originalAmount;

    const existingHistory = entry.paymentHistory ?? [];

    await ctx.db.patch(args.entryId, {
      paidAmount: newPaidAmount,
      paymentHistory: [...existingHistory, paymentRecord],
      paymentDate: args.paymentDate,
      paymentMethod: args.paymentMethod,
      status: isFullyPaid ? "paid" : entry.status,
      updatedAt: Date.now(),
    });

    return {
      success: true,
      newStatus: isFullyPaid ? ("paid" as const) : entry.status,
      outstandingBalance: newOutstanding,
      totalPaid: newPaidAmount,
    };
  },
});

/**
 * Soft delete accounting entry
 */
export const softDelete = mutation({
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

    const entry = await resolveById(ctx.db, "accounting_entries", args.id);
    if (!entry || entry.deletedAt) {
      throw new Error("Accounting entry not found");
    }

    // Check ownership or admin access
    if (entry.userId !== user._id && entry.businessId) {
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", entry.businessId!)
        )
        .first();

      if (!membership || membership.role !== "owner") {
        throw new Error("Not authorized to delete this entry");
      }
    }

    // Prevent deletion of paid entries (audit trail)
    if (entry.status === "paid") {
      throw new Error("Cannot delete paid entries - void instead");
    }

    await ctx.db.patch(entry._id, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Get unique vendor names for AI chat assistant
 * Returns deduplicated list of vendors sorted alphabetically
 */
export const getUniqueVendors = query({
  args: {
    businessId: v.optional(v.string()),
    sourceDocumentType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { vendors: [], totalCount: 0 };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { vendors: [], totalCount: 0 };
    }

    let entries;

    // Query by businessId if provided, else by userId
    if (args.businessId) {
      // Resolve businessId (supports both Convex ID and legacy UUID)
      const business = await resolveById(ctx.db, "businesses", args.businessId);
      if (!business) {
        return { vendors: [], totalCount: 0 };
      }

      // Verify membership
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", business._id)
        )
        .first();

      if (!membership || membership.status !== "active") {
        return { vendors: [], totalCount: 0 };
      }

      entries = await ctx.db
        .query("accounting_entries")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .collect();
    } else {
      entries = await ctx.db
        .query("accounting_entries")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
    }

    // Filter soft-deleted, optionally by source document type, and get unique vendor names
    const vendorNames = entries
      .filter((e) => {
        if (e.deletedAt) return false;
        if (!e.vendorName || !e.vendorName.trim()) return false;
        // Filter by sourceDocumentType if specified (e.g. "invoice" for AP vendors, "expense_claim" for merchants)
        if (args.sourceDocumentType && e.sourceDocumentType !== args.sourceDocumentType) return false;
        return true;
      })
      .map((e) => e.vendorName!)
      .filter((name, index, self) => self.indexOf(name) === index)
      .sort();

    return {
      vendors: vendorNames,
      totalCount: vendorNames.length,
    };
  },
});

/**
 * Search transactions for AI chat assistant
 * Supports flexible text search and complex filters
 */
export const searchForAI = query({
  args: {
    businessId: v.optional(v.string()),
    searchQuery: v.optional(v.string()),
    transactionType: v.optional(v.string()),
    category: v.optional(v.string()),
    vendorName: v.optional(v.string()),
    minAmount: v.optional(v.number()),
    maxAmount: v.optional(v.number()),
    currency: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    status: v.optional(v.string()),
    sourceDocumentType: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { entries: [], totalCount: 0 };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { entries: [], totalCount: 0 };
    }

    const limit = args.limit ?? 100;
    let entries;

    // Query by businessId if provided
    if (args.businessId) {
      const business = await resolveById(ctx.db, "businesses", args.businessId);
      if (!business) {
        return { entries: [], totalCount: 0 };
      }

      // Verify membership
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", business._id)
        )
        .first();

      if (!membership || membership.status !== "active") {
        return { entries: [], totalCount: 0 };
      }

      entries = await ctx.db
        .query("accounting_entries")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .collect();
    } else {
      entries = await ctx.db
        .query("accounting_entries")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
    }

    // Filter soft-deleted
    entries = entries.filter((e) => !e.deletedAt);

    // Apply text search (description, vendor, reference)
    if (args.searchQuery) {
      const query = args.searchQuery.toLowerCase();
      entries = entries.filter((e) => {
        const desc = (e.description || "").toLowerCase();
        const vendor = (e.vendorName || "").toLowerCase();
        const ref = (e.referenceNumber || "").toLowerCase();
        return desc.includes(query) || vendor.includes(query) || ref.includes(query);
      });
    }

    // Apply filters
    if (args.transactionType) {
      entries = entries.filter((e) => e.transactionType === args.transactionType);
    }
    if (args.category) {
      entries = entries.filter((e) => e.category === args.category);
    }
    if (args.vendorName) {
      const vendorQuery = args.vendorName.toLowerCase();
      entries = entries.filter(
        (e) => e.vendorName && e.vendorName.toLowerCase().includes(vendorQuery)
      );
    }
    if (args.currency) {
      entries = entries.filter((e) => e.originalCurrency === args.currency);
    }
    if (args.status) {
      entries = entries.filter((e) => e.status === args.status);
    }
    if (args.sourceDocumentType) {
      entries = entries.filter((e) => e.sourceDocumentType === args.sourceDocumentType);
    }

    // Amount filters
    if (args.minAmount !== undefined) {
      entries = entries.filter((e) => e.originalAmount >= args.minAmount!);
    }
    if (args.maxAmount !== undefined) {
      entries = entries.filter((e) => e.originalAmount <= args.maxAmount!);
    }

    // Date filters
    if (args.startDate) {
      entries = entries.filter((e) => e.transactionDate >= args.startDate!);
    }
    if (args.endDate) {
      entries = entries.filter((e) => e.transactionDate <= args.endDate!);
    }

    // Sort by date (newest first)
    entries.sort((a, b) => {
      const dateA = new Date(a.transactionDate).getTime();
      const dateB = new Date(b.transactionDate).getTime();
      return dateB - dateA;
    });

    const totalCount = entries.length;
    const limitedEntries = entries.slice(0, limit);

    return {
      entries: limitedEntries,
      totalCount,
    };
  },
});

/**
 * Void a paid entry (instead of delete)
 */
export const voidEntry = mutation({
  args: {
    id: v.string(),
    reason: v.optional(v.string()),
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

    const entry = await resolveById(ctx.db, "accounting_entries", args.id);
    if (!entry || entry.deletedAt) {
      throw new Error("Accounting entry not found");
    }

    // Only admins/owners can void entries
    if (entry.businessId) {
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", entry.businessId!)
        )
        .first();

      if (!membership || membership.role !== "owner") {
        throw new Error("Not authorized to void entries");
      }
    }

    await ctx.db.patch(entry._id, {
      status: "cancelled",
      notes: args.reason
        ? `${entry.notes || ""}\n[VOIDED]: ${args.reason}`
        : entry.notes,
      updatedAt: Date.now(),
    });

    return entry._id;
  },
});

/**
 * Update compliance analysis for an accounting entry
 * Used by AI cross-border tax compliance tool
 */
export const updateComplianceAnalysis = mutation({
  args: {
    id: v.string(),
    complianceAnalysis: v.any(),
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

    const entry = await resolveById(ctx.db, "accounting_entries", args.id);
    if (!entry || entry.deletedAt) {
      throw new Error("Accounting entry not found");
    }

    // Check ownership or business membership
    if (entry.userId !== user._id && entry.businessId) {
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", entry.businessId!)
        )
        .first();

      if (!membership || membership.status !== "active") {
        throw new Error("Not authorized to update this entry");
      }
    }

    await ctx.db.patch(entry._id, {
      complianceAnalysis: args.complianceAnalysis,
      updatedAt: Date.now(),
    });

    return entry._id;
  },
});

/**
 * Get count of entries for a business (for AI tool zero-results feedback)
 */
export const getEntryCount = query({
  args: {
    businessId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { count: 0 };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { count: 0 };
    }

    let entries;

    if (args.businessId) {
      const business = await resolveById(ctx.db, "businesses", args.businessId);
      if (!business) {
        return { count: 0 };
      }

      // Verify membership
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", business._id)
        )
        .first();

      if (!membership || membership.status !== "active") {
        return { count: 0 };
      }

      entries = await ctx.db
        .query("accounting_entries")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .collect();
    } else {
      entries = await ctx.db
        .query("accounting_entries")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .collect();
    }

    // Filter soft-deleted
    const activeEntries = entries.filter((e) => !e.deletedAt);

    return { count: activeEntries.length };
  },
});

// ============================================
// INTERNAL MUTATIONS (for cron jobs)
// ============================================

/**
 * Mark overdue payables — called daily by cron.
 * Finds pending Expense/COGS entries with dueDate < today and marks them overdue.
 * Creates Action Center insight summarizing newly overdue entries per business.
 */
export const markOverduePayables = internalMutation({
  args: {},
  handler: async (ctx) => {
    const today = new Date().toISOString().split("T")[0];
    let markedCount = 0;

    // Fetch all pending Expense/COGS entries with a due date in the past
    // We need to scan all businesses, so query by status-like approach
    // Convex doesn't support multi-field filter after index, so collect and filter
    const allEntries = await ctx.db
      .query("accounting_entries")
      .collect();

    const overdueEntries = allEntries.filter(
      (e) =>
        !e.deletedAt &&
        e.status === "pending" &&
        e.dueDate &&
        e.dueDate < today &&
        (e.transactionType === "Expense" || e.transactionType === "Cost of Goods Sold")
    );

    // Group by business for insight creation
    const entriesByBusiness = new Map<string, typeof overdueEntries>();

    for (const entry of overdueEntries) {
      await ctx.db.patch(entry._id, {
        status: "overdue",
        updatedAt: Date.now(),
      });
      markedCount++;

      if (entry.businessId) {
        const businessKey = entry.businessId.toString();
        const group = entriesByBusiness.get(businessKey) ?? [];
        group.push(entry);
        entriesByBusiness.set(businessKey, group);
      }
    }

    // Create Action Center insights per business (with dedup + aging escalation)
    // Pre-fetch existing deadline insights for dedup
    const existingDeadlineInsights = await ctx.db
      .query("actionCenterInsights")
      .withIndex("by_category", (q: any) => q.eq("category", "deadline"))
      .collect();

    const dedupCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000; // 3 months

    for (const [businessId, entries] of entriesByBusiness) {
      // Dedup: skip if we already created a batch overdue payable insight for this business within 24h
      const isDuplicate = existingDeadlineInsights.some(
        (i) =>
          i.businessId === businessId &&
          i.metadata?.insightType === "overdue_payables_batch" &&
          i.detectedAt > dedupCutoff
      );

      if (isDuplicate) continue;

      const totalAmount = entries.reduce(
        (sum, e) => sum + (e.homeCurrencyAmount ?? e.originalAmount) - (e.paidAmount ?? 0),
        0
      );

      // Aging-based priority: oldest overdue entry determines severity
      const oldestDueDate = entries
        .map((e) => e.dueDate!)
        .sort()[0];
      const daysOverdue = Math.floor(
        (Date.now() - new Date(oldestDueDate).getTime()) / (24 * 60 * 60 * 1000)
      );
      const priority = daysOverdue > 30 ? "critical" : daysOverdue > 14 ? "high" : "medium";

      // Get business members (admin/owner roles only)
      const members = await ctx.db
        .query("business_memberships")
        .withIndex("by_businessId", (q: any) => q.eq("businessId", entries[0].businessId!))
        .collect();

      const targetMembers = members.filter(
        (m) => m.status === "active" && ["owner", "finance_admin", "admin"].includes(m.role)
      );

      for (const member of targetMembers) {
        await ctx.db.insert("actionCenterInsights", {
          userId: member.userId.toString(),
          businessId,
          category: "deadline" as const,
          priority: priority as "critical" | "high" | "medium",
          status: "new" as const,
          title: `${entries.length} bill${entries.length > 1 ? "s" : ""} overdue${daysOverdue > 14 ? ` (${daysOverdue}+ days)` : ""}`,
          description: `${entries.length} payable${entries.length > 1 ? "s" : ""} totaling ${totalAmount.toLocaleString()} are past due. The oldest is ${daysOverdue} days overdue.`,
          affectedEntities: entries.map((e) => e._id.toString()),
          recommendedAction: daysOverdue > 30
            ? "Urgent: Contact vendors immediately to avoid penalties or service disruption."
            : "Review overdue payables and prioritize payments.",
          detectedAt: Date.now(),
          // No expiresAt — persists until user acts
          metadata: {
            insightType: "overdue_payables_batch",
            count: entries.length,
            totalAmount,
            daysOverdue,
            oldestDueDate,
          },
        });
      }
    }

    console.log(`[markOverduePayables] Marked ${markedCount} entries as overdue`);
    return { markedCount };
  },
});

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
import { query } from "../_generated/server";
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
// READ-ONLY QUERIES (historical data access)
// All write mutations deleted 2026-03-14 — see journal_entries + invoices.recordPayment
// ============================================

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

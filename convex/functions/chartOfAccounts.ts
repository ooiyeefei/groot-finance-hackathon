/**
 * Chart of Accounts Functions
 *
 * CRUD operations for managing the chart of accounts.
 * Enforces validation rules: unique codes, valid ranges, system account protection.
 *
 * @see specs/001-accounting-double-entry/data-model.md
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import {
  validateAccountCode,
  calculateFiscalPeriod,
} from "../lib/validation";

/**
 * Create a new account in the chart of accounts
 *
 * Validates:
 * - Account code is unique within business
 * - Account code matches account type range
 * - Required fields are provided
 */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    accountCode: v.string(),
    accountName: v.string(),
    accountType: v.union(
      v.literal("Asset"),
      v.literal("Liability"),
      v.literal("Equity"),
      v.literal("Revenue"),
      v.literal("Expense")
    ),
    accountSubtype: v.optional(v.string()),
    normalBalance: v.union(v.literal("debit"), v.literal("credit")),
    parentAccountId: v.optional(v.id("chart_of_accounts")),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new ConvexError({
        message: "Not authenticated",
        code: "UNAUTHENTICATED",
      });
    }

    // Validate account code format and range
    validateAccountCode(args.accountCode, args.accountType);

    // Check for duplicate account code
    const existing = await ctx.db
      .query("chart_of_accounts")
      .withIndex("by_business_code", (q) =>
        q.eq("businessId", args.businessId).eq("accountCode", args.accountCode)
      )
      .first();

    if (existing) {
      throw new ConvexError({
        message: `Account code ${args.accountCode} already exists`,
        code: "DUPLICATE_ACCOUNT_CODE",
        accountCode: args.accountCode,
        existingAccountId: existing._id,
      });
    }

    // Determine level (0 for top-level, 1 for sub-account)
    let level = 0;
    if (args.parentAccountId) {
      const parent = await ctx.db.get(args.parentAccountId);
      if (!parent) {
        throw new ConvexError({
          message: "Parent account not found",
          code: "PARENT_NOT_FOUND",
          parentAccountId: args.parentAccountId,
        });
      }
      level = parent.level + 1;
    }

    const now = Date.now();

    // Create the account
    const accountId = await ctx.db.insert("chart_of_accounts", {
      businessId: args.businessId,
      accountCode: args.accountCode,
      accountName: args.accountName,
      accountType: args.accountType,
      accountSubtype: args.accountSubtype,
      normalBalance: args.normalBalance,
      parentAccountId: args.parentAccountId,
      level,
      isActive: true,
      isSystemAccount: false, // User-created accounts are not system accounts
      description: args.description,
      tags: args.tags,
      createdBy: userId,
      createdAt: now,
    });

    return accountId;
  },
});

/**
 * Update an existing account
 *
 * Cannot modify: accountCode, isSystemAccount
 * Can modify: accountName, accountSubtype, description, tags
 */
export const update = mutation({
  args: {
    accountId: v.id("chart_of_accounts"),
    accountName: v.optional(v.string()),
    accountSubtype: v.optional(v.string()),
    description: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new ConvexError({
        message: "Not authenticated",
        code: "UNAUTHENTICATED",
      });
    }

    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new ConvexError({
        message: "Account not found",
        code: "ACCOUNT_NOT_FOUND",
        accountId: args.accountId,
      });
    }

    const now = Date.now();

    await ctx.db.patch(args.accountId, {
      accountName: args.accountName ?? account.accountName,
      accountSubtype: args.accountSubtype ?? account.accountSubtype,
      description: args.description ?? account.description,
      tags: args.tags ?? account.tags,
      updatedBy: userId,
      updatedAt: now,
    });

    return args.accountId;
  },
});

/**
 * Deactivate an account (soft delete)
 *
 * - System accounts cannot be deactivated
 * - Checks if account has been used in journal entries (future enhancement)
 */
export const deactivate = mutation({
  args: {
    accountId: v.id("chart_of_accounts"),
  },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new ConvexError({
        message: "Not authenticated",
        code: "UNAUTHENTICATED",
      });
    }

    const account = await ctx.db.get(args.accountId);
    if (!account) {
      throw new ConvexError({
        message: "Account not found",
        code: "ACCOUNT_NOT_FOUND",
        accountId: args.accountId,
      });
    }

    // Prevent deactivation of system accounts
    if (account.isSystemAccount) {
      throw new ConvexError({
        message: `Cannot deactivate system account: ${account.accountCode} - ${account.accountName}`,
        code: "SYSTEM_ACCOUNT_PROTECTED",
        accountId: args.accountId,
        accountCode: account.accountCode,
      });
    }

    const now = Date.now();

    await ctx.db.patch(args.accountId, {
      isActive: false,
      updatedBy: userId,
      updatedAt: now,
    });

    return args.accountId;
  },
});

/**
 * List accounts with filtering
 *
 * Filters:
 * - businessId (required)
 * - accountType (optional)
 * - isActive (optional)
 * - parentAccountId (optional) - list sub-accounts of a parent
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    accountType: v.optional(
      v.union(
        v.literal("Asset"),
        v.literal("Liability"),
        v.literal("Equity"),
        v.literal("Revenue"),
        v.literal("Expense")
      )
    ),
    isActive: v.optional(v.boolean()),
    level: v.optional(v.number()), // 0 = top-level only
  },
  handler: async (ctx, args) => {
    let accounts;

    if (args.accountType !== undefined && args.isActive !== undefined) {
      // Use composite index - type guard ensures values are defined
      const accountType = args.accountType;
      const isActive = args.isActive;
      accounts = await ctx.db
        .query("chart_of_accounts")
        .withIndex("by_business_type", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("accountType", accountType)
            .eq("isActive", isActive)
        )
        .collect();
    } else if (args.isActive !== undefined) {
      const isActive = args.isActive;
      accounts = await ctx.db
        .query("chart_of_accounts")
        .withIndex("by_business_active", (q) =>
          q.eq("businessId", args.businessId).eq("isActive", isActive)
        )
        .collect();
    } else {
      accounts = await ctx.db
        .query("chart_of_accounts")
        .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
        .collect();
    }

    // Filter by level if specified
    if (args.level !== undefined) {
      accounts = accounts.filter((a) => a.level === args.level);
    }

    return accounts.map((account) => ({
      _id: account._id,
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountType: account.accountType,
      accountSubtype: account.accountSubtype,
      normalBalance: account.normalBalance,
      parentAccountId: account.parentAccountId,
      level: account.level,
      isActive: account.isActive,
      isSystemAccount: account.isSystemAccount,
      description: account.description,
      tags: account.tags,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    }));
  },
});

/**
 * Get account by code
 *
 * Used for lookups when creating journal entries
 */
export const getByCode = query({
  args: {
    businessId: v.id("businesses"),
    accountCode: v.string(),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("chart_of_accounts")
      .withIndex("by_business_code", (q) =>
        q.eq("businessId", args.businessId).eq("accountCode", args.accountCode)
      )
      .first();

    if (!account) {
      return null;
    }

    return {
      _id: account._id,
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountType: account.accountType,
      accountSubtype: account.accountSubtype,
      normalBalance: account.normalBalance,
      parentAccountId: account.parentAccountId,
      level: account.level,
      isActive: account.isActive,
      isSystemAccount: account.isSystemAccount,
      description: account.description,
      tags: account.tags,
    };
  },
});

/**
 * Get account by ID
 */
export const getById = query({
  args: {
    accountId: v.id("chart_of_accounts"),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.accountId);

    if (!account) {
      return null;
    }

    return {
      _id: account._id,
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountType: account.accountType,
      accountSubtype: account.accountSubtype,
      normalBalance: account.normalBalance,
      parentAccountId: account.parentAccountId,
      level: account.level,
      isActive: account.isActive,
      isSystemAccount: account.isSystemAccount,
      description: account.description,
      tags: account.tags,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  },
});

/**
 * List accounts grouped by type
 *
 * Returns a structured object with accounts organized by type.
 * Useful for displaying the full chart of accounts with hierarchy.
 */
export const listGroupedByType = query({
  args: {
    businessId: v.id("businesses"),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let accounts;

    if (args.isActive !== undefined) {
      const isActive = args.isActive; // Type guard
      accounts = await ctx.db
        .query("chart_of_accounts")
        .withIndex("by_business_active", (q) =>
          q.eq("businessId", args.businessId).eq("isActive", isActive)
        )
        .collect();
    } else {
      accounts = await ctx.db
        .query("chart_of_accounts")
        .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
        .collect();
    }

    // Group by account type
    const grouped = {
      Asset: accounts.filter((a) => a.accountType === "Asset"),
      Liability: accounts.filter((a) => a.accountType === "Liability"),
      Equity: accounts.filter((a) => a.accountType === "Equity"),
      Revenue: accounts.filter((a) => a.accountType === "Revenue"),
      Expense: accounts.filter((a) => a.accountType === "Expense"),
    };

    return grouped;
  },
});

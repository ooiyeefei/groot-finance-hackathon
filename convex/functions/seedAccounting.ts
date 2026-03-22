/**
 * Seed Accounting Module
 *
 * Provides mutations for seeding default chart of accounts for new businesses.
 * Creates the standard 12-account structure following GAAP/IFRS principles.
 *
 * @see specs/001-accounting-double-entry/data-model.md
 */

import { mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Seed default chart of accounts for a business
 *
 * Creates 12 system accounts:
 * - Assets (1000-1999): Cash, Accounts Receivable, Inventory
 * - Liabilities (2000-2999): Accounts Payable, Sales Tax Payable
 * - Equity (3000-3999): Owner's Equity, Retained Earnings
 * - Revenue (4000-4999): Sales Revenue, Other Income
 * - Expenses (5000-5999): COGS, Operating Expenses, Other Expenses
 *
 * All seeded accounts are marked as `isSystemAccount = true` (cannot be deleted).
 *
 * @param businessId - ID of the business to seed accounts for
 * @returns Array of created account IDs
 */
export const seedDefaultAccounts = mutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, { businessId }) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Check if accounts already exist
    const existingAccounts = await ctx.db
      .query("chart_of_accounts")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();

    if (existingAccounts.length > 0) {
      throw new Error(
        `Chart of accounts already exists for business ${businessId} (${existingAccounts.length} accounts)`
      );
    }

    const now = Date.now();

    // Default account structure following GAAP/IFRS standards
    const defaultAccounts = [
      // ========== ASSETS (1000-1999) ==========
      {
        accountCode: "1000",
        accountName: "Cash",
        accountType: "Asset" as const,
        accountSubtype: "Current Asset",
        normalBalance: "debit" as const,
        description:
          "Cash on hand and in bank accounts. Increases with deposits, decreases with withdrawals.",
      },
      {
        accountCode: "1200",
        accountName: "Accounts Receivable",
        accountType: "Asset" as const,
        accountSubtype: "Current Asset",
        normalBalance: "debit" as const,
        description:
          "Money owed by customers for sales made on credit. Increases with sales, decreases with payments.",
      },
      {
        accountCode: "1500",
        accountName: "Inventory",
        accountType: "Asset" as const,
        accountSubtype: "Current Asset",
        normalBalance: "debit" as const,
        description:
          "Goods available for sale. Increases with purchases, decreases with sales.",
      },

      // ========== LIABILITIES (2000-2999) ==========
      {
        accountCode: "2100",
        accountName: "Accounts Payable",
        accountType: "Liability" as const,
        accountSubtype: "Current Liability",
        normalBalance: "credit" as const,
        description:
          "Money owed to vendors for purchases made on credit. Increases with purchases, decreases with payments.",
      },
      {
        accountCode: "2200",
        accountName: "Sales Tax Payable",
        accountType: "Liability" as const,
        accountSubtype: "Current Liability",
        normalBalance: "credit" as const,
        description:
          "Sales tax collected from customers and owed to government. Increases with sales, decreases with remittance.",
      },

      // ========== EQUITY (3000-3999) ==========
      {
        accountCode: "3000",
        accountName: "Owner's Equity",
        accountType: "Equity" as const,
        accountSubtype: "Capital",
        normalBalance: "credit" as const,
        description:
          "Owner's investment in the business. Increases with capital contributions, decreases with withdrawals.",
      },
      {
        accountCode: "3100",
        accountName: "Retained Earnings",
        accountType: "Equity" as const,
        accountSubtype: "Retained Earnings",
        normalBalance: "credit" as const,
        description:
          "Accumulated profits retained in the business. Increases with net income, decreases with dividends.",
      },

      // ========== REVENUE (4000-4999) ==========
      {
        accountCode: "4100",
        accountName: "Sales Revenue",
        accountType: "Revenue" as const,
        accountSubtype: "Operating Revenue",
        normalBalance: "credit" as const,
        description:
          "Income from primary business operations. Increases with sales, reset at year-end.",
      },
      {
        accountCode: "4900",
        accountName: "Other Income",
        accountType: "Revenue" as const,
        accountSubtype: "Non-Operating Revenue",
        normalBalance: "credit" as const,
        description:
          "Income from non-primary activities (interest, forex gains, discounts received).",
      },

      // ========== EXPENSES (5000-5999) ==========
      {
        accountCode: "5100",
        accountName: "Cost of Goods Sold",
        accountType: "Expense" as const,
        accountSubtype: "Direct Cost",
        normalBalance: "debit" as const,
        description:
          "Direct costs of producing goods sold (materials, labor, manufacturing overhead).",
      },
      {
        accountCode: "5200",
        accountName: "Operating Expenses",
        accountType: "Expense" as const,
        accountSubtype: "Operating Expense",
        normalBalance: "debit" as const,
        description:
          "General business expenses (rent, utilities, salaries, marketing, supplies).",
      },
      {
        accountCode: "5800",
        accountName: "Platform Fees",
        accountType: "Expense" as const,
        accountSubtype: "Operating Expense",
        normalBalance: "debit" as const,
        description:
          "Fees charged by e-commerce platforms (Shopee, Lazada, TikTok Shop).",
      },
      {
        accountCode: "5900",
        accountName: "Other Expenses",
        accountType: "Expense" as const,
        accountSubtype: "Non-Operating Expense",
        normalBalance: "debit" as const,
        description:
          "Non-primary expenses (interest, forex losses, discounts given, write-offs).",
      },
      {
        accountCode: "6500",
        accountName: "Inventory Adjustments",
        accountType: "Expense" as const,
        accountSubtype: "Operating Expense",
        normalBalance: "debit" as const,
        description: "Gains/losses from inventory adjustments (stocktake, damage, etc.).",
      },
    ];

    // Insert all default accounts
    const accountIds: string[] = [];

    for (const account of defaultAccounts) {
      const accountId = await ctx.db.insert("chart_of_accounts", {
        businessId,
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        accountSubtype: account.accountSubtype,
        normalBalance: account.normalBalance,
        parentAccountId: undefined,
        level: 0, // Top-level accounts
        isActive: true,
        isSystemAccount: true, // Cannot be deleted
        description: account.description,
        tags: ["default", "system"],
        createdBy: userId,
        createdAt: now,
      });

      accountIds.push(accountId);
    }

    console.log(
      `✅ Seeded ${accountIds.length} default accounts for business ${businessId}`
    );

    return {
      success: true,
      accountsCreated: accountIds.length,
      accountIds,
    };
  },
});

/**
 * Check if default accounts have been seeded for a business
 *
 * @param businessId - ID of the business to check
 * @returns Object with seeded status and account count
 */
export const checkDefaultAccountsSeeded = mutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, { businessId }) => {
    const accounts = await ctx.db
      .query("chart_of_accounts")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();

    const systemAccounts = accounts.filter((a) => a.isSystemAccount);

    return {
      isSeeded: systemAccounts.length >= 12,
      totalAccounts: accounts.length,
      systemAccounts: systemAccounts.length,
      accounts: systemAccounts.map((a) => ({
        code: a.accountCode,
        name: a.accountName,
        type: a.accountType,
      })),
    };
  },
});

/**
 * Seed default accounts for the first available business (for testing)
 *
 * @returns Seeding result
 */
export const seedDefaultAccountsForFirstBusiness = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const businesses = await ctx.db.query("businesses").collect();

    if (businesses.length === 0) {
      throw new Error("No businesses found. Create a business first.");
    }

    const firstBusiness = businesses[0];

    // Directly call the main seeding logic with the first business
    // Check if accounts already exist
    const existingAccounts = await ctx.db
      .query("chart_of_accounts")
      .withIndex("by_businessId", (q) =>
        q.eq("businessId", firstBusiness._id)
      )
      .collect();

    if (existingAccounts.length > 0) {
      throw new Error(
        `Chart of accounts already exists for business ${firstBusiness._id} (${existingAccounts.length} accounts)`
      );
    }

    const now = Date.now();

    // Default account structure following GAAP/IFRS standards
    const defaultAccounts = [
      // ========== ASSETS (1000-1999) ==========
      {
        accountCode: "1000",
        accountName: "Cash",
        accountType: "Asset" as const,
        accountSubtype: "Current Asset",
        normalBalance: "debit" as const,
        description:
          "Cash on hand and in bank accounts. Increases with deposits, decreases with withdrawals.",
      },
      {
        accountCode: "1200",
        accountName: "Accounts Receivable",
        accountType: "Asset" as const,
        accountSubtype: "Current Asset",
        normalBalance: "debit" as const,
        description:
          "Money owed by customers for sales made on credit. Increases with sales, decreases with payments.",
      },
      {
        accountCode: "1500",
        accountName: "Inventory",
        accountType: "Asset" as const,
        accountSubtype: "Current Asset",
        normalBalance: "debit" as const,
        description:
          "Goods available for sale. Increases with purchases, decreases with sales.",
      },

      // ========== LIABILITIES (2000-2999) ==========
      {
        accountCode: "2100",
        accountName: "Accounts Payable",
        accountType: "Liability" as const,
        accountSubtype: "Current Liability",
        normalBalance: "credit" as const,
        description:
          "Money owed to vendors for purchases made on credit. Increases with purchases, decreases with payments.",
      },
      {
        accountCode: "2200",
        accountName: "Sales Tax Payable",
        accountType: "Liability" as const,
        accountSubtype: "Current Liability",
        normalBalance: "credit" as const,
        description:
          "Sales tax collected from customers and owed to government. Increases with sales, decreases with remittance.",
      },

      // ========== EQUITY (3000-3999) ==========
      {
        accountCode: "3000",
        accountName: "Owner's Equity",
        accountType: "Equity" as const,
        accountSubtype: "Capital",
        normalBalance: "credit" as const,
        description:
          "Owner's investment in the business. Increases with capital contributions, decreases with withdrawals.",
      },
      {
        accountCode: "3100",
        accountName: "Retained Earnings",
        accountType: "Equity" as const,
        accountSubtype: "Retained Earnings",
        normalBalance: "credit" as const,
        description:
          "Accumulated profits retained in the business. Increases with net income, decreases with dividends.",
      },

      // ========== REVENUE (4000-4999) ==========
      {
        accountCode: "4100",
        accountName: "Sales Revenue",
        accountType: "Revenue" as const,
        accountSubtype: "Operating Revenue",
        normalBalance: "credit" as const,
        description:
          "Income from primary business operations. Increases with sales, reset at year-end.",
      },
      {
        accountCode: "4900",
        accountName: "Other Income",
        accountType: "Revenue" as const,
        accountSubtype: "Non-Operating Revenue",
        normalBalance: "credit" as const,
        description:
          "Income from non-primary activities (interest, forex gains, discounts received).",
      },

      // ========== EXPENSES (5000-5999) ==========
      {
        accountCode: "5100",
        accountName: "Cost of Goods Sold",
        accountType: "Expense" as const,
        accountSubtype: "Direct Cost",
        normalBalance: "debit" as const,
        description:
          "Direct costs of producing goods sold (materials, labor, manufacturing overhead).",
      },
      {
        accountCode: "5200",
        accountName: "Operating Expenses",
        accountType: "Expense" as const,
        accountSubtype: "Operating Expense",
        normalBalance: "debit" as const,
        description:
          "General business expenses (rent, utilities, salaries, marketing, supplies).",
      },
      {
        accountCode: "5800",
        accountName: "Platform Fees",
        accountType: "Expense" as const,
        accountSubtype: "Operating Expense",
        normalBalance: "debit" as const,
        description:
          "Fees charged by e-commerce platforms (Shopee, Lazada, TikTok Shop).",
      },
      {
        accountCode: "5900",
        accountName: "Other Expenses",
        accountType: "Expense" as const,
        accountSubtype: "Non-Operating Expense",
        normalBalance: "debit" as const,
        description:
          "Non-primary expenses (interest, forex losses, discounts given, write-offs).",
      },
      {
        accountCode: "6500",
        accountName: "Inventory Adjustments",
        accountType: "Expense" as const,
        accountSubtype: "Operating Expense",
        normalBalance: "debit" as const,
        description: "Gains/losses from inventory adjustments (stocktake, damage, etc.).",
      },
    ];

    // Insert all default accounts
    const accountIds: string[] = [];

    for (const account of defaultAccounts) {
      const accountId = await ctx.db.insert("chart_of_accounts", {
        businessId: firstBusiness._id,
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        accountSubtype: account.accountSubtype,
        normalBalance: account.normalBalance,
        parentAccountId: undefined,
        level: 0, // Top-level accounts
        isActive: true,
        isSystemAccount: true, // Cannot be deleted
        description: account.description,
        tags: ["default", "system"],
        createdBy: userId,
        createdAt: now,
      });

      accountIds.push(accountId);
    }

    console.log(
      `✅ Seeded ${accountIds.length} default accounts for business ${firstBusiness._id}`
    );

    return {
      success: true,
      accountsCreated: accountIds.length,
      accountIds,
      businessId: firstBusiness._id,
    };
  },
});

/**
 * Internal seed - for CLI/migration use (no auth required)
 */
export const seedDefaultAccountsInternal = internalMutation({
  args: {
    businessId: v.id("businesses"),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, { businessId, force }) => {
    const existingAccounts = await ctx.db
      .query("chart_of_accounts")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .collect();

    if (existingAccounts.length > 0 && !force) {
      // Merge: only add missing system accounts
      const existingCodes = new Set(existingAccounts.map((a) => a.accountCode));
      const defaultAccounts = getDefaultAccounts();
      const missing = defaultAccounts.filter((a) => !existingCodes.has(a.accountCode));

      if (missing.length === 0) {
        return { success: true, message: "All default accounts already exist", accountsCreated: 0 };
      }

      const now = Date.now();
      let created = 0;
      for (const account of missing) {
        await ctx.db.insert("chart_of_accounts", {
          businessId,
          accountCode: account.accountCode,
          accountName: account.accountName,
          accountType: account.accountType,
          accountSubtype: account.accountSubtype,
          normalBalance: account.normalBalance,
          parentAccountId: undefined,
          level: 0,
          isActive: true,
          isSystemAccount: true,
          description: account.description,
          tags: ["default", "system"],
          createdBy: "system-migration",
          createdAt: now,
        });
        created++;
      }
      return { success: true, accountsCreated: created, existingCount: existingAccounts.length };
    }

    const now = Date.now();
    const defaultAccounts = getDefaultAccounts();
    const accountIds: string[] = [];
    for (const account of defaultAccounts) {
      const id = await ctx.db.insert("chart_of_accounts", {
        businessId,
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        accountSubtype: account.accountSubtype,
        normalBalance: account.normalBalance,
        parentAccountId: undefined,
        level: 0,
        isActive: true,
        isSystemAccount: true,
        description: account.description,
        tags: ["default", "system"],
        createdBy: "system-migration",
        createdAt: now,
      });
      accountIds.push(id);
    }
    return { success: true, accountsCreated: accountIds.length };
  },
});

function getDefaultAccounts() {
  return [
    { accountCode: "1000", accountName: "Cash", accountType: "Asset" as const, accountSubtype: "Current Asset", normalBalance: "debit" as const, description: "Cash on hand and in bank accounts." },
    { accountCode: "1200", accountName: "Accounts Receivable", accountType: "Asset" as const, accountSubtype: "Current Asset", normalBalance: "debit" as const, description: "Money owed by customers for sales made on credit." },
    { accountCode: "1500", accountName: "Inventory", accountType: "Asset" as const, accountSubtype: "Current Asset", normalBalance: "debit" as const, description: "Goods available for sale." },
    { accountCode: "2100", accountName: "Accounts Payable", accountType: "Liability" as const, accountSubtype: "Current Liability", normalBalance: "credit" as const, description: "Money owed to vendors for purchases made on credit." },
    { accountCode: "2200", accountName: "Sales Tax Payable", accountType: "Liability" as const, accountSubtype: "Current Liability", normalBalance: "credit" as const, description: "Sales tax collected from customers and owed to government." },
    { accountCode: "3000", accountName: "Owner's Equity", accountType: "Equity" as const, accountSubtype: "Capital", normalBalance: "credit" as const, description: "Owner's investment in the business." },
    { accountCode: "3100", accountName: "Retained Earnings", accountType: "Equity" as const, accountSubtype: "Retained Earnings", normalBalance: "credit" as const, description: "Accumulated profits retained in the business." },
    { accountCode: "4100", accountName: "Sales Revenue", accountType: "Revenue" as const, accountSubtype: "Operating Revenue", normalBalance: "credit" as const, description: "Income from primary business operations." },
    { accountCode: "4900", accountName: "Other Income", accountType: "Revenue" as const, accountSubtype: "Non-Operating Revenue", normalBalance: "credit" as const, description: "Income from non-primary activities." },
    { accountCode: "5100", accountName: "Cost of Goods Sold", accountType: "Expense" as const, accountSubtype: "Direct Cost", normalBalance: "debit" as const, description: "Direct costs of producing goods sold." },
    { accountCode: "5200", accountName: "Operating Expenses", accountType: "Expense" as const, accountSubtype: "Operating Expense", normalBalance: "debit" as const, description: "General business expenses." },
    { accountCode: "5800", accountName: "Platform Fees", accountType: "Expense" as const, accountSubtype: "Operating Expense", normalBalance: "debit" as const, description: "Fees charged by e-commerce platforms." },
    { accountCode: "5900", accountName: "Other Expenses", accountType: "Expense" as const, accountSubtype: "Non-Operating Expense", normalBalance: "debit" as const, description: "Non-primary expenses." },
    { accountCode: "6500", accountName: "Inventory Adjustments", accountType: "Expense" as const, accountSubtype: "Operating Expense", normalBalance: "debit" as const, description: "Gains/losses from inventory adjustments (stocktake, damage, etc.)." },
  ];
}

/**
 * Journal Entries Functions
 *
 * CRUD operations for journal entries and their lines.
 * Enforces double-entry bookkeeping rules: debits = credits for every entry.
 *
 * @see specs/001-accounting-double-entry/data-model.md
 */

import { mutation, query, internalMutation, MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { Id } from "../_generated/dataModel";
import { ConvexError } from "convex/values";
import {
  validateBalance,
  validateLine,
  calculateFiscalPeriod,
  generateEntryNumber,
} from "../lib/validation";

/**
 * Internal helper for creating journal entries
 * Used by both public mutation and internal mutation
 */
async function createJournalEntryHelper(
  ctx: MutationCtx,
  args: {
    businessId: Id<"businesses">;
    transactionDate: string;
    description: string;
    memo?: string;
    sourceType?: "manual" | "sales_invoice" | "expense_claim" | "vendor_invoice" | "payment" | "ar_reconciliation" | "bank_reconciliation" | "migrated" | "auto_agent" | "auto_agent_reversal";
    sourceId?: string;
    lines: Array<{
      accountCode: string;
      debitAmount: number;
      creditAmount: number;
      lineDescription?: string;
      entityType?: "customer" | "vendor" | "employee";
      entityId?: string;
      entityName?: string;
    }>;
  },
  providedUserId?: string
) {
    // Use provided userId or get from auth context
    let userId = providedUserId;
    if (!userId) {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) {
        throw new ConvexError({
          message: "Not authenticated",
          code: "UNAUTHENTICATED",
        });
      }
      userId = identity.subject;
    }

    // Validate balance
    const { totalDebits, totalCredits } = validateBalance(args.lines);

    // Validate each line
    args.lines.forEach((line, index) => {
      try {
        validateLine(line);
      } catch (error: any) {
        throw new ConvexError({
          message: `Line ${index + 1}: ${error.message}`,
          code: "INVALID_LINE",
          lineIndex: index,
        });
      }
    });

    // Calculate fiscal period
    const { fiscalYear, fiscalPeriod } = calculateFiscalPeriod(
      args.transactionDate
    );

    // Check if period is closed
    const period = await ctx.db
      .query("accounting_periods")
      .withIndex("by_business_period", (q) =>
        q
          .eq("businessId", args.businessId)
          .eq("fiscalYear", fiscalYear)
          .eq("periodCode", fiscalPeriod)
      )
      .first();

    if (period && period.status === "closed") {
      throw new ConvexError({
        message: `Cannot create entry in closed accounting period ${fiscalPeriod}`,
        code: "PERIOD_CLOSED",
        periodCode: fiscalPeriod,
      });
    }

    // Get home currency from business
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      throw new ConvexError({
        message: "Business not found",
        code: "BUSINESS_NOT_FOUND",
      });
    }

    // Generate entry number
    const lastEntry = await ctx.db
      .query("journal_entries")
      .withIndex("by_business_entry_number", (q) =>
        q.eq("businessId", args.businessId)
      )
      .order("desc")
      .first();

    const lastSequence = lastEntry
      ? parseInt(lastEntry.entryNumber.split("-")[2])
      : 0;
    const entryNumber = generateEntryNumber(fiscalYear, lastSequence + 1);

    const now = Date.now();

    // Create journal entry
    // Auto-post system-generated entries (non-manual), keep manual entries as draft
    const isSystemGenerated = args.sourceType !== "manual";
    const entryId = await ctx.db.insert("journal_entries", {
      businessId: args.businessId,
      entryNumber,
      transactionDate: args.transactionDate,
      postingDate: args.transactionDate, // Same as transaction date initially
      description: args.description,
      memo: args.memo,
      status: isSystemGenerated ? "posted" : "draft",
      sourceType: args.sourceType ?? "manual",
      sourceId: args.sourceId,
      fiscalYear,
      fiscalPeriod,
      homeCurrency: business.homeCurrency,
      totalDebit: totalDebits,
      totalCredit: totalCredits,
      lineCount: args.lines.length,
      isPeriodLocked: false,
      createdBy: userId,
      createdAt: now,
      ...(isSystemGenerated && {
        postedBy: userId,
        postedAt: now,
      }),
    });

    // Create journal entry lines
    for (const [index, line] of args.lines.entries()) {
      // Get account details
      const account = await ctx.db
        .query("chart_of_accounts")
        .withIndex("by_business_code", (q) =>
          q.eq("businessId", args.businessId).eq("accountCode", line.accountCode)
        )
        .first();

      if (!account) {
        throw new ConvexError({
          message: `Account ${line.accountCode} not found`,
          code: "ACCOUNT_NOT_FOUND",
          accountCode: line.accountCode,
        });
      }

      if (!account.isActive) {
        throw new ConvexError({
          message: `Account ${line.accountCode} is inactive`,
          code: "ACCOUNT_INACTIVE",
          accountCode: line.accountCode,
        });
      }

      await ctx.db.insert("journal_entry_lines", {
        journalEntryId: entryId,
        businessId: args.businessId,
        lineOrder: index + 1,
        accountId: account._id,
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        debitAmount: line.debitAmount,
        creditAmount: line.creditAmount,
        homeCurrencyAmount: line.debitAmount || line.creditAmount,
        lineDescription: line.lineDescription,
        entityType: line.entityType,
        entityId: line.entityId,
        entityName: line.entityName,
        bankReconciled: false,
        createdAt: now,
      });
    }

    return { entryId, entryNumber };
  }

/**
 * Create a new journal entry
 *
 * Creates a draft journal entry with multiple lines.
 * Validates that debits = credits before creating.
 */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    transactionDate: v.string(),
    description: v.string(),
    memo: v.optional(v.string()),
    sourceType: v.optional(
      v.union(
        v.literal("manual"),
        v.literal("sales_invoice"),
        v.literal("expense_claim"),
        v.literal("ar_reconciliation"),
        v.literal("migrated")
      )
    ),
    sourceId: v.optional(v.string()),
    lines: v.array(
      v.object({
        accountCode: v.string(),
        debitAmount: v.number(),
        creditAmount: v.number(),
        lineDescription: v.optional(v.string()),
        entityType: v.optional(
          v.union(
            v.literal("customer"),
            v.literal("vendor"),
            v.literal("employee")
          )
        ),
        entityId: v.optional(v.string()),
        entityName: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new ConvexError({
        message: "Not authenticated",
        code: "UNAUTHENTICATED",
      });
    }

    return await createJournalEntryHelper(ctx, args, userId);
  },
});

/**
 * Post a journal entry (draft → posted)
 *
 * Posting makes the entry immutable and affects financial statements.
 */
export const post = mutation({
  args: {
    entryId: v.id("journal_entries"),
  },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new ConvexError({
        message: "Not authenticated",
        code: "UNAUTHENTICATED",
      });
    }

    const entry = await ctx.db.get(args.entryId);
    if (!entry) {
      throw new ConvexError({
        message: "Journal entry not found",
        code: "ENTRY_NOT_FOUND",
      });
    }

    if (entry.status !== "draft") {
      throw new ConvexError({
        message: `Cannot post entry with status "${entry.status}"`,
        code: "INVALID_STATUS",
        currentStatus: entry.status,
      });
    }

    if (entry.isPeriodLocked) {
      throw new ConvexError({
        message: "Cannot post entry in locked period",
        code: "PERIOD_LOCKED",
      });
    }

    const now = Date.now();

    await ctx.db.patch(args.entryId, {
      status: "posted",
      postingDate: new Date().toISOString().split("T")[0], // Today
      postedBy: userId,
      postedAt: now,
    });

    return args.entryId;
  },
});

/**
 * Reverse a posted journal entry
 *
 * Creates a mirror entry with debits/credits flipped.
 * Original entry marked as reversed, new entry references original.
 */
export const reverse = mutation({
  args: {
    entryId: v.id("journal_entries"),
    reason: v.string(),
    reversalDate: v.string(), // YYYY-MM-DD
  },
  handler: async (ctx, args) => {
    const userId = (await ctx.auth.getUserIdentity())?.subject;
    if (!userId) {
      throw new ConvexError({
        message: "Not authenticated",
        code: "UNAUTHENTICATED",
      });
    }

    const entry = await ctx.db.get(args.entryId);
    if (!entry) {
      throw new ConvexError({
        message: "Journal entry not found",
        code: "ENTRY_NOT_FOUND",
      });
    }

    if (entry.status !== "posted") {
      throw new ConvexError({
        message: "Can only reverse posted entries",
        code: "INVALID_STATUS",
        currentStatus: entry.status,
      });
    }

    if (entry.isPeriodLocked) {
      throw new ConvexError({
        message: "Cannot reverse entry in locked period",
        code: "PERIOD_LOCKED",
      });
    }

    // Get original lines
    const lines = await ctx.db
      .query("journal_entry_lines")
      .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", args.entryId))
      .collect();

    // Create reversal entry with flipped debits/credits
    const reversalLines = lines.map((line) => ({
      accountCode: line.accountCode,
      debitAmount: line.creditAmount, // Flip
      creditAmount: line.debitAmount, // Flip
      lineDescription: `Reversal: ${line.lineDescription || ""}`,
    }));

    const { entryId: reversalEntryId } = await createJournalEntryHelper(
      ctx,
      {
        businessId: entry.businessId,
        transactionDate: args.reversalDate,
        description: `REVERSAL: ${entry.description} - ${args.reason}`,
        memo: `Reversal of ${entry.entryNumber}`,
        sourceType: "manual",
        lines: reversalLines,
      },
      userId
    );

    const now = Date.now();

    // Link entries
    await ctx.db.patch(args.entryId, {
      status: "reversed",
      reversedBy: reversalEntryId,
    });

    await ctx.db.patch(reversalEntryId, {
      reversalOf: args.entryId,
      status: "posted", // Reversal entries are auto-posted
      postingDate: args.reversalDate,
      postedBy: userId,
      postedAt: now,
    });

    return reversalEntryId;
  },
});

/**
 * List journal entries with filtering and pagination
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("posted"),
        v.literal("reversed"),
        v.literal("voided")
      )
    ),
    sourceType: v.optional(
      v.union(
        v.literal("manual"),
        v.literal("sales_invoice"),
        v.literal("expense_claim"),
        v.literal("ar_reconciliation"),
        v.literal("migrated")
      )
    ),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;

    // Query all entries for the business
    let entries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .order("desc")
      .collect();

    // Filter by status if specified
    if (args.status) {
      entries = entries.filter((e) => e.status === args.status);
    }

    // Filter by date range
    if (args.dateFrom) {
      entries = entries.filter((e) => e.transactionDate >= args.dateFrom!);
    }
    if (args.dateTo) {
      entries = entries.filter((e) => e.transactionDate <= args.dateTo!);
    }

    // Filter by sourceType if specified
    if (args.sourceType) {
      entries = entries.filter((e) => e.sourceType === args.sourceType);
    }

    // Apply limit
    return entries.slice(0, limit);
  },
});

/**
 * Get journal entry by ID with lines
 */
export const getById = query({
  args: {
    entryId: v.id("journal_entries"),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) {
      return null;
    }

    const lines = await ctx.db
      .query("journal_entry_lines")
      .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", args.entryId))
      .collect();

    return {
      ...entry,
      lines: lines.sort((a, b) => a.lineOrder - b.lineOrder),
    };
  },
});

/**
 * Get journal entries by source (for integration lookups)
 */
export const getBySource = query({
  args: {
    sourceType: v.union(
      v.literal("sales_invoice"),
      v.literal("expense_claim"),
      v.literal("ar_reconciliation")
    ),
    sourceId: v.string(),
  },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("journal_entries")
      .withIndex("by_source", (q) =>
        q.eq("sourceType", args.sourceType).eq("sourceId", args.sourceId)
      )
      .collect();

    // Get lines for each entry
    const entriesWithLines = await Promise.all(
      entries.map(async (entry) => {
        const lines = await ctx.db
          .query("journal_entry_lines")
          .withIndex("by_journal_entry", (q) =>
            q.eq("journalEntryId", entry._id)
          )
          .collect();

        return {
          ...entry,
          lines: lines.sort((a, b) => a.lineOrder - b.lineOrder),
        };
      })
    );

    return entriesWithLines;
  },
});

/**
 * Internal mutation for creating journal entries from integrations
 * (used by AR recon, expense claims, sales invoices)
 */
export const createInternal = internalMutation({
  args: {
    businessId: v.id("businesses"),
    transactionDate: v.string(),
    description: v.string(),
    sourceType: v.union(
      v.literal("sales_invoice"),
      v.literal("expense_claim"),
      v.literal("vendor_invoice"),
      v.literal("payment"),
      v.literal("ar_reconciliation"),
      v.literal("bank_reconciliation"),
      v.literal("manual"),
      v.literal("auto_agent"),
      v.literal("auto_agent_reversal")
    ),
    sourceId: v.string(),
    lines: v.array(
      v.object({
        accountCode: v.string(),
        debitAmount: v.number(),
        creditAmount: v.number(),
        lineDescription: v.optional(v.string()),
        entityType: v.optional(
          v.union(
            v.literal("customer"),
            v.literal("vendor"),
            v.literal("employee")
          )
        ),
        entityId: v.optional(v.string()),
        entityName: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Call helper directly with system user
    // This will be called by integration hooks with internal auth context
    const { entryId, entryNumber } = await createJournalEntryHelper(
      ctx,
      {
        businessId: args.businessId,
        transactionDate: args.transactionDate,
        description: args.description,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        lines: args.lines,
      },
      "system" // Internal mutations use system user
    );

    return { entryId, entryNumber };
  },
});

/**
 * Search journal entries for AI tools
 *
 * Queries journal_entry_lines for AI search
 * to extract transaction data from double-entry bookkeeping.
 */
export const searchForAI = query({
  args: {
    businessId: v.id("businesses"),
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
    sourceDocumentType: v.optional(
      v.union(
        v.literal("invoice"),
        v.literal("expense_claim")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;

    // Query journal entries for the business
    let entries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .order("desc")
      .collect();

    // Filter by status if specified
    if (args.status) {
      entries = entries.filter((e) => e.status === args.status);
    }

    // Filter by date range
    if (args.startDate) {
      entries = entries.filter((e) => e.transactionDate >= args.startDate!);
    }
    if (args.endDate) {
      entries = entries.filter((e) => e.transactionDate <= args.endDate!);
    }

    // Filter by source document type (maps to sourceType)
    if (args.sourceDocumentType) {
      const sourceType = args.sourceDocumentType === "invoice"
        ? "sales_invoice"
        : "expense_claim";
      entries = entries.filter((e) => e.sourceType === sourceType);
    }

    // Get lines for each entry and flatten for AI consumption
    const entriesWithLines = await Promise.all(
      entries.map(async (entry) => {
        const lines = await ctx.db
          .query("journal_entry_lines")
          .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", entry._id))
          .collect();

        return {
          ...entry,
          lines: lines.sort((a, b) => a.lineOrder - b.lineOrder),
        };
      })
    );

    // Transform to AI-friendly format
    let transformedEntries = entriesWithLines.map((entry) => {
      // For expense entries, find the debit line in expense accounts (5000-5999)
      const expenseLine = entry.lines.find(
        (line) =>
          line.accountCode >= "5000" &&
          line.accountCode < "6000" &&
          line.debitAmount > 0
      );

      // For income entries, find the credit line in revenue accounts (4000-4999)
      const incomeLine = entry.lines.find(
        (line) =>
          line.accountCode >= "4000" &&
          line.accountCode < "5000" &&
          line.creditAmount > 0
      );

      // For COGS entries, find the debit line in COGS accounts (6000-6999)
      const cogsLine = entry.lines.find(
        (line) =>
          line.accountCode >= "6000" &&
          line.accountCode < "7000" &&
          line.debitAmount > 0
      );

      // Determine transaction type and amount from the lines
      let transactionType: string = "Expense";
      let amount = 0;
      let category = "";
      let vendorName = "";

      if (expenseLine) {
        transactionType = "Expense";
        amount = expenseLine.debitAmount;
        category = expenseLine.accountName;
        vendorName = expenseLine.entityName || "";
      } else if (incomeLine) {
        transactionType = "Income";
        amount = incomeLine.creditAmount;
        category = incomeLine.accountName;
        vendorName = incomeLine.entityName || "";
      } else if (cogsLine) {
        transactionType = "Cost of Goods Sold";
        amount = cogsLine.debitAmount;
        category = cogsLine.accountName;
        vendorName = cogsLine.entityName || "";
      }

      return {
        _id: entry._id,
        description: entry.description,
        originalAmount: amount,
        originalCurrency: entry.homeCurrency,
        homeCurrencyAmount: amount,
        transactionDate: entry.transactionDate,
        category,
        vendorName,
        transactionType,
        sourceDocumentType:
          entry.sourceType === "sales_invoice"
            ? "invoice"
            : entry.sourceType === "expense_claim"
            ? "expense_claim"
            : entry.sourceType,
        status: entry.status,
        _creationTime: entry.createdAt,
      };
    });

    // Apply text search (description, vendor)
    if (args.searchQuery) {
      const query = args.searchQuery.toLowerCase();
      transformedEntries = transformedEntries.filter((e) => {
        const desc = (e.description || "").toLowerCase();
        const vendor = (e.vendorName || "").toLowerCase();
        return desc.includes(query) || vendor.includes(query);
      });
    }

    // Apply transaction type filter
    if (args.transactionType) {
      transformedEntries = transformedEntries.filter(
        (e) => e.transactionType === args.transactionType
      );
    }

    // Apply category filter
    if (args.category) {
      transformedEntries = transformedEntries.filter((e) =>
        e.category.toLowerCase().includes(args.category!.toLowerCase())
      );
    }

    // Apply vendor name filter
    if (args.vendorName) {
      const vendorQuery = args.vendorName.toLowerCase();
      transformedEntries = transformedEntries.filter(
        (e) => e.vendorName && e.vendorName.toLowerCase().includes(vendorQuery)
      );
    }

    // Apply amount filters
    if (args.minAmount !== undefined) {
      transformedEntries = transformedEntries.filter(
        (e) => e.originalAmount >= args.minAmount!
      );
    }
    if (args.maxAmount !== undefined) {
      transformedEntries = transformedEntries.filter(
        (e) => e.originalAmount <= args.maxAmount!
      );
    }

    // Currency filter (all entries are in home currency already)
    if (args.currency) {
      transformedEntries = transformedEntries.filter(
        (e) => e.originalCurrency === args.currency
      );
    }

    // Sort by date (newest first)
    transformedEntries.sort((a, b) => {
      const dateA = new Date(a.transactionDate).getTime();
      const dateB = new Date(b.transactionDate).getTime();
      return dateB - dateA;
    });

    const totalCount = transformedEntries.length;
    const limitedEntries = transformedEntries.slice(0, limit);

    return {
      entries: limitedEntries,
      totalCount,
    };
  },
});

/**
 * Get journal entry count for a business (for AI tools)
 */
export const getEntryCount = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    return {
      count: entries.filter((e) => e.status === "posted").length,
    };
  },
});

/**
 * Get unique vendors from journal entry lines (for AI tools)
 *
 * Extracts vendor names from journal entry lines where entityType = "vendor".
 */
export const getUniqueVendors = query({
  args: {
    businessId: v.id("businesses"),
    sourceDocumentType: v.optional(
      v.union(
        v.literal("invoice"),
        v.literal("expense_claim")
      )
    ),
  },
  handler: async (ctx, args) => {
    // Query journal entries for the business
    let entries = await ctx.db
      .query("journal_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Filter by source document type if specified
    if (args.sourceDocumentType) {
      const sourceType = args.sourceDocumentType === "invoice"
        ? "sales_invoice"
        : "expense_claim";
      entries = entries.filter((e) => e.sourceType === sourceType);
    }

    // Get all lines for these entries
    const allLines = await Promise.all(
      entries.map(async (entry) => {
        const lines = await ctx.db
          .query("journal_entry_lines")
          .withIndex("by_journal_entry", (q) => q.eq("journalEntryId", entry._id))
          .collect();
        return lines;
      })
    );

    // Flatten and extract unique vendor names
    const vendorNames = allLines
      .flat()
      .filter((line) => line.entityType === "vendor" && line.entityName?.trim())
      .map((line) => line.entityName!)
      .filter((name, index, self) => self.indexOf(name) === index)
      .sort();

    return {
      vendors: vendorNames,
      totalCount: vendorNames.length,
    };
  },
});

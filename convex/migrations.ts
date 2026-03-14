/**
 * Migration Mutations - Internal functions for data migration
 *
 * These mutations bypass authentication and are used only during
 * the Supabase to Convex migration process.
 *
 * DO NOT expose these as public API endpoints.
 */

import { v } from "convex/values";
import { mutation } from "./_generated/server";

// NOTE: These mutations are for migration only.
// After migration is complete, this file should be deleted.

// ============================================
// USER MIGRATIONS
// ============================================

export const insertUser = mutation({
  args: {
    legacyId: v.string(),
    clerkUserId: v.string(),
    email: v.string(),
    fullName: v.optional(v.string()),
    homeCurrency: v.optional(v.string()),
    department: v.optional(v.string()),
    preferences: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("users", {
      legacyId: args.legacyId,
      clerkUserId: args.clerkUserId,
      email: args.email,
      fullName: args.fullName,
      homeCurrency: args.homeCurrency || "MYR",
      department: args.department,
      preferences: args.preferences,
      updatedAt: Date.now(),
    });
  },
});

export const updateUserBusiness = mutation({
  args: {
    userId: v.id("users"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, {
      businessId: args.businessId,
      updatedAt: Date.now(),
    });
  },
});

// ============================================
// BUSINESS MIGRATIONS
// ============================================

export const insertBusiness = mutation({
  args: {
    legacyId: v.string(),
    name: v.string(),
    slug: v.optional(v.string()),
    homeCurrency: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    businessType: v.optional(v.string()),
    allowedCurrencies: v.optional(v.array(v.string())),
    customExpenseCategories: v.optional(v.any()),
    customCogsCategories: v.optional(v.any()),
    logoUrl: v.optional(v.string()),
    logoFallbackColor: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    stripeProductId: v.optional(v.string()),
    planName: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    trialStartDate: v.optional(v.number()),
    trialEndDate: v.optional(v.number()),
    onboardingCompletedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("businesses", {
      legacyId: args.legacyId,
      name: args.name,
      slug: args.slug,
      homeCurrency: args.homeCurrency || "MYR",
      countryCode: args.countryCode,
      businessType: args.businessType,
      allowedCurrencies: args.allowedCurrencies,
      customExpenseCategories: args.customExpenseCategories,
      customCogsCategories: args.customCogsCategories,
      logoUrl: args.logoUrl,
      logoFallbackColor: args.logoFallbackColor,
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripeProductId: args.stripeProductId,
      planName: args.planName || "free",
      subscriptionStatus: args.subscriptionStatus || "active",
      trialStartDate: args.trialStartDate,
      trialEndDate: args.trialEndDate,
      onboardingCompletedAt: args.onboardingCompletedAt,
      updatedAt: Date.now(),
    });
  },
});

// ============================================
// MEMBERSHIP MIGRATIONS
// ============================================

export const insertMembership = mutation({
  args: {
    legacyId: v.string(),
    userId: v.id("users"),
    businessId: v.id("businesses"),
    role: v.string(),
    status: v.string(),
    managerId: v.optional(v.id("users")),
    invitedAt: v.optional(v.number()),
    joinedAt: v.optional(v.number()),
    lastAccessedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("business_memberships", {
      legacyId: args.legacyId,
      userId: args.userId,
      businessId: args.businessId,
      role: args.role as "owner" | "finance_admin" | "manager" | "employee",
      status: args.status as "active" | "pending" | "suspended",
      managerId: args.managerId,
      invitedAt: args.invitedAt,
      joinedAt: args.joinedAt,
      lastAccessedAt: args.lastAccessedAt,
      updatedAt: Date.now(),
    });
  },
});

// ============================================
// VENDOR MIGRATIONS
// ============================================

export const insertVendor = mutation({
  args: {
    legacyId: v.string(),
    businessId: v.id("businesses"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("vendors", {
      legacyId: args.legacyId,
      businessId: args.businessId,
      name: args.name,
      updatedAt: Date.now(),
    });
  },
});

// ============================================
// ACCOUNTING ENTRY MIGRATIONS — DELETED (table dropped 2026-03-14)

// ============================================
// INVOICE MIGRATIONS
// ============================================

export const insertInvoice = mutation({
  args: {
    legacyId: v.string(),
    userId: v.id("users"),
    businessId: v.optional(v.id("businesses")),
    fileName: v.string(),
    fileType: v.string(),
    fileSize: v.number(),
    storagePath: v.string(),
    convertedImagePath: v.optional(v.string()),
    convertedImageWidth: v.optional(v.number()),
    convertedImageHeight: v.optional(v.number()),
    status: v.string(),
    processingMethod: v.optional(v.string()),
    processingTier: v.optional(v.number()),
    confidenceScore: v.optional(v.number()),
    documentClassificationConfidence: v.optional(v.number()),
    classificationMethod: v.optional(v.string()),
    classificationTaskId: v.optional(v.string()),
    extractionTaskId: v.optional(v.string()),
    extractedData: v.optional(v.any()),
    processingMetadata: v.optional(v.any()),
    documentMetadata: v.optional(v.any()),
    errorMessage: v.optional(v.any()),
    requiresReview: v.optional(v.boolean()),
    processingStartedAt: v.optional(v.number()),
    processedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("invoices", {
      legacyId: args.legacyId,
      userId: args.userId,
      businessId: args.businessId,
      fileName: args.fileName,
      fileType: args.fileType,
      fileSize: args.fileSize,
      storagePath: args.storagePath,
      convertedImagePath: args.convertedImagePath,
      convertedImageWidth: args.convertedImageWidth,
      convertedImageHeight: args.convertedImageHeight,
      status: args.status as any,
      processingMethod: args.processingMethod,
      processingTier: args.processingTier || 1,
      confidenceScore: args.confidenceScore,
      documentClassificationConfidence: args.documentClassificationConfidence,
      classificationMethod: args.classificationMethod,
      classificationTaskId: args.classificationTaskId,
      extractionTaskId: args.extractionTaskId,
      extractedData: args.extractedData,
      processingMetadata: args.processingMetadata,
      documentMetadata: args.documentMetadata,
      errorMessage: args.errorMessage,
      requiresReview: args.requiresReview || false,
      processingStartedAt: args.processingStartedAt,
      processedAt: args.processedAt,
      failedAt: args.failedAt,
      deletedAt: args.deletedAt,
      updatedAt: Date.now(),
    });
  },
});

// ============================================
// EXPENSE CLAIM MIGRATIONS
// ============================================

export const insertExpenseClaim = mutation({
  args: {
    legacyId: v.string(),
    userId: v.id("users"),
    businessId: v.id("businesses"),
    accountingEntryId: v.optional(v.string()),
    businessPurpose: v.string(),
    expenseCategory: v.optional(v.string()),
    vendorName: v.optional(v.string()),
    totalAmount: v.optional(v.number()),
    currency: v.optional(v.string()),
    homeCurrency: v.optional(v.string()),
    homeCurrencyAmount: v.optional(v.number()),
    exchangeRate: v.optional(v.number()),
    transactionDate: v.optional(v.string()),
    description: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    storagePath: v.optional(v.string()),
    convertedImagePath: v.optional(v.string()),
    fileName: v.optional(v.string()),
    fileType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    status: v.string(),
    confidenceScore: v.optional(v.number()),
    processingMetadata: v.optional(v.any()),
    errorMessage: v.optional(v.any()),
    reviewerNotes: v.optional(v.string()),
    reviewedBy: v.optional(v.id("users")),
    approvedBy: v.optional(v.id("users")),
    submittedAt: v.optional(v.number()),
    approvedAt: v.optional(v.number()),
    rejectedAt: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    processingStartedAt: v.optional(v.number()),
    processedAt: v.optional(v.number()),
    failedAt: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("expense_claims", {
      legacyId: args.legacyId,
      userId: args.userId,
      businessId: args.businessId,
      accountingEntryId: args.accountingEntryId,
      businessPurpose: args.businessPurpose,
      expenseCategory: args.expenseCategory,
      vendorName: args.vendorName,
      totalAmount: args.totalAmount,
      currency: args.currency,
      homeCurrency: args.homeCurrency,
      homeCurrencyAmount: args.homeCurrencyAmount,
      exchangeRate: args.exchangeRate,
      transactionDate: args.transactionDate,
      description: args.description,
      referenceNumber: args.referenceNumber,
      storagePath: args.storagePath,
      convertedImagePath: args.convertedImagePath,
      fileName: args.fileName,
      fileType: args.fileType,
      fileSize: args.fileSize,
      status: args.status as any,
      confidenceScore: args.confidenceScore,
      processingMetadata: args.processingMetadata,
      errorMessage: args.errorMessage,
      reviewerNotes: args.reviewerNotes,
      reviewedBy: args.reviewedBy,
      approvedBy: args.approvedBy,
      submittedAt: args.submittedAt,
      approvedAt: args.approvedAt,
      rejectedAt: args.rejectedAt,
      paidAt: args.paidAt,
      processingStartedAt: args.processingStartedAt,
      processedAt: args.processedAt,
      failedAt: args.failedAt,
      deletedAt: args.deletedAt,
      updatedAt: Date.now(),
    });
  },
});

// ============================================
// CONVERSATION MIGRATIONS
// ============================================

export const insertConversation = mutation({
  args: {
    legacyId: v.string(),
    clerkUserId: v.string(),
    businessId: v.optional(v.id("businesses")),
    title: v.optional(v.string()),
    language: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Find user by Clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    return await ctx.db.insert("conversations", {
      legacyId: args.legacyId,
      userId: user?._id,
      businessId: args.businessId,
      title: args.title,
      language: args.language || "en",
      isActive: args.isActive ?? true,
      updatedAt: Date.now(),
    });
  },
});

// ============================================
// MESSAGE MIGRATIONS
// ============================================

export const insertMessage = mutation({
  args: {
    legacyId: v.string(),
    conversationId: v.id("conversations"),
    userId: v.optional(v.id("users")),
    role: v.string(),
    content: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("messages", {
      legacyId: args.legacyId,
      conversationId: args.conversationId,
      userId: args.userId,
      role: args.role as "user" | "assistant" | "system",
      content: args.content,
      metadata: args.metadata,
      updatedAt: Date.now(),
    });
  },
});

// ============================================
// DATA CLEANUP MIGRATIONS
// ============================================

/**
 * Remove category_code from customCogsCategories and customExpenseCategories
 *
 * This migration removes the deprecated category_code field from all category
 * records. Categories now use 'id' (Convex document ID) for identification.
 *
 * Run via Convex Dashboard → Functions → migrations:removeCategoryCode
 */
export const removeCategoryCode = mutation({
  args: {},
  handler: async (ctx) => {
    const businesses = await ctx.db.query("businesses").collect();

    let updatedCount = 0;
    let cogsFieldsRemoved = 0;
    let expenseFieldsRemoved = 0;

    for (const business of businesses) {
      let needsUpdate = false;

      // Clean customCogsCategories
      if (business.customCogsCategories && Array.isArray(business.customCogsCategories)) {
        const cleanedCogs = business.customCogsCategories.map((cat: Record<string, unknown>) => {
          if ('category_code' in cat) {
            cogsFieldsRemoved++;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { category_code, ...rest } = cat;
            return rest;
          }
          return cat;
        });

        if (cogsFieldsRemoved > 0) {
          needsUpdate = true;
          business.customCogsCategories = cleanedCogs;
        }
      }

      // Clean customExpenseCategories
      if (business.customExpenseCategories && Array.isArray(business.customExpenseCategories)) {
        const cleanedExpense = business.customExpenseCategories.map((cat: Record<string, unknown>) => {
          if ('category_code' in cat) {
            expenseFieldsRemoved++;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { category_code, ...rest } = cat;
            return rest;
          }
          return cat;
        });

        if (expenseFieldsRemoved > 0) {
          needsUpdate = true;
          business.customExpenseCategories = cleanedExpense;
        }
      }

      if (needsUpdate) {
        await ctx.db.patch(business._id, {
          customCogsCategories: business.customCogsCategories,
          customExpenseCategories: business.customExpenseCategories,
          updatedAt: Date.now(),
        });
        updatedCount++;
      }
    }

    return {
      success: true,
      businessesProcessed: businesses.length,
      businessesUpdated: updatedCount,
      cogsFieldsRemoved,
      expenseFieldsRemoved,
      message: `Migration complete. Removed category_code from ${cogsFieldsRemoved} COGS and ${expenseFieldsRemoved} expense categories across ${updatedCount} businesses.`
    };
  },
});

// ============================================
// LEAVE MANAGEMENT SEED DATA
// ============================================

/**
 * Seed default leave types for a business
 *
 * Run via Convex Dashboard → Functions → migrations:seedLeaveTypes
 * or programmatically when a new business is created
 */
export const seedLeaveTypes = mutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    // Check if leave types already exist for this business
    const existingTypes = await ctx.db
      .query("leave_types")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    if (existingTypes.length > 0) {
      return {
        success: false,
        message: `Leave types already exist for this business (${existingTypes.length} types found)`,
        leaveTypeIds: existingTypes.map(t => t._id),
      };
    }

    // Default leave types for SEA businesses
    const defaultTypes = [
      {
        name: "Annual Leave",
        code: "ANNUAL",
        description: "Paid annual leave for rest and vacation",
        defaultDays: 14,
        requiresApproval: true,
        deductsBalance: true,
        color: "#3B82F6",
        isActive: true,
        sortOrder: 1,
      },
      {
        name: "Sick Leave",
        code: "SICK",
        description: "Leave for illness or medical appointments",
        defaultDays: 14,
        requiresApproval: true,
        deductsBalance: true,
        color: "#EF4444",
        isActive: true,
        sortOrder: 2,
      },
      {
        name: "Medical Leave",
        code: "MEDICAL",
        description: "Extended leave for hospitalization or serious illness",
        defaultDays: 60,
        requiresApproval: true,
        deductsBalance: true,
        color: "#F97316",
        isActive: true,
        sortOrder: 3,
      },
      {
        name: "Unpaid Leave",
        code: "UNPAID",
        description: "Leave without pay for personal matters",
        defaultDays: 0,
        requiresApproval: true,
        deductsBalance: false,
        color: "#6B7280",
        isActive: true,
        sortOrder: 4,
      },
    ];

    const leaveTypeIds: string[] = [];

    for (const leaveType of defaultTypes) {
      const id = await ctx.db.insert("leave_types", {
        businessId: args.businessId,
        ...leaveType,
        updatedAt: Date.now(),
      });
      leaveTypeIds.push(id);
    }

    return {
      success: true,
      message: `Seeded ${leaveTypeIds.length} default leave types`,
      leaveTypeIds,
    };
  },
});

/**
 * Seed public holidays for a country and year
 *
 * Run via Convex Dashboard → Functions → migrations:seedPublicHolidays
 */
export const seedPublicHolidays = mutation({
  args: {
    countryCode: v.string(),
    year: v.number(),
    holidays: v.array(v.object({
      date: v.string(),
      name: v.string(),
    })),
  },
  handler: async (ctx, args) => {
    // Check if holidays already exist for this country/year
    const existingHolidays = await ctx.db
      .query("public_holidays")
      .withIndex("by_countryCode_year", (q) =>
        q.eq("countryCode", args.countryCode).eq("year", args.year)
      )
      .collect();

    // Filter to only system holidays (not custom)
    const existingSystemHolidays = existingHolidays.filter(h => !h.isCustom);

    if (existingSystemHolidays.length > 0) {
      return {
        success: false,
        message: `System holidays already exist for ${args.countryCode} ${args.year} (${existingSystemHolidays.length} found)`,
        holidayIds: existingSystemHolidays.map(h => h._id),
      };
    }

    const holidayIds: string[] = [];

    for (const holiday of args.holidays) {
      const id = await ctx.db.insert("public_holidays", {
        countryCode: args.countryCode,
        date: holiday.date,
        name: holiday.name,
        year: args.year,
        isCustom: false,
        updatedAt: Date.now(),
      });
      holidayIds.push(id);
    }

    return {
      success: true,
      message: `Seeded ${holidayIds.length} public holidays for ${args.countryCode} ${args.year}`,
      holidayIds,
    };
  },
});

/**
 * Initialize leave balances for a user
 *
 * Creates balance records for all active leave types for the current year
 */
export const initializeLeaveBalances = mutation({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
    year: v.number(),
  },
  handler: async (ctx, args) => {
    // Get all active leave types for the business
    const leaveTypes = await ctx.db
      .query("leave_types")
      .withIndex("by_businessId_isActive", (q) =>
        q.eq("businessId", args.businessId).eq("isActive", true)
      )
      .collect();

    const balanceIds: string[] = [];

    for (const leaveType of leaveTypes) {
      // Check if balance already exists
      const existingBalance = await ctx.db
        .query("leave_balances")
        .withIndex("by_businessId_userId_leaveTypeId_year", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("userId", args.userId)
            .eq("leaveTypeId", leaveType._id)
            .eq("year", args.year)
        )
        .first();

      if (!existingBalance) {
        const id = await ctx.db.insert("leave_balances", {
          businessId: args.businessId,
          userId: args.userId,
          leaveTypeId: leaveType._id,
          year: args.year,
          entitled: leaveType.defaultDays,
          used: 0,
          adjustments: 0,
          lastUpdated: Date.now(),
        });
        balanceIds.push(id);
      }
    }

    return {
      success: true,
      message: `Initialized ${balanceIds.length} leave balances for user`,
      balanceIds,
    };
  },
});

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
// ACCOUNTING ENTRY MIGRATIONS
// ============================================

export const insertAccountingEntry = mutation({
  args: {
    legacyId: v.string(),
    userId: v.id("users"),
    businessId: v.optional(v.id("businesses")),
    vendorId: v.optional(v.id("vendors")),
    sourceRecordId: v.optional(v.string()),
    sourceDocumentType: v.optional(v.string()),
    transactionType: v.string(),
    description: v.optional(v.string()),
    originalAmount: v.number(),
    originalCurrency: v.string(),
    homeCurrencyAmount: v.optional(v.number()),
    homeCurrency: v.optional(v.string()),
    exchangeRate: v.optional(v.number()),
    exchangeRateDate: v.optional(v.string()),
    transactionDate: v.string(),
    category: v.optional(v.string()),
    subcategory: v.optional(v.string()),
    vendorName: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    paymentDate: v.optional(v.string()),
    paymentMethod: v.optional(v.string()),
    createdByMethod: v.optional(v.string()),
    processingMetadata: v.optional(v.any()),
    documentMetadata: v.optional(v.any()),
    deletedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("accounting_entries", {
      legacyId: args.legacyId,
      userId: args.userId,
      businessId: args.businessId,
      vendorId: args.vendorId,
      sourceRecordId: args.sourceRecordId,
      sourceDocumentType: args.sourceDocumentType as "invoice" | "expense_claim" | undefined,
      transactionType: args.transactionType as "Income" | "Cost of Goods Sold" | "Expense",
      description: args.description,
      originalAmount: args.originalAmount,
      originalCurrency: args.originalCurrency,
      homeCurrencyAmount: args.homeCurrencyAmount,
      homeCurrency: args.homeCurrency,
      exchangeRate: args.exchangeRate,
      exchangeRateDate: args.exchangeRateDate,
      transactionDate: args.transactionDate,
      category: args.category,
      subcategory: args.subcategory,
      vendorName: args.vendorName,
      referenceNumber: args.referenceNumber,
      notes: args.notes,
      status: (args.status || "pending") as "pending" | "paid" | "overdue" | "cancelled" | "disputed",
      dueDate: args.dueDate,
      paymentDate: args.paymentDate,
      paymentMethod: args.paymentMethod,
      createdByMethod: (args.createdByMethod || "manual") as "manual" | "ocr" | "import" | "api",
      processingMetadata: args.processingMetadata,
      documentMetadata: args.documentMetadata,
      deletedAt: args.deletedAt,
      updatedAt: Date.now(),
    });
  },
});

// ============================================
// LINE ITEM MIGRATIONS
// ============================================

export const insertLineItem = mutation({
  args: {
    legacyId: v.string(),
    accountingEntryId: v.id("accounting_entries"),
    itemDescription: v.string(),
    quantity: v.number(),
    unitPrice: v.number(),
    totalAmount: v.number(),
    currency: v.string(),
    taxAmount: v.optional(v.number()),
    taxRate: v.optional(v.number()),
    discountAmount: v.optional(v.number()),
    lineOrder: v.optional(v.number()),
    itemCode: v.optional(v.string()),
    unitMeasurement: v.optional(v.string()),
    deletedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("line_items", {
      legacyId: args.legacyId,
      accountingEntryId: args.accountingEntryId,
      itemDescription: args.itemDescription,
      quantity: args.quantity,
      unitPrice: args.unitPrice,
      totalAmount: args.totalAmount,
      currency: args.currency,
      taxAmount: args.taxAmount,
      taxRate: args.taxRate,
      discountAmount: args.discountAmount,
      lineOrder: args.lineOrder || 1,
      itemCode: args.itemCode,
      unitMeasurement: args.unitMeasurement,
      deletedAt: args.deletedAt,
      updatedAt: Date.now(),
    });
  },
});

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
    accountingEntryId: v.optional(v.id("accounting_entries")),
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

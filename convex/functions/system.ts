/**
 * System Functions - Backend mutations for Trigger.dev
 *
 * These functions are designed for Trigger.dev and other trusted backend services
 * that cannot use Clerk authentication.
 *
 * Security model: Document IDs are long random strings that only our app knows.
 * Only our backend passes these IDs to Trigger.dev, providing implicit authorization.
 *
 * Required env var in Trigger.dev Dashboard:
 * - NEXT_PUBLIC_CONVEX_URL: Your Convex deployment URL
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { resolveById } from "../lib/resolvers";

// ============================================
// INVOICE SYSTEM FUNCTIONS (for Trigger.dev)
// ============================================

/**
 * Get invoice by ID (system access)
 * Used by Trigger.dev to fetch document details for processing
 */
export const getInvoiceById = query({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args) => {
    const invoice = await resolveById(ctx.db, "invoices", args.id);
    if (!invoice || invoice.deletedAt) {
      return null;
    }
    return invoice;
  },
});

/**
 * Get business categories (system access)
 * Used by Trigger.dev to fetch COGS and expense categories for categorization
 */
export const getBusinessCategories = query({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return null;
    }
    return {
      customExpenseCategories: business.customExpenseCategories || [],
      customCogsCategories: business.customCogsCategories || [],
      homeCurrency: business.homeCurrency,
    };
  },
});

/**
 * Update invoice status (system access)
 * Used by Trigger.dev during document processing workflow
 */
export const updateInvoiceStatus = mutation({
  args: {
    id: v.string(),
    status: v.string(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const invoice = await resolveById(ctx.db, "invoices", args.id);
    if (!invoice) {
      throw new Error(`Invoice not found: ${args.id}`);
    }

    const now = Date.now();
    const updateData: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };

    // Status transition logic
    if (["classifying", "extracting", "processing", "analyzing"].includes(args.status)) {
      if (!invoice.processingStartedAt) {
        updateData.processingStartedAt = now;
      }
    }

    if (args.status === "completed" || args.status === "pending") {
      updateData.processedAt = now;
    }

    if (args.status === "failed" || args.status === "classification_failed") {
      updateData.failedAt = now;
      if (args.errorMessage) {
        updateData.errorMessage = args.errorMessage;
      }
    }

    await ctx.db.patch(invoice._id, updateData);
    console.log(`[System] Updated invoice ${args.id} status to: ${args.status}`);
    return invoice._id;
  },
});

/**
 * Update invoice extraction results (system access)
 * Used by Trigger.dev after successful document extraction
 */
export const updateInvoiceExtraction = mutation({
  args: {
    id: v.string(),
    extractedData: v.any(),
    confidenceScore: v.optional(v.number()),
    extractionMethod: v.optional(v.string()),
    modelUsed: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const invoice = await resolveById(ctx.db, "invoices", args.id);
    if (!invoice) {
      throw new Error(`Invoice not found: ${args.id}`);
    }

    const now = Date.now();

    // DEBUG: Log extractedData being stored to trace category fields
    console.log(`[System Debug] Storing extractedData for invoice ${args.id}`);
    console.log(`[System Debug] extractedData keys:`, Object.keys(args.extractedData || {}));
    console.log(`[System Debug] suggested_category:`, args.extractedData?.suggested_category);
    console.log(`[System Debug] accounting_category:`, args.extractedData?.accounting_category);

    const updateData: Record<string, unknown> = {
      status: "pending", // Extraction complete, ready for review
      extractedData: args.extractedData,
      processedAt: now,
      updatedAt: now,
    };

    if (args.confidenceScore !== undefined) {
      updateData.confidenceScore = args.confidenceScore;
    }
    if (args.extractionMethod !== undefined) {
      updateData.processingMethod = args.extractionMethod;
    }

    await ctx.db.patch(invoice._id, updateData);
    console.log(`[System] Updated invoice ${args.id} extraction results`);
    return invoice._id;
  },
});

/**
 * Update invoice classification results (system access)
 * Used by Trigger.dev after document classification
 */
export const updateInvoiceClassification = mutation({
  args: {
    id: v.string(),
    classification: v.object({
      isSupported: v.boolean(),
      documentType: v.optional(v.string()),
      confidenceScore: v.optional(v.number()),
      classificationMethod: v.optional(v.string()),
      modelUsed: v.optional(v.string()),
      reasoning: v.optional(v.string()),
      detectedElements: v.optional(v.any()),
      userMessage: v.optional(v.string()),
    }),
    taskId: v.string(),
  },
  handler: async (ctx, args) => {
    const invoice = await resolveById(ctx.db, "invoices", args.id);
    if (!invoice) {
      throw new Error(`Invoice not found: ${args.id}`);
    }

    const now = Date.now();
    const status = args.classification.isSupported ? "analyzing" : "classification_failed";

    const updateData: Record<string, unknown> = {
      status,
      documentClassificationConfidence: args.classification.confidenceScore,
      classificationMethod: args.classification.classificationMethod,
      classificationTaskId: args.taskId,
      documentMetadata: {
        isSupported: args.classification.isSupported,
        documentType: args.classification.documentType,
        reasoning: args.classification.reasoning,
        detectedElements: args.classification.detectedElements,
        userMessage: args.classification.userMessage,
        modelUsed: args.classification.modelUsed,
        confidenceScore: args.classification.confidenceScore,
      },
      updatedAt: now,
    };

    if (!args.classification.isSupported) {
      updateData.failedAt = now;
    }

    await ctx.db.patch(invoice._id, updateData);
    console.log(`[System] Updated invoice ${args.id} classification`);
    return invoice._id;
  },
});

// ============================================
// EXPENSE CLAIM SYSTEM FUNCTIONS (for Trigger.dev)
// ============================================

/**
 * Get expense claim by ID (system access)
 * Used by Trigger.dev to fetch claim details for processing
 */
export const getExpenseClaimById = query({
  args: {
    id: v.string(),
  },
  handler: async (ctx, args) => {
    const claim = await resolveById(ctx.db, "expense_claims", args.id);
    if (!claim || claim.deletedAt) {
      return null;
    }
    return claim;
  },
});

/**
 * Update expense claim status (system access)
 * Used by Trigger.dev during receipt processing
 */
export const updateExpenseClaimStatus = mutation({
  args: {
    id: v.string(),
    status: v.string(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const claim = await resolveById(ctx.db, "expense_claims", args.id);
    if (!claim) {
      throw new Error(`Expense claim not found: ${args.id}`);
    }

    const now = Date.now();
    const updateData: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };

    // Status transition logic
    if (["processing", "analyzing"].includes(args.status)) {
      if (!claim.processingStartedAt) {
        updateData.processingStartedAt = now;
      }
    }

    if (args.status === "draft" || args.status === "pending") {
      updateData.processedAt = now;
    }

    if (args.status === "failed") {
      updateData.failedAt = now;
      if (args.errorMessage) {
        updateData.errorMessage = args.errorMessage;
      }
    }

    await ctx.db.patch(claim._id, updateData);
    console.log(`[System] Updated expense claim ${args.id} status to: ${args.status}`);
    return claim._id;
  },
});

/**
 * Update expense claim extraction results (system access)
 * Used by Trigger.dev after successful receipt extraction
 */
export const updateExpenseClaimExtraction = mutation({
  args: {
    id: v.string(),
    extractedData: v.any(),
    confidenceScore: v.optional(v.number()),
    extractionMethod: v.optional(v.string()),
    vendorName: v.optional(v.string()),
    totalAmount: v.optional(v.number()),
    currency: v.optional(v.string()),
    transactionDate: v.optional(v.string()),
    // Additional expense claim fields
    expenseCategory: v.optional(v.string()),
    businessPurpose: v.optional(v.string()),
    description: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    homeCurrency: v.optional(v.string()),
    homeCurrencyAmount: v.optional(v.number()),
    exchangeRate: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const claim = await resolveById(ctx.db, "expense_claims", args.id);
    if (!claim) {
      throw new Error(`Expense claim not found: ${args.id}`);
    }

    const now = Date.now();
    const updateData: Record<string, unknown> = {
      status: "draft", // Extraction complete, ready for user review
      processingMetadata: args.extractedData,
      processedAt: now,
      updatedAt: now,
    };

    if (args.confidenceScore !== undefined) {
      updateData.confidenceScore = args.confidenceScore;
    }
    if (args.vendorName !== undefined) {
      updateData.vendorName = args.vendorName;
    }
    if (args.totalAmount !== undefined) {
      updateData.totalAmount = args.totalAmount;
    }
    if (args.currency !== undefined) {
      updateData.currency = args.currency;
    }
    if (args.transactionDate !== undefined) {
      updateData.transactionDate = args.transactionDate;
    }
    // Additional expense claim fields
    if (args.expenseCategory !== undefined) {
      updateData.expenseCategory = args.expenseCategory;
    }
    if (args.businessPurpose !== undefined) {
      updateData.businessPurpose = args.businessPurpose;
    }
    if (args.description !== undefined) {
      updateData.description = args.description;
    }
    if (args.referenceNumber !== undefined) {
      updateData.referenceNumber = args.referenceNumber;
    }
    if (args.homeCurrency !== undefined) {
      updateData.homeCurrency = args.homeCurrency;
    }
    if (args.homeCurrencyAmount !== undefined) {
      updateData.homeCurrencyAmount = args.homeCurrencyAmount;
    }
    if (args.exchangeRate !== undefined) {
      updateData.exchangeRate = args.exchangeRate;
    }

    await ctx.db.patch(claim._id, updateData);
    console.log(`[System] Updated expense claim ${args.id} extraction results`);
    return claim._id;
  },
});

/**
 * Update invoice extraction task ID (system access)
 * Used by Trigger.dev to track which extraction task is processing the document
 */
export const updateInvoiceExtractionTaskId = mutation({
  args: {
    id: v.string(),
    extractionTaskId: v.string(),
  },
  handler: async (ctx, args) => {
    const invoice = await resolveById(ctx.db, "invoices", args.id);
    if (!invoice) {
      throw new Error(`Invoice not found: ${args.id}`);
    }

    await ctx.db.patch(invoice._id, {
      extractionTaskId: args.extractionTaskId,
      updatedAt: Date.now(),
    });
    console.log(`[System] Updated invoice ${args.id} extraction task ID: ${args.extractionTaskId}`);
    return invoice._id;
  },
});

/**
 * Update expense claim extraction task ID (system access)
 * Used by Trigger.dev to track which extraction task is processing the claim
 */
export const updateExpenseClaimExtractionTaskId = mutation({
  args: {
    id: v.string(),
    extractionTaskId: v.string(),
  },
  handler: async (ctx, args) => {
    const claim = await resolveById(ctx.db, "expense_claims", args.id);
    if (!claim) {
      throw new Error(`Expense claim not found: ${args.id}`);
    }

    // Store in processingMetadata for expense claims
    const currentMetadata = (claim.processingMetadata as object) || {};
    await ctx.db.patch(claim._id, {
      processingMetadata: {
        ...currentMetadata,
        extractionTaskId: args.extractionTaskId,
      },
      updatedAt: Date.now(),
    });
    console.log(`[System] Updated expense claim ${args.id} extraction task ID: ${args.extractionTaskId}`);
    return claim._id;
  },
});

/**
 * Update expense claim classification results (system access)
 * Used by Trigger.dev after document classification
 */
export const updateExpenseClaimClassification = mutation({
  args: {
    id: v.string(),
    classification: v.object({
      isSupported: v.boolean(),
      documentType: v.optional(v.string()),
      confidenceScore: v.optional(v.number()),
      classificationMethod: v.optional(v.string()),
      reasoning: v.optional(v.string()),
    }),
    taskId: v.string(),
  },
  handler: async (ctx, args) => {
    const claim = await resolveById(ctx.db, "expense_claims", args.id);
    if (!claim) {
      throw new Error(`Expense claim not found: ${args.id}`);
    }

    const now = Date.now();
    const status = args.classification.isSupported ? "processing" : "failed";

    const updateData: Record<string, unknown> = {
      status,
      confidenceScore: args.classification.confidenceScore,
      processingMetadata: {
        ...(claim.processingMetadata as object || {}),
        classification: {
          isSupported: args.classification.isSupported,
          documentType: args.classification.documentType,
          reasoning: args.classification.reasoning,
          classificationMethod: args.classification.classificationMethod,
          confidenceScore: args.classification.confidenceScore,
        },
        classificationTaskId: args.taskId,
      },
      updatedAt: now,
    };

    if (!args.classification.isSupported) {
      updateData.failedAt = now;
      updateData.errorMessage = args.classification.reasoning || "Document not supported";
    }

    await ctx.db.patch(claim._id, updateData);
    console.log(`[System] Updated expense claim ${args.id} classification`);
    return claim._id;
  },
});

// ============================================
// PDF CONVERSION SYSTEM FUNCTIONS (for Trigger.dev)
// ============================================

/**
 * Update invoice converted image path (system access)
 * Used by Trigger.dev after PDF to image conversion
 */
export const updateInvoiceConvertedImage = mutation({
  args: {
    id: v.string(),
    convertedImagePath: v.string(),
    convertedImageWidth: v.optional(v.number()),
    convertedImageHeight: v.optional(v.number()),
    pageMetadata: v.optional(v.any()),
    totalPages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const invoice = await resolveById(ctx.db, "invoices", args.id);
    if (!invoice) {
      throw new Error(`Invoice not found: ${args.id}`);
    }

    const now = Date.now();
    const updateData: Record<string, unknown> = {
      convertedImagePath: args.convertedImagePath,
      updatedAt: now,
    };

    if (args.convertedImageWidth !== undefined) {
      updateData.convertedImageWidth = args.convertedImageWidth;
    }
    if (args.convertedImageHeight !== undefined) {
      updateData.convertedImageHeight = args.convertedImageHeight;
    }

    // Store page metadata in documentMetadata
    if (args.pageMetadata || args.totalPages) {
      updateData.documentMetadata = {
        ...(invoice.documentMetadata as object || {}),
        pages: args.pageMetadata,
        totalPages: args.totalPages,
      };
    }

    await ctx.db.patch(invoice._id, updateData);
    console.log(`[System] Updated invoice ${args.id} converted image path: ${args.convertedImagePath}`);
    return invoice._id;
  },
});

/**
 * Update expense claim converted image path (system access)
 * Used by Trigger.dev after PDF to image conversion
 */
export const updateExpenseClaimConvertedImage = mutation({
  args: {
    id: v.string(),
    convertedImagePath: v.string(),
    convertedImageWidth: v.optional(v.number()),
    convertedImageHeight: v.optional(v.number()),
    pageMetadata: v.optional(v.any()),
    totalPages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const claim = await resolveById(ctx.db, "expense_claims", args.id);
    if (!claim) {
      throw new Error(`Expense claim not found: ${args.id}`);
    }

    const now = Date.now();
    const updateData: Record<string, unknown> = {
      convertedImagePath: args.convertedImagePath,
      updatedAt: now,
    };

    // For expense_claims, store dimensions in processingMetadata
    if (args.pageMetadata || args.totalPages || args.convertedImageWidth) {
      updateData.processingMetadata = {
        ...(claim.processingMetadata as object || {}),
        pages: args.pageMetadata,
        totalPages: args.totalPages,
        convertedImageWidth: args.convertedImageWidth,
        convertedImageHeight: args.convertedImageHeight,
      };
    }

    await ctx.db.patch(claim._id, updateData);
    console.log(`[System] Updated expense claim ${args.id} converted image path: ${args.convertedImagePath}`);
    return claim._id;
  },
});

// ============================================
// DEBUG FUNCTIONS (for diagnostic scripts)
// ============================================

/**
 * List recent invoices (system access for debugging)
 * Used by diagnostic scripts to inspect invoice data
 * NOTE: This should be removed or secured in production
 */
export const listRecentInvoices = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;

    // Get recent invoices ordered by creation time
    const invoices = await ctx.db
      .query("invoices")
      .order("desc")
      .take(limit);

    // Return minimal info for debugging
    return invoices.map((inv) => ({
      _id: inv._id,
      fileName: inv.fileName,
      status: inv.status,
      createdAt: inv._creationTime,
      hasExtractedData: !!inv.extractedData,
      extractedDataKeys: inv.extractedData ? Object.keys(inv.extractedData as object) : [],
      suggestedCategory: (inv.extractedData as Record<string, unknown> | undefined)?.suggested_category,
      accountingCategory: (inv.extractedData as Record<string, unknown> | undefined)?.accounting_category,
    }));
  },
});

// ============================================
// OCR USAGE TRACKING (for Trigger.dev)
// ============================================

/**
 * Record OCR usage for billing (system access)
 * Used by Trigger.dev tasks after document processing
 *
 * BILLING FAIRNESS LOGIC:
 * - Only charges if API tokens were actually consumed (hasUsageData === true && totalTokens > 0)
 * - System errors (network failures, timeouts before API call) = no charge
 * - User errors (bad image, wrong doc type) that reach the API = charges apply
 */
export const recordOcrUsage = mutation({
  args: {
    businessId: v.string(), // String ID for cross-system compatibility
    documentId: v.optional(v.string()),
    tokenUsage: v.optional(v.object({
      hasUsageData: v.optional(v.boolean()),
      totalTokens: v.optional(v.number()),
      promptTokens: v.optional(v.number()),
      completionTokens: v.optional(v.number()),
      model: v.optional(v.string()),
    })),
    credits: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const credits = args.credits ?? 1;

    // BILLING FAIRNESS: Only charge if API tokens were actually consumed
    const tokensConsumed = args.tokenUsage?.hasUsageData === true &&
      (args.tokenUsage?.totalTokens ?? 0) > 0;

    if (!tokensConsumed) {
      console.log(`[System OCR Usage] Skipping billing - no API tokens consumed`);
      return {
        success: true,
        skipped: true,
        newUsage: 0,
      };
    }

    // Resolve business ID
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      console.error(`[System OCR Usage] Business not found: ${args.businessId}`);
      return {
        success: false,
        error: `Business not found: ${args.businessId}`,
        newUsage: 0,
      };
    }

    // Get current month in YYYY-MM format
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Get or create usage record for this month
    let usage = await ctx.db
      .query("ocr_usage")
      .withIndex("by_businessId_month", (q) =>
        q.eq("businessId", business._id).eq("month", currentMonth)
      )
      .first();

    if (!usage) {
      // Create new usage record with default limit
      const defaultLimit = 100; // Default credits if no plan set

      const usageId = await ctx.db.insert("ocr_usage", {
        businessId: business._id,
        month: currentMonth,
        pagesProcessed: 1,
        creditsUsed: credits,
        creditsRemaining: Math.max(0, defaultLimit - credits),
        planLimit: defaultLimit,
        updatedAt: Date.now(),
      });

      console.log(`[System OCR Usage] Created new usage record for business ${args.businessId}, month ${currentMonth}`);
      return {
        success: true,
        usageId: usageId,
        newUsage: credits,
      };
    }

    // Update existing record
    const newCreditsUsed = usage.creditsUsed + credits;
    const newCreditsRemaining = Math.max(0, usage.planLimit - newCreditsUsed);

    await ctx.db.patch(usage._id, {
      pagesProcessed: usage.pagesProcessed + 1,
      creditsUsed: newCreditsUsed,
      creditsRemaining: newCreditsRemaining,
      updatedAt: Date.now(),
    });

    console.log(`[System OCR Usage] Updated usage for business ${args.businessId}: ${newCreditsUsed}/${usage.planLimit} credits`);
    return {
      success: true,
      usageId: usage._id,
      newUsage: newCreditsUsed,
    };
  },
});


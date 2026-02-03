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
import { internal } from "../_generated/api";

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
      // Clear stale error fields from any previous failed attempts
      errorMessage: undefined,
      failedAt: undefined,
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
      // Clear stale error fields from any previous failed attempts
      errorMessage: undefined,
      failedAt: undefined,
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

/**
 * Update expense claim line items (system access)
 * Used by Lambda during two-phase extraction - Phase 2 updates line items only
 *
 * Two-Phase Extraction Flow:
 * - Phase 1: Extract core fields → Convex update → frontend renders immediately (~3-4s)
 * - Phase 2: Extract line items → this mutation → frontend updates via real-time (~3-4s)
 */
export const updateExpenseClaimLineItems = mutation({
  args: {
    id: v.string(),
    lineItems: v.array(
      v.object({
        description: v.string(),
        quantity: v.optional(v.number()),
        unit_price: v.optional(v.number()),
        line_total: v.number(),
      })
    ),
    lineItemsStatus: v.union(
      v.literal("pending"),
      v.literal("extracting"),
      v.literal("complete"),
      v.literal("skipped")
    ),
  },
  handler: async (ctx, args): Promise<string> => {
    console.log(`[System] Updating expense claim ${args.id} line items (${args.lineItems.length} items)`);
    console.log(`[System] Line items sample:`, JSON.stringify(args.lineItems.slice(0, 2)));

    try {
      // Call internal mutation that handles merging line_items into processingMetadata
      await ctx.runMutation(
        internal.functions.expenseClaims.internalUpdateLineItems,
        {
          id: args.id,
          lineItems: args.lineItems,
          lineItemsStatus: args.lineItemsStatus,
        }
      );

      console.log(`[System] Successfully updated expense claim ${args.id} with line items`);
      return args.id;
    } catch (error) {
      console.error(`[System] ERROR updating expense claim ${args.id}:`, error);
      throw error;
    }
  },
});

/**
 * Update expense claim line items status only (system access)
 * Used by Lambda to mark lineItemsStatus as 'extracting' before Phase 2 starts
 */
export const updateExpenseClaimLineItemsStatus = mutation({
  args: {
    id: v.string(),
    lineItemsStatus: v.union(
      v.literal("pending"),
      v.literal("extracting"),
      v.literal("complete"),
      v.literal("skipped")
    ),
  },
  handler: async (ctx, args): Promise<string> => {
    console.log(`[System] Updating expense claim ${args.id} lineItemsStatus to: ${args.lineItemsStatus}`);

    // Call internal mutation that updates only lineItemsStatus
    await ctx.runMutation(
      internal.functions.expenseClaims.internalUpdateLineItemsStatus,
      {
        id: args.id,
        lineItemsStatus: args.lineItemsStatus,
      }
    );

    return args.id;
  },
});

// ============================================
// INVOICE TWO-PHASE EXTRACTION SYSTEM FUNCTIONS
// Phase 1: Core fields → immediate render
// Phase 2: Line items → real-time update
// ============================================

/**
 * Update invoice line items (system access)
 * Used by Lambda during two-phase extraction - Phase 2 updates line items only
 *
 * Two-Phase Extraction Flow:
 * - Phase 1: Extract core fields → Convex update → frontend renders immediately (~3-4s)
 * - Phase 2: Extract line items → this mutation → frontend updates via real-time (~3-4s)
 */
export const updateInvoiceLineItems = mutation({
  args: {
    id: v.string(),
    lineItems: v.array(
      v.object({
        description: v.string(),
        quantity: v.optional(v.number()),
        unit_price: v.optional(v.number()),
        line_total: v.number(),
        // Additional fields from Lambda extraction
        item_code: v.optional(v.string()),
        unit_measurement: v.optional(v.string()),
      })
    ),
    lineItemsStatus: v.union(
      v.literal("pending"),
      v.literal("extracting"),
      v.literal("complete"),
      v.literal("skipped")
    ),
  },
  handler: async (ctx, args): Promise<string> => {
    console.log(`[System] Updating invoice ${args.id} line items (${args.lineItems.length} items)`);
    console.log(`[System] Line items sample:`, JSON.stringify(args.lineItems.slice(0, 2)));

    try {
      // Call internal mutation that handles merging line_items into extractedData
      await ctx.runMutation(
        internal.functions.invoices.internalUpdateLineItems,
        {
          id: args.id,
          lineItems: args.lineItems,
          lineItemsStatus: args.lineItemsStatus,
        }
      );

      console.log(`[System] Successfully updated invoice ${args.id} with line items`);
      return args.id;
    } catch (error) {
      console.error(`[System] ERROR updating invoice ${args.id}:`, error);
      throw error;
    }
  },
});

/**
 * Update invoice line items status only (system access)
 * Used by Lambda to mark lineItemsStatus as 'extracting' before Phase 2 starts
 */
export const updateInvoiceLineItemsStatus = mutation({
  args: {
    id: v.string(),
    lineItemsStatus: v.union(
      v.literal("pending"),
      v.literal("extracting"),
      v.literal("complete"),
      v.literal("skipped")
    ),
  },
  handler: async (ctx, args): Promise<string> => {
    console.log(`[System] Updating invoice ${args.id} lineItemsStatus to: ${args.lineItemsStatus}`);

    // Call internal mutation that updates only lineItemsStatus
    await ctx.runMutation(
      internal.functions.invoices.internalUpdateLineItemsStatus,
      {
        id: args.id,
        lineItemsStatus: args.lineItemsStatus,
      }
    );

    return args.id;
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
// MCP FINANCIAL INTELLIGENCE SYSTEM FUNCTIONS
// Used by MCP Lambda for read-only financial analysis
// ============================================

/**
 * Get accounting entries for a business (system access)
 * Used by MCP tools (detect_anomalies, forecast_cash_flow, etc.)
 *
 * Security: Document IDs are long random strings - only our backend knows them.
 * The businessId provides implicit authorization.
 */
export const getAccountingEntriesForBusiness = query({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    const entries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Return entries with only the fields needed for analysis
    // Map actual schema fields to what MCP tools expect
    return entries.map((e) => ({
      _id: e._id.toString(),
      businessId: e.businessId?.toString() ?? "",
      transactionType: e.transactionType,
      transactionDate: e.transactionDate,
      category: e.category,
      categoryName: e.category, // MCP tools expect categoryName, schema has category
      vendorName: e.vendorName,
      vendorId: e.vendorId?.toString(),
      description: e.description,
      originalAmount: e.originalAmount,
      homeCurrencyAmount: e.homeCurrencyAmount,
      currency: e.originalCurrency, // MCP tools expect currency, schema has originalCurrency
      deletedAt: e.deletedAt,
    }));
  },
});

/**
 * Get vendors for a business (system access)
 * Used by MCP tools (analyze_vendor_risk)
 */
export const getVendorsForBusiness = query({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    return vendors.map((v) => ({
      _id: v._id.toString(),
      businessId: v.businessId.toString(),
      name: v.name,
      email: v.email,
      phone: v.phone,
      taxId: v.taxId,
      status: v.status,
      updatedAt: v.updatedAt,
    }));
  },
});

/**
 * Get expense claims for a business (system access)
 * Used by MCP tools (create_proposal, confirm_proposal)
 */
export const getExpenseClaimsForBusiness = query({
  args: {
    businessId: v.string(),
  },
  handler: async (ctx, args) => {
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    const claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    return claims.filter((c) => !c.deletedAt).map((c) => ({
      _id: c._id.toString(),
      businessId: c.businessId.toString(),
      status: c.status,
      vendorName: c.vendorName,
      totalAmount: c.totalAmount,
      currency: c.currency,
      transactionDate: c.transactionDate,
      description: c.description,
      expenseCategory: c.expenseCategory,
    }));
  },
});

/**
 * Update expense claim status (system access)
 * Used by MCP tools (confirm_proposal)
 * This is separate from updateExpenseClaimStatus which is for Trigger.dev
 */
export const systemUpdateExpenseClaimStatus = mutation({
  args: {
    claimId: v.string(),
    status: v.string(),
    approvedBy: v.optional(v.string()),
    approvalNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const claim = await resolveById(ctx.db, "expense_claims", args.claimId);
    if (!claim) {
      throw new Error(`Expense claim not found: ${args.claimId}`);
    }

    const updateData: Record<string, unknown> = {
      status: args.status,
      updatedAt: Date.now(),
    };

    if (args.status === "approved") {
      updateData.approvedAt = Date.now();
      updateData.approvalNote = args.approvalNote || "Approved via MCP";
    } else if (args.status === "rejected") {
      updateData.rejectedAt = Date.now();
      updateData.rejectionReason = args.approvalNote || "Rejected via MCP";
    }

    await ctx.db.patch(claim._id, updateData);
    return { success: true, claimId: args.claimId };
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

/**
 * Debug query to inspect actual vendor/customer field values
 * Used to diagnose why fields show as "Not extracted" in UI
 */
export const debugVendorCustomerFields = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 5;

    const invoices = await ctx.db
      .query("invoices")
      .order("desc")
      .take(limit);

    return invoices.map((inv) => {
      const data = inv.extractedData as Record<string, unknown> | undefined;
      return {
        _id: inv._id,
        fileName: inv.fileName,
        status: inv.status,
        // Processing method to distinguish Lambda vs Trigger.dev (stored in extractedData)
        processingMethod: data?.processing_method ?? data?.extraction_method ?? inv.processingMethod ?? "unknown",
        backendUsed: data?.backend_used ?? "unknown",
        // Show ALL top-level keys in extractedData to understand structure
        extractedDataKeys: data ? Object.keys(data).slice(0, 10) : [], // Limit to first 10
        // Vendor fields - show actual values (including empty strings)
        vendor_name: data?.vendor_name ?? "KEY_NOT_FOUND",
        vendor_address: data?.vendor_address ?? "KEY_NOT_FOUND",
        vendor_contact: data?.vendor_contact ?? "KEY_NOT_FOUND",
        vendor_tax_id: data?.vendor_tax_id ?? "KEY_NOT_FOUND",
        // Customer fields
        customer_name: data?.customer_name ?? "KEY_NOT_FOUND",
        customer_address: data?.customer_address ?? "KEY_NOT_FOUND",
        customer_contact: data?.customer_contact ?? "KEY_NOT_FOUND",
      };
    });
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

// ============================================
// ONE-TIME FIXUP FUNCTIONS (for data repair)
// ============================================

/**
 * Clear stale error fields from invoices with successful extraction
 * One-time fixup for invoices that have extractedData but also errorMessage/failedAt
 */
export const fixupClearStaleErrors = mutation({
  args: {
    invoiceId: v.string(),
  },
  handler: async (ctx, args) => {
    const invoice = await resolveById(ctx.db, "invoices", args.invoiceId);
    if (!invoice) {
      throw new Error(`Invoice not found: ${args.invoiceId}`);
    }

    // Only clear if invoice has extractedData (successful extraction)
    if (!invoice.extractedData) {
      return { success: false, reason: "No extracted data - nothing to fix" };
    }

    await ctx.db.patch(invoice._id, {
      errorMessage: undefined,
      failedAt: undefined,
      updatedAt: Date.now(),
    });

    console.log(`[Fixup] Cleared stale error fields from invoice ${args.invoiceId}`);
    return { success: true };
  },
});

// ============================================
// VENDOR INTEGRATION SYSTEM FUNCTIONS
// ============================================

/**
 * Process vendor from invoice extraction (system access)
 * Called by Lambda after successful invoice data extraction to:
 * 1. Create/upsert vendor in vendors table (with "prospective" status)
 * 2. Record price history observations from line items
 *
 * Security: Uses document ID as implicit authorization (only backend knows IDs)
 */
export const processVendorFromInvoiceExtraction = mutation({
  args: {
    invoiceId: v.string(),
  },
  handler: async (ctx, args): Promise<
    | { success: false; reason: string }
    | { success: true; vendorId: string; vendorCreated: boolean; priceObservationsCount: number }
  > => {
    console.log(`[System] Processing vendor from invoice extraction: ${args.invoiceId}`);

    // Call the internal mutation that handles vendor upsert and price history
    const result = await ctx.runMutation(
      internal.functions.invoices.internalProcessVendorFromExtraction,
      { invoiceId: args.invoiceId }
    );

    return result;
  },
});

/**
 * Process vendor from expense claim extraction (system access)
 * Called by Lambda after successful expense claim data extraction
 */
export const processVendorFromExpenseClaimExtraction = mutation({
  args: {
    claimId: v.string(),
  },
  handler: async (ctx, args): Promise<
    | { success: false; reason: string }
    | { success: true; vendorId: string; vendorCreated: boolean; priceObservationsCount: number }
  > => {
    console.log(`[System] Processing vendor from expense claim extraction: ${args.claimId}`);

    // Call the internal mutation that handles vendor upsert and price history
    const result = await ctx.runMutation(
      internal.functions.expenseClaims.internalProcessVendorFromExtraction,
      { claimId: args.claimId }
    );

    return result;
  },
});


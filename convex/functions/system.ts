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
import { internalMutation, mutation, query } from "../_generated/server";
import { resolveById } from "../lib/resolvers";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

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
    // QR detection (019-lhdn-einv-flow-2)
    merchantFormUrl: v.optional(v.string()),
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
    // QR detection (019-lhdn-einv-flow-2) — just store the URL.
    // Form fill is triggered directly by the Python Lambda (no Convex round-trip).
    if (args.merchantFormUrl !== undefined) {
      updateData.merchantFormUrl = args.merchantFormUrl;
    }

    await ctx.db.patch(claim._id, updateData);
    console.log(`[System] Updated expense claim ${args.id} extraction results`);

    return claim._id as string;
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
      .query("journal_entries")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", business._id))
      .collect();

    // Map journal entries to what MCP tools expect
    return entries.map((e: any) => ({
      _id: e._id.toString(),
      businessId: e.businessId?.toString() ?? "",
      transactionType: e.sourceType || "manual",
      transactionDate: e.transactionDate,
      description: e.description,
      originalAmount: e.totalDebit,
      homeCurrencyAmount: e.totalDebit,
      currency: e.homeCurrency || "MYR",
      status: e.status,
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

// ============================================
// E-INVOICE FORM FILL RESULT (019-lhdn-einv-flow-2)
// Called by the Node.js form fill Lambda after Stagehand completes
// ============================================

/**
 * Report e-invoice form fill status.
 * Called by the einvoice-form-fill Lambda at each phase:
 *   - "in_progress": Sets emailRef on claim, creates request log, schedules burst polling
 *   - "success": Updates claim + log, sends success notification
 *   - "failed": Updates claim + log, sends failure notification
 *
 * Single Convex entry point for the entire form fill lifecycle.
 */
export const reportEinvoiceFormFillResult = mutation({
  args: {
    expenseClaimId: v.string(),
    emailRef: v.string(),
    status: v.union(v.literal("in_progress"), v.literal("success"), v.literal("failed")),
    merchantFormUrl: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    browserbaseSessionId: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    // Debugging fields
    merchantName: v.optional(v.string()),
    tierReached: v.optional(v.string()),
    browserType: v.optional(v.string()),
    cuaActions: v.optional(v.number()),
    verifyEvidence: v.optional(v.string()),
    merchantSlug: v.optional(v.string()),  // SSM slug for account-level email matching
    cost: v.optional(v.object({
      cuaInputTokens: v.optional(v.number()),
      cuaOutputTokens: v.optional(v.number()),
      cuaCalls: v.optional(v.number()),
      cuaCostUsd: v.optional(v.number()),
      flashInputTokens: v.optional(v.number()),
      flashOutputTokens: v.optional(v.number()),
      flashCalls: v.optional(v.number()),
      flashCostUsd: v.optional(v.number()),
      capsolverSolves: v.optional(v.number()),
      capsolverCostUsd: v.optional(v.number()),
      totalCostUsd: v.optional(v.number()),
    })),
    // DSPy self-learning fields (001-dspy-cua-integration)
    reconDescription: v.optional(v.string()),
    generatedHint: v.optional(v.string()),
    failureCategory: v.optional(v.union(
      v.literal("connectivity"),
      v.literal("form_validation"),
      v.literal("session"),
      v.literal("captcha"),
      v.literal("unknown"),
    )),
    dspyModuleVersion: v.optional(v.string()),
    confidenceGateScore: v.optional(v.number()),
    confidenceGateDecision: v.optional(v.union(v.literal("proceed"), v.literal("skip"))),
  },
  handler: async (ctx, args) => {
    console.log(`[System] E-invoice form fill: claim=${args.expenseClaimId} status=${args.status}`);

    const claim = await resolveById(ctx.db, "expense_claims", args.expenseClaimId);
    if (!claim) {
      console.error(`[System] Expense claim not found: ${args.expenseClaimId}`);
      return { success: false };
    }

    // ── in_progress: starting form fill ──
    if (args.status === "in_progress") {
      // Set emailRef and status on the claim
      await ctx.db.patch(claim._id, {
        einvoiceEmailRef: args.emailRef,
        einvoiceRequestStatus: "requesting",
        einvoiceRequestedAt: Date.now(),
        einvoiceSource: "merchant_issued",
        updatedAt: Date.now(),
      });

      // Create request log
      await ctx.db.insert("einvoice_request_logs", {
        businessId: claim.businessId,
        expenseClaimId: claim._id,
        userId: claim.userId,
        merchantFormUrl: args.merchantFormUrl || "",
        emailRefToken: args.emailRef,
        status: "in_progress",
        startedAt: Date.now(),
      });

      // EventBridge triggers LHDN polling Lambda every 5 min — no burst scheduling needed.
      // Lambda will discover this business has pending requests and poll LHDN automatically.

      return { success: true };
    }

    // ── success / failed: form fill completed ──
    // Find the request log by expenseClaimId
    const requestLog = await ctx.db
      .query("einvoice_request_logs")
      .withIndex("by_expenseClaimId", (q) => q.eq("expenseClaimId", claim._id))
      .order("desc")
      .first();

    if (requestLog) {
      const logUpdate: Record<string, unknown> = {
        status: args.status,
        completedAt: Date.now(),
      };
      if (args.errorMessage) logUpdate.errorMessage = args.errorMessage;
      if (args.browserbaseSessionId) logUpdate.browserbaseSessionId = args.browserbaseSessionId;
      if (args.durationMs) logUpdate.durationMs = args.durationMs;
      if (args.merchantName) logUpdate.merchantName = args.merchantName;
      if (args.tierReached) logUpdate.tierReached = args.tierReached;
      if (args.browserType) logUpdate.browserType = args.browserType;
      if (args.cuaActions !== undefined) logUpdate.cuaActions = args.cuaActions;
      if (args.verifyEvidence) logUpdate.verifyEvidence = args.verifyEvidence;
      if (args.cost) logUpdate.cost = args.cost;
      // DSPy self-learning fields (001-dspy-cua-integration)
      if (args.reconDescription) logUpdate.reconDescription = args.reconDescription;
      if (args.generatedHint) {
        logUpdate.generatedHint = args.generatedHint;
        logUpdate.hintEffectivenessOutcome = "pending"; // Resolved on next attempt
      }
      if (args.failureCategory) logUpdate.failureCategory = args.failureCategory;
      if (args.dspyModuleVersion) logUpdate.dspyModuleVersion = args.dspyModuleVersion;
      if (args.confidenceGateScore !== undefined) logUpdate.confidenceGateScore = args.confidenceGateScore;
      if (args.confidenceGateDecision) logUpdate.confidenceGateDecision = args.confidenceGateDecision;
      await ctx.db.patch(requestLog._id, logUpdate);
    }

    // Update claim status
    const claimUpdate: Record<string, unknown> = {
      einvoiceRequestStatus: args.status === "success" ? "requested" : "failed",
      updatedAt: Date.now(),
    };
    if (args.status === "failed" && args.errorMessage) {
      claimUpdate.einvoiceAgentError = args.errorMessage;
    }
    if (args.status === "success" && args.merchantSlug) {
      claimUpdate.einvoiceMerchantSlug = args.merchantSlug;
    }
    await ctx.db.patch(claim._id, claimUpdate);

    // Send notification to user (on completion, not in_progress)
    await ctx.scheduler.runAfter(0, internal.functions.notifications.create, {
      recipientUserId: claim.userId,
      businessId: claim.businessId,
      type: "compliance" as const,
      severity: (args.status === "success" ? "info" : "warning") as "info" | "warning",
      title: args.status === "success" ? "E-Invoice Requested" : "E-Invoice Request Failed",
      body: args.status === "success"
        ? `Your e-invoice request for ${claim.vendorName || "merchant"} has been submitted. You'll be notified when the e-invoice is received.`
        : `Could not complete the e-invoice request for ${claim.vendorName || "merchant"}. You can try again or fill the form manually.`,
      resourceType: "expense_claim" as const,
      resourceId: args.expenseClaimId,
      sourceEvent: `einvoice_${args.status}_${args.expenseClaimId}`,
    });

    // ── DSPy Alert: Email Groot dev team when a new/unknown merchant fails ──
    // Internal ops alert — NOT a customer notification.
    // Sends to dev+einvoiceMY@hellogroot.com via existing notifications API.
    if (args.status === "failed" && args.merchantName) {
      const priorLogs = await ctx.db
        .query("einvoice_request_logs")
        .withIndex("by_merchantName_status")
        .collect();
      const merchantLogs = priorLogs.filter((l) => l.merchantName === args.merchantName);
      const hasAnySuccess = merchantLogs.some((l) => l.status === "success");
      const failCount = merchantLogs.filter((l) => l.status === "failed").length;

      // Alert on: first failure ever, or 3rd consecutive failure with no successes
      const shouldAlert = !hasAnySuccess || (failCount >= 3 && !hasAnySuccess);
      if (shouldAlert) {
        const failureCat = args.failureCategory || "unknown";
        const tier = args.tierReached || "unknown";
        const gateScore = args.confidenceGateScore !== undefined
          ? `${args.confidenceGateScore.toFixed(2)}` : "N/A";
        const gateDecision = args.confidenceGateDecision || "N/A";

        const subject = hasAnySuccess
          ? `[E-Invoice DSPy] ${args.merchantName} — ${failCount} consecutive failures (${failureCat})`
          : `[E-Invoice DSPy] NEW merchant "${args.merchantName}" — first failure (${failureCat})`;

        const emailBody = [
          hasAnySuccess
            ? `Merchant "${args.merchantName}" has failed ${failCount} times consecutively.`
            : `New merchant "${args.merchantName}" failed on first attempt. DSPy will generate cuaHints for next try.`,
          "",
          `Failure Category: ${failureCat}`,
          `Tier Reached: ${tier}`,
          `Gatekeeper: confidence=${gateScore}, decision=${gateDecision}`,
          `Error: ${args.errorMessage?.substring(0, 300) || "N/A"}`,
          `DSPy Module: ${args.dspyModuleVersion || "untracked"}`,
          "",
          `Business: ${claim.businessId}`,
          `Claim: ${args.expenseClaimId}`,
          "",
          "---",
          "Action needed:",
          failureCat === "connectivity" ? "→ Switch merchant to Browserbase (site blocks Lambda IP)"
            : failureCat === "captcha" ? "→ Review CapSolver config or mark as manual_only"
            : failureCat === "form_validation" ? "→ DSPy troubleshooter will auto-learn — check cuaHints after next attempt"
            : failureCat === "session" ? "→ Merchant may require login/OTP — check if account-based flow needed"
            : "→ Review CloudWatch logs for this merchant",
          "",
          "This is an automated alert from the E-Invoice DSPy Intelligence Pipeline.",
        ].join("\n");

        // Send via existing notifications API (same pattern as einvoiceMonitoring.ts)
        const apiUrl = process.env.APP_URL || "https://finance.hellogroot.com";
        try {
          await fetch(`${apiUrl}/api/v1/notifications/send-email`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": process.env.INTERNAL_API_KEY || "",
            },
            body: JSON.stringify({
              to: "dev+einvoiceMY@hellogroot.com",
              subject,
              templateType: "plain_text",
              templateData: { body: emailBody },
            }),
          });
          console.log(`[DSPy Alert] Emailed dev+einvoiceMY@hellogroot.com: ${args.merchantName} (${failureCat})`);
        } catch (emailErr) {
          console.error(`[DSPy Alert] Failed to send email:`, emailErr);
        }
      }
    }

    return { success: true };
  },
});

// ============================================
// LHDN POLLING (019-lhdn-einv-flow-2)
//
// EventBridge triggers Lambda every 5 min → Lambda queries getBusinessesForLhdnPolling
// → Lambda reads per-business SSM secrets → LHDN auth → fetch docs
// → calls processLhdnReceivedDocuments → 4-tier matching → dedup → storage
// → notifications → real-time UI update
// ============================================

/**
 * Public Query: Returns businesses with pending e-invoice requests.
 * Called by LHDN Polling Lambda (via Convex HTTP API) to discover which businesses to poll.
 *
 * Per-business credentials: Each business enters their own LHDN Client ID
 * and Client Secret via business settings UI. Client ID is stored here in
 * Convex, Client Secret is in SSM (read by Lambda at runtime).
 *
 * Returns only businesses that have:
 * 1. LHDN TIN configured
 * 2. LHDN Client ID configured
 * 3. At least one expense claim with einvoiceRequestStatus = "requesting" or "requested"
 */
export const getBusinessesForLhdnPolling = query({
  args: {},
  handler: async (ctx) => {
    const businesses = await ctx.db.query("businesses").collect();
    const lhdnBusinesses = businesses.filter(
      (b) =>
        b.lhdnTin &&
        (b as Record<string, unknown>).lhdnClientId &&
        !(b as Record<string, unknown>).deletedAt
    );

    const result: Array<{
      businessId: string;
      businessTin: string;
      lhdnClientId: string;
    }> = [];

    for (const biz of lhdnBusinesses) {
      const pendingClaims = await ctx.db
        .query("expense_claims")
        .withIndex("by_businessId", (q) => q.eq("businessId", biz._id))
        .collect();

      const hasPending = pendingClaims.some(
        (claim) =>
          !claim.deletedAt &&
          (claim.einvoiceRequestStatus === "requesting" ||
            claim.einvoiceRequestStatus === "requested")
      );

      if (hasPending) {
        result.push({
          businessId: biz._id as string,
          businessTin: biz.lhdnTin as string,
          lhdnClientId: (biz as Record<string, unknown>).lhdnClientId as string,
        });
      }
    }

    return result;
  },
});

// ============================================
// E-INVOICE EMAIL PROCESSING (019-lhdn-einv-flow-2)
//
// SES receives email → Lambda processes → calls these functions
// ============================================

/**
 * Public Query: Look up expense claim by email ref token.
 * Called by einvoice-email-processor Lambda to get claim details for S3 path construction.
 * Returns businessId, userId, storagePath needed to save files in the right S3 folder.
 */
export const getClaimByEmailRef = query({
  args: { emailRef: v.string() },
  handler: async (ctx, args) => {
    const claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_einvoiceEmailRef", (q) => q.eq("einvoiceEmailRef", args.emailRef))
      .collect();

    const claim = claims.find((c) => !c.deletedAt);
    if (!claim) return null;

    // Get user email for forwarding e-invoice copies
    const user = await ctx.db.get(claim.userId);

    return {
      claimId: claim._id as string,
      businessId: claim.businessId as string,
      userId: claim.userId as string,
      userEmail: user?.email || null,
      // S3 storage path pattern: {bizId}/{userId}/{claimId}
      storagePath: `${claim.businessId}/${claim.userId}/${claim._id}`,
    };
  },
});

/**
 * Public Mutation: Update expense claim after e-invoice email is processed.
 * Called by einvoice-email-processor Lambda after saving files to S3.
 */
export const processEinvoiceEmail = mutation({
  args: {
    claimId: v.string(),
    emailRef: v.string(),
    fromAddress: v.string(),
    subject: v.optional(v.string()),
    messageId: v.string(),
    einvoiceStoragePath: v.union(v.string(), v.null()),
    rawEmailStoragePath: v.string(),
    hasAttachment: v.boolean(),
    emailType: v.optional(v.string()), // "einvoice_with_pdf" | "einvoice_in_html" | "confirmation" | etc.
  },
  handler: async (ctx, args) => {
    const claim = await resolveById(ctx.db, "expense_claims", args.claimId);
    if (!claim) {
      console.log(`[E-Invoice Email] Claim not found: ${args.claimId}`);
      return;
    }

    const isConfirmation = args.emailType === "confirmation";
    const isEinvoice = !isConfirmation && (args.hasAttachment || args.einvoiceStoragePath);

    if (isConfirmation) {
      // Confirmation email — log it but don't change claim status to "received"
      // Keep status as "requesting" so we continue waiting for the actual e-invoice
      await ctx.db.patch(claim._id, {
        einvoiceRawEmailPath: args.rawEmailStoragePath,
        updatedAt: Date.now(),
      });

      try {
        await ctx.scheduler.runAfter(0, internal.functions.notifications.create, {
          recipientUserId: claim.userId,
          businessId: claim.businessId,
          type: "compliance" as const,
          severity: "info" as const,
          title: "E-Invoice Request Confirmed",
          body: `Merchant confirmed your e-invoice request. The actual e-invoice will arrive separately.`,
          resourceType: "expense_claim" as const,
          resourceId: claim._id as string,
          sourceEvent: `einvoice_confirmation_${claim._id}_${args.messageId}`,
        });
      } catch (e) {
        console.log(`[E-Invoice Email] Notification failed: ${e}`);
      }

      console.log(`[E-Invoice Email] Confirmation logged for ${args.claimId} — still waiting for e-invoice`);
      return;
    }

    // Actual e-invoice received — mark claim as received
    await ctx.db.patch(claim._id, {
      einvoiceRequestStatus: "received" as const,
      einvoiceSource: "merchant_issued" as const,
      einvoiceAttached: !!isEinvoice,
      einvoiceReceivedAt: Date.now(),
      ...(args.einvoiceStoragePath && { einvoiceStoragePath: args.einvoiceStoragePath }),
      einvoiceRawEmailPath: args.rawEmailStoragePath,
      updatedAt: Date.now(),
    });

    try {
      const attachNote = args.hasAttachment ? " (PDF attached)"
        : args.emailType === "einvoice_in_html" ? " (HTML e-invoice)"
        : args.emailType === "einvoice_download_link" ? " (download link available)"
        : "";
      await ctx.scheduler.runAfter(0, internal.functions.notifications.create, {
        recipientUserId: claim.userId,
        businessId: claim.businessId,
        type: "compliance" as const,
        severity: "info" as const,
        title: "E-Invoice Received",
        body: `E-invoice received from ${args.fromAddress}${attachNote}`,
        resourceType: "expense_claim" as const,
        resourceId: claim._id as string,
        sourceEvent: `einvoice_email_${claim._id}_${args.messageId}`,
      });
    } catch (e) {
      console.log(`[E-Invoice Email] Notification failed: ${e}`);
    }

    console.log(`[E-Invoice Email] Updated ${args.claimId}: status=received, type=${args.emailType}, attached=${!!isEinvoice}`);
  },
});

/**
 * Public Query: Find pending expense claim by fuzzy matching (no emailRef).
 * Used when e-invoice email arrives at account-level address (e.g. einvoice@einv.hellogroot.com)
 * instead of claim-specific +ref address.
 *
 * Layered matching:
 *   Layer 1: Receipt number substring match → unique? done
 *   Layer 2: Date + amount match (±0.01) → unique? done
 *   Layer 3: Only 1 pending claim for this merchant slug → done
 *   Otherwise: null (manual review needed)
 */
export const getClaimByFuzzyMatch = query({
  args: {
    merchantSlug: v.string(),
    receiptNumber: v.optional(v.string()),
    totalAmount: v.optional(v.number()),
    transactionDate: v.optional(v.string()),
    emailBody: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Find all pending claims (status = "requested") — these are waiting for e-invoice emails
    const allClaims = await ctx.db
      .query("expense_claims")
      .filter((q) =>
        q.and(
          q.eq(q.field("einvoiceRequestStatus"), "requested"),
          q.eq(q.field("einvoiceMerchantSlug"), args.merchantSlug),
        )
      )
      .collect();

    const pendingClaims = allClaims.filter((c) => !c.deletedAt);
    if (pendingClaims.length === 0) return null;

    console.log(`[FuzzyMatch] ${pendingClaims.length} pending claims for slug=${args.merchantSlug}`);

    // Layer 1: Receipt number match — check if stored referenceNumber appears in email body
    if (args.receiptNumber || args.emailBody) {
      const byReceipt = pendingClaims.filter((c) => {
        if (!c.referenceNumber) return false;
        // Check if claim's receipt number appears in email body OR matches extracted number
        if (args.emailBody && args.emailBody.includes(c.referenceNumber)) return true;
        if (args.receiptNumber && c.referenceNumber === args.receiptNumber) return true;
        // Also try: email body contains the receipt number as substring
        if (args.receiptNumber && c.referenceNumber.includes(args.receiptNumber)) return true;
        return false;
      });
      if (byReceipt.length === 1) {
        console.log(`[FuzzyMatch] Layer 1 (receipt#): matched claim ${byReceipt[0]._id}`);
        return await formatClaimResultWithEmail(ctx, byReceipt[0]);
      }
      if (byReceipt.length > 1) {
        console.log(`[FuzzyMatch] Layer 1: ${byReceipt.length} matches — too ambiguous, trying next layer`);
      }
    }

    // Layer 2: Date + amount match
    if (args.transactionDate && args.totalAmount !== undefined) {
      const byDateAmount = pendingClaims.filter((c) => {
        const dateMatch = c.transactionDate === args.transactionDate;
        const amountMatch = c.totalAmount !== undefined
          && Math.abs((c.totalAmount as number) - args.totalAmount!) < 0.02;
        return dateMatch && amountMatch;
      });
      if (byDateAmount.length === 1) {
        console.log(`[FuzzyMatch] Layer 2 (date+amount): matched claim ${byDateAmount[0]._id}`);
        return await formatClaimResultWithEmail(ctx, byDateAmount[0]);
      }
    }

    // Layer 3: Only one pending claim for this merchant → it's the match
    if (pendingClaims.length === 1) {
      console.log(`[FuzzyMatch] Layer 3 (single pending): matched claim ${pendingClaims[0]._id}`);
      return await formatClaimResultWithEmail(ctx, pendingClaims[0]);
    }

    console.log(`[FuzzyMatch] No unique match found — ${pendingClaims.length} candidates remain`);
    return null;
  },
});

async function formatClaimResultWithEmail(ctx: any, claim: { _id: any; businessId: any; userId: any }) {
  const user = await ctx.db.get(claim.userId);
  return {
    claimId: claim._id as string,
    businessId: claim.businessId as string,
    userId: claim.userId as string,
    userEmail: user?.email || null,
    storagePath: `${claim.businessId}/${claim.userId}/${claim._id}`,
  };
}

/**
 * Helper: Parse email ref from einvoice+XXX@einv.hellogroot.com address
 */
function parseEmailRef(email: string): string | null {
  const match = email.match(/einvoice\+([^@]+)@/i);
  return match ? match[1] : null;
}

export const processLhdnReceivedDocuments = mutation({
  args: {
    businessId: v.string(),
    documents: v.array(v.object({
      uuid: v.string(),
      submissionUID: v.optional(v.string()),
      longId: v.optional(v.string()),
      internalId: v.optional(v.string()),
      supplierTin: v.optional(v.string()),
      supplierName: v.optional(v.string()),
      buyerTin: v.optional(v.string()),
      buyerEmail: v.optional(v.string()),
      total: v.optional(v.number()),
      dateTimeIssued: v.optional(v.string()),
      status: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      console.error(`[LHDN Process] Business not found: ${args.businessId}`);
      return { success: false, processed: 0 };
    }

    let processed = 0;

    for (const doc of args.documents) {
      try {
        // Dedup: check if document already exists
        const existing = await ctx.db
          .query("einvoice_received_documents")
          .withIndex("by_lhdnDocumentUuid", (q: any) => q.eq("lhdnDocumentUuid", doc.uuid))
          .first();

        if (existing) {
          // Check for status changes (e.g., cancellation)
          const newStatus = doc.status?.toLowerCase() === "cancelled" ? "cancelled" : "valid";
          if (existing.status !== newStatus) {
            await ctx.db.patch(existing._id, {
              status: newStatus as "valid" | "cancelled",
              processedAt: Date.now(),
            });

            if (newStatus === "cancelled" && existing.matchedExpenseClaimId) {
              const claim = await resolveById(ctx.db, "expense_claims", existing.matchedExpenseClaimId as string);
              if (claim) {
                await ctx.db.patch(claim._id, {
                  lhdnReceivedStatus: "cancelled",
                  updatedAt: Date.now(),
                });
              }
            }
          }
          continue;
        }

        // 4-tier matching
        const matchResult = await runDocumentMatching(ctx.db, business._id, doc);

        // Store received document
        await ctx.db.insert("einvoice_received_documents", {
          businessId: business._id,
          lhdnDocumentUuid: doc.uuid,
          lhdnSubmissionUid: doc.submissionUID,
          lhdnLongId: doc.longId,
          lhdnInternalId: doc.internalId,
          supplierTin: doc.supplierTin,
          supplierName: doc.supplierName,
          buyerTin: doc.buyerTin || (business.lhdnTin as string),
          buyerEmail: doc.buyerEmail,
          total: doc.total,
          dateTimeIssued: doc.dateTimeIssued,
          status: (doc.status?.toLowerCase() === "cancelled" ? "cancelled" : "valid") as "valid" | "cancelled",
          matchedExpenseClaimId: matchResult.matchedClaimId,
          matchTier: matchResult.tier as "tier1_email" | "tier1_5_reference" | "tier2_tin_amount" | "tier3_fuzzy" | "manual" | undefined,
          matchConfidence: matchResult.confidence,
          matchCandidateClaimIds: matchResult.candidateClaimIds,
          processedAt: Date.now(),
          rawDocumentSnapshot: {
            uuid: doc.uuid,
            submissionUID: doc.submissionUID,
            longId: doc.longId,
            buyerEmail: doc.buyerEmail,
          },
        });

        // If matched, update expense claim + notify
        if (matchResult.matchedClaimId) {
          const claimId = matchResult.matchedClaimId as Id<"expense_claims">;
          const claim = await ctx.db.get(claimId);
          if (claim && claim.lhdnReceivedDocumentUuid !== doc.uuid) {
            await ctx.db.patch(claim._id, {
              einvoiceRequestStatus: "received",
              einvoiceAttached: true,
              lhdnReceivedDocumentUuid: doc.uuid,
              lhdnReceivedLongId: doc.longId,
              lhdnReceivedStatus: "valid",
              lhdnReceivedAt: Date.now(),
              einvoiceReceivedAt: Date.now(),
              updatedAt: Date.now(),
            });

            await ctx.db.insert("notifications", {
              recipientUserId: claim.userId,
              businessId: business._id,
              type: "compliance",
              severity: "info",
              title: "E-Invoice Received",
              body: `An e-invoice from ${doc.supplierName || "merchant"} has been matched to your expense claim.`,
              resourceType: "expense_claim",
              resourceId: claimId as string,
              sourceEvent: `einvoice_attached_${claimId}`,
              status: "unread",
              createdAt: Date.now(),
            });
          }
        }

        // If ambiguous (Tier 3), notify candidates for review
        if (matchResult.candidateClaimIds && matchResult.candidateClaimIds.length > 0) {
          for (const candidateId of matchResult.candidateClaimIds) {
            const candId = candidateId as Id<"expense_claims">;
            const candidateClaim = await ctx.db.get(candId);
            if (candidateClaim) {
              await ctx.db.insert("notifications", {
                recipientUserId: candidateClaim.userId,
                businessId: business._id,
                type: "compliance",
                severity: "info",
                title: "E-Invoice Match Needs Review",
                body: `A received e-invoice from ${doc.supplierName || "merchant"} may match your expense claim. Please review and confirm.`,
                resourceType: "expense_claim",
                resourceId: candId as string,
                sourceEvent: `einvoice_review_${candId}_${doc.uuid}`,
                status: "unread",
                createdAt: Date.now(),
              });
            }
          }
        }

        processed++;
      } catch (docError) {
        console.error(`[LHDN Process] Error processing document ${doc.uuid}:`, docError);
      }
    }

    console.log(`[LHDN Process] Processed ${processed}/${args.documents.length} documents for ${business.name}`);
    return { success: true, processed };
  },
});

/**
 * 4-tier matching algorithm (runs inside mutation for direct DB access)
 */
async function runDocumentMatching(
  db: any,
  businessId: any,
  doc: {
    buyerEmail?: string;
    internalId?: string;
    supplierTin?: string;
    supplierName?: string;
    total?: number;
    dateTimeIssued?: string;
  }
): Promise<{
  matchedClaimId?: any;
  tier?: string;
  confidence?: number;
  candidateClaimIds?: any[];
}> {
  // Tier 1: Deterministic match via buyer email + suffix
  if (doc.buyerEmail) {
    const emailRef = parseEmailRef(doc.buyerEmail);
    if (emailRef) {
      const claim = await db
        .query("expense_claims")
        .withIndex("by_einvoiceEmailRef", (q: any) => q.eq("einvoiceEmailRef", emailRef))
        .first();
      if (claim) {
        console.log(`[LHDN Match] Tier 1: emailRef=${emailRef} -> claim ${claim._id}`);
        return { matchedClaimId: claim._id, tier: "tier1_email", confidence: 1.0 };
      }
    }
  }

  // Tier 1.5: Match by merchant's reference number
  if (doc.internalId) {
    const claims = await db
      .query("expense_claims")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .collect();

    const refMatch = claims.find(
      (c: any) =>
        c.referenceNumber === doc.internalId &&
        !c.deletedAt &&
        (c.einvoiceRequestStatus === "requesting" || c.einvoiceRequestStatus === "requested")
    );
    if (refMatch) {
      console.log(`[LHDN Match] Tier 1.5: ref=${doc.internalId} -> claim ${refMatch._id}`);
      return { matchedClaimId: refMatch._id, tier: "tier1_5_reference", confidence: 0.95 };
    }
  }

  // Tier 2: High confidence via supplierTin + total + date (±1 day)
  if (doc.supplierTin && doc.total && doc.dateTimeIssued) {
    const docDate = new Date(doc.dateTimeIssued);
    const dayBefore = new Date(docDate.getTime() - 86400000);
    const dayAfter = new Date(docDate.getTime() + 86400000);

    const claims = await db
      .query("expense_claims")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .collect();

    const tier2 = claims.filter((c: any) => {
      if (c.deletedAt || c.einvoiceAttached) return false;
      if (c.totalAmount !== doc.total) return false;
      if (c.transactionDate) {
        const claimDate = new Date(c.transactionDate);
        if (claimDate < dayBefore || claimDate > dayAfter) return false;
      }
      return true;
    });

    if (tier2.length === 1) {
      console.log(`[LHDN Match] Tier 2: TIN+amount+date -> claim ${tier2[0]._id}`);
      return { matchedClaimId: tier2[0]._id, tier: "tier2_tin_amount", confidence: 0.85 };
    }
  }

  // Tier 3: Fuzzy via amount + date → flag for review
  if (doc.total && doc.dateTimeIssued) {
    const docDate = new Date(doc.dateTimeIssued);
    const dayBefore = new Date(docDate.getTime() - 86400000);
    const dayAfter = new Date(docDate.getTime() + 86400000);

    const claims = await db
      .query("expense_claims")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", businessId))
      .collect();

    const tier3 = claims.filter((c: any) => {
      if (c.deletedAt || c.einvoiceAttached) return false;
      if (c.totalAmount !== doc.total) return false;
      if (c.transactionDate) {
        const claimDate = new Date(c.transactionDate);
        if (claimDate < dayBefore || claimDate > dayAfter) return false;
      }
      return true;
    });

    if (tier3.length > 0) {
      console.log(`[LHDN Match] Tier 3: ${tier3.length} candidates for review`);
      return {
        tier: "tier3_fuzzy",
        confidence: 0.5,
        candidateClaimIds: tier3.map((c: any) => c._id),
      };
    }
  }

  return {};
}

// ============================================
// MERCHANT E-INVOICE URL LOOKUP (system-wide)
// ============================================

/**
 * Look up a merchant's e-invoice URL by vendor name.
 * Called by document processor Lambda when QR and OCR detection both fail.
 * System-wide table — not per-tenant, scoped by country.
 */
export const lookupMerchantEinvoiceUrl = query({
  args: {
    vendorName: v.string(),
    country: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const country = args.country || "MY";
    const vendorLower = args.vendorName.toLowerCase().trim();

    // Get all active merchants for this country
    const merchants = await ctx.db
      .query("merchant_einvoice")
      .withIndex("by_country", (q) => q.eq("country", country).eq("isActive", true))
      .collect();

    // Fuzzy match: check if any matchPattern is a substring of vendorName or vice versa
    for (const m of merchants) {
      for (const pattern of m.matchPatterns) {
        if (vendorLower.includes(pattern) || pattern.includes(vendorLower)) {
          return {
            merchantName: m.merchantName,
            einvoiceUrl: m.einvoiceUrl,
            urlType: m.urlType,
            notes: m.notes,
            formConfig: m.formConfig || null,
          };
        }
      }
    }
    return null;
  },
});

/**
 * Upsert a merchant e-invoice URL entry.
 * Used by: admin UI, browser agent (after Google search discovery), seed script.
 */
// One-time migration: merchant_einvoice_urls → merchant_einvoice
export const migrateMerchantTable = internalMutation({
  args: {},
  handler: async (ctx) => {
    const oldRows = await ctx.db.query("merchant_einvoice_urls" as any).collect();
    let migrated = 0;
    for (const row of oldRows) {
      const { _id, _creationTime, ...data } = row;
      // Check if already exists in new table
      const existing = await ctx.db
        .query("merchant_einvoice")
        .withIndex("by_merchantName", (q: any) => q.eq("merchantName", data.merchantName))
        .first();
      if (!existing) {
        await ctx.db.insert("merchant_einvoice", data as any);
        migrated++;
      }
      // Delete from old table
      await ctx.db.delete(_id);
    }
    console.log(`[Migration] Migrated ${migrated} merchants, deleted ${oldRows.length} old rows`);
    return { migrated, deleted: oldRows.length };
  },
});

export const upsertMerchantEinvoiceUrl = mutation({
  args: {
    merchantName: v.string(),
    matchPatterns: v.array(v.string()),
    einvoiceUrl: v.string(),
    country: v.optional(v.string()),
    urlType: v.optional(v.union(v.literal("static"), v.literal("dynamic"))),
    source: v.optional(v.union(v.literal("manual"), v.literal("agent_discovered"))),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const country = args.country || "MY";

    // Check if merchant already exists by name
    const existing = await ctx.db
      .query("merchant_einvoice")
      .withIndex("by_merchantName", (q) => q.eq("merchantName", args.merchantName))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        matchPatterns: args.matchPatterns,
        einvoiceUrl: args.einvoiceUrl,
        urlType: args.urlType || existing.urlType,
        source: args.source || existing.source,
        notes: args.notes ?? existing.notes,
        lastVerifiedAt: Date.now(),
      });
      return { id: existing._id, action: "updated" };
    }

    const id = await ctx.db.insert("merchant_einvoice", {
      merchantName: args.merchantName,
      matchPatterns: args.matchPatterns,
      einvoiceUrl: args.einvoiceUrl,
      country,
      urlType: args.urlType || "static",
      isActive: true,
      source: args.source || "manual",
      lastVerifiedAt: Date.now(),
    });
    return { id, action: "created" };
  },
});

/**
 * Save learned form config for a merchant (after successful submission or troubleshooter investigation).
 * Called by: form fill Lambda (on success) or troubleshooter agent (after fixing a failure).
 * This enables Tier 1 (fast Playwright-only) execution for subsequent submissions.
 */
export const saveMerchantFormConfig = mutation({
  args: {
    merchantName: v.string(),
    formConfig: v.object({
      fields: v.array(v.object({
        label: v.string(),
        selector: v.string(),
        type: v.union(v.literal("text"), v.literal("select"), v.literal("radix_select"), v.literal("radio"), v.literal("checkbox")),
        buyerDetailKey: v.optional(v.string()),
        defaultValue: v.optional(v.string()),
        required: v.boolean(),
      })),
      submitSelector: v.optional(v.string()),
      consentSelector: v.optional(v.string()),
      cuaHints: v.optional(v.string()),
      successCount: v.optional(v.number()),
      lastFailureReason: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const merchant = await ctx.db
      .query("merchant_einvoice")
      .withIndex("by_merchantName", (q) => q.eq("merchantName", args.merchantName))
      .first();

    if (!merchant) {
      console.log(`[System] saveMerchantFormConfig: merchant "${args.merchantName}" not found`);
      return { success: false, reason: "merchant_not_found" };
    }

    // Merge with existing config — increment successCount
    const existingCount = merchant.formConfig?.successCount || 0;
    await ctx.db.patch(merchant._id, {
      formConfig: {
        ...args.formConfig,
        successCount: existingCount + 1,
      },
      lastVerifiedAt: Date.now(),
    });

    console.log(`[System] Saved formConfig for "${args.merchantName}" (${args.formConfig.fields.length} fields, success #${existingCount + 1})`);
    return { success: true, successCount: existingCount + 1 };
  },
});

// ============================================
// SES EMAIL VERIFICATION (019-lhdn-einv-flow-2)
// ============================================

/**
 * Mark a user's email as SES-verified.
 * Called by the verify-email API route after confirming with SES.
 */
export const markSesEmailVerified = mutation({
  args: {
    email: v.string(),
    verified: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    if (!user) {
      console.log(`[System] markSesEmailVerified: user not found for email ${args.email}`);
      return { success: false, reason: "user_not_found" };
    }

    await ctx.db.patch(user._id, {
      sesEmailVerified: args.verified,
      updatedAt: Date.now(),
    });

    console.log(`[System] SES email verified=${args.verified} for ${args.email}`);
    return { success: true };
  },
});

/**
 * Check if a user's email is SES-verified.
 * Called by the einvoice-email-processor Lambda before forwarding.
 */
export const isSesEmailVerified = query({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();

    return { verified: user?.sesEmailVerified === true };
  },
});

// ============================================
// DSPY EVALUATION & HINT EFFECTIVENESS (001-dspy-cua-optimization)
// ============================================

/**
 * Get per-merchant e-invoice metrics for evaluation dashboard.
 * Aggregates einvoice_request_logs by merchantName.
 */
export const getEinvoiceMetricsByMerchant = query({
  args: {
    businessId: v.optional(v.id("businesses")),
    minAttempts: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let logs = await ctx.db.query("einvoice_request_logs").collect();

    if (args.businessId) {
      logs = logs.filter((l) => l.businessId === args.businessId);
    }

    // Group by merchantName
    const byMerchant: Record<string, typeof logs> = {};
    for (const log of logs) {
      const name = log.merchantName || "unknown";
      if (!byMerchant[name]) byMerchant[name] = [];
      byMerchant[name].push(log);
    }

    const minAttempts = args.minAttempts ?? 1;
    const results = [];

    for (const [merchant, merchantLogs] of Object.entries(byMerchant)) {
      if (merchantLogs.length < minAttempts) continue;

      const completed = merchantLogs.filter((l) => l.status === "success" || l.status === "failed");
      const successes = completed.filter((l) => l.status === "success");
      const successRate = completed.length > 0 ? successes.length / completed.length : 0;

      // Tier distribution
      const tierDist: Record<string, number> = {};
      for (const log of completed) {
        const tier = log.tierReached || "unknown";
        tierDist[tier] = (tierDist[tier] || 0) + 1;
      }

      // Average cost
      const costs = completed
        .map((l) => l.cost?.totalCostUsd)
        .filter((c): c is number => c !== undefined && c !== null);
      const avgCost = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;

      // Average duration
      const durations = completed
        .map((l) => l.durationMs)
        .filter((d): d is number => d !== undefined && d !== null);
      const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

      // Hint effectiveness
      const hintsWithOutcome = merchantLogs.filter(
        (l) => l.hintEffectivenessOutcome === "helped" || l.hintEffectivenessOutcome === "not_helped"
      );
      const hintsHelped = hintsWithOutcome.filter((l) => l.hintEffectivenessOutcome === "helped");
      const hintEffectivenessRate = hintsWithOutcome.length > 0
        ? hintsHelped.length / hintsWithOutcome.length
        : null;

      // Failure categories
      const failureCats: Record<string, number> = {};
      for (const log of completed.filter((l) => l.status === "failed")) {
        const cat = log.failureCategory || "unknown";
        failureCats[cat] = (failureCats[cat] || 0) + 1;
      }

      // Confidence gate accuracy
      const gatedLogs = merchantLogs.filter((l) => l.confidenceGateDecision);
      const correctPredictions = gatedLogs.filter((l) => {
        if (l.confidenceGateDecision === "proceed" && l.tierReached === "tier1" && l.status === "success") return true;
        if (l.confidenceGateDecision === "skip" && (l.tierReached !== "tier1" || l.status === "failed")) return true;
        return false;
      });
      const gateAccuracy = gatedLogs.length > 0 ? correctPredictions.length / gatedLogs.length : null;

      results.push({
        merchantName: merchant,
        totalAttempts: merchantLogs.length,
        completedAttempts: completed.length,
        successRate: Math.round(successRate * 100),
        avgCostUsd: Math.round(avgCost * 100) / 100,
        avgDurationMs: Math.round(avgDuration),
        tierDistribution: tierDist,
        hintEffectivenessRate: hintEffectivenessRate !== null ? Math.round(hintEffectivenessRate * 100) : null,
        failureCategoryBreakdown: failureCats,
        confidenceGateAccuracy: gateAccuracy !== null ? Math.round(gateAccuracy * 100) : null,
      });
    }

    // Sort by total attempts descending
    results.sort((a, b) => b.totalAttempts - a.totalAttempts);
    return results;
  },
});

/**
 * Update hint effectiveness for a merchant's most recent pending hint.
 * Called at the START of each new form fill attempt to close the feedback loop.
 */
export const updateHintEffectiveness = internalMutation({
  args: {
    merchantName: v.string(),
    currentAttemptSucceeded: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Find the most recent log with hintEffectivenessOutcome="pending" for this merchant
    const logs = await ctx.db
      .query("einvoice_request_logs")
      .withIndex("by_merchantName_status")
      .collect();

    const pendingHintLog = logs
      .filter(
        (l) =>
          l.merchantName === args.merchantName &&
          l.hintEffectivenessOutcome === "pending" &&
          l.generatedHint
      )
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))[0];

    if (!pendingHintLog) {
      return { updated: false, reason: "no_pending_hint" };
    }

    await ctx.db.patch(pendingHintLog._id, {
      hintEffectivenessOutcome: args.currentAttemptSucceeded ? "helped" : "not_helped",
    });

    console.log(
      `[DSPy] Hint effectiveness updated: merchant=${args.merchantName}, ` +
      `hint="${pendingHintLog.generatedHint?.substring(0, 50)}...", ` +
      `outcome=${args.currentAttemptSucceeded ? "helped" : "not_helped"}`
    );

    return { updated: true, outcome: args.currentAttemptSucceeded ? "helped" : "not_helped" };
  },
});

/**
 * Raw training data for DSPy optimization pipeline.
 * Returns hint-effectiveness pairs (for MIPROv2) and recon-success pairs (for BootstrapFewShot).
 * Called by the DSPy optimizer Lambda (EventBridge, every 3 days).
 */
export const getEinvoiceRawTrainingData = query({
  args: {
    minAttempts: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const allLogs = await ctx.db.query("einvoice_request_logs").collect();

    // ── Hint-effectiveness pairs (for MIPROv2 troubleshooter optimization) ──
    // Find logs with generatedHint + resolved outcome (helped/not_helped)
    const hintPairs: Array<{
      merchantName: string;
      errorMessage: string;
      screenshotDescription: string;
      previousHints: string;
      tierReached: string;
      generatedHint: string;
      nextAttemptSucceeded: boolean;
      createdAt: number;
    }> = [];

    const resolvedHintLogs = allLogs.filter(
      (l) => l.generatedHint && (l.hintEffectivenessOutcome === "helped" || l.hintEffectivenessOutcome === "not_helped")
    );

    for (const log of resolvedHintLogs) {
      hintPairs.push({
        merchantName: log.merchantName || "unknown",
        errorMessage: log.errorMessage || "",
        screenshotDescription: "", // Screenshot descriptions are not stored in logs (generated at runtime)
        previousHints: "", // Previous hints context not stored separately
        tierReached: log.tierReached || "tier2",
        generatedHint: log.generatedHint!,
        nextAttemptSucceeded: log.hintEffectivenessOutcome === "helped",
        createdAt: log._creationTime,
      });
    }

    // ── Recon-success pairs (for BootstrapFewShot recon optimization) ──
    // Find successful logs with reconDescription
    const reconPairs: Array<{
      merchantName: string;
      reconDescription: string;
      buyerDetails: string;
      succeeded: boolean;
      cuaTurns: number;
      createdAt: number;
    }> = [];

    const reconLogs = allLogs.filter(
      (l) => l.reconDescription && (l.status === "success" || l.status === "failed")
    );

    for (const log of reconLogs) {
      reconPairs.push({
        merchantName: log.merchantName || "unknown",
        reconDescription: log.reconDescription!,
        buyerDetails: "{}", // Buyer details not stored in logs (privacy)
        succeeded: log.status === "success",
        cuaTurns: log.cuaActions || 50,
        createdAt: log._creationTime,
      });
    }

    console.log(`[DSPy] Training data: ${hintPairs.length} hint pairs, ${reconPairs.length} recon pairs`);

    return { hintPairs, reconPairs };
  },
});

/**
 * DSPy Operations Dashboard — aggregated metrics for admin UI.
 * Returns everything needed to build a "DSPy Intelligence" admin panel:
 * - Per-merchant success rates with failure category breakdown
 * - Gatekeeper accuracy (did Tier 0/0.5 routing lead to success?)
 * - Tier usage distribution (cost optimization view)
 * - Recent failures for new/unknown merchants (needs-attention list)
 * - DSPy module version distribution (baseline vs optimized)
 */
export const getEinvoiceDspyDashboard = query({
  args: {
    businessId: v.optional(v.id("businesses")),
    dayWindow: v.optional(v.number()), // Only include logs from last N days (default: 30)
  },
  handler: async (ctx, args) => {
    let logs = await ctx.db.query("einvoice_request_logs").collect();

    if (args.businessId) {
      logs = logs.filter((l) => l.businessId === args.businessId);
    }

    // Time window filter (default 30 days)
    const windowMs = (args.dayWindow ?? 30) * 86400 * 1000;
    const cutoff = Date.now() - windowMs;
    const recentLogs = logs.filter((l) => (l.startedAt || l._creationTime) > cutoff);
    const completed = recentLogs.filter((l) => l.status === "success" || l.status === "failed");

    // ── 1. Tier Usage Distribution ──
    const tierUsage: Record<string, { count: number; successes: number; avgCostUsd: number }> = {};
    for (const log of completed) {
      const tier = log.tierReached || "unknown";
      if (!tierUsage[tier]) tierUsage[tier] = { count: 0, successes: 0, avgCostUsd: 0 };
      tierUsage[tier].count++;
      if (log.status === "success") tierUsage[tier].successes++;
    }
    // Compute avg cost per tier
    for (const tier of Object.keys(tierUsage)) {
      const tierLogs = completed.filter((l) => (l.tierReached || "unknown") === tier);
      const costs = tierLogs.map((l) => l.cost?.totalCostUsd).filter((c): c is number => c != null);
      tierUsage[tier].avgCostUsd = costs.length > 0
        ? Math.round((costs.reduce((a, b) => a + b, 0) / costs.length) * 10000) / 10000
        : 0;
    }

    // ── 2. Failure Category Breakdown ──
    const failedLogs = completed.filter((l) => l.status === "failed");
    const failureCategories: Record<string, { count: number; merchants: string[] }> = {};
    for (const log of failedLogs) {
      const cat = log.failureCategory || "unknown";
      if (!failureCategories[cat]) failureCategories[cat] = { count: 0, merchants: [] };
      failureCategories[cat].count++;
      const mn = log.merchantName || "unknown";
      if (!failureCategories[cat].merchants.includes(mn)) {
        failureCategories[cat].merchants.push(mn);
      }
    }

    // ── 3. Gatekeeper Accuracy ──
    const gatedLogs = completed.filter((l) => l.confidenceGateDecision);
    const gatekeeperStats = {
      totalGated: gatedLogs.length,
      proceedSucceeded: gatedLogs.filter(
        (l) => l.confidenceGateDecision === "proceed" && l.status === "success"
      ).length,
      proceedFailed: gatedLogs.filter(
        (l) => l.confidenceGateDecision === "proceed" && l.status === "failed"
      ).length,
      skipCount: gatedLogs.filter((l) => l.confidenceGateDecision === "skip").length,
      avgConfidence: gatedLogs.length > 0
        ? Math.round(
            (gatedLogs
              .map((l) => l.confidenceGateScore || 0)
              .reduce((a, b) => a + b, 0) / gatedLogs.length) * 100
          ) / 100
        : null,
      overconfidentRate: gatedLogs.length > 0
        ? Math.round(
            (gatedLogs.filter(
              (l) => l.confidenceGateDecision === "proceed" && l.status === "failed"
            ).length / Math.max(1, gatedLogs.filter((l) => l.confidenceGateDecision === "proceed").length)) * 100
          )
        : null,
    };

    // ── 4. DSPy Module Version Distribution ──
    const moduleVersions: Record<string, number> = {};
    for (const log of completed) {
      const ver = log.dspyModuleVersion || "untracked";
      moduleVersions[ver] = (moduleVersions[ver] || 0) + 1;
    }

    // ── 5. Needs-Attention: New/Failing Merchants ──
    // Merchants with 0% success (all attempts failed) or first-time failures
    const byMerchant: Record<string, typeof completed> = {};
    for (const log of completed) {
      const mn = log.merchantName || "unknown";
      if (!byMerchant[mn]) byMerchant[mn] = [];
      byMerchant[mn].push(log);
    }

    const needsAttention: Array<{
      merchantName: string;
      attempts: number;
      successRate: number;
      topFailure: string;
      lastFailedAt: number;
      isNewMerchant: boolean;
    }> = [];

    for (const [merchant, merchantLogs] of Object.entries(byMerchant)) {
      const successes = merchantLogs.filter((l) => l.status === "success").length;
      const rate = Math.round((successes / merchantLogs.length) * 100);

      // Flag if: 0% success rate, or <50% with 3+ attempts
      if (rate === 0 || (rate < 50 && merchantLogs.length >= 3)) {
        const failures = merchantLogs.filter((l) => l.status === "failed");
        const cats: Record<string, number> = {};
        for (const f of failures) {
          const c = f.failureCategory || "unknown";
          cats[c] = (cats[c] || 0) + 1;
        }
        const topFailure = Object.entries(cats).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";

        // Check if this is a "new" merchant (all logs within last 7 days)
        const oldestLog = merchantLogs.reduce(
          (min, l) => Math.min(min, l.startedAt || l._creationTime), Infinity
        );
        const isNew = (Date.now() - oldestLog) < 7 * 86400 * 1000;

        needsAttention.push({
          merchantName: merchant,
          attempts: merchantLogs.length,
          successRate: rate,
          topFailure,
          lastFailedAt: failures.reduce(
            (max, l) => Math.max(max, l.completedAt || l._creationTime), 0
          ),
          isNewMerchant: isNew,
        });
      }
    }

    // Sort: new merchants first, then by success rate ascending
    needsAttention.sort((a, b) => {
      if (a.isNewMerchant !== b.isNewMerchant) return a.isNewMerchant ? -1 : 1;
      return a.successRate - b.successRate;
    });

    return {
      period: {
        days: args.dayWindow ?? 30,
        totalAttempts: recentLogs.length,
        completedAttempts: completed.length,
        overallSuccessRate: completed.length > 0
          ? Math.round((completed.filter((l) => l.status === "success").length / completed.length) * 100)
          : 0,
      },
      tierUsage,
      failureCategories,
      gatekeeperStats,
      moduleVersions,
      needsAttention,
    };
  },
});


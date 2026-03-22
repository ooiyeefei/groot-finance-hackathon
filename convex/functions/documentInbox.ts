/**
 * Document Inbox Functions
 *
 * Convex mutations and queries for email-forwarded document inbox.
 * Handles document ingestion, classification, routing, and manual review.
 */

import { v } from "convex/values";
import { mutation, query, internalMutation } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// ============================================================================
// Mutations (called by Lambda email processor)
// ============================================================================

/**
 * Create inbox entry from email forwarding
 * Called by: Lambda email processor after parsing SES email
 */
export const createInboxEntry = internalMutation({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
    fileStorageId: v.id("_storage"),
    originalFilename: v.string(),
    fileHash: v.string(),
    fileSizeBytes: v.number(),
    mimeType: v.union(
      v.literal("application/pdf"),
      v.literal("image/jpeg"),
      v.literal("image/png")
    ),
    sourceType: v.literal("email_forward"),
    s3StagingKey: v.optional(v.string()),
    s3ExpenseClaimsKey: v.optional(v.string()),
    emailMetadata: v.object({
      from: v.string(),
      subject: v.string(),
      body: v.string(),
      receivedAt: v.number(),
      messageId: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    // No duplicate detection at inbox level — inbox is a staging area.
    // Duplicate detection happens downstream at expense claim / invoice processing.
    // Users may delete drafts and re-forward the same document intentionally.
    const archiveEligibleAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
    const deleteEligibleAt = Date.now() + 7 * 365 * 24 * 60 * 60 * 1000; // 7 years

    const inboxEntryId = await ctx.db.insert("document_inbox_entries", {
      businessId: args.businessId,
      userId: args.userId,
      fileStorageId: args.fileStorageId,
      originalFilename: args.originalFilename,
      fileHash: args.fileHash,
      fileSizeBytes: args.fileSizeBytes,
      mimeType: args.mimeType,
      sourceType: args.sourceType,
      s3StagingKey: args.s3StagingKey,
      s3ExpenseClaimsKey: args.s3ExpenseClaimsKey,
      emailMetadata: args.emailMetadata,
      status: "pending_classification",
      isDuplicate: false,
      retryCount: 0,
      archiveEligibleAt,
      deleteEligibleAt,
      updatedAt: Date.now(),
    });

    return {
      inboxEntryId,
      triggerClassification: true,
      isDuplicate: false,
    };
  },
});

/**
 * Update inbox entry status after classification
 * Called by: Trigger.dev classify-document task
 */
export const updateInboxStatus = mutation({
  args: {
    inboxEntryId: v.id("document_inbox_entries"),
    status: v.union(
      v.literal("needs_review"),
      v.literal("routed"),
      v.literal("extraction_failed")
    ),
    aiDetectedType: v.optional(
      v.union(
        v.literal("receipt"),
        v.literal("invoice"),
        v.literal("e_invoice"),
        v.literal("unknown")
      )
    ),
    aiConfidence: v.optional(v.number()),
    aiReasoning: v.optional(v.string()),
    destinationDomain: v.optional(
      v.union(
        v.literal("expense_claims"),
        v.literal("invoices"),
        v.literal("einvoice")
      )
    ),
    destinationRecordId: v.optional(
      v.union(
        v.id("expense_claims"),
        v.id("invoices"),
        v.id("einvoice_received_documents")
      )
    ),
    errorMessage: v.optional(v.string()),
    errorDetails: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { inboxEntryId, ...updates } = args;

    await ctx.db.patch(inboxEntryId, {
      ...updates,
      updatedAt: Date.now(),
    });

    // Determine if user notification is needed
    const shouldNotifyUser =
      args.status === "needs_review" || args.status === "extraction_failed";

    return {
      success: true,
      shouldNotifyUser,
    };
  },
});

// ============================================================================
// Queries (called by frontend)
// ============================================================================

/**
 * Auto-route a document when AI classification has high confidence.
 * Called by: Lambda email processor (no auth — system-level operation).
 * Creates expense claim (receipt) or marks for invoice processing.
 */
export const autoRouteDocument = mutation({
  args: {
    inboxEntryId: v.id("document_inbox_entries"),
    classifiedType: v.union(v.literal("receipt"), v.literal("invoice")),
    aiConfidence: v.number(),
    aiReasoning: v.string(),
  },
  handler: async (ctx, args) => {
    const inboxEntry = await ctx.db.get(args.inboxEntryId);
    if (!inboxEntry) {
      throw new Error("Inbox entry not found");
    }

    let destinationDomain: "expense_claims" | "invoices";
    let destinationRecordId: string | null = null;

    if (args.classifiedType === "receipt") {
      destinationDomain = "expense_claims";

      // Find existing draft submission (same batch logic as manuallyClassifyDocument)
      const allUserSubmissions = await ctx.db
        .query("expense_submissions")
        .withIndex("by_businessId_userId", (q) =>
          q.eq("businessId", inboxEntry.businessId).eq("userId", inboxEntry.userId)
        )
        .collect();

      let submission = allUserSubmissions
        .filter((s) => s.status === "draft" && !s.deletedAt)
        .sort((a, b) => b._creationTime - a._creationTime)[0] as typeof allUserSubmissions[0] | undefined;

      if (!submission) {
        const now = new Date();
        const title = `Email Forwarded - ${now.toLocaleString("en-US", { month: "short", day: "numeric" })} ${now.getFullYear()}`;
        const submissionId = await ctx.db.insert("expense_submissions", {
          businessId: inboxEntry.businessId,
          userId: inboxEntry.userId,
          title,
          status: "draft",
          updatedAt: Date.now(),
        });
        submission = (await ctx.db.get(submissionId))!;
      }

      const storagePath = inboxEntry.s3ExpenseClaimsKey || String(inboxEntry.fileStorageId);

      const claimId = await ctx.db.insert("expense_claims", {
        businessId: inboxEntry.businessId,
        userId: inboxEntry.userId,
        submissionId: submission._id,
        businessPurpose: `Forwarded: ${inboxEntry.emailMetadata.subject || inboxEntry.originalFilename}`,
        storagePath,
        fileName: inboxEntry.originalFilename,
        fileType: inboxEntry.mimeType,
        fileSize: inboxEntry.fileSizeBytes,
        status: "draft",
        sourceType: "email_forward",
        sourceEmailMetadata: {
          from: inboxEntry.emailMetadata.from,
          subject: inboxEntry.emailMetadata.subject,
          receivedAt: inboxEntry.emailMetadata.receivedAt,
          messageId: inboxEntry.emailMetadata.messageId,
        },
        updatedAt: Date.now(),
      });

      destinationRecordId = claimId;
    } else {
      destinationDomain = "invoices";
      // Invoice auto-routing: just mark inbox entry, user processes from Invoices page
    }

    // Update inbox entry as auto-routed
    await ctx.db.patch(args.inboxEntryId, {
      status: "routed",
      aiDetectedType: args.classifiedType,
      aiConfidence: args.aiConfidence,
      aiReasoning: args.aiReasoning,
      destinationDomain,
      destinationRecordId: destinationRecordId as any,
      classifiedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return {
      success: true,
      destinationDomain,
      destinationRecordId,
      autoRouted: true,
    };
  },
});

/**
 * Reclassify a document from receipt (expense claim) to invoice.
 * Moves the record, updates inbox entry, and saves a correction for DSPy training.
 * Called by: Frontend reclassify action on expense claims
 */
export const reclassifyDocument = mutation({
  args: {
    expenseClaimId: v.id("expense_claims"),
    newType: v.literal("invoice"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Get the expense claim
    const claim = await ctx.db.get(args.expenseClaimId);
    if (!claim) throw new Error("Expense claim not found");

    // Find the linked inbox entry
    const inboxEntry = await ctx.db
      .query("document_inbox_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", claim.businessId))
      .filter((q) => q.eq(q.field("destinationRecordId"), args.expenseClaimId))
      .first();

    // Get the user
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("clerkUserId"), identity.subject))
      .first();
    if (!user) throw new Error("User not found");

    // Create invoice entry
    const invoiceId = await ctx.db.insert("invoices", {
      businessId: claim.businessId,
      userId: claim.userId,
      fileName: claim.fileName || "unknown",
      fileType: claim.fileType || "image/jpeg",
      fileSize: claim.fileSize || 0,
      storagePath: claim.storagePath || "",
      status: "pending",
      documentDomain: "invoices",
      sourceType: claim.sourceType as any,
      sourceEmailMetadata: claim.sourceEmailMetadata,
      updatedAt: Date.now(),
    });

    // Save correction for DSPy training
    await ctx.db.insert("document_classification_corrections", {
      businessId: claim.businessId,
      inboxEntryId: inboxEntry?._id,
      expenseClaimId: args.expenseClaimId,
      invoiceId: invoiceId,
      originalType: "receipt",
      correctedType: "invoice",
      aiConfidence: inboxEntry?.aiConfidence,
      aiReasoning: inboxEntry?.aiReasoning,
      fileHash: inboxEntry?.fileHash,
      s3Key: inboxEntry?.s3ExpenseClaimsKey,
      mimeType: inboxEntry?.mimeType,
      correctedBy: user._id,
      correctedAt: Date.now(),
      consumed: false,
    });

    // Update inbox entry destination
    if (inboxEntry) {
      await ctx.db.patch(inboxEntry._id, {
        destinationDomain: "invoices",
        destinationRecordId: invoiceId as any,
        updatedAt: Date.now(),
      });
    }

    // Delete the expense claim
    await ctx.db.delete(args.expenseClaimId);

    return {
      success: true,
      newInvoiceId: invoiceId,
      message: "Moved to AP Invoices",
    };
  },
});

/**
 * Get inbox documents for "Needs Review" page
 * Called by: Frontend inbox page
 */
export const getInboxDocuments = query({
  args: {
    businessId: v.id("businesses"),
    status: v.optional(
      v.union(
        v.literal("needs_review"),
        v.literal("extraction_failed"),
        v.literal("archived"),
        v.literal("quarantined")
      )
    ),
    userId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { businessId, status = "needs_review", userId, limit = 50, offset = 0 } = args;

    // Query inbox entries by business + status
    const allDocs = await ctx.db
      .query("document_inbox_entries")
      .withIndex("by_business_status", (q) =>
        q.eq("businessId", businessId).eq("status", status)
      )
      .collect();

    let filteredDocs = allDocs;
    if (userId) {
      filteredDocs = allDocs.filter((doc) => doc.userId === userId);
    }

    // Sort by creation time (newest first)
    filteredDocs.sort((a, b) => b._creationTime - a._creationTime);

    // Apply pagination
    const total = filteredDocs.length;
    const paginatedDocs = filteredDocs.slice(offset, offset + limit);

    return {
      documents: paginatedDocs,
      total,
      hasMore: offset + limit < total,
    };
  },
});

/**
 * Get inbox document by ID
 * Called by: Frontend detail view
 */
export const getInboxDocument = query({
  args: {
    inboxEntryId: v.id("document_inbox_entries"),
  },
  handler: async (ctx, args) => {
    const document = await ctx.db.get(args.inboxEntryId);
    if (!document) {
      throw new Error("Document not found");
    }

    // Get file URL from Convex storage
    const fileUrl = await ctx.storage.getUrl(document.fileStorageId);
    if (!fileUrl) {
      throw new Error("File not found in storage");
    }

    // Get user details
    const user = await ctx.db.get(document.userId);
    if (!user) {
      throw new Error("User not found");
    }

    return {
      document: {
        ...document,
        fileUrl,
      },
      user: {
        _id: user._id,
        name: user.email,  // Users table uses email as display name
        email: user.email,
      },
    };
  },
});

/**
 * Find document by file hash (duplicate detection)
 * Called by: Lambda email processor before classification
 */
export const findDocumentByHash = query({
  args: {
    businessId: v.id("businesses"),
    fileHash: v.string(),
    sinceTimestamp: v.number(),
  },
  handler: async (ctx, args) => {
    // Check document_inbox_entries
    const inboxEntry = await ctx.db
      .query("document_inbox_entries")
      .withIndex("by_business_fileHash", (q) =>
        q.eq("businessId", args.businessId).eq("fileHash", args.fileHash)
      )
      .filter((q) => q.gte(q.field("_creationTime"), args.sinceTimestamp))
      .first();

    if (inboxEntry) {
      return {
        found: true,
        documentType: "inbox_entry" as const,
        documentId: inboxEntry._id,
        createdAt: inboxEntry._creationTime,
        metadata: {
          filename: inboxEntry.originalFilename,
        },
      };
    }

    // Note: expense_claims and invoices don't have fileHash yet
    // For now, return not found - will implement after schema migration
    return {
      found: false,
    };
  },
});

/**
 * Manually classify a document from "Needs Review" inbox
 * Called by: Frontend when user selects document type
 */
export const manuallyClassifyDocument = mutation({
  args: {
    inboxEntryId: v.id("document_inbox_entries"),
    classifiedType: v.union(
      v.literal("receipt"),
      v.literal("invoice"),
      v.literal("e_invoice")
    ),
    classifiedBy: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Get inbox entry
    const inboxEntry = await ctx.db.get(args.inboxEntryId);
    if (!inboxEntry) {
      throw new Error("Document not found");
    }

    // Determine destination
    let destinationDomain: "expense_claims" | "invoices" | "einvoice";
    if (args.classifiedType === "receipt") {
      destinationDomain = "expense_claims";
    } else if (args.classifiedType === "e_invoice") {
      destinationDomain = "einvoice";
    } else {
      destinationDomain = "invoices";
    }

    let destinationRecordId: string | null = null;

    // Route receipt → find/create draft submission → create expense claim
    if (args.classifiedType === "receipt") {
      // Find existing draft submission for this user (uses index for performance)
      // This ensures multiple classifies batch into the same submission
      const allUserSubmissions = await ctx.db
        .query("expense_submissions")
        .withIndex("by_businessId_userId", (q) =>
          q.eq("businessId", inboxEntry.businessId).eq("userId", inboxEntry.userId)
        )
        .collect();

      let submission = allUserSubmissions
        .filter((s) => s.status === "draft" && !s.deletedAt)
        .sort((a, b) => b._creationTime - a._creationTime)[0] as typeof allUserSubmissions[0] | undefined;

      if (!submission) {
        // Create new draft submission
        const now = new Date();
        const title = `Email Forwarded - ${now.toLocaleString("en-US", { month: "short", day: "numeric" })} ${now.getFullYear()}`;
        const submissionId = await ctx.db.insert("expense_submissions", {
          businessId: inboxEntry.businessId,
          userId: inboxEntry.userId,
          title,
          status: "draft",
          updatedAt: Date.now(),
        });
        submission = (await ctx.db.get(submissionId))!;
      }

      // Use the pre-uploaded S3 expense_claims key as storagePath (for CloudFront signed URLs)
      // Falls back to Convex storage ID if S3 key not available (legacy entries)
      const storagePath = inboxEntry.s3ExpenseClaimsKey || String(inboxEntry.fileStorageId);

      // Create expense claim linked to submission
      const claimId = await ctx.db.insert("expense_claims", {
        businessId: inboxEntry.businessId,
        userId: inboxEntry.userId,
        submissionId: submission!._id,
        businessPurpose: `Forwarded: ${inboxEntry.emailMetadata.subject || inboxEntry.originalFilename}`,
        storagePath,
        fileName: inboxEntry.originalFilename,
        fileType: inboxEntry.mimeType,
        fileSize: inboxEntry.fileSizeBytes,
        status: "draft",
        sourceType: "email_forward",
        sourceEmailMetadata: {
          from: inboxEntry.emailMetadata.from,
          subject: inboxEntry.emailMetadata.subject,
          receivedAt: inboxEntry.emailMetadata.receivedAt,
          messageId: inboxEntry.emailMetadata.messageId,
        },
        updatedAt: Date.now(),
      });

      destinationRecordId = claimId;
    }

    // Update inbox entry status
    await ctx.db.patch(args.inboxEntryId, {
      manuallyClassifiedType: args.classifiedType,
      classifiedBy: args.classifiedBy,
      classifiedAt: Date.now(),
      destinationDomain,
      destinationRecordId: destinationRecordId as any,
      status: "routed",
      updatedAt: Date.now(),
    });

    return {
      success: true,
      destinationDomain,
      destinationRecordId,
      message: args.classifiedType === "receipt"
        ? "Receipt added to your expense submission draft"
        : `Document classified as ${args.classifiedType} and routed`,
    };
  },
});

/**
 * Get business configuration by email forwarding prefix
 * Called by: Lambda email processor to validate forwarding requests
 */
export const getBusinessByPrefix = query({
  args: {
    emailForwardingPrefix: v.string(),
  },
  handler: async (ctx, args) => {
    // Try emailForwardingPrefix first, then fall back to slug
    let business = await ctx.db
      .query("businesses")
      .filter((q) =>
        q.eq(q.field("emailForwardingPrefix"), args.emailForwardingPrefix)
      )
      .first();

    if (!business) {
      // Fall back to slug lookup (zero-config: slug is used as prefix)
      business = await ctx.db
        .query("businesses")
        .filter((q) =>
          q.eq(q.field("slug"), args.emailForwardingPrefix)
        )
        .first();
    }

    if (!business) {
      return null;
    }

    // Get the first active admin/manager for this business (for userId)
    const adminMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "active"),
          q.or(
            q.eq(q.field("role"), "admin"),
            q.eq(q.field("role"), "manager")
          )
        )
      )
      .first();

    if (!adminMembership) {
      return null;
    }

    return {
      businessId: business._id,
      userId: adminMembership.userId,
      emailForwardingEnabled: business.emailForwardingEnabled || false,
      emailForwardingAllowlist: business.emailForwardingAllowlist || [],
      businessName: business.name,
      // E-invoice form fill fields (optional — only present if business has LHDN registration)
      lhdnTin: business.lhdnTin || undefined,
      brn: business.businessRegistrationNumber || undefined,
      addressLine1: business.addressLine1 || undefined,
      addressLine2: business.addressLine2 || undefined,
      city: business.city || undefined,
      stateCode: business.stateCode || undefined,
      postalCode: business.postalCode || undefined,
      countryCode: business.countryCode || "MY",
      contactPhone: business.contactPhone || undefined,
      contactEmail: business.contactEmail || undefined,
    };
  },
});

/**
 * Validate sender email against team membership + RBAC
 * Called by: Lambda email processor before processing attachments
 *
 * Returns: { authorized, userId, role, reason }
 * - authorized: true if sender is a team member
 * - role: their business role (for RBAC checks in Lambda)
 * - userId: their Convex user ID (for creating records)
 */
export const validateSender = query({
  args: {
    businessId: v.id("businesses"),
    senderEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedEmail = args.senderEmail.toLowerCase().trim();

    // Find user by email
    const user = await ctx.db
      .query("users")
      .filter((q) => q.eq(q.field("email"), normalizedEmail))
      .first();

    if (!user) {
      return {
        authorized: false,
        reason: `No user account found for ${normalizedEmail}`,
      };
    }

    // Check team membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return {
        authorized: false,
        reason: `${normalizedEmail} is not an active team member of this business`,
      };
    }

    return {
      authorized: true,
      userId: user._id,
      role: membership.role,
      reason: "Team member verified",
    };
  },
});

/**
 * Delete document from inbox (user action)
 * Called by: Frontend when user clicks "Delete" button
 */
export const deleteInboxEntry = mutation({
  args: {
    inboxEntryId: v.id("document_inbox_entries"),
    deletedBy: v.optional(v.id("users")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const inboxEntry = await ctx.db.get(args.inboxEntryId);
    if (!inboxEntry) {
      throw new Error("Document not found");
    }

    // Delete file from Convex storage
    await ctx.storage.delete(inboxEntry.fileStorageId);

    // Delete inbox entry
    await ctx.db.delete(args.inboxEntryId);

    return {
      success: true,
      fileDeleted: true,
    };
  },
});

/**
 * Get inbox statistics for dashboard
 */
/**
 * Get classification corrections for DSPy training
 * Called by: DSPy optimizer Lambda (no auth — system-level query)
 */
export const getClassificationCorrections = query({
  args: {
    sinceTimestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sinceTimestamp = args.sinceTimestamp || 0;

    const corrections = await ctx.db
      .query("document_classification_corrections")
      .withIndex("by_correctedAt")
      .filter((q) => q.gte(q.field("correctedAt"), sinceTimestamp))
      .collect();

    return {
      corrections: corrections.map((c) => ({
        originalType: c.originalType,
        correctedType: c.correctedType,
        aiConfidence: c.aiConfidence,
        aiReasoning: c.aiReasoning,
        fileHash: c.fileHash,
        mimeType: c.mimeType,
        correctedAt: c.correctedAt,
        consumed: c.consumed,
      })),
      totalCount: corrections.length,
    };
  },
});

export const getInboxStats = query({
  args: {
    businessId: v.id("businesses"),
    period: v.optional(
      v.union(v.literal("7d"), v.literal("30d"), v.literal("90d"), v.literal("all"))
    ),
  },
  handler: async (ctx, args) => {
    const { businessId, period = "30d" } = args;

    // Calculate period start timestamp
    const now = Date.now();
    let sinceTimestamp = 0;
    if (period === "7d") sinceTimestamp = now - 7 * 24 * 60 * 60 * 1000;
    else if (period === "30d") sinceTimestamp = now - 30 * 24 * 60 * 60 * 1000;
    else if (period === "90d") sinceTimestamp = now - 90 * 24 * 60 * 60 * 1000;

    // Get all inbox entries for business in period
    const allEntries = await ctx.db
      .query("document_inbox_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", businessId))
      .filter((q) => q.gte(q.field("_creationTime"), sinceTimestamp))
      .collect();

    // Calculate statistics
    const needsReview = allEntries.filter((e) => e.status === "needs_review").length;
    const extractionFailed = allEntries.filter((e) => e.status === "extraction_failed").length;
    const totalProcessed = allEntries.filter((e) => e.status === "routed").length;
    const totalQuarantined = allEntries.filter((e) => e.status === "quarantined").length;

    // Calculate average classification time
    const routedEntries = allEntries.filter((e) => e.status === "routed");
    const avgTime = routedEntries.length > 0
      ? routedEntries.reduce((sum, e) => sum + (e.updatedAt! - e._creationTime), 0) / routedEntries.length / 1000
      : 0;

    // Auto-route rate (confidence >= 0.85)
    const autoRouted = allEntries.filter(
      (e) => e.status === "routed" && e.aiConfidence && e.aiConfidence >= 0.85
    ).length;
    const autoRouteRate = totalProcessed > 0 ? (autoRouted / totalProcessed) * 100 : 0;

    // Manual classification rate
    const manuallyClassified = allEntries.filter((e) => e.manuallyClassifiedType).length;
    const manualClassificationRate = totalProcessed > 0 ? (manuallyClassified / totalProcessed) * 100 : 0;

    // Document type breakdown
    const receipts = allEntries.filter((e) => e.aiDetectedType === "receipt" || e.manuallyClassifiedType === "receipt").length;
    const invoices = allEntries.filter((e) => e.aiDetectedType === "invoice" || e.manuallyClassifiedType === "invoice").length;
    const eInvoices = allEntries.filter((e) => e.aiDetectedType === "e_invoice" || e.manuallyClassifiedType === "e_invoice").length;
    const unknown = allEntries.filter((e) => e.aiDetectedType === "unknown").length;

    return {
      needsReview,
      extractionFailed,
      totalProcessed,
      totalQuarantined,
      averageClassificationTime: Math.round(avgTime),
      autoRouteRate: Math.round(autoRouteRate),
      manualClassificationRate: Math.round(manualClassificationRate),
      documentTypeBreakdown: {
        receipts,
        invoices,
        eInvoices,
        unknown,
      },
      sourceTypeBreakdown: {
        emailForward: allEntries.length,  // All inbox entries are email forwards
        manualUpload: 0,  // Not tracked in inbox
      },
    };
  },
});

/**
 * Expense Claims Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Expense claim CRUD operations
 * - Status transitions with approval workflow
 * - Role-based access control (owner/admin see all, managers see team, employees see own)
 * - Analytics and reporting
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";

// Status values for expense claims
const EXPENSE_CLAIM_STATUSES = [
  "draft",
  "pending",
  "submitted",
  "processing",
  "approved",
  "rejected",
  "reimbursed",
  "failed",
  "uploading",
] as const;

// Role hierarchy for permission checks
const ROLE_HIERARCHY: Record<string, number> = {
  owner: 4,
  admin: 3,
  manager: 2,
  employee: 1,
};

// ============================================
// QUERIES
// ============================================

/**
 * List expense claims with filtering and role-based access
 * - Owners/Admins: See all claims in business
 * - Managers: See their own + their direct reports
 * - Employees: See only their own claims
 */
export const list = query({
  args: {
    businessId: v.string(), // Accepts Convex ID or legacy UUID
    status: v.optional(v.string()),
    userId: v.optional(v.string()), // Accepts Convex ID or legacy UUID
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { claims: [], nextCursor: null };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { claims: [], nextCursor: null };
    }

    // Resolve businessId (supports both Convex ID and legacy UUID)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return { claims: [], nextCursor: null };
    }

    // Get user's membership in this business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { claims: [], nextCursor: null };
    }

    const limit = args.limit ?? 50;
    const role = membership.role;

    // Build base query with business filter
    let claimsQuery = ctx.db
      .query("expense_claims")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id));

    // Collect all claims first, then apply filters
    let claims = await claimsQuery.collect();

    // Apply role-based filtering
    if (role === "employee") {
      // Employees only see their own claims
      claims = claims.filter((claim) => claim.userId === user._id);
    } else if (role === "manager") {
      // Managers see their own + direct reports
      // Get all memberships for business, then filter by managerId in JS
      // (Convex doesn't support .filter() after .withIndex())
      const allMemberships = await ctx.db
        .query("business_memberships")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .collect();

      const directReports = allMemberships.filter((m) => m.managerId === user._id);
      const reportIds = new Set(directReports.map((m) => m.userId));
      reportIds.add(user._id); // Include own claims

      claims = claims.filter((claim) => reportIds.has(claim.userId));
    }
    // Owners and admins see all claims (no additional filtering)

    // Apply status filter
    if (args.status) {
      claims = claims.filter((claim) => claim.status === args.status);
    }

    // Apply user filter (if specified and allowed)
    if (args.userId) {
      // Resolve userId (supports both Convex ID and legacy UUID)
      const filterUser = await resolveById(ctx.db, "users", args.userId);
      if (filterUser) {
        claims = claims.filter((claim) => claim.userId === filterUser._id);
      }
    }

    // Apply date range filter
    if (args.startDate) {
      claims = claims.filter(
        (claim) =>
          claim.transactionDate && claim.transactionDate >= args.startDate!
      );
    }
    if (args.endDate) {
      claims = claims.filter(
        (claim) =>
          claim.transactionDate && claim.transactionDate <= args.endDate!
      );
    }

    // Filter out soft-deleted claims
    claims = claims.filter((claim) => !claim.deletedAt);

    // Sort by creation time (newest first)
    claims.sort((a, b) => b._creationTime - a._creationTime);

    // Apply pagination
    const startIndex = args.cursor ? parseInt(args.cursor, 10) : 0;
    const paginatedClaims = claims.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < claims.length
        ? String(startIndex + limit)
        : null;

    // Enrich with user details
    const enrichedClaims = await Promise.all(
      paginatedClaims.map(async (claim) => {
        const submitter = await ctx.db.get(claim.userId);
        const reviewer = claim.reviewedBy
          ? await ctx.db.get(claim.reviewedBy)
          : null;
        const approver = claim.approvedBy
          ? await ctx.db.get(claim.approvedBy)
          : null;

        return {
          ...claim,
          submitter: submitter
            ? { _id: submitter._id, email: submitter.email, fullName: submitter.fullName }
            : null,
          reviewer: reviewer
            ? { _id: reviewer._id, email: reviewer.email, fullName: reviewer.fullName }
            : null,
          approver: approver
            ? { _id: approver._id, email: approver.email, fullName: approver.fullName }
            : null,
        };
      })
    );

    return {
      claims: enrichedClaims,
      nextCursor,
      totalCount: claims.length,
    };
  },
});

/**
 * Get single expense claim by ID with access control
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
    const claim = await resolveById(ctx.db, "expense_claims", args.id);
    if (!claim || claim.deletedAt) {
      return null;
    }

    // Check access permission
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", claim.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    // Check role-based access
    const role = membership.role;
    if (role === "employee" && claim.userId !== user._id) {
      return null; // Employees can only see their own
    }

    if (role === "manager" && claim.userId !== user._id) {
      // Check if submitter is a direct report
      const submitterMembership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", claim.userId).eq("businessId", claim.businessId)
        )
        .first();

      if (!submitterMembership || submitterMembership.managerId !== user._id) {
        return null; // Manager can only see direct reports
      }
    }

    // Enrich with related data
    const submitter = await ctx.db.get(claim.userId);
    const reviewer = claim.reviewedBy
      ? await ctx.db.get(claim.reviewedBy)
      : null;
    const approver = claim.approvedBy
      ? await ctx.db.get(claim.approvedBy)
      : null;
    const accountingEntry = claim.accountingEntryId
      ? await ctx.db.get(claim.accountingEntryId)
      : null;

    return {
      ...claim,
      submitter: submitter
        ? { _id: submitter._id, email: submitter.email, fullName: submitter.fullName }
        : null,
      reviewer: reviewer
        ? { _id: reviewer._id, email: reviewer.email, fullName: reviewer.fullName }
        : null,
      approver: approver
        ? { _id: approver._id, email: approver.email, fullName: approver.fullName }
        : null,
      accountingEntry,
    };
  },
});

/**
 * Get expense claims pending approval for the current user
 */
export const getPendingApprovals = query({
  args: { businessId: v.string() }, // Accepts Convex ID or legacy UUID
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Resolve businessId (supports both Convex ID and legacy UUID)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    // Get user's membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    // Only managers, admins, and owners can approve
    if (!["owner", "admin", "manager"].includes(membership.role)) {
      return [];
    }

    // Get all claims for business, then filter by status in JS
    // (Convex doesn't support .filter() after .withIndex())
    const allClaims = await ctx.db
      .query("expense_claims")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter by role
    let pendingClaims = allClaims.filter((c) => c.status === "submitted" && !c.deletedAt);

    if (membership.role === "manager") {
      // Managers only see claims from direct reports
      // Get all memberships, then filter by managerId in JS
      // (Convex doesn't support .filter() after .withIndex())
      const allMemberships = await ctx.db
        .query("business_memberships")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .collect();

      const directReports = allMemberships.filter((m) => m.managerId === user._id);
      const reportIds = new Set(directReports.map((m) => m.userId));
      pendingClaims = pendingClaims.filter((c) => reportIds.has(c.userId));
    }

    // Enrich with submitter details
    return await Promise.all(
      pendingClaims.map(async (claim) => {
        const submitter = await ctx.db.get(claim.userId);
        return {
          ...claim,
          submitter: submitter
            ? { _id: submitter._id, email: submitter.email, fullName: submitter.fullName }
            : null,
        };
      })
    );
  },
});

/**
 * Get expense claim analytics for dashboard
 */
export const getAnalytics = query({
  args: {
    businessId: v.string(), // Accepts Convex ID or legacy UUID
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

    // Resolve businessId (supports both Convex ID and legacy UUID)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return null;
    }

    // Verify admin/owner access for analytics
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return null;
    }

    // Get all claims for business
    let claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    claims = claims.filter((c) => !c.deletedAt);

    // Apply date filters
    if (args.startDate) {
      claims = claims.filter(
        (c) => c.transactionDate && c.transactionDate >= args.startDate!
      );
    }
    if (args.endDate) {
      claims = claims.filter(
        (c) => c.transactionDate && c.transactionDate <= args.endDate!
      );
    }

    // Calculate analytics
    const statusCounts: Record<string, number> = {};
    let totalAmount = 0;
    let approvedAmount = 0;
    let pendingAmount = 0;
    const categoryTotals: Record<string, number> = {};

    for (const claim of claims) {
      // Status counts
      statusCounts[claim.status] = (statusCounts[claim.status] || 0) + 1;

      // Amount totals (use home currency amount if available)
      const amount = claim.homeCurrencyAmount ?? claim.totalAmount ?? 0;
      totalAmount += amount;

      if (claim.status === "approved" || claim.status === "reimbursed") {
        approvedAmount += amount;
      }
      if (claim.status === "submitted" || claim.status === "pending") {
        pendingAmount += amount;
      }

      // Category totals
      if (claim.expenseCategory) {
        categoryTotals[claim.expenseCategory] =
          (categoryTotals[claim.expenseCategory] || 0) + amount;
      }
    }

    return {
      totalClaims: claims.length,
      statusCounts,
      totalAmount,
      approvedAmount,
      pendingAmount,
      categoryTotals,
      averageAmount: claims.length > 0 ? totalAmount / claims.length : 0,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new expense claim
 */
export const create = mutation({
  args: {
    businessId: v.string(), // Accepts Convex ID or legacy UUID
    businessPurpose: v.string(),
    description: v.optional(v.string()),
    vendorName: v.optional(v.string()),
    totalAmount: v.optional(v.number()),
    currency: v.optional(v.string()),
    homeCurrency: v.optional(v.string()),
    homeCurrencyAmount: v.optional(v.number()),
    exchangeRate: v.optional(v.number()),
    transactionDate: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    expenseCategory: v.optional(v.string()),
    storagePath: v.optional(v.string()),
    fileName: v.optional(v.string()),
    fileType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("pending"),
        v.literal("submitted"),
        v.literal("uploading")
      )
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    // Resolve businessId (supports both Convex ID and legacy UUID)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Verify membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    const claimId = await ctx.db.insert("expense_claims", {
      businessId: business._id,
      userId: user._id,
      businessPurpose: args.businessPurpose,
      description: args.description,
      vendorName: args.vendorName,
      totalAmount: args.totalAmount,
      currency: args.currency,
      homeCurrency: args.homeCurrency,
      homeCurrencyAmount: args.homeCurrencyAmount,
      exchangeRate: args.exchangeRate,
      transactionDate: args.transactionDate,
      referenceNumber: args.referenceNumber,
      expenseCategory: args.expenseCategory,
      storagePath: args.storagePath,
      fileName: args.fileName,
      fileType: args.fileType,
      fileSize: args.fileSize,
      status: args.status ?? "draft",
      updatedAt: Date.now(),
    });

    return claimId;
  },
});

/**
 * Update expense claim
 * Handles field updates and status transitions
 */
export const update = mutation({
  args: {
    id: v.string(),
    businessPurpose: v.optional(v.string()),
    description: v.optional(v.string()),
    vendorName: v.optional(v.string()),
    totalAmount: v.optional(v.number()),
    currency: v.optional(v.string()),
    homeCurrency: v.optional(v.string()),
    homeCurrencyAmount: v.optional(v.number()),
    exchangeRate: v.optional(v.number()),
    transactionDate: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    expenseCategory: v.optional(v.string()),
    storagePath: v.optional(v.string()),
    convertedImagePath: v.optional(v.string()),
    fileName: v.optional(v.string()),
    fileType: v.optional(v.string()),
    fileSize: v.optional(v.number()),
    confidenceScore: v.optional(v.number()),
    processingMetadata: v.optional(v.any()),
    errorMessage: v.optional(v.any()),
    reviewerNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    // Resolve claim
    const claim = await resolveById(ctx.db, "expense_claims", args.id);
    if (!claim || claim.deletedAt) {
      throw new Error("Expense claim not found");
    }

    // Verify membership and ownership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", claim.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    // Only owner of claim can update (unless admin/owner role)
    if (
      claim.userId !== user._id &&
      !["owner", "admin"].includes(membership.role)
    ) {
      throw new Error("Not authorized to update this claim");
    }

    // Can only update draft/pending/submitted claims
    if (["approved", "reimbursed", "rejected"].includes(claim.status)) {
      throw new Error("Cannot update claim in final status");
    }

    const { id, ...updates } = args;
    const updateData: Record<string, unknown> = { updatedAt: Date.now() };

    // Only include provided fields
    if (updates.businessPurpose !== undefined)
      updateData.businessPurpose = updates.businessPurpose;
    if (updates.description !== undefined)
      updateData.description = updates.description;
    if (updates.vendorName !== undefined)
      updateData.vendorName = updates.vendorName;
    if (updates.totalAmount !== undefined)
      updateData.totalAmount = updates.totalAmount;
    if (updates.currency !== undefined) updateData.currency = updates.currency;
    if (updates.homeCurrency !== undefined)
      updateData.homeCurrency = updates.homeCurrency;
    if (updates.homeCurrencyAmount !== undefined)
      updateData.homeCurrencyAmount = updates.homeCurrencyAmount;
    if (updates.exchangeRate !== undefined)
      updateData.exchangeRate = updates.exchangeRate;
    if (updates.transactionDate !== undefined)
      updateData.transactionDate = updates.transactionDate;
    if (updates.referenceNumber !== undefined)
      updateData.referenceNumber = updates.referenceNumber;
    if (updates.expenseCategory !== undefined)
      updateData.expenseCategory = updates.expenseCategory;
    if (updates.storagePath !== undefined)
      updateData.storagePath = updates.storagePath;
    if (updates.convertedImagePath !== undefined)
      updateData.convertedImagePath = updates.convertedImagePath;
    if (updates.fileName !== undefined) updateData.fileName = updates.fileName;
    if (updates.fileType !== undefined) updateData.fileType = updates.fileType;
    if (updates.fileSize !== undefined) updateData.fileSize = updates.fileSize;
    if (updates.confidenceScore !== undefined)
      updateData.confidenceScore = updates.confidenceScore;
    if (updates.processingMetadata !== undefined)
      updateData.processingMetadata = updates.processingMetadata;
    if (updates.errorMessage !== undefined)
      updateData.errorMessage = updates.errorMessage;
    if (updates.reviewerNotes !== undefined)
      updateData.reviewerNotes = updates.reviewerNotes;

    await ctx.db.patch(claim._id, updateData);
    return claim._id;
  },
});

/**
 * Update expense claim status with workflow logic
 */
export const updateStatus = mutation({
  args: {
    id: v.string(),
    status: v.union(
      v.literal("draft"),
      v.literal("pending"),
      v.literal("submitted"),
      v.literal("processing"),
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("reimbursed"),
      v.literal("failed"),
      v.literal("uploading")
    ),
    reviewerNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    const claim = await resolveById(ctx.db, "expense_claims", args.id);
    if (!claim || claim.deletedAt) {
      throw new Error("Expense claim not found");
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", claim.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    const role = membership.role;
    const now = Date.now();
    const updateData: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };

    // Status transition logic
    switch (args.status) {
      case "submitted":
        // Only claim owner can submit
        if (claim.userId !== user._id) {
          throw new Error("Only claim owner can submit");
        }
        updateData.submittedAt = now;
        break;

      case "approved":
        // Only managers/admins/owners can approve
        if (!["owner", "admin", "manager"].includes(role)) {
          throw new Error("Not authorized to approve");
        }
        // Managers/admins/owners can self-approve when they are the designated approver
        // This handles small company scenarios where the manager is the only approver
        // The routing logic (findNextApprover) already tries to find a different approver first
        updateData.approvedBy = user._id;
        updateData.approvedAt = now;
        if (args.reviewerNotes) {
          updateData.reviewerNotes = args.reviewerNotes;
        }

        // ✅ IFRS COMPLIANCE: Create accounting entry when expense claim is approved
        // Only approved expense claims create accounting entries (general ledger)
        {
          // Get the business to fetch homeCurrency if not set on claim
          const business = await ctx.db.get(claim.businessId);
          const homeCurrency = claim.homeCurrency || business?.homeCurrency || "SGD";

          // Validate required fields for accounting entry
          if (!claim.totalAmount || !claim.currency || !claim.transactionDate) {
            throw new Error("Cannot approve claim: missing required financial data (amount, currency, or date)");
          }

          // Create the accounting entry
          const accountingEntryId = await ctx.db.insert("accounting_entries", {
            businessId: claim.businessId,
            userId: claim.userId,
            transactionType: "Expense",
            description: claim.businessPurpose || claim.description || "Expense claim",
            originalAmount: claim.totalAmount,
            originalCurrency: claim.currency,
            homeCurrency: homeCurrency,
            homeCurrencyAmount: claim.homeCurrencyAmount || claim.totalAmount,
            exchangeRate: claim.exchangeRate || 1,
            transactionDate: claim.transactionDate,
            category: claim.expenseCategory,
            vendorName: claim.vendorName,
            referenceNumber: claim.referenceNumber,
            status: "pending",
            createdByMethod: "document_extract",
            sourceRecordId: claim._id,
            sourceDocumentType: "expense_claim",
            processingMetadata: claim.processingMetadata,
            updatedAt: now,
          });

          // Link the accounting entry back to the expense claim
          updateData.accountingEntryId = accountingEntryId;

          console.log(`[Convex] Created accounting entry ${accountingEntryId} for approved expense claim ${claim._id}`);
        }
        break;

      case "rejected":
        // Only managers/admins/owners can reject
        if (!["owner", "admin", "manager"].includes(role)) {
          throw new Error("Not authorized to reject");
        }
        updateData.reviewedBy = user._id;
        updateData.rejectedAt = now;
        if (args.reviewerNotes) {
          updateData.reviewerNotes = args.reviewerNotes;
        }
        break;

      case "reimbursed":
        // Only from approved status
        if (claim.status !== "approved") {
          throw new Error("Can only reimburse approved claims");
        }
        // Only admins/owners can mark as reimbursed
        if (!["owner", "admin"].includes(role)) {
          throw new Error("Not authorized to mark as reimbursed");
        }
        updateData.paidAt = now;

        // Update the linked accounting entry status to 'paid'
        if (claim.accountingEntryId) {
          const isoDate = new Date(now).toISOString().split("T")[0];
          await ctx.db.patch(claim.accountingEntryId, {
            status: "paid",
            paymentDate: isoDate,
            updatedAt: now,
          });
          console.log(`[Convex] Updated accounting entry ${claim.accountingEntryId} status to 'paid'`);
        }
        break;

      case "processing":
        updateData.processingStartedAt = now;
        break;

      case "failed":
        updateData.failedAt = now;
        break;
    }

    await ctx.db.patch(claim._id, updateData);
    return claim._id;
  },
});

/**
 * Soft delete expense claim
 */
export const softDelete = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    const claim = await resolveById(ctx.db, "expense_claims", args.id);
    if (!claim || claim.deletedAt) {
      throw new Error("Expense claim not found");
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", claim.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    // Only owner of claim or admin/owner can delete
    if (
      claim.userId !== user._id &&
      !["owner", "admin"].includes(membership.role)
    ) {
      throw new Error("Not authorized to delete this claim");
    }

    // Can't delete approved/reimbursed claims
    if (["approved", "reimbursed"].includes(claim.status)) {
      throw new Error("Cannot delete approved or reimbursed claims");
    }

    await ctx.db.patch(claim._id, {
      deletedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Find the next approver for an expense claim based on manager hierarchy
 */
export const findNextApprover = query({
  args: {
    businessId: v.string(), // Accepts Convex ID or legacy UUID
    submitterId: v.string(), // Accepts Convex ID or legacy UUID
  },
  handler: async (ctx, args) => {
    // Resolve businessId (supports both Convex ID and legacy UUID)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return null;
    }

    // Resolve submitterId (supports both Convex ID and legacy UUID)
    const submitter = await resolveById(ctx.db, "users", args.submitterId);
    if (!submitter) {
      return null;
    }

    // Get submitter's membership to find their manager
    const submitterMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", submitter._id).eq("businessId", business._id)
      )
      .first();

    if (!submitterMembership) {
      return null;
    }

    // If submitter has a manager, they're the next approver
    if (submitterMembership.managerId) {
      const manager = await ctx.db.get(submitterMembership.managerId);
      return manager;
    }

    // Otherwise, find any admin or owner
    // Get all memberships, then filter by role in JS
    // (Convex doesn't support .filter() after .withIndex())
    const allMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const adminMemberships = allMemberships.filter(
      (m) => m.role === "owner" || m.role === "admin"
    );

    // Return first active admin/owner who isn't the submitter
    for (const membership of adminMemberships) {
      if (
        membership.userId !== submitter._id &&
        membership.status === "active"
      ) {
        const approver = await ctx.db.get(membership.userId);
        return approver;
      }
    }

    return null;
  },
});

// ============================================
// REPORT QUERIES (for expense-claims/reports APIs)
// ============================================

/**
 * Get expense report data grouped by category
 * Used by: /api/v1/expense-claims/reports/route.ts
 *
 * RBAC:
 * - Admin: sees all claims in business
 * - Manager: sees own claims + claims they reviewed
 * - Employee: sees only own claims
 */
export const getReportData = query({
  args: {
    businessId: v.string(),
    month: v.string(), // YYYY-MM format
    employeeId: v.optional(v.string()), // Filter by specific employee (manager/admin only)
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

    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return null;
    }

    // Get membership and role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    const role = membership.role;
    const isAdmin = role === "owner" || role === "admin";
    const isManager = role === "manager";

    // Parse month to date range
    const [year, monthNum] = args.month.split("-").map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 1); // First day of next month (exclusive)

    // Get all submitted claims for the business
    let claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter by submittedAt date range
    claims = claims.filter((claim) => {
      if (!claim.submittedAt) return false;
      const submitted = new Date(claim.submittedAt);
      return submitted >= startDate && submitted < endDate;
    });

    // Filter out deleted claims
    claims = claims.filter((claim) => !claim.deletedAt);

    // Apply RBAC filtering
    if (args.employeeId) {
      // Only admin/manager can filter by employee
      if (!isAdmin && !isManager) {
        return { error: "Only managers and admins can filter by employee ID" };
      }
      const filterUser = await resolveById(ctx.db, "users", args.employeeId);
      if (filterUser) {
        claims = claims.filter((claim) => claim.userId === filterUser._id);
      }
    } else {
      if (isAdmin) {
        // Admin sees all claims (no filtering)
      } else if (isManager) {
        // Manager sees own claims + claims they reviewed
        claims = claims.filter(
          (claim) =>
            claim.userId === user._id || claim.reviewedBy === user._id
        );
      } else {
        // Employee sees only own claims
        claims = claims.filter((claim) => claim.userId === user._id);
      }
    }

    // Enrich with employee details
    const enrichedClaims = await Promise.all(
      claims.map(async (claim) => {
        const employee = await ctx.db.get(claim.userId);
        return {
          ...claim,
          employee: employee
            ? {
                _id: employee._id,
                fullName: employee.fullName,
                email: employee.email,
              }
            : null,
        };
      })
    );

    // Group by expense category
    const categoryGroups: Record<
      string,
      {
        claims: typeof enrichedClaims;
        totalAmount: number;
        statusCounts: Record<string, number>;
      }
    > = {};

    for (const claim of enrichedClaims) {
      const category = claim.expenseCategory || "UNCATEGORIZED";

      if (!categoryGroups[category]) {
        categoryGroups[category] = {
          claims: [],
          totalAmount: 0,
          statusCounts: {},
        };
      }

      categoryGroups[category].claims.push(claim);

      // Use home currency amount if available
      const amount = claim.homeCurrencyAmount ?? claim.totalAmount ?? 0;
      categoryGroups[category].totalAmount += amount;

      // Track status counts
      const status = claim.status;
      categoryGroups[category].statusCounts[status] =
        (categoryGroups[category].statusCounts[status] || 0) + 1;
    }

    // Get custom categories from business
    const customCategories = (business.customExpenseCategories as Array<{
      id: string;
      category_name: string;
      description?: string;
    }>) || [];

    // Build category lookup (keyed by id, returns category_name)
    const categoryLookup: Record<string, string> = {};
    for (const cat of customCategories) {
      categoryLookup[cat.id] = cat.category_name;
    }

    return {
      categoryGroups,
      categoryLookup,
      homeCurrency: business.homeCurrency || "SGD",
      totalClaims: enrichedClaims.length,
      role,
    };
  },
});

/**
 * Get formatted report data with detailed claims for PDF generation
 * Used by: /api/v1/expense-claims/reports/formatted/route.ts
 *
 * Filters by transactionDate (when expense occurred) instead of submittedAt
 */
export const getFormattedReportData = query({
  args: {
    businessId: v.string(),
    month: v.string(), // YYYY-MM format
    employeeId: v.optional(v.string()),
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

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return null;
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    const role = membership.role;
    const isAdmin = role === "owner" || role === "admin";
    const isManager = role === "manager";

    // Parse month to date range
    const [year, monthNum] = args.month.split("-").map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 1);
    const startDateStr = startDate.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    // Get claims and filter by transactionDate
    let claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    claims = claims.filter((claim) => {
      if (!claim.transactionDate) return false;
      return claim.transactionDate >= startDateStr && claim.transactionDate < endDateStr;
    });

    claims = claims.filter((claim) => !claim.deletedAt);

    // Apply RBAC filtering
    if (args.employeeId) {
      if (!isAdmin && !isManager) {
        return { error: "Only managers and admins can filter by employee ID" };
      }
      const filterUser = await resolveById(ctx.db, "users", args.employeeId);
      if (filterUser) {
        claims = claims.filter((claim) => claim.userId === filterUser._id);
      }
    } else {
      if (isAdmin) {
        // Admin sees all
      } else if (isManager) {
        claims = claims.filter(
          (claim) =>
            claim.userId === user._id || claim.reviewedBy === user._id
        );
      } else {
        claims = claims.filter((claim) => claim.userId === user._id);
      }
    }

    // Enrich with employee and accounting entry details
    const enrichedClaims = await Promise.all(
      claims.map(async (claim) => {
        const employee = await ctx.db.get(claim.userId);
        const accountingEntry = claim.accountingEntryId
          ? await ctx.db.get(claim.accountingEntryId)
          : null;

        return {
          ...claim,
          employee: employee
            ? {
                _id: employee._id,
                fullName: employee.fullName,
                email: employee.email,
              }
            : null,
          accountingEntry,
        };
      })
    );

    // Get custom categories
    const customCategories = (business.customExpenseCategories as Array<{
      id: string;
      category_name: string;
      accounting_category?: string;
    }>) || [];

    const categoryLookup: Record<string, { name: string; accountingCategory?: string }> = {};
    for (const cat of customCategories) {
      categoryLookup[cat.id] = {
        name: cat.category_name,
        accountingCategory: cat.accounting_category,
      };
    }

    // Group by category for formatted sections (keyed by category id)
    const categorySections: Record<
      string,
      {
        categoryName: string;
        categoryId: string;
        accountingCategory: string;
        claims: typeof enrichedClaims;
        totalAmount: number;
      }
    > = {};

    for (const claim of enrichedClaims) {
      const categoryId = claim.expenseCategory || "UNCATEGORIZED";
      const categoryInfo = categoryLookup[categoryId];

      if (!categorySections[categoryId]) {
        categorySections[categoryId] = {
          categoryName: categoryInfo?.name || "Uncategorized",
          categoryId,
          accountingCategory: categoryInfo?.accountingCategory || "Expenses",
          claims: [],
          totalAmount: 0,
        };
      }

      categorySections[categoryId].claims.push(claim);
      const amount = claim.homeCurrencyAmount ?? claim.totalAmount ?? 0;
      categorySections[categoryId].totalAmount += amount;
    }

    // Calculate totals
    const grandTotal = Object.values(categorySections).reduce(
      (sum, section) => sum + section.totalAmount,
      0
    );

    return {
      sections: Object.values(categorySections),
      header: {
        businessName: business.name,
        reportMonth: args.month,
        generatedAt: new Date().toISOString(),
        homeCurrency: business.homeCurrency || "SGD",
        totalClaims: enrichedClaims.length,
        grandTotal,
      },
      role,
    };
  },
});

/**
 * Get claims for CSV export (batched for streaming)
 * Used by: /api/v1/expense-claims/reports/export/route.ts
 *
 * Returns raw claims data without grouping, for efficient streaming export
 */
export const getExportClaims = query({
  args: {
    businessId: v.string(),
    month: v.string(),
    employeeId: v.optional(v.string()),
    offset: v.optional(v.number()),
    limit: v.optional(v.number()),
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

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return null;
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    const role = membership.role;
    const isAdmin = role === "owner" || role === "admin";
    const isManager = role === "manager";

    // Parse month
    const [year, monthNum] = args.month.split("-").map(Number);
    const startDate = new Date(year, monthNum - 1, 1);
    const endDate = new Date(year, monthNum, 1);

    // Get claims filtered by submittedAt
    let claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    claims = claims.filter((claim) => {
      if (!claim.submittedAt) return false;
      const submitted = new Date(claim.submittedAt);
      return submitted >= startDate && submitted < endDate;
    });

    claims = claims.filter((claim) => !claim.deletedAt);

    // RBAC filtering
    if (args.employeeId) {
      if (!isAdmin && !isManager) {
        return { error: "Permission denied" };
      }
      const filterUser = await resolveById(ctx.db, "users", args.employeeId);
      if (filterUser) {
        claims = claims.filter((claim) => claim.userId === filterUser._id);
      }
    } else {
      if (isAdmin) {
        // All claims
      } else if (isManager) {
        claims = claims.filter(
          (claim) =>
            claim.userId === user._id || claim.reviewedBy === user._id
        );
      } else {
        claims = claims.filter((claim) => claim.userId === user._id);
      }
    }

    // Sort by creation time for consistent pagination
    claims.sort((a, b) => a._creationTime - b._creationTime);

    // Apply pagination
    const offset = args.offset ?? 0;
    const limit = args.limit ?? 500;
    const paginatedClaims = claims.slice(offset, offset + limit);

    // Enrich with employee details
    const enrichedClaims = await Promise.all(
      paginatedClaims.map(async (claim) => {
        const employee = await ctx.db.get(claim.userId);
        return {
          ...claim,
          employee: employee
            ? {
                _id: employee._id,
                fullName: employee.fullName,
                email: employee.email,
              }
            : null,
        };
      })
    );

    // Get custom categories
    const customCategories = (business.customExpenseCategories as Array<{
      id: string;
      category_name: string;
      accounting_category?: string;
    }>) || [];

    const categoryLookup: Record<string, { name: string; accountingCategory?: string }> = {};
    for (const cat of customCategories) {
      categoryLookup[cat.id] = {
        name: cat.category_name,
        accountingCategory: cat.accounting_category,
      };
    }

    return {
      claims: enrichedClaims,
      categoryLookup,
      homeCurrency: business.homeCurrency || "SGD",
      hasMore: offset + limit < claims.length,
      total: claims.length,
      role,
    };
  },
});

// ============================================
// INTERNAL MUTATIONS (for Trigger.dev tasks)
// These bypass user auth - only call from trusted backend
// ============================================

import { internalMutation, internalQuery } from "../_generated/server";

/**
 * Internal: Get expense claim by ID (no auth required)
 * Used by Trigger.dev tasks to fetch claim details
 */
export const internalGetById = internalQuery({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const claim = await resolveById(ctx.db, "expense_claims", args.id);
    if (!claim || claim.deletedAt) {
      return null;
    }
    return claim;
  },
});

/**
 * Internal: Update expense claim status (no auth required)
 * Used by Trigger.dev tasks during receipt processing
 */
export const internalUpdateStatus = internalMutation({
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
    if (args.status === "processing") {
      updateData.processingStartedAt = now;
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
    console.log(`[Convex Internal] Updated expense claim ${args.id} status to: ${args.status}`);
    return claim._id;
  },
});

/**
 * Internal: Update extraction results (no auth required)
 * Used by Trigger.dev after successful receipt extraction
 */
export const internalUpdateExtraction = internalMutation({
  args: {
    id: v.string(),
    extractedData: v.any(),
    confidenceScore: v.optional(v.number()),
    extractionMethod: v.optional(v.string()),
    vendorName: v.optional(v.string()),
    totalAmount: v.optional(v.number()),
    currency: v.optional(v.string()),
    transactionDate: v.optional(v.string()),
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

    await ctx.db.patch(claim._id, updateData);
    console.log(`[Convex Internal] Updated expense claim ${args.id} extraction results`);
    return claim._id;
  },
});

/**
 * Internal: Update classification results (no auth required)
 * Used by Trigger.dev after document classification
 */
export const internalUpdateClassification = internalMutation({
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
    console.log(`[Convex Internal] Updated expense claim ${args.id} classification`);
    return claim._id;
  },
});

/**
 * Internal: Soft delete expense claim (no auth required)
 * Used for admin cleanup of stuck/orphaned records
 */
export const internalSoftDelete = internalMutation({
  args: {
    id: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const claim = await resolveById(ctx.db, "expense_claims", args.id);
    if (!claim) {
      throw new Error(`Expense claim not found: ${args.id}`);
    }

    const now = Date.now();
    await ctx.db.patch(claim._id, {
      deletedAt: now,
      updatedAt: now,
      errorMessage: args.reason || "Admin soft delete",
    });

    console.log(`[Convex Internal] Soft-deleted expense claim ${args.id}`);
    return claim._id;
  },
});

// ============================================
// STUCK RECORDS MONITORING (for admin operations)
// ============================================

/**
 * Get stuck expense claims for monitoring
 * Finds claims in 'analyzing' status older than the timeout threshold
 * Used by: /api/v1/expense-claims/monitor-stuck-records
 */
export const getStuckRecords = query({
  args: {
    businessId: v.string(),
    timeoutThreshold: v.number(), // Unix timestamp - records older than this are stuck
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

    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    // Verify admin/manager role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    if (!["owner", "admin", "manager"].includes(membership.role)) {
      return [];
    }

    const limit = args.limit ?? 50;

    // Get claims in 'analyzing' status
    let claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter for stuck records (analyzing status + older than threshold)
    claims = claims.filter((claim) => {
      if (claim.status !== "processing" && claim.status !== "uploading") {
        // Also check for 'analyzing' which might be a legacy status
        if (claim.status !== "analyzing") {
          return false;
        }
      }

      // Use processingStartedAt or updatedAt to determine if stuck
      const startTime = claim.processingStartedAt || claim.updatedAt || claim._creationTime;
      return startTime < args.timeoutThreshold;
    });

    // Filter out deleted
    claims = claims.filter((claim) => !claim.deletedAt);

    // Limit results
    claims = claims.slice(0, limit);

    return claims.map((claim) => ({
      id: claim._id,
      status: claim.status,
      processingStartedAt: claim.processingStartedAt,
      updatedAt: claim.updatedAt,
      userId: claim.userId,
      vendorName: claim.vendorName,
      totalAmount: claim.totalAmount,
    }));
  },
});

/**
 * Batch update stuck records to failed status
 * Used by: /api/v1/expense-claims/monitor-stuck-records
 */
export const markStuckRecordsFailed = mutation({
  args: {
    businessId: v.string(),
    records: v.array(
      v.object({
        id: v.string(),
        minutesStuck: v.number(),
        errorMetadata: v.any(),
      })
    ),
    actorUserId: v.string(), // User performing the action (for audit)
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Verify admin/manager role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    if (!["owner", "admin", "manager"].includes(membership.role)) {
      throw new Error("Insufficient permissions");
    }

    const now = Date.now();
    const results = {
      fixed: [] as string[],
      failed: [] as { id: string; error: string }[],
    };

    for (const record of args.records) {
      try {
        const claim = await resolveById(ctx.db, "expense_claims", record.id);
        if (!claim) {
          results.failed.push({ id: record.id, error: "Not found" });
          continue;
        }

        // Verify claim belongs to this business
        if (claim.businessId !== business._id) {
          results.failed.push({ id: record.id, error: "Wrong business" });
          continue;
        }

        // Update to failed status
        await ctx.db.patch(claim._id, {
          status: "failed",
          processingMetadata: record.errorMetadata,
          failedAt: now,
          updatedAt: now,
        });

        results.fixed.push(record.id);
      } catch (error) {
        results.failed.push({
          id: record.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    console.log(
      `[Convex] Marked ${results.fixed.length} stuck records as failed`
    );
    return results;
  },
});

/**
 * Force-fail a single expense claim (admin override)
 * Used by: POST /api/v1/expense-claims/monitor-stuck-records
 */
export const forceFailRecord = mutation({
  args: {
    businessId: v.string(),
    claimId: v.string(),
    reason: v.optional(v.string()),
    errorMetadata: v.any(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Verify admin role (only admins can force-fail)
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    if (!["owner", "admin"].includes(membership.role)) {
      throw new Error("Admin role required for manual override");
    }

    // Get the claim
    const claim = await resolveById(ctx.db, "expense_claims", args.claimId);
    if (!claim) {
      throw new Error("Expense claim not found");
    }

    // Verify claim belongs to this business
    if (claim.businessId !== business._id) {
      throw new Error("Expense claim not found in this business");
    }

    const now = Date.now();
    const originalStatus = claim.status;

    // Calculate how long it was stuck
    let minutesStuck = 0;
    if (claim.processingStartedAt) {
      minutesStuck = Math.floor((now - claim.processingStartedAt) / (1000 * 60));
    }

    // Update to failed status
    await ctx.db.patch(claim._id, {
      status: "failed",
      processingMetadata: args.errorMetadata,
      failedAt: now,
      updatedAt: now,
      errorMessage: args.reason || "Manual admin override",
    });

    console.log(
      `[Convex] Admin ${user._id} force-failed expense claim ${args.claimId}`
    );

    return {
      claimId: claim._id,
      originalStatus,
      minutesStuck,
      vendorName: claim.vendorName,
      totalAmount: claim.totalAmount,
    };
  },
});

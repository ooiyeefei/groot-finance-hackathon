/**
 * Expense Claims Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Expense claim CRUD operations
 * - Status transitions with approval workflow
 * - Role-based access control (owner/finance_admin see all, managers see team, employees see own)
 * - Analytics and reporting
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";

// Helper: require finance admin role (owner/finance_admin/manager)
async function requireFinanceAdminForClaims(
  ctx: { db: import("../_generated/server").DatabaseReader; auth: { getUserIdentity: () => Promise<{ subject: string } | null> } },
  businessId: Id<"businesses">
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const user = await resolveUserByClerkId(ctx.db, identity.subject);
  if (!user) throw new Error("User not found");

  const membership = await ctx.db
    .query("business_memberships")
    .withIndex("by_userId_businessId", (q) =>
      q.eq("userId", user._id).eq("businessId", businessId)
    )
    .first();

  if (!membership || membership.status !== "active") {
    throw new Error("Not a member of this business");
  }

  if (!["owner", "finance_admin", "manager"].includes(membership.role)) {
    throw new Error("Not authorized: finance admin required");
  }

  return { user, membership };
}

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
  finance_admin: 3,
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
    personalOnly: v.optional(v.boolean()), // When true, only show current user's own claims regardless of role
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
    if (args.personalOnly || role === "employee") {
      // Personal mode or employees: only show own claims
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
    // Owners and finance_admins see all claims (no additional filtering)

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

    // Only managers, finance_admins, and owners can approve
    if (!["owner", "finance_admin", "manager"].includes(membership.role)) {
      return [];
    }

    // STRICT ROUTING: Only show claims where current user is the designated approver
    // This ensures claims only appear in ONE person's queue at a time
    const allClaims = await ctx.db
      .query("expense_claims")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter submitted claims that aren't deleted
    const submittedClaims = allClaims.filter(
      (c) => c.status === "submitted" && !c.deletedAt
    );

    // Separate claims with and without designatedApproverId
    const claimsWithApprover = submittedClaims.filter((c) => c.designatedApproverId);
    const claimsWithoutApprover = submittedClaims.filter((c) => !c.designatedApproverId);

    // For claims WITH designatedApproverId: strict routing
    const strictRoutedClaims = claimsWithApprover.filter(
      (c) => c.designatedApproverId === user._id
    );

    // For claims WITHOUT designatedApproverId (legacy): fall back to role-based filtering
    let legacyClaims: typeof claimsWithoutApprover = [];
    if (claimsWithoutApprover.length > 0) {
      if (membership.role === "manager") {
        // Managers see direct reports + own claims (legacy behavior)
        const allMemberships = await ctx.db
          .query("business_memberships")
          .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
          .collect();
        const directReports = allMemberships.filter((m) => m.managerId === user._id);
        const reportIds = new Set(directReports.map((m) => m.userId));
        reportIds.add(user._id);
        legacyClaims = claimsWithoutApprover.filter((c) => reportIds.has(c.userId));
      } else {
        // Owners/finance_admins see all legacy claims
        legacyClaims = claimsWithoutApprover;
      }
    }

    // Combine strict routed + legacy claims
    const pendingClaims = [...strictRoutedClaims, ...legacyClaims];

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
 * Get eligible approvers for routing a claim
 * Returns all managers, finance_admins, and owners in the business
 */
export const getEligibleApprovers = query({
  args: {
    businessId: v.string(), // Accepts Convex ID or legacy UUID
    excludeUserId: v.optional(v.id("users")), // Optionally exclude current approver
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

    // Resolve businessId (supports both Convex ID and legacy UUID)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    // Get all active memberships with approver roles
    const allMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const approverMemberships = allMemberships.filter(
      (m) =>
        ["owner", "finance_admin", "manager"].includes(m.role) &&
        m.status === "active" &&
        m.userId !== args.excludeUserId // Exclude specified user (usually current approver)
    );

    // Enrich with user details
    return await Promise.all(
      approverMemberships.map(async (membership) => {
        const approverUser = await ctx.db.get(membership.userId);
        return {
          _id: membership.userId,
          email: approverUser?.email || "",
          fullName: approverUser?.fullName || "Unknown",
          role: membership.role,
        };
      })
    );
  },
});

/**
 * Check for potential duplicate expense claims
 * Returns candidates based on reference number OR vendor+date+amount match
 */
export const checkDuplicates = query({
  args: {
    businessId: v.id("businesses"),
    userId: v.id("users"),
    referenceNumber: v.optional(v.string()),
    vendorName: v.string(),
    transactionDate: v.string(),
    totalAmount: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, args) => {
    // Fetch candidates that could be duplicates:
    // - Same transaction date (required for Tier 2/3: vendor+date+amount match)
    // - Same reference number (required for Tier 1: exact receipt number match)
    // No arbitrary time window — duplicates are duplicates regardless of submission timing.
    const claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .filter((q) =>
        q.and(
          q.eq(q.field("deletedAt"), undefined),
          q.neq(q.field("status"), "rejected"),
          q.neq(q.field("status"), "failed"),
          q.or(
            // Same transaction date — needed for vendor+date+amount matching
            q.eq(q.field("transactionDate"), args.transactionDate),
            // Same reference number — needed for exact receipt number matching
            ...(args.referenceNumber
              ? [q.eq(q.field("referenceNumber"), args.referenceNumber)]
              : [])
          )
        )
      )
      .collect();

    // Get user info for each claim's submitter
    const claimsWithUsers = await Promise.all(
      claims.map(async (claim) => {
        const user = await ctx.db.get(claim.userId);
        return {
          _id: claim._id,
          userId: claim.userId,
          vendorName: claim.vendorName,
          transactionDate: claim.transactionDate,
          totalAmount: claim.totalAmount,
          currency: claim.currency,
          referenceNumber: claim.referenceNumber,
          status: claim.status,
          _creationTime: claim._creationTime,
          submittedByName: user?.fullName || user?.email || "Unknown",
        };
      })
    );

    return claimsWithUsers;
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

    // Verify manager/finance_admin/owner access for analytics
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || !["owner", "finance_admin", "manager"].includes(membership.role)) {
      return null;
    }

    // Get all claims for business
    let claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    claims = claims.filter((c) => !c.deletedAt);

    // Scope claims for managers to only their direct reports
    if (membership.role === "manager") {
      const allMemberships = await ctx.db
        .query("business_memberships")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .collect();
      const directReports = allMemberships.filter((m) => m.managerId === user._id);
      const reportIds = new Set(directReports.map((m) => m.userId));
      reportIds.add(user._id); // Include manager's own claims
      claims = claims.filter((c) => reportIds.has(c.userId));
    }

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
    const categoryCounts: Record<string, number> = {};

    // Pre-submission statuses that should be excluded from manager analytics
    // These are claims that haven't entered the approval workflow yet
    const preSubmissionStatuses = ["draft", "uploading", "processing", "failed"];

    for (const claim of claims) {
      // Status counts (include all for visibility)
      statusCounts[claim.status] = (statusCounts[claim.status] || 0) + 1;

      // Skip pre-submission claims for amount/category analytics
      // Manager analytics should only reflect submitted claims onwards
      if (preSubmissionStatuses.includes(claim.status)) {
        continue;
      }

      // Amount totals (use home currency amount if available)
      // Use || to handle homeCurrencyAmount: 0 case (falls back to totalAmount)
      const amount = claim.homeCurrencyAmount || claim.totalAmount || 0;
      totalAmount += amount;

      if (claim.status === "approved" || claim.status === "reimbursed") {
        approvedAmount += amount;
      }
      if (claim.status === "submitted" || claim.status === "pending") {
        pendingAmount += amount;
      }

      // Category totals and counts
      if (claim.expenseCategory) {
        categoryTotals[claim.expenseCategory] =
          (categoryTotals[claim.expenseCategory] || 0) + amount;
        categoryCounts[claim.expenseCategory] =
          (categoryCounts[claim.expenseCategory] || 0) + 1;
      }
    }

    // Count only claims in the approval workflow (excludes drafts/pre-submission)
    const submittedClaims = claims.filter(
      (c) => !preSubmissionStatuses.includes(c.status)
    );

    return {
      totalClaims: submittedClaims.length,
      statusCounts,
      totalAmount,
      approvedAmount,
      pendingAmount,
      categoryTotals,
      categoryCounts,
      averageAmount:
        submittedClaims.length > 0 ? totalAmount / submittedClaims.length : 0,
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
    // Batch submission (009-batch-receipt-submission)
    submissionId: v.optional(v.id("expense_submissions")),
    // Duplicate override fields (007-duplicate-expense-detection)
    duplicateStatus: v.optional(
      v.union(
        v.literal("none"),
        v.literal("potential"),
        v.literal("confirmed"),
        v.literal("dismissed")
      )
    ),
    duplicateOverrideReason: v.optional(v.string()),
    duplicateOverrideAt: v.optional(v.number()),
    isSplitExpense: v.optional(v.boolean()),
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
      // Batch submission
      submissionId: args.submissionId,
      // Duplicate override fields
      duplicateStatus: args.duplicateStatus,
      duplicateOverrideReason: args.duplicateOverrideReason,
      duplicateOverrideAt: args.duplicateOverrideAt,
      isSplitExpense: args.isSplitExpense,
      version: 0,  // Initialize version for optimistic locking
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

    // ONLY the claim owner can update their claim
    // Managers/Admins can ONLY approve/reject and add notes (via updateStatus mutation)
    if (claim.userId !== user._id) {
      throw new Error("Not authorized to update this claim - only the claim owner can edit");
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

    // Increment version for optimistic locking
    updateData.version = (claim.version || 0) + 1;

    await ctx.db.patch(claim._id, updateData);
    return claim._id;
  },
});

/**
 * Update expense claim with version check (for concurrent edit detection)
 * Throws error if version doesn't match (someone else edited since last fetch)
 */
export const updateWithVersion = mutation({
  args: {
    id: v.string(),
    expectedVersion: v.number(),
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

    // ONLY the claim owner can update their claim
    // Managers/Admins can ONLY approve/reject and add notes (via updateStatus mutation)
    if (claim.userId !== user._id) {
      throw new Error("Not authorized to update this claim - only the claim owner can edit");
    }

    // Can only update draft/pending/submitted claims
    if (["approved", "reimbursed", "rejected"].includes(claim.status)) {
      throw new Error("Cannot update claim in final status");
    }

    // CHECK VERSION for concurrent edit detection
    const currentVersion = claim.version || 0;
    if (currentVersion !== args.expectedVersion) {
      throw new Error(
        `CONCURRENT_EDIT: This expense claim was modified by another user. ` +
        `Please refresh and try again. ` +
        `(Expected version: ${args.expectedVersion}, Current version: ${currentVersion})`
      );
    }

    const { id, expectedVersion, ...updates } = args;
    const updateData: Record<string, unknown> = { 
      updatedAt: Date.now(),
      version: currentVersion + 1  // Increment version
    };

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
    return { claimId: claim._id, newVersion: currentVersion + 1 };
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
      case "submitted": {
        // Only claim owner can submit
        if (claim.userId !== user._id) {
          throw new Error("Only claim owner can submit");
        }
        updateData.submittedAt = now;

        // Determine designated approver for strict routing
        let designatedApproverId: typeof user._id | null = null;

        // Step 1: If submitter has assigned manager, route to them
        if (membership.managerId) {
          designatedApproverId = membership.managerId;
        }
        // Step 2: For employees without manager, find any finance_admin/owner (fallback)
        else if (membership.role === "employee") {
          const allMemberships = await ctx.db
            .query("business_memberships")
            .withIndex("by_businessId", (q) => q.eq("businessId", claim.businessId))
            .collect();

          const adminMembership = allMemberships.find(
            (m) =>
              (m.role === "owner" || m.role === "finance_admin") &&
              m.status === "active" &&
              m.userId !== user._id
          );
          if (adminMembership) {
            designatedApproverId = adminMembership.userId;
          }
        }
        // Step 3: For managers/admins/owners without assigned manager, self-approval
        else if (["manager", "finance_admin", "owner"].includes(membership.role)) {
          designatedApproverId = user._id; // Route to self
        }

        if (designatedApproverId) {
          updateData.designatedApproverId = designatedApproverId;
        }
        break;
      }

      case "approved":
        // Only managers/finance_admins/owners can approve
        if (!["owner", "finance_admin", "manager"].includes(role)) {
          throw new Error("Not authorized to approve");
        }
        // STRICT ROUTING: Only the designated approver can approve
        // If designatedApproverId is set, enforce it; otherwise allow role-based approval (legacy)
        if (claim.designatedApproverId && claim.designatedApproverId !== user._id) {
          throw new Error("Only the designated approver can approve this claim");
        }
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
          const homeCurrency = claim.homeCurrency || business?.homeCurrency || "MYR";

          // Validate required fields for accounting entry
          if (!claim.totalAmount || !claim.currency || !claim.transactionDate) {
            throw new Error("Cannot approve claim: missing required financial data (amount, currency, or date)");
          }

          // Extract and transform line items from processingMetadata
          const processingMetadata = claim.processingMetadata as {
            line_items?: Array<{
              item_description?: string;
              description?: string;
              item_code?: string;
              unit_price?: number;
              quantity?: number;
              total_amount?: number;
              currency?: string;
              tax_amount?: number;
              tax_rate?: number;
              item_category?: string;
              unit_measurement?: string;
              line_order?: number;
            }>;
          } | null;

          const rawLineItems = processingMetadata?.line_items ?? [];
          const lineItems = rawLineItems
            .filter((item) => {
              const desc = item.item_description || item.description;
              return desc && desc.trim().length > 0;
            })
            .map((item, index) => ({
              itemDescription: (item.item_description || item.description || "Item")!,
              quantity: item.quantity ?? 1,
              unitPrice: item.unit_price ?? 0,
              totalAmount: item.total_amount ?? Math.round((item.unit_price ?? 0) * (item.quantity ?? 1) * 100) / 100,
              currency: item.currency || claim.currency || "MYR",
              taxAmount: item.tax_amount,
              taxRate: item.tax_rate,
              itemCategory: item.item_category,
              itemCode: item.item_code,
              unitMeasurement: item.unit_measurement,
              lineOrder: item.line_order ?? index + 1,
            }));

          // Create the accounting entry with line items
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
            lineItems: lineItems.length > 0 ? lineItems : undefined,
            updatedAt: now,
          });

          // Link the accounting entry back to the expense claim
          updateData.accountingEntryId = accountingEntryId;

          // Schedule real-time anomaly detection for this expense
          await ctx.scheduler.runAfter(0, internal.functions.actionCenterJobs.analyzeNewTransaction, {
            transactionId: accountingEntryId,
            businessId: claim.businessId,
          });

          console.log(`[Convex] Created accounting entry ${accountingEntryId} for approved expense claim ${claim._id} with ${lineItems.length} line items`);

          // ============================================
          // PHASE 2: Line items table population
          // Insert line items into normalized line_items table
          // ============================================
          if (lineItems.length > 0) {
            for (const item of lineItems) {
              await ctx.db.insert("line_items", {
                accountingEntryId: accountingEntryId,
                itemDescription: item.itemDescription,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalAmount: item.totalAmount,
                currency: item.currency,
                taxAmount: item.taxAmount,
                taxRate: item.taxRate,
                lineOrder: item.lineOrder,
                itemCode: item.itemCode,
                unitMeasurement: item.unitMeasurement,
                updatedAt: now,
              });
            }
            console.log(`[Convex] Inserted ${lineItems.length} records into line_items table for accounting entry ${accountingEntryId}`);
          }

          // ============================================
          // PHASE 2: Vendor activation
          // Link vendor to accounting entry and promote from prospective to active
          // ============================================
          if (claim.vendorName) {
            // Look up vendor by name (created during extraction as "prospective")
            const vendor = await ctx.runQuery(internal.functions.vendors.getByName, {
              businessId: claim.businessId,
              vendorName: claim.vendorName,
            });

            if (vendor) {
              // Link accounting entry to vendor record
              await ctx.db.patch(accountingEntryId, {
                vendorId: vendor._id,
              });
              // NOTE: promoteIfProspective intentionally NOT called here.
              // Expense claim merchants stay "prospective" — only supplier invoices create active vendors.
              console.log(`[Convex] Linked vendor ${vendor._id} to accounting entry (no promotion — expense claim source)`);
            } else {
              console.log(`[Convex] No vendor found for name "${claim.vendorName}" - skipping vendor linking`);
            }
          }
        }
        break;

      case "rejected":
        // Only managers/finance_admins/owners can reject
        if (!["owner", "finance_admin", "manager"].includes(role)) {
          throw new Error("Not authorized to reject");
        }
        // STRICT ROUTING: Only the designated approver can reject
        // If designatedApproverId is set, enforce it; otherwise allow role-based rejection (legacy)
        if (claim.designatedApproverId && claim.designatedApproverId !== user._id) {
          throw new Error("Only the designated approver can reject this claim");
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
        // Only finance_admins/owners can mark as reimbursed
        if (!["owner", "finance_admin"].includes(role)) {
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

        // Check if all claims in the parent submission are reimbursed
        if (claim.submissionId) {
          await ctx.runMutation(internal.functions.expenseSubmissions.checkReimbursementComplete, {
            submissionId: claim.submissionId,
          });
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
 * Route/reassign an expense claim to a different approver
 * Only the current designated approver or admins can route claims
 */
export const routeClaim = mutation({
  args: {
    claimId: v.string(),
    newApproverId: v.id("users"),
    reason: v.optional(v.string()),
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

    const claim = await resolveById(ctx.db, "expense_claims", args.claimId);
    if (!claim || claim.deletedAt) {
      throw new Error("Expense claim not found");
    }

    // Only submitted claims can be routed
    if (claim.status !== "submitted") {
      throw new Error("Only submitted claims can be routed");
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

    // Authorization: current designated approver OR owner/finance_admin can route
    const isDesignatedApprover = claim.designatedApproverId === user._id;
    const isAdmin = ["owner", "finance_admin"].includes(membership.role);
    if (!isDesignatedApprover && !isAdmin) {
      throw new Error("Only the designated approver or admins can route claims");
    }

    // Validate new approver exists and is eligible (manager/finance_admin/owner)
    const newApprover = await ctx.db.get(args.newApproverId);
    if (!newApprover) {
      throw new Error("New approver not found");
    }

    const newApproverMembership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", args.newApproverId).eq("businessId", claim.businessId)
      )
      .first();

    if (!newApproverMembership || newApproverMembership.status !== "active") {
      throw new Error("New approver is not an active member of this business");
    }

    if (!["owner", "finance_admin", "manager"].includes(newApproverMembership.role)) {
      throw new Error("New approver must be a manager, finance admin, or owner");
    }

    // Build routing history entry
    const routingEntry = {
      fromUserId: user._id,
      toUserId: args.newApproverId,
      routedAt: Date.now(),
      reason: args.reason,
    };

    // Get existing routing history or initialize empty array
    const existingHistory = claim.routingHistory || [];

    // Update the claim
    await ctx.db.patch(claim._id, {
      designatedApproverId: args.newApproverId,
      routingHistory: [...existingHistory, routingEntry],
      updatedAt: Date.now(),
    });

    return { success: true };
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

    // Only owner of claim or finance_admin/owner can delete
    if (
      claim.userId !== user._id &&
      !["owner", "finance_admin"].includes(membership.role)
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

    // Step 1: If submitter has a manager, they're the next approver
    if (submitterMembership.managerId) {
      const manager = await ctx.db.get(submitterMembership.managerId);
      return manager;
    }

    // Step 2: If submitter is employee without manager, return null
    // (blocked at submission layer with MANAGER_REQUIRED error)
    if (submitterMembership.role === "employee") {
      return null;
    }

    // Step 3: For managers/admins/owners without assigned manager,
    // route to SELF for self-approval
    // Manager submits → goes to their own queue → they self-approve
    if (
      submitterMembership.role === "manager" ||
      submitterMembership.role === "finance_admin" ||
      submitterMembership.role === "owner"
    ) {
      return submitter; // Route to self for self-approval
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
    employeeId: v.optional(v.string()), // Filter by specific employee (manager/finance_admin only)
    directReportsOnly: v.optional(v.boolean()), // When true, only show claims from direct reports (managerId = current user)
    status: v.optional(v.string()), // Filter by status (draft, submitted, approved, rejected, reimbursed)
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
    const isAdmin = role === "owner" || role === "finance_admin";
    const isManager = role === "manager";

    // Parse month to UTC timestamp range for filtering by submittedAt
    const [year, monthNum] = args.month.split("-").map(Number);
    const startTimestamp = Date.UTC(year, monthNum - 1, 1);
    const endTimestamp = Date.UTC(year, monthNum, 1); // First day of next month (exclusive)

    // Get all claims for the business
    let claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter by submittedAt date range (when the claim was submitted for processing)
    claims = claims.filter((claim) => {
      if (!claim.submittedAt) return false;
      return claim.submittedAt >= startTimestamp && claim.submittedAt < endTimestamp;
    });

    // Filter out deleted claims
    claims = claims.filter((claim) => !claim.deletedAt);

    // Apply RBAC filtering
    if (args.directReportsOnly && (isManager || isAdmin)) {
      // Get direct reports (employees whose managerId = current user)
      const directReportMemberships = await ctx.db
        .query("business_memberships")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .filter((q) =>
          q.and(
            q.eq(q.field("status"), "active"),
            q.eq(q.field("managerId"), user._id)
          )
        )
        .collect();

      const directReportUserIds = new Set(
        directReportMemberships.map((m) => m.userId)
      );

      if (args.employeeId) {
        // Filter to specific direct report
        const filterUser = await resolveById(ctx.db, "users", args.employeeId);
        if (filterUser && directReportUserIds.has(filterUser._id)) {
          claims = claims.filter((claim) => claim.userId === filterUser._id);
        } else {
          claims = []; // Employee not in direct reports
        }
      } else {
        // Filter to all direct reports
        claims = claims.filter((claim) => directReportUserIds.has(claim.userId));
      }
    } else if (args.employeeId) {
      // Only finance_admin/manager can filter by employee
      if (!isAdmin && !isManager) {
        return { error: "Only managers and finance_admins can filter by employee ID" };
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

    // Apply status filter if provided
    if (args.status && args.status !== "all") {
      claims = claims.filter((claim) => claim.status === args.status);
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

      // Use || to handle homeCurrencyAmount: 0 case (falls back to totalAmount)
      const amount = claim.homeCurrencyAmount || claim.totalAmount || 0;
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
      homeCurrency: business.homeCurrency || "MYR",
      totalClaims: enrichedClaims.length,
      role,
    };
  },
});

/**
 * Get formatted report data with detailed claims for PDF generation
 * Used by: /api/v1/expense-claims/reports/formatted/route.ts
 *
 * Filters by approvedAt timestamp (when expense was approved/reimbursed)
 * This is appropriate for expense claim reporting where you want to see
 * "what was reimbursed in a given month" rather than "what expenses occurred"
 */
export const getFormattedReportData = query({
  args: {
    businessId: v.string(),
    month: v.string(), // YYYY-MM format
    employeeId: v.optional(v.string()),
    directReportsOnly: v.optional(v.boolean()), // When true, only show claims from direct reports
    status: v.optional(v.string()), // Filter by status (draft, submitted, approved, rejected, reimbursed)
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
    const isAdmin = role === "owner" || role === "finance_admin";
    const isManager = role === "manager";

    // Parse month to UTC timestamp range for filtering by submittedAt
    const [year, monthNum] = args.month.split("-").map(Number);
    const startTimestamp = Date.UTC(year, monthNum - 1, 1);
    const endTimestamp = Date.UTC(year, monthNum, 1); // First day of next month (exclusive)

    // Get claims for the business
    let claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter by submittedAt date range (when the claim was submitted for processing)
    claims = claims.filter((claim) => {
      if (!claim.submittedAt) return false;
      return claim.submittedAt >= startTimestamp && claim.submittedAt < endTimestamp;
    });

    // Apply status filter if provided
    if (args.status && args.status !== "all") {
      claims = claims.filter((claim) => claim.status === args.status);
    }

    claims = claims.filter((claim) => !claim.deletedAt);

    // Apply RBAC filtering
    if (args.directReportsOnly && (isManager || isAdmin)) {
      // Get direct reports (employees whose managerId = current user)
      const directReportMemberships = await ctx.db
        .query("business_memberships")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .filter((q) =>
          q.and(
            q.eq(q.field("status"), "active"),
            q.eq(q.field("managerId"), user._id)
          )
        )
        .collect();

      const directReportUserIds = new Set(
        directReportMemberships.map((m) => m.userId)
      );

      if (args.employeeId) {
        const filterUser = await resolveById(ctx.db, "users", args.employeeId);
        if (filterUser && directReportUserIds.has(filterUser._id)) {
          claims = claims.filter((claim) => claim.userId === filterUser._id);
        } else {
          claims = [];
        }
      } else {
        claims = claims.filter((claim) => directReportUserIds.has(claim.userId));
      }
    } else if (args.employeeId) {
      if (!isAdmin && !isManager) {
        return { error: "Only managers and finance_admins can filter by employee ID" };
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
      // Use || to handle homeCurrencyAmount: 0 case (falls back to totalAmount)
      const amount = claim.homeCurrencyAmount || claim.totalAmount || 0;
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
        homeCurrency: business.homeCurrency || "MYR",
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
    directReportsOnly: v.optional(v.boolean()), // When true, only show claims from direct reports
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
    const isAdmin = role === "owner" || role === "finance_admin";
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
    if (args.directReportsOnly && (isManager || isAdmin)) {
      // Get direct reports (employees whose managerId = current user)
      const directReportMemberships = await ctx.db
        .query("business_memberships")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .filter((q) =>
          q.and(
            q.eq(q.field("status"), "active"),
            q.eq(q.field("managerId"), user._id)
          )
        )
        .collect();

      const directReportUserIds = new Set(
        directReportMemberships.map((m) => m.userId)
      );

      if (args.employeeId) {
        const filterUser = await resolveById(ctx.db, "users", args.employeeId);
        if (filterUser && directReportUserIds.has(filterUser._id)) {
          claims = claims.filter((claim) => claim.userId === filterUser._id);
        } else {
          claims = [];
        }
      } else {
        claims = claims.filter((claim) => directReportUserIds.has(claim.userId));
      }
    } else if (args.employeeId) {
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
      homeCurrency: business.homeCurrency || "MYR",
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
import { internal } from "../_generated/api";

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
 * Internal: Update line items after Phase 2 extraction (no auth required)
 * Used by Lambda after two-phase extraction - Phase 2 updates line items only
 *
 * Two-Phase Extraction Flow:
 * - Phase 1: Extract core fields → Convex update → frontend renders immediately (~3-4s)
 * - Phase 2: Extract line items → this mutation → frontend updates via real-time (~3-4s)
 */
export const internalUpdateLineItems = internalMutation({
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
  handler: async (ctx, args) => {
    const claim = await resolveById(ctx.db, "expense_claims", args.id);
    if (!claim) {
      throw new Error(`Expense claim not found: ${args.id}`);
    }

    const now = Date.now();

    // Merge line_items into existing processingMetadata
    const existingMetadata = (claim.processingMetadata || {}) as Record<string, unknown>;
    const updatedMetadata = {
      ...existingMetadata,
      line_items: args.lineItems,
      line_items_extracted_at: new Date(now).toISOString(),
    };

    await ctx.db.patch(claim._id, {
      processingMetadata: updatedMetadata,
      lineItemsStatus: args.lineItemsStatus,
      updatedAt: now,
    });

    console.log(`[Convex Internal] Updated expense claim ${args.id} with ${args.lineItems.length} line items (status: ${args.lineItemsStatus})`);
    return claim._id;
  },
});

/**
 * Internal: Update line items status only (for state transitions)
 * Used by Lambda to mark lineItemsStatus as 'extracting' before Phase 2 starts
 */
export const internalUpdateLineItemsStatus = internalMutation({
  args: {
    id: v.string(),
    lineItemsStatus: v.union(
      v.literal("pending"),
      v.literal("extracting"),
      v.literal("complete"),
      v.literal("skipped")
    ),
  },
  handler: async (ctx, args) => {
    const claim = await resolveById(ctx.db, "expense_claims", args.id);
    if (!claim) {
      throw new Error(`Expense claim not found: ${args.id}`);
    }

    await ctx.db.patch(claim._id, {
      lineItemsStatus: args.lineItemsStatus,
      updatedAt: Date.now(),
    });

    console.log(`[Convex Internal] Updated expense claim ${args.id} lineItemsStatus to: ${args.lineItemsStatus}`);
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
 * Used for finance_admin cleanup of stuck/orphaned records
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

/**
 * Internal: Create vendor and record price history from extracted data
 * Called after expense claim extraction completes to populate vendor master data
 */
export const internalProcessVendorFromExtraction = internalMutation({
  args: {
    claimId: v.string(),
  },
  handler: async (ctx, args): Promise<
    | { success: false; reason: string }
    | { success: true; vendorId: Id<"vendors">; vendorCreated: boolean; priceObservationsCount: number }
  > => {
    const claim = await resolveById(ctx.db, "expense_claims", args.claimId);
    if (!claim) {
      throw new Error(`Expense claim not found: ${args.claimId}`);
    }

    const vendorName = claim.vendorName?.trim();
    if (!vendorName) {
      console.log(`[Vendor Integration] Skipping - no vendor name on expense claim ${args.claimId}`);
      return { success: false, reason: "no_vendor_name" };
    }

    // Upsert vendor - creates if new (prospective status), returns existing if found
    const vendorResult = await ctx.runMutation(internal.functions.vendors.upsertByName, {
      businessId: claim.businessId,
      vendorName: vendorName,
    });

    console.log(`[Vendor Integration] Vendor upserted for expense claim ${args.claimId}: ${vendorResult.vendorId} (created: ${vendorResult.created})`);

    // Record price observation from the expense claim total
    // Expense claims typically don't have detailed line items like invoices
    const processingMetadata = claim.processingMetadata as {
      financial_data?: {
        description?: string;
        vendor_name?: string;
        total_amount?: number;
        original_currency?: string;
        transaction_date?: string;
      };
      line_items?: Array<{
        item_description?: string;
        unit_price?: number;
        quantity?: number;
        currency?: string;
        // DSPy extraction fields
        tax_amount?: number;
        tax_rate?: number;
        item_category?: string;
      }>;
    } | null;

    const lineItems = processingMetadata?.line_items ?? [];
    const observedAt = claim.transactionDate || new Date().toISOString().split("T")[0];
    const defaultCurrency = claim.currency || "MYR";

    // If we have line items, record each one
    const priceObservations = lineItems
      .filter((item) => item.item_description && item.unit_price !== undefined && item.unit_price > 0)
      .map((item) => ({
        itemDescription: item.item_description!,
        itemCode: undefined,
        unitPrice: item.unit_price!,
        currency: item.currency || defaultCurrency,
        quantity: item.quantity ?? 1,
        // DSPy extraction fields
        taxAmount: item.tax_amount,
        taxRate: item.tax_rate,
        itemCategory: item.item_category,
      }));

    // If no line items but we have a total, record as single item
    if (priceObservations.length === 0 && claim.totalAmount && claim.totalAmount > 0) {
      const description = processingMetadata?.financial_data?.description || claim.businessPurpose || "Expense";
      priceObservations.push({
        itemDescription: description,
        itemCode: undefined,
        unitPrice: claim.totalAmount,
        currency: defaultCurrency,
        quantity: 1,
        // No DSPy extraction fields for fallback total-only observation
        taxAmount: undefined,
        taxRate: undefined,
        itemCategory: undefined,
      });
    }

    if (priceObservations.length > 0) {
      await ctx.runMutation(internal.functions.vendorPriceHistory.recordPriceObservationsBatch, {
        businessId: claim.businessId,
        vendorId: vendorResult.vendorId,
        sourceType: "expense_claim",
        sourceId: args.claimId,
        observedAt,
        lineItems: priceObservations,
      });
      console.log(`[Vendor Integration] Recorded ${priceObservations.length} price observations for expense claim ${args.claimId}`);
    }

    return {
      success: true,
      vendorId: vendorResult.vendorId,
      vendorCreated: vendorResult.created,
      priceObservationsCount: priceObservations.length,
    };
  },
});

// ============================================
// E-INVOICE RETRIEVAL (019-lhdn-einv-flow-2)
// ============================================

/**
 * Internal: Update e-invoice fields on an expense claim
 * Used by einvoiceJobs actions after matching or agent completion
 */
export const internalUpdateEinvoiceStatus = internalMutation({
  args: {
    claimId: v.id("expense_claims"),
    einvoiceRequestStatus: v.string(),
    einvoiceSource: v.optional(v.string()),
    einvoiceAttached: v.optional(v.boolean()),
    lhdnReceivedDocumentUuid: v.optional(v.string()),
    lhdnReceivedLongId: v.optional(v.string()),
    lhdnReceivedStatus: v.optional(v.string()),
    lhdnReceivedAt: v.optional(v.number()),
    einvoiceReceivedAt: v.optional(v.number()),
    einvoiceAgentError: v.optional(v.string()),
    einvoiceEmailRef: v.optional(v.string()),
    einvoiceRequestedAt: v.optional(v.number()),
    einvoiceStoragePath: v.optional(v.string()),
    einvoiceRawEmailPath: v.optional(v.string()),
    merchantFormUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.claimId);
    if (!claim) {
      throw new Error(`Expense claim not found: ${args.claimId}`);
    }

    const updateData: Record<string, unknown> = {
      einvoiceRequestStatus: args.einvoiceRequestStatus,
      updatedAt: Date.now(),
    };

    // Only set fields that are explicitly provided
    if (args.einvoiceSource !== undefined) updateData.einvoiceSource = args.einvoiceSource;
    if (args.einvoiceAttached !== undefined) updateData.einvoiceAttached = args.einvoiceAttached;
    if (args.lhdnReceivedDocumentUuid !== undefined) updateData.lhdnReceivedDocumentUuid = args.lhdnReceivedDocumentUuid;
    if (args.lhdnReceivedLongId !== undefined) updateData.lhdnReceivedLongId = args.lhdnReceivedLongId;
    if (args.lhdnReceivedStatus !== undefined) updateData.lhdnReceivedStatus = args.lhdnReceivedStatus;
    if (args.lhdnReceivedAt !== undefined) updateData.lhdnReceivedAt = args.lhdnReceivedAt;
    if (args.einvoiceReceivedAt !== undefined) updateData.einvoiceReceivedAt = args.einvoiceReceivedAt;
    if (args.einvoiceAgentError !== undefined) updateData.einvoiceAgentError = args.einvoiceAgentError;
    if (args.einvoiceEmailRef !== undefined) updateData.einvoiceEmailRef = args.einvoiceEmailRef;
    if (args.einvoiceRequestedAt !== undefined) updateData.einvoiceRequestedAt = args.einvoiceRequestedAt;
    if (args.einvoiceStoragePath !== undefined) updateData.einvoiceStoragePath = args.einvoiceStoragePath;
    if (args.einvoiceRawEmailPath !== undefined) updateData.einvoiceRawEmailPath = args.einvoiceRawEmailPath;
    if (args.merchantFormUrl !== undefined) updateData.merchantFormUrl = args.merchantFormUrl;

    await ctx.db.patch(claim._id, updateData);
    console.log(`[E-Invoice] Updated expense claim ${args.claimId} einvoiceRequestStatus to: ${args.einvoiceRequestStatus}`);
    return claim._id;
  },
});

/**
 * Query: Get e-invoice status details for an expense claim
 * Returns all e-invoice fields + pending match candidates
 */
export const getEinvoiceStatus = query({
  args: {
    claimId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const claim = await resolveById(ctx.db, "expense_claims", args.claimId);
    if (!claim || claim.deletedAt) return null;

    // Get pending match candidates from einvoice_received_documents
    const pendingMatchCandidates: Array<{
      receivedDocId: string;
      supplierName: string;
      total: number;
      dateTimeIssued: string;
      matchTier: string;
      matchConfidence: number;
    }> = [];

    // Find received documents where this claim is in matchCandidateClaimIds
    const receivedDocs = await ctx.db
      .query("einvoice_received_documents")
      .withIndex("by_businessId_status", (q) =>
        q.eq("businessId", claim.businessId).eq("status", "valid")
      )
      .collect();

    for (const doc of receivedDocs) {
      if (doc.matchCandidateClaimIds?.includes(claim._id)) {
        pendingMatchCandidates.push({
          receivedDocId: doc._id,
          supplierName: doc.supplierName || "Unknown",
          total: doc.total || 0,
          dateTimeIssued: doc.dateTimeIssued || "",
          matchTier: doc.matchTier || "tier3_fuzzy",
          matchConfidence: doc.matchConfidence || 0,
        });
      }
    }

    return {
      einvoiceRequestStatus: claim.einvoiceRequestStatus || null,
      einvoiceSource: claim.einvoiceSource || null,
      einvoiceAttached: claim.einvoiceAttached || false,
      merchantFormUrl: claim.merchantFormUrl || null,
      lhdnReceivedDocumentUuid: claim.lhdnReceivedDocumentUuid || null,
      lhdnReceivedLongId: claim.lhdnReceivedLongId || null,
      lhdnReceivedStatus: claim.lhdnReceivedStatus || null,
      lhdnReceivedAt: claim.lhdnReceivedAt || null,
      einvoiceRequestedAt: claim.einvoiceRequestedAt || null,
      einvoiceReceivedAt: claim.einvoiceReceivedAt || null,
      einvoiceAgentError: claim.einvoiceAgentError || null,
      pendingMatchCandidates,
    };
  },
});

/**
 * Public Mutation: Request e-invoice via AI agent (manual trigger / retry)
 * Validates ownership, business settings, and returns data for the API route
 * to invoke the form fill Lambda. The Lambda handles all state management
 * (creates request log, sets emailRef, etc.) via reportEinvoiceFormFillResult.
 */
export const requestEinvoice = mutation({
  args: {
    claimId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const claim = await resolveById(ctx.db, "expense_claims", args.claimId);
    if (!claim || claim.deletedAt) throw new Error("Expense claim not found");

    // Verify user has access (own claim or manager/admin)
    if (claim.userId !== user._id) {
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", claim.businessId)
        )
        .first();
      if (!membership || !["owner", "finance_admin", "manager"].includes(membership.role)) {
        throw new Error("Not authorized to request e-invoice for this claim");
      }
    }

    if (!claim.merchantFormUrl) {
      throw new Error("No merchant form URL detected for this expense claim");
    }

    // Get business settings
    const business = await ctx.db.get(claim.businessId);
    if (!business) throw new Error("Business not found");
    if (!business.lhdnTin) {
      throw new Error("Business TIN not configured. Please update business settings.");
    }
    // Accept either structured address (addressLine1) or legacy flat address
    const hasAddress = business.addressLine1 || business.address;
    if (!hasAddress) {
      throw new Error("Business address not configured. Please update business settings.");
    }

    // Compose address: prefer structured fields, fall back to legacy flat field
    const composedAddress = business.addressLine1
      ? [business.addressLine1, business.addressLine2, business.addressLine3, business.city, business.stateCode, business.postalCode]
          .filter(Boolean).join(", ")
      : (business.address as string);

    // Mark as requesting + clear previous error on retry
    await ctx.db.patch(claim._id, {
      einvoiceRequestStatus: "requesting",
      einvoiceRequestedAt: Date.now(),
      ...(claim.einvoiceAgentError ? { einvoiceAgentError: undefined } : {}),
      updatedAt: Date.now(),
    });

    // Derive emailRef from claim ID (first 10 chars — deterministic)
    const emailRef = (claim._id as string).substring(0, 10);

    // Return data for the API route to invoke the form fill Lambda
    return {
      merchantFormUrl: claim.merchantFormUrl,
      buyerDetails: {
        name: business.name,
        tin: business.lhdnTin as string,
        brn: (business.businessRegistrationNumber || business.lhdnTin) as string,
        address: composedAddress,
        email: `einvoice+${emailRef}@einv.hellogroot.com`,
        phone: business.contactPhone,
      },
      // Pass all OCR-extracted receipt data for merchant form fields
      receiptData: {
        referenceNumber: claim.referenceNumber || null,
        totalAmount: claim.totalAmount || null,
        currency: claim.currency || "MYR",
        transactionDate: claim.transactionDate || null,
        vendorName: claim.vendorName || null,
      },
      // Receipt image path for CUA vision (fallback to look at receipt for missing fields)
      receiptImagePath: claim.convertedImagePath || claim.storagePath || null,
    };
  },
});

/**
 * Public Mutation: Resolve an ambiguous e-invoice match (accept/reject)
 * Used by employee to confirm or reject Tier 3 fuzzy matches
 */
export const resolveEinvoiceMatch = mutation({
  args: {
    claimId: v.string(),
    receivedDocId: v.string(),
    action: v.union(v.literal("accept"), v.literal("reject")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const claim = await resolveById(ctx.db, "expense_claims", args.claimId);
    if (!claim || claim.deletedAt) throw new Error("Expense claim not found");

    // Verify user has access
    if (claim.userId !== user._id) {
      const membership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", user._id).eq("businessId", claim.businessId)
        )
        .first();
      if (!membership || !["owner", "finance_admin", "manager"].includes(membership.role)) {
        throw new Error("Not authorized to resolve match for this claim");
      }
    }

    // Get received document (new table, always Convex IDs)
    const receivedDocId = args.receivedDocId as Id<"einvoice_received_documents">;
    const receivedDoc = await ctx.db.get(receivedDocId);
    if (!receivedDoc) throw new Error("Received document not found");

    if (args.action === "accept") {
      // Link received document to claim
      await ctx.db.patch(receivedDoc._id, {
        matchedExpenseClaimId: claim._id as string,
        matchTier: "manual",
        matchConfidence: 1.0,
        matchCandidateClaimIds: undefined, // Clear candidates
      } as Record<string, unknown>);

      // Update expense claim with LHDN references
      await ctx.db.patch(claim._id, {
        einvoiceRequestStatus: "received",
        einvoiceAttached: true,
        lhdnReceivedDocumentUuid: receivedDoc.lhdnDocumentUuid,
        lhdnReceivedLongId: receivedDoc.lhdnLongId,
        lhdnReceivedStatus: receivedDoc.status as "valid" | "cancelled",
        lhdnReceivedAt: Date.now(),
        einvoiceReceivedAt: Date.now(),
        updatedAt: Date.now(),
      });

      return { success: true, action: "accepted" };
    } else {
      // Reject: remove this claim from candidates
      const candidateIds = (receivedDoc.matchCandidateClaimIds || []) as string[];
      const updatedCandidates = candidateIds.filter((id) => id !== (claim._id as string));

      await ctx.db.patch(receivedDoc._id, {
        matchCandidateClaimIds: updatedCandidates.length > 0 ? updatedCandidates : undefined,
      } as Record<string, unknown>);

      return { success: true, action: "rejected" };
    }
  },
});

/**
 * Public Mutation: Mark expense claim with manual e-invoice upload
 * Called after file has been uploaded to Convex storage
 */
export const markEinvoiceManualUpload = mutation({
  args: {
    claimId: v.string(),
    storagePath: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const claim = await resolveById(ctx.db, "expense_claims", args.claimId);
    if (!claim || claim.deletedAt) throw new Error("Expense claim not found");

    // Verify user has access (own claim)
    if (claim.userId !== user._id) {
      throw new Error("Not authorized to upload e-invoice for this claim");
    }

    // Check not already attached
    if (claim.einvoiceAttached) {
      throw new Error("E-invoice already attached to this claim");
    }

    await ctx.db.patch(claim._id, {
      einvoiceSource: "manual_upload",
      einvoiceStoragePath: args.storagePath,
      einvoiceAttached: true,
      einvoiceRequestStatus: "received",
      einvoiceReceivedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});


// ============================================
// STUCK RECORDS MONITORING (for finance_admin operations)
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

    // Verify finance_admin/manager role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    if (!["owner", "finance_admin", "manager"].includes(membership.role)) {
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

    // Verify finance_admin/manager role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    if (!["owner", "finance_admin", "manager"].includes(membership.role)) {
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
 * Force-fail a single expense claim (finance_admin override)
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

    // Verify finance_admin role (only finance_admins can force-fail)
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    if (!["owner", "finance_admin"].includes(membership.role)) {
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
      errorMessage: args.reason || "Manual finance_admin override",
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

// ============================================
// CORRECT & RESUBMIT FLOW (FR-011)
// ============================================

/**
 * Resubmit a rejected expense claim with optional corrections
 * Creates a new claim based on the rejected one and links them
 */
export const resubmitRejectedClaim = mutation({
  args: {
    claimId: v.id("expense_claims"),
    updatedData: v.optional(v.object({
      vendorName: v.optional(v.string()),
      totalAmount: v.optional(v.number()),
      transactionDate: v.optional(v.string()),
      currency: v.optional(v.string()),
      businessPurpose: v.optional(v.string()),
      description: v.optional(v.string()),
      expenseCategory: v.optional(v.string()),
      referenceNumber: v.optional(v.string()),
    }))
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

    // Get the original claim
    const originalClaim = await ctx.db.get(args.claimId);
    if (!originalClaim || originalClaim.deletedAt) {
      throw new Error("Expense claim not found");
    }

    // Verify the claim is in rejected status
    if (originalClaim.status !== "rejected") {
      throw new Error("Only rejected claims can be resubmitted");
    }

    // Verify the user owns the claim
    if (originalClaim.userId !== user._id) {
      throw new Error("You can only resubmit your own expense claims");
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", originalClaim.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    const now = Date.now();

    // Create new claim with data from original (with optional updates)
    const newClaimData = {
      businessId: originalClaim.businessId,
      userId: originalClaim.userId,
      businessPurpose: args.updatedData?.businessPurpose ?? originalClaim.businessPurpose,
      description: args.updatedData?.description ?? originalClaim.description,
      vendorName: args.updatedData?.vendorName ?? originalClaim.vendorName,
      totalAmount: args.updatedData?.totalAmount ?? originalClaim.totalAmount,
      currency: args.updatedData?.currency ?? originalClaim.currency,
      homeCurrency: originalClaim.homeCurrency,
      homeCurrencyAmount: originalClaim.homeCurrencyAmount,
      exchangeRate: originalClaim.exchangeRate,
      transactionDate: args.updatedData?.transactionDate ?? originalClaim.transactionDate,
      referenceNumber: args.updatedData?.referenceNumber ?? originalClaim.referenceNumber,
      expenseCategory: args.updatedData?.expenseCategory ?? originalClaim.expenseCategory,
      storagePath: originalClaim.storagePath,
      convertedImagePath: originalClaim.convertedImagePath,
      fileName: originalClaim.fileName,
      fileType: originalClaim.fileType,
      fileSize: originalClaim.fileSize,
      status: "draft" as const,
      confidenceScore: originalClaim.confidenceScore,
      processingMetadata: originalClaim.processingMetadata,
      lineItemsStatus: originalClaim.lineItemsStatus,
      // Link to original rejected claim
      resubmittedFromId: args.claimId,
      updatedAt: now,
    };

    // Create the new claim
    const newClaimId = await ctx.db.insert("expense_claims", newClaimData);

    // Update the original claim with reference to new claim
    await ctx.db.patch(args.claimId, {
      resubmittedToId: newClaimId,
      updatedAt: now,
    });

    console.log(`[Convex] Created resubmitted claim ${newClaimId} from rejected claim ${args.claimId}`);

    return {
      newClaimId,
      originalClaimId: args.claimId,
    };
  },
});

// ============================================
// LHDN SELF-BILLED E-INVOICE
// ============================================

/**
 * Initiate self-billed e-invoice submission for an approved expense claim.
 * Self-billing: the business (buyer) issues the invoice on behalf of the vendor (seller).
 */
export const initiateSelfBill = mutation({
  args: {
    claimId: v.id("expense_claims"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdminForClaims(ctx, args.businessId);

    const claim = await ctx.db.get(args.claimId);
    if (!claim || claim.businessId !== args.businessId) {
      throw new Error("Expense claim not found");
    }

    if (claim.status !== "approved" && claim.status !== "reimbursed") {
      throw new Error("Expense claim must be approved before self-billing");
    }

    // Allow resubmission only if previously invalid
    if (claim.lhdnStatus && claim.lhdnStatus !== "invalid") {
      throw new Error("Expense claim already has an LHDN submission in progress or completed");
    }

    // Validate business has LHDN config
    const business = await ctx.db.get(args.businessId);
    if (!business || !business.lhdnTin) {
      throw new Error("Business does not have LHDN TIN configured");
    }

    await ctx.db.patch(args.claimId, {
      lhdnStatus: "pending",
      lhdnSubmittedAt: Date.now(),
      lhdnValidationErrors: undefined,
      selfBillRequired: true,
      updatedAt: Date.now(),
    });

    return args.claimId;
  },
});

/**
 * Update LHDN status on an expense claim after polling returns a result.
 */
export const updateLhdnStatus = mutation({
  args: {
    claimId: v.id("expense_claims"),
    lhdnStatus: v.string(),
    lhdnDocumentUuid: v.optional(v.string()),
    lhdnLongId: v.optional(v.string()),
    lhdnValidatedAt: v.optional(v.number()),
    lhdnValidationErrors: v.optional(v.array(v.object({
      code: v.string(),
      message: v.string(),
      target: v.optional(v.string()),
    }))),
    lhdnDocumentHash: v.optional(v.string()),
    lhdnSubmissionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {
      lhdnStatus: args.lhdnStatus,
      updatedAt: Date.now(),
    };

    if (args.lhdnDocumentUuid !== undefined) patch.lhdnDocumentUuid = args.lhdnDocumentUuid;
    if (args.lhdnLongId !== undefined) patch.lhdnLongId = args.lhdnLongId;
    if (args.lhdnValidatedAt !== undefined) patch.lhdnValidatedAt = args.lhdnValidatedAt;
    if (args.lhdnValidationErrors !== undefined) patch.lhdnValidationErrors = args.lhdnValidationErrors;
    if (args.lhdnDocumentHash !== undefined) patch.lhdnDocumentHash = args.lhdnDocumentHash;
    if (args.lhdnSubmissionId !== undefined) patch.lhdnSubmissionId = args.lhdnSubmissionId;

    await ctx.db.patch(args.claimId, patch);
  },
});

/**
 * Cancel a validated self-billed e-invoice within 72-hour window.
 */
export const cancelLhdnSubmission = mutation({
  args: {
    claimId: v.id("expense_claims"),
    businessId: v.id("businesses"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdminForClaims(ctx, args.businessId);

    const claim = await ctx.db.get(args.claimId);
    if (!claim || claim.businessId !== args.businessId) {
      throw new Error("Expense claim not found");
    }

    if (claim.lhdnStatus !== "valid") {
      throw new Error("Can only cancel validated e-invoices");
    }

    if (!claim.lhdnDocumentUuid) {
      throw new Error("No LHDN document UUID found");
    }

    const CANCELLATION_WINDOW_MS = 72 * 60 * 60 * 1000;
    const validatedAt = claim.lhdnValidatedAt;
    if (!validatedAt) {
      throw new Error("No validation timestamp found");
    }

    const elapsed = Date.now() - validatedAt;
    if (elapsed > CANCELLATION_WINDOW_MS) {
      throw new Error("CANCELLATION_WINDOW_EXPIRED");
    }

    if (!args.reason.trim()) {
      throw new Error("Cancellation reason is required");
    }

    await ctx.db.patch(args.claimId, {
      lhdnStatus: "cancelled",
      updatedAt: Date.now(),
    });

    return { documentUuid: claim.lhdnDocumentUuid };
  },
});

// ============================================
// BATCH PAYMENT PROCESSING (001-batch-payment)
// ============================================

/**
 * Get approved claims grouped by submission for the Payment Processing tab.
 * Returns submissions with their approved claims, plus ungrouped claims (no submission).
 */
export const getPendingPaymentClaims = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { submissions: [], ungroupedClaims: [] };

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return { submissions: [], ungroupedClaims: [] };

    // Check finance_admin or owner role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { submissions: [], ungroupedClaims: [] };
    }
    if (!["owner", "finance_admin"].includes(membership.role)) {
      return { submissions: [], ungroupedClaims: [] };
    }

    // Get all approved claims for this business
    const allClaims = await ctx.db
      .query("expense_claims")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const approvedClaims = allClaims.filter(
      (c) => c.status === "approved" && !c.deletedAt
    );

    // Resolve user names for all claims
    const userIds = [...new Set(approvedClaims.map((c) => c.userId))];
    const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
    const userMap: Record<string, string> = {};
    for (const u of users) {
      if (u) userMap[u._id] = u.fullName || u.email || "Unknown";
    }

    // Group by submissionId
    const submissionMap: Record<string, typeof approvedClaims> = {};
    const ungrouped: typeof approvedClaims = [];

    for (const claim of approvedClaims) {
      if (claim.submissionId) {
        const key = claim.submissionId;
        if (!submissionMap[key]) submissionMap[key] = [];
        submissionMap[key].push(claim);
      } else {
        ungrouped.push(claim);
      }
    }

    // Fetch submission details
    const submissionIds = Object.keys(submissionMap);
    const submissions = await Promise.all(
      submissionIds.map(async (id) => {
        const sub = await ctx.db.get(id as Id<"expense_submissions">);
        const claims = submissionMap[id];
        return {
          _id: id,
          title: sub?.title || "Untitled Submission",
          employeeName: sub?.userId ? userMap[sub.userId] || "Unknown" : "Unknown",
          employeeId: sub?.userId || "",
          submittedAt: sub?.submittedAt,
          status: sub?.status,
          claims: claims.map((c) => ({
            _id: c._id,
            description: c.description || "",
            vendorName: c.vendorName || "",
            expenseCategory: c.expenseCategory || "",
            totalAmount: c.totalAmount || 0,
            currency: c.currency || c.homeCurrency || "MYR",
            referenceNumber: c.referenceNumber || "",
            submittedAt: c.submittedAt,
            employeeName: userMap[c.userId] || "Unknown",
          })),
        };
      })
    );

    const ungroupedMapped = ungrouped.map((c) => ({
      _id: c._id,
      description: c.description || "",
      vendorName: c.vendorName || "",
      expenseCategory: c.expenseCategory || "",
      totalAmount: c.totalAmount || 0,
      currency: c.currency || c.homeCurrency || "MYR",
      referenceNumber: c.referenceNumber || "",
      submittedAt: c.submittedAt,
      employeeName: userMap[c.userId] || "Unknown",
    }));

    return { submissions, ungroupedClaims: ungroupedMapped };
  },
});

/**
 * Batch mark expense claims as reimbursed (paid).
 * Updates both expense_claims and linked accounting_entries atomically.
 */
export const batchMarkAsPaid = mutation({
  args: {
    businessId: v.id("businesses"),
    claimIds: v.array(v.id("expense_claims")),
    paymentMethod: v.optional(v.string()),
    paymentReference: v.optional(v.string()),
    paymentDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireFinanceAdminForClaims(ctx, args.businessId);

    const now = Date.now();
    let processedCount = 0;
    let skippedCount = 0;
    const currencyTotals: Record<string, number> = {};

    for (const claimId of args.claimIds) {
      const claim = await ctx.db.get(claimId);
      if (!claim || claim.businessId !== args.businessId || claim.deletedAt) {
        skippedCount++;
        continue;
      }
      // Skip already reimbursed
      if (claim.status === "reimbursed") {
        skippedCount++;
        continue;
      }
      // Only process approved claims
      if (claim.status !== "approved") {
        skippedCount++;
        continue;
      }

      // Update expense claim
      await ctx.db.patch(claimId, {
        status: "reimbursed",
        paidAt: now,
        paidBy: user._id,
        paymentMethod: args.paymentMethod,
        paymentReference: args.paymentReference,
        updatedAt: now,
      });

      // Update linked accounting entry if exists
      if (claim.accountingEntryId) {
        const entry = await ctx.db.get(claim.accountingEntryId);
        if (entry && !entry.deletedAt) {
          await ctx.db.patch(claim.accountingEntryId, {
            status: "paid",
            paymentDate: args.paymentDate || new Date().toISOString().split("T")[0],
            paymentMethod: args.paymentMethod,
            updatedAt: now,
          });
        }
      }

      // Track totals per currency
      const currency = claim.currency || claim.homeCurrency || "MYR";
      const amount = claim.totalAmount || 0;
      currencyTotals[currency] = (currencyTotals[currency] || 0) + amount;

      processedCount++;
    }

    // Auto-update parent submissions if all claims are now reimbursed
    const submissionIds = new Set<string>();
    for (const claimId of args.claimIds) {
      const claim = await ctx.db.get(claimId);
      if (claim?.submissionId) submissionIds.add(claim.submissionId);
    }

    for (const subId of submissionIds) {
      const subClaims = await ctx.db
        .query("expense_claims")
        .withIndex("by_submissionId", (q) => q.eq("submissionId", subId as Id<"expense_submissions">))
        .collect();

      const allDone = subClaims
        .filter((c) => !c.deletedAt)
        .every((c) => c.status === "reimbursed" || c.status === "rejected");

      if (allDone) {
        await ctx.db.patch(subId as Id<"expense_submissions">, {
          status: "reimbursed",
          reimbursedAt: now,
          updatedAt: now,
        });
      }
    }

    return { processedCount, skippedCount, currencyTotals };
  },
});

/**
 * Send back an individual expense claim for correction.
 * Returns the claim to draft status for the employee to fix.
 * On resubmission, it routes directly to finance admin (bypasses manager re-approval).
 */
export const sendBackClaim = mutation({
  args: {
    businessId: v.id("businesses"),
    claimId: v.id("expense_claims"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { user } = await requireFinanceAdminForClaims(ctx, args.businessId);

    const claim = await ctx.db.get(args.claimId);
    if (!claim || claim.businessId !== args.businessId || claim.deletedAt) {
      throw new Error("Claim not found");
    }
    if (claim.status !== "approved") {
      throw new Error("Can only send back approved claims");
    }

    const now = Date.now();

    await ctx.db.patch(args.claimId, {
      status: "draft",
      sentBackBy: user._id,
      sentBackReason: args.reason,
      sentBackAt: now,
      updatedAt: now,
    });

    return { success: true };
  },
});

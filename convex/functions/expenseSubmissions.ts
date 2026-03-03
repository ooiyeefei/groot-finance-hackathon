/**
 * Expense Submissions Functions - Convex queries and mutations
 *
 * Implements the batch expense submission feature (009-batch-receipt-submission).
 * Groups multiple expense claims into a single submission for batch upload,
 * review, and all-or-nothing approval.
 */

import { v } from "convex/values";
import { query, mutation, internalMutation, type MutationCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";

// Role hierarchy for permission checks
const ROLE_HIERARCHY: Record<string, number> = {
  owner: 4,
  finance_admin: 3,
  manager: 2,
  employee: 1,
};

// Processing states where claims are not yet ready for submission
const PROCESSING_STATUSES = [
  "uploading",
  "classifying",
  "analyzing",
  "extracting",
  "processing",
];

// ============================================
// QUERIES
// ============================================

/**
 * List expense submissions with role-based filtering
 * - Owners/Finance Admins: See all submissions in business
 * - Managers: See their own + direct reports
 * - Employees: See only their own submissions
 */
export const list = query({
  args: {
    businessId: v.string(),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
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

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    const limit = Math.min(args.limit ?? 20, 100);
    const role = membership.role;

    // Query all submissions for this business
    let submissions = await ctx.db
      .query("expense_submissions")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    // Filter out soft-deleted
    submissions = submissions.filter((s) => !s.deletedAt);

    // Submissions page is always per-individual — only show the current user's own submissions
    submissions = submissions.filter((s) => s.userId === user._id);

    // Status filter
    if (args.status) {
      submissions = submissions.filter((s) => s.status === args.status);
    }

    // Sort by most recent first
    submissions.sort((a, b) => b._creationTime - a._creationTime);

    // Paginate
    submissions = submissions.slice(0, limit);

    // Enrich with computed fields
    const enriched = await Promise.all(
      submissions.map(async (submission) => {
        // Get submitter name
        const submitter = await ctx.db.get(submission.userId);
        const submitterName = submitter?.fullName || submitter?.email || "Unknown";

        // Get claims for this submission
        const claims = await ctx.db
          .query("expense_claims")
          .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
          .collect();

        const activeClaims = claims.filter((c) => !c.deletedAt);

        // Compute totals by currency
        const currencyMap = new Map<string, number>();
        for (const claim of activeClaims) {
          if (claim.totalAmount && claim.currency) {
            const existing = currencyMap.get(claim.currency) || 0;
            currencyMap.set(claim.currency, existing + claim.totalAmount);
          }
        }
        const totalsByCurrency = Array.from(currencyMap.entries()).map(
          ([currency, total]) => ({ currency, total })
        );

        // Compute reimbursement progress for approved submissions
        let reimbursementProgress = null;
        if (submission.status === "approved" || submission.status === "reimbursed") {
          const reimbursedCount = activeClaims.filter(
            (c) => c.status === "reimbursed"
          ).length;
          reimbursementProgress = {
            reimbursed: reimbursedCount,
            total: activeClaims.length,
          };
        }

        return {
          _id: submission._id,
          title: submission.title,
          status: submission.status,
          userId: submission.userId,
          submitterName,
          claimCount: activeClaims.length,
          totalsByCurrency,
          reimbursementProgress,
          submittedAt: submission.submittedAt,
          approvedAt: submission.approvedAt,
          _creationTime: submission._creationTime,
        };
      })
    );

    return enriched;
  },
});

/**
 * Get a single submission with all claims and details
 */
export const getById = query({
  args: {
    id: v.string(),
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

    // Try to resolve as Convex ID
    let submission;
    try {
      submission = await ctx.db.get(args.id as Id<"expense_submissions">);
    } catch {
      return null;
    }

    if (!submission || submission.deletedAt) {
      return null;
    }

    // Verify access: owner, manager of owner, or admin
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", submission.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    const isSubmitter = submission.userId === user._id;
    const isDesignatedApprover = submission.designatedApproverId === user._id;

    if (!isSubmitter && !isDesignatedApprover) {
      // Check if user is the direct manager of the submitter
      const submitterMembership = await ctx.db
        .query("business_memberships")
        .withIndex("by_userId_businessId", (q) =>
          q.eq("userId", submission.userId).eq("businessId", submission.businessId)
        )
        .first();
      if (!submitterMembership || submitterMembership.managerId !== user._id) {
        return null;
      }
    }

    // Fetch claims
    const claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
      .collect();

    const activeClaims = claims
      .filter((c) => !c.deletedAt)
      .map((c) => ({
        _id: c._id,
        vendorName: c.vendorName,
        totalAmount: c.totalAmount,
        currency: c.currency,
        expenseCategory: c.expenseCategory,
        transactionDate: c.transactionDate,
        status: c.status,
        businessPurpose: c.businessPurpose,
        confidenceScore: c.confidenceScore,
        storagePath: c.storagePath,
        convertedImagePath: c.convertedImagePath,
        fileName: c.fileName,
        lineItemsStatus: c.lineItemsStatus,
        _creationTime: c._creationTime,
      }));

    // Compute totals
    const currencyMap = new Map<string, number>();
    for (const claim of activeClaims) {
      if (claim.totalAmount && claim.currency) {
        const existing = currencyMap.get(claim.currency) || 0;
        currencyMap.set(claim.currency, existing + claim.totalAmount);
      }
    }
    const totalsByCurrency = Array.from(currencyMap.entries()).map(
      ([currency, total]) => ({ currency, total })
    );

    // Reimbursement progress
    let reimbursementProgress = null;
    if (submission.status === "approved" || submission.status === "reimbursed") {
      const reimbursedCount = activeClaims.filter(
        (c) => c.status === "reimbursed"
      ).length;
      reimbursementProgress = {
        reimbursed: reimbursedCount,
        total: activeClaims.length,
      };
    }

    // Get submitter info
    const submitter = await ctx.db.get(submission.userId);

    // Get approver info
    let approver = null;
    if (submission.designatedApproverId) {
      const approverUser = await ctx.db.get(submission.designatedApproverId);
      if (approverUser) {
        approver = {
          name: approverUser.fullName || approverUser.email || "Unknown",
          email: approverUser.email,
        };
      }
    }

    return {
      submission: {
        _id: submission._id,
        title: submission.title,
        description: submission.description,
        status: submission.status,
        rejectionReason: submission.rejectionReason,
        claimNotes: submission.claimNotes,
        designatedApproverId: submission.designatedApproverId,
        approvedBy: submission.approvedBy,
        submittedAt: submission.submittedAt,
        approvedAt: submission.approvedAt,
        rejectedAt: submission.rejectedAt,
        reimbursedAt: submission.reimbursedAt,
        _creationTime: submission._creationTime,
        userId: submission.userId,
        businessId: submission.businessId,
      },
      claims: activeClaims,
      submitter: {
        name: submitter?.fullName || submitter?.email || "Unknown",
        email: submitter?.email || "",
      },
      approver,
      totalsByCurrency,
      reimbursementProgress,
    };
  },
});

/**
 * List submissions awaiting the current user's approval
 */
export const getPendingApprovals = query({
  args: {
    businessId: v.string(),
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

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    // Query submissions where current user is designated approver and status is submitted
    const submissions = await ctx.db
      .query("expense_submissions")
      .withIndex("by_designatedApproverId", (q) =>
        q.eq("designatedApproverId", user._id)
      )
      .collect();

    const pendingSubmissions = submissions.filter(
      (s) =>
        s.status === "submitted" &&
        !s.deletedAt &&
        s.businessId === business._id
    );

    // Sort oldest first
    pendingSubmissions.sort((a, b) => (a.submittedAt || 0) - (b.submittedAt || 0));

    // Enrich
    const enriched = await Promise.all(
      pendingSubmissions.map(async (submission) => {
        const submitter = await ctx.db.get(submission.userId);
        const claims = await ctx.db
          .query("expense_claims")
          .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
          .collect();
        const activeClaims = claims.filter((c) => !c.deletedAt);

        const currencyMap = new Map<string, number>();
        for (const claim of activeClaims) {
          if (claim.totalAmount && claim.currency) {
            const existing = currencyMap.get(claim.currency) || 0;
            currencyMap.set(claim.currency, existing + claim.totalAmount);
          }
        }

        return {
          _id: submission._id,
          title: submission.title,
          submitterName: submitter?.fullName || submitter?.email || "Unknown",
          claimCount: activeClaims.length,
          totalsByCurrency: Array.from(currencyMap.entries()).map(
            ([currency, total]) => ({ currency, total })
          ),
          submittedAt: submission.submittedAt || submission._creationTime,
        };
      })
    );

    return enriched;
  },
});

/**
 * List ALL submissions where the current user is the designated approver (all statuses).
 * Used for the manager Expenses tab to show full approval history.
 */
export const getManagerSubmissions = query({
  args: {
    businessId: v.string(),
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

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    // All submissions where this user is the designated approver
    const submissions = await ctx.db
      .query("expense_submissions")
      .withIndex("by_designatedApproverId", (q) =>
        q.eq("designatedApproverId", user._id)
      )
      .collect();

    const filtered = submissions.filter(
      (s) => !s.deletedAt && s.businessId === business._id
    );

    // Sort: pending first (submitted), then by most recent
    filtered.sort((a, b) => {
      // submitted status sorts first
      if (a.status === "submitted" && b.status !== "submitted") return -1;
      if (b.status === "submitted" && a.status !== "submitted") return 1;
      // Within same priority, newest first
      return b._creationTime - a._creationTime;
    });

    // Enrich
    const enriched = await Promise.all(
      filtered.map(async (submission) => {
        const submitter = await ctx.db.get(submission.userId);
        const claims = await ctx.db
          .query("expense_claims")
          .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
          .collect();
        const activeClaims = claims.filter((c) => !c.deletedAt);

        const currencyMap = new Map<string, number>();
        for (const claim of activeClaims) {
          if (claim.totalAmount && claim.currency) {
            const existing = currencyMap.get(claim.currency) || 0;
            currencyMap.set(claim.currency, existing + claim.totalAmount);
          }
        }

        return {
          _id: submission._id,
          title: submission.title,
          status: submission.status,
          submitterName: submitter?.fullName || submitter?.email || "Unknown",
          claimCount: activeClaims.length,
          totalsByCurrency: Array.from(currencyMap.entries()).map(
            ([currency, total]) => ({ currency, total })
          ),
          submittedAt: submission.submittedAt || submission._creationTime,
          approvedAt: submission.approvedAt,
          rejectedAt: submission.rejectedAt,
        };
      })
    );

    return enriched;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new draft submission
 */
export const create = mutation({
  args: {
    businessId: v.string(),
    title: v.optional(v.string()),
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

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    // Auto-generate title if not provided
    const now = new Date();
    const title =
      args.title ||
      `Submission - ${now.toLocaleString("en-US", { month: "short" })} ${now.getFullYear()}`;

    const submissionId = await ctx.db.insert("expense_submissions", {
      businessId: business._id,
      userId: user._id,
      title,
      status: "draft",
      updatedAt: Date.now(),
    });

    return submissionId;
  },
});

/**
 * Update submission metadata (draft only)
 */
export const update = mutation({
  args: {
    id: v.string(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
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

    let submission;
    try {
      submission = await ctx.db.get(args.id as Id<"expense_submissions">);
    } catch {
      throw new Error("Submission not found");
    }

    if (!submission || submission.deletedAt) {
      throw new Error("Submission not found");
    }

    if (submission.userId !== user._id) {
      throw new Error("Not authorized");
    }

    if (submission.status !== "draft") {
      throw new Error("Can only update draft submissions");
    }

    const updateData: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) updateData.title = args.title;
    if (args.description !== undefined) updateData.description = args.description;

    await ctx.db.patch(submission._id, updateData);
    return submission._id;
  },
});

/**
 * Submit a draft submission for manager approval
 */
export const submit = mutation({
  args: {
    id: v.string(),
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

    let submission;
    try {
      submission = await ctx.db.get(args.id as Id<"expense_submissions">);
    } catch {
      throw new Error("Submission not found");
    }

    if (!submission || submission.deletedAt) {
      throw new Error("Submission not found");
    }

    if (submission.userId !== user._id) {
      throw new Error("Only the submission owner can submit");
    }

    if (submission.status !== "draft") {
      throw new Error("Can only submit draft submissions");
    }

    // Fetch all claims
    const claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
      .collect();

    const activeClaims = claims.filter((c) => !c.deletedAt);

    if (activeClaims.length === 0) {
      throw new Error("Cannot submit: submission has no claims");
    }

    // Check for claims still processing
    const processingClaims = activeClaims.filter((c) =>
      PROCESSING_STATUSES.includes(c.status)
    );
    if (processingClaims.length > 0) {
      throw new Error("Cannot submit: some claims are still being processed");
    }

    // Resolve designated approver using same logic as expenseClaims.updateStatus
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", submission.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    let designatedApproverId: Id<"users"> | null = null;

    // Step 1: If submitter has assigned manager, route to them
    if (membership.managerId) {
      designatedApproverId = membership.managerId;
    }
    // Step 2: For employees without manager, find any finance_admin/owner (fallback)
    else if (membership.role === "employee") {
      const allMemberships = await ctx.db
        .query("business_memberships")
        .withIndex("by_businessId", (q) =>
          q.eq("businessId", submission.businessId)
        )
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
    // Step 3: For managers/admins/owners, self-approval
    else if (["manager", "finance_admin", "owner"].includes(membership.role)) {
      designatedApproverId = user._id;
    }

    const now = Date.now();

    // Update submission
    await ctx.db.patch(submission._id, {
      status: "submitted",
      submittedAt: now,
      designatedApproverId: designatedApproverId || undefined,
      // Clear any previous rejection data
      rejectionReason: undefined,
      claimNotes: undefined,
      rejectedAt: undefined,
      updatedAt: now,
    });

    // Update all claims to submitted
    for (const claim of activeClaims) {
      await ctx.db.patch(claim._id, {
        status: "submitted",
        submittedAt: now,
        designatedApproverId: designatedApproverId || undefined,
        updatedAt: now,
      });
    }

    return {
      submissionId: submission._id,
      status: "submitted" as const,
      designatedApproverId,
    };
  },
});

/**
 * Process a single claim for approval: validate fields, create accounting entry,
 * insert normalized line items, activate vendor, and update claim status.
 *
 * Returns the accounting entry ID if created, or null if the claim was missing
 * required financial data (claim is still marked approved either way).
 */
async function approveOneClaim(
  ctx: MutationCtx,
  claim: any,
  approverUserId: Id<"users">,
  homeCurrency: string,
  now: number
): Promise<Id<"accounting_entries"> | null> {
  // Validate required fields
  if (!claim.totalAmount || !claim.currency || !claim.transactionDate) {
    console.log(`[Submission Approve] Skipping accounting entry for claim ${claim._id}: missing financial data`);
    await ctx.db.patch(claim._id, {
      status: "approved",
      approvedBy: approverUserId,
      approvedAt: now,
      updatedAt: now,
    });
    return null;
  }

  // Extract line items from processingMetadata
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
      totalAmount: item.total_amount ?? (item.unit_price ?? 0) * (item.quantity ?? 1),
      currency: item.currency || claim.currency || "MYR",
      taxAmount: item.tax_amount,
      taxRate: item.tax_rate,
      itemCategory: item.item_category,
      itemCode: item.item_code,
      unitMeasurement: item.unit_measurement,
      lineOrder: item.line_order ?? index + 1,
    }));

  // Create accounting entry
  const accountingEntryId = await ctx.db.insert("accounting_entries", {
    businessId: claim.businessId,
    userId: claim.userId,
    transactionType: "Expense",
    description: claim.businessPurpose || claim.description || "Expense claim",
    originalAmount: claim.totalAmount,
    originalCurrency: claim.currency,
    homeCurrency: claim.homeCurrency || homeCurrency,
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

  // Schedule real-time anomaly detection for this expense
  await ctx.scheduler.runAfter(0, internal.functions.actionCenterJobs.analyzeNewTransaction, {
    transactionId: accountingEntryId,
    businessId: claim.businessId,
  });

  // Insert normalized line items
  if (lineItems.length > 0) {
    for (const item of lineItems) {
      await ctx.db.insert("line_items", {
        accountingEntryId,
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
  }

  // Vendor linking (expense claims) — link accounting entry to vendor record if found,
  // but do NOT promote expense claim merchants to "active" vendor status.
  // Active vendors should only come from actual AP supplier invoices, not employee receipts.
  if (claim.vendorName) {
    try {
      const vendor = await ctx.runQuery(internal.functions.vendors.getByName, {
        businessId: claim.businessId,
        vendorName: claim.vendorName,
      });

      if (vendor) {
        await ctx.db.patch(accountingEntryId, { vendorId: vendor._id });
        // NOTE: promoteIfProspective intentionally NOT called here.
        // Expense claim merchants stay "prospective" — only supplier invoices create active vendors.
      }
    } catch (e) {
      console.log(`[Submission Approve] Vendor link skipped for "${claim.vendorName}": ${e}`);
    }
  }

  // Update claim
  await ctx.db.patch(claim._id, {
    status: "approved",
    approvedBy: approverUserId,
    approvedAt: now,
    accountingEntryId,
    updatedAt: now,
  });

  return accountingEntryId;
}

/**
 * Approve an entire submission (manager action)
 */
export const approve = mutation({
  args: {
    id: v.string(),
    notes: v.optional(v.string()),
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

    let submission;
    try {
      submission = await ctx.db.get(args.id as Id<"expense_submissions">);
    } catch {
      throw new Error("Submission not found");
    }

    if (!submission || submission.deletedAt) {
      throw new Error("Submission not found");
    }

    if (submission.status !== "submitted") {
      throw new Error("Can only approve submitted submissions");
    }

    // Verify designated approver
    if (submission.designatedApproverId && submission.designatedApproverId !== user._id) {
      throw new Error("Only the designated approver can approve this submission");
    }

    const now = Date.now();

    // Get business for home currency
    const business = await ctx.db.get(submission.businessId);
    const homeCurrency = business?.homeCurrency || "SGD";

    // Fetch all claims
    const claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
      .collect();

    const activeClaims = claims.filter((c) => !c.deletedAt);

    let accountingEntriesCreated = 0;

    // Approve each claim and create accounting entries
    for (const claim of activeClaims) {
      const entryId = await approveOneClaim(ctx, claim, user._id, homeCurrency, now);
      if (entryId) accountingEntriesCreated++;
    }

    // Update submission
    await ctx.db.patch(submission._id, {
      status: "approved",
      approvedBy: user._id,
      approvedAt: now,
      updatedAt: now,
    });

    console.log(`[Submission Approve] Approved submission ${submission._id} with ${accountingEntriesCreated} accounting entries`);

    return {
      submissionId: submission._id,
      status: "approved" as const,
      accountingEntriesCreated,
    };
  },
});

/**
 * Partially approve a submission: approve selected claims, move remaining
 * claims to a new draft submission for the employee to revise and resubmit.
 */
export const approvePartial = mutation({
  args: {
    id: v.string(),
    approvedClaimIds: v.array(v.string()),
    rejectionReason: v.optional(v.string()),
    claimNotes: v.optional(
      v.array(
        v.object({
          claimId: v.string(),
          note: v.string(),
        })
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

    let submission;
    try {
      submission = await ctx.db.get(args.id as Id<"expense_submissions">);
    } catch {
      throw new Error("Submission not found");
    }

    if (!submission || submission.deletedAt) {
      throw new Error("Submission not found");
    }

    if (submission.status !== "submitted") {
      throw new Error("Can only approve submitted submissions");
    }

    // Verify designated approver
    if (submission.designatedApproverId && submission.designatedApproverId !== user._id) {
      throw new Error("Only the designated approver can approve this submission");
    }

    // Fetch all active claims
    const claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
      .collect();
    const activeClaims = claims.filter((c) => !c.deletedAt);

    // Partition claims
    const approvedIdSet = new Set(args.approvedClaimIds);
    const approvedClaims = activeClaims.filter((c) => approvedIdSet.has(c._id));
    const rejectedClaims = activeClaims.filter((c) => !approvedIdSet.has(c._id));

    if (approvedClaims.length === 0) {
      throw new Error("At least one claim must be approved. Use reject to reject the entire submission.");
    }

    const now = Date.now();

    // Get business for home currency
    const business = await ctx.db.get(submission.businessId);
    const homeCurrency = business?.homeCurrency || "SGD";

    // If ALL claims are approved, short-circuit to full approve (no split needed)
    if (rejectedClaims.length === 0) {
      let accountingEntriesCreated = 0;
      for (const claim of approvedClaims) {
        const entryId = await approveOneClaim(ctx, claim, user._id, homeCurrency, now);
        if (entryId) accountingEntriesCreated++;
      }

      await ctx.db.patch(submission._id, {
        status: "approved",
        approvedBy: user._id,
        approvedAt: now,
        updatedAt: now,
      });

      console.log(`[Submission Approve Partial] All claims approved for ${submission._id}, no split needed`);

      return {
        submissionId: submission._id,
        newDraftSubmissionId: null as string | null,
        accountingEntriesCreated,
        rejectedClaimsCount: 0,
      };
    }

    // --- Partial approval: approve selected, split the rest ---

    // 1. Approve selected claims
    let accountingEntriesCreated = 0;
    for (const claim of approvedClaims) {
      const entryId = await approveOneClaim(ctx, claim, user._id, homeCurrency, now);
      if (entryId) accountingEntriesCreated++;
    }

    // 2. Create new draft submission for rejected claims
    const claimNotes = args.claimNotes?.map((note) => ({
      claimId: note.claimId as Id<"expense_claims">,
      note: note.note,
    }));

    const newDraftSubmissionId = await ctx.db.insert("expense_submissions", {
      businessId: submission.businessId,
      userId: submission.userId,
      title: `Returned: ${submission.title}`,
      status: "draft",
      rejectionReason: args.rejectionReason,
      claimNotes: claimNotes,
      rejectedAt: now,
      updatedAt: now,
    });

    // 3. Move rejected claims to the new draft submission
    for (const claim of rejectedClaims) {
      await ctx.db.patch(claim._id, {
        submissionId: newDraftSubmissionId,
        status: "draft",
        designatedApproverId: undefined,
        submittedAt: undefined,
        updatedAt: now,
      });
    }

    // 4. Mark original submission as approved
    await ctx.db.patch(submission._id, {
      status: "approved",
      approvedBy: user._id,
      approvedAt: now,
      updatedAt: now,
    });

    console.log(`[Submission Approve Partial] Approved ${approvedClaims.length} claims, returned ${rejectedClaims.length} claims to new draft ${newDraftSubmissionId}`);

    return {
      submissionId: submission._id,
      newDraftSubmissionId: newDraftSubmissionId as string,
      accountingEntriesCreated,
      rejectedClaimsCount: rejectedClaims.length,
    };
  },
});

/**
 * Reject an entire submission (manager action)
 * Submission goes back to "draft", all claims reset to "draft"
 */
export const reject = mutation({
  args: {
    id: v.string(),
    reason: v.string(),
    claimNotes: v.optional(
      v.array(
        v.object({
          claimId: v.string(),
          note: v.string(),
        })
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

    let submission;
    try {
      submission = await ctx.db.get(args.id as Id<"expense_submissions">);
    } catch {
      throw new Error("Submission not found");
    }

    if (!submission || submission.deletedAt) {
      throw new Error("Submission not found");
    }

    if (submission.status !== "submitted") {
      throw new Error("Can only reject submitted submissions");
    }

    if (submission.designatedApproverId && submission.designatedApproverId !== user._id) {
      throw new Error("Only the designated approver can reject this submission");
    }

    const now = Date.now();

    // Fetch and reset all claims to draft
    const claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
      .collect();

    const activeClaims = claims.filter((c) => !c.deletedAt);

    for (const claim of activeClaims) {
      await ctx.db.patch(claim._id, {
        status: "draft",
        designatedApproverId: undefined,
        submittedAt: undefined,
        updatedAt: now,
      });
    }

    // Convert claim notes to use proper IDs
    const claimNotes = args.claimNotes?.map((note) => ({
      claimId: note.claimId as Id<"expense_claims">,
      note: note.note,
    }));

    // Update submission back to draft with rejection info
    await ctx.db.patch(submission._id, {
      status: "draft",
      rejectionReason: args.reason,
      claimNotes: claimNotes,
      rejectedAt: now,
      designatedApproverId: undefined,
      updatedAt: now,
    });

    return {
      submissionId: submission._id,
      status: "draft" as const,
      rejectedAt: now,
    };
  },
});

/**
 * Soft-delete a draft submission and its claims
 */
export const softDelete = mutation({
  args: {
    id: v.string(),
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

    let submission;
    try {
      submission = await ctx.db.get(args.id as Id<"expense_submissions">);
    } catch {
      throw new Error("Submission not found");
    }

    if (!submission || submission.deletedAt) {
      throw new Error("Submission not found");
    }

    if (submission.userId !== user._id) {
      throw new Error("Not authorized");
    }

    if (submission.status !== "draft") {
      throw new Error("Can only delete draft submissions");
    }

    const now = Date.now();

    // Soft-delete all linked claims
    const claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
      .collect();

    for (const claim of claims) {
      if (!claim.deletedAt) {
        await ctx.db.patch(claim._id, { deletedAt: now, updatedAt: now });
      }
    }

    // Soft-delete the submission
    await ctx.db.patch(submission._id, { deletedAt: now, updatedAt: now });

    return { deleted: true };
  },
});

/**
 * Remove a claim from a submission
 */
export const removeClaim = mutation({
  args: {
    submissionId: v.string(),
    claimId: v.string(),
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

    let submission;
    try {
      submission = await ctx.db.get(args.submissionId as Id<"expense_submissions">);
    } catch {
      throw new Error("Submission not found");
    }

    if (!submission || submission.deletedAt) {
      throw new Error("Submission not found");
    }

    if (submission.userId !== user._id) {
      throw new Error("Not authorized");
    }

    if (submission.status !== "draft") {
      throw new Error("Can only remove claims from draft submissions");
    }

    let claim;
    try {
      claim = await ctx.db.get(args.claimId as Id<"expense_claims">);
    } catch {
      throw new Error("Claim not found");
    }

    if (!claim || claim.deletedAt) {
      throw new Error("Claim not found");
    }

    const now = Date.now();

    // Soft-delete the claim and clear submissionId
    await ctx.db.patch(claim._id, {
      deletedAt: now,
      submissionId: undefined,
      updatedAt: now,
    });

    // Count remaining claims
    const remainingClaims = await ctx.db
      .query("expense_claims")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
      .collect();
    const activeRemaining = remainingClaims.filter((c) => !c.deletedAt);

    return {
      removed: true,
      remainingClaims: activeRemaining.length,
    };
  },
});

// ============================================
// INTERNAL FUNCTIONS
// ============================================

/**
 * Cleanup empty draft submissions older than 24 hours
 */
export const cleanupEmptyDrafts = internalMutation({
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago

    const draftSubmissions = await ctx.db
      .query("expense_submissions")
      .withIndex("by_status", (q) => q.eq("status", "draft"))
      .collect();

    let deletedCount = 0;

    for (const submission of draftSubmissions) {
      if (submission.deletedAt) continue;
      if (submission._creationTime > cutoff) continue;

      // Count claims
      const claims = await ctx.db
        .query("expense_claims")
        .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
        .collect();

      const activeClaims = claims.filter((c) => !c.deletedAt);

      if (activeClaims.length === 0) {
        // Hard-delete the empty draft
        await ctx.db.delete(submission._id);
        deletedCount++;
      }
    }

    console.log(`[Cleanup] Deleted ${deletedCount} empty draft submissions`);
    return { deletedCount };
  },
});

/**
 * Check if all claims in a submission are reimbursed and auto-transition
 */
export const checkReimbursementComplete = internalMutation({
  args: {
    submissionId: v.id("expense_submissions"),
  },
  handler: async (ctx, args) => {
    const submission = await ctx.db.get(args.submissionId);
    if (!submission || submission.status !== "approved") {
      return { transitioned: false };
    }

    const claims = await ctx.db
      .query("expense_claims")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", submission._id))
      .collect();

    const activeClaims = claims.filter((c) => !c.deletedAt);

    if (activeClaims.length === 0) {
      return { transitioned: false };
    }

    const allReimbursed = activeClaims.every((c) => c.status === "reimbursed");

    if (allReimbursed) {
      await ctx.db.patch(submission._id, {
        status: "reimbursed",
        reimbursedAt: Date.now(),
        updatedAt: Date.now(),
      });
      console.log(`[Reimbursement] Submission ${submission._id} auto-transitioned to reimbursed`);
      return { transitioned: true };
    }

    return { transitioned: false };
  },
});

/**
 * One-time migration for pre-existing draft claims without submissionId
 */
export const migrateDraftClaims = internalMutation({
  handler: async (ctx) => {
    // Query all draft claims without a submissionId
    const allClaims = await ctx.db
      .query("expense_claims")
      .withIndex("by_status", (q) => q.eq("status", "draft"))
      .collect();

    const unlinkedDrafts = allClaims.filter(
      (c) => !c.submissionId && !c.deletedAt
    );

    let migratedCount = 0;
    const now = Date.now();
    const dateStr = new Date(now).toLocaleString("en-US", {
      month: "short",
      year: "numeric",
    });

    for (const claim of unlinkedDrafts) {
      const title = claim.vendorName
        ? `${claim.vendorName} - ${dateStr}`
        : `Submission - ${dateStr}`;

      const submissionId = await ctx.db.insert("expense_submissions", {
        businessId: claim.businessId,
        userId: claim.userId,
        title,
        status: "draft",
        updatedAt: now,
      });

      await ctx.db.patch(claim._id, {
        submissionId,
        updatedAt: now,
      });

      migratedCount++;
    }

    console.log(`[Migration] Migrated ${migratedCount} draft claims to individual submissions`);
    return { migratedCount };
  },
});

/**
 * DIAGNOSTIC: Run from Convex dashboard to identify why a manager's approval queue is empty.
 * Checks for ID mismatches between what's stored in memberships vs what the manager resolves to.
 *
 * Usage: diagnosePendingApprovals({ businessId: "..." })
 */
export const diagnosePendingApprovals = query({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return { error: "Business not found" };

    // Who is the current user?
    const loggedInUser = identity
      ? await resolveUserByClerkId(ctx.db, identity.subject)
      : null;

    // All submitted submissions for this business
    const allSubmissions = await ctx.db
      .query("expense_submissions")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const submitted = allSubmissions.filter((s) => s.status === "submitted" && !s.deletedAt);

    // What user IDs are stored as designatedApproverIds?
    const approverIds = [...new Set(submitted.map((s) => s.designatedApproverId?.toString()).filter(Boolean))];

    // Resolve approver names
    const approverDetails = await Promise.all(
      approverIds.map(async (id) => {
        const user = await ctx.db.get(id as Id<"users">);
        return { id, name: user?.fullName || user?.email, clerkUserId: user?.clerkUserId };
      })
    );

    return {
      loggedInClerkId: identity?.subject,
      loggedInConvexId: loggedInUser?._id?.toString(),
      loggedInName: loggedInUser?.fullName,
      submittedCount: submitted.length,
      submissions: submitted.map((s) => ({
        id: s._id,
        title: s.title,
        designatedApproverId: s.designatedApproverId?.toString(),
        status: s.status,
      })),
      approverIdsInSubmissions: approverDetails,
      // KEY CHECK: does loggedInConvexId match any designatedApproverId?
      isMatchFound: approverIds.includes(loggedInUser?._id?.toString() ?? ""),
    };
  },
});

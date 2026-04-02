/**
 * MCP Proposals - Convex Functions
 *
 * Handles human approval workflow for write operations in the Category 3 MCP Server.
 * Implements the proposal pattern: AI creates proposal → Human confirms → Action executes.
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { Id } from "../_generated/dataModel";

// Proposal expiration time (15 minutes)
const PROPOSAL_EXPIRATION_MS = 15 * 60 * 1000;

// Valid action types for proposals
const VALID_ACTION_TYPES = [
  "approve_expense",
  "reject_expense",
  "categorize_expense",
  "update_vendor",
  "create_expense_claim",
] as const;

type ActionType = (typeof VALID_ACTION_TYPES)[number];

/**
 * Create a new proposal for a write operation
 * Returns a proposal_id that must be confirmed by a human
 */
export const createProposal = mutation({
  args: {
    businessId: v.string(),
    actionType: v.string(),
    targetId: v.string(),
    parameters: v.any(),
    summary: v.string(),
    createdByApiKeyId: v.optional(v.id("mcp_api_keys")),
  },
  handler: async (ctx, args) => {
    // Validate action type
    if (!VALID_ACTION_TYPES.includes(args.actionType as ActionType)) {
      throw new Error(`Invalid action type: ${args.actionType}. Valid types: ${VALID_ACTION_TYPES.join(", ")}`);
    }

    // Create proposal with expiration
    const now = Date.now();
    const expiresAt = now + PROPOSAL_EXPIRATION_MS;

    const proposalId = await ctx.db.insert("mcp_proposals", {
      businessId: args.businessId,
      actionType: args.actionType,
      targetId: args.targetId,
      parameters: args.parameters,
      summary: args.summary,
      status: "pending",
      createdAt: now,
      expiresAt,
      createdByApiKeyId: args.createdByApiKeyId,
    });

    return {
      proposalId,
      expiresAt,
      expiresInSeconds: Math.floor(PROPOSAL_EXPIRATION_MS / 1000),
    };
  },
});

/**
 * Get a proposal by ID
 */
export const getProposal = query({
  args: {
    proposalId: v.id("mcp_proposals"),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) {
      return { found: false, error: "PROPOSAL_NOT_FOUND" };
    }

    // Check if expired
    const isExpired = proposal.status === "pending" && proposal.expiresAt < Date.now();

    return {
      found: true,
      proposal: {
        _id: proposal._id,
        businessId: proposal.businessId,
        actionType: proposal.actionType,
        targetId: proposal.targetId,
        parameters: proposal.parameters,
        summary: proposal.summary,
        status: isExpired ? "expired" : proposal.status,
        createdAt: proposal.createdAt,
        expiresAt: proposal.expiresAt,
        confirmedAt: proposal.confirmedAt,
        cancelledAt: proposal.cancelledAt,
        executedAt: proposal.executedAt,
        executionResult: proposal.executionResult,
      },
    };
  },
});

/**
 * Confirm a proposal and execute the action
 */
export const confirmProposal = mutation({
  args: {
    proposalId: v.id("mcp_proposals"),
    confirmedByUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) {
      return { success: false, error: "PROPOSAL_NOT_FOUND" };
    }

    // Check if already processed
    if (proposal.status !== "pending") {
      return {
        success: false,
        error: `PROPOSAL_ALREADY_${proposal.status.toUpperCase()}`,
        currentStatus: proposal.status,
      };
    }

    // Check if expired
    if (proposal.expiresAt < Date.now()) {
      await ctx.db.patch(args.proposalId, { status: "expired" });
      return { success: false, error: "PROPOSAL_EXPIRED" };
    }

    // Mark as confirmed
    await ctx.db.patch(args.proposalId, {
      status: "confirmed",
      confirmedAt: Date.now(),
      confirmedByUserId: args.confirmedByUserId,
    });

    // Execute the action
    let executionResult: Record<string, unknown>;
    try {
      executionResult = await executeProposalAction(ctx, proposal);

      // Mark as executed
      await ctx.db.patch(args.proposalId, {
        status: "executed",
        executedAt: Date.now(),
        executionResult,
      });

      return { success: true, result: executionResult };
    } catch (error) {
      // Mark as failed
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      await ctx.db.patch(args.proposalId, {
        status: "failed",
        executionResult: { error: true, message: errorMessage },
      });

      return { success: false, error: "EXECUTION_FAILED", message: errorMessage };
    }
  },
});

/**
 * Cancel a pending proposal
 */
export const cancelProposal = mutation({
  args: {
    proposalId: v.id("mcp_proposals"),
    cancelledByUserId: v.optional(v.id("users")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const proposal = await ctx.db.get(args.proposalId);
    if (!proposal) {
      return { success: false, error: "PROPOSAL_NOT_FOUND" };
    }

    // Check if already processed
    if (proposal.status !== "pending") {
      return {
        success: false,
        error: `PROPOSAL_ALREADY_${proposal.status.toUpperCase()}`,
        currentStatus: proposal.status,
      };
    }

    // Mark as cancelled
    await ctx.db.patch(args.proposalId, {
      status: "cancelled",
      cancelledAt: Date.now(),
      cancelledByUserId: args.cancelledByUserId,
      cancellationReason: args.reason,
    });

    return { success: true };
  },
});

/**
 * List proposals for a business with optional filters
 */
export const listProposals = query({
  args: {
    businessId: v.string(),
    status: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let proposalsQuery = ctx.db
      .query("mcp_proposals")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId));

    // Filter by status if provided
    const proposals = await proposalsQuery.order("desc").take(args.limit ?? 50);

    // Apply status filter in memory (Convex doesn't support multiple index conditions)
    const filteredProposals = args.status
      ? proposals.filter((p) => {
          // Handle expired check for pending proposals
          if (args.status === "expired") {
            return p.status === "pending" && p.expiresAt < Date.now();
          }
          if (args.status === "pending") {
            return p.status === "pending" && p.expiresAt >= Date.now();
          }
          return p.status === args.status;
        })
      : proposals.map((p) => ({
          ...p,
          // Mark as expired if applicable
          status: p.status === "pending" && p.expiresAt < Date.now() ? "expired" : p.status,
        }));

    return filteredProposals;
  },
});

/**
 * Cleanup expired proposals (called by cron job)
 */
export const cleanupExpiredProposals = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find pending proposals that have expired
    const expiredProposals = await ctx.db
      .query("mcp_proposals")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .take(100);

    // Mark them as expired
    let count = 0;
    for (const proposal of expiredProposals) {
      await ctx.db.patch(proposal._id, { status: "expired" });
      count++;
    }

    return { expiredCount: count };
  },
});

/**
 * Execute the action associated with a confirmed proposal
 * This is where the actual business logic lives
 */
async function executeProposalAction(
  ctx: { db: any },
  proposal: {
    actionType: string;
    targetId: string;
    parameters?: unknown;
    businessId: string;
  }
): Promise<Record<string, unknown>> {
  switch (proposal.actionType) {
    case "approve_expense": {
      // Find the expense claim
      const expenseId = proposal.targetId as Id<"expense_claims">;
      const expense = await ctx.db.get(expenseId);
      if (!expense) {
        throw new Error("Expense claim not found");
      }
      if (expense.businessId !== proposal.businessId) {
        throw new Error("Expense does not belong to this business");
      }

      // Update status to approved
      await ctx.db.patch(expenseId, {
        status: "approved",
        approvedAt: Date.now(),
      });

      return {
        action: "approve_expense",
        expenseId: proposal.targetId,
        previousStatus: expense.status,
        newStatus: "approved",
      };
    }

    case "reject_expense": {
      const params = proposal.parameters as { reason?: string } | undefined;
      const expenseId = proposal.targetId as Id<"expense_claims">;
      const expense = await ctx.db.get(expenseId);
      if (!expense) {
        throw new Error("Expense claim not found");
      }
      if (expense.businessId !== proposal.businessId) {
        throw new Error("Expense does not belong to this business");
      }

      // Update status to rejected
      await ctx.db.patch(expenseId, {
        status: "rejected",
        rejectedAt: Date.now(),
        rejectionReason: params?.reason,
      });

      return {
        action: "reject_expense",
        expenseId: proposal.targetId,
        previousStatus: expense.status,
        newStatus: "rejected",
        reason: params?.reason,
      };
    }

    case "categorize_expense": {
      const params = proposal.parameters as { category: string; categoryName: string };
      const expenseId = proposal.targetId as Id<"expense_claims">;
      const expense = await ctx.db.get(expenseId);
      if (!expense) {
        throw new Error("Expense claim not found");
      }
      if (expense.businessId !== proposal.businessId) {
        throw new Error("Expense does not belong to this business");
      }

      // Update category
      const previousCategory = expense.category;
      await ctx.db.patch(expenseId, {
        category: params.category,
        categoryName: params.categoryName,
      });

      return {
        action: "categorize_expense",
        expenseId: proposal.targetId,
        previousCategory,
        newCategory: params.category,
        categoryName: params.categoryName,
      };
    }

    case "update_vendor": {
      const params = proposal.parameters as { vendorName?: string; notes?: string };
      const expenseId = proposal.targetId as Id<"expense_claims">;
      const expense = await ctx.db.get(expenseId);
      if (!expense) {
        throw new Error("Expense claim not found");
      }
      if (expense.businessId !== proposal.businessId) {
        throw new Error("Expense does not belong to this business");
      }

      // Update vendor info
      const updates: Record<string, unknown> = {};
      if (params.vendorName) updates.vendorName = params.vendorName;
      if (params.notes) updates.notes = params.notes;

      await ctx.db.patch(expenseId, updates);

      return {
        action: "update_vendor",
        expenseId: proposal.targetId,
        updatedFields: Object.keys(updates),
      };
    }

    case "create_expense_claim": {
      // Create a draft expense claim from receipt attachments (chat receipt flow)
      const params = proposal.parameters as {
        attachments: Array<{ s3Path: string; mimeType: string; filename: string }>;
        businessPurpose?: string;
        userId?: string;
        userName?: string;
      };

      if (!params.userId) {
        throw new Error("userId is required to create expense claims");
      }

      const userId = params.userId as Id<"users">;

      // Find existing draft submission for this user, or create a new one
      // (all receipts in the same session batch into one submission)
      const allUserSubmissions = await ctx.db
        .query("expense_submissions")
        .withIndex("by_businessId_userId", (q: any) =>
          q.eq("businessId", proposal.businessId).eq("userId", userId)
        )
        .collect();

      let submissionId: Id<"expense_submissions">;
      const draftSubmission = allUserSubmissions
        .filter((s: any) => s.status === "draft" && !s.deletedAt)
        .sort((a: any, b: any) => b._creationTime - a._creationTime)[0];

      if (draftSubmission) {
        submissionId = draftSubmission._id;
      } else {
        const now = new Date();
        const title = `Chat Upload - ${now.toLocaleString("en-US", { month: "short", day: "numeric" })} ${now.getFullYear()}`;
        submissionId = await ctx.db.insert("expense_submissions", {
          businessId: proposal.businessId as Id<"businesses">,
          userId,
          title,
          status: "draft",
          updatedAt: Date.now(),
        });
      }

      // Create expense claims for each attachment
      const claimIds: string[] = [];
      for (const att of params.attachments) {
        const claimId = await ctx.db.insert("expense_claims", {
          businessId: proposal.businessId as Id<"businesses">,
          userId,
          submissionId,
          businessPurpose: params.businessPurpose || `Receipt: ${att.filename}`,
          storagePath: att.s3Path,
          fileName: att.filename,
          fileType: att.mimeType,
          status: "draft",
          updatedAt: Date.now(),
        });
        claimIds.push(claimId);
      }

      return {
        action: "create_expense_claim",
        submissionId,
        claimIds,
        claimCount: claimIds.length,
        message: `Created ${claimIds.length} draft expense claim(s) in submission report`,
      };
    }

    default:
      throw new Error(`Unknown action type: ${proposal.actionType}`);
  }
}

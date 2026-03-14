/**
 * Expense Claim Integration
 *
 * Creates journal entries when expense claims are approved/reimbursed.
 * Hooks into expenseClaims.updateStatus() mutation.
 *
 * @see specs/001-accounting-double-entry/contracts/integration-hooks.md#hook-2-3
 */

import { internalMutation, MutationCtx } from "../../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { Id } from "../../_generated/dataModel";

/**
 * Create journal entry when expense claim is approved
 *
 * Entry: Dr. Expense (5xxx), Cr. Accounts Payable (2100)
 * Records expense liability until reimbursement
 */
export const createJournalEntryOnApproval = internalMutation({
  args: {
    claimId: v.id("expense_claims"),
  },
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.claimId);
    if (!claim) {
      throw new ConvexError({
        message: "Expense claim not found",
        code: "CLAIM_NOT_FOUND",
      });
    }

    // Get user info for entity tracking
    const user = await ctx.db.get(claim.userId);

    // Map expense category to GL account code
    // TODO: Create expense_categories table with glAccountCode field
    // For now, use simple mapping or default to 5200 (Operating Expenses)
    const categoryToAccountMap: Record<string, string> = {
      Travel: "5201",
      Meals: "5202",
      Office: "5203",
      Marketing: "5204",
      Utilities: "5205",
    };
    const glAccountCode = categoryToAccountMap[claim.expenseCategory || ""] || "5200";

    // Create journal entry
    const { entryId } = await ctx.runMutation(
      "functions/journalEntries:createInternal" as any,
      {
        businessId: claim.businessId,
        transactionDate: claim.transactionDate || new Date().toISOString().split("T")[0],
        description: `Expense: ${claim.businessPurpose || claim.description || "Expense claim"}`,
        sourceType: "expense_claim" as const,
        sourceId: claim._id,
        lines: [
          {
            accountCode: glAccountCode, // Operating Expenses
            debitAmount: claim.totalAmount || 0,
            creditAmount: 0,
            lineDescription: claim.businessPurpose || claim.description || "Expense",
            entityType: "employee" as const,
            entityId: user?._id,
            entityName: user?.fullName,
          },
          {
            accountCode: "2100", // Accounts Payable
            debitAmount: 0,
            creditAmount: claim.totalAmount || 0,
            lineDescription: `AP liability for ${user?.fullName || "employee"}`,
          },
        ],
      }
    );

    // Update expense claim with journal entry link
    await ctx.db.patch(args.claimId, {
      journalEntryId: entryId,
    });

    return { entryId, success: true };
  },
});

/**
 * Create journal entry when expense claim is reimbursed
 *
 * Entry: Dr. Accounts Payable (2100), Cr. Cash (1000)
 * Clears AP liability and reduces cash
 */
export const createJournalEntryOnReimbursement = internalMutation({
  args: {
    claimId: v.id("expense_claims"),
  },
  handler: async (ctx, args) => {
    const claim = await ctx.db.get(args.claimId);
    if (!claim) {
      throw new ConvexError({
        message: "Expense claim not found",
        code: "CLAIM_NOT_FOUND",
      });
    }

    // Get user info for entity tracking
    const user = await ctx.db.get(claim.userId);

    const reimbursementDate = new Date().toISOString().split("T")[0];

    // Create payment journal entry
    const { entryId: paymentEntryId } = await ctx.runMutation(
      "functions/journalEntries:createInternal" as any,
      {
        businessId: claim.businessId,
        transactionDate: reimbursementDate,
        description: `Payment: ${claim.businessPurpose || claim.description || "Expense reimbursement"}`,
        sourceType: "expense_claim" as const,
        sourceId: claim._id,
        lines: [
          {
            accountCode: "2100", // Accounts Payable
            debitAmount: claim.totalAmount || 0,
            creditAmount: 0,
            lineDescription: `Clear AP liability for ${user?.fullName || "employee"}`,
            entityType: "employee" as const,
            entityId: user?._id,
            entityName: user?.fullName,
          },
          {
            accountCode: "1000", // Cash
            debitAmount: 0,
            creditAmount: claim.totalAmount || 0,
            lineDescription: `Cash payment to ${user?.fullName || "employee"}`,
          },
        ],
      }
    );

    // Update expense claim with payment entry link
    await ctx.db.patch(args.claimId, {
      paymentJournalEntryId: paymentEntryId,
    });

    return { paymentEntryId, success: true };
  },
});

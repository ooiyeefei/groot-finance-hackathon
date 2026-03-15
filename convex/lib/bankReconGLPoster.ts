/**
 * Bank Recon GL Poster — Creates draft journal entries from bank transaction classifications
 *
 * Validates double-entry integrity:
 * 1. Both account IDs exist in chart_of_accounts
 * 2. Accounts are not inactive/soft-deleted
 * 3. Debit and credit accounts are different
 * 4. Amount is positive (debit total == credit total)
 */

import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

interface PostGLEntryArgs {
  businessId: Id<"businesses">;
  bankTransactionId: Id<"bank_transactions">;
  debitAccountId: Id<"chart_of_accounts">;
  creditAccountId: Id<"chart_of_accounts">;
  amount: number;
  description: string;
  transactionDate: string;
  createdBy: string;
}

/**
 * Validate posting inputs before creating journal entry.
 * Returns an error message if validation fails, null if valid.
 */
export async function validatePosting(
  ctx: MutationCtx,
  args: Pick<PostGLEntryArgs, "businessId" | "debitAccountId" | "creditAccountId" | "amount">
): Promise<string | null> {
  // Validation 1: Debit and credit accounts must be different
  if (args.debitAccountId === args.creditAccountId) {
    return "Debit and credit accounts must be different for a valid journal entry.";
  }

  // Validation 2: Amount must be positive
  if (!args.amount || args.amount <= 0) {
    return `Transaction amount must be positive. Got: ${args.amount}`;
  }

  // Validation 3: Both accounts must exist
  const debitAccount = await ctx.db.get(args.debitAccountId);
  if (!debitAccount) {
    return `Debit account not found: ${args.debitAccountId}`;
  }

  const creditAccount = await ctx.db.get(args.creditAccountId);
  if (!creditAccount) {
    return `Credit account not found: ${args.creditAccountId}`;
  }

  // Validation 4: Accounts must belong to the same business
  if (debitAccount.businessId.toString() !== args.businessId.toString()) {
    return `Debit account "${debitAccount.accountCode}" does not belong to this business.`;
  }
  if (creditAccount.businessId.toString() !== args.businessId.toString()) {
    return `Credit account "${creditAccount.accountCode}" does not belong to this business.`;
  }

  // Validation 5: Accounts must be active
  if (debitAccount.isActive === false) {
    return `Debit account "${debitAccount.accountCode} - ${debitAccount.accountName}" is inactive.`;
  }
  if (creditAccount.isActive === false) {
    return `Credit account "${creditAccount.accountCode} - ${creditAccount.accountName}" is inactive.`;
  }

  return null; // All validations passed
}

export async function createDraftJournalEntry(
  ctx: MutationCtx,
  args: PostGLEntryArgs
): Promise<Id<"journal_entries">> {
  // Run validations
  const validationError = await validatePosting(ctx, {
    businessId: args.businessId,
    debitAccountId: args.debitAccountId,
    creditAccountId: args.creditAccountId,
    amount: args.amount,
  });
  if (validationError) {
    throw new Error(validationError);
  }

  // Re-fetch accounts (validated above)
  const debitAccount = await ctx.db.get(args.debitAccountId);
  const creditAccount = await ctx.db.get(args.creditAccountId);
  if (!debitAccount || !creditAccount) {
    throw new Error("Account lookup failed after validation");
  }

  const amount = Math.abs(args.amount);

  // Generate entry number
  const existingEntries = await ctx.db
    .query("journal_entries")
    .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
    .collect();
  const entryNumber = `JE-${new Date().getFullYear()}-${String(existingEntries.length + 1).padStart(5, "0")}`;

  // Determine fiscal period
  const dateParts = args.transactionDate.split("-");
  const fiscalYear = parseInt(dateParts[0]) || new Date().getFullYear();
  const fiscalPeriod = `${dateParts[0]}-${dateParts[1] || "01"}`;

  // Create journal entry
  const jeId = await ctx.db.insert("journal_entries", {
    businessId: args.businessId,
    entryNumber,
    transactionDate: args.transactionDate,
    postingDate: new Date().toISOString().split("T")[0],
    description: `Bank Recon: ${args.description}`,
    status: "draft",
    sourceType: "bank_reconciliation",
    sourceId: args.bankTransactionId as unknown as string,
    fiscalYear,
    fiscalPeriod,
    homeCurrency: "MYR",
    totalDebit: amount,
    totalCredit: amount,
    lineCount: 2,
    isPeriodLocked: false,
    createdBy: args.createdBy,
    createdAt: Date.now(),
  });

  const now = Date.now();

  // Create debit line
  await ctx.db.insert("journal_entry_lines", {
    journalEntryId: jeId,
    businessId: args.businessId,
    lineOrder: 1,
    accountId: args.debitAccountId,
    accountCode: debitAccount.accountCode,
    accountName: debitAccount.accountName,
    accountType: debitAccount.accountType,
    debitAmount: amount,
    creditAmount: 0,
    homeCurrencyAmount: amount,
    lineDescription: args.description,
    bankReconciled: false,
    createdAt: now,
  });

  // Create credit line
  await ctx.db.insert("journal_entry_lines", {
    journalEntryId: jeId,
    businessId: args.businessId,
    lineOrder: 2,
    accountId: args.creditAccountId,
    accountCode: creditAccount.accountCode,
    accountName: creditAccount.accountName,
    accountType: creditAccount.accountType,
    debitAmount: 0,
    creditAmount: amount,
    homeCurrencyAmount: amount,
    lineDescription: args.description,
    bankReconciled: false,
    createdAt: now,
  });

  // Link bank transaction to journal entry
  await ctx.db.patch(args.bankTransactionId, {
    journalEntryId: jeId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reconciliationStatus: "posted" as any,
  });

  return jeId;
}

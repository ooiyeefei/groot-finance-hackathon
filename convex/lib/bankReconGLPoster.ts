/**
 * Bank Recon GL Poster — Creates draft journal entries from bank transaction classifications
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

export async function createDraftJournalEntry(
  ctx: MutationCtx,
  args: PostGLEntryArgs
): Promise<Id<"journal_entries">> {
  // Validate accounts exist
  const debitAccount = await ctx.db.get(args.debitAccountId);
  const creditAccount = await ctx.db.get(args.creditAccountId);

  if (!debitAccount) throw new Error(`Debit account not found: ${args.debitAccountId}`);
  if (!creditAccount) throw new Error(`Credit account not found: ${args.creditAccountId}`);
  if (args.debitAccountId === args.creditAccountId) {
    throw new Error("Debit and credit accounts must be different");
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

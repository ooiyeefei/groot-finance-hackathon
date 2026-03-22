import { Id } from "../_generated/dataModel";

/**
 * Journal Entry Creation Helpers
 *
 * These helpers create balanced journal entry line arrays for common transaction patterns.
 * All amounts use GAAP debit/credit rules:
 * - Assets & Expenses increase with DEBIT
 * - Liabilities, Equity, Revenue increase with CREDIT
 */

export interface JournalEntryLineInput {
  accountId: Id<"chart_of_accounts">;
  accountCode: string;
  accountName: string;
  debitAmount: number;
  creditAmount: number;
  lineDescription?: string;
}

/**
 * Create expense journal entry (debit expense, credit cash/AP)
 *
 * Example: Office supplies $100
 * - Debit: 5100 Office Supplies $100
 * - Credit: 1000 Cash $100
 */
export function createExpenseJournalEntry(params: {
  amount: number;
  expenseAccountId: Id<"chart_of_accounts">;
  expenseAccountCode: string;
  expenseAccountName: string;
  description: string;
  cashAccountId?: Id<"chart_of_accounts">;
  cashAccountCode?: string;
  cashAccountName?: string;
  isPayable?: boolean; // If true, credit AP instead of Cash
  apAccountId?: Id<"chart_of_accounts">;
  apAccountCode?: string;
  apAccountName?: string;
}): JournalEntryLineInput[] {
  const lines: JournalEntryLineInput[] = [
    // Debit expense account
    {
      accountId: params.expenseAccountId,
      accountCode: params.expenseAccountCode,
      accountName: params.expenseAccountName,
      debitAmount: params.amount,
      creditAmount: 0,
      lineDescription: params.description,
    },
  ];

  // Credit cash or AP
  if (params.isPayable && params.apAccountId) {
    lines.push({
      accountId: params.apAccountId,
      accountCode: params.apAccountCode || "2100",
      accountName: params.apAccountName || "Accounts Payable",
      debitAmount: 0,
      creditAmount: params.amount,
      lineDescription: `Payable - ${params.description}`,
    });
  } else {
    lines.push({
      accountId: params.cashAccountId || ("unknown" as any),
      accountCode: params.cashAccountCode || "1000",
      accountName: params.cashAccountName || "Cash",
      debitAmount: 0,
      creditAmount: params.amount,
      lineDescription: `Payment - ${params.description}`,
    });
  }

  return lines;
}

/**
 * Create vendor invoice journal entry (debit expense, credit AP)
 *
 * Example: Vendor invoice $250
 * - Debit: 5200 Operating Expenses $250
 * - Credit: 2100 Accounts Payable $250
 */
export function createInvoiceJournalEntry(params: {
  amount: number;
  expenseAccountId: Id<"chart_of_accounts">;
  expenseAccountCode: string;
  expenseAccountName: string;
  description: string;
  apAccountId?: Id<"chart_of_accounts">;
  apAccountCode?: string;
  apAccountName?: string;
}): JournalEntryLineInput[] {
  return [
    // Debit expense
    {
      accountId: params.expenseAccountId,
      accountCode: params.expenseAccountCode,
      accountName: params.expenseAccountName,
      debitAmount: params.amount,
      creditAmount: 0,
      lineDescription: params.description,
    },
    // Credit AP
    {
      accountId: params.apAccountId || ("unknown" as any),
      accountCode: params.apAccountCode || "2100",
      accountName: params.apAccountName || "Accounts Payable",
      debitAmount: 0,
      creditAmount: params.amount,
      lineDescription: `Vendor invoice - ${params.description}`,
    },
  ];
}

/**
 * Create sales invoice journal entry (debit AR, credit revenue)
 *
 * Example: Sales invoice $500
 * - Debit: 1200 Accounts Receivable $500
 * - Credit: 4100 Sales Revenue $500
 */
export function createSalesInvoiceJournalEntry(params: {
  amount: number;
  revenueAccountId: Id<"chart_of_accounts">;
  revenueAccountCode: string;
  revenueAccountName: string;
  description: string;
  arAccountId?: Id<"chart_of_accounts">;
  arAccountCode?: string;
  arAccountName?: string;
}): JournalEntryLineInput[] {
  return [
    // Debit AR
    {
      accountId: params.arAccountId || ("unknown" as any),
      accountCode: params.arAccountCode || "1200",
      accountName: params.arAccountName || "Accounts Receivable",
      debitAmount: params.amount,
      creditAmount: 0,
      lineDescription: params.description,
    },
    // Credit revenue
    {
      accountId: params.revenueAccountId,
      accountCode: params.revenueAccountCode,
      accountName: params.revenueAccountName,
      debitAmount: 0,
      creditAmount: params.amount,
      lineDescription: params.description,
    },
  ];
}

/**
 * Create payment journal entry (debit AP, credit cash)
 *
 * Example: Pay vendor $300
 * - Debit: 2100 Accounts Payable $300
 * - Credit: 1000 Cash $300
 */
export function createPaymentJournalEntry(params: {
  amount: number;
  apAccountId: Id<"chart_of_accounts">;
  apAccountCode: string;
  apAccountName: string;
  description: string;
  cashAccountId?: Id<"chart_of_accounts">;
  cashAccountCode?: string;
  cashAccountName?: string;
}): JournalEntryLineInput[] {
  return [
    // Debit AP (reduce liability)
    {
      accountId: params.apAccountId,
      accountCode: params.apAccountCode,
      accountName: params.apAccountName,
      debitAmount: params.amount,
      creditAmount: 0,
      lineDescription: `Payment - ${params.description}`,
    },
    // Credit cash
    {
      accountId: params.cashAccountId || ("unknown" as any),
      accountCode: params.cashAccountCode || "1000",
      accountName: params.cashAccountName || "Cash",
      debitAmount: 0,
      creditAmount: params.amount,
      lineDescription: `Payment - ${params.description}`,
    },
  ];
}

/**
 * Reclassify expense to inventory asset on stock-in (IAS 2)
 *
 * When AP invoice is posted, it debits 5200 Operating Expenses.
 * Stock-in reclassifies that cost to inventory asset.
 * - Debit: 1500 Inventory Asset
 * - Credit: 5200 Operating Expenses
 */
export function createInventoryStockInJournalEntry(params: {
  amount: number;
  inventoryAccountId: Id<"chart_of_accounts">;
  inventoryAccountCode?: string;
  inventoryAccountName?: string;
  expenseAccountId: Id<"chart_of_accounts">;
  expenseAccountCode?: string;
  expenseAccountName?: string;
  description: string;
}): JournalEntryLineInput[] {
  return [
    {
      accountId: params.inventoryAccountId,
      accountCode: params.inventoryAccountCode || "1500",
      accountName: params.inventoryAccountName || "Inventory Asset",
      debitAmount: params.amount,
      creditAmount: 0,
      lineDescription: params.description,
    },
    {
      accountId: params.expenseAccountId,
      accountCode: params.expenseAccountCode || "5200",
      accountName: params.expenseAccountName || "Operating Expenses",
      debitAmount: 0,
      creditAmount: params.amount,
      lineDescription: `Reclassify to inventory - ${params.description}`,
    },
  ];
}

/**
 * Record COGS on stock-out from sales (IAS 2)
 *
 * - Debit: 5100 Cost of Goods Sold
 * - Credit: 1500 Inventory Asset
 */
export function createInventoryStockOutJournalEntry(params: {
  amount: number;
  cogsAccountId: Id<"chart_of_accounts">;
  cogsAccountCode?: string;
  cogsAccountName?: string;
  inventoryAccountId: Id<"chart_of_accounts">;
  inventoryAccountCode?: string;
  inventoryAccountName?: string;
  description: string;
}): JournalEntryLineInput[] {
  return [
    {
      accountId: params.cogsAccountId,
      accountCode: params.cogsAccountCode || "5100",
      accountName: params.cogsAccountName || "Cost of Goods Sold",
      debitAmount: params.amount,
      creditAmount: 0,
      lineDescription: params.description,
    },
    {
      accountId: params.inventoryAccountId,
      accountCode: params.inventoryAccountCode || "1500",
      accountName: params.inventoryAccountName || "Inventory Asset",
      debitAmount: 0,
      creditAmount: params.amount,
      lineDescription: `Stock out - ${params.description}`,
    },
  ];
}

/**
 * Record inventory adjustment (gain or loss)
 *
 * Gain: Debit 1500 Inventory / Credit 6500 Inventory Adjustments
 * Loss: Debit 6500 Inventory Adjustments / Credit 1500 Inventory
 */
export function createInventoryAdjustmentJournalEntry(params: {
  amount: number;
  isGain: boolean;
  inventoryAccountId: Id<"chart_of_accounts">;
  inventoryAccountCode?: string;
  inventoryAccountName?: string;
  adjustmentAccountId: Id<"chart_of_accounts">;
  adjustmentAccountCode?: string;
  adjustmentAccountName?: string;
  description: string;
}): JournalEntryLineInput[] {
  if (params.isGain) {
    return [
      {
        accountId: params.inventoryAccountId,
        accountCode: params.inventoryAccountCode || "1500",
        accountName: params.inventoryAccountName || "Inventory Asset",
        debitAmount: params.amount,
        creditAmount: 0,
        lineDescription: params.description,
      },
      {
        accountId: params.adjustmentAccountId,
        accountCode: params.adjustmentAccountCode || "6500",
        accountName: params.adjustmentAccountName || "Inventory Adjustments",
        debitAmount: 0,
        creditAmount: params.amount,
        lineDescription: `Adjustment gain - ${params.description}`,
      },
    ];
  } else {
    return [
      {
        accountId: params.adjustmentAccountId,
        accountCode: params.adjustmentAccountCode || "6500",
        accountName: params.adjustmentAccountName || "Inventory Adjustments",
        debitAmount: params.amount,
        creditAmount: 0,
        lineDescription: `Adjustment loss - ${params.description}`,
      },
      {
        accountId: params.inventoryAccountId,
        accountCode: params.inventoryAccountCode || "1500",
        accountName: params.inventoryAccountName || "Inventory Asset",
        debitAmount: 0,
        creditAmount: params.amount,
        lineDescription: params.description,
      },
    ];
  }
}

/**
 * Validate that journal entry lines are balanced
 */
export function validateBalancedEntry(lines: JournalEntryLineInput[]): {
  isBalanced: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
} {
  const totalDebit = lines.reduce((sum, line) => sum + line.debitAmount, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.creditAmount, 0);
  const difference = Math.abs(totalDebit - totalCredit);

  return {
    isBalanced: difference < 0.01, // ±RM0.01 tolerance
    totalDebit,
    totalCredit,
    difference,
  };
}

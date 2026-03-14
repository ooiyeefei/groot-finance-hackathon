import { describe, it, expect } from "vitest";
import { createExpenseJournalEntry, createInvoiceJournalEntry, createSalesInvoiceJournalEntry } from "./journal-entry-helpers";

describe("Journal Entry Helpers", () => {
  it("creates balanced expense journal entry", () => {
    const lines = createExpenseJournalEntry({
      amount: 100,
      expenseAccountId: "test-account-id" as any,
      expenseAccountCode: "5100",
      expenseAccountName: "Office Supplies",
      description: "Office supplies"
    });

    const totalDebit = lines.reduce((sum, l) => sum + l.debitAmount, 0);
    const totalCredit = lines.reduce((sum, l) => sum + l.creditAmount, 0);

    expect(totalDebit).toBe(100);
    expect(totalCredit).toBe(100);
    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);
  });

  it("creates balanced invoice journal entry", () => {
    const lines = createInvoiceJournalEntry({
      amount: 250,
      expenseAccountId: "test-account-id" as any,
      expenseAccountCode: "5200",
      expenseAccountName: "Operating Expenses",
      description: "Vendor invoice"
    });

    const totalDebit = lines.reduce((sum, l) => sum + l.debitAmount, 0);
    const totalCredit = lines.reduce((sum, l) => sum + l.creditAmount, 0);

    expect(totalDebit).toBe(250);
    expect(totalCredit).toBe(250);
  });

  it("creates balanced sales invoice journal entry", () => {
    const lines = createSalesInvoiceJournalEntry({
      amount: 500,
      revenueAccountId: "test-account-id" as any,
      revenueAccountCode: "4100",
      revenueAccountName: "Sales Revenue",
      description: "Sales invoice"
    });

    const totalDebit = lines.reduce((sum, l) => sum + l.debitAmount, 0);
    const totalCredit = lines.reduce((sum, l) => sum + l.creditAmount, 0);

    expect(totalDebit).toBe(500);
    expect(totalCredit).toBe(500);
  });
});

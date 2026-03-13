/**
 * Sales Invoice Integration
 *
 * Creates journal entries when invoices are created/paid.
 * Hooks into salesInvoices mutations.
 *
 * @see specs/001-accounting-double-entry/contracts/integration-hooks.md#hook-4-5
 */

import { internalMutation, MutationCtx } from "../../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { Id } from "../../_generated/dataModel";

/**
 * Create journal entry when sales invoice is created
 *
 * Entry: Dr. AR (1200), Cr. Revenue (4100) + Cr. Sales Tax (2200)
 * Records sale as revenue and creates AR
 */
export const createJournalEntryOnInvoiceCreation = internalMutation({
  args: {
    invoiceId: v.id("sales_invoices"),
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      throw new ConvexError({
        message: "Sales invoice not found",
        code: "INVOICE_NOT_FOUND",
      });
    }

    const lines: Array<{
      accountCode: string;
      debitAmount: number;
      creditAmount: number;
      lineDescription?: string;
      entityType?: "customer" | "vendor" | "employee";
      entityId?: string;
      entityName?: string;
    }> = [];

    // Line 1: Debit Accounts Receivable (full amount)
    lines.push({
      accountCode: "1200", // Accounts Receivable
      debitAmount: invoice.totalAmount,
      creditAmount: 0,
      lineDescription: `Invoice #${invoice.invoiceNumber}`,
      entityType: "customer",
      entityId: invoice.customerId,
      entityName: invoice.customerSnapshot.businessName,
    });

    // Line 2: Credit Sales Revenue (subtotal before tax)
    lines.push({
      accountCode: "4100", // Sales Revenue
      debitAmount: 0,
      creditAmount: invoice.subtotal,
      lineDescription: "Sales revenue",
    });

    // Line 3: Credit Sales Tax Payable (if tax included)
    if (invoice.totalTax && invoice.totalTax > 0) {
      lines.push({
        accountCode: "2200", // Sales Tax Payable
        debitAmount: 0,
        creditAmount: invoice.totalTax,
        lineDescription: `Sales tax`,
      });
    }

    // Create journal entry
    const entryId = await ctx.runMutation(
      "functions/journalEntries:createInternal" as any,
      {
        businessId: invoice.businessId,
        transactionDate: invoice.invoiceDate,
        description: `Invoice #${invoice.invoiceNumber}`,
        sourceType: "sales_invoice" as const,
        sourceId: invoice._id,
        lines,
      }
    );

    // Update invoice with journal entry link
    await ctx.db.patch(args.invoiceId, {
      journalEntryId: entryId,
    });

    return { entryId, success: true };
  },
});

/**
 * Create journal entry when sales invoice is paid
 *
 * Entry: Dr. Cash (1000), Cr. AR (1200)
 * Clears AR and increases cash
 */
export const createJournalEntryOnInvoicePayment = internalMutation({
  args: {
    invoiceId: v.id("sales_invoices"),
    paymentDate: v.optional(v.string()), // YYYY-MM-DD, defaults to today
  },
  handler: async (ctx, args) => {
    const invoice = await ctx.db.get(args.invoiceId);
    if (!invoice) {
      throw new ConvexError({
        message: "Sales invoice not found",
        code: "INVOICE_NOT_FOUND",
      });
    }

    const paymentDate =
      args.paymentDate || new Date().toISOString().split("T")[0];

    // Create payment journal entry
    const paymentEntryId = await ctx.runMutation(
      "functions/journalEntries:createInternal" as any,
      {
        businessId: invoice.businessId,
        transactionDate: paymentDate,
        description: `Payment: Invoice #${invoice.invoiceNumber}`,
        sourceType: "sales_invoice" as const,
        sourceId: invoice._id,
        lines: [
          {
            accountCode: "1000", // Cash
            debitAmount: invoice.totalAmount,
            creditAmount: 0,
            lineDescription: "Cash received from customer",
          },
          {
            accountCode: "1200", // Accounts Receivable
            debitAmount: 0,
            creditAmount: invoice.totalAmount,
            lineDescription: `Clear AR for Invoice #${invoice.invoiceNumber}`,
            entityType: "customer",
            entityId: invoice.customerId,
            entityName: invoice.customerSnapshot.businessName,
          },
        ],
      }
    );

    // Update invoice with payment entry link
    await ctx.db.patch(args.invoiceId, {
      paymentJournalEntryId: paymentEntryId,
      paidAt: paymentDate,
    });

    return { paymentEntryId, success: true };
  },
});

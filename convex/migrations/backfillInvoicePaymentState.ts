/**
 * Backfill Migration: Copy payment state from accounting_entries → invoices
 *
 * One-time migration to populate the new AP subledger fields on invoices:
 * - paidAmount, paymentStatus, dueDate from the matching accounting_entry
 *
 * Usage:
 * npx convex run migrations/backfillInvoicePaymentState:backfill --prod '{}'
 * npx convex run migrations/backfillInvoicePaymentState:dryRun --prod '{}'
 */

import { internalMutation, query } from "../_generated/server";

/**
 * Dry run — preview what the backfill would do without making changes
 */
export const dryRun = query({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db.query("accounting_entries").collect();

    const invoiceEntries = entries.filter(
      (e: any) =>
        !e.deletedAt &&
        e.sourceDocumentType === "invoice" &&
        e.sourceRecordId
    );

    let matched = 0;
    let orphaned = 0;
    let alreadyHasPaymentState = 0;
    const orphanIds: string[] = [];

    for (const entry of invoiceEntries) {
      try {
        const invoice = await ctx.db.get(entry.sourceRecordId as any);
        if (!invoice || (invoice as any).deletedAt) {
          orphaned++;
          orphanIds.push(entry._id.toString());
          continue;
        }

        // Check if invoice already has payment state
        if ((invoice as any).paymentStatus) {
          alreadyHasPaymentState++;
          continue;
        }

        matched++;
      } catch {
        orphaned++;
        orphanIds.push(entry._id.toString());
      }
    }

    return {
      totalInvoiceEntries: invoiceEntries.length,
      matched,
      orphaned,
      alreadyHasPaymentState,
      orphanIds: orphanIds.slice(0, 20), // First 20 orphans for debugging
    };
  },
});

/**
 * Execute the backfill — copy payment state from accounting_entries to invoices
 */
export const backfill = internalMutation({
  args: {},
  handler: async (ctx) => {
    const entries = await ctx.db.query("accounting_entries").collect();

    const invoiceEntries = entries.filter(
      (e: any) =>
        !e.deletedAt &&
        e.sourceDocumentType === "invoice" &&
        e.sourceRecordId
    );

    let updated = 0;
    let skipped = 0;
    let orphaned = 0;
    const errors: string[] = [];

    for (const entry of invoiceEntries) {
      try {
        const invoice = await ctx.db.get(entry.sourceRecordId as any);
        if (!invoice || (invoice as any).deletedAt) {
          orphaned++;
          continue;
        }

        // Skip if invoice already has payment state
        if ((invoice as any).paymentStatus) {
          skipped++;
          continue;
        }

        // Compute payment status from accounting_entry state
        const entryAny = entry as any;
        const paidAmount = entryAny.paidAmount ?? 0;
        const originalAmount = entryAny.originalAmount ?? 0;

        let paymentStatus: "unpaid" | "partial" | "paid";
        if (entryAny.status === "paid" || paidAmount >= originalAmount) {
          paymentStatus = "paid";
        } else if (paidAmount > 0) {
          paymentStatus = "partial";
        } else {
          paymentStatus = "unpaid";
        }

        // Extract dueDate from accounting_entry
        const dueDate = entryAny.dueDate || null;

        // Patch invoice with payment fields
        const patch: Record<string, any> = {
          paidAmount,
          paymentStatus,
          updatedAt: Date.now(),
        };
        if (dueDate) {
          patch.dueDate = dueDate;
        }

        await ctx.db.patch(entry.sourceRecordId as any, patch);
        updated++;
      } catch (err) {
        errors.push(`${entry._id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    console.log(`[Backfill] Complete: ${updated} updated, ${skipped} skipped, ${orphaned} orphaned, ${errors.length} errors`);

    return {
      totalInvoiceEntries: invoiceEntries.length,
      updated,
      skipped,
      orphaned,
      errorCount: errors.length,
      errors: errors.slice(0, 10),
    };
  },
});

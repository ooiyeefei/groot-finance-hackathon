/**
 * AR Reconciliation Integration
 *
 * Creates journal entries when reconciliation period is closed.
 * Triggers from salesOrders.closePeriod() mutation.
 *
 * @see specs/001-accounting-double-entry/contracts/integration-hooks.md#hook-1
 */

import { internalMutation, MutationCtx } from "../../_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { Id } from "../../_generated/dataModel";

/**
 * Create journal entries from closed reconciliation period
 *
 * Creates 2-3 entries per matched order:
 * 1. Platform Fees (Dr. 5800, Cr. 1200)
 * 2. Cash Received (Dr. 1000, Cr. 1200)
 * 3. Variance Adjustment (if variance > 10%)
 *
 * Called by salesOrders.closePeriod()
 */
export const createJournalEntriesFromReconciliation = internalMutation({
  args: {
    businessId: v.id("businesses"),
    dateFrom: v.string(),
    dateTo: v.string(),
    closedBy: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Fetch all matched/variance orders in period
    const allOrders = await ctx.db
      .query("sales_orders")
      .withIndex("by_businessId_orderDate", (q) =>
        q.eq("businessId", args.businessId)
      )
      .collect();

    const orders = allOrders.filter(
      (o) =>
        o.orderDate >= args.dateFrom &&
        o.orderDate <= args.dateTo &&
        (o.matchStatus === "matched" || o.matchStatus === "variance") &&
        o.periodStatus !== "closed"
    );

    let entriesCreated = 0;

    for (const order of orders) {
      const entryIds: Id<"journal_entries">[] = [];

      try {
        // Get matched invoice for variance calculation
        let invoice = null;
        if (order.matchedInvoiceId) {
          invoice = await ctx.db.get(order.matchedInvoiceId);
        }

        // Use order date for transaction date
        const transactionDate = order.orderDate;

        // Entry 1: Platform Fees Expense (if platform fee exists)
        if (order.platformFee && order.platformFee > 0) {
          const feeEntryId = await ctx.runMutation(
            "functions/journalEntries:createInternal" as any,
            {
              businessId: args.businessId,
              transactionDate,
              description: `Platform fees - ${order.sourcePlatform || "Order"} #${order.orderReference}`,
              sourceType: "ar_reconciliation" as const,
              sourceId: order._id,
              lines: [
                {
                  accountCode: "5800", // Platform Fees Expense
                  debitAmount: order.platformFee,
                  creditAmount: 0,
                  lineDescription: "Platform commission fees",
                },
                {
                  accountCode: "1200", // Accounts Receivable
                  debitAmount: 0,
                  creditAmount: order.platformFee,
                  lineDescription: "Reduce AR by platform fees",
                },
              ],
            }
          );
          entryIds.push(feeEntryId);
          entriesCreated++;
        }

        // Entry 2: Cash Received (net amount = gross - platform fee)
        const netAmount = order.netAmount || order.grossAmount - (order.platformFee || 0);

        if (netAmount > 0) {
          const cashEntryId = await ctx.runMutation(
            "functions/journalEntries:createInternal" as any,
            {
              businessId: args.businessId,
              transactionDate,
              description: `Cash received - ${order.sourcePlatform || "Platform"} settlement #${order.orderReference}`,
              sourceType: "ar_reconciliation" as const,
              sourceId: order._id,
              lines: [
                {
                  accountCode: "1000", // Cash
                  debitAmount: netAmount,
                  creditAmount: 0,
                  lineDescription: "Cash received from platform",
                },
                {
                  accountCode: "1200", // Accounts Receivable
                  debitAmount: 0,
                  creditAmount: netAmount,
                  lineDescription: "Clear AR for payment",
                  entityType: order.customerName ? ("customer" as const) : undefined,
                  entityName: order.customerName,
                },
              ],
            }
          );
          entryIds.push(cashEntryId);
          entriesCreated++;
        }

        // Entry 3: Variance Adjustment (if variance > 10%)
        if (invoice && order.varianceAmount) {
          const varianceAmount = Math.abs(order.varianceAmount);
          const variancePercentage = Math.abs(order.varianceAmount / invoice.totalAmount);

          if (variancePercentage > 0.10 && varianceAmount > 0.01) {
            // Variance is a gain if order amount > invoice amount
            const isGain = order.varianceAmount > 0;

            const varianceEntryId = await ctx.runMutation(
              "functions/journalEntries:createInternal" as any,
              {
                businessId: args.businessId,
                transactionDate,
                description: `AR variance adjustment - Order #${order.orderReference} (${(variancePercentage * 100).toFixed(1)}%)`,
                sourceType: "ar_reconciliation" as const,
                sourceId: order._id,
                lines: isGain
                  ? [
                      {
                        accountCode: "1200", // Accounts Receivable
                        debitAmount: varianceAmount,
                        creditAmount: 0,
                        lineDescription: `Variance gain: ${order.varianceReason || "Amount difference"}`,
                      },
                      {
                        accountCode: "4900", // Other Income
                        debitAmount: 0,
                        creditAmount: varianceAmount,
                        lineDescription: "AR variance gain",
                      },
                    ]
                  : [
                      {
                        accountCode: "5900", // Other Expense
                        debitAmount: varianceAmount,
                        creditAmount: 0,
                        lineDescription: `Variance loss: ${order.varianceReason || "Amount difference"}`,
                      },
                      {
                        accountCode: "1200", // Accounts Receivable
                        debitAmount: 0,
                        creditAmount: varianceAmount,
                        lineDescription: "AR variance loss",
                      },
                    ],
              }
            );
            entryIds.push(varianceEntryId);
            entriesCreated++;
          }
        }

        // Update sales_order with journal entry links
        await ctx.db.patch(order._id, {
          journalEntryIds: entryIds,
          reconciledAt: Date.now(),
        });

        // Update matched invoice status to paid (if exists)
        if (order.matchedInvoiceId && invoice) {
          await ctx.db.patch(order.matchedInvoiceId, {
            status: "paid",
            paidAt: new Date().toISOString().split("T")[0], // YYYY-MM-DD format
          });
        }
      } catch (error: any) {
        console.error(
          `[AR Recon Integration] Failed to create journal entries for order ${order._id}:`,
          error
        );

        // Log error but continue with other orders
        // Period close will still succeed but this order won't have accounting entries
        // User can manually create entries or retry
        await ctx.db.patch(order._id, {
          periodStatus: "disputed", // Mark as disputed so it doesn't get lost
          varianceReason: `Accounting entry creation failed: ${error.message}`,
        });
      }
    }

    return {
      ordersProcessed: orders.length,
      entriesCreated,
      success: true,
    };
  },
});

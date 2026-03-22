/**
 * Inventory Actions - Composite operations
 *
 * receiveFromInvoice: Stock-in from AP invoice + reclassification JE
 * reverseStockOut: Reverse stock deductions when sales invoice is voided
 */

import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

export const receiveFromInvoice = action({
  args: {
    businessId: v.id("businesses"),
    invoiceId: v.id("invoices"),
    items: v.array(
      v.object({
        catalogItemId: v.id("catalog_items"),
        locationId: v.id("inventory_locations"),
        quantity: v.number(),
        unitCostOriginal: v.number(),
        unitCostOriginalCurrency: v.string(),
        unitCostHome: v.number(),
        description: v.string(),
      })
    ),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    // Calculate total cost in home currency for JE
    const totalCostHome = args.items.reduce(
      (sum, item) => sum + item.quantity * item.unitCostHome,
      0
    );

    const today = new Date().toISOString().split("T")[0];

    // 1. Create stock-in movements
    const movementIds = await ctx.runMutation(
      internal.functions.inventoryMovements.stockIn,
      {
        businessId: args.businessId,
        items: args.items.map((item) => ({
          catalogItemId: item.catalogItemId,
          locationId: item.locationId,
          quantity: item.quantity,
          unitCostOriginal: item.unitCostOriginal,
          unitCostOriginalCurrency: item.unitCostOriginalCurrency,
          unitCostHome: item.unitCostHome,
        })),
        sourceType: "ap_invoice",
        sourceId: args.invoiceId,
        date: today,
        createdBy: args.createdBy,
      }
    );

    // 2. Create reclassification JE: Dr. 1500 Inventory / Cr. 5200 Expenses
    // We need to find chart_of_accounts IDs for 1500 and 5200
    // The JE helper creates the line structure, but createInternal needs accountCode-based lines
    const journalResult = await ctx.runMutation(
      internal.functions.journalEntries.createInternal,
      {
        businessId: args.businessId,
        transactionDate: today,
        description: `Inventory receipt from AP invoice`,
        sourceType: "vendor_invoice",
        sourceId: args.invoiceId,
        lines: [
          {
            accountCode: "1500",
            debitAmount: Math.round(totalCostHome * 100) / 100,
            creditAmount: 0,
            lineDescription: "Reclassify to inventory asset",
          },
          {
            accountCode: "5200",
            debitAmount: 0,
            creditAmount: Math.round(totalCostHome * 100) / 100,
            lineDescription: "Reclassify from operating expenses",
          },
        ],
      }
    );

    // 3. Mark invoice as inventory-received
    await ctx.runMutation(internal.functions.inventoryActions.markInvoiceReceived, {
      invoiceId: args.invoiceId,
    });

    return {
      movementIds,
      journalEntryId: journalResult.entryId,
    };
  },
});

// Internal mutation to mark invoice as received (cannot patch from action directly)
import { internalMutation } from "../_generated/server";

export const markInvoiceReceived = internalMutation({
  args: {
    invoiceId: v.id("invoices"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.invoiceId, {
      inventoryReceivedAt: Date.now(),
    });
  },
});

export const reverseStockOut = internalAction({
  args: {
    businessId: v.id("businesses"),
    salesInvoiceId: v.id("sales_invoices"),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    // Find all stock_out movements for this sales invoice
    const movements = await ctx.runQuery(
      internal.functions.inventoryActions.getMovementsBySource,
      {
        sourceType: "sales_invoice",
        sourceId: args.salesInvoiceId,
      }
    );

    if (movements.length === 0) return;

    const today = new Date().toISOString().split("T")[0];

    // Create reversal stock-in movements
    const reversalItems = movements.map((m: any) => ({
      catalogItemId: m.catalogItemId,
      locationId: m.locationId,
      quantity: Math.abs(m.quantity), // Reverse the negative
    }));

    await ctx.runMutation(internal.functions.inventoryMovements.stockIn, {
      businessId: args.businessId,
      items: reversalItems.map((item: any) => ({
        ...item,
        unitCostOriginal: 0,
        unitCostOriginalCurrency: "",
        unitCostHome: 0,
      })),
      sourceType: "void_reversal",
      sourceId: args.salesInvoiceId,
      date: today,
      createdBy: args.createdBy,
    });
  },
});

// Internal query for fetching movements by source
import { internalQuery } from "../_generated/server";

export const getMovementsBySource = internalQuery({
  args: {
    sourceType: v.string(),
    sourceId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("inventory_movements")
      .withIndex("by_sourceType_sourceId", (q) =>
        q.eq("sourceType", args.sourceType).eq("sourceId", args.sourceId)
      )
      .collect();
  },
});

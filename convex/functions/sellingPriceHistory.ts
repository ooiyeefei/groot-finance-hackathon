/**
 * Selling Price History Functions (032-price-history-tracking)
 *
 * Captures and queries selling price observations from sales invoices.
 * Uses action + internalQuery pattern for bandwidth-safe reads.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery, action } from "../_generated/server";
import { internal } from "../_generated/api";

// ---------------------------------------------------------------------------
// Internal Mutations
// ---------------------------------------------------------------------------

/**
 * Record selling price observations when a sales invoice is sent.
 * Called by salesInvoices.send() via scheduler.
 */
export const recordFromSalesInvoice = internalMutation({
  args: {
    businessId: v.id("businesses"),
    salesInvoiceId: v.id("sales_invoices"),
    customerId: v.optional(v.id("customers")),
    invoiceDate: v.string(),
    lineItems: v.array(
      v.object({
        catalogItemId: v.id("catalog_items"),
        unitPrice: v.number(),
        quantity: v.number(),
        currency: v.string(),
        totalAmount: v.number(),
        itemDescription: v.string(),
        itemCode: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    let recordsCreated = 0;

    for (const item of args.lineItems) {
      // Dedup check: don't create duplicate records for same invoice + catalog item
      const existing = await ctx.db
        .query("selling_price_history")
        .withIndex("by_invoice", (q) => q.eq("salesInvoiceId", args.salesInvoiceId))
        .filter((q) => q.eq(q.field("catalogItemId"), item.catalogItemId))
        .first();

      if (existing) continue;

      await ctx.db.insert("selling_price_history", {
        businessId: args.businessId,
        catalogItemId: item.catalogItemId,
        customerId: args.customerId,
        salesInvoiceId: args.salesInvoiceId,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        currency: item.currency,
        totalAmount: item.totalAmount,
        invoiceDate: args.invoiceDate,
        itemDescription: item.itemDescription,
        itemCode: item.itemCode,
        isZeroPrice: item.unitPrice === 0,
        createdAt: Date.now(),
      });
      recordsCreated++;
    }

    return { recordsCreated };
  },
});

/**
 * Archive (soft-delete) selling price records when a sales invoice is voided.
 * Called by salesInvoices.voidInvoice() via scheduler.
 */
export const archiveBySalesInvoice = internalMutation({
  args: {
    salesInvoiceId: v.id("sales_invoices"),
  },
  handler: async (ctx, args) => {
    const records = await ctx.db
      .query("selling_price_history")
      .withIndex("by_invoice", (q) => q.eq("salesInvoiceId", args.salesInvoiceId))
      .collect();

    let recordsArchived = 0;
    const now = Date.now();

    for (const record of records) {
      if (!record.archivedAt) {
        await ctx.db.patch(record._id, { archivedAt: now });
        recordsArchived++;
      }
    }

    return { recordsArchived };
  },
});

// ---------------------------------------------------------------------------
// Internal Queries (called by actions for bandwidth safety)
// ---------------------------------------------------------------------------

export const _getSalesHistory = internalQuery({
  args: {
    businessId: v.id("businesses"),
    catalogItemId: v.id("catalog_items"),
    customerId: v.optional(v.id("customers")),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxResults = args.limit ?? 100;

    let records = await ctx.db
      .query("selling_price_history")
      .withIndex("by_catalogItem_business", (q) =>
        q.eq("catalogItemId", args.catalogItemId).eq("businessId", args.businessId)
      )
      .collect();

    // Filter out archived records
    records = records.filter((r) => !r.archivedAt);

    // Apply customer filter
    if (args.customerId) {
      records = records.filter((r) => r.customerId === args.customerId);
    }

    // Apply date range filters
    if (args.startDate) {
      records = records.filter((r) => r.invoiceDate >= args.startDate!);
    }
    if (args.endDate) {
      records = records.filter((r) => r.invoiceDate <= args.endDate!);
    }

    // Sort by invoiceDate desc, then createdAt desc (tiebreaker)
    records.sort((a, b) => {
      const dateCmp = b.invoiceDate.localeCompare(a.invoiceDate);
      if (dateCmp !== 0) return dateCmp;
      return b.createdAt - a.createdAt;
    });

    const totalCount = records.length;

    // Apply limit
    records = records.slice(0, maxResults);

    // Resolve customer names
    const customerIds = [...new Set(records.map((r) => r.customerId).filter(Boolean))];
    const customerMap: Record<string, string> = {};
    for (const cId of customerIds) {
      if (cId) {
        const customer = await ctx.db.get(cId);
        if (customer) {
          customerMap[cId] = customer.businessName;
        }
      }
    }

    // Resolve invoice numbers
    const invoiceIds = [...new Set(records.map((r) => r.salesInvoiceId))];
    const invoiceMap: Record<string, string> = {};
    for (const invId of invoiceIds) {
      const inv = await ctx.db.get(invId);
      if (inv) {
        invoiceMap[invId] = (inv as any).invoiceNumber || invId;
      }
    }

    const enrichedRecords = records.map((r) => ({
      _id: r._id,
      unitPrice: r.unitPrice,
      quantity: r.quantity,
      currency: r.currency,
      totalAmount: r.totalAmount,
      invoiceDate: r.invoiceDate,
      itemDescription: r.itemDescription,
      itemCode: r.itemCode,
      isZeroPrice: r.isZeroPrice,
      customerName: r.customerId ? customerMap[r.customerId] || "Unknown" : "Unknown",
      invoiceNumber: invoiceMap[r.salesInvoiceId] || "—",
      customerId: r.customerId,
      salesInvoiceId: r.salesInvoiceId,
    }));

    // Latest price (most recent by invoiceDate)
    const latestPrice =
      enrichedRecords.length > 0
        ? {
            unitPrice: enrichedRecords[0].unitPrice,
            currency: enrichedRecords[0].currency,
            date: enrichedRecords[0].invoiceDate,
          }
        : null;

    return { records: enrichedRecords, totalCount, latestPrice };
  },
});

export const _getSalesPriceTrend = internalQuery({
  args: {
    businessId: v.id("businesses"),
    catalogItemId: v.id("catalog_items"),
    customerId: v.optional(v.id("customers")),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let records = await ctx.db
      .query("selling_price_history")
      .withIndex("by_catalogItem_business", (q) =>
        q.eq("catalogItemId", args.catalogItemId).eq("businessId", args.businessId)
      )
      .collect();

    records = records.filter((r) => !r.archivedAt);

    if (args.customerId) {
      records = records.filter((r) => r.customerId === args.customerId);
    }
    if (args.startDate) {
      records = records.filter((r) => r.invoiceDate >= args.startDate!);
    }
    if (args.endDate) {
      records = records.filter((r) => r.invoiceDate <= args.endDate!);
    }

    // Sort chronologically for chart
    records.sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate));

    // Resolve customer names for chart labels
    const customerIds = [...new Set(records.map((r) => r.customerId).filter(Boolean))];
    const customerMap: Record<string, string> = {};
    for (const cId of customerIds) {
      if (cId) {
        const customer = await ctx.db.get(cId);
        if (customer) {
          customerMap[cId] = customer.businessName;
        }
      }
    }

    const dataPoints = records.map((r) => ({
      date: r.invoiceDate,
      unitPrice: r.unitPrice,
      currency: r.currency,
      customerName: r.customerId ? customerMap[r.customerId] || undefined : undefined,
    }));

    return { dataPoints };
  },
});

// ---------------------------------------------------------------------------
// Public Actions (bandwidth-safe — run once on demand, not reactive)
// ---------------------------------------------------------------------------

export const getSalesHistory = action({
  args: {
    businessId: v.id("businesses"),
    catalogItemId: v.id("catalog_items"),
    customerId: v.optional(v.id("customers")),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<any> => {
    return await ctx.runQuery(internal.functions.sellingPriceHistory._getSalesHistory, args);
  },
});

export const getSalesPriceTrend = action({
  args: {
    businessId: v.id("businesses"),
    catalogItemId: v.id("catalog_items"),
    customerId: v.optional(v.id("customers")),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    return await ctx.runQuery(internal.functions.sellingPriceHistory._getSalesPriceTrend, args);
  },
});

// ---------------------------------------------------------------------------
// Margin Summary (action — reads from both selling + purchase price tables)
// ---------------------------------------------------------------------------

export const getMarginSummary = action({
  args: {
    businessId: v.id("businesses"),
    catalogItemId: v.id("catalog_items"),
  },
  handler: async (ctx, args): Promise<any> => {
    // Get latest selling price
    const salesData = await ctx.runQuery(
      internal.functions.sellingPriceHistory._getSalesHistory,
      { businessId: args.businessId, catalogItemId: args.catalogItemId, limit: 1 }
    );

    // Get vendor mappings
    const mappings = await ctx.runQuery(
      internal.functions.catalogVendorMappings._getMappings,
      { catalogItemId: args.catalogItemId, businessId: args.businessId }
    );

    // Get business home currency
    const business = await ctx.runQuery(
      internal.functions.sellingPriceHistory._getBusiness,
      { businessId: args.businessId }
    );
    const homeCurrency = business?.homeCurrency || "MYR";

    // Get latest purchase cost from vendor_price_history via mappings
    let latestPurchaseCost: {
      unitPrice: number;
      currency: string;
      date: string;
      vendorName: string;
    } | null = null;

    if (mappings.length > 0) {
      const purchaseData = await ctx.runQuery(
        internal.functions.sellingPriceHistory._getLatestPurchaseCost,
        {
          businessId: args.businessId,
          mappings: mappings.map((m: any) => ({
            vendorId: m.vendorId,
            vendorItemIdentifier: m.vendorItemIdentifier,
          })),
        }
      );
      latestPurchaseCost = purchaseData;
    }

    const latestSellingPrice = salesData.latestPrice
      ? {
          ...salesData.latestPrice,
          customerName: salesData.records[0]?.customerName || "Unknown",
        }
      : null;

    // Currency conversion — convert both prices to homeCurrency
    let convertedSP: number | null = latestSellingPrice?.unitPrice ?? null;
    let convertedCP: number | null = latestPurchaseCost?.unitPrice ?? null;
    let currencyNote: string | null = null;

    if (latestSellingPrice && latestSellingPrice.currency !== homeCurrency) {
      const rate = await ctx.runQuery(
        internal.functions.sellingPriceHistory._getExchangeRate,
        { businessId: args.businessId, fromCurrency: latestSellingPrice.currency, toCurrency: homeCurrency }
      );
      if (rate) {
        convertedSP = Math.round(latestSellingPrice.unitPrice * rate.rate * 100) / 100;
        currencyNote = `Selling price converted from ${latestSellingPrice.currency} to ${homeCurrency}`;
      } else {
        currencyNote = `No exchange rate configured for ${latestSellingPrice.currency} → ${homeCurrency}`;
      }
    }

    if (latestPurchaseCost && latestPurchaseCost.currency !== homeCurrency) {
      const rate = await ctx.runQuery(
        internal.functions.sellingPriceHistory._getExchangeRate,
        { businessId: args.businessId, fromCurrency: latestPurchaseCost.currency, toCurrency: homeCurrency }
      );
      if (rate) {
        convertedCP = Math.round(latestPurchaseCost.unitPrice * rate.rate * 100) / 100;
        const note = `Purchase cost converted from ${latestPurchaseCost.currency} to ${homeCurrency}`;
        currencyNote = currencyNote ? `${currencyNote}. ${note}` : note;
      } else {
        const note = `No exchange rate configured for ${latestPurchaseCost.currency} → ${homeCurrency}`;
        currencyNote = currencyNote ? `${currencyNote}. ${note}` : note;
        convertedCP = null; // Can't calculate margin without conversion
      }
    }

    // Calculate margin using converted prices
    let marginPercent: number | null = null;
    let marginWarning: string | null = null;

    if (convertedSP !== null && convertedCP !== null && convertedSP > 0) {
      marginPercent = ((convertedSP - convertedCP) / convertedSP) * 100;
      marginPercent = Math.round(marginPercent * 10) / 10;

      if (marginPercent < 0) {
        marginWarning = `Selling below cost — losing ${Math.abs(marginPercent)}% per unit`;
      }
    }

    // Detect margin erosion: cost increased but selling price unchanged
    if (latestPurchaseCost && mappings.length > 0 && marginWarning === null) {
      const previousCost = await ctx.runQuery(
        internal.functions.sellingPriceHistory._getPreviousPurchaseCost,
        {
          businessId: args.businessId,
          mappings: mappings.map((m: any) => ({
            vendorId: m.vendorId,
            vendorItemIdentifier: m.vendorItemIdentifier,
          })),
        }
      );

      if (previousCost && latestPurchaseCost.unitPrice > previousCost.unitPrice) {
        const costIncrease = ((latestPurchaseCost.unitPrice - previousCost.unitPrice) / previousCost.unitPrice) * 100;
        const costIncreaseRounded = Math.round(costIncrease * 10) / 10;

        // Check if selling price has stayed the same (or decreased)
        if (costIncreaseRounded >= 5) {
          // Get previous selling price to compare
          const salesHistory = await ctx.runQuery(
            internal.functions.sellingPriceHistory._getSalesHistory,
            { businessId: args.businessId, catalogItemId: args.catalogItemId, limit: 2 }
          );

          const sellingPrices = salesHistory.records.map((r: any) => r.unitPrice);
          const sellingUnchanged = sellingPrices.length >= 2
            ? Math.abs(sellingPrices[0] - sellingPrices[1]) / sellingPrices[1] < 0.02 // <2% change = "unchanged"
            : sellingPrices.length === 1; // Only one price = hasn't been adjusted

          if (sellingUnchanged) {
            marginWarning = `Margin decreased — cost increased by ${costIncreaseRounded}% but selling price hasn't changed`;
          }
        }
      }
    }

    return {
      latestSellingPrice,
      latestPurchaseCost,
      marginPercent,
      homeCurrency,
      convertedSellingPrice: convertedSP,
      convertedPurchaseCost: convertedCP,
      marginWarning,
      currencyNote,
      hasMappings: mappings.length > 0,
      mappingCount: mappings.length,
    };
  },
});

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

export const exportSalesHistoryCSV = action({
  args: {
    businessId: v.id("businesses"),
    catalogItemId: v.id("catalog_items"),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ csv: string; filename: string }> => {
    const data = await ctx.runQuery(
      internal.functions.sellingPriceHistory._getSalesHistory,
      { businessId: args.businessId, catalogItemId: args.catalogItemId, startDate: args.startDate, endDate: args.endDate, limit: 10000 }
    );

    const headers = "Date,Customer,Item Description,Item Code,Qty,Unit Price,Currency,Total,Invoice #";
    const rows = data.records.map((r: any) =>
      [
        r.invoiceDate,
        `"${(r.customerName || "").replace(/"/g, '""')}"`,
        `"${(r.itemDescription || "").replace(/"/g, '""')}"`,
        r.itemCode || "",
        r.quantity,
        r.unitPrice,
        r.currency,
        r.totalAmount,
        r.invoiceNumber,
      ].join(",")
    );

    const csv = [headers, ...rows].join("\n");
    const catalogItem = await ctx.runQuery(
      internal.functions.sellingPriceHistory._getCatalogItem,
      { catalogItemId: args.catalogItemId }
    );
    const itemName = catalogItem?.name || "item";
    const filename = `selling-price-history-${itemName.replace(/[^a-zA-Z0-9]/g, "-")}.csv`;

    return { csv, filename };
  },
});

// ---------------------------------------------------------------------------
// Helper internal queries
// ---------------------------------------------------------------------------

export const _getBusiness = internalQuery({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.businessId);
  },
});

export const _getCatalogItem = internalQuery({
  args: { catalogItemId: v.id("catalog_items") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.catalogItemId);
  },
});

export const _getLatestPurchaseCost = internalQuery({
  args: {
    businessId: v.id("businesses"),
    mappings: v.array(
      v.object({
        vendorId: v.id("vendors"),
        vendorItemIdentifier: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let latestRecord: {
      unitPrice: number;
      currency: string;
      date: string;
      vendorName: string;
    } | null = null;
    let latestDate = "";

    for (const mapping of args.mappings) {
      const records = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_vendor_item", (q) =>
          q.eq("vendorId", mapping.vendorId)
        )
        .filter((q) => q.eq(q.field("itemIdentifier"), mapping.vendorItemIdentifier))
        .order("desc")
        .take(1);

      if (records.length > 0) {
        const r = records[0];
        const recordDate = r.observedAt || r.invoiceDate || "";
        if (!latestRecord || recordDate > latestDate) {
          const vendor = await ctx.db.get(mapping.vendorId);
          latestRecord = {
            unitPrice: r.unitPrice,
            currency: r.currency,
            date: recordDate,
            vendorName: vendor?.name || "Unknown vendor",
          };
          latestDate = recordDate;
        }
      }
    }

    return latestRecord;
  },
});

/**
 * Get the previous purchase cost (second-latest) for margin erosion detection.
 */
export const _getPreviousPurchaseCost = internalQuery({
  args: {
    businessId: v.id("businesses"),
    mappings: v.array(
      v.object({
        vendorId: v.id("vendors"),
        vendorItemIdentifier: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Collect all purchase records across mappings, sorted by date desc
    const allRecords: Array<{ unitPrice: number; date: string }> = [];

    for (const mapping of args.mappings) {
      const records = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_vendor_item", (q) =>
          q.eq("vendorId", mapping.vendorId)
        )
        .filter((q) => q.eq(q.field("itemIdentifier"), mapping.vendorItemIdentifier))
        .order("desc")
        .take(5);

      for (const r of records) {
        if (!r.archivedFlag) {
          allRecords.push({
            unitPrice: r.unitPrice,
            date: r.observedAt || r.invoiceDate || "",
          });
        }
      }
    }

    // Sort by date desc
    allRecords.sort((a, b) => b.date.localeCompare(a.date));

    // Return second record (previous cost)
    return allRecords.length >= 2 ? allRecords[1] : null;
  },
});

/**
 * Get exchange rate for currency conversion.
 * Returns rate to convert `from` → `to`. Returns null if no rate found.
 */
export const _getExchangeRate = internalQuery({
  args: {
    businessId: v.id("businesses"),
    fromCurrency: v.string(),
    toCurrency: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.fromCurrency === args.toCurrency) return { rate: 1 };

    // Try direct rate
    const direct = await ctx.db
      .query("manual_exchange_rates")
      .withIndex("by_business_currencies", (q) =>
        q.eq("businessId", args.businessId)
          .eq("fromCurrency", args.fromCurrency)
          .eq("toCurrency", args.toCurrency)
      )
      .order("desc")
      .first();

    if (direct) return { rate: direct.rate };

    // Try inverse rate
    const inverse = await ctx.db
      .query("manual_exchange_rates")
      .withIndex("by_business_currencies", (q) =>
        q.eq("businessId", args.businessId)
          .eq("fromCurrency", args.toCurrency)
          .eq("toCurrency", args.fromCurrency)
      )
      .order("desc")
      .first();

    if (inverse && inverse.rate > 0) return { rate: 1 / inverse.rate };

    return null;
  },
});

// ---------------------------------------------------------------------------
// Purchase History via Mappings (for Purchase History tab)
// ---------------------------------------------------------------------------

export const _getPurchaseHistoryByMappings = internalQuery({
  args: {
    businessId: v.id("businesses"),
    catalogItemId: v.id("catalog_items"),
    vendorId: v.optional(v.id("vendors")),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxResults = args.limit ?? 100;

    // Get confirmed mappings for this catalog item
    const mappings = await ctx.db
      .query("catalog_vendor_item_mappings")
      .withIndex("by_catalogItem", (q) =>
        q.eq("catalogItemId", args.catalogItemId).eq("businessId", args.businessId)
      )
      .collect();

    const activeMappings = mappings.filter(
      (m) => !m.rejectedAt && m.matchSource !== "fuzzy-suggested"
    );

    if (activeMappings.length === 0) {
      return { records: [], totalCount: 0, vendors: [] };
    }

    // Optionally filter by specific vendor
    const filteredMappings = args.vendorId
      ? activeMappings.filter((m) => m.vendorId === args.vendorId)
      : activeMappings;

    // Query vendor_price_history for each mapping
    const allRecords: Array<{
      _id: string;
      vendorId: string;
      vendorName: string;
      itemDescription: string;
      unitPrice: number;
      quantity: number;
      currency: string;
      totalAmount: number;
      invoiceDate: string;
      invoiceNumber: string;
    }> = [];

    // Collect unique vendors for filter dropdown
    const vendorMap: Record<string, string> = {};

    for (const mapping of filteredMappings) {
      const vendor = await ctx.db.get(mapping.vendorId) as any;
      const vendorName = vendor?.name || "Unknown vendor";
      vendorMap[mapping.vendorId] = vendorName;

      const records = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_vendor_item", (q) =>
          q.eq("vendorId", mapping.vendorId)
        )
        .filter((q) => q.eq(q.field("itemIdentifier"), mapping.vendorItemIdentifier))
        .take(200);

      for (const r of records) {
        if (r.archivedFlag) continue;
        const recordDate = r.observedAt || r.invoiceDate || "";

        // Apply date filters
        if (args.startDate && recordDate < args.startDate) continue;
        if (args.endDate && recordDate > args.endDate) continue;

        // Resolve invoice number
        let invoiceNumber = "—";
        if (r.invoiceId) {
          const inv = await ctx.db.get(r.invoiceId) as any;
          if (inv) invoiceNumber = inv.invoiceNumber || inv.referenceNumber || String(r.invoiceId);
        }

        allRecords.push({
          _id: r._id,
          vendorId: String(mapping.vendorId),
          vendorName,
          itemDescription: r.itemDescription,
          unitPrice: r.unitPrice,
          quantity: r.quantity,
          currency: r.currency,
          totalAmount: r.unitPrice * r.quantity,
          invoiceDate: recordDate,
          invoiceNumber,
        });
      }
    }

    // Sort by date desc
    allRecords.sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate));

    const vendors = Object.entries(vendorMap).map(([id, name]) => ({ id, name }));

    return {
      records: allRecords.slice(0, maxResults),
      totalCount: allRecords.length,
      vendors,
    };
  },
});

export const getPurchaseHistoryByMappings = action({
  args: {
    businessId: v.id("businesses"),
    catalogItemId: v.id("catalog_items"),
    vendorId: v.optional(v.id("vendors")),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    return await ctx.runQuery(
      internal.functions.sellingPriceHistory._getPurchaseHistoryByMappings,
      args
    );
  },
});

export const _getPurchasePriceTrend = internalQuery({
  args: {
    businessId: v.id("businesses"),
    catalogItemId: v.id("catalog_items"),
    vendorId: v.optional(v.id("vendors")),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Get confirmed mappings
    const mappings = await ctx.db
      .query("catalog_vendor_item_mappings")
      .withIndex("by_catalogItem", (q) =>
        q.eq("catalogItemId", args.catalogItemId).eq("businessId", args.businessId)
      )
      .collect();

    const activeMappings = mappings.filter(
      (m) => !m.rejectedAt && m.matchSource !== "fuzzy-suggested"
    );

    const filteredMappings = args.vendorId
      ? activeMappings.filter((m) => m.vendorId === args.vendorId)
      : activeMappings;

    const dataPoints: Array<{ date: string; unitPrice: number; currency: string }> = [];

    for (const mapping of filteredMappings) {
      const records = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_vendor_item", (q) =>
          q.eq("vendorId", mapping.vendorId)
        )
        .filter((q) => q.eq(q.field("itemIdentifier"), mapping.vendorItemIdentifier))
        .take(200);

      for (const r of records) {
        if (r.archivedFlag) continue;
        const recordDate = r.observedAt || r.invoiceDate || "";
        if (args.startDate && recordDate < args.startDate) continue;
        if (args.endDate && recordDate > args.endDate) continue;

        dataPoints.push({
          date: recordDate,
          unitPrice: r.unitPrice,
          currency: r.currency,
        });
      }
    }

    // Sort chronologically
    dataPoints.sort((a, b) => a.date.localeCompare(b.date));

    return { dataPoints };
  },
});

export const getPurchasePriceTrend = action({
  args: {
    businessId: v.id("businesses"),
    catalogItemId: v.id("catalog_items"),
    vendorId: v.optional(v.id("vendors")),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<any> => {
    return await ctx.runQuery(
      internal.functions.sellingPriceHistory._getPurchasePriceTrend,
      args
    );
  },
});

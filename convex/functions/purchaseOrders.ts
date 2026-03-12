/**
 * Purchase Order Functions - Convex queries and mutations
 *
 * These functions handle:
 * - PO CRUD operations
 * - PO number auto-generation
 * - Status transitions with validation
 * - Received quantity updates from GRNs
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { resolveUserByClerkId } from "../lib/resolvers";

// PO status values for inline validators
const PO_STATUS_VALUES = [
  "draft",
  "issued",
  "partially_received",
  "fully_received",
  "invoiced",
  "closed",
  "cancelled",
] as const;

// Valid status transitions (user-initiated via updateStatus)
const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["issued", "cancelled"],
  issued: ["cancelled"],
  partially_received: ["cancelled"],
  fully_received: ["cancelled"],
  invoiced: ["cancelled"],
  // closed and cancelled are terminal states
};

// ============================================
// HELPER: Auth + membership check
// ============================================

async function authenticateAndGetMembership(
  ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> }; db: any },
  businessId: Id<"businesses">
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const user = await resolveUserByClerkId(ctx.db, identity.subject);
  if (!user) {
    throw new Error("User not found");
  }

  const membership = await ctx.db
    .query("business_memberships")
    .withIndex("by_userId_businessId", (q: any) =>
      q.eq("userId", user._id).eq("businessId", businessId)
    )
    .first();

  if (!membership || membership.status !== "active") {
    throw new Error("Not a member of this business");
  }

  return { user, membership };
}

// ============================================
// QUERIES
// ============================================

/**
 * Get next PO number for a business
 * Format: {prefix}-{year}-{sequential}
 */
export const getNextNumber = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    // Get settings for prefix
    const settings = await ctx.db
      .query("matching_settings")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
      .first();

    const prefix = settings?.poNumberPrefix ?? "PO";
    const year = new Date().getFullYear();

    // Count existing POs for this business and year
    const existingPOs = await ctx.db
      .query("purchase_orders")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
      .collect();

    const yearPOs = existingPOs.filter((po: any) => {
      const poYear = po.poNumber?.match(/\d{4}/)?.[0];
      return poYear === String(year);
    });

    const nextNumber = yearPOs.length + 1;
    return `${prefix}-${year}-${String(nextNumber).padStart(3, "0")}`;
  },
});

/**
 * List purchase orders with filtering
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    status: v.optional(v.union(
      v.literal("draft"),
      v.literal("issued"),
      v.literal("partially_received"),
      v.literal("fully_received"),
      v.literal("invoiced"),
      v.literal("closed"),
      v.literal("cancelled")
    )),
    vendorId: v.optional(v.id("vendors")),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    // Query with appropriate index
    let pos;
    if (args.status) {
      pos = await ctx.db
        .query("purchase_orders")
        .withIndex("by_businessId_status", (q: any) =>
          q.eq("businessId", args.businessId).eq("status", args.status!)
        )
        .collect();
    } else if (args.vendorId) {
      pos = await ctx.db
        .query("purchase_orders")
        .withIndex("by_businessId_vendorId", (q: any) =>
          q.eq("businessId", args.businessId).eq("vendorId", args.vendorId!)
        )
        .collect();
    } else {
      pos = await ctx.db
        .query("purchase_orders")
        .withIndex("by_businessId", (q: any) => q.eq("businessId", args.businessId))
        .collect();
    }

    // Apply additional filters in JS
    if (args.vendorId && !args.status) {
      // Already filtered by vendor via index
    } else if (args.vendorId) {
      pos = pos.filter((po: any) => po.vendorId === args.vendorId);
    }

    if (args.dateFrom) {
      pos = pos.filter((po: any) => po.poDate >= args.dateFrom!);
    }
    if (args.dateTo) {
      pos = pos.filter((po: any) => po.poDate <= args.dateTo!);
    }
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      pos = pos.filter((po: any) =>
        po.poNumber.toLowerCase().includes(searchLower)
      );
    }

    // Sort by creation date descending
    pos.sort((a: any, b: any) => b.createdAt - a.createdAt);

    // Enrich with vendor name
    const enriched = await Promise.all(
      pos.map(async (po: any) => {
        const vendor = await ctx.db.get(po.vendorId) as any;
        return {
          ...po,
          vendorName: vendor?.name ?? "Unknown Vendor",
        };
      })
    );

    return enriched;
  },
});

/**
 * Get a single PO with full context (vendor, GRNs, matches)
 */
export const get = query({
  args: { poId: v.id("purchase_orders") },
  handler: async (ctx, args) => {
    const po = await ctx.db.get(args.poId);
    if (!po) {
      return null;
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", po.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    // Get related data
    const vendor = await ctx.db.get(po.vendorId);

    const grns = await ctx.db
      .query("goods_received_notes")
      .withIndex("by_purchaseOrderId", (q: any) => q.eq("purchaseOrderId", po._id))
      .collect();

    const matches = await ctx.db
      .query("po_matches")
      .withIndex("by_purchaseOrderId", (q: any) => q.eq("purchaseOrderId", po._id))
      .collect();

    return {
      ...po,
      vendor: vendor ?? null,
      grns,
      matches,
    };
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new purchase order
 */
export const create = mutation({
  args: {
    vendorId: v.id("vendors"),
    poDate: v.string(),
    requiredDeliveryDate: v.optional(v.string()),
    lineItems: v.array(v.object({
      itemCode: v.optional(v.string()),
      description: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      currency: v.string(),
      unitMeasurement: v.optional(v.string()),
    })),
    currency: v.string(),
    notes: v.optional(v.string()),
    sourceDocumentId: v.optional(v.id("_storage")),
    sourceInvoiceId: v.optional(v.id("invoices")),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    // Validate vendor exists
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) {
      throw new Error("Vendor not found");
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", vendor.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    // Generate PO number
    const settings = await ctx.db
      .query("matching_settings")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", vendor.businessId))
      .first();

    const prefix = settings?.poNumberPrefix ?? "PO";
    const year = new Date().getFullYear();

    const existingPOs = await ctx.db
      .query("purchase_orders")
      .withIndex("by_businessId", (q: any) => q.eq("businessId", vendor.businessId))
      .collect();

    const yearPOs = existingPOs.filter((po: any) => {
      const poYear = po.poNumber?.match(/\d{4}/)?.[0];
      return poYear === String(year);
    });

    const nextNumber = yearPOs.length + 1;
    const poNumber = `${prefix}-${year}-${String(nextNumber).padStart(3, "0")}`;

    // Calculate line item totals
    const lineItems = args.lineItems.map((item) => ({
      ...item,
      totalAmount: item.quantity * item.unitPrice,
      receivedQuantity: 0,
      invoicedQuantity: 0,
    }));

    const totalAmount = lineItems.reduce((sum, item) => sum + item.totalAmount, 0);

    const poId = await ctx.db.insert("purchase_orders", {
      businessId: vendor.businessId,
      vendorId: args.vendorId,
      poNumber,
      poDate: args.poDate,
      requiredDeliveryDate: args.requiredDeliveryDate,
      status: "draft",
      lineItems,
      totalAmount,
      currency: args.currency,
      notes: args.notes,
      sourceDocumentId: args.sourceDocumentId,
      sourceInvoiceId: args.sourceInvoiceId,
      createdBy: user._id,
      createdAt: Date.now(),
    });

    return poId;
  },
});

/**
 * Update a draft purchase order
 */
export const update = mutation({
  args: {
    poId: v.id("purchase_orders"),
    vendorId: v.optional(v.id("vendors")),
    poDate: v.optional(v.string()),
    requiredDeliveryDate: v.optional(v.string()),
    lineItems: v.optional(v.array(v.object({
      itemCode: v.optional(v.string()),
      description: v.string(),
      quantity: v.number(),
      unitPrice: v.number(),
      currency: v.string(),
      unitMeasurement: v.optional(v.string()),
    }))),
    currency: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const po = await ctx.db.get(args.poId);
    if (!po) {
      throw new Error("Purchase order not found");
    }

    if (po.status !== "draft") {
      throw new Error("Only draft purchase orders can be edited");
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", po.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    // Validate vendor if being changed
    if (args.vendorId) {
      const vendor = await ctx.db.get(args.vendorId);
      if (!vendor) {
        throw new Error("Vendor not found");
      }
      if (vendor.businessId !== po.businessId) {
        throw new Error("Vendor does not belong to this business");
      }
    }

    // Build update object
    const updates: Record<string, any> = {
      updatedAt: Date.now(),
    };

    if (args.vendorId !== undefined) updates.vendorId = args.vendorId;
    if (args.poDate !== undefined) updates.poDate = args.poDate;
    if (args.requiredDeliveryDate !== undefined) updates.requiredDeliveryDate = args.requiredDeliveryDate;
    if (args.currency !== undefined) updates.currency = args.currency;
    if (args.notes !== undefined) updates.notes = args.notes;

    if (args.lineItems !== undefined) {
      const lineItems = args.lineItems.map((item) => ({
        ...item,
        totalAmount: item.quantity * item.unitPrice,
        receivedQuantity: 0,
        invoicedQuantity: 0,
      }));
      updates.lineItems = lineItems;
      updates.totalAmount = lineItems.reduce((sum: number, item: any) => sum + item.totalAmount, 0);
    }

    await ctx.db.patch(args.poId, updates);
  },
});

/**
 * Update PO status (user-initiated transitions)
 * Only "issued" and "cancelled" are user-initiated
 */
export const updateStatus = mutation({
  args: {
    poId: v.id("purchase_orders"),
    status: v.union(v.literal("issued"), v.literal("cancelled")),
  },
  handler: async (ctx, args) => {
    const po = await ctx.db.get(args.poId);
    if (!po) {
      throw new Error("Purchase order not found");
    }

    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    // Verify business membership and role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", po.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    // Role check: admin or manager only
    if (!["owner", "finance_admin", "manager"].includes(membership.role)) {
      throw new Error("Only admins or managers can change PO status");
    }

    // Validate status transition
    const validTransitions = VALID_STATUS_TRANSITIONS[po.status];
    if (!validTransitions || !validTransitions.includes(args.status)) {
      throw new Error(
        `Cannot transition from "${po.status}" to "${args.status}"`
      );
    }

    await ctx.db.patch(args.poId, {
      status: args.status,
      updatedAt: Date.now(),
    });
  },
});

// ============================================
// INTERNAL MUTATIONS
// ============================================

/**
 * Update received quantities on PO line items (called by GRN creation)
 */
export const updateReceived = internalMutation({
  args: {
    poId: v.id("purchase_orders"),
    lineUpdates: v.array(v.object({
      lineIndex: v.number(),
      additionalReceived: v.number(),
    })),
  },
  handler: async (ctx, args) => {
    const po = await ctx.db.get(args.poId);
    if (!po) {
      throw new Error("Purchase order not found");
    }

    const updatedLineItems = [...po.lineItems];
    for (const update of args.lineUpdates) {
      if (update.lineIndex >= 0 && update.lineIndex < updatedLineItems.length) {
        const line = updatedLineItems[update.lineIndex];
        updatedLineItems[update.lineIndex] = {
          ...line,
          receivedQuantity: (line.receivedQuantity ?? 0) + update.additionalReceived,
        };
      }
    }

    // Determine new status based on received quantities
    const allFullyReceived = updatedLineItems.every(
      (line) => (line.receivedQuantity ?? 0) >= line.quantity
    );
    const someReceived = updatedLineItems.some(
      (line) => (line.receivedQuantity ?? 0) > 0
    );

    let newStatus = po.status;
    if (allFullyReceived) {
      newStatus = "fully_received";
    } else if (someReceived && po.status === "issued") {
      newStatus = "partially_received";
    }

    await ctx.db.patch(args.poId, {
      lineItems: updatedLineItems,
      status: newStatus,
      updatedAt: Date.now(),
    });
  },
});

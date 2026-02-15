/**
 * Catalog Item Functions - Convex queries and mutations
 *
 * CRUD operations for the product/service catalog.
 * Catalog items can be used to pre-populate invoice line items.
 *
 * Stripe sync DB operations are public mutations called by the
 * Next.js API route (/api/v1/stripe-integration/sync) via ConvexHttpClient.
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId } from "../lib/resolvers";

// ============================================
// HELPER: Finance admin check
// ============================================
async function requireFinanceAdmin(
  ctx: { db: import("../_generated/server").DatabaseReader; auth: { getUserIdentity: () => Promise<{ subject: string } | null> } },
  businessId: import("../_generated/dataModel").Id<"businesses">
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const user = await resolveUserByClerkId(ctx.db, identity.subject);
  if (!user) throw new Error("User not found");

  const membership = await ctx.db
    .query("business_memberships")
    .withIndex("by_userId_businessId", (q) =>
      q.eq("userId", user._id).eq("businessId", businessId)
    )
    .first();

  if (!membership || membership.status !== "active") {
    throw new Error("Not a member of this business");
  }

  if (!["owner", "finance_admin", "manager"].includes(membership.role)) {
    throw new Error("Not authorized: finance admin required");
  }

  return { user, membership };
}

// ============================================
// QUERIES
// ============================================

/**
 * List catalog items for a business
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    status: v.optional(v.string()),
    category: v.optional(v.string()),
    search: v.optional(v.string()),
    source: v.optional(v.string()), // "manual" | "stripe"
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return [];

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") return [];

    let items;
    if (args.status) {
      items = await ctx.db
        .query("catalog_items")
        .withIndex("by_businessId_status", (q) =>
          q.eq("businessId", args.businessId).eq("status", args.status as never)
        )
        .collect();
    } else {
      items = await ctx.db
        .query("catalog_items")
        .withIndex("by_businessId", (q) =>
          q.eq("businessId", args.businessId)
        )
        .collect();
    }

    // Filter soft-deleted
    items = items.filter((item) => !item.deletedAt);

    // Category filter
    if (args.category) {
      items = items.filter((item) => item.category === args.category);
    }

    // Source filter
    if (args.source === "stripe") {
      items = items.filter((item) => item.source === "stripe");
    } else if (args.source === "manual") {
      items = items.filter((item) => !item.source || item.source === "manual");
    }

    // Search filter
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      items = items.filter((item) =>
        item.name.toLowerCase().includes(searchLower) ||
        (item.description?.toLowerCase().includes(searchLower)) ||
        (item.sku?.toLowerCase().includes(searchLower))
      );
    }

    // Sort by name
    items.sort((a, b) => a.name.localeCompare(b.name));

    // Limit
    if (args.limit) {
      items = items.slice(0, args.limit);
    }

    return items;
  },
});

/**
 * Search catalog items by name (autocomplete)
 */
export const searchByName = query({
  args: {
    businessId: v.id("businesses"),
    query: v.string(),
    limit: v.optional(v.number()),
    searchField: v.optional(v.union(v.literal("sku"), v.literal("name"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return [];

    const items = await ctx.db
      .query("catalog_items")
      .withIndex("by_businessId_status", (q) =>
        q.eq("businessId", args.businessId).eq("status", "active")
      )
      .collect();

    const queryLower = args.query.toLowerCase();
    const field = args.searchField ?? "all";
    const filtered = items
      .filter((item) => {
        if (item.deletedAt) return false;
        switch (field) {
          case "sku":
            return item.sku?.toLowerCase().includes(queryLower) ?? false;
          case "name":
            return item.name.toLowerCase().includes(queryLower) ||
              (item.description?.toLowerCase().includes(queryLower) ?? false);
          default:
            return item.name.toLowerCase().includes(queryLower) ||
              (item.sku?.toLowerCase().includes(queryLower) ?? false);
        }
      })
      .slice(0, args.limit ?? 10);

    return filtered;
  },
});

/**
 * Get a catalog item by ID
 */
export const getById = query({
  args: {
    id: v.id("catalog_items"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const item = await ctx.db.get(args.id);
    if (!item || item.businessId !== args.businessId || item.deletedAt) {
      return null;
    }

    return item;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a catalog item
 */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.string(),
    description: v.optional(v.string()),
    sku: v.optional(v.string()),
    unitPrice: v.number(),
    currency: v.string(),
    unitMeasurement: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const itemId = await ctx.db.insert("catalog_items", {
      businessId: args.businessId,
      name: args.name,
      description: args.description,
      sku: args.sku,
      unitPrice: args.unitPrice,
      currency: args.currency,
      unitMeasurement: args.unitMeasurement,
      taxRate: args.taxRate,
      category: args.category,
      status: "active",
      updatedAt: Date.now(),
    });

    return itemId;
  },
});

/**
 * Update a catalog item
 */
export const update = mutation({
  args: {
    id: v.id("catalog_items"),
    businessId: v.id("businesses"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    sku: v.optional(v.string()),
    unitPrice: v.optional(v.number()),
    currency: v.optional(v.string()),
    unitMeasurement: v.optional(v.string()),
    taxRate: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const item = await ctx.db.get(args.id);
    if (!item || item.businessId !== args.businessId || item.deletedAt) {
      throw new Error("Catalog item not found");
    }

    const { id, businessId, ...updates } = args;
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );

    await ctx.db.patch(args.id, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

/**
 * Deactivate a catalog item
 */
export const deactivate = mutation({
  args: {
    id: v.id("catalog_items"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const item = await ctx.db.get(args.id);
    if (!item || item.businessId !== args.businessId || item.deletedAt) {
      throw new Error("Catalog item not found");
    }

    const patchData: Record<string, unknown> = {
      status: "inactive",
      updatedAt: Date.now(),
    };
    // If this is a Stripe-synced item, mark as locally deactivated
    // so re-syncs respect the user's choice
    if (item.source === "stripe") {
      patchData.locallyDeactivated = true;
    }

    await ctx.db.patch(args.id, patchData);

    return args.id;
  },
});

/**
 * Reactivate a catalog item
 */
export const reactivate = mutation({
  args: {
    id: v.id("catalog_items"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const item = await ctx.db.get(args.id);
    if (!item || item.businessId !== args.businessId || item.deletedAt) {
      throw new Error("Catalog item not found");
    }

    await ctx.db.patch(args.id, {
      status: "active",
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

// ============================================
// STRIPE SYNC — DB operations for API route
// ============================================

/**
 * Check if there's a running sync for this business
 */
export const hasRunningSync = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const logs = await ctx.db
      .query("sync_logs")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .order("desc")
      .take(1);
    return logs.length > 0 && logs[0].status === "running";
  },
});

/**
 * Get all active Stripe-synced catalog items for a business
 */
export const getStripeSyncedItems = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const items = await ctx.db
      .query("catalog_items")
      .withIndex("by_businessId_source", (q) =>
        q.eq("businessId", args.businessId).eq("source", "stripe")
      )
      .collect();
    return items.filter((item) => !item.deletedAt);
  },
});

/**
 * Create a sync log entry
 */
export const createSyncLog = mutation({
  args: {
    businessId: v.id("businesses"),
    triggeredBy: v.string(),
    totalStripeProducts: v.number(),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    return await ctx.db.insert("sync_logs", {
      businessId: args.businessId,
      startedAt: Date.now(),
      status: "running",
      productsCreated: 0,
      productsUpdated: 0,
      productsDeactivated: 0,
      productsSkipped: 0,
      totalStripeProducts: args.totalStripeProducts,
      triggeredBy: args.triggeredBy,
    });
  },
});

/**
 * Update sync log progress
 */
export const updateSyncLog = mutation({
  args: {
    syncLogId: v.id("sync_logs"),
    businessId: v.id("businesses"),
    productsCreated: v.optional(v.number()),
    productsUpdated: v.optional(v.number()),
    productsDeactivated: v.optional(v.number()),
    productsSkipped: v.optional(v.number()),
    status: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    errors: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const { syncLogId, businessId, ...updates } = args;
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );
    await ctx.db.patch(syncLogId, filteredUpdates);
  },
});

/**
 * Upsert a single catalog item during sync
 */
export const upsertSyncedItem = mutation({
  args: {
    businessId: v.id("businesses"),
    stripeProductId: v.string(),
    stripePriceId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    unitPrice: v.number(),
    currency: v.string(),
    billingInterval: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<"created" | "updated" | "skipped"> => {
    await requireFinanceAdmin(ctx, args.businessId);

    // Dedup by stripePriceId (one catalog item per price, not per product)
    const existing = await ctx.db
      .query("catalog_items")
      .withIndex("by_businessId_stripePriceId", (q) =>
        q.eq("businessId", args.businessId).eq("stripePriceId", args.stripePriceId)
      )
      .first();

    const now = Date.now();

    if (existing) {
      // Skip locally deactivated items
      if (existing.locallyDeactivated) {
        return "skipped";
      }
      // Update Stripe-managed fields only
      await ctx.db.patch(existing._id, {
        name: args.name,
        description: args.description,
        unitPrice: args.unitPrice,
        currency: args.currency,
        stripePriceId: args.stripePriceId,
        billingInterval: args.billingInterval,
        lastSyncedAt: now,
        status: "active",
        updatedAt: now,
      });
      return "updated";
    } else {
      // Create new item
      await ctx.db.insert("catalog_items", {
        businessId: args.businessId,
        name: args.name,
        description: args.description,
        unitPrice: args.unitPrice,
        currency: args.currency.toLowerCase(),
        source: "stripe",
        stripeProductId: args.stripeProductId,
        stripePriceId: args.stripePriceId,
        billingInterval: args.billingInterval,
        lastSyncedAt: now,
        status: "active",
        updatedAt: now,
      });
      return "created";
    }
  },
});

/**
 * Deactivate a synced item that's no longer in Stripe
 */
export const deactivateSyncedItem = mutation({
  args: {
    itemId: v.id("catalog_items"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    await ctx.db.patch(args.itemId, {
      status: "inactive",
      updatedAt: Date.now(),
    });
  },
});

// ============================================
// STRIPE SYNC — Progress query
// ============================================

/**
 * Get current sync progress for real-time UI updates
 */
export const getSyncProgress = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    // Get the latest sync log for this business
    const logs = await ctx.db
      .query("sync_logs")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .order("desc")
      .take(1);

    const latestLog = logs[0];
    if (!latestLog) return null;

    const processed = latestLog.productsCreated + latestLog.productsUpdated + latestLog.productsSkipped;

    return {
      status: latestLog.status as "running" | "completed" | "partial" | "failed",
      total: latestLog.totalStripeProducts,
      processed,
      created: latestLog.productsCreated,
      updated: latestLog.productsUpdated,
      deactivated: latestLog.productsDeactivated,
      skipped: latestLog.productsSkipped,
      message:
        latestLog.status === "running"
          ? `Syncing ${processed} of ${latestLog.totalStripeProducts} products...`
          : latestLog.status === "completed"
            ? `Sync complete: ${latestLog.productsCreated} created, ${latestLog.productsUpdated} updated, ${latestLog.productsDeactivated} deactivated`
            : latestLog.status === "partial"
              ? `Sync completed with ${latestLog.errors?.length ?? 0} errors`
              : "Sync failed",
    };
  },
});

// ============================================
// STRIPE SYNC — Restore mutation
// ============================================

/**
 * Restore a locally deactivated Stripe-synced item
 */
export const restoreFromStripe = mutation({
  args: {
    id: v.id("catalog_items"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const item = await ctx.db.get(args.id);
    if (!item || item.businessId !== args.businessId || item.deletedAt) {
      throw new Error("Catalog item not found");
    }

    if (item.source !== "stripe") {
      throw new Error("This item is not synced from Stripe");
    }

    if (!item.locallyDeactivated) {
      throw new Error("This item is not locally deactivated");
    }

    await ctx.db.patch(args.id, {
      locallyDeactivated: false,
      status: "active",
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

// ============================================
// STRIPE WEBHOOK — mutations called from webhook route
// No user auth — the webhook route verifies the Stripe signature.
// ============================================

/**
 * Upsert a catalog item from a Stripe webhook event.
 * Same logic as upsertSyncedItem but without user auth.
 */
export const webhookUpsertItem = mutation({
  args: {
    businessId: v.id("businesses"),
    stripeProductId: v.string(),
    stripePriceId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    unitPrice: v.number(),
    currency: v.string(),
    billingInterval: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<"created" | "updated" | "skipped"> => {
    // Verify business exists (basic validation)
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new Error("Business not found");

    // Dedup by stripePriceId (one catalog item per price, not per product)
    const existing = await ctx.db
      .query("catalog_items")
      .withIndex("by_businessId_stripePriceId", (q) =>
        q.eq("businessId", args.businessId).eq("stripePriceId", args.stripePriceId)
      )
      .first();

    const now = Date.now();

    if (existing) {
      if (existing.locallyDeactivated) return "skipped";
      await ctx.db.patch(existing._id, {
        name: args.name,
        description: args.description,
        unitPrice: args.unitPrice,
        currency: args.currency,
        stripePriceId: args.stripePriceId,
        billingInterval: args.billingInterval,
        lastSyncedAt: now,
        status: "active",
        updatedAt: now,
      });
      return "updated";
    } else {
      await ctx.db.insert("catalog_items", {
        businessId: args.businessId,
        name: args.name,
        description: args.description,
        unitPrice: args.unitPrice,
        currency: args.currency.toLowerCase(),
        source: "stripe",
        stripeProductId: args.stripeProductId,
        stripePriceId: args.stripePriceId,
        billingInterval: args.billingInterval,
        lastSyncedAt: now,
        status: "active",
        updatedAt: now,
      });
      return "created";
    }
  },
});

/**
 * Deactivate a catalog item when product is deleted/archived in Stripe.
 */
export const webhookDeactivateItem = mutation({
  args: {
    businessId: v.id("businesses"),
    stripeProductId: v.string(),
  },
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    if (!business) throw new Error("Business not found");

    // Deactivate ALL catalog items for this product (may have multiple prices)
    const items = await ctx.db
      .query("catalog_items")
      .withIndex("by_businessId_stripeProductId", (q) =>
        q.eq("businessId", args.businessId).eq("stripeProductId", args.stripeProductId)
      )
      .collect();

    const now = Date.now();
    for (const item of items) {
      if (item.status === "active") {
        await ctx.db.patch(item._id, {
          status: "inactive",
          updatedAt: now,
        });
      }
    }
  },
});

/**
 * Catalog Item Functions - Convex queries and mutations
 *
 * CRUD operations for the product/service catalog.
 * Catalog items can be used to pre-populate invoice line items.
 */

import { v } from "convex/values";
import { query, mutation, action, internalQuery, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { resolveUserByClerkId } from "../lib/resolvers";
import { catalogItemStatusValidator } from "../lib/validators";

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
// STRIPE SYNC — Internal queries/mutations
// ============================================

/**
 * Verify user has finance admin role for a business (internal, used by sync action)
 */
export const verifyFinanceAdminRole = internalQuery({
  args: {
    clerkUserId: v.string(),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const user = await resolveUserByClerkId(ctx.db, args.clerkUserId);
    if (!user) return false;

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") return false;
    return ["owner", "finance_admin", "manager"].includes(membership.role);
  },
});

/**
 * Check if there's a running sync for this business (internal)
 */
export const hasRunningSync = internalQuery({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const logs = await ctx.db
      .query("sync_logs")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .order("desc")
      .take(1);
    return logs.length > 0 && logs[0].status === "running";
  },
});

/**
 * Get all active Stripe-synced catalog items for a business (internal)
 */
export const getStripeSyncedItems = internalQuery({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
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
 * Create a sync log entry (internal)
 */
export const createSyncLog = internalMutation({
  args: {
    businessId: v.id("businesses"),
    triggeredBy: v.string(),
    totalStripeProducts: v.number(),
  },
  handler: async (ctx, args) => {
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
 * Update sync log progress (internal)
 */
export const updateSyncLog = internalMutation({
  args: {
    syncLogId: v.id("sync_logs"),
    productsCreated: v.optional(v.number()),
    productsUpdated: v.optional(v.number()),
    productsDeactivated: v.optional(v.number()),
    productsSkipped: v.optional(v.number()),
    status: v.optional(v.string()),
    completedAt: v.optional(v.number()),
    errors: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { syncLogId, ...updates } = args;
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );
    await ctx.db.patch(syncLogId, filteredUpdates);
  },
});

/**
 * Upsert a single catalog item during sync (internal)
 */
export const upsertSyncedItem = internalMutation({
  args: {
    businessId: v.id("businesses"),
    stripeProductId: v.string(),
    stripePriceId: v.optional(v.string()),
    name: v.string(),
    description: v.optional(v.string()),
    unitPrice: v.number(),
    currency: v.string(),
  },
  handler: async (ctx, args): Promise<"created" | "updated" | "skipped"> => {
    const existing = await ctx.db
      .query("catalog_items")
      .withIndex("by_businessId_stripeProductId", (q) =>
        q.eq("businessId", args.businessId).eq("stripeProductId", args.stripeProductId)
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
        lastSyncedAt: now,
        status: "active",
        updatedAt: now,
      });
      return "created";
    }
  },
});

/**
 * Deactivate a synced item that's no longer in Stripe (internal)
 */
export const deactivateSyncedItem = internalMutation({
  args: { itemId: v.id("catalog_items") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.itemId, {
      status: "inactive",
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update lastSyncAt on stripe integration (internal)
 */
export const updateIntegrationLastSync = internalMutation({
  args: { integrationId: v.id("stripe_integrations") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.integrationId, {
      lastSyncAt: Date.now(),
    });
  },
});

// ============================================
// STRIPE SYNC — Public action
// ============================================

/**
 * Sync products from Stripe into the catalog
 */
export const syncFromStripe = action({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    syncLogId: string;
    created: number;
    updated: number;
    deactivated: number;
    skipped: number;
    errors: string[];
  }> => {
    // Type-erased references to avoid TS2589 "excessively deep" type instantiation
    // (Convex known limitation with deeply nested internal type inference in actions)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const internalRef: any = internal;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runQuery: any = ctx.runQuery.bind(ctx);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const runMutation: any = ctx.runMutation.bind(ctx);

    // Auth: verify caller identity and role
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const hasRole = await runQuery(
      internalRef.functions.catalogItems.verifyFinanceAdminRole,
      { clerkUserId: identity.subject, businessId: args.businessId }
    ) as boolean;
    if (!hasRole) throw new Error("Not authorized: requires owner, finance_admin, or manager role");

    // Prevent concurrent syncs
    const alreadyRunning = await runQuery(
      internalRef.functions.catalogItems.hasRunningSync,
      { businessId: args.businessId }
    ) as boolean;
    if (alreadyRunning) throw new Error("A sync is already in progress for this business");

    // Get Stripe integration
    const integration = await runQuery(
      internalRef.functions.stripeIntegrations.getIntegrationInternal,
      { businessId: args.businessId }
    ) as { _id: string; stripeSecretKey: string; status: string } | null;

    if (!integration || integration.status !== "connected") {
      throw new Error("Stripe is not connected for this business");
    }

    // Create Stripe client
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(integration.stripeSecretKey);

    // Fetch all active products with expanded default_price
    let products;
    try {
      products = await stripe.products.list({
        active: true,
        expand: ["data.default_price"],
        limit: 100,
      }).autoPagingToArray({ limit: 10000 });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to fetch products from Stripe";
      throw new Error(`Stripe API error: ${msg}`);
    }

    // Create sync log
    const syncLogId = await runMutation(
      internalRef.functions.catalogItems.createSyncLog,
      {
        businessId: args.businessId,
        triggeredBy: identity.subject,
        totalStripeProducts: products.length,
      }
    ) as string;

    let created = 0;
    let updated = 0;
    let skipped = 0;
    let deactivated = 0;
    const errors: string[] = [];
    const syncedStripeProductIds = new Set<string>();

    // Process each product
    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      try {
        // Resolve price: default_price → first price → 0
        let unitPrice = 0;
        let currency = "usd";
        let priceId: string | undefined;

        const defaultPrice = product.default_price;
        if (defaultPrice && typeof defaultPrice === "object" && "unit_amount" in defaultPrice) {
          unitPrice = (defaultPrice.unit_amount ?? 0) / 100;
          currency = defaultPrice.currency ?? "usd";
          priceId = defaultPrice.id;
        }

        const result = await runMutation(
          internalRef.functions.catalogItems.upsertSyncedItem,
          {
            businessId: args.businessId,
            stripeProductId: product.id,
            stripePriceId: priceId,
            name: product.name,
            description: product.description ?? undefined,
            unitPrice,
            currency: currency.toLowerCase(),
          }
        ) as "created" | "updated" | "skipped";

        syncedStripeProductIds.add(product.id);

        if (result === "created") created++;
        else if (result === "updated") updated++;
        else if (result === "skipped") skipped++;

        // Update progress every 20 products
        if ((i + 1) % 20 === 0 || i === products.length - 1) {
          await runMutation(
            internalRef.functions.catalogItems.updateSyncLog,
            {
              syncLogId,
              productsCreated: created,
              productsUpdated: updated,
              productsSkipped: skipped,
            }
          );
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        errors.push(`Product ${product.id}: ${msg}`);
      }
    }

    // Deactivate items that are no longer in Stripe
    const existingSyncedItems = await runQuery(
      internalRef.functions.catalogItems.getStripeSyncedItems,
      { businessId: args.businessId }
    ) as Array<{ _id: string; stripeProductId?: string; status: string; locallyDeactivated?: boolean }>;

    for (const item of existingSyncedItems) {
      if (
        item.stripeProductId &&
        !syncedStripeProductIds.has(item.stripeProductId) &&
        item.status === "active" &&
        !item.locallyDeactivated
      ) {
        await runMutation(
          internalRef.functions.catalogItems.deactivateSyncedItem,
          { itemId: item._id }
        );
        deactivated++;
      }
    }

    // Finalize sync log
    const finalStatus = errors.length > 0 ? "partial" : "completed";
    await runMutation(
      internalRef.functions.catalogItems.updateSyncLog,
      {
        syncLogId,
        productsCreated: created,
        productsUpdated: updated,
        productsDeactivated: deactivated,
        productsSkipped: skipped,
        status: finalStatus,
        completedAt: Date.now(),
        errors: errors.length > 0 ? errors : undefined,
      }
    );

    // Update integration lastSyncAt
    await runMutation(
      internalRef.functions.catalogItems.updateIntegrationLastSync,
      { integrationId: integration._id }
    );

    return {
      success: true,
      syncLogId,
      created,
      updated,
      deactivated,
      skipped,
      errors,
    };
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

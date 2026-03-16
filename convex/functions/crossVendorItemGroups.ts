/**
 * Cross-Vendor Item Groups — Convex queries and mutations
 *
 * Groups equivalent items from different vendors for price comparison.
 *
 * Feature: 001-smart-vendor-intelligence (#320)
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId } from "../lib/resolvers";

/**
 * T038: Create a cross-vendor item group.
 */
export const createGroup = mutation({
  args: {
    businessId: v.id("businesses"),
    groupName: v.string(),
    itemReferences: v.array(
      v.object({
        vendorId: v.id("vendors"),
        itemIdentifier: v.string(),
      })
    ),
    matchSource: v.union(
      v.literal("ai-suggested"),
      v.literal("user-confirmed"),
      v.literal("user-created")
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    if (args.itemReferences.length < 2) {
      throw new Error("Need at least 2 item references for comparison");
    }

    if (!args.groupName.trim()) {
      throw new Error("Group name is required");
    }

    const now = Date.now();

    const groupId = await ctx.db.insert("cross_vendor_item_groups", {
      businessId: args.businessId,
      groupId: "" as any, // Convex auto-generates _id
      groupName: args.groupName.trim(),
      itemReferences: args.itemReferences,
      matchSource: args.matchSource,
      createdTimestamp: now,
      lastUpdatedTimestamp: now,
    });

    // Update the groupId field to point to itself
    await ctx.db.patch(groupId, { groupId });

    // Link price history records to this group
    for (const ref of args.itemReferences) {
      const records = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_vendorId", (q) => q.eq("vendorId", ref.vendorId))
        .collect();

      const matching = records.filter(
        (r) => r.itemIdentifier === ref.itemIdentifier
      );
      for (const record of matching) {
        await ctx.db.patch(record._id, { itemGroupId: groupId });
      }
    }

    return groupId;
  },
});

/**
 * T039: Update a cross-vendor item group.
 */
export const updateGroup = mutation({
  args: {
    groupId: v.id("cross_vendor_item_groups"),
    groupName: v.optional(v.string()),
    itemReferences: v.optional(
      v.array(
        v.object({
          vendorId: v.id("vendors"),
          itemIdentifier: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error("Group not found");

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", group.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    const updates: Record<string, unknown> = {
      lastUpdatedTimestamp: Date.now(),
    };

    if (args.groupName !== undefined) {
      updates.groupName = args.groupName.trim();
    }

    if (args.itemReferences !== undefined) {
      if (args.itemReferences.length < 2) {
        throw new Error("Need at least 2 item references");
      }
      updates.itemReferences = args.itemReferences;
      updates.matchSource = "user-confirmed"; // User modified = user-confirmed
    }

    await ctx.db.patch(args.groupId, updates);
    return { success: true };
  },
});

/**
 * T040: Delete a cross-vendor item group.
 */
export const deleteGroup = mutation({
  args: {
    groupId: v.id("cross_vendor_item_groups"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const group = await ctx.db.get(args.groupId);
    if (!group) throw new Error("Group not found");

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", group.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    // Unlink price history records
    const linkedRecords = await ctx.db
      .query("vendor_price_history")
      .withIndex("by_item_group", (q) => q.eq("itemGroupId", args.groupId))
      .collect();

    for (const record of linkedRecords) {
      await ctx.db.patch(record._id, { itemGroupId: undefined });
    }

    await ctx.db.delete(args.groupId);
    return { success: true };
  },
});

/**
 * T041: List all cross-vendor item groups for a business.
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    matchSource: v.optional(
      v.union(
        v.literal("ai-suggested"),
        v.literal("user-confirmed"),
        v.literal("user-created")
      )
    ),
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

    const limit = args.limit ?? 50;

    let groups;
    if (args.matchSource) {
      groups = await ctx.db
        .query("cross_vendor_item_groups")
        .withIndex("by_match_source", (q) =>
          q
            .eq("businessId", args.businessId)
            .eq("matchSource", args.matchSource!)
        )
        .collect();
    } else {
      groups = await ctx.db
        .query("cross_vendor_item_groups")
        .withIndex("by_business", (q) =>
          q.eq("businessId", args.businessId)
        )
        .collect();
    }

    groups.sort((a, b) => b.lastUpdatedTimestamp - a.lastUpdatedTimestamp);

    return groups.slice(0, limit);
  },
});

/**
 * T042: Get a single group with enriched price data.
 */
export const getGroupById = query({
  args: {
    groupId: v.id("cross_vendor_item_groups"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return null;

    const group = await ctx.db.get(args.groupId);
    if (!group) return null;

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", group.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") return null;

    // Enrich with price data for each vendor reference
    const priceData = [];
    for (const ref of group.itemReferences) {
      const vendor = await ctx.db.get(ref.vendorId);

      const records = await ctx.db
        .query("vendor_price_history")
        .withIndex("by_vendorId", (q) => q.eq("vendorId", ref.vendorId))
        .collect();

      const matching = records
        .filter(
          (r) => r.itemIdentifier === ref.itemIdentifier && !r.archivedFlag
        )
        .sort((a, b) =>
          (b.invoiceDate ?? b.observedAt).localeCompare(
            a.invoiceDate ?? a.observedAt
          )
        );

      const latest = matching[0];
      const prices = matching.map((r) => r.unitPrice);
      let stabilityScore = 100;
      if (prices.length >= 2) {
        const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
        if (mean > 0) {
          const variance =
            prices.reduce((s, p) => s + Math.pow(p - mean, 2), 0) /
            prices.length;
          stabilityScore = Math.max(
            0,
            Math.round(100 - Math.min((Math.sqrt(variance) / mean) * 100, 100))
          );
        }
      }

      priceData.push({
        vendorId: ref.vendorId,
        vendorName: vendor?.name ?? "Unknown Vendor",
        currentUnitPrice: latest?.unitPrice ?? 0,
        lastPriceChangeDate: latest?.invoiceDate ?? latest?.observedAt ?? "",
        priceStabilityScore: stabilityScore,
        currency: latest?.currency ?? "MYR",
      });
    }

    // Sort by price ascending (lowest first)
    priceData.sort((a, b) => a.currentUnitPrice - b.currentUnitPrice);

    return { ...group, priceData };
  },
});

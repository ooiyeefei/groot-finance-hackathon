/**
 * Customer Functions - Convex queries and mutations
 *
 * CRUD operations for the customer directory.
 * Customers are used for pre-populating invoice recipient info.
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId } from "../lib/resolvers";
import { customerStatusValidator } from "../lib/validators";

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
 * List customers for a business
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    status: v.optional(v.string()),
    search: v.optional(v.string()),
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

    let customers;
    if (args.status) {
      customers = await ctx.db
        .query("customers")
        .withIndex("by_businessId_status", (q) =>
          q.eq("businessId", args.businessId).eq("status", args.status as never)
        )
        .collect();
    } else {
      customers = await ctx.db
        .query("customers")
        .withIndex("by_businessId", (q) =>
          q.eq("businessId", args.businessId)
        )
        .collect();
    }

    // Filter soft-deleted
    customers = customers.filter((c) => !c.deletedAt);

    // Search filter
    if (args.search) {
      const searchLower = args.search.toLowerCase();
      customers = customers.filter((c) =>
        c.businessName.toLowerCase().includes(searchLower) ||
        c.email.toLowerCase().includes(searchLower) ||
        (c.contactPerson?.toLowerCase().includes(searchLower))
      );
    }

    // Sort by name
    customers.sort((a, b) => a.businessName.localeCompare(b.businessName));

    // Limit
    if (args.limit) {
      customers = customers.slice(0, args.limit);
    }

    return customers;
  },
});

/**
 * Search customers by name (autocomplete)
 */
export const searchByName = query({
  args: {
    businessId: v.id("businesses"),
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return [];

    const customers = await ctx.db
      .query("customers")
      .withIndex("by_businessId_status", (q) =>
        q.eq("businessId", args.businessId).eq("status", "active")
      )
      .collect();

    const queryLower = args.query.toLowerCase();
    const filtered = customers
      .filter((c) => !c.deletedAt && c.businessName.toLowerCase().includes(queryLower))
      .slice(0, args.limit ?? 10);

    return filtered;
  },
});

/**
 * Get a customer by ID
 */
export const getById = query({
  args: {
    id: v.id("customers"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const customer = await ctx.db.get(args.id);
    if (!customer || customer.businessId !== args.businessId || customer.deletedAt) {
      return null;
    }

    return customer;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new customer
 */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    businessName: v.string(),
    contactPerson: v.optional(v.string()),
    email: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    taxId: v.optional(v.string()),
    customerCode: v.optional(v.string()),
    notes: v.optional(v.string()),
    // 016-e-invoice-schema-change: Tax identifiers + structured address
    tin: v.optional(v.string()),
    brn: v.optional(v.string()),
    sstRegistration: v.optional(v.string()),
    peppolParticipantId: v.optional(v.string()),
    addressLine1: v.optional(v.string()),
    addressLine2: v.optional(v.string()),
    addressLine3: v.optional(v.string()),
    city: v.optional(v.string()),
    stateCode: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    countryCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const customerId = await ctx.db.insert("customers", {
      businessId: args.businessId,
      businessName: args.businessName,
      contactPerson: args.contactPerson,
      email: args.email,
      phone: args.phone,
      address: args.address,
      taxId: args.taxId,
      customerCode: args.customerCode,
      notes: args.notes,
      tin: args.tin,
      brn: args.brn,
      sstRegistration: args.sstRegistration,
      peppolParticipantId: args.peppolParticipantId,
      addressLine1: args.addressLine1,
      addressLine2: args.addressLine2,
      addressLine3: args.addressLine3,
      city: args.city,
      stateCode: args.stateCode,
      postalCode: args.postalCode,
      countryCode: args.countryCode,
      status: "active",
      updatedAt: Date.now(),
    });

    return customerId;
  },
});

/**
 * Update a customer
 */
export const update = mutation({
  args: {
    id: v.id("customers"),
    businessId: v.id("businesses"),
    businessName: v.optional(v.string()),
    contactPerson: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    taxId: v.optional(v.string()),
    customerCode: v.optional(v.string()),
    notes: v.optional(v.string()),
    // 016-e-invoice-schema-change: Tax identifiers + structured address
    tin: v.optional(v.string()),
    brn: v.optional(v.string()),
    sstRegistration: v.optional(v.string()),
    peppolParticipantId: v.optional(v.string()),
    addressLine1: v.optional(v.string()),
    addressLine2: v.optional(v.string()),
    addressLine3: v.optional(v.string()),
    city: v.optional(v.string()),
    stateCode: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    countryCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const customer = await ctx.db.get(args.id);
    if (!customer || customer.businessId !== args.businessId || customer.deletedAt) {
      throw new Error("Customer not found");
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
 * Deactivate a customer (soft deactivation)
 */
export const deactivate = mutation({
  args: {
    id: v.id("customers"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const customer = await ctx.db.get(args.id);
    if (!customer || customer.businessId !== args.businessId || customer.deletedAt) {
      throw new Error("Customer not found");
    }

    await ctx.db.patch(args.id, {
      status: "inactive",
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

/**
 * Reactivate a customer
 */
export const reactivate = mutation({
  args: {
    id: v.id("customers"),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    await requireFinanceAdmin(ctx, args.businessId);

    const customer = await ctx.db.get(args.id);
    if (!customer || customer.businessId !== args.businessId || customer.deletedAt) {
      throw new Error("Customer not found");
    }

    await ctx.db.patch(args.id, {
      status: "active",
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

/**
 * Vendors Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Vendor/supplier CRUD operations
 * - Business-level vendor management
 * - Vendor search and lookup for expense tracking
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

// ============================================
// QUERIES
// ============================================

/**
 * List vendors for a business
 * Any active business member can view vendors
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    status: v.optional(v.union(v.literal("prospective"), v.literal("active"), v.literal("inactive"))),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { vendors: [], nextCursor: null };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { vendors: [], nextCursor: null };
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { vendors: [], nextCursor: null };
    }

    const limit = args.limit ?? 100;

    // Get vendors for business
    let vendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Apply status filter
    if (args.status !== undefined) {
      vendors = vendors.filter((v) => v.status === args.status);
    }

    // Apply category filter
    if (args.category) {
      vendors = vendors.filter((v) => v.category === args.category);
    }

    // Sort by name alphabetically
    vendors.sort((a, b) => a.name.localeCompare(b.name));

    // Pagination
    const startIndex = args.cursor ? parseInt(args.cursor, 10) : 0;
    const paginatedVendors = vendors.slice(startIndex, startIndex + limit);
    const nextCursor =
      startIndex + limit < vendors.length
        ? String(startIndex + limit)
        : null;

    return {
      vendors: paginatedVendors,
      nextCursor,
      totalCount: vendors.length,
    };
  },
});

/**
 * Get single vendor by ID
 */
export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    // Resolve ID (supports both Convex ID and legacy UUID)
    const vendor = await resolveById(ctx.db, "vendors", args.id);
    if (!vendor) {
      return null;
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", vendor.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    return vendor;
  },
});

/**
 * Search vendors by name (for autocomplete)
 */
export const searchByName = query({
  args: {
    businessId: v.id("businesses"),
    searchTerm: v.string(),
    limit: v.optional(v.number()),
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
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    const limit = args.limit ?? 10;
    const searchLower = args.searchTerm.toLowerCase();

    // Get all vendors for business and filter by name
    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Filter by search term (case-insensitive) - exclude inactive vendors
    const matchingVendors = vendors
      .filter((v) =>
        v.status !== "inactive" &&
        v.name.toLowerCase().includes(searchLower)
      )
      .slice(0, limit);

    return matchingVendors;
  },
});

/**
 * Get vendor categories for a business
 */
export const getCategories = query({
  args: { businessId: v.id("businesses") },
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
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    // Get all vendors and extract unique categories
    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const categories = new Set<string>();
    for (const vendor of vendors) {
      if (vendor.category) {
        categories.add(vendor.category);
      }
    }

    return Array.from(categories).sort();
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new vendor
 * Any active business member can create vendors
 */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    taxId: v.optional(v.string()),
    category: v.optional(v.string()),
    supplierCode: v.optional(v.string()),
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

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    // Check for duplicate vendor name in same business
    const existingVendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const duplicate = existingVendors.find(
      (v) => v.name.toLowerCase() === args.name.toLowerCase()
    );

    if (duplicate) {
      throw new Error(`Vendor "${args.name}" already exists`);
    }

    // Manually created vendors are "active" (confirmed business relationship)
    const vendorId = await ctx.db.insert("vendors", {
      businessId: args.businessId,
      name: args.name,
      email: args.email,
      phone: args.phone,
      address: args.address,
      taxId: args.taxId,
      category: args.category,
      supplierCode: args.supplierCode,
      status: "active",
      updatedAt: Date.now(),
    });

    return vendorId;
  },
});

/**
 * Update vendor information
 * Any active business member can update vendors
 */
export const update = mutation({
  args: {
    id: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    taxId: v.optional(v.string()),
    category: v.optional(v.string()),
    supplierCode: v.optional(v.string()),
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

    const vendor = await resolveById(ctx.db, "vendors", args.id);
    if (!vendor) {
      throw new Error("Vendor not found");
    }

    // Verify business membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", vendor.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not authorized");
    }

    // Check for duplicate name if name is being changed
    if (args.name && args.name.toLowerCase() !== vendor.name.toLowerCase()) {
      const existingVendors = await ctx.db
        .query("vendors")
        .withIndex("by_businessId", (q) => q.eq("businessId", vendor.businessId))
        .collect();

      const duplicate = existingVendors.find(
        (v) => v._id !== vendor._id && v.name.toLowerCase() === args.name!.toLowerCase()
      );

      if (duplicate) {
        throw new Error(`Vendor "${args.name}" already exists`);
      }
    }

    const { id, ...updates } = args;
    const updateData: Record<string, unknown> = { updatedAt: Date.now() };

    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.email !== undefined) updateData.email = updates.email;
    if (updates.phone !== undefined) updateData.phone = updates.phone;
    if (updates.address !== undefined) updateData.address = updates.address;
    if (updates.taxId !== undefined) updateData.taxId = updates.taxId;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.supplierCode !== undefined) updateData.supplierCode = updates.supplierCode;

    await ctx.db.patch(vendor._id, updateData);
    return vendor._id;
  },
});

/**
 * Deactivate vendor (soft delete pattern)
 * Only admins/owners can deactivate
 */
export const deactivate = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    const vendor = await resolveById(ctx.db, "vendors", args.id);
    if (!vendor) {
      throw new Error("Vendor not found");
    }

    // Verify admin/owner access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", vendor.businessId)
      )
      .first();

    if (!membership || membership.role !== "owner") {
      throw new Error("Only owners can deactivate vendors");
    }

    await ctx.db.patch(vendor._id, {
      status: "inactive",
      updatedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Reactivate a deactivated vendor (sets status back to active)
 */
export const reactivate = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    const vendor = await resolveById(ctx.db, "vendors", args.id);
    if (!vendor) {
      throw new Error("Vendor not found");
    }

    // Verify admin/owner access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", vendor.businessId)
      )
      .first();

    if (!membership || membership.role !== "owner") {
      throw new Error("Only owners can reactivate vendors");
    }

    await ctx.db.patch(vendor._id, {
      status: "active",
      updatedAt: Date.now(),
    });

    return true;
  },
});

/**
 * Hard delete vendor
 * Only owners can permanently delete vendors
 * Should check for linked transactions first
 */
export const remove = mutation({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    const vendor = await resolveById(ctx.db, "vendors", args.id);
    if (!vendor) {
      throw new Error("Vendor not found");
    }

    // Only owners can hard delete
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", vendor.businessId)
      )
      .first();

    if (!membership || membership.role !== "owner") {
      throw new Error("Only owners can permanently delete vendors");
    }

    // Check for linked accounting entries
    // (Convex doesn't support .filter() after .withIndex() - use JS find)
    const allBusinessEntries = await ctx.db
      .query("accounting_entries")
      .withIndex("by_businessId", (q) => q.eq("businessId", vendor.businessId))
      .collect();

    const linkedEntries = allBusinessEntries.find((e) => e.vendorId === vendor._id);

    if (linkedEntries) {
      throw new Error(
        "Cannot delete vendor with linked transactions. Deactivate instead."
      );
    }

    await ctx.db.delete(vendor._id);
    return true;
  },
});

// ============================================
// INTERNAL MUTATIONS (for system use)
// ============================================

import { internalMutation, internalQuery } from "../_generated/server";

/**
 * Upsert vendor by name (internal - for OCR/extraction pipelines)
 *
 * Creates a new vendor if not found, returns existing vendorId if found.
 * Case-insensitive exact match on name.
 * Does NOT change status of existing vendors.
 *
 * @param businessId - The business ID
 * @param vendorName - The vendor name to upsert
 * @param metadata - Optional vendor metadata (email, phone, address, taxId)
 * @returns vendorId and whether it was newly created
 */
export const upsertByName = internalMutation({
  args: {
    businessId: v.id("businesses"),
    vendorName: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    taxId: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const normalizedName = args.vendorName.trim();

    if (!normalizedName) {
      throw new Error("Vendor name is required");
    }

    // Search for existing vendor (case-insensitive exact match)
    const existingVendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    const existingVendor = existingVendors.find(
      (v) => v.name.toLowerCase().trim() === normalizedName.toLowerCase()
    );

    if (existingVendor) {
      // Vendor exists - return existing ID without changing status
      return {
        vendorId: existingVendor._id,
        created: false,
        status: existingVendor.status,
      };
    }

    // Create new vendor with "prospective" status
    const vendorId = await ctx.db.insert("vendors", {
      businessId: args.businessId,
      name: normalizedName,
      email: args.email,
      phone: args.phone,
      address: args.address,
      taxId: args.taxId,
      category: args.category,
      status: "prospective",
      updatedAt: Date.now(),
    });

    return {
      vendorId,
      created: true,
      status: "prospective" as const,
    };
  },
});

/**
 * Promote vendor from prospective to active (internal)
 *
 * Called when first accounting entry is created for a vendor.
 * Only promotes if current status is "prospective".
 * Does not change "active" or "inactive" vendors.
 *
 * @param vendorId - The vendor ID to promote
 * @returns Whether promotion occurred
 */
export const promoteIfProspective = internalMutation({
  args: {
    vendorId: v.id("vendors"),
  },
  handler: async (ctx, args): Promise<
    | { promoted: true; newStatus: "active" }
    | { promoted: false; currentStatus: string | undefined }
  > => {
    const vendor = await ctx.db.get(args.vendorId);

    if (!vendor) {
      throw new Error("Vendor not found");
    }

    // Only promote if currently prospective
    if (vendor.status === "prospective") {
      await ctx.db.patch(args.vendorId, {
        status: "active",
        updatedAt: Date.now(),
      });
      return { promoted: true, newStatus: "active" as const };
    }

    // Vendor is already active or inactive - don't change
    return { promoted: false, currentStatus: vendor.status };
  },
});

/**
 * Get vendor by name (internal query)
 *
 * Case-insensitive exact match lookup.
 * Returns null if not found.
 */
export const getByName = internalQuery({
  args: {
    businessId: v.id("businesses"),
    vendorName: v.string(),
  },
  handler: async (ctx, args) => {
    const normalizedName = args.vendorName.trim().toLowerCase();

    if (!normalizedName) {
      return null;
    }

    const vendors = await ctx.db
      .query("vendors")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    return vendors.find(
      (v) => v.name.toLowerCase().trim() === normalizedName
    ) || null;
  },
});

/**
 * Set vendor status (internal - for system operations)
 *
 * Allows setting vendor status directly without authentication checks.
 * Used for system operations like batch updates.
 */
export const setStatus = internalMutation({
  args: {
    vendorId: v.id("vendors"),
    status: v.union(v.literal("prospective"), v.literal("active"), v.literal("inactive")),
  },
  handler: async (ctx, args) => {
    const vendor = await ctx.db.get(args.vendorId);

    if (!vendor) {
      throw new Error("Vendor not found");
    }

    await ctx.db.patch(args.vendorId, {
      status: args.status,
      updatedAt: Date.now(),
    });

    return { vendorId: args.vendorId, status: args.status };
  },
});

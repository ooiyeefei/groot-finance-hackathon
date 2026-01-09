/**
 * Business Functions - Convex queries and mutations for business management
 *
 * These functions handle:
 * - Business CRUD operations
 * - Business settings and branding
 * - Multi-tenancy support
 */

import { v } from "convex/values";
import { query, mutation, internalQuery, internalMutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

// ============================================
// QUERIES
// ============================================

/**
 * Get the current user's active business
 */
export const getCurrentBusiness = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user || !user.businessId) {
      return null;
    }

    return await ctx.db.get(user.businessId);
  },
});

/**
 * Get business by ID (Convex ID or legacy UUID)
 */
export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, args) => {
    return await resolveById(ctx.db, "businesses", args.id);
  },
});

/**
 * Get all businesses the current user has access to
 */
export const getMyBusinesses = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Get all memberships, then filter by status in JS
    // (Convex doesn't support .filter() after .withIndex())
    const allMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const memberships = allMemberships.filter((m) => m.status === "active");

    // Fetch business details
    const businesses = await Promise.all(
      memberships.map(async (membership) => {
        const business = await ctx.db.get(membership.businessId);
        return business ? { ...business, role: membership.role } : null;
      })
    );

    return businesses.filter(Boolean);
  },
});

/**
 * Get all businesses with full membership details (for business-context.ts)
 * Returns BusinessWithOwnership[] equivalent
 */
export const getMyBusinessesWithMemberships = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Get all memberships, then filter by status in JS
    // (Convex doesn't support .filter() after .withIndex())
    const allMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .collect();

    const memberships = allMemberships.filter((m) => m.status === "active");

    // Sort by lastAccessedAt (descending)
    const sortedMemberships = memberships.sort((a, b) =>
      (b.lastAccessedAt || 0) - (a.lastAccessedAt || 0)
    );

    // Fetch business details with ownership check
    const businessesWithMemberships = await Promise.all(
      sortedMemberships.map(async (membership) => {
        const business = await ctx.db.get(membership.businessId);
        if (!business) return null;

        // Check if owner by looking for owner role in memberships
        // (Convex doesn't support .filter() after .withIndex() - use JS filter)
        const bizMemberships = await ctx.db
          .query("business_memberships")
          .withIndex("by_businessId", (q) => q.eq("businessId", membership.businessId))
          .collect();

        const ownerMembership = bizMemberships.find((m) => m.role === "owner");

        const isOwner = ownerMembership?.userId === user._id;

        return {
          id: business._id,
          name: business.name,
          slug: business.slug,
          ownerId: ownerMembership?.userId,
          countryCode: business.countryCode,
          homeCurrency: business.homeCurrency,
          logoUrl: business.logoStoragePath,
          logoFallbackColor: business.logoFallbackColor,
          membership: {
            id: membership._id,
            userId: membership.userId,
            businessId: membership.businessId,
            role: membership.role,
            invitedAt: membership.invitedAt,
            joinedAt: membership.joinedAt,
            lastAccessedAt: membership.lastAccessedAt,
            status: membership.status,
            createdAt: membership._creationTime,
            updatedAt: membership.updatedAt,
          },
          isOwner,
        };
      })
    );

    return businessesWithMemberships.filter(Boolean);
  },
});

/**
 * Get current business context with computed permissions
 * Returns BusinessContext equivalent for RBAC
 */
export const getBusinessContext = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user || !user.businessId) {
      return null;
    }

    // Get business details
    const business = await ctx.db.get(user.businessId);
    if (!business) {
      return null;
    }

    // Get user's membership in this business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", user.businessId!)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    // Check if user is owner
    // (Convex doesn't support .filter() after .withIndex() - use JS filter)
    const bizMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", user.businessId!))
      .collect();

    const ownerMembership = bizMemberships.find((m) => m.role === "owner");
    const isOwner = ownerMembership?.userId === user._id;

    // Compute permissions based on role and ownership
    const role = membership.role as "admin" | "manager" | "employee" | "owner";
    const permissions = {
      // Owner-only permissions (business-level)
      canDeleteBusiness: isOwner,
      canManageSubscription: isOwner,
      canTransferOwnership: isOwner,
      // Operational permissions based on role
      canInviteMembers: role === "owner" || role === "admin" || role === "manager",
      canRemoveMembers: role === "owner" || role === "admin" || role === "manager",
      canChangeSettings: role === "owner" || role === "admin",
      canApproveExpenses: role === "owner" || role === "admin" || role === "manager",
      canManageCategories: role === "owner" || role === "admin" || role === "manager",
      canViewAllData: role === "owner" || role === "admin" || role === "manager",
    };

    return {
      businessId: business._id,
      businessName: business.name,
      role,
      isOwner,
      permissions,
    };
  },
});

/**
 * Check if current user is owner of a specific business
 * Accepts string ID (Convex ID or legacy UUID)
 */
export const checkOwnership = query({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return false;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return false;
    }

    // Resolve business ID (supports both Convex and legacy IDs)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return false;
    }

    // (Convex doesn't support .filter() after .withIndex() - use JS filter)
    const bizMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const ownerMembership = bizMemberships.find((m) => m.role === "owner");
    return ownerMembership?.userId === user._id;
  },
});

/**
 * Get business by Stripe customer ID
 */
export const getByStripeCustomerId = query({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("businesses")
      .withIndex("by_stripeCustomerId", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .first();
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new business
 * The creating user becomes the owner
 */
export const create = mutation({
  args: {
    name: v.string(),
    homeCurrency: v.optional(v.string()),
    taxId: v.optional(v.string()),
    address: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
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

    // Create the business
    const businessId = await ctx.db.insert("businesses", {
      name: args.name,
      homeCurrency: args.homeCurrency || "MYR",
      taxId: args.taxId,
      address: args.address,
      contactEmail: args.contactEmail || user.email,
      updatedAt: Date.now(),
    });

    // Create owner membership
    await ctx.db.insert("business_memberships", {
      userId: user._id,
      businessId,
      role: "owner",
      status: "active",
      joinedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Set as user's active business if they don't have one
    if (!user.businessId) {
      await ctx.db.patch(user._id, {
        businessId,
        updatedAt: Date.now(),
      });
    }

    return businessId;
  },
});

/**
 * Update business details
 * Requires admin or owner role
 */
export const update = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.optional(v.string()),
    taxId: v.optional(v.string()),
    address: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    homeCurrency: v.optional(v.string()),
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

    // Check membership and role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (!["owner", "admin"].includes(membership.role)) {
      throw new Error("Insufficient permissions");
    }

    const { businessId, ...updates } = args;
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );

    await ctx.db.patch(businessId, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });

    return businessId;
  },
});

/**
 * Update business logo storage path
 */
export const updateLogo = mutation({
  args: {
    businessId: v.id("businesses"),
    logoStoragePath: v.string(),
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

    // Check membership and role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      throw new Error("Insufficient permissions");
    }

    await ctx.db.patch(args.businessId, {
      logoStoragePath: args.logoStoragePath,
      updatedAt: Date.now(),
    });

    return args.businessId;
  },
});

/**
 * Update Stripe subscription info
 * Called from Stripe webhook handler
 */
export const updateStripeSubscription = mutation({
  args: {
    businessId: v.id("businesses"),
    stripeCustomerId: v.optional(v.string()),
    stripeSubscriptionId: v.optional(v.string()),
    subscriptionStatus: v.optional(v.string()),
    subscriptionPlan: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { businessId, ...updates } = args;
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== undefined)
    );

    await ctx.db.patch(businessId, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });

    return businessId;
  },
});

/**
 * Delete business (soft delete by removing all memberships)
 * Only owner can delete
 */
export const deleteBusiness = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      throw new Error("User not found");
    }

    // Check if user is owner
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.role !== "owner") {
      throw new Error("Only owner can delete business");
    }

    // Delete all memberships
    const allMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    for (const m of allMemberships) {
      await ctx.db.delete(m._id);
    }

    // Clear businessId from all affected users
    const affectedUsers = await ctx.db
      .query("users")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    for (const u of affectedUsers) {
      await ctx.db.patch(u._id, { businessId: undefined, updatedAt: Date.now() });
    }

    // Delete the business
    await ctx.db.delete(args.businessId);

    return true;
  },
});

// ============================================
// STRING ID HELPERS (for backward compatibility)
// ============================================

/**
 * Get business profile by string ID (Convex ID or legacy UUID)
 * Returns formatted BusinessProfile for account-management service
 */
export const getBusinessProfileByStringId = query({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    // Resolve business (supports both Convex and legacy IDs)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return null;
    }

    // Verify user has access to this business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    // Get owner info
    // (Convex doesn't support .filter() after .withIndex() - use JS filter)
    const bizMemberships = await ctx.db
      .query("business_memberships")
      .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
      .collect();

    const ownerMembership = bizMemberships.find((m) => m.role === "owner");
    let ownerName = null;
    if (ownerMembership) {
      const owner = await ctx.db.get(ownerMembership.userId);
      ownerName = owner?.fullName || owner?.email || null;
    }

    // Format as BusinessProfile (snake_case for API compatibility)
    return {
      id: business._id,
      name: business.name,
      slug: business.slug || null,
      tax_id: business.taxId || null,
      address: business.address || null,
      contact_email: business.contactEmail || null,
      home_currency: business.homeCurrency || "SGD",
      country_code: business.countryCode || null,
      logo_url: business.logoStoragePath || business.logoUrl || null,
      logo_fallback_color: business.logoFallbackColor || null,
      owner_id: ownerMembership?.userId || null,
      owner_name: ownerName,
      stripe_customer_id: business.stripeCustomerId || null,
      stripe_subscription_id: business.stripeSubscriptionId || null,
      subscription_status: business.subscriptionStatus || null,
      plan_name: business.planName || null,
      trial_end_date: business.trialEndDate
        ? new Date(business.trialEndDate).toISOString()
        : null,
      custom_expense_categories: business.customExpenseCategories || null,
      custom_cogs_categories: (business.customCogsCategories as Array<unknown>) || null,
      created_at: new Date(business._creationTime).toISOString(),
      updated_at: business.updatedAt
        ? new Date(business.updatedAt).toISOString()
        : new Date(business._creationTime).toISOString(),
    };
  },
});

/**
 * Update business profile by string ID (Convex ID or legacy UUID)
 * For account-management service - accepts snake_case fields
 */
export const updateBusinessByStringId = mutation({
  args: {
    businessId: v.string(),
    name: v.optional(v.string()),
    tax_id: v.optional(v.string()),
    address: v.optional(v.string()),
    contact_email: v.optional(v.string()),
    home_currency: v.optional(v.string()),
    country_code: v.optional(v.string()),
    logo_url: v.optional(v.string()),
    logo_fallback_color: v.optional(v.string()),
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

    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Check membership and role
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (!["owner", "admin"].includes(membership.role)) {
      throw new Error("Insufficient permissions");
    }

    // Build update object (convert snake_case to camelCase)
    const updates: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) updates.name = args.name;
    if (args.tax_id !== undefined) updates.taxId = args.tax_id;
    if (args.address !== undefined) updates.address = args.address;
    if (args.contact_email !== undefined) updates.contactEmail = args.contact_email;
    if (args.home_currency !== undefined) updates.homeCurrency = args.home_currency;
    if (args.country_code !== undefined) updates.countryCode = args.country_code;
    if (args.logo_url !== undefined) updates.logoStoragePath = args.logo_url;
    if (args.logo_fallback_color !== undefined) updates.logoFallbackColor = args.logo_fallback_color;

    await ctx.db.patch(business._id, updates);

    return business._id;
  },
});

// ============================================
// COGS CATEGORIES
// ============================================

/**
 * Get COGS categories for a business
 * Uses same schema as expense categories for consistency (is_active, category_name)
 */
export const getCogsCategories = query({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    // Verify membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    // Return categories array or empty array
    // Schema matches expense categories: is_active (not is_enabled), category_name
    return (business.customCogsCategories as Array<{
      id: string;
      category_name: string;
      description?: string;
      is_active: boolean;
      cost_type?: string;
      ai_keywords?: string[];
      vendor_patterns?: string[];
      sort_order?: number;
      created_at: string;
      updated_at: string;
    }>) || [];
  },
});

/**
 * Get enabled COGS categories only
 * Accepts explicit businessId parameter (matching expense categories pattern)
 * Schema matches expense categories for consistency (is_active, category_name)
 */
export const getEnabledCogsCategories = query({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Resolve business from passed businessId (supports both Convex and legacy IDs)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    // Verify membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    // Filter to active categories only (matches expense categories pattern)
    // Schema: is_active (not is_enabled), category_name (not name)
    const categories = (business.customCogsCategories as Array<{
      id: string;
      category_name: string;
      description?: string;
      is_active: boolean;
      cost_type?: string;
      ai_keywords?: string[];
      vendor_patterns?: string[];
      sort_order?: number;
      created_at: string;
      updated_at: string;
    }>) || [];

    // Filter by is_active (same as expense categories)
    return categories.filter((c) => c.is_active !== false);
  },
});

/**
 * Create a COGS category
 * Uses same schema as expense categories for consistency
 */
export const createCogsCategory = mutation({
  args: {
    businessId: v.string(),
    category_name: v.string(),
    description: v.optional(v.string()),
    cost_type: v.optional(v.string()),
    ai_keywords: v.optional(v.array(v.string())),
    vendor_patterns: v.optional(v.array(v.string())),
    sort_order: v.optional(v.number()),
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

    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Check permissions (manager, admin, or owner)
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || !["owner", "admin", "manager"].includes(membership.role)) {
      throw new Error("Insufficient permissions");
    }

    // Get current categories (matches expense categories schema)
    const categories = (business.customCogsCategories as Array<{
      id: string;
      category_name: string;
      description?: string;
      is_active: boolean;
      cost_type?: string;
      ai_keywords?: string[];
      vendor_patterns?: string[];
      sort_order?: number;
      created_at: string;
      updated_at: string;
    }>) || [];

    // Check for duplicate name
    if (categories.some((c) => c.category_name.toLowerCase() === args.category_name.toLowerCase())) {
      throw new Error("Category with this name already exists");
    }

    // Create new category (matches expense categories structure)
    // Note: Using id (auto-generated) instead of category_code for lookups
    const now = new Date().toISOString();
    const newCategory = {
      id: `cogs_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      category_name: args.category_name,
      description: args.description,
      is_active: true,
      cost_type: args.cost_type || 'direct',
      ai_keywords: args.ai_keywords || [],
      vendor_patterns: args.vendor_patterns || [],
      sort_order: args.sort_order || 99,
      created_at: now,
      updated_at: now,
    };

    // Add to array
    categories.push(newCategory);

    // Update business
    await ctx.db.patch(business._id, {
      customCogsCategories: categories,
      updatedAt: Date.now(),
    });

    return newCategory;
  },
});

/**
 * Update a COGS category
 * Uses same schema as expense categories for consistency
 */
export const updateCogsCategory = mutation({
  args: {
    businessId: v.string(),
    categoryId: v.string(),
    category_name: v.optional(v.string()),
    description: v.optional(v.string()),
    cost_type: v.optional(v.string()),
    ai_keywords: v.optional(v.array(v.string())),
    vendor_patterns: v.optional(v.array(v.string())),
    sort_order: v.optional(v.number()),
    is_active: v.optional(v.boolean()),
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

    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Check permissions
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || !["owner", "admin", "manager"].includes(membership.role)) {
      throw new Error("Insufficient permissions");
    }

    // Get current categories (matches expense categories schema)
    const categories = (business.customCogsCategories as Array<{
      id: string;
      category_name: string;
      description?: string;
      is_active: boolean;
      cost_type?: string;
      ai_keywords?: string[];
      vendor_patterns?: string[];
      sort_order?: number;
      created_at: string;
      updated_at: string;
    }>) || [];

    // Find category index
    const index = categories.findIndex((c) => c.id === args.categoryId);
    if (index === -1) {
      throw new Error("Category not found");
    }

    // Check for duplicate name if updating name
    if (args.category_name !== undefined) {
      const duplicate = categories.find(
        (c) =>
          c.id !== args.categoryId &&
          c.category_name.toLowerCase() === args.category_name!.toLowerCase()
      );
      if (duplicate) {
        throw new Error("Category with this name already exists");
      }
    }

    // Update category (matches expense categories structure)
    const updated = {
      ...categories[index],
      ...(args.category_name !== undefined && { category_name: args.category_name }),
      ...(args.description !== undefined && { description: args.description }),
      ...(args.cost_type !== undefined && { cost_type: args.cost_type }),
      ...(args.ai_keywords !== undefined && { ai_keywords: args.ai_keywords }),
      ...(args.vendor_patterns !== undefined && { vendor_patterns: args.vendor_patterns }),
      ...(args.sort_order !== undefined && { sort_order: args.sort_order }),
      ...(args.is_active !== undefined && { is_active: args.is_active }),
      updated_at: new Date().toISOString(),
    };

    categories[index] = updated;

    // Save
    await ctx.db.patch(business._id, {
      customCogsCategories: categories,
      updatedAt: Date.now(),
    });

    return updated;
  },
});

/**
 * Delete a COGS category
 * Uses same schema as expense categories for consistency
 */
export const deleteCogsCategory = mutation({
  args: {
    businessId: v.string(),
    categoryId: v.string(),
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

    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Check permissions
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || !["owner", "admin", "manager"].includes(membership.role)) {
      throw new Error("Insufficient permissions");
    }

    // Get current categories (matches expense categories schema)
    const categories = (business.customCogsCategories as Array<{
      id: string;
      category_name: string;
      description?: string;
      is_active: boolean;
      cost_type?: string;
      ai_keywords?: string[];
      vendor_patterns?: string[];
      sort_order?: number;
      created_at: string;
      updated_at: string;
    }>) || [];

    // Filter out the deleted category
    const filtered = categories.filter((c) => c.id !== args.categoryId);

    if (filtered.length === categories.length) {
      throw new Error("Category not found");
    }

    // Save
    await ctx.db.patch(business._id, {
      customCogsCategories: filtered,
      updatedAt: Date.now(),
    });

    return true;
  },
});

// ============================================
// EXPENSE CATEGORIES
// ============================================

/**
 * Get expense categories for a business
 */
export const getExpenseCategories = query({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    // Verify membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    // Return categories array or empty array
    return (business.customExpenseCategories as Array<{
      id: string;
      category_name: string;
      description?: string;
      is_active: boolean;
      ai_keywords?: string[];
      vendor_patterns?: string[];
      requires_receipt?: boolean;
      requires_manager_approval?: boolean;
      sort_order?: number;
      created_at: string;
      updated_at: string;
    }>) || [];
  },
});

/**
 * Get enabled expense categories only
 */
export const getEnabledExpenseCategories = query({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return [];
    }

    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return [];
    }

    // Verify membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return [];
    }

    // Filter to enabled categories only
    const categories = (business.customExpenseCategories as Array<{
      id: string;
      category_name: string;
      description?: string;
      is_active: boolean;
      ai_keywords?: string[];
      vendor_patterns?: string[];
      requires_receipt?: boolean;
      requires_manager_approval?: boolean;
      sort_order?: number;
      created_at: string;
      updated_at: string;
    }>) || [];

    return categories.filter((c) => c.is_active !== false);
  },
});

/**
 * Create an expense category
 */
export const createExpenseCategory = mutation({
  args: {
    businessId: v.string(),
    category_name: v.string(),
    description: v.optional(v.string()),
    ai_keywords: v.optional(v.array(v.string())),
    vendor_patterns: v.optional(v.array(v.string())),
    requires_receipt: v.optional(v.boolean()),
    requires_manager_approval: v.optional(v.boolean()),
    sort_order: v.optional(v.number()),
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

    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Check permissions (manager, admin, or owner)
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || !["owner", "admin", "manager"].includes(membership.role)) {
      throw new Error("Insufficient permissions");
    }

    // Get current categories
    const categories = (business.customExpenseCategories as Array<{
      id: string;
      category_name: string;
      description?: string;
      is_active: boolean;
      ai_keywords?: string[];
      vendor_patterns?: string[];
      requires_receipt?: boolean;
      requires_manager_approval?: boolean;
      sort_order?: number;
      created_at: string;
      updated_at: string;
    }>) || [];

    // Check for duplicate name
    if (categories.some((c) => c.category_name.toLowerCase() === args.category_name.toLowerCase())) {
      throw new Error("Category with this name already exists");
    }

    // Create new category
    const now = new Date().toISOString();
    const newCategory = {
      id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      category_name: args.category_name,
      description: args.description,
      is_active: true,
      ai_keywords: args.ai_keywords || [],
      vendor_patterns: args.vendor_patterns || [],
      requires_receipt: args.requires_receipt ?? false,
      requires_manager_approval: args.requires_manager_approval ?? true,
      sort_order: args.sort_order || 99,
      created_at: now,
      updated_at: now,
    };

    // Add to array
    categories.push(newCategory);

    // Update business
    await ctx.db.patch(business._id, {
      customExpenseCategories: categories,
      updatedAt: Date.now(),
    });

    return newCategory;
  },
});

/**
 * Update an expense category
 */
export const updateExpenseCategory = mutation({
  args: {
    businessId: v.string(),
    categoryId: v.string(),
    category_name: v.optional(v.string()),
    description: v.optional(v.string()),
    ai_keywords: v.optional(v.array(v.string())),
    vendor_patterns: v.optional(v.array(v.string())),
    requires_receipt: v.optional(v.boolean()),
    requires_manager_approval: v.optional(v.boolean()),
    sort_order: v.optional(v.number()),
    is_active: v.optional(v.boolean()),
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

    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Check permissions
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || !["owner", "admin", "manager"].includes(membership.role)) {
      throw new Error("Insufficient permissions");
    }

    // Get current categories
    const categories = (business.customExpenseCategories as Array<{
      id: string;
      category_name: string;
      description?: string;
      is_active: boolean;
      ai_keywords?: string[];
      vendor_patterns?: string[];
      requires_receipt?: boolean;
      requires_manager_approval?: boolean;
      sort_order?: number;
      created_at: string;
      updated_at: string;
    }>) || [];

    // Find category index
    const index = categories.findIndex((c) => c.id === args.categoryId);
    if (index === -1) {
      throw new Error("Category not found");
    }

    // Check for duplicate name if updating name
    if (args.category_name !== undefined) {
      const duplicate = categories.find(
        (c) =>
          c.id !== args.categoryId &&
          c.category_name.toLowerCase() === args.category_name!.toLowerCase()
      );
      if (duplicate) {
        throw new Error("Category with this name already exists");
      }
    }

    // Update category
    const updated = {
      ...categories[index],
      ...(args.category_name !== undefined && { category_name: args.category_name }),
      ...(args.description !== undefined && { description: args.description }),
      ...(args.ai_keywords !== undefined && { ai_keywords: args.ai_keywords }),
      ...(args.vendor_patterns !== undefined && { vendor_patterns: args.vendor_patterns }),
      ...(args.requires_receipt !== undefined && { requires_receipt: args.requires_receipt }),
      ...(args.requires_manager_approval !== undefined && { requires_manager_approval: args.requires_manager_approval }),
      ...(args.sort_order !== undefined && { sort_order: args.sort_order }),
      ...(args.is_active !== undefined && { is_active: args.is_active }),
      updated_at: new Date().toISOString(),
    };

    categories[index] = updated;

    // Save
    await ctx.db.patch(business._id, {
      customExpenseCategories: categories,
      updatedAt: Date.now(),
    });

    return updated;
  },
});

/**
 * Delete an expense category
 */
export const deleteExpenseCategory = mutation({
  args: {
    businessId: v.string(),
    categoryId: v.string(),
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

    // Resolve business
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Check permissions
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || !["owner", "admin", "manager"].includes(membership.role)) {
      throw new Error("Insufficient permissions");
    }

    // Get current categories
    const categories = (business.customExpenseCategories as Array<{
      id: string;
      category_name: string;
      description?: string;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }>) || [];

    // Filter out the deleted category
    const filtered = categories.filter((c) => c.id !== args.categoryId);

    if (filtered.length === categories.length) {
      throw new Error("Category not found");
    }

    // Save
    await ctx.db.patch(business._id, {
      customExpenseCategories: filtered,
      updatedAt: Date.now(),
    });

    return true;
  },
});

// ============================================
// MIDDLEWARE QUERIES (for Next.js middleware - no auth required)
// Security: Clerk userId validated by Clerk middleware before this is called
// ============================================

/**
 * Get trial expiration status for a Clerk user
 * Used by Next.js middleware to check if user should be redirected
 * Returns businessId (null if no business) and isExpired flag
 */
export const getTrialStatusByClerkId = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, args) => {
    // Find user by Clerk ID
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    if (!user || !user.businessId) {
      // No user or no business - let them through to onboarding
      return { isExpired: false, businessId: null };
    }

    // Get business details
    const business = await ctx.db.get(user.businessId);
    if (!business) {
      // Business not found - treat as no business
      return { isExpired: false, businessId: null };
    }

    // Only check trial expiration for trial/free plan users
    const isTrialPlan = business.planName === "trial" || business.planName === "free";
    if (!isTrialPlan) {
      return { isExpired: false, businessId: user.businessId };
    }

    // Check if trial has expired using subscription_status (Stripe source of truth)
    // 'paused' = trial ended without payment method (needs upgrade via Checkout)
    const isPaused = business.subscriptionStatus === "paused";

    // Also check trial_end_date as fallback (synced from Stripe)
    let dateExpired = false;
    if (business.trialEndDate) {
      try {
        dateExpired = business.trialEndDate < Date.now();
      } catch {
        // Invalid date - ignore
      }
    }

    const expired = isPaused || dateExpired;

    return {
      isExpired: expired,
      businessId: user.businessId,
    };
  },
});

// ============================================
// INTERNAL QUERIES (for webhook handlers - no auth required)
// ============================================

/**
 * Get business by Stripe customer ID (for webhooks)
 * Used by webhook handlers to find business without user authentication
 * Security: Stripe signature verification done in API route
 */
export const getByStripeCustomerIdInternal = query({
  args: { stripeCustomerId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("businesses")
      .withIndex("by_stripeCustomerId", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .first();
  },
});

/**
 * Get business by ID (internal - for webhooks)
 * Used when we have business_id from webhook metadata
 */
export const getByIdInternal = internalQuery({
  args: { businessId: v.string() },
  handler: async (ctx, args) => {
    return await resolveById(ctx.db, "businesses", args.businessId);
  },
});

// ============================================
// WEBHOOK MUTATIONS (for webhook handlers - no user auth required)
// Security: Stripe signature verification done in API route
// ============================================

/**
 * Update Stripe customer and subscription IDs after checkout
 * Called from checkout.session.completed webhook
 */
export const updateStripeCustomerFromCheckout = mutation({
  args: {
    businessId: v.string(),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Resolve business ID (supports both Convex and legacy UUIDs)
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error(`Business not found: ${args.businessId}`);
    }

    await ctx.db.patch(business._id, {
      stripeCustomerId: args.stripeCustomerId,
      ...(args.stripeSubscriptionId && { stripeSubscriptionId: args.stripeSubscriptionId }),
      updatedAt: Date.now(),
    });

    return business._id;
  },
});

/**
 * Update subscription details after subscription create/update
 * Called from subscription.created and subscription.updated webhooks
 */
export const updateSubscriptionFromWebhook = mutation({
  args: {
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    stripeProductId: v.optional(v.string()),
    planName: v.string(),
    subscriptionStatus: v.string(),
  },
  handler: async (ctx, args) => {
    // Find business by Stripe customer ID
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_stripeCustomerId", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .first();

    if (!business) {
      throw new Error(`Business not found for customer: ${args.stripeCustomerId}`);
    }

    await ctx.db.patch(business._id, {
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripeProductId: args.stripeProductId,
      planName: args.planName,
      subscriptionStatus: args.subscriptionStatus,
      updatedAt: Date.now(),
    });

    return business._id;
  },
});

/**
 * Downgrade business to free plan after subscription deletion
 * Called from subscription.deleted webhook
 */
export const downgradeToFreeFromWebhook = mutation({
  args: {
    stripeCustomerId: v.string(),
  },
  handler: async (ctx, args) => {
    // Find business by Stripe customer ID
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_stripeCustomerId", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .first();

    if (!business) {
      throw new Error(`Business not found for customer: ${args.stripeCustomerId}`);
    }

    await ctx.db.patch(business._id, {
      stripeSubscriptionId: undefined,
      stripeProductId: undefined,
      planName: "free",
      subscriptionStatus: "canceled",
      updatedAt: Date.now(),
    });

    return business._id;
  },
});

/**
 * Update subscription details using businessId from metadata (fallback)
 * Called when stripeCustomerId lookup fails (e.g., checkout webhook didn't process first)
 * Also links the stripeCustomerId to the business for future lookups
 */
export const updateSubscriptionFromWebhookWithBusinessId = mutation({
  args: {
    businessId: v.string(),
    stripeCustomerId: v.string(),
    stripeSubscriptionId: v.string(),
    stripeProductId: v.optional(v.string()),
    planName: v.string(),
    subscriptionStatus: v.string(),
  },
  handler: async (ctx, args) => {
    // Find business by ID (supports both Convex and legacy UUIDs)
    const business = await resolveById(ctx.db, "businesses", args.businessId);

    if (!business) {
      throw new Error(`Business not found: ${args.businessId}`);
    }

    // Update business with subscription details AND link stripeCustomerId
    await ctx.db.patch(business._id, {
      stripeCustomerId: args.stripeCustomerId,
      stripeSubscriptionId: args.stripeSubscriptionId,
      stripeProductId: args.stripeProductId,
      planName: args.planName,
      subscriptionStatus: args.subscriptionStatus,
      updatedAt: Date.now(),
    });

    return business._id;
  },
});

/**
 * Update subscription status (e.g., past_due, active)
 * Called from invoice.payment_failed and invoice.payment_succeeded webhooks
 */
export const updateSubscriptionStatusFromWebhook = mutation({
  args: {
    stripeCustomerId: v.string(),
    subscriptionStatus: v.string(),
  },
  handler: async (ctx, args) => {
    // Find business by Stripe customer ID
    const business = await ctx.db
      .query("businesses")
      .withIndex("by_stripeCustomerId", (q) =>
        q.eq("stripeCustomerId", args.stripeCustomerId)
      )
      .first();

    if (!business) {
      // Business might not exist yet during checkout - this is not an error
      console.warn(`Business not found for customer: ${args.stripeCustomerId}`);
      return null;
    }

    await ctx.db.patch(business._id, {
      subscriptionStatus: args.subscriptionStatus,
      updatedAt: Date.now(),
    });

    return business._id;
  },
});

// ============================================
// ONBOARDING MUTATIONS (for business initialization flow)
// ============================================

/**
 * Initialize a new business during user onboarding
 * Called from API route - accepts clerkUserId for user resolution
 * Creates: business record, owner membership, user linkage
 *
 * Handles two scenarios:
 * 1. User has no business yet → Create new business + membership
 * 2. User has a default business from webhook → Update it with onboarding data
 */
export const initializeBusinessFromOnboarding = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),           // Required to create user if missing
    fullName: v.optional(v.string()), // Optional for user creation
    name: v.string(),
    slug: v.string(),
    countryCode: v.string(),
    homeCurrency: v.string(),
    businessType: v.string(),
    planName: v.string(),
    subscriptionStatus: v.string(),
    customCogsCategories: v.optional(v.any()),
    customExpenseCategories: v.optional(v.any()),
    allowedCurrencies: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    console.log(`[initializeBusinessFromOnboarding] Starting for Clerk ID: ${args.clerkUserId}`);

    // Step 1: Resolve Clerk user ID to Convex user
    let user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    // Step 1b: If user doesn't exist, create them directly
    // This handles the case where Clerk webhook never ran or failed
    if (!user) {
      console.log(`[initializeBusinessFromOnboarding] User not found, creating user for Clerk ID: ${args.clerkUserId}`);

      const userId = await ctx.db.insert("users", {
        clerkUserId: args.clerkUserId,
        email: args.email.toLowerCase(),
        fullName: args.fullName || args.email.split("@")[0],
        homeCurrency: args.homeCurrency,
        updatedAt: Date.now(),
      });

      user = await ctx.db.get(userId);
      if (!user) {
        throw new Error(`Failed to create user for Clerk ID: ${args.clerkUserId}`);
      }

      console.log(`[initializeBusinessFromOnboarding] Created user: ${userId}`);
    }

    console.log(`[initializeBusinessFromOnboarding] Using user: ${user._id}`);

    // Step 2: Check if user already has a business from webhook auto-creation
    if (user.businessId) {
      console.log(`[initializeBusinessFromOnboarding] User has existing business: ${user.businessId}, updating it`);

      // Update the existing business with onboarding data instead of creating new
      await ctx.db.patch(user.businessId, {
        name: args.name,
        slug: args.slug,
        countryCode: args.countryCode,
        homeCurrency: args.homeCurrency,
        businessType: args.businessType,
        planName: args.planName,
        subscriptionStatus: args.subscriptionStatus,
        customCogsCategories: args.customCogsCategories,
        customExpenseCategories: args.customExpenseCategories,
        allowedCurrencies: args.allowedCurrencies || [
          "USD", "SGD", "MYR", "THB", "IDR", "VND", "PHP", "CNY", "EUR"
        ],
        onboardingCompletedAt: Date.now(),
        updatedAt: Date.now(),
      });

      console.log(`[initializeBusinessFromOnboarding] Updated existing business: ${user.businessId}`);
      return user.businessId;
    }

    // Step 3: Create new business (user has no business yet)
    console.log(`[initializeBusinessFromOnboarding] Creating new business for user`);
    const businessId = await ctx.db.insert("businesses", {
      name: args.name,
      slug: args.slug,
      countryCode: args.countryCode,
      homeCurrency: args.homeCurrency,
      businessType: args.businessType,
      planName: args.planName,
      subscriptionStatus: args.subscriptionStatus,
      customCogsCategories: args.customCogsCategories,
      customExpenseCategories: args.customExpenseCategories,
      allowedCurrencies: args.allowedCurrencies || [
        "USD", "SGD", "MYR", "THB", "IDR", "VND", "PHP", "CNY", "EUR"
      ],
      onboardingCompletedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Step 4: Create owner membership
    await ctx.db.insert("business_memberships", {
      userId: user._id,
      businessId,
      role: "owner",
      status: "active",
      joinedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Step 5: Update user's active business context
    await ctx.db.patch(user._id, {
      businessId,
      updatedAt: Date.now(),
    });

    console.log(`[initializeBusinessFromOnboarding] Created new business: ${businessId}`);
    return businessId;
  },
});

// ============================================
// DATA MIGRATION (One-time use)
// ============================================

/**
 * Migrate COGS categories from legacy field name to schema standard
 * Moves data from `cogsCategories` to `customCogsCategories`
 * Run once from Convex dashboard to fix field name mismatch
 */
export const migrateCogsCategoriesToCorrectField = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all businesses
    const businesses = await ctx.db.query("businesses").collect();

    let migratedCount = 0;
    let skippedCount = 0;

    for (const business of businesses) {
      // Type assertion to access legacy field
      const legacyCategories = (business as unknown as { cogsCategories?: unknown }).cogsCategories;

      // Only migrate if legacy field has data and correct field is empty
      if (legacyCategories && !business.customCogsCategories) {
        await ctx.db.patch(business._id, {
          customCogsCategories: legacyCategories,
          updatedAt: Date.now(),
        });
        migratedCount++;
        console.log(`[Migration] Migrated COGS categories for business: ${business._id} (${business.name})`);
      } else if (legacyCategories && business.customCogsCategories) {
        // Both fields have data - skip to avoid overwriting
        skippedCount++;
        console.log(`[Migration] Skipped business: ${business._id} - both fields have data`);
      }
    }

    console.log(`[Migration] Complete. Migrated: ${migratedCount}, Skipped: ${skippedCount}`);
    return { migratedCount, skippedCount, totalBusinesses: businesses.length };
  },
});

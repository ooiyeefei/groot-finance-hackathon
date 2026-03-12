/**
 * CSV Import Templates Functions - Convex queries and mutations
 *
 * Handles CRUD for saved column mapping templates used by the CSV Auto-Parser.
 * Templates enable auto-detection and instant mapping on repeat file uploads.
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

const schemaTypeValidator = v.union(
  v.literal("sales_statement"),
  v.literal("bank_statement"),
  v.literal("purchase_order"),
  v.literal("goods_received_note")
);

const columnMappingValidator = v.object({
  sourceHeader: v.string(),
  targetField: v.string(),
  confidence: v.optional(v.number()),
  order: v.number(),
});

// ============================================
// QUERIES
// ============================================

/**
 * List all import templates for a business, optionally filtered by schema type.
 */
export const list = query({
  args: {
    businessId: v.string(),
    schemaType: v.optional(schemaTypeValidator),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { templates: [] };

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return { templates: [] };

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return { templates: [] };

    // Verify membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();
    if (!membership) return { templates: [] };

    let templates;
    if (args.schemaType) {
      templates = await ctx.db
        .query("csv_import_templates")
        .withIndex("by_businessId_schemaType", (q) =>
          q.eq("businessId", business._id).eq("schemaType", args.schemaType!)
        )
        .collect();
    } else {
      templates = await ctx.db
        .query("csv_import_templates")
        .withIndex("by_businessId", (q) =>
          q.eq("businessId", business._id)
        )
        .collect();
    }

    return { templates };
  },
});

/**
 * Look up a template by header fingerprint for auto-detection.
 */
export const getByFingerprint = query({
  args: {
    businessId: v.string(),
    headerFingerprint: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) return null;

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) return null;

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();
    if (!membership) return null;

    const template = await ctx.db
      .query("csv_import_templates")
      .withIndex("by_businessId_fingerprint", (q) =>
        q
          .eq("businessId", business._id)
          .eq("headerFingerprint", args.headerFingerprint)
      )
      .first();

    return template ?? null;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Save a new import template. If a template with the same fingerprint already
 * exists for this business, update it instead (upsert behavior).
 */
export const create = mutation({
  args: {
    businessId: v.string(),
    name: v.string(),
    schemaType: schemaTypeValidator,
    columnMappings: v.array(columnMappingValidator),
    headerFingerprint: v.string(),
    sourceHeaders: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) throw new Error("Business not found");

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();
    if (!membership) throw new Error("Not a member of this business");

    // Check for existing template with same fingerprint (upsert)
    const existing = await ctx.db
      .query("csv_import_templates")
      .withIndex("by_businessId_fingerprint", (q) =>
        q
          .eq("businessId", business._id)
          .eq("headerFingerprint", args.headerFingerprint)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        schemaType: args.schemaType,
        columnMappings: args.columnMappings,
        sourceHeaders: args.sourceHeaders,
        updatedBy: user._id,
        lastUsedAt: Date.now(),
      });
      return { templateId: existing._id };
    }

    const templateId = await ctx.db.insert("csv_import_templates", {
      businessId: business._id,
      name: args.name,
      schemaType: args.schemaType,
      columnMappings: args.columnMappings,
      headerFingerprint: args.headerFingerprint,
      sourceHeaders: args.sourceHeaders,
      createdBy: user._id,
      lastUsedAt: Date.now(),
    });

    return { templateId };
  },
});

/**
 * Update an existing template's name, mappings, or schema type.
 */
export const update = mutation({
  args: {
    templateId: v.id("csv_import_templates"),
    name: v.optional(v.string()),
    columnMappings: v.optional(v.array(columnMappingValidator)),
    schemaType: v.optional(schemaTypeValidator),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");

    // Verify membership
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", template.businessId)
      )
      .first();
    if (!membership) throw new Error("Not a member of this business");

    const updates: Record<string, unknown> = { updatedBy: user._id };
    if (args.name !== undefined) updates.name = args.name;
    if (args.columnMappings !== undefined)
      updates.columnMappings = args.columnMappings;
    if (args.schemaType !== undefined) updates.schemaType = args.schemaType;

    await ctx.db.patch(args.templateId, updates);
    return { success: true };
  },
});

/**
 * Delete a saved template.
 */
export const remove = mutation({
  args: {
    templateId: v.id("csv_import_templates"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", template.businessId)
      )
      .first();
    if (!membership) throw new Error("Not a member of this business");

    await ctx.db.delete(args.templateId);
    return { success: true };
  },
});

/**
 * Update the lastUsedAt timestamp when a template is applied.
 */
export const touchLastUsed = mutation({
  args: {
    templateId: v.id("csv_import_templates"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const template = await ctx.db.get(args.templateId);
    if (!template) throw new Error("Template not found");

    await ctx.db.patch(args.templateId, { lastUsedAt: Date.now() });
    return { success: true };
  },
});

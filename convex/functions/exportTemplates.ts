/**
 * Export Templates Functions - Convex queries and mutations
 *
 * These functions handle:
 * - Listing pre-built and custom templates
 * - Creating/updating/deleting custom templates
 * - Cloning pre-built templates for customization
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";
import {
  exportModuleValidator,
  thousandSeparatorValidator,
} from "../lib/validators";

// Pre-built templates are defined in frontend code
// These IDs are used to reference them
const PREBUILT_TEMPLATE_IDS = {
  expense: [
    "sql-payroll-expense",
    "xero-expense",
    "quickbooks-expense",
    "briohr-expense",
    "kakitangan-expense",
    "generic-expense",
  ],
  leave: [
    "sql-payroll-leave",
    "briohr-leave",
    "kakitangan-leave",
    "generic-leave",
  ],
};

// Role hierarchy for permission checks
const ROLE_HIERARCHY: Record<string, number> = {
  owner: 4,
  finance_admin: 3,
  manager: 2,
  employee: 1,
};

// ============================================
// QUERIES
// ============================================

/**
 * List custom templates for a business
 * Pre-built templates are defined in frontend code
 */
export const list = query({
  args: {
    businessId: v.string(),
    module: v.optional(exportModuleValidator),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { templates: [] };
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return { templates: [] };
    }

    // Resolve businessId
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      return { templates: [] };
    }

    // Verify user has access to business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return { templates: [] };
    }

    // Query custom templates
    let templates;
    if (args.module) {
      templates = await ctx.db
        .query("export_templates")
        .withIndex("by_businessId_module", (q) =>
          q.eq("businessId", business._id).eq("module", args.module!)
        )
        .collect();
    } else {
      templates = await ctx.db
        .query("export_templates")
        .withIndex("by_businessId", (q) => q.eq("businessId", business._id))
        .collect();
    }

    // Sort by name
    templates.sort((a, b) => a.name.localeCompare(b.name));

    return { templates };
  },
});

/**
 * Get a single custom template by ID
 */
export const get = query({
  args: {
    templateId: v.id("export_templates"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) {
      return null;
    }

    const template = await ctx.db.get(args.templateId);
    if (!template) {
      return null;
    }

    // Verify user has access to business
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", template.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      return null;
    }

    return template;
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new custom template
 * Only finance_admin and owner can create templates
 */
export const create = mutation({
  args: {
    businessId: v.string(),
    name: v.string(),
    module: exportModuleValidator,
    fieldMappings: v.array(
      v.object({
        sourceField: v.string(),
        targetColumn: v.string(),
        order: v.number(),
        dateFormat: v.optional(v.string()),
        decimalPlaces: v.optional(v.number()),
        thousandSeparator: v.optional(thousandSeparatorValidator),
      })
    ),
    description: v.optional(v.string()),
    defaultDateFormat: v.optional(v.string()),
    defaultDecimalPlaces: v.optional(v.number()),
    defaultThousandSeparator: v.optional(thousandSeparatorValidator),
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

    // Resolve businessId
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Verify user has admin access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (
      membership.role !== "owner" &&
      membership.role !== "finance_admin"
    ) {
      throw new Error("Only owners and finance admins can create templates");
    }

    // Validate field mappings
    if (args.fieldMappings.length === 0) {
      throw new Error("At least one field mapping is required");
    }

    // Check for duplicate column names
    const columnNames = args.fieldMappings.map((m) => m.targetColumn);
    const uniqueColumns = new Set(columnNames);
    if (uniqueColumns.size !== columnNames.length) {
      throw new Error("Duplicate column names are not allowed");
    }

    // Create the template
    const templateId = await ctx.db.insert("export_templates", {
      businessId: business._id,
      name: args.name,
      description: args.description,
      module: args.module,
      type: "custom",
      fieldMappings: args.fieldMappings,
      defaultDateFormat: args.defaultDateFormat,
      defaultDecimalPlaces: args.defaultDecimalPlaces,
      defaultThousandSeparator: args.defaultThousandSeparator,
      createdBy: user._id,
    });

    return templateId;
  },
});

/**
 * Clone a pre-built template as a custom template
 * Only finance_admin and owner can clone templates
 */
export const clonePrebuilt = mutation({
  args: {
    businessId: v.string(),
    prebuiltId: v.string(),
    name: v.string(),
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

    // Resolve businessId
    const business = await resolveById(ctx.db, "businesses", args.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Verify user has admin access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", business._id)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (
      membership.role !== "owner" &&
      membership.role !== "finance_admin"
    ) {
      throw new Error("Only owners and finance admins can clone templates");
    }

    // Validate prebuilt ID
    const allPrebuiltIds = [
      ...PREBUILT_TEMPLATE_IDS.expense,
      ...PREBUILT_TEMPLATE_IDS.leave,
    ];
    if (!allPrebuiltIds.includes(args.prebuiltId)) {
      throw new Error("Invalid pre-built template ID");
    }

    // Determine module from prebuilt ID
    const module = PREBUILT_TEMPLATE_IDS.expense.includes(args.prebuiltId)
      ? "expense"
      : "leave";

    // Create a cloned template
    // The field mappings will be populated from frontend when user first uses
    const templateId = await ctx.db.insert("export_templates", {
      businessId: business._id,
      name: args.name,
      module,
      type: "cloned",
      clonedFromId: args.prebuiltId,
      clonedFromVersion: "1.0.0",
      fieldMappings: [], // Will be populated from frontend
      createdBy: user._id,
    });

    return templateId;
  },
});

/**
 * Update a custom template
 * Only finance_admin and owner can update templates
 */
export const update = mutation({
  args: {
    templateId: v.id("export_templates"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    fieldMappings: v.optional(
      v.array(
        v.object({
          sourceField: v.string(),
          targetColumn: v.string(),
          order: v.number(),
          dateFormat: v.optional(v.string()),
          decimalPlaces: v.optional(v.number()),
          thousandSeparator: v.optional(thousandSeparatorValidator),
        })
      )
    ),
    defaultDateFormat: v.optional(v.string()),
    defaultDecimalPlaces: v.optional(v.number()),
    defaultThousandSeparator: v.optional(thousandSeparatorValidator),
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

    // Get the template
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    // Verify user has admin access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", template.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (
      membership.role !== "owner" &&
      membership.role !== "finance_admin"
    ) {
      throw new Error("Only owners and finance admins can update templates");
    }

    // Build update object
    const updates: Record<string, unknown> = {
      updatedBy: user._id,
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) {
      updates.name = args.name;
    }
    if (args.description !== undefined) {
      updates.description = args.description;
    }
    if (args.fieldMappings !== undefined) {
      // Validate field mappings
      if (args.fieldMappings.length === 0) {
        throw new Error("At least one field mapping is required");
      }
      const columnNames = args.fieldMappings.map((m) => m.targetColumn);
      const uniqueColumns = new Set(columnNames);
      if (uniqueColumns.size !== columnNames.length) {
        throw new Error("Duplicate column names are not allowed");
      }
      updates.fieldMappings = args.fieldMappings;
    }
    if (args.defaultDateFormat !== undefined) {
      updates.defaultDateFormat = args.defaultDateFormat;
    }
    if (args.defaultDecimalPlaces !== undefined) {
      updates.defaultDecimalPlaces = args.defaultDecimalPlaces;
    }
    if (args.defaultThousandSeparator !== undefined) {
      updates.defaultThousandSeparator = args.defaultThousandSeparator;
    }

    await ctx.db.patch(args.templateId, updates);
    return args.templateId;
  },
});

/**
 * Delete a custom template
 * Only finance_admin and owner can delete templates
 */
export const remove = mutation({
  args: {
    templateId: v.id("export_templates"),
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

    // Get the template
    const template = await ctx.db.get(args.templateId);
    if (!template) {
      throw new Error("Template not found");
    }

    // Verify user has admin access
    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", template.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") {
      throw new Error("Not a member of this business");
    }

    if (
      membership.role !== "owner" &&
      membership.role !== "finance_admin"
    ) {
      throw new Error("Only owners and finance admins can delete templates");
    }

    // Check if template is used by any schedules
    const schedules = await ctx.db
      .query("export_schedules")
      .withIndex("by_businessId", (q) =>
        q.eq("businessId", template.businessId)
      )
      .collect();

    const usedBySchedule = schedules.find(
      (s) => s.templateId === args.templateId
    );
    if (usedBySchedule) {
      throw new Error(
        "Cannot delete template: it is used by an export schedule"
      );
    }

    await ctx.db.delete(args.templateId);
    return { success: true };
  },
});

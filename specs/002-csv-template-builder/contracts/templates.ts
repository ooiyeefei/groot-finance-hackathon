/**
 * Export Templates API Contract
 *
 * Convex functions for managing export templates.
 * Location: convex/functions/exportTemplates.ts
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

// ============================================
// QUERIES
// ============================================

/**
 * List all templates (pre-built + custom) for a business
 *
 * @param businessId - Business to list templates for
 * @param module - Optional filter by module ("expense" | "leave")
 * @returns Combined list of pre-built and custom templates
 *
 * Access: All business members
 */
export const list = query({
  args: {
    businessId: v.id("businesses"),
    module: v.optional(v.union(v.literal("expense"), v.literal("leave"))),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Get pre-built templates from PREBUILT_TEMPLATES constant
    // 2. Query custom templates from export_templates table
    // 3. Filter by module if specified
    // 4. Combine and return sorted by name
  },
});

/**
 * Get a single custom template by ID
 *
 * @param templateId - Template ID
 * @returns Template details or null
 *
 * Access: All business members
 */
export const get = query({
  args: {
    templateId: v.id("export_templates"),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Query template by ID
    // 2. Verify user has access to business
    // 3. Return template or null
  },
});

/**
 * Get a pre-built template by ID
 *
 * @param prebuiltId - Pre-built template ID (e.g., "sql-payroll-expense")
 * @returns Pre-built template details or null
 *
 * Access: All users
 */
export const getPrebuilt = query({
  args: {
    prebuiltId: v.string(),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Look up in PREBUILT_TEMPLATES constant
    // 2. Return template or null
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create a new custom template
 *
 * @param businessId - Business to create template for
 * @param name - Template name
 * @param module - "expense" or "leave"
 * @param fieldMappings - Array of field mapping objects
 * @param description - Optional description
 * @param defaultDateFormat - Default date format
 * @param defaultDecimalPlaces - Default decimal places
 * @param defaultThousandSeparator - Default thousand separator
 * @returns Created template ID
 *
 * Access: finance_admin, owner only
 */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.string(),
    module: v.union(v.literal("expense"), v.literal("leave")),
    fieldMappings: v.array(v.object({
      sourceField: v.string(),
      targetColumn: v.string(),
      order: v.number(),
      dateFormat: v.optional(v.string()),
      decimalPlaces: v.optional(v.number()),
      thousandSeparator: v.optional(v.union(v.literal("comma"), v.literal("none"))),
    })),
    description: v.optional(v.string()),
    defaultDateFormat: v.optional(v.string()),
    defaultDecimalPlaces: v.optional(v.number()),
    defaultThousandSeparator: v.optional(v.union(v.literal("comma"), v.literal("none"))),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Verify user has finance_admin or owner role
    // 2. Validate field mappings (source fields exist, no duplicate columns)
    // 3. Create template record
    // 4. Return template ID
  },
});

/**
 * Clone a pre-built template as a custom template
 *
 * @param businessId - Business to create template for
 * @param prebuiltId - Pre-built template ID to clone
 * @param name - New template name
 * @returns Created template ID
 *
 * Access: finance_admin, owner only
 */
export const clonePrebuilt = mutation({
  args: {
    businessId: v.id("businesses"),
    prebuiltId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Verify user has finance_admin or owner role
    // 2. Look up pre-built template
    // 3. Create custom template with type="cloned", clonedFromId, clonedFromVersion
    // 4. Copy field mappings
    // 5. Return template ID
  },
});

/**
 * Update an existing custom template
 *
 * @param templateId - Template to update
 * @param name - New name
 * @param fieldMappings - Updated field mappings
 * @param description - Updated description
 * @param defaultDateFormat - Updated default date format
 * @param defaultDecimalPlaces - Updated default decimal places
 * @param defaultThousandSeparator - Updated default thousand separator
 *
 * Access: finance_admin, owner only
 */
export const update = mutation({
  args: {
    templateId: v.id("export_templates"),
    name: v.optional(v.string()),
    fieldMappings: v.optional(v.array(v.object({
      sourceField: v.string(),
      targetColumn: v.string(),
      order: v.number(),
      dateFormat: v.optional(v.string()),
      decimalPlaces: v.optional(v.number()),
      thousandSeparator: v.optional(v.union(v.literal("comma"), v.literal("none"))),
    }))),
    description: v.optional(v.string()),
    defaultDateFormat: v.optional(v.string()),
    defaultDecimalPlaces: v.optional(v.number()),
    defaultThousandSeparator: v.optional(v.union(v.literal("comma"), v.literal("none"))),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Verify user has finance_admin or owner role
    // 2. Get existing template, verify business access
    // 3. Validate field mappings if provided
    // 4. Update template record
  },
});

/**
 * Delete a custom template
 *
 * @param templateId - Template to delete
 *
 * Access: finance_admin, owner only
 */
export const remove = mutation({
  args: {
    templateId: v.id("export_templates"),
  },
  handler: async (ctx, args) => {
    // Implementation:
    // 1. Verify user has finance_admin or owner role
    // 2. Get template, verify business access
    // 3. Check if template is used by any schedules (warn or prevent)
    // 4. Delete template record
  },
});

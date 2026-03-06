/**
 * Export Code Mappings Functions - Convex queries and mutations
 *
 * CRUD operations for Master Accounting code mappings.
 * Stores user-configured mappings between Groot Finance values
 * (categories, vendors, customers) and Master Accounting codes
 * (Account Code, Creditor Code, Debtor Code, Bank Code).
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { resolveUserByClerkId, resolveById } from "../lib/resolvers";

const ROLE_HIERARCHY: Record<string, number> = {
  owner: 4,
  finance_admin: 3,
  manager: 2,
  employee: 1,
};

// Helper to verify business membership with finance_admin+ role
async function verifyFinanceAccess(
  ctx: any,
  identity: any,
  businessIdStr: string
) {
  const user = await resolveUserByClerkId(ctx.db, identity.subject);
  if (!user) return null;

  const business = await resolveById(ctx.db, "businesses", businessIdStr);
  if (!business) return null;

  const membership = await ctx.db
    .query("business_memberships")
    .withIndex("by_userId_businessId", (q: any) =>
      q.eq("userId", user._id).eq("businessId", business._id)
    )
    .first();

  if (!membership || membership.status !== "active") return null;
  if ((ROLE_HIERARCHY[membership.role] ?? 0) < ROLE_HIERARCHY.manager) return null;

  return { user, business };
}

// ============================================
// QUERIES
// ============================================

export const getCodeMappings = query({
  args: {
    businessId: v.string(),
    targetSystem: v.string(),
    mappingType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const access = await verifyFinanceAccess(ctx, identity, args.businessId);
    if (!access) return [];

    if (args.mappingType) {
      return await ctx.db
        .query("export_code_mappings")
        .withIndex("by_business_type", (q) =>
          q
            .eq("businessId", access.business._id)
            .eq("targetSystem", args.targetSystem)
            .eq("mappingType", args.mappingType!)
        )
        .collect();
    }

    return await ctx.db
      .query("export_code_mappings")
      .withIndex("by_business_system", (q) =>
        q
          .eq("businessId", access.business._id)
          .eq("targetSystem", args.targetSystem)
      )
      .collect();
  },
});

export const getDistinctMappableValues = query({
  args: {
    businessId: v.string(),
    module: v.string(),
    mappingTypes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return {};

    const access = await verifyFinanceAccess(ctx, identity, args.businessId);
    if (!access) return {};

    const result: Record<string, string[]> = {};
    const bizId = access.business._id;

    if (args.module === "expense") {
      const claims = await ctx.db
        .query("expense_claims")
        .withIndex("by_businessId", (q) => q.eq("businessId", bizId))
        .collect();

      if (args.mappingTypes.includes("account_code")) {
        const categories = [
          ...new Set(
            claims
              .map((c) => c.expenseCategory)
              .filter((c): c is string => !!c)
          ),
        ];
        result.account_code = categories.sort();
      }

      if (args.mappingTypes.includes("creditor_code")) {
        const vendorNames = [
          ...new Set(
            claims
              .map((c) => c.vendorName)
              .filter((v): v is string => !!v)
          ),
        ];
        result.creditor_code = vendorNames.sort();

        // Look up actual supplierCode from vendors table for each name
        const allVendors = await ctx.db
          .query("vendors")
          .withIndex("by_businessId", (q) => q.eq("businessId", bizId))
          .collect();

        const codeHints: Record<string, string> = {};
        for (const v of allVendors) {
          if (v.name && v.supplierCode) {
            codeHints[v.name] = v.supplierCode;
          }
        }
        result._creditor_code_hints = codeHints as any;
      }
    }

    if (args.module === "invoice") {
      if (args.mappingTypes.includes("debtor_code")) {
        // Get customer names from sales invoices
        const invoices = await ctx.db
          .query("sales_invoices")
          .withIndex("by_businessId", (q) => q.eq("businessId", bizId))
          .collect();

        const customerNames = [
          ...new Set(
            invoices
              .map((i) => i.customerSnapshot?.businessName)
              .filter((n): n is string => !!n)
          ),
        ];
        result.debtor_code = customerNames.sort();

        // Also look up actual customerCode from customers table for each name
        const allCustomers = await ctx.db
          .query("customers")
          .withIndex("by_businessId", (q) => q.eq("businessId", bizId))
          .collect();

        const codeHints: Record<string, string> = {};
        for (const c of allCustomers) {
          if (c.businessName && c.customerCode) {
            codeHints[c.businessName] = c.customerCode;
          }
        }
        result._debtor_code_hints = codeHints as any;
      }

      if (args.mappingTypes.includes("account_code")) {
        result.account_code = result.account_code ?? [];
      }
    }

    if (args.module === "accounting") {
      const entries = await ctx.db
        .query("accounting_entries")
        .withIndex("by_businessId", (q) => q.eq("businessId", bizId))
        .collect();

      if (args.mappingTypes.includes("account_code")) {
        const codes = [
          ...new Set(
            entries
              .map((e) => e.category)
              .filter((c): c is string => !!c)
          ),
        ];
        result.account_code = codes.sort();
      }
    }

    return result;
  },
});

// ============================================
// MUTATIONS
// ============================================

export const upsertCodeMapping = mutation({
  args: {
    businessId: v.string(),
    targetSystem: v.string(),
    mappingType: v.string(),
    sourceValue: v.string(),
    targetCode: v.string(),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const access = await verifyFinanceAccess(ctx, identity, args.businessId);
    if (!access) throw new Error("Insufficient permissions");

    if (args.targetCode.length > 20) {
      throw new Error("Target code must be 20 characters or less");
    }

    const bizId = access.business._id;

    // Check for existing mapping
    const existing = await ctx.db
      .query("export_code_mappings")
      .withIndex("by_business_source", (q) =>
        q
          .eq("businessId", bizId)
          .eq("targetSystem", args.targetSystem)
          .eq("mappingType", args.mappingType)
          .eq("sourceValue", args.sourceValue)
      )
      .unique();

    // If setting as default, unset any existing default
    if (args.isDefault) {
      const existingDefaults = await ctx.db
        .query("export_code_mappings")
        .withIndex("by_business_type", (q) =>
          q
            .eq("businessId", bizId)
            .eq("targetSystem", args.targetSystem)
            .eq("mappingType", args.mappingType)
        )
        .collect();

      for (const d of existingDefaults) {
        if (d.isDefault && d._id !== existing?._id) {
          await ctx.db.patch(d._id, { isDefault: false });
        }
      }
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        targetCode: args.targetCode,
        isDefault: args.isDefault ?? existing.isDefault,
        updatedBy: access.user._id,
        updatedAt: Date.now(),
      });
      return { _id: existing._id };
    }

    const id = await ctx.db.insert("export_code_mappings", {
      businessId: bizId,
      targetSystem: args.targetSystem,
      mappingType: args.mappingType,
      sourceValue: args.sourceValue,
      targetCode: args.targetCode,
      isDefault: args.isDefault,
      createdBy: access.user._id,
    });

    return { _id: id };
  },
});

export const upsertCodeMappingsBatch = mutation({
  args: {
    businessId: v.string(),
    targetSystem: v.string(),
    mappings: v.array(
      v.object({
        mappingType: v.string(),
        sourceValue: v.string(),
        targetCode: v.string(),
      })
    ),
    defaults: v.optional(
      v.array(
        v.object({
          mappingType: v.string(),
          targetCode: v.string(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const access = await verifyFinanceAccess(ctx, identity, args.businessId);
    if (!access) throw new Error("Insufficient permissions");

    const bizId = access.business._id;
    let upserted = 0;
    let defaultsSet = 0;

    // Upsert individual mappings (skip empty targetCodes)
    for (const mapping of args.mappings) {
      if (!mapping.targetCode.trim()) continue;
      if (mapping.targetCode.length > 20) continue;

      const existing = await ctx.db
        .query("export_code_mappings")
        .withIndex("by_business_source", (q) =>
          q
            .eq("businessId", bizId)
            .eq("targetSystem", args.targetSystem)
            .eq("mappingType", mapping.mappingType)
            .eq("sourceValue", mapping.sourceValue)
        )
        .unique();

      if (existing) {
        if (existing.targetCode !== mapping.targetCode) {
          await ctx.db.patch(existing._id, {
            targetCode: mapping.targetCode,
            updatedBy: access.user._id,
            updatedAt: Date.now(),
          });
          upserted++;
        }
      } else {
        await ctx.db.insert("export_code_mappings", {
          businessId: bizId,
          targetSystem: args.targetSystem,
          mappingType: mapping.mappingType,
          sourceValue: mapping.sourceValue,
          targetCode: mapping.targetCode,
          createdBy: access.user._id,
        });
        upserted++;
      }
    }

    // Handle defaults
    if (args.defaults) {
      for (const def of args.defaults) {
        if (!def.targetCode.trim()) continue;

        // Unset existing defaults for this type
        const existingDefaults = await ctx.db
          .query("export_code_mappings")
          .withIndex("by_business_type", (q) =>
            q
              .eq("businessId", bizId)
              .eq("targetSystem", args.targetSystem)
              .eq("mappingType", def.mappingType)
          )
          .collect();

        for (const d of existingDefaults) {
          if (d.isDefault) {
            await ctx.db.patch(d._id, { isDefault: false });
          }
        }

        // Upsert the default entry
        const existingDefault = await ctx.db
          .query("export_code_mappings")
          .withIndex("by_business_source", (q) =>
            q
              .eq("businessId", bizId)
              .eq("targetSystem", args.targetSystem)
              .eq("mappingType", def.mappingType)
              .eq("sourceValue", "__DEFAULT__")
          )
          .unique();

        if (existingDefault) {
          await ctx.db.patch(existingDefault._id, {
            targetCode: def.targetCode,
            isDefault: true,
            updatedBy: access.user._id,
            updatedAt: Date.now(),
          });
        } else {
          await ctx.db.insert("export_code_mappings", {
            businessId: bizId,
            targetSystem: args.targetSystem,
            mappingType: def.mappingType,
            sourceValue: "__DEFAULT__",
            targetCode: def.targetCode,
            isDefault: true,
            createdBy: access.user._id,
          });
        }
        defaultsSet++;
      }
    }

    return { upserted, defaultsSet };
  },
});

export const deleteCodeMapping = mutation({
  args: {
    mappingId: v.id("export_code_mappings"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await resolveUserByClerkId(ctx.db, identity.subject);
    if (!user) throw new Error("User not found");

    const mapping = await ctx.db.get(args.mappingId);
    if (!mapping) {
      return { success: false };
    }

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q) =>
        q.eq("userId", user._id).eq("businessId", mapping.businessId)
      )
      .first();

    if (
      !membership ||
      membership.status !== "active" ||
      (ROLE_HIERARCHY[membership.role] ?? 0) < ROLE_HIERARCHY.manager
    ) {
      throw new Error("Insufficient permissions");
    }

    await ctx.db.delete(args.mappingId);
    return { success: true };
  },
});

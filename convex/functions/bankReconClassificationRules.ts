/**
 * Bank Recon Classification Rules — CRUD operations
 * 021-bank-statement-import-recon
 *
 * Manages rule-based (Tier 1) classification rules for bank transactions.
 * Rules map keyword patterns to debit/credit GL account pairs.
 */

import { v } from "convex/values";
import { query, mutation, internalMutation } from "../_generated/server";
import { getAuthenticatedUser } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";
import { DEFAULT_BANK_RECON_RULES } from "../lib/bankReconClassifier";

const BANK_RECON_ROLES = ["owner", "finance_admin", "manager"];
const ADMIN_ROLES = ["owner", "finance_admin"];

async function requireBankReconAccess(
  ctx: { db: any; auth: any },
  businessId: Id<"businesses">
): Promise<{ userId: Id<"users">; role: string }> {
  const user = await getAuthenticatedUser(ctx);
  if (!user) throw new Error("Not authenticated");

  const membership = await ctx.db
    .query("business_memberships")
    .withIndex("by_userId_businessId", (q: any) =>
      q.eq("userId", user._id).eq("businessId", businessId)
    )
    .first();

  if (!membership || membership.status !== "active") {
    throw new Error("No access to this business");
  }

  if (!BANK_RECON_ROLES.includes(membership.role)) {
    throw new Error("Insufficient permissions for bank reconciliation");
  }

  return { userId: user._id, role: membership.role };
}

// ============================================
// QUERIES
// ============================================

export const list = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthenticatedUser(ctx);
    if (!user) return [];

    const membership = await ctx.db
      .query("business_memberships")
      .withIndex("by_userId_businessId", (q: any) =>
        q.eq("userId", user._id).eq("businessId", args.businessId)
      )
      .first();

    if (!membership || membership.status !== "active") return [];
    if (!BANK_RECON_ROLES.includes(membership.role)) return [];

    const rules = await ctx.db
      .query("bank_recon_classification_rules")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .collect();

    // Filter soft-deleted, resolve account names
    const activeRules = rules.filter((r) => !r.deletedAt);

    const enriched = [];
    for (const rule of activeRules) {
      const debitAccount = await ctx.db.get(rule.debitAccountId);
      const creditAccount = await ctx.db.get(rule.creditAccountId);

      enriched.push({
        ...rule,
        debitAccountCode: debitAccount?.accountCode ?? "?",
        debitAccountName: debitAccount?.accountName ?? "Unknown",
        creditAccountCode: creditAccount?.accountCode ?? "?",
        creditAccountName: creditAccount?.accountName ?? "Unknown",
      });
    }

    return enriched;
  },
});

// ============================================
// MUTATIONS
// ============================================

export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    keyword: v.string(),
    debitAccountId: v.id("chart_of_accounts"),
    creditAccountId: v.id("chart_of_accounts"),
    platform: v.string(),
    priority: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, role } = await requireBankReconAccess(ctx, args.businessId);

    if (!ADMIN_ROLES.includes(role)) {
      throw new Error("Only admin users can create classification rules");
    }

    return await ctx.db.insert("bank_recon_classification_rules", {
      businessId: args.businessId,
      keyword: args.keyword,
      debitAccountId: args.debitAccountId,
      creditAccountId: args.creditAccountId,
      platform: args.platform,
      priority: args.priority ?? args.keyword.length,
      isActive: true,
      createdBy: userId as unknown as string,
      createdAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("bank_recon_classification_rules"),
    keyword: v.optional(v.string()),
    debitAccountId: v.optional(v.id("chart_of_accounts")),
    creditAccountId: v.optional(v.id("chart_of_accounts")),
    platform: v.optional(v.string()),
    priority: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const rule = await ctx.db.get(args.id);
    if (!rule) throw new Error("Rule not found");

    const { role } = await requireBankReconAccess(ctx, rule.businessId);

    if (!ADMIN_ROLES.includes(role)) {
      throw new Error("Only admin users can update classification rules");
    }

    const { id, ...updates } = args;
    const patch: Record<string, unknown> = {};

    if (updates.keyword !== undefined) patch.keyword = updates.keyword;
    if (updates.debitAccountId !== undefined) patch.debitAccountId = updates.debitAccountId;
    if (updates.creditAccountId !== undefined) patch.creditAccountId = updates.creditAccountId;
    if (updates.platform !== undefined) patch.platform = updates.platform;
    if (updates.priority !== undefined) patch.priority = updates.priority;
    if (updates.isActive !== undefined) patch.isActive = updates.isActive;

    await ctx.db.patch(id, patch);
  },
});

export const remove = mutation({
  args: {
    id: v.id("bank_recon_classification_rules"),
  },
  handler: async (ctx, args) => {
    const rule = await ctx.db.get(args.id);
    if (!rule) throw new Error("Rule not found");

    const { role } = await requireBankReconAccess(ctx, rule.businessId);

    if (!ADMIN_ROLES.includes(role)) {
      throw new Error("Only admin users can delete classification rules");
    }

    // Soft delete
    await ctx.db.patch(args.id, { deletedAt: Date.now() });
  },
});

// ============================================
// INTERNAL: Seed default rules
// ============================================

export const seedDefaultRules = internalMutation({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    // Check if rules already exist
    const existing = await ctx.db
      .query("bank_recon_classification_rules")
      .withIndex("by_businessId", (q) => q.eq("businessId", args.businessId))
      .first();

    if (existing) return { seeded: 0, message: "Rules already exist" };

    // We need COA entries to map account codes to IDs
    // Look up by account code in the business's chart of accounts
    let seeded = 0;

    for (const rule of DEFAULT_BANK_RECON_RULES) {
      // Skip rules with BANK_GL — those need a bank account-specific GL link
      if (rule.debitAccountCode === "BANK_GL" || rule.creditAccountCode === "BANK_GL") {
        continue;
      }

      const debitAccount = await ctx.db
        .query("chart_of_accounts")
        .withIndex("by_business_code", (q) =>
          q.eq("businessId", args.businessId).eq("accountCode", rule.debitAccountCode)
        )
        .first();

      const creditAccount = await ctx.db
        .query("chart_of_accounts")
        .withIndex("by_business_code", (q) =>
          q.eq("businessId", args.businessId).eq("accountCode", rule.creditAccountCode)
        )
        .first();

      if (debitAccount && creditAccount) {
        await ctx.db.insert("bank_recon_classification_rules", {
          businessId: args.businessId,
          keyword: rule.keyword,
          debitAccountId: debitAccount._id,
          creditAccountId: creditAccount._id,
          platform: rule.platform,
          priority: rule.keyword.length,
          isActive: true,
          createdBy: "system",
          createdAt: Date.now(),
        });
        seeded++;
      }
    }

    return { seeded, message: `Seeded ${seeded} default rules` };
  },
});

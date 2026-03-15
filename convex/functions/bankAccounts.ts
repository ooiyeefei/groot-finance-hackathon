/**
 * Bank Accounts Functions - Convex queries and mutations
 * 021-bank-statement-import-recon
 *
 * CRUD operations for business bank accounts used in bank reconciliation.
 * Access restricted to owner/finance_admin/manager roles.
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { getAuthenticatedUser } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";

const BANK_RECON_ROLES = ["owner", "finance_admin", "manager"];

async function requireBankReconAccess(
  ctx: { db: any; auth: any },
  businessId: Id<"businesses">
): Promise<{ userId: Id<"users"> }> {
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

  return { userId: user._id };
}

async function checkBankReconAccess(
  ctx: { db: any; auth: any },
  businessId: Id<"businesses">
): Promise<boolean> {
  const user = await getAuthenticatedUser(ctx);
  if (!user) return false;

  const membership = await ctx.db
    .query("business_memberships")
    .withIndex("by_userId_businessId", (q: any) =>
      q.eq("userId", user._id).eq("businessId", businessId)
    )
    .first();

  if (!membership || membership.status !== "active") return false;
  return BANK_RECON_ROLES.includes(membership.role);
}

// ============================================
// QUERIES
// ============================================

export const list = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const hasAccess = await checkBankReconAccess(ctx, args.businessId);
    if (!hasAccess) return [];

    const accounts = await ctx.db
      .query("bank_accounts")
      .withIndex("by_businessId_status", (q) =>
        q.eq("businessId", args.businessId).eq("status", "active")
      )
      .collect();

    return accounts.filter((a) => !a.deletedAt);
  },
});

export const listAll = query({
  args: {
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    const hasAccess = await checkBankReconAccess(ctx, args.businessId);
    if (!hasAccess) return [];

    const accounts = await ctx.db
      .query("bank_accounts")
      .withIndex("by_businessId", (q) =>
        q.eq("businessId", args.businessId)
      )
      .collect();

    return accounts.filter((a) => !a.deletedAt);
  },
});

export const getById = query({
  args: {
    id: v.id("bank_accounts"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const account = await ctx.db.get(args.id);
    if (!account) return null;

    const hasAccess = await checkBankReconAccess(ctx, account.businessId);
    if (!hasAccess) return null;

    return account;
  },
});

// ============================================
// MUTATIONS
// ============================================

export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    bankName: v.string(),
    accountNumber: v.string(),
    currency: v.string(),
    nickname: v.optional(v.string()),
    glAccountId: v.optional(v.id("chart_of_accounts")),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireBankReconAccess(ctx, args.businessId);

    // Only store last 4 digits — never persist full account number
    const last4 = args.accountNumber.slice(-4);

    return await ctx.db.insert("bank_accounts", {
      businessId: args.businessId,
      bankName: args.bankName,
      accountNumber: `****${last4}`,
      accountNumberLast4: last4,
      currency: args.currency,
      nickname: args.nickname,
      glAccountId: args.glAccountId,
      status: "active",
      transactionCount: 0,
      createdBy: userId,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("bank_accounts"),
    bankName: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    currency: v.optional(v.string()),
    nickname: v.optional(v.string()),
    glAccountId: v.optional(v.id("chart_of_accounts")),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.id);
    if (!account) throw new Error("Bank account not found");

    await requireBankReconAccess(ctx, account.businessId);

    const { id, ...updates } = args;
    const patch: Record<string, unknown> = {};

    if (updates.bankName !== undefined) patch.bankName = updates.bankName;
    if (updates.currency !== undefined) patch.currency = updates.currency;
    if (updates.nickname !== undefined) patch.nickname = updates.nickname;
    if (updates.glAccountId !== undefined) patch.glAccountId = updates.glAccountId;
    if (updates.accountNumber !== undefined) {
      const last4 = updates.accountNumber.slice(-4);
      patch.accountNumber = `****${last4}`;
      patch.accountNumberLast4 = last4;
    }

    await ctx.db.patch(id, patch);
  },
});

export const deactivate = mutation({
  args: {
    id: v.id("bank_accounts"),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.id);
    if (!account) throw new Error("Bank account not found");

    await requireBankReconAccess(ctx, account.businessId);

    await ctx.db.patch(args.id, {
      status: "inactive",
      deletedAt: Date.now(),
    });
  },
});

export const reactivate = mutation({
  args: {
    id: v.id("bank_accounts"),
  },
  handler: async (ctx, args) => {
    const account = await ctx.db.get(args.id);
    if (!account) throw new Error("Bank account not found");

    await requireBankReconAccess(ctx, account.businessId);

    await ctx.db.patch(args.id, {
      status: "active",
      deletedAt: undefined,
    });
  },
});

// ============================================
// HELPERS
// ============================================

export const getGLAccount = query({
  args: {
    bankAccountId: v.id("bank_accounts"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const account = await ctx.db.get(args.bankAccountId);
    if (!account || !account.glAccountId) return null;

    const hasAccess = await checkBankReconAccess(ctx, account.businessId);
    if (!hasAccess) return null;

    const glAccount = await ctx.db.get(account.glAccountId);
    return glAccount;
  },
});

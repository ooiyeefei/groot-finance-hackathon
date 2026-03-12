/**
 * Bank Import Sessions Functions - Convex queries and mutations
 * 021-bank-statement-import-recon
 *
 * Tracks file upload events for import history and audit trail.
 * Access restricted to owner/finance_admin/manager roles.
 */

import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { getAuthenticatedUser } from "../lib/resolvers";
import { Id } from "../_generated/dataModel";

const BANK_RECON_ROLES = ["owner", "finance_admin", "manager"];

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

// ============================================
// QUERIES
// ============================================

export const list = query({
  args: {
    businessId: v.id("businesses"),
    bankAccountId: v.optional(v.id("bank_accounts")),
  },
  handler: async (ctx, args) => {
    const hasAccess = await checkBankReconAccess(ctx, args.businessId);
    if (!hasAccess) return [];

    if (args.bankAccountId) {
      return await ctx.db
        .query("bank_import_sessions")
        .withIndex("by_bankAccountId", (q) =>
          q.eq("bankAccountId", args.bankAccountId!)
        )
        .order("desc")
        .collect();
    }

    return await ctx.db
      .query("bank_import_sessions")
      .withIndex("by_businessId", (q) =>
        q.eq("businessId", args.businessId)
      )
      .order("desc")
      .collect();
  },
});

// ============================================
// MUTATIONS
// ============================================

export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    bankAccountId: v.id("bank_accounts"),
    fileName: v.string(),
    rowCount: v.number(),
    duplicatesSkipped: v.number(),
    dateRange: v.object({
      from: v.string(),
      to: v.string(),
    }),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireBankReconAccess(ctx, args.businessId);

    return await ctx.db.insert("bank_import_sessions", {
      businessId: args.businessId,
      bankAccountId: args.bankAccountId,
      fileName: args.fileName,
      rowCount: args.rowCount,
      duplicatesSkipped: args.duplicatesSkipped,
      dateRange: args.dateRange,
      importedBy: userId,
      importedAt: Date.now(),
    });
  },
});

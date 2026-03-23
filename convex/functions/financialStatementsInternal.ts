/**
 * Financial Statements Internal Queries
 *
 * Internal-only query endpoints for statement generators.
 * Called by public actions in financialStatements.ts.
 * Separated to avoid circular type inference in Convex.
 *
 * Uses v.string() for businessId (not v.id()) because:
 * 1. Actions pass string args through to internal queries
 * 2. The generators cast to Id<"businesses"> internally
 */

import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { generateProfitLossStatement } from "../lib/statement_generators/profit_loss_generator";
import { generateTrialBalance } from "../lib/statement_generators/trial_balance_generator";
import { generateBalanceSheet } from "../lib/statement_generators/balance_sheet_generator";
import { generateCashFlowStatement } from "../lib/statement_generators/cash_flow_generator";

export const trialBalance = internalQuery({
  args: {
    businessId: v.string(),
    asOfDate: v.string(),
  },
  handler: async (ctx, args) => {
    return await generateTrialBalance(ctx, {
      businessId: args.businessId as Id<"businesses">,
      asOfDate: args.asOfDate,
    });
  },
});

export const profitLoss = internalQuery({
  args: {
    businessId: v.string(),
    dateFrom: v.string(),
    dateTo: v.string(),
  },
  handler: async (ctx, args) => {
    return await generateProfitLossStatement(ctx, {
      businessId: args.businessId as Id<"businesses">,
      dateFrom: args.dateFrom,
      dateTo: args.dateTo,
    });
  },
});

export const balanceSheet = internalQuery({
  args: {
    businessId: v.string(),
    asOfDate: v.string(),
  },
  handler: async (ctx, args) => {
    return await generateBalanceSheet(ctx, {
      businessId: args.businessId as Id<"businesses">,
      asOfDate: args.asOfDate,
    });
  },
});

export const cashFlow = internalQuery({
  args: {
    businessId: v.string(),
    dateFrom: v.string(),
    dateTo: v.string(),
  },
  handler: async (ctx, args) => {
    return await generateCashFlowStatement(ctx, {
      businessId: args.businessId as Id<"businesses">,
      dateFrom: args.dateFrom,
      dateTo: args.dateTo,
    });
  },
});

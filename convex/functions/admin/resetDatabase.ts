/**
 * Admin: Reset Database
 *
 * Clears all data from all tables for a fresh start.
 * USE WITH CAUTION - This is destructive and irreversible!
 *
 * Run via Convex Dashboard → Functions → admin:resetDatabase
 *
 * Required confirmation string: "DELETE_ALL_DATA"
 */

import { mutation } from "../../_generated/server";
import { v } from "convex/values";

const CONFIRMATION_STRING = "DELETE_ALL_DATA";

export const resetAllData = mutation({
  args: {
    confirmation: v.string(),
  },
  handler: async (ctx, args) => {
    // Safety check - require exact confirmation string
    if (args.confirmation !== CONFIRMATION_STRING) {
      throw new Error(
        `Safety check failed. To confirm deletion, pass confirmation: "${CONFIRMATION_STRING}"`
      );
    }

    console.log("⚠️ RESET DATABASE: Confirmation received, proceeding with deletion...");

    // Order matters - delete child tables first to avoid FK issues
    const tables = [
      "messages",
      "conversations",
      "feedback",
      "audit_events",
      "ocr_usage",
      "stripe_events",
      "expense_claims",
      "invoices",
      "vendors",
      "business_memberships",
      "users",
      "businesses",
    ] as const;

    const results: Record<string, number> = {};

    for (const tableName of tables) {
      let count = 0;
      // Get all documents from table
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const docs = await (ctx.db.query as any)(tableName).collect();

      // Delete each document
      for (const doc of docs) {
        await ctx.db.delete(doc._id);
        count++;
      }

      results[tableName] = count;
      console.log(`Deleted ${count} rows from ${tableName}`);
    }

    return {
      success: true,
      message: "All data cleared",
      deletedCounts: results,
      totalDeleted: Object.values(results).reduce((a, b) => a + b, 0),
    };
  },
});

/**
 * Action Center DSPy Optimization — Top-level orchestrator (033-ai-action-center-dspy)
 *
 * Loops through all businesses and calls prepareAndRun for each.
 * In a separate file from prepareAndRun to avoid circular type inference.
 */
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Top-level orchestrator: run optimization for ALL active businesses.
 * Called by EventBridge → scheduled-intelligence Lambda.
 */
export const runForAllBusinesses = internalAction({
  args: {},
  handler: async (ctx) => {
    console.log("[ActionCenterOptimization] Starting weekly optimization for all businesses");

    const businesses = await ctx.runQuery(internal.functions.actionCenterJobs.getActiveBusinesses);

    let totalProcessed = 0;
    let totalPromoted = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const business of businesses) {
      try {
        const result = await ctx.runAction(internal.functions.actionCenterOptimizationRunner.prepareAndRun, {
          businessId: business._id,
        });

        totalProcessed++;
        if (result.status === "promoted") totalPromoted++;
        else if (result.status === "skipped") totalSkipped++;
        else if (result.status === "failed") totalFailed++;
      } catch (error) {
        totalFailed++;
        console.error(`[ActionCenterOptimization] Error for business ${business._id}:`, error);
      }
    }

    console.log(
      `[ActionCenterOptimization] Complete: ${totalProcessed} processed, ${totalPromoted} promoted, ${totalSkipped} skipped, ${totalFailed} failed`
    );

    return { totalProcessed, totalPromoted, totalSkipped, totalFailed };
  },
});

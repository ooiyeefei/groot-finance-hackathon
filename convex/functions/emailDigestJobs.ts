/**
 * Weekly Email Digest Jobs
 *
 * Called by EventBridge → Lambda (weekly-email-digest module).
 * Generates and sends weekly summary emails to business owners/managers.
 */

import { internalAction } from "../_generated/server";

/**
 * Run weekly email digest for all active businesses
 *
 * Aggregates key metrics (expenses, invoices, cash flow) per business
 * and sends digest email to owners and finance admins.
 */
export const runWeeklyDigest = internalAction({
  args: {},
  handler: async (ctx) => {
    const startTime = Date.now();

    // TODO: Query businesses, aggregate weekly metrics, send via SES
    // This is a placeholder — the Lambda module will call this action,
    // and it will succeed without crashing. Full implementation requires
    // the SES email template and metric aggregation logic.
    console.log("[EmailDigest] Weekly digest job started (placeholder)");

    const businessesProcessed = 0;
    const emailsSent = 0;

    const durationMs = Date.now() - startTime;
    console.log(
      `[EmailDigest] Complete: ${businessesProcessed} businesses, ${emailsSent} emails in ${durationMs}ms`
    );

    return {
      businessesProcessed,
      emailsSent,
      durationMs,
    };
  },
});

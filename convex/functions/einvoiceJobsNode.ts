"use node";
/**
 * E-Invoice Node.js Actions (019-lhdn-einv-flow-2)
 *
 * Architecture:
 * - LHDN polling: Handled entirely by AWS (EventBridge → Lambda → Convex mutation).
 *   Lambda reads SSM secrets (IAM-native), calls LHDN API, passes documents
 *   back to Convex mutation (processLhdnReceivedDocuments) for matching + storage.
 *   Convex real-time subscriptions auto-push status changes to frontend.
 *
 * - Email processing: SES → Lambda → Convex (processIncomingEmail)
 *
 * LHDN credentials per business:
 * - lhdnClientId: stored in Convex businesses table (not sensitive)
 * - lhdnClientSecret: stored in AWS SSM Parameter Store SecureString
 *   Path: /groot-finance/businesses/{businessId}/lhdn-client-secret
 *   Saved via: POST /api/v1/account-management/businesses/lhdn-secret
 *   Read by: LHDN Polling Lambda (IAM → SSM, zero exported credentials)
 */

import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Parse the + suffix from an email address
 * e.g., "einvoice+ABC123@hellogroot.com" -> "ABC123"
 */
function parseEmailRefFromAddress(email: string): string | null {
  const match = email.match(/einvoice\+([^@]+)@/i);
  return match ? match[1] : null;
}

// ============================================
// EMAIL PROCESSING (US3 — Channel A)
// ============================================

/**
 * Internal Action: Process incoming e-invoice email from SES
 * Called by the email receiving Lambda via Convex HTTP API
 */
export const processIncomingEmail = internalAction({
  args: {
    s3Key: v.string(),
    messageId: v.string(),
    toAddress: v.string(),
    fromAddress: v.optional(v.string()),
    subject: v.optional(v.string()),
    attachmentKeys: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    console.log(`[E-Invoice Email] Processing email: ${args.messageId}`);

    // Parse + suffix from To address
    const emailRef = parseEmailRefFromAddress(args.toAddress);
    if (!emailRef) {
      console.log(`[E-Invoice Email] No valid + suffix in To address: ${args.toAddress}`);
      return;
    }

    // Look up expense claim by email ref
    const claim = await ctx.runMutation(internal.functions.einvoiceJobs.findClaimByEmailRef, {
      emailRef,
    });

    if (!claim) {
      console.log(`[E-Invoice Email] No expense claim found for emailRef: ${emailRef}`);
      return;
    }

    // Update expense claim status
    await ctx.runMutation(internal.functions.expenseClaims.internalUpdateEinvoiceStatus, {
      claimId: claim._id,
      einvoiceRequestStatus: "received",
      einvoiceAttached: true,
      einvoiceReceivedAt: Date.now(),
      einvoiceSource: "merchant_issued",
    });

    // Send notification
    await ctx.runMutation(internal.functions.notifications.create, {
      recipientUserId: claim.userId,
      businessId: claim.businessId,
      type: "compliance",
      severity: "info",
      title: "E-Invoice Received via Email",
      body: `An e-invoice has been received from ${args.fromAddress || "merchant"} and matched to your expense claim.`,
      resourceType: "expense_claim",
      resourceId: claim._id as string,
      sourceEvent: `einvoice_email_${claim._id}_${args.messageId}`,
    });

    console.log(`[E-Invoice Email] Matched email to claim ${claim._id} via emailRef ${emailRef}`);
  },
});

/**
 * LHDN E-Invoice Verification Action (024-einv-buyer-reject-pivot)
 *
 * Triggered after OCR detects an LHDN QR code on an AP invoice.
 * Makes a single GET call to LHDN API to verify the document and
 * stores the validation timestamp + UUID on the invoice record.
 *
 * This replaces the Lambda polling architecture with on-demand verification.
 */

import { v } from "convex/values";
import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Internal mutation to update invoice with LHDN verification results.
 * Called by the verifyDocument action after LHDN API response.
 */
export const updateVerificationResult = internalMutation({
  args: {
    invoiceId: v.id("invoices"),
    lhdnUuid: v.optional(v.string()),
    lhdnDocumentUuid: v.optional(v.string()),
    lhdnValidatedAt: v.optional(v.number()),
    lhdnStatus: v.optional(v.string()),
    lhdnVerificationStatus: v.string(),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const updateData: Record<string, unknown> = {
      lhdnVerificationStatus: args.lhdnVerificationStatus,
      updatedAt: Date.now(),
    };

    if (args.lhdnUuid) updateData.lhdnDocumentUuid = args.lhdnUuid;
    if (args.lhdnValidatedAt) updateData.lhdnValidatedAt = args.lhdnValidatedAt;
    if (args.lhdnStatus) updateData.lhdnStatus = args.lhdnStatus;

    await ctx.db.patch(args.invoiceId, updateData);
    console.log(
      `[LHDN Verify] Invoice ${args.invoiceId}: status=${args.lhdnVerificationStatus}` +
        (args.lhdnUuid ? ` uuid=${args.lhdnUuid}` : "")
    );
  },
});

/**
 * Action: Verify an LHDN e-invoice document.
 *
 * Called after OCR sets lhdnLongId + lhdnVerificationStatus='pending' on an invoice.
 * Authenticates with LHDN OAuth, fetches document details, and updates the invoice.
 */
export const verifyDocument = internalAction({
  args: {
    invoiceId: v.id("invoices"),
    lhdnLongId: v.string(),
    businessId: v.id("businesses"),
  },
  handler: async (ctx, args) => {
    console.log(
      `[LHDN Verify] Starting verification for invoice ${args.invoiceId}, longId=${args.lhdnLongId}`
    );

    try {
      // Step 1: Get business LHDN credentials
      const business = await ctx.runQuery(
        internal.functions.businesses.getByIdInternal,
        { businessId: args.businessId as string }
      );

      if (!business) {
        throw new Error("Business not found");
      }

      const clientId = (business as Record<string, unknown>).lhdnClientId as
        | string
        | undefined;
      const tin = business.lhdnTin;

      if (!clientId || !tin) {
        console.log(
          `[LHDN Verify] Business ${args.businessId} has no LHDN credentials — skipping`
        );
        await ctx.runMutation(
          internal.functions.lhdnVerification.updateVerificationResult,
          {
            invoiceId: args.invoiceId,
            lhdnVerificationStatus: "pending",
            errorMessage: "LHDN credentials not configured",
          }
        );
        return;
      }

      // Step 2: Get client secret from SSM via API route
      // Note: Convex actions can't access AWS SDK directly.
      // We call the LHDN API via the Next.js API route which has OIDC access to SSM.
      const lhdnApiUrl =
        process.env.LHDN_API_URL ||
        "https://preprod-api.myinvois.hasil.gov.my";

      // Authenticate with LHDN OAuth
      const tokenRes = await fetch(`${lhdnApiUrl}/connect/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          onbehalfof: tin,
        },
        body: new URLSearchParams({
          client_id: clientId,
          // For Convex actions, we need the secret passed or use an internal endpoint
          // Using environment variable for now (set via npx convex env set)
          client_secret: process.env.LHDN_CLIENT_SECRET || "",
          grant_type: "client_credentials",
          scope: "InvoicingAPI",
        }).toString(),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(
          `LHDN auth failed: ${tokenRes.status} ${errText.substring(0, 200)}`
        );
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      // Step 3: Get document details from LHDN
      const docRes = await fetch(
        `${lhdnApiUrl}/api/v1.0/documents/${args.lhdnLongId}/details`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        }
      );

      if (!docRes.ok) {
        const errText = await docRes.text();
        throw new Error(
          `LHDN document fetch failed: ${docRes.status} ${errText.substring(0, 200)}`
        );
      }

      const docData = await docRes.json();

      // Step 4: Extract validation info
      const uuid = docData.uuid || docData.documentUUID;
      const validatedAt = docData.dateTimeValidation
        ? new Date(docData.dateTimeValidation).getTime()
        : undefined;
      const status = docData.status?.toLowerCase() || "valid";

      // Step 5: Update invoice with verification results
      await ctx.runMutation(
        internal.functions.lhdnVerification.updateVerificationResult,
        {
          invoiceId: args.invoiceId,
          lhdnUuid: uuid,
          lhdnValidatedAt: validatedAt,
          lhdnStatus: status,
          lhdnVerificationStatus: "verified",
        }
      );

      console.log(
        `[LHDN Verify] Success for ${args.invoiceId}: uuid=${uuid}, status=${status}`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown verification error";
      console.error(`[LHDN Verify] Failed for ${args.invoiceId}:`, message);

      await ctx.runMutation(
        internal.functions.lhdnVerification.updateVerificationResult,
        {
          invoiceId: args.invoiceId,
          lhdnVerificationStatus: "failed",
          errorMessage: message,
        }
      );
    }
  },
});

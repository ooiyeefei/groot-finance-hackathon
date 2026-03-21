/**
 * POST /api/v1/expense-claims/[id]/send-einvoice-copy
 *
 * Sends a copy of the captured e-invoice to the user's email.
 * Used for direct-link merchants (#330) where e-invoice is captured as PDF/HTML
 * and stored in S3 — no merchant email callback expected.
 *
 * Auth: X-Internal-Key (internal service-to-service only)
 */

import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { emailService } from "@/lib/services/email-service";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: claimId } = await params;

  // Verify internal service key
  const internalKey = request.headers.get("X-Internal-Key");
  if (!internalKey || internalKey !== process.env.MCP_INTERNAL_SERVICE_KEY) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { userId, businessId, vendorName, amount, currency, einvoiceStoragePath, einvoiceDirectUrl } = body;

    if (!userId || !einvoiceStoragePath) {
      return NextResponse.json({ success: false, error: "Missing userId or einvoiceStoragePath" }, { status: 400 });
    }

    // Get user email from Convex
    const user = await convex.query(api.functions.users.getById, { id: userId });
    if (!user?.email) {
      console.log(`[SendEinvoiceCopy] No email for user ${userId}, skipping`);
      return NextResponse.json({ success: true, skipped: true, reason: "no_user_email" });
    }

    // Download e-invoice from S3
    const { GetObjectCommand, S3Client } = await import("@aws-sdk/client-s3");
    const { fromWebToken } = await import("@aws-sdk/credential-providers");

    // Use Vercel OIDC for production, default chain for local dev
    const roleArn = process.env.AWS_ROLE_ARN;
    let s3Credentials: any = undefined;
    if (roleArn && process.env.VERCEL) {
      const { getVercelOidcToken } = await import("@vercel/oidc");
      const token = await getVercelOidcToken();
      s3Credentials = fromWebToken({
        roleArn,
        webIdentityToken: token,
        roleSessionName: `groot-einvoice-copy-${Date.now()}`,
      });
    }

    const s3 = new S3Client({
      region: process.env.AWS_REGION || "us-west-2",
      ...(s3Credentials ? { credentials: s3Credentials } : {}),
    });

    const s3Key = `expense_claims/${einvoiceStoragePath}`;
    const s3Response = await s3.send(new GetObjectCommand({
      Bucket: "finanseal-bucket",
      Key: s3Key,
    }));

    const fileBytes = await s3Response.Body?.transformToByteArray();
    if (!fileBytes || fileBytes.length === 0) {
      console.error(`[SendEinvoiceCopy] Empty file at ${s3Key}`);
      return NextResponse.json({ success: false, error: "E-invoice file is empty" }, { status: 500 });
    }

    // Determine file type and name
    const isHtml = einvoiceStoragePath.endsWith(".html");
    const isPdf = einvoiceStoragePath.endsWith(".pdf");
    const filename = `einvoice-${vendorName?.replace(/[^a-zA-Z0-9]/g, "-") || "merchant"}-${claimId.slice(-6)}.${isPdf ? "pdf" : "html"}`;
    const contentType = isPdf ? "application/pdf" : "text/html";

    // Build email
    // emailService is a singleton imported at top
    const amountStr = amount ? `${currency || "MYR"} ${Number(amount).toFixed(2)}` : "";

    const subject = `Your E-Invoice from ${vendorName || "merchant"}${amountStr ? ` — ${amountStr}` : ""}`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">✅</span>
            <strong style="color: #166534;">E-Invoice Captured</strong>
          </div>
          <p style="color: #374151; margin: 8px 0 0;">
            Your e-invoice from <strong>${vendorName || "merchant"}</strong> has been automatically captured and attached to your expense claim.
          </p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 8px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Vendor</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 500; border-bottom: 1px solid #e5e7eb;">${vendorName || "N/A"}</td>
          </tr>
          ${amountStr ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">Amount</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 500; border-bottom: 1px solid #e5e7eb;">${amountStr}</td>
          </tr>` : ""}
          ${einvoiceDirectUrl ? `
          <tr>
            <td style="padding: 8px 0; color: #6b7280; border-bottom: 1px solid #e5e7eb;">E-Invoice Link</td>
            <td style="padding: 8px 0; text-align: right; border-bottom: 1px solid #e5e7eb;">
              <a href="${einvoiceDirectUrl}" style="color: #2563eb;">View Online</a>
            </td>
          </tr>` : ""}
          <tr>
            <td style="padding: 8px 0; color: #6b7280;">Expense ID</td>
            <td style="padding: 8px 0; text-align: right; font-family: monospace; font-size: 12px;">${claimId}</td>
          </tr>
        </table>

        <p style="color: #6b7280; font-size: 13px;">
          A copy of the e-invoice is attached to this email. It has also been saved to your expense claim in Groot Finance.
        </p>

        <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            Groot Finance — Your AI Financial Co-Pilot
          </p>
        </div>
      </div>
    `;

    const textBody = [
      `E-Invoice Captured — ${vendorName || "merchant"}`,
      "",
      `Your e-invoice from ${vendorName || "merchant"} has been automatically captured and attached to your expense claim.`,
      "",
      `Vendor: ${vendorName || "N/A"}`,
      amountStr ? `Amount: ${amountStr}` : "",
      einvoiceDirectUrl ? `E-Invoice Link: ${einvoiceDirectUrl}` : "",
      `Expense ID: ${claimId}`,
      "",
      "A copy of the e-invoice is attached. It has also been saved to your expense claim in Groot Finance.",
    ].filter(Boolean).join("\n");

    const result = await emailService.sendGenericEmail({
      to: user.email,
      subject,
      htmlBody,
      textBody,
      attachments: [{
        content: Buffer.from(fileBytes).toString("base64"),
        filename,
      }],
    });

    if (result.success) {
      console.log(`[SendEinvoiceCopy] Sent to ${user.email} for claim ${claimId}, messageId=${result.messageId}`);
      return NextResponse.json({
        success: true,
        data: { sentTo: user.email, sesMessageId: result.messageId },
      });
    } else {
      console.error(`[SendEinvoiceCopy] Failed for ${claimId}: ${result.error}`);
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
  } catch (error) {
    console.error(`[SendEinvoiceCopy] Error:`, error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

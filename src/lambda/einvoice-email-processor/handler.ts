/**
 * E-Invoice Email Processor Lambda (019-lhdn-einv-flow-2)
 *
 * Processes incoming merchant e-invoice emails received via AWS SES.
 *
 * Flow:
 * 1. SES receives email to *@einv.hellogroot.com
 * 2. SES stores raw email in S3 (ses-emails/einvoice/) + triggers this Lambda
 * 3. Lambda parses email ref from To address (einvoice+{ref}@einv.hellogroot.com)
 * 4. Lambda queries Convex for claim details (businessId, userId, claimId)
 * 5. Lambda parses MIME → extracts PDF attachment
 * 6. Lambda saves to S3:
 *    - expense_claims/{bizId}/{userId}/{claimId}/einvoice/raw-email.eml
 *    - expense_claims/{bizId}/{userId}/{claimId}/einvoice/einvoice.pdf
 * 7. Lambda calls Convex mutation to mark claim as "received"
 *
 * S3 paths follow existing pattern: {domain}/{bizId}/{userId}/{docId}/{stage}/{filename}
 */

import { S3Client, GetObjectCommand, CopyObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { simpleParser, ParsedMail } from "mailparser";
import { Readable } from "stream";

// ============================================================
// Types
// ============================================================

/** SES event delivered via Lambda action */
interface SESEvent {
  Records: Array<{
    eventSource: string;
    ses: {
      mail: {
        messageId: string;
        source: string;
        destination: string[];
        commonHeaders: {
          from: string[];
          to: string[];
          subject: string;
        };
      };
      receipt: {
        action: {
          type: string;
          bucketName: string;
          objectKey: string;
        };
      };
    };
  }>;
}

interface ClaimDetails {
  claimId: string;
  businessId: string;
  userId: string;
  storagePath: string;
}

// ============================================================
// Clients
// ============================================================

const s3Client = new S3Client({ region: process.env.AWS_REGION || "us-west-2" });
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "";
const S3_BUCKET = process.env.S3_BUCKET_NAME || "finanseal-bucket";

// ============================================================
// Convex HTTP Client
// ============================================================

async function convexQuery(
  functionPath: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: functionPath, args, format: "json" }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Convex query failed: ${response.status} ${text}`);
  }

  const result = await response.json();
  if (result.status === "error") {
    throw new Error(`Convex query error: ${result.errorMessage}`);
  }
  return result.value;
}

async function convexMutation(
  functionPath: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: functionPath, args, format: "json" }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Convex mutation failed: ${response.status} ${text}`);
  }

  const result = await response.json();
  if (result.status === "error") {
    throw new Error(`Convex mutation error: ${result.errorMessage}`);
  }
  return result.value;
}

// ============================================================
// Email Parsing
// ============================================================

function parseEmailRef(toAddress: string): string | null {
  const match = toAddress.match(/einvoice\+([^@]+)@/i);
  return match ? match[1] : null;
}

async function downloadFromS3(bucket: string, key: string): Promise<Buffer> {
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const stream = response.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function uploadToS3(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await s3Client.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
}

async function copyInS3(sourceKey: string, sourceBucket: string, destKey: string): Promise<void> {
  await s3Client.send(new CopyObjectCommand({
    Bucket: S3_BUCKET,
    CopySource: `${sourceBucket}/${sourceKey}`,
    Key: destKey,
  }));
}

function findPdfAttachment(parsed: ParsedMail): { filename: string; content: Buffer } | null {
  if (!parsed.attachments || parsed.attachments.length === 0) return null;

  // Prefer PDF, fall back to first attachment
  const pdf = parsed.attachments.find(
    (a) => a.contentType === "application/pdf" || a.filename?.toLowerCase().endsWith(".pdf")
  );

  if (pdf) {
    return { filename: pdf.filename || "einvoice.pdf", content: pdf.content };
  }

  // If no PDF, take first attachment (could be image, XML, etc.)
  const first = parsed.attachments[0];
  return { filename: first.filename || "einvoice-attachment", content: first.content };
}

// ============================================================
// Handler
// ============================================================

export async function handler(event: SESEvent) {
  const startTime = Date.now();

  for (const record of event.Records) {
    const ses = record.ses;
    const messageId = ses.mail.messageId;
    const toAddresses = ses.mail.destination;
    const fromAddress = ses.mail.source;
    const subject = ses.mail.commonHeaders.subject;
    const rawEmailBucket = ses.receipt.action.bucketName;
    const rawEmailKey = ses.receipt.action.objectKey;

    console.log(`[E-Invoice Email] Processing: ${messageId} from ${fromAddress} to ${toAddresses.join(", ")}`);

    // Find the einvoice+ address
    let emailRef: string | null = null;
    for (const addr of toAddresses) {
      emailRef = parseEmailRef(addr);
      if (emailRef) break;
    }

    if (!emailRef) {
      console.log(`[E-Invoice Email] No einvoice+ address found in: ${toAddresses.join(", ")}`);
      continue;
    }

    console.log(`[E-Invoice Email] emailRef: ${emailRef}`);

    // Look up expense claim from Convex
    const claimDetails = await convexQuery(
      "functions/system:getClaimByEmailRef",
      { emailRef }
    ) as ClaimDetails | null;

    if (!claimDetails) {
      console.log(`[E-Invoice Email] No claim found for emailRef: ${emailRef}`);
      continue;
    }

    const { claimId, businessId, userId, storagePath } = claimDetails;
    console.log(`[E-Invoice Email] Matched to claim ${claimId} (biz: ${businessId})`);

    // Download raw email from SES S3 bucket
    const rawEmailBytes = await downloadFromS3(rawEmailBucket, rawEmailKey);

    // Parse MIME
    const parsed = await simpleParser(rawEmailBytes);

    // Build S3 destination paths (aligned with existing pattern)
    // storagePath from Convex: "{bizId}/{userId}/{claimId}"
    // Full S3 key: "expense_claims/{storagePath}/einvoice/{filename}"
    const einvoicePrefix = `expense_claims/${storagePath}/einvoice`;

    // Copy raw email to expense claim folder (audit trail)
    await copyInS3(rawEmailKey, rawEmailBucket, `${einvoicePrefix}/raw-email.eml`);
    console.log(`[E-Invoice Email] Saved raw email to ${einvoicePrefix}/raw-email.eml`);

    // Extract and save PDF attachment
    const attachment = findPdfAttachment(parsed);
    let einvoiceFilename: string | null = null;

    if (attachment) {
      einvoiceFilename = attachment.filename;
      const s3Key = `${einvoicePrefix}/${einvoiceFilename}`;
      const contentType = einvoiceFilename.toLowerCase().endsWith(".pdf")
        ? "application/pdf"
        : "application/octet-stream";
      await uploadToS3(s3Key, attachment.content, contentType);
      console.log(`[E-Invoice Email] Saved attachment to ${s3Key} (${attachment.content.length} bytes)`);
    } else {
      console.log(`[E-Invoice Email] No attachment found in email — saving email body as reference`);
      // Save HTML body as fallback (some merchants send inline e-invoices)
      if (parsed.html) {
        const htmlBuffer = Buffer.from(parsed.html as string, "utf-8");
        await uploadToS3(`${einvoicePrefix}/einvoice-email.html`, htmlBuffer, "text/html");
        einvoiceFilename = "einvoice-email.html";
      }
    }

    // Update Convex with e-invoice storage path
    await convexMutation("functions/system:processEinvoiceEmail", {
      claimId,
      emailRef,
      fromAddress,
      subject,
      messageId,
      einvoiceStoragePath: einvoiceFilename
        ? `${storagePath}/einvoice/${einvoiceFilename}`
        : null,
      rawEmailStoragePath: `${storagePath}/einvoice/raw-email.eml`,
      hasAttachment: !!attachment,
    });

    console.log(`[E-Invoice Email] Done processing ${messageId} for claim ${claimId}`);
  }

  const durationMs = Date.now() - startTime;
  console.log(`[E-Invoice Email] Processed ${event.Records.length} records in ${durationMs}ms`);
}

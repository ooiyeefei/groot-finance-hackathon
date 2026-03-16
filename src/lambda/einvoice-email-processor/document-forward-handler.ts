/**
 * Document Forwarding Email Handler
 *
 * Handles general document forwarding emails (receipts & AP invoices).
 * Email format: docs@{business-prefix}.hellogroot.com
 *
 * Flow:
 * 1. Parse email and extract attachments (PDF, JPG, PNG)
 * 2. Validate sender is in business allowlist
 * 3. Check for duplicates (file hash)
 * 4. Upload files to S3 temporarily
 * 5. Call Convex action to upload to Convex storage + create inbox entry
 * 6. Send duplicate detection auto-reply if needed
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { simpleParser, ParsedMail, Attachment } from "mailparser";
import crypto from "crypto";

const s3 = new S3Client({ region: process.env.AWS_REGION || "us-west-2" });
const ses = new SESClient({ region: process.env.AWS_REGION || "us-west-2" });
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "";
const S3_BUCKET = process.env.S3_BUCKET_NAME || "finanseal-bucket";
const SYSTEM_EMAIL = "noreply@notifications.hellogroot.com";

interface DocumentAttachment {
  filename: string;
  contentType: string;
  size: number;
  buffer: Buffer;
  checksum: string;  // MD5 hash
}

interface BusinessConfig {
  businessId: string;
  userId: string;
  emailForwardingEnabled: boolean;
  emailForwardingAllowlist: string[];
  businessName: string;
}

/**
 * Parse business prefix from email address
 * Format: docs@{prefix}.hellogroot.com
 */
export function parseBusinessPrefix(toAddress: string): string | null {
  const match = toAddress.match(/^docs@([a-z0-9-]+)\.hellogroot\.com$/i);
  return match ? match[1] : null;
}

/**
 * Query Convex for business configuration
 */
async function getBusinessConfig(prefix: string): Promise<BusinessConfig | null> {
  try {
    const response = await fetch(`${CONVEX_URL}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "functions/documentInbox:getBusinessByPrefix",
        args: { emailForwardingPrefix: prefix },
        format: "json",
      }),
    });

    if (!response.ok) {
      console.log(`[DocForward] Convex query failed: ${response.status}`);
      return null;
    }

    const result = await response.json();
    if (result.status === "error") {
      console.log(`[DocForward] Convex error: ${result.errorMessage}`);
      return null;
    }

    return result.value;
  } catch (error) {
    console.log(`[DocForward] Failed to fetch business config: ${error}`);
    return null;
  }
}

/**
 * Validate sender is in allowlist
 */
function isAuthorizedSender(senderEmail: string, allowlist: string[]): boolean {
  const normalized = senderEmail.toLowerCase().trim();
  return allowlist.some((allowed) => allowed.toLowerCase().trim() === normalized);
}

/**
 * Extract valid document attachments (PDF, JPG, PNG)
 */
function extractDocumentAttachments(parsed: ParsedMail): DocumentAttachment[] {
  const attachments: DocumentAttachment[] = [];

  if (!parsed.attachments || parsed.attachments.length === 0) {
    return attachments;
  }

  for (const attachment of parsed.attachments) {
    // Skip inline images
    if (attachment.contentDisposition === "inline") continue;

    // Only process PDF and images
    const contentType = attachment.contentType.toLowerCase();
    if (
      !contentType.includes("application/pdf") &&
      !contentType.includes("image/jpeg") &&
      !contentType.includes("image/jpg") &&
      !contentType.includes("image/png")
    ) {
      continue;
    }

    // Calculate MD5 checksum
    const checksum = crypto.createHash("md5").update(attachment.content).digest("hex");

    attachments.push({
      filename: attachment.filename || `document-${attachments.length + 1}`,
      contentType: attachment.contentType,
      size: attachment.size,
      buffer: attachment.content,
      checksum,
    });
  }

  return attachments;
}

/**
 * Upload file to S3 staging area
 */
async function uploadToS3Staging(
  businessId: string,
  filename: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  const timestamp = Date.now();
  const s3Key = `document-inbox-staging/${businessId}/${timestamp}-${filename}`;

  await s3.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: s3Key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  return s3Key;
}

/**
 * Call Convex action to create inbox entry
 */
async function createInboxEntry(params: {
  s3Bucket: string;
  s3Key: string;
  originalFilename: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  businessId: string;
  userId: string;
  emailMetadata: {
    from: string;
    subject: string;
    body: string;
    receivedAt: number;
    messageId: string;
  };
}): Promise<{
  inboxEntryId: string;
  triggerClassification: boolean;
  isDuplicate: boolean;
  duplicateOriginalId?: string;
  fileHash: string;
  fileSizeBytes: number;
}> {
  const response = await fetch(`${CONVEX_URL}/api/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "functions/documentInboxInternal:uploadAndCreateInboxEntry",
      args: params,
      format: "json",
    }),
  });

  if (!response.ok) {
    throw new Error(`Convex action failed: ${response.status}`);
  }

  const result = await response.json();
  if (result.status === "error") {
    throw new Error(`Convex error: ${result.errorMessage}`);
  }

  return result.value;
}

/**
 * Send duplicate detection auto-reply email
 */
async function sendDuplicateNotification(
  toEmail: string,
  filename: string,
  duplicateDate: string
): Promise<void> {
  try {
    await ses.send(
      new SendEmailCommand({
        Source: SYSTEM_EMAIL,
        Destination: { ToAddresses: [toEmail] },
        Message: {
          Subject: { Data: `[Groot Finance] Duplicate Document Detected: ${filename}` },
          Body: {
            Text: {
              Data: `Hello,

We received your forwarded document "${filename}", but it appears to be a duplicate of a document already in the system (uploaded on ${duplicateDate}).

To avoid duplicate entries, we have not processed this document. If you believe this is an error, please contact support.

Best regards,
Groot Finance Team`,
            },
          },
        },
      })
    );
    console.log(`[DocForward] Sent duplicate notification to ${toEmail}`);
  } catch (error) {
    console.log(`[DocForward] Failed to send duplicate notification: ${error}`);
  }
}

/**
 * Send batch rejection email (too many attachments)
 */
async function sendBatchRejectionEmail(
  toEmail: string,
  attachmentCount: number
): Promise<void> {
  try {
    await ses.send(
      new SendEmailCommand({
        Source: SYSTEM_EMAIL,
        Destination: { ToAddresses: [toEmail] },
        Message: {
          Subject: { Data: "[Groot Finance] Email Forward Rejected: Too Many Attachments" },
          Body: {
            Text: {
              Data: `Hello,

We received your email with ${attachmentCount} attachments. For batch submissions, please use the web upload interface instead of email forwarding.

Email forwarding is limited to 10 attachments per email to ensure reliable processing.

To upload multiple documents:
1. Visit https://finance.hellogroot.com
2. Navigate to Expense Claims or AP Invoices
3. Use the bulk upload feature

Best regards,
Groot Finance Team`,
            },
          },
        },
      })
    );
    console.log(`[DocForward] Sent batch rejection email to ${toEmail}`);
  } catch (error) {
    console.log(`[DocForward] Failed to send batch rejection email: ${error}`);
  }
}

/**
 * Main handler for document forwarding emails
 */
export async function handleDocumentForwarding(
  rawEmailBytes: Buffer,
  toAddress: string,
  fromAddress: string,
  subject: string,
  messageId: string
): Promise<void> {
  console.log(`[DocForward] Processing email: ${messageId} from ${fromAddress}`);

  // 1. Parse business prefix
  const prefix = parseBusinessPrefix(toAddress);
  if (!prefix) {
    console.log(`[DocForward] Invalid email format: ${toAddress}`);
    return;
  }

  // 2. Get business configuration
  const businessConfig = await getBusinessConfig(prefix);
  if (!businessConfig) {
    console.log(`[DocForward] Business not found for prefix: ${prefix}`);
    return;
  }

  if (!businessConfig.emailForwardingEnabled) {
    console.log(`[DocForward] Email forwarding disabled for business: ${businessConfig.businessId}`);
    return;
  }

  // 3. Validate sender authorization
  if (!isAuthorizedSender(fromAddress, businessConfig.emailForwardingAllowlist)) {
    console.log(`[DocForward] Unauthorized sender: ${fromAddress} (not in allowlist)`);
    // TODO: Send unauthorized notification email
    return;
  }

  // 4. Parse email and extract attachments
  const parsed = await simpleParser(rawEmailBytes);
  const textBody = parsed.text || "";
  const attachments = extractDocumentAttachments(parsed);

  console.log(`[DocForward] Found ${attachments.length} valid attachments`);

  if (attachments.length === 0) {
    console.log(`[DocForward] No valid attachments found`);
    return;
  }

  // 5. Check batch submission threshold
  if (attachments.length > 10) {
    console.log(`[DocForward] Batch submission detected (${attachments.length} files) - rejecting`);
    await sendBatchRejectionEmail(fromAddress, attachments.length);
    return;
  }

  // 6. Process each attachment
  const emailMetadata = {
    from: fromAddress,
    subject,
    body: textBody.substring(0, 1000),  // First 1000 chars
    receivedAt: Date.now(),
    messageId,
  };

  for (const attachment of attachments) {
    try {
      console.log(`[DocForward] Processing: ${attachment.filename} (${attachment.size} bytes, hash=${attachment.checksum})`);

      // Upload to S3 staging
      const s3Key = await uploadToS3Staging(
        businessConfig.businessId,
        attachment.filename,
        attachment.buffer,
        attachment.contentType
      );

      console.log(`[DocForward] Uploaded to S3: ${s3Key}`);

      // Normalize MIME type
      let mimeType: "application/pdf" | "image/jpeg" | "image/png";
      if (attachment.contentType.includes("pdf")) {
        mimeType = "application/pdf";
      } else if (attachment.contentType.includes("png")) {
        mimeType = "image/png";
      } else {
        mimeType = "image/jpeg";
      }

      // Create inbox entry via Convex
      const result = await createInboxEntry({
        s3Bucket: S3_BUCKET,
        s3Key,
        originalFilename: attachment.filename,
        mimeType,
        businessId: businessConfig.businessId,
        userId: businessConfig.userId,
        emailMetadata,
      });

      if (result.isDuplicate) {
        console.log(`[DocForward] Duplicate detected: ${result.duplicateOriginalId}`);
        await sendDuplicateNotification(
          fromAddress,
          attachment.filename,
          new Date().toISOString().split("T")[0]  // Placeholder date
        );
      } else {
        console.log(`[DocForward] Inbox entry created: ${result.inboxEntryId} (hash=${result.fileHash}, size=${result.fileSizeBytes})`);
        if (result.triggerClassification) {
          console.log(`[DocForward] Classification will be triggered by Trigger.dev`);
        }
      }
    } catch (error) {
      console.log(`[DocForward] Failed to process ${attachment.filename}: ${error}`);
    }
  }

  console.log(`[DocForward] Completed processing ${attachments.length} attachments`);
}

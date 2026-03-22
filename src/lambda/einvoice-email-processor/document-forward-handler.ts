/**
 * Document Forwarding Email Handler
 *
 * Handles general document forwarding emails (receipts & AP invoices).
 * Email format: {business-prefix}@inbox.hellogroot.com
 *
 * Flow:
 * 1. Parse email and extract attachments (PDF, JPG, PNG)
 * 2. Validate sender is in business allowlist
 * 3. Check for duplicates (file hash)
 * 4. Upload files to S3 temporarily
 * 5. Call Convex action to upload to Convex storage + create inbox entry
 * 6. Send duplicate detection auto-reply if needed
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { simpleParser, ParsedMail, Attachment } from "mailparser";
import crypto from "crypto";

const s3 = new S3Client({ region: process.env.AWS_REGION || "us-west-2" });
const ses = new SESClient({ region: process.env.AWS_REGION || "us-west-2" });
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || "us-west-2" });
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "";
const S3_BUCKET = process.env.S3_BUCKET_NAME || "finanseal-bucket";
// Read lazily — handler.ts resolves from SSM at runtime and sets process.env
const getGeminiApiKey = () => process.env.GEMINI_API_KEY || "";
const SYSTEM_EMAIL = "noreply@notifications.hellogroot.com";

const AUTO_ROUTE_THRESHOLD = 0.90; // Auto-route if confidence >= 90%

// ── DSPy few-shot cache (loaded once per cold start) ──
interface FewShotExample {
  description: string;
  filename: string;
  type: string;
  reasoning: string;
}
let cachedFewShotExamples: FewShotExample[] | null = null;

/**
 * Load DSPy-optimized few-shot examples from S3.
 * Cached across invocations. Returns empty array if no trained model exists yet.
 */
async function loadFewShotExamples(): Promise<FewShotExample[]> {
  if (cachedFewShotExamples !== null) return cachedFewShotExamples;

  try {
    const resp = await s3.send(new GetObjectCommand({
      Bucket: S3_BUCKET,
      Key: "dspy-modules/doc_classifier/few_shot_examples.json",
    }));
    const body = await resp.Body?.transformToString();
    if (body) {
      const data = JSON.parse(body);
      cachedFewShotExamples = data.examples || [];
      console.log(`[DocForward] Loaded ${cachedFewShotExamples!.length} DSPy few-shot examples (v${data.version})`);
      return cachedFewShotExamples!;
    }
  } catch (err: any) {
    if (err?.name === "NoSuchKey") {
      console.log("[DocForward] No DSPy model yet — using base prompt");
    } else {
      console.log(`[DocForward] Failed to load DSPy examples: ${err}`);
    }
  }
  cachedFewShotExamples = [];
  return [];
}

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
 * Format: {prefix}@inbox.hellogroot.com
 */
export function parseBusinessPrefix(toAddress: string): string | null {
  const match = toAddress.match(/^([a-z0-9-]+)@inbox\.hellogroot\.com$/i);
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
 * Validate sender is a team member of the business (Convex query)
 * Returns: { authorized, userId, role, reason }
 */
async function validateSenderEmail(
  businessId: string,
  senderEmail: string
): Promise<{
  authorized: boolean;
  userId?: string;
  role?: string;
  reason: string;
}> {
  try {
    const response = await fetch(`${CONVEX_URL}/api/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "functions/documentInbox:validateSender",
        args: { businessId, senderEmail },
        format: "json",
      }),
    });

    if (!response.ok) {
      console.log(`[DocForward] Sender validation query failed: ${response.status}`);
      return { authorized: false, reason: `Validation query failed: ${response.status}` };
    }

    const result = await response.json();
    if (result.status === "error") {
      console.log(`[DocForward] Sender validation error: ${result.errorMessage}`);
      return { authorized: false, reason: result.errorMessage };
    }

    return result.value;
  } catch (error) {
    console.log(`[DocForward] Sender validation failed: ${error}`);
    return { authorized: false, reason: `Validation error: ${error}` };
  }
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
 * Classify document using Gemini Flash-Lite
 * Takes the raw file buffer directly — no URL fetch needed.
 */
async function classifyDocument(
  fileBuffer: Buffer,
  filename: string,
  contentType: string
): Promise<{
  type: "receipt" | "invoice" | "unknown";
  confidence: number;
  reasoning: string;
}> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    console.log("[DocForward] No GEMINI_API_KEY - skipping classification");
    return { type: "unknown", confidence: 0, reasoning: "No API key" };
  }

  try {
    // Load DSPy-learned few-shot examples (if trained model exists)
    const fewShotExamples = await loadFewShotExamples();

    // Build prompt — enhanced with learned examples when available
    let fewShotSection = "";
    if (fewShotExamples.length > 0) {
      const exampleLines = fewShotExamples
        .slice(0, 5) // Cap at 5 examples to stay within token limits
        .map((ex, i) => `Example ${i + 1}: "${ex.description}" → ${ex.type} (${ex.reasoning})`)
        .join("\n");
      fewShotSection = `\n\nHere are examples from past corrections to guide your classification:\n${exampleLines}\n`;
    }

    const prompt = `Classify this document image. Determine if it is:
- "receipt": A receipt from a merchant/vendor (proof of purchase for expense claims)
- "invoice": An AP supplier invoice (bill from vendor requesting payment)
- "unknown": Cannot determine or unclear

Consider:
- Receipts: typically show itemized purchases, merchant name, transaction date, payment method
- Invoices: show invoice number, payment terms, due date, "Invoice" header, billing/shipping addresses
${fewShotSection}
Respond in JSON only:
{"type":"receipt|invoice|unknown","confidence":0.0-1.0,"reasoning":"brief explanation"}`;

    // Determine MIME type for Gemini
    let mimeType = "image/jpeg";
    if (contentType.includes("pdf")) mimeType = "application/pdf";
    else if (contentType.includes("png")) mimeType = "image/png";

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: fileBuffer.toString("base64"),
                  },
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.0, maxOutputTokens: 256 },
        }),
      }
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.log(`[DocForward] Gemini API error: ${response.status} — ${errBody}`);
      return { type: "unknown", confidence: 0, reasoning: `API error: ${response.status}` };
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        type: parsed.type === "receipt" || parsed.type === "invoice" ? parsed.type : "unknown",
        confidence: parsed.confidence || 0,
        reasoning: parsed.reasoning || "",
      };
    }

    return { type: "unknown", confidence: 0, reasoning: "Failed to parse response" };
  } catch (error) {
    console.log(`[DocForward] Classification error: ${error}`);
    return { type: "unknown", confidence: 0, reasoning: `Error: ${error}` };
  }
}

/**
 * Route document to expense claims table
 */
async function routeToExpenseClaims(params: {
  businessId: string;
  userId: string;
  fileStorageId: string;
  originalFilename: string;
  emailMetadata: any;
}): Promise<string> {
  const response = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "functions/expenseClaims:create",
      args: {
        businessId: params.businessId,
        businessPurpose: `Document from email: ${params.emailMetadata.subject}`,
        fileName: params.originalFilename,
        fileType: params.originalFilename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg",
        fileSize: 0, // Will be updated after upload
        status: "draft",
        sourceType: "email_forward",
        sourceEmailMetadata: params.emailMetadata,
      },
      format: "json",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create expense claim: ${response.status}`);
  }

  const result = await response.json();
  if (result.status === "error") {
    throw new Error(`Convex error: ${result.errorMessage}`);
  }

  return result.value;
}

/**
 * Route document to invoices table
 */
async function routeToInvoices(params: {
  businessId: string;
  userId: string;
  fileStorageId: string;
  originalFilename: string;
  emailMetadata: any;
}): Promise<string> {
  const response = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "functions/invoices:create",
      args: {
        businessId: params.businessId,
        fileName: params.originalFilename,
        fileType: params.originalFilename.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg",
        fileSize: 0,
        status: "pending",
        sourceType: "email_forward",
        sourceEmailMetadata: params.emailMetadata,
      },
      format: "json",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create invoice: ${response.status}`);
  }

  const result = await response.json();
  if (result.status === "error") {
    throw new Error(`Convex error: ${result.errorMessage}`);
  }

  return result.value;
}

/**
 * Call Convex action to create inbox entry
 */
async function createInboxEntry(params: {
  presignedUrl: string;
  originalFilename: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  businessId: string;
  userId: string;
  s3StagingKey: string;
  s3ExpenseClaimsKey: string;
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
 * Send rejection email to unauthorized sender (not a team member)
 */
async function sendUnauthorizedSenderEmail(
  toEmail: string,
  businessName: string
): Promise<void> {
  try {
    await ses.send(
      new SendEmailCommand({
        Source: SYSTEM_EMAIL,
        Destination: { ToAddresses: [toEmail] },
        Message: {
          Subject: { Data: `[Groot Finance] Unable to process your forwarded document` },
          Body: {
            Text: {
              Data: `Hello,

We received your email but were unable to process it.

Your email address (${toEmail}) is not registered as a team member of "${businessName}" on Groot Finance. Only registered team members can forward documents for processing.

What to do:
- Ask your company administrator to add you as a team member on Groot Finance
- Once added, you can forward receipts and invoices to this email address and they will be processed automatically

If you believe this is an error, please contact your company's Groot Finance administrator.

Best regards,
Groot Finance Team
https://finance.hellogroot.com`,
            },
          },
        },
      })
    );
    console.log(`[DocForward] Sent unauthorized sender notification to ${toEmail}`);
  } catch (error) {
    console.log(`[DocForward] Failed to send unauthorized sender notification: ${error}`);
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

  // 3. Validate sender is a team member of this business
  const senderValidation = await validateSenderEmail(
    businessConfig.businessId,
    fromAddress
  );

  if (!senderValidation.authorized) {
    console.log(`[DocForward] REJECTED: ${fromAddress} — ${senderValidation.reason}`);
    await sendUnauthorizedSenderEmail(fromAddress, businessConfig.businessName);
    return;
  }

  console.log(
    `[DocForward] Sender verified: ${fromAddress} (role: ${senderValidation.role}, userId: ${senderValidation.userId})`
  );

  // Use the sender's actual userId (not the admin fallback)
  const senderUserId = senderValidation.userId || businessConfig.userId;
  const senderRole = senderValidation.role || "employee";

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
      const s3StagingKey = await uploadToS3Staging(
        businessConfig.businessId,
        attachment.filename,
        attachment.buffer,
        attachment.contentType
      );

      console.log(`[DocForward] Uploaded to S3 staging: ${s3StagingKey}`);

      // Also upload to expense_claims/ prefix so CloudFront signed URLs work
      // when this document is classified as a receipt later.
      // Path: expense_claims/{bizId}/{userId}/email-fwd/{hash}.{ext}
      const ext = attachment.filename.split(".").pop() || "jpg";
      const expenseClaimsRelativeKey = `${businessConfig.businessId}/${senderUserId}/email-fwd/${attachment.checksum}.${ext}`;
      const expenseClaimsS3Key = `expense_claims/${expenseClaimsRelativeKey}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: expenseClaimsS3Key,
          Body: attachment.buffer,
          ContentType: attachment.contentType,
        })
      );
      console.log(`[DocForward] Uploaded to S3 expense_claims: ${expenseClaimsS3Key}`);

      // Generate pre-signed URL for Convex to download (Convex can't use AWS SDK)
      const presignedUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: S3_BUCKET, Key: s3StagingKey }),
        { expiresIn: 300 } // 5 minutes
      );
      console.log(`[DocForward] Generated pre-signed URL for Convex download`);

      // Normalize MIME type
      let mimeType: "application/pdf" | "image/jpeg" | "image/png";
      if (attachment.contentType.includes("pdf")) {
        mimeType = "application/pdf";
      } else if (attachment.contentType.includes("png")) {
        mimeType = "image/png";
      } else {
        mimeType = "image/jpeg";
      }

      // Classify document with Gemini BEFORE creating inbox entry
      // (uses raw buffer — no need to fetch from Convex storage URL)
      console.log(`[DocForward] Classifying document...`);
      const classification = await classifyDocument(
        attachment.buffer,
        attachment.filename,
        attachment.contentType
      );
      console.log(
        `[DocForward] Classification: ${classification.type} (${classification.confidence}) - ${classification.reasoning}`
      );

      // Create inbox entry via Convex (pass pre-signed URL instead of bucket/key)
      const result = await createInboxEntry({
        presignedUrl,
        originalFilename: attachment.filename,
        mimeType,
        businessId: businessConfig.businessId,
        userId: senderUserId,
        s3StagingKey,
        s3ExpenseClaimsKey: expenseClaimsRelativeKey,
        emailMetadata,
      });

      console.log(`[DocForward] Inbox entry created: ${result.inboxEntryId} (hash=${result.fileHash}, size=${result.fileSizeBytes})`);

      // High confidence → auto-route directly to expense claims / invoices
      if (classification.confidence >= AUTO_ROUTE_THRESHOLD && classification.type !== "unknown") {
        console.log(
          `[DocForward] Auto-routing: ${classification.type} (${classification.confidence}) — creating record directly`
        );

        try {
          const autoRouteResult = await fetch(`${CONVEX_URL}/api/mutation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: "functions/documentInbox:autoRouteDocument",
              args: {
                inboxEntryId: result.inboxEntryId,
                classifiedType: classification.type,
                aiConfidence: classification.confidence,
                aiReasoning: classification.reasoning,
              },
              format: "json",
            }),
          });

          const autoRouteData = await autoRouteResult.json();

          if (autoRouteData.value?.success && autoRouteData.value?.destinationRecordId) {
            console.log(`[DocForward] Auto-routed to ${autoRouteData.value.destinationDomain}: ${autoRouteData.value.destinationRecordId}`);

            // For receipts, trigger OCR via document processor Lambda
            if (classification.type === "receipt") {
              const docProcessorArn = process.env.DOCUMENT_PROCESSOR_LAMBDA_ARN;
              if (docProcessorArn) {
                try {
                  await lambdaClient.send(new InvokeCommand({
                    FunctionName: docProcessorArn,
                    InvocationType: "Event", // Async — fire and forget
                    Payload: JSON.stringify({
                      documentId: String(autoRouteData.value.destinationRecordId),
                      domain: "expense_claims",
                      storagePath: expenseClaimsRelativeKey,
                      fileType: mimeType === "application/pdf" ? "pdf" : "image",
                      userId: senderUserId,
                      businessId: businessConfig.businessId,
                      idempotencyKey: `email-fwd-auto-${result.inboxEntryId}-${Date.now()}`,
                      expectedDocumentType: "receipt",
                    }),
                  }));
                  console.log(`[DocForward] OCR Lambda triggered for auto-routed receipt`);
                } catch (ocrErr) {
                  console.log(`[DocForward] OCR trigger failed (non-fatal): ${ocrErr}`);
                }
              }
            }
          } else {
            console.log(`[DocForward] Auto-route mutation failed, falling back to needs_review`);
            // Fall back to needs_review
            await fetch(`${CONVEX_URL}/api/mutation`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                path: "functions/documentInbox:updateInboxStatus",
                args: {
                  inboxEntryId: result.inboxEntryId,
                  status: "needs_review",
                  aiDetectedType: classification.type,
                  aiConfidence: classification.confidence,
                  aiReasoning: classification.reasoning,
                },
                format: "json",
              }),
            });
          }
        } catch (autoRouteErr) {
          console.log(`[DocForward] Auto-route error: ${autoRouteErr} — falling back to needs_review`);
          await fetch(`${CONVEX_URL}/api/mutation`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: "functions/documentInbox:updateInboxStatus",
              args: {
                inboxEntryId: result.inboxEntryId,
                status: "needs_review",
                aiDetectedType: classification.type,
                aiConfidence: classification.confidence,
                aiReasoning: classification.reasoning,
              },
              format: "json",
            }),
          });
        }
      } else {
        // Low confidence or unknown → inbox for manual classification
        console.log(`[DocForward] Low confidence (${classification.confidence}) — in inbox for manual classification`);
        await fetch(`${CONVEX_URL}/api/mutation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: "functions/documentInbox:updateInboxStatus",
            args: {
              inboxEntryId: result.inboxEntryId,
              status: "needs_review",
              aiDetectedType: classification.type,
              aiConfidence: classification.confidence,
              aiReasoning: classification.reasoning,
            },
            format: "json",
          }),
        });
      }
    } catch (error) {
      console.log(`[DocForward] Failed to process ${attachment.filename}: ${error}`);
    }
  }

  console.log(`[DocForward] Completed processing ${attachments.length} attachments`);
}

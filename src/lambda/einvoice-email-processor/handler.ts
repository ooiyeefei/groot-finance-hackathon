/**
 * E-Invoice Email Processor Lambda (019-lhdn-einv-flow-2)
 *
 * Processes incoming merchant e-invoice emails received via AWS SES.
 * Uses Gemini Flash to classify emails and extract e-invoice data.
 *
 * Email types handled:
 * - Type A: E-invoice with PDF attachment → extract PDF, attach to claim
 * - Type B: Confirmation "submission received" → log, don't mark as received
 * - Type C: E-invoice in HTML body (no PDF) → save HTML, extract data with LLM
 * - Type D: Download link in email → save link for manual download
 *
 * Flow:
 * 1. SES receives email → S3 + triggers this Lambda
 * 2. Parse emailRef from To: address (einvoice+{ref}@einv.hellogroot.com)
 * 3. Query Convex for matching expense claim
 * 4. Gemini Flash classifies email type (einvoice vs confirmation)
 * 5. Extract PDF/HTML/link based on classification
 * 6. Save to S3 + update Convex claim status
 */

import { S3Client, GetObjectCommand, CopyObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { simpleParser, ParsedMail } from "mailparser";
import { Readable } from "stream";
import { handleDocumentForwarding, parseBusinessPrefix } from "./document-forward-handler";

// ── Types ──────────────────────────────────────────────────

interface SESEvent {
  Records: Array<{
    eventSource: string;
    ses: {
      mail: {
        messageId: string;
        source: string;
        destination: string[];
        commonHeaders: { from: string[]; to: string[]; subject: string };
      };
      receipt: {
        action: { type: string; bucketName: string; objectKey: string };
      };
    };
  }>;
}

interface ClaimDetails {
  claimId: string;
  businessId: string;
  userId: string;
  userEmail: string | null;
  storagePath: string;
}

type EmailClassification =
  | "einvoice_with_pdf"        // Has PDF attachment — extract and attach
  | "einvoice_in_html"         // E-invoice data in email body (no PDF)
  | "einvoice_download_link"   // Email contains a link to download the e-invoice
  | "confirmation_only"        // Just a "submission received" confirmation
  | "otp_tac"                  // OTP/TAC verification code email — not an e-invoice
  | "unknown";

interface ClassificationResult {
  type: EmailClassification;
  confidence: number;          // 0-1
  reasoning: string;
  downloadUrl?: string;        // For einvoice_download_link type
}

// ── Clients ────────────────────────────────────────────────

const s3 = new S3Client({ region: process.env.AWS_REGION || "us-west-2" });
const ses = new SESClient({ region: process.env.AWS_REGION || "us-west-2" });
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || "us-west-2" });
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "";
const S3_BUCKET = process.env.S3_BUCKET_NAME || "finanseal-bucket";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const FORWARD_FROM = "noreply@notifications.hellogroot.com";
const FORM_FILL_LAMBDA_ARN = process.env.EINVOICE_FORM_FILL_LAMBDA_ARN || "";

// ── HTTP helpers ───────────────────────────────────────────

async function convexQuery(path: string, args: Record<string, unknown>): Promise<unknown> {
  const r = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  if (!r.ok) throw new Error(`Convex query: ${r.status}`);
  const result = await r.json();
  if (result.status === "error") throw new Error(`Convex: ${result.errorMessage}`);
  return result.value;
}

async function convexMutation(path: string, args: Record<string, unknown>): Promise<unknown> {
  const r = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  if (!r.ok) throw new Error(`Convex mutation: ${r.status}`);
  const result = await r.json();
  if (result.status === "error") throw new Error(`Convex: ${result.errorMessage}`);
  return result.value;
}

// ── S3 helpers ─────────────────────────────────────────────

async function downloadFromS3(bucket: string, key: string): Promise<Buffer> {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as Readable) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function uploadToS3(key: string, body: Buffer, contentType: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
}

async function copyInS3(sourceKey: string, sourceBucket: string, destKey: string): Promise<void> {
  await s3.send(new CopyObjectCommand({ Bucket: S3_BUCKET, CopySource: `${sourceBucket}/${sourceKey}`, Key: destKey }));
}

// ── Merchant slug detection from email address ─────────────

/** Map account-level email local parts to merchant slugs */
const ACCOUNT_EMAIL_SLUGS: Record<string, string> = {
  "einvoice": "vizmyinvoice",          // einvoice@einv.hellogroot.com → vizmyinvoice
  "otp.7eleven": "7eleven",            // otp.7eleven@einv.hellogroot.com → 7eleven
};

function detectMerchantSlug(toAddress: string): string | null {
  const match = toAddress.match(/^([^@+]+)@einv\.hellogroot\.com$/i);
  if (!match) return null;
  const localPart = match[1].toLowerCase();
  return ACCOUNT_EMAIL_SLUGS[localPart] || null;
}

// ── Email parsing ──────────────────────────────────────────

function parseEmailRef(toAddress: string): string | null {
  // Match both formats: einvoice+ref@ (plus addressing) and einvoice.ref@ (dot format for 99SM etc.)
  const match = toAddress.match(/einvoice[+.]([^@]+)@/i);
  return match ? match[1] : null;
}

/** Extract receipt-related data from email body using regex (no LLM). */
function extractReceiptSignals(textBody: string): {
  receiptNumber: string | null;
  totalAmount: number | null;
  transactionDate: string | null;
} {
  // Receipt/invoice numbers: common patterns like "INV-123456", "A051-633814", "Receipt No: 12345"
  let receiptNumber: string | null = null;
  const refPatterns = [
    /(?:receipt|invoice|inv|ref|no\.?|number)[^a-z0-9]{0,10}([A-Z0-9][\w-]{3,20})/i,
    /([A-Z]{1,5}[\-\/]\d{4,10})/,  // A051-633814, INV/20240301
  ];
  for (const pat of refPatterns) {
    const m = textBody.match(pat);
    if (m) { receiptNumber = m[1]; break; }
  }

  // Amount: RM 12.50, MYR 1,234.56, Total: 45.00
  let totalAmount: number | null = null;
  const amtMatch = textBody.match(/(?:total|amount|rm|myr)[^0-9]{0,10}([\d,]+\.\d{2})/i);
  if (amtMatch) {
    totalAmount = parseFloat(amtMatch[1].replace(/,/g, ""));
  }

  // Date: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
  let transactionDate: string | null = null;
  const dateMatch = textBody.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (dateMatch) {
    const [, a, b, year] = dateMatch;
    // If first number > 12, it's DD/MM/YYYY; otherwise ambiguous, assume DD/MM/YYYY (Malaysian format)
    transactionDate = `${year}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
  } else {
    const isoMatch = textBody.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) transactionDate = isoMatch[0];
  }

  return { receiptNumber, totalAmount, transactionDate };
}

function findPdfAttachment(parsed: ParsedMail): { filename: string; content: Buffer } | null {
  if (!parsed.attachments?.length) return null;
  const pdf = parsed.attachments.find(
    (a) => a.contentType === "application/pdf" || a.filename?.toLowerCase().endsWith(".pdf")
  );
  if (pdf) return { filename: pdf.filename || "einvoice.pdf", content: pdf.content };
  // XML e-invoice (UBL format used by some merchants)
  const xml = parsed.attachments.find(
    (a) => a.contentType?.includes("xml") || a.filename?.toLowerCase().endsWith(".xml")
  );
  if (xml) return { filename: xml.filename || "einvoice.xml", content: xml.content };
  return null;
}

// ── Gemini Flash classification ────────────────────────────

async function classifyEmail(subject: string, from: string, textBody: string, hasAttachment: boolean): Promise<ClassificationResult> {
  if (!GEMINI_KEY) {
    // Fallback: simple heuristic if no Gemini key
    if (hasAttachment) return { type: "einvoice_with_pdf", confidence: 0.8, reasoning: "Has attachment (no LLM)" };
    return { type: "unknown", confidence: 0.3, reasoning: "No Gemini key for classification" };
  }

  const prompt = `Classify this merchant e-invoice email. This email was sent by a merchant to a buyer who requested an e-invoice for a purchase.

FROM: ${from}
SUBJECT: ${subject}
HAS ATTACHMENT: ${hasAttachment ? "Yes (PDF/XML)" : "No"}
BODY (first 2000 chars):
${textBody.substring(0, 2000)}

Classify as ONE of:
- "einvoice_with_pdf": Email has a PDF/XML attachment containing the actual e-invoice document
- "einvoice_in_html": The e-invoice data (invoice number, amounts, tax details) is embedded in the email body itself (no separate attachment)
- "einvoice_download_link": Email contains a link/URL to download the e-invoice (e.g. "Click here to download your e-invoice")
- "confirmation_only": Just a confirmation that the e-invoice request was received/being processed — no actual invoice yet
- "otp_tac": OTP/TAC verification code email — contains a one-time password for form verification, NOT an e-invoice. Look for keywords like OTP, TAC, verification code, one-time password, and a 4-8 digit code.
- "unknown": Can't determine

Also check: does the email body contain a download URL for the e-invoice? If yes, extract it.

Respond in JSON only:
{"type":"...","confidence":0.9,"reasoning":"brief explanation","downloadUrl":"url or null"}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.0, maxOutputTokens: 512 },
      }),
    });

    if (!r.ok) throw new Error(`Gemini: ${r.status}`);
    const result = await r.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        type: parsed.type || "unknown",
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || "",
        downloadUrl: parsed.downloadUrl || undefined,
      };
    }
  } catch (e) {
    console.log(`[Email Classify] Gemini failed: ${e}`);
  }

  // Fallback heuristic
  if (hasAttachment) return { type: "einvoice_with_pdf", confidence: 0.7, reasoning: "Fallback: has attachment" };
  const lower = textBody.toLowerCase();
  if (/\b(otp|tac|one.time\s+password|verification\s+code)\b/.test(lower) && /\b\d{4,8}\b/.test(textBody)) {
    return { type: "otp_tac", confidence: 0.8, reasoning: "Fallback: OTP/TAC keywords + digit code" };
  }
  if (lower.includes("download") && lower.includes("invoice")) {
    return { type: "einvoice_download_link", confidence: 0.6, reasoning: "Fallback: mentions download + invoice" };
  }
  if (lower.includes("received") || lower.includes("submitted") || lower.includes("processing")) {
    return { type: "confirmation_only", confidence: 0.6, reasoning: "Fallback: confirmation keywords" };
  }
  return { type: "unknown", confidence: 0.3, reasoning: "Fallback: no clear signals" };
}

// ── Handler ────────────────────────────────────────────────

export async function handler(event: SESEvent) {
  const startTime = Date.now();

  for (const record of event.Records) {
    const ses = record.ses;
    const messageId = ses.mail.messageId;
    const toAddresses = ses.mail.destination;
    const fromAddress = ses.mail.source;
    const subject = ses.mail.commonHeaders.subject;

    // SES S3 action stores to: s3://{S3_BUCKET}/ses-emails/einvoice/{messageId}
    // The Lambda action event doesn't carry the S3 action's bucket/key — construct from known prefix
    const rawEmailBucket = S3_BUCKET;
    const rawEmailKey = `ses-emails/einvoice/${messageId}`;

    console.log(`[Email] Processing: ${messageId} from ${fromAddress} subject="${subject}"`);

    // ===================================================================
    // FEATURE: Document Forwarding (001-doc-email-forward)
    // Check if this is a document forwarding email (inbox@{prefix}.hellogroot.com)
    // If yes, route to document forwarding handler and skip e-invoice processing
    // ===================================================================
    let isDocumentForwarding = false;
    for (const addr of toAddresses) {
      if (parseBusinessPrefix(addr)) {
        isDocumentForwarding = true;
        console.log(`[Email] Detected document forwarding email: ${addr}`);

        // Download raw email from S3
        const rawEmailBytes = await downloadFromS3(rawEmailBucket, rawEmailKey);

        // Route to document forwarding handler
        await handleDocumentForwarding(
          rawEmailBytes,
          addr,
          fromAddress,
          subject,
          messageId
        );

        break;
      }
    }

    // Skip rest of handler if this was a document forwarding email
    if (isDocumentForwarding) {
      console.log(`[Email] Document forwarding complete: ${messageId}`);
      continue;
    }

    // 1. Find einvoice+ address (direct ref matching)
    let emailRef: string | null = null;
    for (const addr of toAddresses) {
      emailRef = parseEmailRef(addr);
      if (emailRef) break;
    }

    let claimDetails: ClaimDetails | null = null;
    let matchMethod: "emailRef" | "fuzzyMatch" = "emailRef";
    let cachedRawEmail: Buffer | null = null;

    if (emailRef) {
      console.log(`[Email] emailRef: ${emailRef}`);
      claimDetails = await convexQuery(
        "functions/system:getClaimByEmailRef", { emailRef }
      ) as ClaimDetails | null;
    }

    // 2. Fallback: account-level email → fuzzy match by receipt data
    if (!claimDetails) {
      let merchantSlug: string | null = null;
      for (const addr of toAddresses) {
        merchantSlug = detectMerchantSlug(addr);
        if (merchantSlug) break;
      }

      if (!merchantSlug) {
        console.log(`[Email] No einvoice+ ref and no known account email in: ${toAddresses.join(", ")}`);
        continue;
      }

      console.log(`[Email] Account-level email detected, merchantSlug=${merchantSlug} — trying fuzzy match`);

      // Download email early to extract receipt signals for matching (cached for later)
      cachedRawEmail = await downloadFromS3(rawEmailBucket, rawEmailKey);
      const parsedForMatch = await simpleParser(cachedRawEmail);
      const matchBody = parsedForMatch.text || "";
      const signals = extractReceiptSignals(matchBody);
      console.log(`[Email] Extracted signals: receipt=${signals.receiptNumber}, amount=${signals.totalAmount}, date=${signals.transactionDate}`);

      claimDetails = await convexQuery(
        "functions/system:getClaimByFuzzyMatch", {
          merchantSlug,
          receiptNumber: signals.receiptNumber || undefined,
          totalAmount: signals.totalAmount ?? undefined,
          transactionDate: signals.transactionDate || undefined,
          emailBody: matchBody.substring(0, 5000),
        }
      ) as ClaimDetails | null;

      if (claimDetails) {
        matchMethod = "fuzzyMatch";
        // Generate a synthetic emailRef for downstream processing
        emailRef = `fuzzy-${merchantSlug}-${Date.now()}`;
      }
    }

    if (!claimDetails) {
      console.log(`[Email] No claim found (ref=${emailRef || "none"}, fuzzy attempted)`);
      continue;
    }
    const { claimId, businessId, userId, storagePath } = claimDetails;
    console.log(`[Email] Matched claim ${claimId} (biz: ${businessId}) via ${matchMethod}`);

    // 3. Download and parse email (use cached version if already downloaded for fuzzy matching)
    const rawEmailBytes = cachedRawEmail || await downloadFromS3(rawEmailBucket, rawEmailKey);
    const parsed = await simpleParser(rawEmailBytes);
    const textBody = parsed.text || "";
    const htmlBody = parsed.html || "";
    const attachment = findPdfAttachment(parsed);
    const timestamp = Date.now();

    // 4. Classify email with Gemini Flash
    const classification = await classifyEmail(subject, fromAddress, textBody, !!attachment);
    console.log(`[Email] Classification: ${classification.type} (${classification.confidence}) — ${classification.reasoning}`);

    // 5. Save raw email (with timestamp to avoid overwriting)
    const einvoicePrefix = `expense_claims/${storagePath}/einvoice`;
    await copyInS3(rawEmailKey, rawEmailBucket, `${einvoicePrefix}/${timestamp}-raw-email.eml`);

    // 6. Process based on classification
    let einvoiceStoragePath: string | null = null;

    if (classification.type === "einvoice_with_pdf" && attachment) {
      // Type A: PDF/XML attachment → save it
      const s3Key = `${einvoicePrefix}/${attachment.filename}`;
      const contentType = attachment.filename.toLowerCase().endsWith(".pdf") ? "application/pdf"
        : attachment.filename.toLowerCase().endsWith(".xml") ? "application/xml"
        : "application/octet-stream";
      await uploadToS3(s3Key, attachment.content, contentType);
      einvoiceStoragePath = `${storagePath}/einvoice/${attachment.filename}`;
      console.log(`[Email] Saved e-invoice PDF: ${s3Key} (${attachment.content.length} bytes)`);

    } else if (classification.type === "einvoice_in_html") {
      // Type C: E-invoice data in HTML body → save HTML
      if (htmlBody) {
        const htmlBuffer = Buffer.from(htmlBody, "utf-8");
        await uploadToS3(`${einvoicePrefix}/einvoice-email.html`, htmlBuffer, "text/html");
        einvoiceStoragePath = `${storagePath}/einvoice/einvoice-email.html`;
        console.log(`[Email] Saved HTML e-invoice: ${einvoicePrefix}/einvoice-email.html`);
      }

    } else if (classification.type === "einvoice_download_link" && classification.downloadUrl) {
      // Type D: Download link → fetch e-invoice data or PDF
      console.log(`[Email] E-invoice download link: ${classification.downloadUrl}`);

      let downloaded = false;

      // Step 1: Try direct fetch — works for merchants serving PDFs directly
      try {
        const dlRes = await fetch(classification.downloadUrl, {
          redirect: "follow",
          headers: { "User-Agent": "Mozilla/5.0 GrootFinance/1.0" },
        });
        const contentType = dlRes.headers.get("content-type") || "";

        if (contentType.includes("application/pdf")) {
          const pdfBuffer = Buffer.from(await dlRes.arrayBuffer());
          const pdfFilename = `einvoice-${emailRef}.pdf`;
          await uploadToS3(`${einvoicePrefix}/${pdfFilename}`, pdfBuffer, "application/pdf");
          einvoiceStoragePath = `${storagePath}/einvoice/${pdfFilename}`;
          downloaded = true;
          console.log(`[Email] Downloaded PDF directly: ${pdfFilename} (${pdfBuffer.length} bytes)`);
        } else {
          console.log(`[Email] Direct fetch returned ${contentType} — trying API extraction`);
        }
      } catch (fetchErr) {
        console.log(`[Email] Direct fetch failed: ${fetchErr}`);
      }

      // Step 2: Invoke form-fill Lambda (Playwright) to render SPA and extract PDF
      if (!downloaded && FORM_FILL_LAMBDA_ARN) {
        try {
          console.log(`[Email] Invoking Playwright Lambda for PDF extraction`);
          const invokeRes = await lambdaClient.send(new InvokeCommand({
            FunctionName: FORM_FILL_LAMBDA_ARN,
            InvocationType: "RequestResponse",
            Payload: Buffer.from(JSON.stringify({
              action: "download-einvoice",
              downloadUrl: classification.downloadUrl,
              s3Key: `${einvoicePrefix}/einvoice-${emailRef}.pdf`,
              s3Bucket: S3_BUCKET,
            })),
          }));
          const result = JSON.parse(Buffer.from(invokeRes.Payload || []).toString());
          if (result?.success && result?.size > 1000) {
            einvoiceStoragePath = `${storagePath}/einvoice/einvoice-${emailRef}.pdf`;
            downloaded = true;
            console.log(`[Email] Playwright extracted PDF: ${result.size} bytes`);
          } else {
            console.log(`[Email] Playwright extraction failed: ${result?.error || `size=${result?.size}`}`);
          }
        } catch (lambdaErr) {
          console.log(`[Email] Lambda invoke failed: ${lambdaErr}`);
        }
      }

      // Step 3: Fallback — save the download link for manual access
      if (!downloaded) {
        const linkBuffer = Buffer.from(classification.downloadUrl, "utf-8");
        await uploadToS3(`${einvoicePrefix}/download-link.txt`, linkBuffer, "text/plain");
        console.log(`[Email] Saved download link as fallback`);
      }

    } else if (classification.type === "confirmation_only") {
      // Type B: Just a confirmation — log but don't mark as received
      console.log(`[Email] Confirmation only — not marking as received. Waiting for actual e-invoice.`);
      // Save for audit trail but don't update claim status
      await convexMutation("functions/system:processEinvoiceEmail", {
        claimId, emailRef, fromAddress, subject, messageId,
        einvoiceStoragePath: null,
        rawEmailStoragePath: `${storagePath}/einvoice/${timestamp}-raw-email.eml`,
        hasAttachment: false,
        emailType: "confirmation",
      });
      continue; // Don't mark as received

    } else if (classification.type === "otp_tac") {
      // Type E: OTP/TAC email — log but don't update claim status (not an e-invoice)
      // The OTP is consumed by the form-fill Lambda via S3 polling, not here
      console.log(`[Email] OTP/TAC email detected — not updating claim. OTP will be consumed by form-fill Lambda.`);
      continue; // Don't process further — raw email already saved to S3 by SES
    }

    // 7. Update Convex — mark claim as e-invoice received (for types A, C, D)
    await convexMutation("functions/system:processEinvoiceEmail", {
      claimId,
      emailRef,
      fromAddress,
      subject,
      messageId,
      einvoiceStoragePath,
      rawEmailStoragePath: `${storagePath}/einvoice/${timestamp}-raw-email.eml`,
      hasAttachment: !!attachment,
      emailType: classification.type,
    });

    // 8. Forward e-invoice email to user (non-fatal — SES if verified, Resend otherwise)
    if (claimDetails.userEmail && classification.type !== "confirmation_only") {
      try {
        // If we downloaded a PDF (e.g. via Playwright), read it from S3 to attach
        let forwardAttachment = attachment;
        if (!forwardAttachment && einvoiceStoragePath?.endsWith(".pdf")) {
          try {
            const pdfS3Key = `expense_claims/${einvoiceStoragePath}`;
            const pdfBuffer = await downloadFromS3(S3_BUCKET, pdfS3Key);
            forwardAttachment = { filename: `einvoice-${emailRef}.pdf`, content: pdfBuffer };
            console.log(`[Email] Attached downloaded PDF to forward (${pdfBuffer.length} bytes)`);
          } catch (pdfErr) {
            console.log(`[Email] Could not read PDF for forwarding: ${pdfErr}`);
          }
        }

        const verifyResult = await convexQuery(
          "functions/system:isSesEmailVerified", { email: claimDetails.userEmail }
        ) as { verified: boolean } | null;
        const useSes = verifyResult?.verified === true;

        await forwardToUser(rawEmailBytes, claimDetails.userEmail, subject, fromAddress, forwardAttachment, useSes);
        console.log(`[Email] Forwarded to ${claimDetails.userEmail} via ${useSes ? "SES" : "Resend"}`);
      } catch (e) {
        console.log(`[Email] Forward failed (non-fatal): ${e}`);
      }
    }

    console.log(`[Email] Done: ${messageId} → ${classification.type} for claim ${claimId}`);
  }

  console.log(`[Email] Processed ${event.Records.length} records in ${Date.now() - startTime}ms`);
}

// ── Forward e-invoice to user's email ──────────────────────

async function forwardToUser(
  rawEmailBytes: Buffer,
  userEmail: string,
  originalSubject: string,
  originalFrom: string,
  pdfAttachment: { filename: string; content: Buffer } | null | undefined,
  useSes: boolean,
): Promise<void> {
  const emailSubject = `[E-Invoice] ${originalSubject}`;
  const emailBody = `Your e-invoice has been received from ${originalFrom}.\nThis email is forwarded automatically by Groot Finance.\n\nOriginal subject: ${originalSubject}`;

  // Use SES if the user's email is verified (free, builds sending reputation)
  if (useSes) {
    const boundary = `----=_Part_${Date.now()}`;
    const parts = [
      `From: Groot Finance <${FORWARD_FROM}>`,
      `To: ${userEmail}`,
      `Subject: ${emailSubject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      emailBody,
      ``,
    ];

    // Attach the PDF (not the raw .eml which exposes internal system email/headers)
    if (pdfAttachment) {
      parts.push(
        `--${boundary}`,
        `Content-Type: application/pdf`,
        `Content-Transfer-Encoding: base64`,
        `Content-Disposition: attachment; filename="${pdfAttachment.filename}"`,
        ``,
        pdfAttachment.content.toString("base64"),
        ``,
      );
    }

    parts.push(`--${boundary}--`);
    const forwardedEmail = parts.join("\r\n");

    await ses.send(new SendRawEmailCommand({
      RawMessage: { Data: Buffer.from(forwardedEmail) },
      Source: FORWARD_FROM,
      Destinations: [userEmail],
    }));
    console.log(`[Email] Forwarded via SES to ${userEmail}${pdfAttachment ? " (with PDF)" : ""}`);
    return;
  }

  // Fallback: Resend (works for any email, no SES verification needed)
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.log(`[Email] No RESEND_API_KEY — cannot forward`);
    return;
  }

  const attachments: Array<{ filename: string; content: string }> = [];

  // Attach PDF if available (more useful than raw .eml for the user)
  if (pdfAttachment) {
    attachments.push({
      filename: pdfAttachment.filename,
      content: pdfAttachment.content.toString("base64"),
    });
  }

  const resendPayload: Record<string, unknown> = {
    from: `Groot Finance <${FORWARD_FROM}>`,
    to: [userEmail],
    subject: emailSubject,
    text: emailBody,
  };
  if (attachments.length > 0) {
    resendPayload.attachments = attachments;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(resendPayload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Resend ${response.status}: ${err}`);
  }
  console.log(`[Email] Forwarded via Resend to ${userEmail}`);
}

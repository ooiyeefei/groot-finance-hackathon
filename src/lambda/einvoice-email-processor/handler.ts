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
import { simpleParser, ParsedMail } from "mailparser";
import { Readable } from "stream";

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
  storagePath: string;
}

type EmailClassification =
  | "einvoice_with_pdf"        // Has PDF attachment — extract and attach
  | "einvoice_in_html"         // E-invoice data in email body (no PDF)
  | "einvoice_download_link"   // Email contains a link to download the e-invoice
  | "confirmation_only"        // Just a "submission received" confirmation
  | "unknown";

interface ClassificationResult {
  type: EmailClassification;
  confidence: number;          // 0-1
  reasoning: string;
  downloadUrl?: string;        // For einvoice_download_link type
}

// ── Clients ────────────────────────────────────────────────

const s3 = new S3Client({ region: process.env.AWS_REGION || "us-west-2" });
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "";
const S3_BUCKET = process.env.S3_BUCKET_NAME || "finanseal-bucket";
const GEMINI_KEY = process.env.GEMINI_API_KEY || "";

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

// ── Email parsing ──────────────────────────────────────────

function parseEmailRef(toAddress: string): string | null {
  const match = toAddress.match(/einvoice\+([^@]+)@/i);
  return match ? match[1] : null;
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

    // 1. Find einvoice+ address
    let emailRef: string | null = null;
    for (const addr of toAddresses) {
      emailRef = parseEmailRef(addr);
      if (emailRef) break;
    }
    if (!emailRef) {
      console.log(`[Email] No einvoice+ address in: ${toAddresses.join(", ")}`);
      continue;
    }
    console.log(`[Email] emailRef: ${emailRef}`);

    // 2. Look up expense claim
    const claimDetails = await convexQuery(
      "functions/system:getClaimByEmailRef", { emailRef }
    ) as ClaimDetails | null;

    if (!claimDetails) {
      console.log(`[Email] No claim found for emailRef: ${emailRef}`);
      continue;
    }
    const { claimId, businessId, userId, storagePath } = claimDetails;
    console.log(`[Email] Matched claim ${claimId} (biz: ${businessId})`);

    // 3. Download and parse email
    const rawEmailBytes = await downloadFromS3(rawEmailBucket, rawEmailKey);
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
      // Type D: Download link → save the URL for manual or automated download
      console.log(`[Email] E-invoice download link: ${classification.downloadUrl}`);
      // Save link as a text file for now — future: auto-download with Playwright
      const linkBuffer = Buffer.from(classification.downloadUrl, "utf-8");
      await uploadToS3(`${einvoicePrefix}/download-link.txt`, linkBuffer, "text/plain");

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

    console.log(`[Email] Done: ${messageId} → ${classification.type} for claim ${claimId}`);
  }

  console.log(`[Email] Processed ${event.Records.length} records in ${Date.now() - startTime}ms`);
}

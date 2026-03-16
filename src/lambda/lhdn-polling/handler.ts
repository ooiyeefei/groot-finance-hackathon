/**
 * LHDN Polling Lambda (019-lhdn-einv-flow-2)
 *
 * Fetches received e-invoice documents from LHDN MyInvois API
 * and passes them to Convex for matching + storage.
 *
 * Architecture:
 * - EventBridge triggers this Lambda every 5 minutes
 * - Lambda queries Convex for businesses with pending e-invoice requests
 * - For each business, Lambda reads their LHDN client secret from AWS SSM
 *   (credentials entered by user in business settings UI)
 * - Lambda authenticates with LHDN using per-business credentials
 * - Lambda fetches received documents with `onbehalfof` header
 * - Lambda parses raw UBL XML to extract buyer email
 * - Lambda calls Convex mutation with raw documents for matching
 * - Convex handles 4-tier matching, storage, and real-time UI updates
 *
 * Credential flow:
 * - User enters LHDN Client ID + Client Secret in business settings UI
 * - Client ID stored in Convex (lhdnClientId field on business record)
 * - Client Secret stored in SSM: /groot-finance/businesses/{businessId}/lhdn-client-secret
 *
 * Trigger modes:
 * - EventBridge (scheduled): polls ALL businesses with pending requests
 * - Direct invocation (PollEvent): polls a SINGLE specified business
 */

import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

// ============================================================
// Types
// ============================================================

/** Direct invocation: poll a specific business */
interface PollEvent {
  businessId: string;
  businessTin: string;
  lhdnClientId: string;
}

/** EventBridge scheduled event */
interface EventBridgeEvent {
  source: string;
  "detail-type": string;
  detail: Record<string, unknown>;
}

/** Business returned by Convex query */
interface BusinessToPoll {
  businessId: string;
  businessTin: string;
  lhdnClientId: string;
}

/** LHDN submission status response */
interface LhdnSubmissionStatusResponse {
  submissionUid: string;
  documentCount: number;
  overallStatus: string;
  documentSummary: Array<{
    uuid: string;
    submissionUid: string;
    longId?: string;
    internalId: string;
    status: "Valid" | "Invalid" | "Cancelled" | "Submitted";
    cancelDateTime?: string;
    rejectRequestDateTime?: string;
    documentStatusReason?: string;
  }>;
}

/** Invoice returned by status polling query */
interface IssuedInvoiceForPolling {
  _id: string;
  businessId: string;
  lhdnSubmissionId?: string;
  lhdnDocumentUuid?: string;
  lhdnStatus?: string;
  lhdnValidatedAt?: number;
  invoiceNumber: string;
  journalEntryId?: string;
}

interface LhdnDocument {
  uuid: string;
  submissionUID?: string;
  longId?: string;
  internalId?: string;
  supplierTin?: string;
  supplierName?: string;
  buyerTin?: string;
  total?: string;
  dateTimeIssued?: string;
  status?: string;
  buyerEmail?: string;
}

// ============================================================
// SSM Client (IAM-native, zero exported credentials)
// ============================================================

const ssmClient = new SSMClient({ region: process.env.AWS_REGION || "us-west-2" });

async function getLhdnClientSecret(businessId: string): Promise<string | null> {
  try {
    const result = await ssmClient.send(new GetParameterCommand({
      Name: `/groot-finance/businesses/${businessId}/lhdn-client-secret`,
      WithDecryption: true,
    }));
    return result.Parameter?.Value || null;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "ParameterNotFound") {
      return null;
    }
    console.error(`[LHDN Polling] SSM fetch failed for business ${businessId}:`, error);
    return null;
  }
}

// ============================================================
// Convex HTTP Client
// ============================================================

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "";

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
// LHDN API Client
// ============================================================

const LHDN_BASE_URL = process.env.LHDN_API_BASE_URL || "https://preprod-api.myinvois.hasil.gov.my";

async function authenticateLhdn(clientId: string, clientSecret: string): Promise<string> {
  const response = await fetch(`${LHDN_BASE_URL}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: "InvoicingAPI",
    }),
  });

  if (!response.ok) {
    throw new Error(`LHDN auth failed: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function fetchReceivedDocuments(accessToken: string, businessTin: string): Promise<LhdnDocument[]> {
  const response = await fetch(
    `${LHDN_BASE_URL}/api/v1.0/documents/recent?pageSize=100&InvoiceDirection=Received`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        onbehalfof: businessTin,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`LHDN fetch received failed: ${response.status}`);
  }

  const data = await response.json();
  return data.result || [];
}

/**
 * Get the status of a submission and its documents from LHDN.
 */
async function getSubmissionStatus(
  accessToken: string,
  businessTin: string,
  submissionUid: string
): Promise<LhdnSubmissionStatusResponse> {
  const response = await fetch(
    `${LHDN_BASE_URL}/api/v1.0/documentsubmissions/${submissionUid}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        onbehalfof: businessTin,
      },
    }
  );

  if (!response.ok) {
    throw new Error(`LHDN getSubmissionStatus failed: ${response.status}`);
  }

  return response.json();
}

async function fetchBuyerEmail(
  accessToken: string,
  businessTin: string,
  documentUuid: string
): Promise<string | undefined> {
  try {
    const response = await fetch(
      `${LHDN_BASE_URL}/api/v1.0/documents/${documentUuid}/raw`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          onbehalfof: businessTin,
        },
      }
    );

    if (!response.ok) return undefined;

    const rawText = await response.text();
    const emailMatch = rawText.match(/<cbc:ElectronicMail>([^<]+)<\/cbc:ElectronicMail>/);
    return emailMatch?.[1];
  } catch {
    return undefined;
  }
}

// ============================================================
// Single-Business Polling
// ============================================================

async function pollBusiness(business: BusinessToPoll): Promise<{ documentsFound: number }> {
  const clientSecret = await getLhdnClientSecret(business.businessId);
  if (!clientSecret) {
    console.log(`[LHDN Polling] No client secret in SSM for business ${business.businessId}, skipping`);
    return { documentsFound: 0 };
  }

  const accessToken = await authenticateLhdn(business.lhdnClientId, clientSecret);
  console.log(`[LHDN Polling] Authenticated with LHDN for business ${business.businessId}`);

  const documents = await fetchReceivedDocuments(accessToken, business.businessTin);
  console.log(`[LHDN Polling] Found ${documents.length} received documents`);

  if (documents.length === 0) return { documentsFound: 0 };

  // Enrich with buyer email (fetch raw UBL for each)
  const enrichedDocs: LhdnDocument[] = [];
  for (const doc of documents) {
    const buyerEmail = await fetchBuyerEmail(accessToken, business.businessTin, doc.uuid);
    enrichedDocs.push({ ...doc, buyerEmail });
  }

  // Pass to Convex for matching + storage + notifications
  await convexMutation("functions/system:processLhdnReceivedDocuments", {
    businessId: business.businessId,
    documents: enrichedDocs.map((doc) => ({
      uuid: doc.uuid,
      submissionUID: doc.submissionUID,
      longId: doc.longId,
      internalId: doc.internalId,
      supplierTin: doc.supplierTin,
      supplierName: doc.supplierName,
      buyerTin: doc.buyerTin || business.businessTin,
      buyerEmail: doc.buyerEmail,
      total: doc.total ? parseFloat(doc.total) : undefined,
      dateTimeIssued: doc.dateTimeIssued,
      status: doc.status,
    })),
  });

  return { documentsFound: enrichedDocs.length };
}

// ============================================================
// Issued Invoice Status Polling (Buyer Rejection/Cancellation)
// ============================================================

/**
 * Poll LHDN for status changes on issued invoices (valid → rejected/cancelled).
 * Detects buyer rejections and cancellations within the 72-hour window.
 */
async function pollIssuedInvoiceStatuses(
  businessAuthCache: Map<string, { accessToken: string; businessTin: string; lhdnClientId: string }>
): Promise<{ statusChanges: number }> {
  // Get invoices in the 72-hour polling window
  const invoices = await convexQuery(
    "functions/salesInvoices:getIssuedInvoicesForStatusPolling",
    {}
  ) as IssuedInvoiceForPolling[];

  if (!invoices || invoices.length === 0) {
    console.log("[LHDN Polling] No issued invoices in 72-hour window for status polling");
    return { statusChanges: 0 };
  }

  console.log(`[LHDN Polling] Found ${invoices.length} issued invoices to poll for status changes`);

  // Group by business
  const byBusiness = new Map<string, IssuedInvoiceForPolling[]>();
  for (const inv of invoices) {
    const group = byBusiness.get(inv.businessId) ?? [];
    group.push(inv);
    byBusiness.set(inv.businessId, group);
  }

  let statusChanges = 0;

  for (const [businessId, businessInvoices] of byBusiness) {
    try {
      // Get or create auth for this business
      let auth = businessAuthCache.get(businessId);
      if (!auth) {
        // Need to look up business credentials
        const businesses = await convexQuery(
          "functions/system:getBusinessesForLhdnPolling",
          {}
        ) as BusinessToPoll[];

        const biz = businesses?.find((b) => b.businessId === businessId);
        if (!biz) {
          console.log(`[LHDN Polling] Business ${businessId} not found for status polling, skipping`);
          continue;
        }

        const clientSecret = await getLhdnClientSecret(businessId);
        if (!clientSecret) {
          console.log(`[LHDN Polling] No client secret for business ${businessId}, skipping status poll`);
          continue;
        }

        const accessToken = await authenticateLhdn(biz.lhdnClientId, clientSecret);
        auth = { accessToken, businessTin: biz.businessTin, lhdnClientId: biz.lhdnClientId };
        businessAuthCache.set(businessId, auth);
      }

      // Group invoices by submissionId to minimize API calls
      const bySubmission = new Map<string, IssuedInvoiceForPolling[]>();
      for (const inv of businessInvoices) {
        if (!inv.lhdnSubmissionId) continue;
        const group = bySubmission.get(inv.lhdnSubmissionId) ?? [];
        group.push(inv);
        bySubmission.set(inv.lhdnSubmissionId, group);
      }

      for (const [submissionId, submissionInvoices] of bySubmission) {
        try {
          const submissionStatus = await getSubmissionStatus(
            auth.accessToken,
            auth.businessTin,
            submissionId
          );

          // Check each document in the submission
          for (const docSummary of submissionStatus.documentSummary) {
            // Find matching invoice by documentUuid
            const matchingInvoice = submissionInvoices.find(
              (inv) => inv.lhdnDocumentUuid === docSummary.uuid
            );
            if (!matchingInvoice) continue;

            // Detect rejection
            if (docSummary.rejectRequestDateTime) {
              console.log(
                `[LHDN Polling] Detected rejection for invoice ${matchingInvoice.invoiceNumber} (UUID: ${docSummary.uuid})`
              );
              await convexMutation(
                "functions/salesInvoices:updateLhdnStatusFromPoll",
                {
                  invoiceId: matchingInvoice._id,
                  newStatus: "rejected",
                  reason: docSummary.documentStatusReason || "Rejected by buyer",
                  timestamp: new Date(docSummary.rejectRequestDateTime).getTime(),
                }
              );
              statusChanges++;
              continue;
            }

            // Detect cancellation (by buyer — invoice was previously "valid")
            if (docSummary.status === "Cancelled" && matchingInvoice.lhdnStatus === "valid") {
              console.log(
                `[LHDN Polling] Detected buyer cancellation for invoice ${matchingInvoice.invoiceNumber} (UUID: ${docSummary.uuid})`
              );
              await convexMutation(
                "functions/salesInvoices:updateLhdnStatusFromPoll",
                {
                  invoiceId: matchingInvoice._id,
                  newStatus: "cancelled_by_buyer",
                  reason: docSummary.documentStatusReason || "Cancelled by buyer",
                  timestamp: docSummary.cancelDateTime
                    ? new Date(docSummary.cancelDateTime).getTime()
                    : Date.now(),
                }
              );
              statusChanges++;
            }
          }
        } catch (error) {
          console.error(
            `[LHDN Polling] Failed to poll submission ${submissionId} for business ${businessId}:`,
            error
          );
        }
      }
    } catch (error) {
      console.error(
        `[LHDN Polling] Failed status polling for business ${businessId}:`,
        error
      );
    }
  }

  return { statusChanges };
}

// ============================================================
// Handler
// ============================================================

export async function handler(event: PollEvent | EventBridgeEvent) {
  const startTime = Date.now();

  // EventBridge events have "source": "aws.events"
  const isScheduledEvent = "source" in event && event.source === "aws.events";

  if (isScheduledEvent) {
    // ── EventBridge: discover businesses with pending requests from Convex ──
    console.log("[LHDN Polling] EventBridge scheduled: discovering businesses to poll");

    const businesses = await convexQuery(
      "functions/system:getBusinessesForLhdnPolling",
      {}
    ) as BusinessToPoll[];

    if (!businesses || businesses.length === 0) {
      console.log("[LHDN Polling] No businesses with pending requests, done");
      return { success: true, businessesPolled: 0, totalDocuments: 0 };
    }

    console.log(`[LHDN Polling] Found ${businesses.length} businesses with pending requests`);

    // ── Pass 1: Poll for received documents ──
    let totalDocs = 0;
    const businessAuthCache = new Map<string, { accessToken: string; businessTin: string; lhdnClientId: string }>();

    for (const biz of businesses) {
      try {
        const result = await pollBusiness(biz);
        totalDocs += result.documentsFound;
      } catch (error) {
        console.error(`[LHDN Polling] Failed for business ${biz.businessId}:`, error);
      }
    }

    // ── Pass 2: Poll issued invoice statuses for buyer rejections/cancellations ──
    let statusChanges = 0;
    try {
      const statusResult = await pollIssuedInvoiceStatuses(businessAuthCache);
      statusChanges = statusResult.statusChanges;
    } catch (error) {
      console.error("[LHDN Polling] Failed issued invoice status polling:", error);
    }

    const durationMs = Date.now() - startTime;
    console.log(`[LHDN Polling] EventBridge complete: ${businesses.length} businesses, ${totalDocs} docs, ${statusChanges} status changes, ${durationMs}ms`);
    return { success: true, businessesPolled: businesses.length, totalDocuments: totalDocs, statusChanges, durationMs };
  }

  // ── Direct invocation: poll a specific business ──
  const pollEvent = event as PollEvent;
  console.log(`[LHDN Polling] Direct invocation for business ${pollEvent.businessId} (TIN: ${pollEvent.businessTin})`);

  const result = await pollBusiness(pollEvent);
  const durationMs = Date.now() - startTime;

  console.log(`[LHDN Polling] Done in ${durationMs}ms: ${result.documentsFound} documents sent to Convex`);
  return { success: true, documentsFound: result.documentsFound, durationMs };
}

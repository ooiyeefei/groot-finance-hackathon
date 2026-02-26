/**
 * E-Invoice Form Fill Lambda (019-lhdn-einv-flow-2)
 *
 * Node.js Lambda that uses Stagehand + Browserbase to fill
 * merchant buyer-info forms with company details.
 *
 * Triggered by:
 * - Python document-processor Lambda (auto, after QR detection)
 * - Vercel API route (manual, user clicks "Request E-Invoice")
 *
 * Self-contained: creates request log, sets emailRef on claim,
 * fills form, reports result — all via Convex HTTP API.
 */

import { Stagehand } from "@browserbasehq/stagehand";

// ============================================================
// Types
// ============================================================

interface FormFillEvent {
  /** Merchant form URL from QR code */
  merchantFormUrl: string;
  /** Buyer company details */
  buyerDetails: {
    name: string;
    tin: string;
    brn: string;
    address: string;
    email: string;
    phone?: string;
  };
  /** Extracted receipt data (for reference number) */
  extractedData?: {
    referenceNumber?: string;
    vendorName?: string;
    amount?: number;
    date?: string;
  };
  /** Email ref token (derived from claim ID first 10 chars) */
  emailRef: string;
  /** Convex expense claim ID */
  expenseClaimId: string;
}

interface ConvexMutationResponse {
  status: string;
  value?: unknown;
  errorMessage?: string;
}

// ============================================================
// Convex HTTP Client (minimal)
// ============================================================

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "";

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
    throw new Error(`Convex HTTP error: ${response.status}`);
  }

  const result: ConvexMutationResponse = await response.json();
  if (result.status === "error") {
    throw new Error(`Convex mutation error: ${result.errorMessage}`);
  }

  return result.value;
}

// ============================================================
// Handler
// ============================================================

export async function handler(event: FormFillEvent): Promise<{
  success: boolean;
  error?: string;
  durationMs?: number;
}> {
  const startTime = Date.now();
  let browserbaseSessionId: string | undefined;

  console.log(
    `[E-Invoice Form Fill] Starting for claim ${event.expenseClaimId}, URL: ${event.merchantFormUrl.substring(0, 80)}...`
  );

  try {
    // Validate required env vars
    const apiKey = process.env.BROWSERBASE_API_KEY;
    const projectId = process.env.BROWSERBASE_PROJECT_ID;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || !projectId) {
      throw new Error("BROWSERBASE_API_KEY or BROWSERBASE_PROJECT_ID not configured");
    }
    if (!geminiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    // 1. Tell Convex we're starting (set emailRef + status on claim)
    await convexMutation("functions/system:reportEinvoiceFormFillResult", {
      expenseClaimId: event.expenseClaimId,
      emailRef: event.emailRef,
      merchantFormUrl: event.merchantFormUrl,
      status: "in_progress",
    });

    // 2. Create Browserbase session
    const sessionResponse = await fetch("https://api.browserbase.com/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bb-api-key": apiKey,
      },
      body: JSON.stringify({ projectId }),
    });

    if (!sessionResponse.ok) {
      throw new Error(`Failed to create Browserbase session: ${sessionResponse.status}`);
    }

    const session = await sessionResponse.json();
    browserbaseSessionId = session.id;
    console.log(`[E-Invoice Form Fill] Browserbase session: ${browserbaseSessionId}`);

    // 3. Initialize Stagehand
    const stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey,
      projectId,
      browserbaseSessionID: browserbaseSessionId,
      model: {
        modelName: "gemini-2.0-flash",
        apiKey: geminiKey,
      },
    });

    await stagehand.init();

    // 4. Navigate to merchant form
    await stagehand.act(`Navigate to ${event.merchantFormUrl}`);

    // 5. Fill form with buyer details + receipt reference
    const refNumber = event.extractedData?.referenceNumber;
    await stagehand.act(
      `Fill in the buyer information form with these details:
- Company Name: ${event.buyerDetails.name}
- TIN (Tax Identification Number): ${event.buyerDetails.tin}
- BRN (Business Registration Number): ${event.buyerDetails.brn}
- Address: ${event.buyerDetails.address}
- Email: ${event.buyerDetails.email}
${event.buyerDetails.phone ? `- Phone: ${event.buyerDetails.phone}` : ""}
${refNumber ? `- Invoice/Receipt Reference Number: ${refNumber}` : ""}
Then submit the form by clicking the submit button.`
    );

    // 6. Close session
    await stagehand.close();

    const durationMs = Date.now() - startTime;
    console.log(`[E-Invoice Form Fill] Success in ${durationMs}ms`);

    // 7. Report success to Convex
    await convexMutation("functions/system:reportEinvoiceFormFillResult", {
      expenseClaimId: event.expenseClaimId,
      emailRef: event.emailRef,
      status: "success",
      browserbaseSessionId,
      durationMs,
    });

    return { success: true, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[E-Invoice Form Fill] Failed in ${durationMs}ms: ${errorMessage}`);

    // Report failure to Convex
    try {
      await convexMutation("functions/system:reportEinvoiceFormFillResult", {
        expenseClaimId: event.expenseClaimId,
        emailRef: event.emailRef,
        status: "failed",
        errorMessage,
        browserbaseSessionId,
        durationMs,
      });
    } catch (convexError) {
      console.error(`[E-Invoice Form Fill] Failed to report to Convex: ${convexError}`);
    }

    return { success: false, error: errorMessage, durationMs };
  }
}

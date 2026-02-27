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

    // 2. Initialize Stagehand with Browserbase (let Stagehand manage session)
    const stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey,
      projectId,
      model: {
        modelName: "google/gemini-2.0-flash",
        apiKey: geminiKey,
      },
      browserbaseSessionCreateParams: {
        projectId: projectId!,
        browserSettings: {
          solveCaptchas: true,
          recordSession: true,
          viewport: { width: 1280, height: 900 },
        },
        userMetadata: {
          claimId: event.expenseClaimId,
          merchantUrl: event.merchantFormUrl.substring(0, 80),
        },
      },
    });

    await stagehand.init();
    browserbaseSessionId = stagehand.browserbaseSessionID;
    console.log(`[E-Invoice Form Fill] Session: ${browserbaseSessionId}`);
    console.log(`[E-Invoice Form Fill] Debug URL: ${stagehand.browserbaseDebugURL || "N/A"}`);

    // 3. Set up network + console logging
    const page = stagehand.context.pages()[0];
    const networkLogs: Array<{ method: string; url: string; status?: number }> = [];
    const consoleLogs: string[] = [];

    page.on("response", (resp) => {
      const url = resp.url();
      const status = resp.status();
      // Log form submission responses (POST/PUT, non-static)
      if (!url.includes(".js") && !url.includes(".css") && !url.includes(".png") && !url.includes(".ico")) {
        networkLogs.push({ method: resp.request().method(), url: url.substring(0, 150), status });
        if (resp.request().method() !== "GET") {
          console.log(`[E-Invoice Form Fill] Network: ${resp.request().method()} ${url.substring(0, 100)} → ${status}`);
        }
      }
    });

    page.on("console", (msg) => {
      const text = msg.text();
      consoleLogs.push(`[${msg.type()}] ${text.substring(0, 200)}`);
    });

    // 4. Navigate to merchant form
    const response = await page.goto(event.merchantFormUrl, { waitUntil: "networkidle", timeout: 30000 });
    console.log(`[E-Invoice Form Fill] Navigated to: ${page.url()}, status: ${response?.status()}`);

    // 5. Wait for page to fully load, then observe form structure
    await page.waitForTimeout(2000);
    const formFields = await stagehand.observe({
      instruction: "Find all form fields, input boxes, dropdowns, and submit buttons on this page",
    });
    console.log(`[E-Invoice Form Fill] Found ${formFields.length} form elements`);

    // 5. Fill form with buyer details
    const refNumber = event.extractedData?.referenceNumber;
    await stagehand.act(
      `Fill in the buyer information form with these details:
- Company Name / Buyer Name: ${event.buyerDetails.name}
- TIN (Tax Identification Number): ${event.buyerDetails.tin}
- BRN (Business Registration Number): ${event.buyerDetails.brn}
- Address: ${event.buyerDetails.address}
- Email: ${event.buyerDetails.email}
${event.buyerDetails.phone ? `- Phone: ${event.buyerDetails.phone}` : ""}
${refNumber ? `- Invoice/Receipt Reference Number: ${refNumber}` : ""}

Fill all matching fields. If a field doesn't exist, skip it.`
    );
    console.log(`[E-Invoice Form Fill] Form fields filled`);

    // 6. Take screenshot before submit
    const preSubmitScreenshot = await page.screenshot({ type: "jpeg", quality: 60 });
    console.log(`[E-Invoice Form Fill] Pre-submit screenshot: ${preSubmitScreenshot.length} bytes`);

    // 7. Submit the form
    await stagehand.act("Click the submit button to submit the form");
    console.log(`[E-Invoice Form Fill] Form submitted, waiting for response...`);

    // 8. Wait for page response and verify
    await page.waitForTimeout(3000);
    const postSubmitUrl = page.url();
    console.log(`[E-Invoice Form Fill] Post-submit URL: ${postSubmitUrl}`);

    const postSubmitScreenshot = await page.screenshot({ type: "jpeg", quality: 60 });
    console.log(`[E-Invoice Form Fill] Post-submit screenshot: ${postSubmitScreenshot.length} bytes`);

    const verification = await stagehand.extract({
      instruction: "Look at the current page. Is there a success/confirmation message, an error message, or is the form still showing? Describe what you see.",
      schema: {
        type: "object" as const,
        properties: {
          pageStatus: { type: "string", description: "One of: success, error, form_still_visible, unknown" },
          message: { type: "string", description: "The main message or text visible on the page" },
        },
        required: ["pageStatus", "message"],
      },
    });
    console.log(`[E-Invoice Form Fill] Verification: ${JSON.stringify(verification)}`);

    // 9. Log network + console summary
    const postRequests = networkLogs.filter((l) => l.method !== "GET");
    console.log(`[E-Invoice Form Fill] Network summary: ${networkLogs.length} total, ${postRequests.length} POST/PUT`);
    for (const req of postRequests) {
      console.log(`[E-Invoice Form Fill]   ${req.method} ${req.url} → ${req.status}`);
    }
    if (consoleLogs.length > 0) {
      console.log(`[E-Invoice Form Fill] Console logs (${consoleLogs.length}): ${consoleLogs.slice(-5).join(" | ")}`);
    }

    // 10. Close session
    await stagehand.close();

    const durationMs = Date.now() - startTime;
    const verificationStatus = (verification as any)?.pageStatus || "unknown";
    console.log(`[E-Invoice Form Fill] Completed in ${durationMs}ms, verification: ${verificationStatus}`);

    // 10. Report result to Convex
    await convexMutation("functions/system:reportEinvoiceFormFillResult", {
      expenseClaimId: event.expenseClaimId,
      emailRef: event.emailRef,
      status: verificationStatus === "error" ? "failed" : "success",
      browserbaseSessionId,
      durationMs,
    });

    return { success: true, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : `Unknown error: ${JSON.stringify(error)}`;
    console.error(`[E-Invoice Form Fill] Failed in ${durationMs}ms: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      console.error(`[E-Invoice Form Fill] Stack: ${error.stack.substring(0, 500)}`);
    }

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

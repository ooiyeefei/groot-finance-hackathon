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
    userName?: string; // User's personal name (for "Full Name" field)
    tin: string;
    brn: string;
    address: string;
    addressLine1?: string;
    city?: string;
    stateCode?: string;
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

    // 2. Create Browserbase session manually (more reliable than browserbaseSessionCreateParams)
    const sessionResponse = await fetch("https://api.browserbase.com/v1/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bb-api-key": apiKey,
      },
      body: JSON.stringify({
        projectId,
        browserSettings: {
          recordSession: true,
          viewport: { width: 1280, height: 900 },
        },
      }),
    });

    if (!sessionResponse.ok) {
      const body = await sessionResponse.text();
      throw new Error(`Browserbase session creation failed: ${sessionResponse.status} ${body.substring(0, 200)}`);
    }

    const session = await sessionResponse.json();
    browserbaseSessionId = session.id;
    console.log(`[E-Invoice Form Fill] Session: ${browserbaseSessionId}`);

    // 3. Initialize Stagehand with existing session
    const stagehand = new Stagehand({
      env: "BROWSERBASE",
      apiKey,
      projectId,
      browserbaseSessionID: browserbaseSessionId,
      model: {
        modelName: "google/gemini-2.0-flash",
        apiKey: geminiKey,
      },
    });

    await stagehand.init();
    console.log(`[E-Invoice Form Fill] Stagehand initialized, debug: ${stagehand.browserbaseDebugURL || "N/A"}`);

    // 3. Get page reference (Stagehand wraps Playwright — page.on events not supported)
    const page = stagehand.context.pages()[0];

    // 4. Navigate to merchant form
    const response = await page.goto(event.merchantFormUrl, { waitUntil: "networkidle", timeout: 30000 });
    console.log(`[E-Invoice Form Fill] Navigated to: ${page.url()}, status: ${response?.status()}`);

    // 5. Wait for page to fully load
    await page.waitForTimeout(3000);
    console.log(`[E-Invoice Form Fill] Page loaded, starting form fill`);

    const bd = event.buyerDetails;
    const userName = bd.userName || bd.name;
    const phone = bd.phone || "+60132201176";
    const phoneDigits = phone.replace(/[^0-9]/g, "").replace(/^60/, ""); // Strip +60 prefix
    const streetAddress = bd.addressLine1 || bd.address.split(",")[0] || bd.address;
    const city = bd.city || "";
    const stateCode = bd.stateCode || "";

    // 6. Fill form step by step (multiple act() calls for reliability)

    // Step A: Personal details section
    await stagehand.act(
      `Fill in the PERSONAL DETAILS section of this form:
- In the "Full Name (as per ID)" field, type: ${userName}
- In the "Email Address" field, type: ${bd.email}
- In the "Mobile Number" field, type: ${phoneDigits}
Do NOT click Submit yet. Do NOT change any other fields.`
    );
    console.log(`[E-Invoice Form Fill] Step A: Personal details filled (${userName}, ${bd.email})`);

    // Step B: Select "Company" claim type
    await stagehand.act(
      `In the "Claim as" section, click on "Company" to select it as the claim type. Do NOT click Submit.`
    );
    console.log(`[E-Invoice Form Fill] Step B: Company selected`);

    // Step C: Fill company details
    await stagehand.act(
      `Fill in the company fields that appeared after selecting Company:
- "Company Name" field: type ${bd.name}
- "Company ID - Business Registration Number (BRN)" field: type ${bd.brn}
- "Company Tax Identification Number (TIN)" field: type ${bd.tin}
- "Company Address" field: type ${streetAddress}
Do NOT click Submit yet.`
    );
    console.log(`[E-Invoice Form Fill] Step C: Company details (BRN: ${bd.brn}, TIN: ${bd.tin})`);

    // Step D: Select state and city dropdowns
    await stagehand.act(
      `Select the company location from dropdowns:
- Click the "Company State" dropdown and select "${stateCode || "Selangor"}" from the list
- After state is selected, click the "Company City" dropdown and select "${city || "Petaling Jaya"}" from the list
Do NOT click Submit yet.`
    );
    console.log(`[E-Invoice Form Fill] Step D: State/city (${stateCode}, ${city})`);

    // Step E: Accept terms and submit
    await stagehand.act(
      `Check the terms and conditions checkbox if not already checked, then click the "Submit" button to submit the form.`
    );
    console.log(`[E-Invoice Form Fill] Step E: Submitted`);

    // 7. Wait for page response
    await page.waitForTimeout(5000);
    const postSubmitUrl = page.url();
    console.log(`[E-Invoice Form Fill] Post-submit URL: ${postSubmitUrl}`);

    // 8. Check for validation errors — if found, try to fix and resubmit once
    const verification = await stagehand.extract({
      instruction: "Check the current page. Are there any red validation error messages visible (like 'is required' or 'doesn't have enough characters')? Or is there a success/thank you/confirmation message? Return the status and list any error messages.",
      schema: {
        type: "object" as const,
        properties: {
          pageStatus: { type: "string", description: "One of: success, validation_errors, error, form_still_visible, unknown" },
          message: { type: "string", description: "The success message or list of validation errors visible" },
        },
        required: ["pageStatus", "message"],
      },
    });
    console.log(`[E-Invoice Form Fill] Verification: ${JSON.stringify(verification)}`);

    // Retry: if validation errors, ask agent to fix them and resubmit
    const verStatus = (verification as any)?.pageStatus;
    if (verStatus === "validation_errors" || verStatus === "form_still_visible") {
      const errorMsg = (verification as any)?.message || "";
      console.log(`[E-Invoice Form Fill] Validation errors detected, attempting fix: ${errorMsg.substring(0, 200)}`);

      await stagehand.act(
        `The form has validation errors: ${errorMsg.substring(0, 300)}

Please fix these errors by filling in any empty required fields with these details:
- Full Name: ${userName}
- Email: ${bd.email}
- Phone: ${phoneDigits}
- Company Name: ${bd.name}
- BRN: ${bd.brn}
- TIN: ${bd.tin}
- Address: ${streetAddress}
- State: ${stateCode || "Selangor"}
- City: ${city || "Petaling Jaya"}

After fixing all errors, check the terms checkbox and click Submit again.`
      );
      console.log(`[E-Invoice Form Fill] Retry: fixed and resubmitted`);
      await page.waitForTimeout(5000);
    }

    // 9. Close session
    await stagehand.close();

    const durationMs = Date.now() - startTime;
    const verificationStatus = (verification as any)?.pageStatus || "unknown";
    console.log(`[E-Invoice Form Fill] Completed in ${durationMs}ms, verification: ${verificationStatus}`);

    // 10. Report result to Convex
    await convexMutation("functions/system:reportEinvoiceFormFillResult", {
      expenseClaimId: event.expenseClaimId,
      emailRef: event.emailRef,
      status: (verificationStatus === "error" || verificationStatus === "validation_errors") ? "failed" : "success",
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

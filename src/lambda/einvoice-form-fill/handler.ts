/**
 * E-Invoice Form Fill Lambda (019-lhdn-einv-flow-2)
 *
 * Node.js Lambda that uses Stagehand agent() + Browserbase to fill
 * merchant buyer-info forms with company details.
 *
 * Uses agent() (CUA mode) for autonomous multi-step form filling
 * instead of act() which is designed for single atomic actions.
 *
 * Triggered by:
 * - Python document-processor Lambda (auto, after QR detection)
 * - Vercel API route (manual, user clicks "Request E-Invoice")
 */

import { Stagehand } from "@browserbasehq/stagehand";

// ============================================================
// Types
// ============================================================

interface FormFillEvent {
  merchantFormUrl: string;
  buyerDetails: {
    name: string;
    userName?: string;
    tin: string;
    brn: string;
    address: string;
    addressLine1?: string;
    city?: string;
    stateCode?: string;
    email: string;
    phone?: string;
  };
  extractedData?: {
    referenceNumber?: string;
    vendorName?: string;
    amount?: number;
    date?: string;
  };
  emailRef: string;
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
    const apiKey = process.env.BROWSERBASE_API_KEY;
    const projectId = process.env.BROWSERBASE_PROJECT_ID;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || !projectId) {
      throw new Error("BROWSERBASE_API_KEY or BROWSERBASE_PROJECT_ID not configured");
    }
    if (!geminiKey) {
      throw new Error("GEMINI_API_KEY not configured");
    }

    // 1. Tell Convex we're starting
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

    // 3. Initialize Stagehand
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
    console.log(`[E-Invoice Form Fill] Stagehand initialized`);

    // 4. Navigate to merchant form
    const page = stagehand.context.pages()[0];
    const response = await page.goto(event.merchantFormUrl, { waitUntil: "networkidle", timeout: 30000 });
    console.log(`[E-Invoice Form Fill] Navigated to: ${page.url()}, status: ${response?.status()}`);
    await page.waitForTimeout(2000);

    // 5. Build buyer details for the agent instruction
    const bd = event.buyerDetails;
    const userName = bd.userName || bd.name;
    const phoneRaw = bd.phone || "+60132201176";
    const phoneLocal = phoneRaw.replace(/[^0-9]/g, "").replace(/^60/, "");
    const streetAddress = bd.addressLine1 || bd.address.split(",")[0] || bd.address;
    const city = bd.city || "Puchong";
    const state = bd.stateCode || "Selangor";

    console.log(`[E-Invoice Form Fill] Buyer: ${userName}, ${bd.email}, ${bd.tin}, BRN: ${bd.brn}`);

    // 6. Use agent() for autonomous multi-step form filling
    // agent() handles the entire workflow: identify fields, fill them, handle dropdowns,
    // check terms, submit, and verify — much more reliable than multiple act() calls
    const agent = stagehand.agent({
      model: {
        modelName: "google/gemini-2.0-flash",
        apiKey: geminiKey,
      },
      systemPrompt: `You are an expert at filling web forms accurately. You must fill EVERY required field before submitting.
When you encounter a phone number field with a country code selector already showing "+60" or "Malaysia", only type the local digits without the country code.
When you encounter dropdown/select fields, click them first to open the options list, then click the matching option.
Always check the terms/conditions checkbox before submitting.
After clicking Submit, wait and verify if the form was accepted or if there are validation errors. If there are errors, fix them and resubmit.`,
    });

    const agentResult = await agent.execute({
      instruction: `You are on a merchant e-invoice form. Fill out this form completely and submit it.

STEP 1 - PERSONAL DETAILS:
- "Full Name (as per ID)" or similar name field: ${userName}
- "Email Address" or email field: ${bd.email}
- "Mobile Number" or phone field: ${phoneLocal} (the country code +60 is already selected)

STEP 2 - CLAIM TYPE:
- Select "Company" (not "Individual") in the "Claim as" section

STEP 3 - COMPANY DETAILS (these fields appear after selecting Company):
- "Company Name": ${bd.name}
- "Company ID - Business Registration Number (BRN)": ${bd.brn}
- "Company Tax Identification Number (TIN)": ${bd.tin}
- "Company Address": ${streetAddress}
- "SST Registration Number": leave empty if not required

STEP 4 - LOCATION DROPDOWNS:
- "Company State" dropdown: select "${state}"
- "Company City" dropdown: select "${city}"

STEP 5 - SUBMIT:
- Check the terms and conditions checkbox
- Click the Submit button

STEP 6 - VERIFY:
- After submitting, check if there are any validation error messages
- If there are errors, fix them and submit again
- Report whether the form was submitted successfully`,
      maxSteps: 25,
    });

    console.log(`[E-Invoice Form Fill] Agent result: success=${agentResult.success}, actions=${agentResult.actions?.length || 0}`);
    console.log(`[E-Invoice Form Fill] Agent message: ${(agentResult as any).message?.substring(0, 300) || "N/A"}`);

    // 7. Close session
    await stagehand.close();

    const durationMs = Date.now() - startTime;
    const isSuccess = agentResult.success === true;
    console.log(`[E-Invoice Form Fill] Completed in ${durationMs}ms, success: ${isSuccess}`);

    // 8. Report result to Convex
    await convexMutation("functions/system:reportEinvoiceFormFillResult", {
      expenseClaimId: event.expenseClaimId,
      emailRef: event.emailRef,
      status: isSuccess ? "success" : "failed",
      browserbaseSessionId,
      durationMs,
    });

    return { success: isSuccess, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : `Unknown error: ${JSON.stringify(error)}`;
    console.error(`[E-Invoice Form Fill] Failed in ${durationMs}ms: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      console.error(`[E-Invoice Form Fill] Stack: ${error.stack.substring(0, 500)}`);
    }

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

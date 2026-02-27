/**
 * E-Invoice Form Fill Lambda (019-lhdn-einv-flow-2)
 *
 * Uses Gemini CUA (Computer Use Agent) + Browserbase for autonomous
 * form filling. No Stagehand dependency — direct Gemini API + Playwright.
 *
 * Architecture:
 * - Browserbase: cloud browser (session recording, CDP connection)
 * - Gemini 3 Flash: CUA model (sees screenshots, outputs UI actions)
 * - Playwright: executes actions in the browser via CDP
 * - This Lambda: orchestrates the agent loop
 */

import { chromium, type Browser, type Page } from "playwright-core";

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

interface GeminiAction {
  name: string;
  args: Record<string, any>;
}

// ============================================================
// Constants
// ============================================================

const SCREEN_WIDTH = 1280;
const SCREEN_HEIGHT = 900;
const MAX_TURNS = 30;
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "";

// ============================================================
// Convex HTTP Client
// ============================================================

async function convexMutation(
  functionPath: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(`${CONVEX_URL}/api/mutation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: functionPath, args, format: "json" }),
  });
  if (!response.ok) throw new Error(`Convex HTTP error: ${response.status}`);
  const result = await response.json();
  if (result.status === "error") throw new Error(`Convex: ${result.errorMessage}`);
  return result.value;
}

// ============================================================
// Gemini CUA API
// ============================================================

async function callGeminiCUA(
  geminiKey: string,
  contents: any[],
): Promise<any> {
  // Dedicated CUA model — purpose-built for computer use tasks
  const model = "gemini-2.5-computer-use-preview-10-2025";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

  const payload = {
    contents,
    tools: [{
      computerUse: {
        environment: "ENVIRONMENT_BROWSER",
      },
    }],
    generationConfig: {
      temperature: 0.0,
      maxOutputTokens: 8192,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${errorBody.substring(0, 300)}`);
  }

  return response.json();
}

// ============================================================
// Action Executor (Playwright)
// ============================================================

function denormalize(val: number, dimension: number): number {
  return Math.round((val / 1000) * dimension);
}

async function executeAction(page: Page, action: GeminiAction): Promise<void> {
  const { name, args } = action;

  switch (name) {
    case "click_at": {
      const x = denormalize(args.x, SCREEN_WIDTH);
      const y = denormalize(args.y, SCREEN_HEIGHT);
      await page.mouse.click(x, y);
      break;
    }
    case "type_text_at": {
      const x = denormalize(args.x, SCREEN_WIDTH);
      const y = denormalize(args.y, SCREEN_HEIGHT);
      await page.mouse.click(x, y);
      if (args.clear_before_typing !== false) {
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Backspace");
      }
      await page.keyboard.type(args.text || "", { delay: 30 });
      if (args.press_enter === true) {
        await page.keyboard.press("Enter");
      }
      break;
    }
    case "scroll_document": {
      const dir = args.direction || "down";
      const delta = dir === "down" ? 300 : dir === "up" ? -300 : 0;
      await page.mouse.wheel(0, delta);
      break;
    }
    case "scroll_at": {
      const sx = denormalize(args.x, SCREEN_WIDTH);
      const sy = denormalize(args.y, SCREEN_HEIGHT);
      await page.mouse.move(sx, sy);
      const magnitude = args.magnitude || 800;
      const scrollDelta = denormalize(magnitude, SCREEN_HEIGHT);
      const dir = args.direction || "down";
      await page.mouse.wheel(0, dir === "down" ? scrollDelta : -scrollDelta);
      break;
    }
    case "hover_at": {
      const hx = denormalize(args.x, SCREEN_WIDTH);
      const hy = denormalize(args.y, SCREEN_HEIGHT);
      await page.mouse.move(hx, hy);
      break;
    }
    case "key_combination": {
      await page.keyboard.press(args.keys || "");
      break;
    }
    case "navigate": {
      await page.goto(args.url, { waitUntil: "networkidle", timeout: 15000 });
      break;
    }
    case "go_back": {
      await page.goBack({ timeout: 10000 });
      break;
    }
    case "wait_5_seconds": {
      await new Promise((r) => setTimeout(r, 5000));
      break;
    }
    case "open_web_browser": {
      // Already open
      break;
    }
    default:
      console.log(`[Form Fill] Unknown action: ${name}, skipping`);
  }

  // Wait for page to settle after action
  try {
    await page.waitForLoadState("networkidle", { timeout: 3000 });
  } catch {
    // Timeout is fine — page may already be idle
  }
  await new Promise((r) => setTimeout(r, 500));
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
  let browser: Browser | undefined;

  console.log(
    `[Form Fill] Starting for claim ${event.expenseClaimId}, URL: ${event.merchantFormUrl.substring(0, 80)}...`
  );

  try {
    const apiKey = process.env.BROWSERBASE_API_KEY!;
    const projectId = process.env.BROWSERBASE_PROJECT_ID!;
    const geminiKey = process.env.GEMINI_API_KEY!;

    if (!apiKey || !projectId || !geminiKey) {
      throw new Error("Missing required env vars: BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID, GEMINI_API_KEY");
    }

    // 1. Report to Convex: starting
    await convexMutation("functions/system:reportEinvoiceFormFillResult", {
      expenseClaimId: event.expenseClaimId,
      emailRef: event.emailRef,
      merchantFormUrl: event.merchantFormUrl,
      status: "in_progress",
    });

    // 2. Create Browserbase session
    const sessionResp = await fetch("https://api.browserbase.com/v1/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bb-api-key": apiKey },
      body: JSON.stringify({
        projectId,
        browserSettings: { recordSession: true, viewport: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } },
      }),
    });
    if (!sessionResp.ok) {
      throw new Error(`Browserbase session failed: ${sessionResp.status} ${(await sessionResp.text()).substring(0, 200)}`);
    }
    const session = await sessionResp.json();
    browserbaseSessionId = session.id;
    console.log(`[Form Fill] Browserbase session: ${browserbaseSessionId}`);
    console.log(`[Form Fill] Recording: https://www.browserbase.com/sessions/${browserbaseSessionId}`);

    // 3. Connect Playwright via Browserbase WebSocket CDP
    const connectUrl = `wss://connect.browserbase.com?apiKey=${apiKey}&sessionId=${browserbaseSessionId}`;
    browser = await chromium.connectOverCDP(connectUrl);

    const contexts = browser.contexts();
    const context = contexts[0] || await browser.newContext();
    const pages = context.pages();
    const page = pages[0] || await context.newPage();

    // 4. Navigate to merchant form
    await page.goto(event.merchantFormUrl, { waitUntil: "networkidle", timeout: 30000 });
    console.log(`[Form Fill] Navigated to: ${page.url()}`);
    await new Promise((r) => setTimeout(r, 2000));

    // 4b. Pre-analyze form fields so we can tell the model what to expect
    let formFieldsSummary = "";
    try {
      const formInfo = await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('label, [class*="label"]'))
          .map(el => el.textContent?.trim())
          .filter(Boolean)
          .slice(0, 30);
        const inputCount = document.querySelectorAll('input:not([type="hidden"]), select, textarea').length;
        return { labels, inputCount };
      });
      formFieldsSummary = `\n\nFORM ANALYSIS: This form has ${formInfo.inputCount} input fields. Field labels found: ${formInfo.labels.join(', ')}. You MUST fill ALL of these fields before submitting.`;
      console.log(`[Form Fill] Form analysis: ${formInfo.inputCount} inputs, labels: ${formInfo.labels.slice(0, 10).join(', ')}...`);
    } catch (e) {
      console.log(`[Form Fill] Form analysis failed (non-fatal): ${e}`);
    }

    // 5. Pre-fill phone field with Playwright (deterministic — CUA struggles with country code selectors)
    const bd = event.buyerDetails;
    const userName = bd.userName || bd.name;
    const phoneRaw = bd.phone || "+60132201176";
    const phoneLocal = phoneRaw.replace(/[^0-9]/g, "").replace(/^60/, "");
    const streetAddress = bd.addressLine1 || bd.address.split(",")[0] || bd.address;
    const city = bd.city || "Puchong";
    // Map MY state codes to full names (merchant forms show full names, not codes)
    const stateCodeMap: Record<string, string> = {
      'JHR': 'Johor', 'KDH': 'Kedah', 'KTN': 'Kelantan', 'MLK': 'Melaka',
      'NSN': 'Negeri Sembilan', 'PHG': 'Pahang', 'PRK': 'Perak', 'PLS': 'Perlis',
      'PNG': 'Pulau Pinang', 'SBH': 'Sabah', 'SWK': 'Sarawak', 'SGR': 'Selangor',
      'TRG': 'Terengganu', 'KUL': 'Kuala Lumpur', 'LBN': 'Labuan', 'PJY': 'Putrajaya',
    };
    const state = stateCodeMap[bd.stateCode || ''] || bd.stateCode || "Selangor";

    // 5b. Pre-fill phone with Playwright — simple approach: find input, select all, type full number
    try {
      const phoneInput = await page.$('input[type="tel"]')
        || await page.$('input[placeholder*="702"]')
        || await page.$('input[placeholder*="phone" i]')
        || await page.$('input[name*="phone" i]');

      if (phoneInput) {
        // Triple-click to select all text in the phone input, then type over it
        await phoneInput.click({ clickCount: 3 });
        await new Promise((r) => setTimeout(r, 200));
        await page.keyboard.type(phoneLocal, { delay: 30 });
        console.log(`[Form Fill] Phone pre-filled: ${phoneLocal}`);
      } else {
        console.log(`[Form Fill] Phone input not found, CUA will handle it`);
      }
    } catch (e) {
      console.log(`[Form Fill] Phone pre-fill failed (non-fatal): ${e}`);
    }

    // 6. Build the instruction for Gemini CUA (phone already filled)
    const instruction = `You are on a merchant e-invoice submission form. You must fill ALL fields and submit.

IMPORTANT: The Mobile Number field is ALREADY FILLED. Do NOT touch the phone field or country code selector.

STEP 1 - PERSONAL DETAILS (top of form):
- "Full Name (as per ID)": ${userName}
- "Email Address": ${bd.email}
- Mobile Number: ALREADY FILLED - skip this field

STEP 2 - Scroll down to see the DETAILS section

STEP 3 - CLAIM TYPE:
- Click "Company" radio button (NOT Individual)

STEP 4 - COMPANY DETAILS (appear after selecting Company):
- "Company Name": ${bd.name}
- "Business Registration Number (BRN)": ${bd.brn}
- "Tax Identification Number (TIN)": ${bd.tin}
- "Company Address": ${streetAddress}

STEP 5 - LOCATION:
- "Company State" dropdown: click to open, select "${state}"
- "Company City" dropdown: click to open, select "${city}"

STEP 6 - SUBMIT:
- Check the terms checkbox
- Click the Submit button

If you see validation errors, fix them and resubmit. Do NOT change the phone field.${formFieldsSummary}`;

    console.log(`[Form Fill] Starting Gemini CUA agent loop (max ${MAX_TURNS} turns)`);

    // 6. Agent loop: screenshot → Gemini → execute → repeat
    const screenshotBytes = await page.screenshot({ type: "png" });
    const screenshotB64 = screenshotBytes.toString("base64");

    // Initialize conversation with user instruction + initial screenshot
    const contents: any[] = [
      {
        role: "user",
        parts: [
          { text: instruction },
          { inlineData: { mimeType: "image/png", data: screenshotB64 } },
        ],
      },
    ];

    let taskComplete = false;
    let totalActions = 0;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      console.log(`[Form Fill] Turn ${turn + 1}/${MAX_TURNS}`);

      // Call Gemini CUA
      const geminiResponse = await callGeminiCUA(geminiKey, contents);
      const candidate = geminiResponse.candidates?.[0];
      if (!candidate?.content?.parts) {
        console.log(`[Form Fill] No response from Gemini, retrying with fresh screenshot...`);
        const retryScreenshot = await page.screenshot({ type: "png" });
        const retryB64 = retryScreenshot.toString("base64");
        contents.push({
          role: "user",
          parts: [
            { text: "The form is not complete yet. Please continue filling in the remaining empty fields and submit the form." },
            { inlineData: { mimeType: "image/png", data: retryB64 } },
          ],
        });
        continue;
      }

      // Append model response to conversation
      contents.push(candidate.content);

      // Extract text reasoning and function calls
      const parts = candidate.content.parts || [];
      const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text);
      const functionCalls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

      if (textParts.length > 0) {
        console.log(`[Form Fill] Gemini reasoning: ${textParts.join(" ").substring(0, 200)}`);
      }

      // If no function calls, task is complete (model is done)
      if (functionCalls.length === 0) {
        console.log(`[Form Fill] No more actions — task complete`);
        taskComplete = true;
        break;
      }

      // Execute each action and build function responses
      // IMPORTANT: screenshot must be INSIDE function_response.parts per Google CUA spec
      const functionResponseParts: any[] = [];
      for (const fc of functionCalls) {
        const action: GeminiAction = { name: fc.name, args: fc.args || {} };
        console.log(`[Form Fill]   Action: ${action.name}${action.args.text ? ` "${action.args.text.substring(0, 50)}"` : ""}${action.args.x !== undefined ? ` (${action.args.x},${action.args.y})` : ""}`);

        try {
          await executeAction(page, action);
          totalActions++;
        } catch (e) {
          console.error(`[Form Fill]   Error executing ${action.name}: ${e}`);
        }

        // Capture screenshot after action
        const newScreenshot = await page.screenshot({ type: "png" });
        const newB64 = newScreenshot.toString("base64");
        const currentUrl = page.url();

        // Google CUA spec: screenshot goes inside function_response.parts
        functionResponseParts.push({
          functionResponse: {
            name: action.name,
            response: { url: currentUrl },
            parts: [{
              inlineData: { mimeType: "image/png", data: newB64 },
            }],
          },
        });
      }

      // Send function responses back to Gemini
      contents.push({
        role: "user",
        parts: functionResponseParts,
      });
    }

    // 7. Cleanup
    await browser.close();

    const durationMs = Date.now() - startTime;
    console.log(`[Form Fill] Completed in ${durationMs}ms, ${totalActions} actions, success: ${taskComplete}`);

    // 8. Report to Convex
    await convexMutation("functions/system:reportEinvoiceFormFillResult", {
      expenseClaimId: event.expenseClaimId,
      emailRef: event.emailRef,
      status: taskComplete ? "success" : "failed",
      browserbaseSessionId,
      durationMs,
    });

    return { success: taskComplete, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : `Unknown: ${JSON.stringify(error)}`;
    console.error(`[Form Fill] Failed in ${durationMs}ms: ${errorMessage}`);
    if (error instanceof Error && error.stack) {
      console.error(`[Form Fill] Stack: ${error.stack.substring(0, 500)}`);
    }

    if (browser) {
      try { await browser.close(); } catch { /* ignore */ }
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
    } catch (e) {
      console.error(`[Form Fill] Failed to report to Convex: ${e}`);
    }

    return { success: false, error: errorMessage, durationMs };
  }
}

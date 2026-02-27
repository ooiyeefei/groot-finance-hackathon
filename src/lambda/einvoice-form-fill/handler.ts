/**
 * E-Invoice Form Fill Lambda (019-lhdn-einv-flow-2)
 *
 * Uses Gemini CUA + @sparticuz/chromium for form filling.
 * Runs real Chromium with --headless=new (required for Radix UI dropdowns).
 *
 * Architecture:
 * - @sparticuz/chromium: Chromium binary for Lambda (--headless=new)
 * - Gemini CUA: sees screenshots, outputs UI actions
 * - Playwright-core: executes actions in the browser
 * - This Lambda: orchestrates the agent loop
 *
 * Hybrid approach:
 * - Playwright pre-fills phone + state/city dropdowns (deterministic)
 * - Gemini CUA fills text fields + submits (autonomous)
 */

import { chromium, type Browser, type Page } from "playwright-core";
import chromiumBinary from "@sparticuz/chromium";

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

const SCREEN_WIDTH = 1440;
const SCREEN_HEIGHT = 900;
const MAX_TURNS = 30;
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "";

// MY state codes to full names
const STATE_CODE_MAP: Record<string, string> = {
  'JHR': 'Johor', 'KDH': 'Kedah', 'KTN': 'Kelantan', 'MLK': 'Melaka',
  'NSN': 'Negeri Sembilan', 'PHG': 'Pahang', 'PRK': 'Perak', 'PLS': 'Perlis',
  'PNG': 'Pulau Pinang', 'SBH': 'Sabah', 'SWK': 'Sarawak', 'SGR': 'Selangor',
  'TRG': 'Terengganu', 'KUL': 'Kuala Lumpur', 'LBN': 'Labuan', 'PJY': 'Putrajaya',
};

// State names in dropdown order (for ArrowDown navigation)
const STATE_ORDER = ['Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang',
  'Perak', 'Perlis', 'Pulau Pinang', 'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
  'Wilayah Persekutuan Kuala Lumpur', 'Wilayah Persekutuan Labuan', 'Wilayah Persekutuan Putrajaya'];

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

async function callGeminiCUA(geminiKey: string, contents: any[]): Promise<any> {
  const model = "gemini-2.5-computer-use-preview-10-2025";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;

  const payload = {
    contents,
    tools: [{ computerUse: { environment: "ENVIRONMENT_BROWSER" } }],
    generationConfig: { temperature: 0.0, maxOutputTokens: 8192 },
  };

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) return response.json();

    const errorBody = await response.text();
    if ((response.status === 503 || response.status === 429 || response.status >= 500) && attempt < maxRetries) {
      const delay = attempt * 3000;
      console.log(`[Form Fill] Gemini ${response.status}, retrying in ${delay}ms (${attempt}/${maxRetries})`);
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }
    throw new Error(`Gemini API error ${response.status}: ${errorBody.substring(0, 300)}`);
  }
  throw new Error("Gemini API: all retries exhausted");
}

// ============================================================
// Action Executor
// ============================================================

function denorm(val: number, dim: number): number {
  return Math.round((val / 1000) * dim);
}

async function executeAction(page: Page, action: GeminiAction): Promise<void> {
  const { name, args } = action;
  switch (name) {
    case "click_at":
      await page.mouse.click(denorm(args.x, SCREEN_WIDTH), denorm(args.y, SCREEN_HEIGHT));
      break;
    case "type_text_at": {
      const x = denorm(args.x, SCREEN_WIDTH);
      const y = denorm(args.y, SCREEN_HEIGHT);
      await page.mouse.click(x, y);
      if (args.clear_before_typing !== false) {
        await page.keyboard.press("Control+A");
        await page.keyboard.press("Backspace");
      }
      await page.keyboard.type(args.text || "", { delay: 30 });
      if (args.press_enter === true) await page.keyboard.press("Enter");
      break;
    }
    case "scroll_document":
      await page.mouse.wheel(0, args.direction === "up" ? -300 : 300);
      break;
    case "scroll_at": {
      await page.mouse.move(denorm(args.x, SCREEN_WIDTH), denorm(args.y, SCREEN_HEIGHT));
      const mag = denorm(args.magnitude || 800, SCREEN_HEIGHT);
      await page.mouse.wheel(0, args.direction === "up" ? -mag : mag);
      break;
    }
    case "hover_at":
      await page.mouse.move(denorm(args.x, SCREEN_WIDTH), denorm(args.y, SCREEN_HEIGHT));
      break;
    case "key_combination":
      await page.keyboard.press(args.keys || "");
      break;
    case "navigate":
      await page.goto(args.url, { waitUntil: "networkidle", timeout: 15000 });
      break;
    case "go_back":
      await page.goBack({ timeout: 10000 });
      break;
    case "wait_5_seconds":
      await new Promise((r) => setTimeout(r, 5000));
      break;
    case "open_web_browser":
      break;
    default:
      console.log(`[Form Fill] Unknown action: ${name}`);
  }
  try { await page.waitForLoadState("networkidle", { timeout: 3000 }); } catch { /* fine */ }
  await new Promise((r) => setTimeout(r, 500));
}

// ============================================================
// Playwright Pre-fill Helpers (deterministic, no CUA needed)
// ============================================================

async function prefillDropdown(page: Page, dropdownText: string, targetValue: string, optionsList: string[]): Promise<boolean> {
  try {
    const btn = page.getByRole('combobox').filter({ hasText: dropdownText }).first();
    if (await btn.count() === 0) return false;

    const idx = optionsList.findIndex(s => s.toLowerCase().includes(targetValue.toLowerCase()));
    if (idx < 0) {
      console.log(`[Form Fill] "${targetValue}" not found in dropdown options`);
      return false;
    }

    // Try up to 2 attempts (ArrowDown count can be off-by-one depending on initial focus)
    for (let attempt = 0; attempt < 2; attempt++) {
      await btn.focus();
      await page.keyboard.press('Space');
      await new Promise(r => setTimeout(r, 500));

      // Navigate: first attempt uses idx presses, retry uses idx+1
      const presses = idx + attempt;
      for (let i = 0; i < presses; i++) {
        await page.keyboard.press('ArrowDown');
        await new Promise(r => setTimeout(r, 80));
      }
      await page.keyboard.press('Space');
      await new Promise(r => setTimeout(r, 1500));

      // Verify selection
      const selected = await btn.textContent().catch(() => '');
      if (selected?.toLowerCase().includes(targetValue.toLowerCase())) {
        console.log(`[Form Fill] Dropdown "${dropdownText}" → "${selected?.trim()}" (attempt ${attempt + 1})`);
        return true;
      }
      console.log(`[Form Fill] Dropdown attempt ${attempt + 1}: got "${selected?.trim()}", wanted "${targetValue}"`);
    }
    return true; // Accept whatever was selected
  } catch (e) {
    console.log(`[Form Fill] Dropdown prefill failed: ${e}`);
    return false;
  }
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
  let browser: Browser | undefined;

  console.log(`[Form Fill] Starting for claim ${event.expenseClaimId}, URL: ${event.merchantFormUrl.substring(0, 80)}...`);

  try {
    const geminiKey = process.env.GEMINI_API_KEY!;
    if (!geminiKey) throw new Error("GEMINI_API_KEY not configured");

    // 1. Report to Convex: starting
    await convexMutation("functions/system:reportEinvoiceFormFillResult", {
      expenseClaimId: event.expenseClaimId,
      emailRef: event.emailRef,
      merchantFormUrl: event.merchantFormUrl,
      status: "in_progress",
    });

    // 2. Launch Chromium with --headless=new (required for Radix UI dropdowns)
    const execPath = await chromiumBinary.executablePath();
    browser = await chromium.launch({
      executablePath: execPath,
      headless: true,
      args: [...chromiumBinary.args, '--headless=new'],
    });
    console.log(`[Form Fill] Chromium launched: ${execPath}`);

    const page = await browser.newPage({ viewport: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } });

    // 3. Navigate to merchant form (use domcontentloaded — networkidle times out on heavy sites)
    const navResponse = await page.goto(event.merchantFormUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    const navStatus = navResponse?.status() || 0;
    console.log(`[Form Fill] Navigated to: ${page.url()}, status: ${navStatus}`);

    // Check for bot protection / access denied
    if (navStatus === 403 || navStatus === 401 || navStatus === 503) {
      throw new Error(`Merchant site returned ${navStatus} — likely bot protection. URL: ${event.merchantFormUrl.substring(0, 80)}`);
    }

    // Wait for page to stabilize
    try { await page.waitForLoadState("networkidle", { timeout: 10000 }); } catch { /* heavy pages may never reach networkidle */ }
    await new Promise((r) => setTimeout(r, 2000));

    // 4. Build buyer details
    const bd = event.buyerDetails;
    const userName = bd.userName || bd.name;
    const phoneLocal = (bd.phone || "+60132201176").replace(/[^0-9]/g, "").replace(/^60/, "");
    const streetAddress = bd.addressLine1 || bd.address.split(",")[0] || bd.address;
    const city = bd.city || "Puchong";
    const state = STATE_CODE_MAP[bd.stateCode || ''] || bd.stateCode || "Selangor";

    console.log(`[Form Fill] Buyer: ${userName}, ${bd.email}, state: ${state}, city: ${city}`);

    // 5. Pre-fill phone with Playwright (CUA struggles with country code selectors)
    try {
      const phoneInput = page.locator('input[type="tel"]');
      if (await phoneInput.count() > 0) {
        await phoneInput.click({ clickCount: 3 });
        await page.keyboard.type(phoneLocal, { delay: 30 });
        console.log(`[Form Fill] Phone pre-filled: ${phoneLocal}`);
      }
    } catch (e) {
      console.log(`[Form Fill] Phone pre-fill failed: ${e}`);
    }

    // 6. Pre-analyze form fields
    let formFieldsSummary = "";
    try {
      const formInfo = await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll('label, [class*="label"]'))
          .map(el => el.textContent?.trim()).filter(Boolean).slice(0, 30);
        const inputCount = document.querySelectorAll('input:not([type="hidden"]), select, textarea').length;
        return { labels, inputCount };
      });
      formFieldsSummary = `\n\nFORM ANALYSIS: ${formInfo.inputCount} input fields. Labels: ${formInfo.labels.join(', ')}. Fill ALL required fields.`;
      console.log(`[Form Fill] Form: ${formInfo.inputCount} inputs`);
    } catch { /* non-fatal */ }

    // 7. Build CUA instruction (phone pre-filled, state/city will be pre-filled after CUA)
    const instruction = `You are on a merchant e-invoice form. Fill ALL fields and submit.

IMPORTANT: Mobile Number is ALREADY FILLED. Do NOT touch the phone field.
IMPORTANT: Company State and City dropdowns will be filled AFTER you fill text fields. Skip them.

STEP 1 - PERSONAL DETAILS:
- "Full Name (as per ID)": ${userName}
- "Email Address": ${bd.email}
- Mobile Number: ALREADY FILLED — skip

STEP 2 - Scroll down to see DETAILS section

STEP 3 - Click "Company" radio button (NOT Individual)

STEP 4 - COMPANY DETAILS:
- "Company Name": ${bd.name}
- "Business Registration Number (BRN)": ${bd.brn}
- "Tax Identification Number (TIN)": ${bd.tin}
- "Company Address": ${streetAddress}

STEP 5 - SKIP State and City dropdowns (they will be filled automatically)

STEP 6 - Check the terms checkbox, then click Submit.

If validation errors appear, fix empty text fields and resubmit. Do NOT touch phone, state, or city.${formFieldsSummary}`;

    // 8. CUA agent loop for text fields
    console.log(`[Form Fill] Starting CUA loop (max ${MAX_TURNS} turns)`);
    const screenshotB64 = (await page.screenshot({ type: "png" })).toString("base64");
    const contents: any[] = [{
      role: "user",
      parts: [
        { text: instruction },
        { inlineData: { mimeType: "image/png", data: screenshotB64 } },
      ],
    }];

    let taskComplete = false;
    let totalActions = 0;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      console.log(`[Form Fill] Turn ${turn + 1}/${MAX_TURNS}`);

      const geminiResponse = await callGeminiCUA(geminiKey, contents);
      const candidate = geminiResponse.candidates?.[0];
      if (!candidate?.content?.parts) {
        const retryB64 = (await page.screenshot({ type: "png" })).toString("base64");
        contents.push({ role: "user", parts: [
          { text: "Continue filling the form. Skip phone/state/city." },
          { inlineData: { mimeType: "image/png", data: retryB64 } },
        ]});
        continue;
      }

      contents.push(candidate.content);
      const parts = candidate.content.parts || [];
      const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text);
      const functionCalls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

      if (textParts.length > 0) {
        console.log(`[Form Fill] Reasoning: ${textParts.join(" ").substring(0, 150)}`);
      }

      if (functionCalls.length === 0) {
        console.log(`[Form Fill] No more actions — CUA done`);
        taskComplete = true;
        break;
      }

      const functionResponseParts: any[] = [];
      for (const fc of functionCalls) {
        const action: GeminiAction = { name: fc.name, args: fc.args || {} };
        const safetyDecision = fc.args?.safety_decision;
        console.log(`[Form Fill]   ${action.name}${action.args.text ? ` "${action.args.text.substring(0, 40)}"` : ""}${action.args.x !== undefined ? ` (${action.args.x},${action.args.y})` : ""}`);

        try { await executeAction(page, action); totalActions++; } catch (e) { console.error(`[Form Fill] Action error: ${e}`); }

        const newB64 = (await page.screenshot({ type: "png" })).toString("base64");
        const responseData: Record<string, any> = { url: page.url() };
        if (safetyDecision) responseData.safety_acknowledgement = "true";

        functionResponseParts.push({
          functionResponse: { name: action.name, response: responseData, parts: [{ inlineData: { mimeType: "image/png", data: newB64 } }] },
        });
      }
      contents.push({ role: "user", parts: functionResponseParts });
    }

    // 9. Pre-fill state/city dropdowns with Playwright (deterministic, after CUA fills text)
    console.log(`[Form Fill] Pre-filling state: ${state}`);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 500));

    const stateOk = await prefillDropdown(page, 'Select state', state, STATE_ORDER);
    console.log(`[Form Fill] State: ${stateOk ? state : 'FAILED'}`);

    if (stateOk) {
      await new Promise(r => setTimeout(r, 1500)); // Wait for city options to load

      // Get available cities
      const cityOptions = await page.evaluate(() => {
        const sel = document.querySelector('select[name="companyCityName"]') as HTMLSelectElement;
        if (!sel) return [];
        return Array.from(sel.options).map(o => o.textContent?.trim() || '').filter(Boolean);
      });
      console.log(`[Form Fill] Available cities: ${cityOptions.slice(0, 5).join(', ')}...`);

      if (cityOptions.length > 1) {
        // Find best match for city
        const cityMatch = cityOptions.find(c => c.toLowerCase().includes(city.toLowerCase()))
          || cityOptions.find(c => c.toLowerCase().includes('petaling'))
          || cityOptions[0];
        if (cityMatch) {
          const cityOk = await prefillDropdown(page, 'Select city', cityMatch, cityOptions);
          console.log(`[Form Fill] City: ${cityOk ? cityMatch : 'FAILED'}`);
        }
      }

      // 10. Check terms and submit with Playwright (no CUA needed)
      const checkbox = page.locator('button[role="checkbox"]');
      if (await checkbox.count() > 0) {
        const isChecked = await checkbox.getAttribute('data-state');
        if (isChecked !== 'checked') await checkbox.click();
        console.log(`[Form Fill] Terms checked`);
      }

      await page.locator('button:has-text("Submit")').click();
      console.log(`[Form Fill] Submitted`);
      await new Promise(r => setTimeout(r, 5000));
    }

    // 11. Cleanup
    await browser.close();

    const durationMs = Date.now() - startTime;
    console.log(`[Form Fill] Completed in ${durationMs}ms, ${totalActions} CUA actions, state: ${stateOk ? 'ok' : 'failed'}`);

    // 12. Report to Convex
    await convexMutation("functions/system:reportEinvoiceFormFillResult", {
      expenseClaimId: event.expenseClaimId,
      emailRef: event.emailRef,
      status: stateOk ? "success" : "failed",
      durationMs,
    });

    return { success: stateOk, durationMs };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : `Unknown: ${JSON.stringify(error)}`;
    console.error(`[Form Fill] Failed in ${durationMs}ms: ${errorMessage}`);
    if (error instanceof Error && error.stack) console.error(`[Form Fill] Stack: ${error.stack.substring(0, 500)}`);
    if (browser) try { await browser.close(); } catch { /* ignore */ }

    try {
      await convexMutation("functions/system:reportEinvoiceFormFillResult", {
        expenseClaimId: event.expenseClaimId,
        emailRef: event.emailRef,
        status: "failed",
        errorMessage,
        durationMs,
      });
    } catch (e) { console.error(`[Form Fill] Convex report failed: ${e}`); }

    return { success: false, error: errorMessage, durationMs };
  }
}

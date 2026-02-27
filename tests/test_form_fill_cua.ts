/**
 * Test: Gemini CUA Form Fill via Browserbase
 *
 * Tests the direct Gemini CUA + Playwright approach against the FamilyMart
 * e-invoice form. Run with: npx tsx tests/test_form_fill_cua.ts
 *
 * Requires .env.local with: GEMINI_API_KEY, BROWSERBASE_API_KEY, BROWSERBASE_PROJECT_ID
 */

import { chromium, type Browser, type Page } from "playwright-core";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.local
dotenv.config({ path: path.join(__dirname, "../.env.local") });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const BROWSERBASE_API_KEY = process.env.BROWSERBASE_API_KEY!;
const BROWSERBASE_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID!;

const SCREEN_WIDTH = 1280;
const SCREEN_HEIGHT = 900;
const MAX_TURNS = 20;

// FamilyMart test URL
const MERCHANT_URL =
  "https://fmeinvoice.ql.com.my/?storeCode=0346&receiptNo=00000P1331000531809&transDate=2026-02-26";

// Test buyer details
const BUYER = {
  userName: "Yee Fei Ooi",
  name: "Groot Test Account",
  email: "einvoice+test12345@einv.hellogroot.com",
  phone: "132201176",
  tin: "IG24210777100",
  brn: "200012345X",
  address: "4 Jalan Selamat",
  city: "Puchong",
  state: "Selangor",
};

// ── Gemini CUA API ──────────────────────────────────────────

async function callGeminiCUA(contents: any[]): Promise<any> {
  const model = "gemini-3-flash-preview";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const payload = {
    contents,
    tools: [
      {
        computerUse: {
          environment: "ENVIRONMENT_BROWSER",
        },
      },
    ],
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
    throw new Error(
      `Gemini API error ${response.status}: ${errorBody.substring(0, 500)}`
    );
  }

  return response.json();
}

// ── Action Executor ─────────────────────────────────────────

function denorm(val: number, dim: number): number {
  return Math.round((val / 1000) * dim);
}

async function executeAction(
  page: Page,
  name: string,
  args: Record<string, any>
): Promise<void> {
  switch (name) {
    case "click_at": {
      const x = denorm(args.x, SCREEN_WIDTH);
      const y = denorm(args.y, SCREEN_HEIGHT);
      console.log(`    → click (${x}, ${y})`);
      await page.mouse.click(x, y);
      break;
    }
    case "type_text_at": {
      const x = denorm(args.x, SCREEN_WIDTH);
      const y = denorm(args.y, SCREEN_HEIGHT);
      console.log(
        `    → type "${(args.text || "").substring(0, 40)}" at (${x}, ${y})`
      );
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
      const delta = args.direction === "up" ? -300 : 300;
      console.log(`    → scroll ${args.direction}`);
      await page.mouse.wheel(0, delta);
      break;
    }
    case "scroll_at": {
      const sx = denorm(args.x, SCREEN_WIDTH);
      const sy = denorm(args.y, SCREEN_HEIGHT);
      await page.mouse.move(sx, sy);
      const mag = denorm(args.magnitude || 800, SCREEN_HEIGHT);
      const d = args.direction === "up" ? -mag : mag;
      console.log(`    → scroll at (${sx},${sy}) ${args.direction}`);
      await page.mouse.wheel(0, d);
      break;
    }
    case "hover_at": {
      const hx = denorm(args.x, SCREEN_WIDTH);
      const hy = denorm(args.y, SCREEN_HEIGHT);
      console.log(`    → hover (${hx}, ${hy})`);
      await page.mouse.move(hx, hy);
      break;
    }
    case "key_combination": {
      console.log(`    → key: ${args.keys}`);
      await page.keyboard.press(args.keys || "");
      break;
    }
    case "navigate": {
      console.log(`    → navigate: ${args.url?.substring(0, 60)}`);
      await page.goto(args.url, { waitUntil: "networkidle", timeout: 15000 });
      break;
    }
    case "wait_5_seconds": {
      console.log(`    → wait 5s`);
      await new Promise((r) => setTimeout(r, 5000));
      break;
    }
    case "go_back":
    case "go_forward":
    case "open_web_browser":
      console.log(`    → ${name} (no-op)`);
      break;
    default:
      console.log(`    → UNKNOWN: ${name}`);
  }

  try {
    await page.waitForLoadState("networkidle", { timeout: 3000 });
  } catch {
    /* fine */
  }
  await new Promise((r) => setTimeout(r, 500));
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log("=== Gemini CUA Form Fill Test ===\n");
  console.log(`Merchant URL: ${MERCHANT_URL}`);
  console.log(`Buyer: ${BUYER.userName} / ${BUYER.name}`);
  console.log(`TIN: ${BUYER.tin}, BRN: ${BUYER.brn}\n`);

  // 1. Create Browserbase session
  console.log("1. Creating Browserbase session...");
  const sessionResp = await fetch("https://api.browserbase.com/v1/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-bb-api-key": BROWSERBASE_API_KEY,
    },
    body: JSON.stringify({
      projectId: BROWSERBASE_PROJECT_ID,
      browserSettings: {
        recordSession: true,
        viewport: { width: SCREEN_WIDTH, height: SCREEN_HEIGHT },
      },
    }),
  });

  if (!sessionResp.ok) {
    throw new Error(
      `Browserbase session failed: ${sessionResp.status} ${await sessionResp.text()}`
    );
  }

  const session = await sessionResp.json();
  const sessionId = session.id;
  console.log(`   Session: ${sessionId}`);
  console.log(
    `   Recording: https://www.browserbase.com/sessions/${sessionId}\n`
  );

  // 2. Connect Playwright via CDP
  console.log("2. Connecting Playwright via CDP...");
  const connectUrl = `wss://connect.browserbase.com?apiKey=${BROWSERBASE_API_KEY}&sessionId=${sessionId}`;
  const browser = await chromium.connectOverCDP(connectUrl);
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = context.pages()[0] || (await context.newPage());
  console.log("   Connected!\n");

  // 3. Navigate to merchant form
  console.log("3. Navigating to merchant form...");
  await page.goto(MERCHANT_URL, { waitUntil: "networkidle", timeout: 30000 });
  console.log(`   Page: ${page.url()}\n`);
  await new Promise((r) => setTimeout(r, 2000));

  // 4. Build instruction
  const instruction = `You are on a merchant e-invoice submission form. You must fill ALL fields and submit.

IMPORTANT RULES:
- Do NOT click the country flag/code selector for the phone field. The flag shows the country code which is already correct (+60 Malaysia). Only click the TEXT INPUT area to the RIGHT of the flag and type the digits.
- After filling personal details, you MUST scroll down to see and fill the rest of the form.
- You MUST select "Company" not "Individual" in the Claim As section.
- You MUST fill ALL required fields marked with * before submitting.
- Keep going until you click Submit and see a confirmation message.

STEP 1 - PERSONAL DETAILS (top of form):
- "Full Name (as per ID)": ${BUYER.userName}
- "Email Address": ${BUYER.email}
- "Mobile Number": The phone field has a country flag on the LEFT and a text input on the RIGHT. DO NOT click the flag or country code selector. Click inside the text input area where it shows placeholder text like "1 (702) 123-4567", then type: ${BUYER.phone}. If the country flag shows a non-Malaysia flag, ignore it — just type the digits in the input field.

STEP 2 - Scroll down to see the DETAILS section

STEP 3 - CLAIM TYPE:
- Click "Company" radio button (NOT Individual)

STEP 4 - COMPANY DETAILS (appear after selecting Company):
- "Company Name": ${BUYER.name}
- "Business Registration Number (BRN)": ${BUYER.brn}
- "Tax Identification Number (TIN)": ${BUYER.tin}
- "Company Address": ${BUYER.address}

STEP 5 - LOCATION:
- "Company State" dropdown: click to open, select "${BUYER.state}"
- "Company City" dropdown: click to open, select "${BUYER.city}"

STEP 6 - SUBMIT:
- Check the terms checkbox
- Click the Submit button

If you see validation errors, fix them and resubmit.`;

  // 5. Take initial screenshot
  const initialScreenshot = await page.screenshot({ type: "png" });
  const initialB64 = initialScreenshot.toString("base64");

  // 6. Agent loop
  console.log(`4. Starting Gemini CUA agent loop (max ${MAX_TURNS} turns)\n`);

  const contents: any[] = [
    {
      role: "user",
      parts: [
        { text: instruction },
        { inlineData: { mimeType: "image/png", data: initialB64 } },
      ],
    },
  ];

  let totalActions = 0;
  const startTime = Date.now();

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const turnStart = Date.now();
    console.log(`--- Turn ${turn + 1}/${MAX_TURNS} ---`);

    // Call Gemini
    const geminiResponse = await callGeminiCUA(contents);
    const candidate = geminiResponse.candidates?.[0];

    if (!candidate?.content?.parts) {
      console.log("  No response from Gemini. Taking fresh screenshot and retrying...");
      // Send a fresh screenshot to re-prompt the model
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

    contents.push(candidate.content);

    const parts = candidate.content.parts || [];
    const textParts = parts
      .filter((p: any) => p.text)
      .map((p: any) => p.text);
    const functionCalls = parts
      .filter((p: any) => p.functionCall)
      .map((p: any) => p.functionCall);

    if (textParts.length > 0) {
      console.log(
        `  Reasoning: ${textParts.join(" ").substring(0, 150)}...`
      );
    }

    if (functionCalls.length === 0) {
      console.log("  No more actions — task complete!\n");
      break;
    }

    console.log(`  Actions: ${functionCalls.length}`);

    // Execute actions
    const functionResponses: any[] = [];
    for (const fc of functionCalls) {
      console.log(`  [${fc.name}]`);
      try {
        await executeAction(page, fc.name, fc.args || {});
        totalActions++;
      } catch (e) {
        console.error(`    ERROR: ${e}`);
      }

      const newScreenshot = await page.screenshot({ type: "png" });
      const newB64 = newScreenshot.toString("base64");
      const currentUrl = page.url();

      functionResponses.push({
        functionResponse: {
          name: fc.name,
          response: { url: currentUrl },
        },
      });
      functionResponses.push({
        inlineData: { mimeType: "image/png", data: newB64 },
      });
    }

    contents.push({ role: "user", parts: functionResponses });

    const turnDuration = Date.now() - turnStart;
    console.log(`  Turn took ${turnDuration}ms\n`);
  }

  // 7. Final screenshot
  const finalScreenshot = await page.screenshot({ type: "png" });
  const fs = await import("fs");
  fs.writeFileSync(
    path.join(__dirname, "form_fill_final.png"),
    finalScreenshot
  );
  console.log(
    `Saved final screenshot to tests/form_fill_final.png`
  );

  // 8. Cleanup
  await browser.close();

  const totalDuration = Date.now() - startTime;
  console.log(`\n=== Done ===`);
  console.log(`Total: ${totalActions} actions in ${totalDuration}ms`);
  console.log(
    `Recording: https://www.browserbase.com/sessions/${sessionId}`
  );
}

main().catch((e) => {
  console.error("\nFATAL:", e.message);
  if (e.stack) console.error(e.stack.substring(0, 300));
  process.exit(1);
});

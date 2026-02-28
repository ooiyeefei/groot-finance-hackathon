/**
 * E-Invoice Form Fill Lambda (019-lhdn-einv-flow-2)
 *
 * 3-tier execution strategy:
 * - Tier 1 (fast, ~5s): Merchant has saved formConfig → Playwright fills with CSS selectors
 * - Tier 2 (slow, ~120s): First-time merchant → CUA explores, fills, submits
 * - Tier 3 (on failure): Troubleshooter Gemini vision diagnoses → updates formConfig
 *
 * On success: extracts field selectors → saves formConfig → next run uses Tier 1
 * On failure: takes screenshot → Gemini diagnoses root cause → updates formConfig
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

interface FormFieldConfig {
  label: string;
  selector: string;
  type: "text" | "select" | "radix_select" | "radio" | "checkbox";
  buyerDetailKey?: string;
  defaultValue?: string;
  required: boolean;
}

interface FormConfig {
  fields: FormFieldConfig[];
  submitSelector?: string;
  consentSelector?: string;
  cuaHints?: string;
  successCount?: number;
  lastFailureReason?: string;
}

// ============================================================
// Constants
// ============================================================

const SCREEN_WIDTH = 1440;
const SCREEN_HEIGHT = 900;
const MAX_TURNS = 40;
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL || "";

// MY state codes to full names
const STATE_CODE_MAP: Record<string, string> = {
  'JHR': 'Johor', 'KDH': 'Kedah', 'KTN': 'Kelantan', 'MLK': 'Melaka',
  'NSN': 'Negeri Sembilan', 'PHG': 'Pahang', 'PRK': 'Perak', 'PLS': 'Perlis',
  'PNG': 'Pulau Pinang', 'SBH': 'Sabah', 'SWK': 'Sarawak', 'SGR': 'Selangor',
  'TRG': 'Terengganu', 'KUL': 'Kuala Lumpur', 'LBN': 'Labuan', 'PJY': 'Putrajaya',
};


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

async function convexQuery(
  functionPath: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const response = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: functionPath, args, format: "json" }),
  });
  if (!response.ok) return null;
  const result = await response.json();
  return result.status === "success" ? result.value : null;
}

// ============================================================
// Gemini Vision (non-CUA) — for troubleshooting failures
// ============================================================

async function callGeminiVision(geminiKey: string, prompt: string, screenshotB64: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [
        { text: prompt },
        { inlineData: { mimeType: "image/png", data: screenshotB64 } },
      ]}],
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
    }),
  });
  if (!response.ok) return `Gemini error: ${response.status}`;
  const result = await response.json();
  return result.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
}

// ============================================================
// Tier 1: Fast path — Playwright-only with saved formConfig
// ============================================================

async function executeTier1(page: Page, formConfig: FormConfig, buyerDetails: Record<string, string>): Promise<boolean> {
  console.log(`[Form Fill] Tier 1: Using saved formConfig (${formConfig.fields.length} fields)`);

  for (const field of formConfig.fields) {
    try {
      const value = (field.buyerDetailKey && buyerDetails[field.buyerDetailKey]) || field.defaultValue || '';
      if (!value) continue;

      const el = page.locator(field.selector).first();
      if (await el.count() === 0) {
        console.log(`[Form Fill] Tier 1: selector not found: ${field.selector}`);
        continue;
      }

      switch (field.type) {
        case "text":
          await el.click({ timeout: 3000 });
          await page.keyboard.press("Control+A");
          await page.keyboard.type(value, { delay: 20 });
          break;
        case "select":
          await page.selectOption(field.selector, { label: value }).catch(() =>
            page.selectOption(field.selector, value)
          );
          break;
        case "radio":
          await el.click({ timeout: 3000 });
          break;
        case "checkbox":
          if (await el.getAttribute('data-state') !== 'checked' && !(await el.isChecked().catch(() => false))) {
            await el.click({ timeout: 3000 });
          }
          break;
        case "radix_select":
          // Use proven keyboard approach
          await el.focus({ timeout: 3000 });
          await page.keyboard.press('Space');
          await new Promise(r => setTimeout(r, 800));
          const options = await page.getByRole('option');
          const optCount = await options.count();
          for (let i = 0; i < optCount; i++) {
            const optText = await options.nth(i).textContent();
            if (optText?.toLowerCase().includes(value.toLowerCase())) {
              // Navigate to this option
              for (let j = 0; j < i; j++) {
                await page.keyboard.press('ArrowDown');
                await new Promise(r => setTimeout(r, 60));
              }
              await page.keyboard.press('Space');
              await new Promise(r => setTimeout(r, 500));
              break;
            }
          }
          break;
      }
      console.log(`[Form Fill] Tier 1: ${field.label} → "${value.substring(0, 30)}"`);
    } catch (e) {
      console.log(`[Form Fill] Tier 1: failed "${field.label}": ${e}`);
    }
  }

  // Consent checkbox
  if (formConfig.consentSelector) {
    try {
      const consent = page.locator(formConfig.consentSelector).first();
      if (await consent.count() > 0) {
        await consent.click({ timeout: 3000 });
        console.log(`[Form Fill] Tier 1: consent checked`);
      }
    } catch { /* ok */ }
  }

  // Submit
  if (formConfig.submitSelector) {
    try {
      await page.locator(formConfig.submitSelector).first().click({ timeout: 5000 });
      console.log(`[Form Fill] Tier 1: submitted`);
      await new Promise(r => setTimeout(r, 3000));
      return true;
    } catch (e) {
      console.log(`[Form Fill] Tier 1: submit failed: ${e}`);
    }
  }

  return true;
}

// ============================================================
// Extract formConfig from filled page (Phase 2 — post-success)
// ============================================================

async function extractFormConfig(page: Page): Promise<FormConfig | null> {
  try {
    const config = await page.evaluate(() => {
      const fields: Array<{
        label: string; selector: string;
        type: "text" | "select" | "radix_select" | "radio" | "checkbox";
        value: string; required: boolean;
      }> = [];

      // Text inputs
      document.querySelectorAll<HTMLInputElement>('input[type="text"], input[type="email"], input[type="tel"], input:not([type])').forEach(input => {
        if (!input.value || input.type === 'hidden') return;
        const label = input.closest('label')?.textContent?.trim()
          || document.querySelector(`label[for="${input.id}"]`)?.textContent?.trim()
          || input.placeholder || input.name || '';
        const selector = input.id ? `#${input.id}` : input.name ? `input[name="${input.name}"]` : '';
        if (selector && label) {
          fields.push({ label: label.substring(0, 60), selector, type: "text", value: input.value, required: input.required });
        }
      });

      // Native selects
      document.querySelectorAll<HTMLSelectElement>('select').forEach(sel => {
        if (sel.selectedIndex <= 0) return;
        const label = sel.closest('label')?.textContent?.trim()
          || document.querySelector(`label[for="${sel.id}"]`)?.textContent?.trim()
          || sel.name || '';
        const selector = sel.id ? `#${sel.id}` : sel.name ? `select[name="${sel.name}"]` : '';
        if (selector) {
          const optText = sel.options[sel.selectedIndex]?.textContent?.trim() || '';
          fields.push({ label: label.substring(0, 60), selector, type: "select", value: optText, required: sel.required });
        }
      });

      // Textareas
      document.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(ta => {
        if (!ta.value) return;
        const label = ta.closest('label')?.textContent?.trim() || ta.name || '';
        const selector = ta.id ? `#${ta.id}` : ta.name ? `textarea[name="${ta.name}"]` : '';
        if (selector) {
          fields.push({ label: label.substring(0, 60), selector, type: "text", value: ta.value, required: ta.required });
        }
      });

      // Find submit button
      const submitBtn = document.querySelector('button[type="submit"], input[type="submit"], button:last-of-type');
      const submitSelector = submitBtn ? (
        (submitBtn as HTMLElement).id ? `#${(submitBtn as HTMLElement).id}` :
        submitBtn.textContent?.includes('Submit') ? 'button:has-text("Submit")' : ''
      ) : '';

      // Find consent checkbox
      const consentCheck = document.querySelector('input[type="checkbox"][name*="agree"], input[type="checkbox"][name*="consent"], button[role="checkbox"]');
      const consentSelector = consentCheck ? (
        (consentCheck as HTMLElement).id ? `#${(consentCheck as HTMLElement).id}` :
        consentCheck.getAttribute('role') === 'checkbox' ? 'button[role="checkbox"]' :
        'input[type="checkbox"]'
      ) : '';

      return { fields, submitSelector, consentSelector };
    });

    if (!config || config.fields.length === 0) return null;

    // Map field values to buyerDetailKeys based on label content
    const formFields: FormFieldConfig[] = config.fields.map(f => {
      const ll = f.label.toLowerCase();
      let buyerDetailKey: string | undefined;
      if (ll.includes('company name') || ll.includes('business name')) buyerDetailKey = 'name';
      else if (ll.includes('tin') || ll.includes('tax identification')) buyerDetailKey = 'tin';
      else if (ll.includes('brn') || ll.includes('business registration') || ll.includes('new business')) buyerDetailKey = 'brn';
      else if (ll.includes('email') && ll.includes('invoice')) buyerDetailKey = 'email';
      else if (ll.includes('email') && !ll.includes('invoice')) buyerDetailKey = 'email';
      else if (ll.includes('full name') || ll.includes('first name')) buyerDetailKey = 'userName';
      else if (ll.includes('last name')) buyerDetailKey = 'userLastName';
      else if (ll.includes('address') && !ll.includes('email')) buyerDetailKey = 'addressLine1';
      else if (ll.includes('city') || ll.includes('bandar')) buyerDetailKey = 'city';
      else if (ll.includes('state') || ll.includes('negeri')) buyerDetailKey = 'state';
      else if (ll.includes('postcode') || ll.includes('postal')) buyerDetailKey = 'postcode';
      else if (ll.includes('country')) buyerDetailKey = 'country';
      else if (ll.includes('phone') || ll.includes('mobile')) buyerDetailKey = 'phone';
      else if (ll.includes('order') || ll.includes('receipt') || ll.includes('reference')) buyerDetailKey = 'referenceNumber';
      else if (ll.includes('date') || ll.includes('payment')) buyerDetailKey = 'date';

      return {
        label: f.label,
        selector: f.selector,
        type: f.type,
        buyerDetailKey,
        defaultValue: !buyerDetailKey ? f.value : undefined, // Keep non-mapped values as defaults
        required: f.required,
      };
    });

    return {
      fields: formFields,
      submitSelector: config.submitSelector || undefined,
      consentSelector: config.consentSelector || undefined,
    };
  } catch (e) {
    console.log(`[Form Fill] extractFormConfig failed: ${e}`);
    return null;
  }
}

// ============================================================
// Troubleshooter (Phase 3 — Gemini vision diagnosis on failure)
// ============================================================

async function troubleshootFailure(
  geminiKey: string,
  screenshotB64: string,
  errorMessage: string,
  merchantName: string,
): Promise<void> {
  console.log(`[Troubleshooter] Diagnosing failure for "${merchantName}": ${errorMessage.substring(0, 80)}`);

  const diagnosis = await callGeminiVision(geminiKey, `You are a web form automation troubleshooter. Analyze this screenshot of a merchant e-invoice form that FAILED to submit.

ERROR: ${errorMessage}
MERCHANT: ${merchantName}

Look at the screenshot and answer:
1. What validation errors are visible? (e.g. "Company Industry cannot be none")
2. Which fields appear to be empty/unfilled that should have values?
3. Are there any dropdown menus that weren't selected?
4. What CSS selectors could be used to target the problematic fields?
5. What default values should be used for fields like Industry/Category?

Respond in JSON format:
{
  "diagnosis": "brief description of what went wrong",
  "unfilledFields": [
    {"label": "field name", "suggestedSelector": "CSS selector", "suggestedType": "text|select", "suggestedDefault": "value"}
  ],
  "fixable": true/false
}`, screenshotB64);

  console.log(`[Troubleshooter] Diagnosis: ${diagnosis.substring(0, 300)}`);

  // Try to parse and save the suggested fixes to formConfig
  try {
    // Extract JSON from the response (might have markdown wrapping)
    const jsonMatch = diagnosis.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.unfilledFields?.length > 0 && parsed.fixable) {
      // Build partial formConfig with the fixes
      const fixFields: FormFieldConfig[] = parsed.unfilledFields.map((f: any) => ({
        label: f.label || 'Unknown',
        selector: f.suggestedSelector || '',
        type: f.suggestedType || 'text',
        defaultValue: f.suggestedDefault || '',
        required: true,
      }));

      // Save to Convex — troubleshooter updates the formConfig with fix hints
      await convexMutation("functions/system:saveMerchantFormConfig", {
        merchantName,
        formConfig: {
          fields: fixFields,
          lastFailureReason: parsed.diagnosis || errorMessage.substring(0, 200),
        },
      });
      console.log(`[Troubleshooter] Saved ${fixFields.length} fix suggestions to formConfig`);
    }
  } catch (e) {
    console.log(`[Troubleshooter] Failed to parse/save diagnosis: ${e}`);
  }
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

async function prefillDropdown(page: Page, triggerText: string, targetValue: string): Promise<boolean> {
  try {
    // Debug: log all comboboxes on page
    const allCombos = page.getByRole('combobox');
    const comboCount = await allCombos.count();
    const comboTexts: string[] = [];
    for (let i = 0; i < comboCount; i++) {
      const t = await allCombos.nth(i).textContent().catch(() => '?');
      comboTexts.push(t?.trim() || '(empty)');
    }
    console.log(`[Form Fill] Found ${comboCount} comboboxes: [${comboTexts.join(', ')}]`);

    // Find the trigger — text match first, then index fallback
    let trigger = page.getByRole('combobox').filter({ hasText: triggerText }).first();
    if (await trigger.count() === 0) {
      console.log(`[Form Fill] No combobox with "${triggerText}", using first unselected`);
      // Find first combobox that still shows placeholder text
      for (let i = 0; i < comboCount; i++) {
        const text = comboTexts[i];
        if (text.toLowerCase().includes('select') || text === '(empty)') {
          trigger = allCombos.nth(i);
          break;
        }
      }
      if (await trigger.count() === 0) return false;
    }

    // Scroll the entire page to bottom, then scroll trigger into view
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(r => setTimeout(r, 500));
    await trigger.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 500));

    for (let attempt = 0; attempt < 2; attempt++) {
      console.log(`[Form Fill] Dropdown "${triggerText}" attempt ${attempt + 1}: focus+Space`);

      // Open with focus+Space (proven approach — click causes off-by-one)
      await trigger.focus({ timeout: 5000 });
      await page.keyboard.press('Space');
      await new Promise(r => setTimeout(r, 1000));

      // Check if dropdown opened
      const optionCount = await page.getByRole('option').count();
      console.log(`[Form Fill] Options visible: ${optionCount}`);

      if (optionCount > 0) {
        // Find target index in the option list
        const allOptionTexts = await page.evaluate(() =>
          Array.from(document.querySelectorAll('[role="option"]')).map(el => el.textContent?.trim() || '')
        );
        const targetIdx = allOptionTexts.findIndex(t => t.toLowerCase().includes(targetValue.toLowerCase()));
        console.log(`[Form Fill] Target "${targetValue}" at index ${targetIdx} of ${allOptionTexts.length}`);

        if (targetIdx >= 0) {
          // ArrowDown × targetIdx, then Space to select
          const presses = targetIdx + attempt; // +attempt for off-by-one retry
          for (let i = 0; i < presses; i++) {
            await page.keyboard.press('ArrowDown');
            await new Promise(r => setTimeout(r, 80));
          }
          await page.keyboard.press('Space');
          await new Promise(r => setTimeout(r, 1500));
        }

        // Verify with page.evaluate (locator becomes stale after text change)
        const comboTexts = await page.evaluate(() =>
          Array.from(document.querySelectorAll('[role="combobox"]')).map(el => el.textContent?.trim() || '')
        );
        const found = comboTexts.some(t => t.toLowerCase().includes(targetValue.toLowerCase()));
        if (found) {
          console.log(`[Form Fill] Dropdown "${triggerText}" → "${targetValue}" ✓`);
          return true;
        }
        console.log(`[Form Fill] Combobox texts after: [${comboTexts.join(', ')}]`);
      } else {
        console.log(`[Form Fill] Dropdown didn't open`);
      }

      await page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 300));
    }

    return false;
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
    if (navStatus === 403 || navStatus === 401) {
      throw new Error(`BOT_BLOCKED: Merchant site returned ${navStatus} (Cloudflare/WAF protection). This merchant requires manual form submission.`);
    }
    if (navStatus === 503) {
      // 503 could be bot protection OR temporary outage — check for Cloudflare headers
      const isCloudflareChallenege = await page.evaluate(() =>
        document.querySelector('meta[name="captcha-bypass"]') !== null ||
        document.title.toLowerCase().includes('just a moment') ||
        document.title.toLowerCase().includes('attention required')
      ).catch(() => false);
      if (isCloudflareChallenege) {
        throw new Error(`BOT_BLOCKED: Merchant site has Cloudflare protection. This merchant requires manual form submission.`);
      }
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
    const ed = event.extractedData || {};
    const merchantName = ed.vendorName || '';

    console.log(`[Form Fill] Buyer: ${userName}, ${bd.email}, state: ${state}, city: ${city}`);

    // Build flat buyerDetails map for Tier 1
    const buyerDetailsMap: Record<string, string> = {
      name: bd.name, userName, tin: bd.tin, brn: bd.brn,
      email: bd.email, phone: phoneLocal,
      addressLine1: streetAddress, address: streetAddress,
      city, state, postcode: '47100', country: 'Malaysia',
      referenceNumber: ed.referenceNumber || '', date: ed.date || '',
    };

    // ── TIER 1: Check for saved formConfig ──
    let usedTier1 = false;
    if (merchantName) {
      try {
        const lookup = await convexQuery("functions/system:lookupMerchantEinvoiceUrl", {
          vendorName: merchantName, country: "MY",
        }) as { formConfig?: FormConfig } | null;

        if (lookup?.formConfig?.fields?.length && (lookup.formConfig.successCount || 0) > 0) {
          console.log(`[Form Fill] ⚡ Tier 1: found formConfig for "${merchantName}" (${lookup.formConfig.fields.length} fields, ${lookup.formConfig.successCount} successes)`);
          const tier1Ok = await executeTier1(page, lookup.formConfig, buyerDetailsMap);
          if (tier1Ok) {
            usedTier1 = true;
            await browser.close();
            const durationMs = Date.now() - startTime;
            console.log(`[Form Fill] ⚡ Tier 1 completed in ${durationMs}ms`);

            await convexMutation("functions/system:reportEinvoiceFormFillResult", {
              expenseClaimId: event.expenseClaimId, emailRef: event.emailRef,
              status: "success", durationMs,
            });
            // Increment success count
            try {
              await convexMutation("functions/system:saveMerchantFormConfig", {
                merchantName, formConfig: lookup.formConfig,
              });
            } catch { /* non-fatal */ }

            return { success: true, durationMs };
          }
          console.log(`[Form Fill] Tier 1 failed — falling back to Tier 2 (CUA)`);
        }
      } catch (e) {
        console.log(`[Form Fill] Tier 1 lookup failed: ${e}`);
      }
    }

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

    // 6. Pre-fill native <select> dropdowns with Playwright (CUA can't click dropdown options reliably)
    try {
      const nativeSelects = await page.evaluate((details: { state: string; city: string }) => {
        const selects = Array.from(document.querySelectorAll('select'));
        return selects.map(s => {
          const label = s.closest('label')?.textContent?.trim()
            || document.querySelector(`label[for="${s.id}"]`)?.textContent?.trim()
            || s.name || s.id || '';
          return {
            name: s.name || s.id || '',
            label: label.toLowerCase(),
            options: Array.from(s.options).map(o => ({ value: o.value, text: o.textContent?.trim() || '' })),
            currentValue: s.value,
          };
        }).filter(s => s.options.length > 1);
      }, { state, city });

      for (const sel of nativeSelects) {
        if (sel.currentValue && sel.currentValue !== '' && sel.currentValue !== '-None-') continue; // already filled

        const selector = sel.name ? `select[name="${sel.name}"]` : `select[id="${sel.name}"]`;
        let picked = '';

        // Try to match by label context
        if (sel.label.includes('state') || sel.label.includes('negeri')) {
          const opt = sel.options.find(o => o.text.toLowerCase().includes(state.toLowerCase()));
          if (opt) { await page.selectOption(selector, opt.value); picked = opt.text; }
        } else if (sel.label.includes('city') || sel.label.includes('bandar')) {
          const opt = sel.options.find(o => o.text.toLowerCase().includes(city.toLowerCase()));
          if (opt) { await page.selectOption(selector, opt.value); picked = opt.text; }
        } else if (sel.label.includes('country') || sel.label.includes('negara')) {
          const opt = sel.options.find(o => o.text.toLowerCase().includes('malaysia'));
          if (opt) { await page.selectOption(selector, opt.value); picked = opt.text; }
        } else if (sel.label.includes('industry') || sel.label.includes('sector')) {
          // Default to "Others" or first non-placeholder option
          const opt = sel.options.find(o => o.text.toLowerCase().includes('other'))
            || sel.options.find(o => o.value && o.value !== '-None-' && o.value !== '');
          if (opt) { await page.selectOption(selector, opt.value); picked = opt.text; }
        } else if (sel.label.includes('salut')) {
          const opt = sel.options.find(o => o.text.includes('Mr')) || sel.options[1];
          if (opt) { await page.selectOption(selector, opt.value); picked = opt.text; }
        }

        if (picked) console.log(`[Form Fill] Pre-filled <select> "${sel.name}" → "${picked}"`);
      }
    } catch (e) {
      console.log(`[Form Fill] Native select pre-fill: ${e}`);
    }

    // 7. Pre-analyze form fields
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

    // 7. Build receipt context (for forms that need receipt details)
    const receiptContext = ed.referenceNumber
      ? `\nRECEIPT DETAILS (use if form asks for order/receipt/transaction info):
- Order/Receipt/Reference Number: ${ed.referenceNumber}
- Transaction Date/Payment Date: ${ed.date || 'N/A'}
- Amount: ${ed.amount || 'N/A'}`
      : '';

    // 8. Build CUA instruction — GENERIC (works for any merchant form)
    const instruction = `You are on a merchant e-invoice request form. Fill ALL visible fields with the buyer details below, then submit.

BUYER DETAILS — use these to fill any matching fields:
- Full Name / Contact Person: ${userName}
- Email / E-Invoice Email: ${bd.email}
- Phone / Mobile: ALREADY FILLED — skip any phone field
- Company Name: ${bd.name}
- Business Registration Number (BRN) / New BRN: ${bd.brn}
- Tax Identification Number (TIN): ${bd.tin}
- SST Registration Number: N/A (leave blank if optional)
- Company Address / Address Line 1: ${streetAddress}
- City: ${city}
- Postcode: 47100
- State: ${state}
- Country: Malaysia
${receiptContext}

INSTRUCTIONS:
1. Start from the TOP of the form. Fill fields as you scroll DOWN — do NOT scroll back up.
2. If there's a "Company" vs "Individual" choice, select "Company".
3. Fill ALL fields that match the buyer details above. Use your best judgment for field matching.
4. Dropdown menus (State, City, Industry, etc.) are ALREADY PRE-FILLED. Do NOT change them unless they show an error.
5. After filling ALL fields, check any terms/consent checkbox.
6. Click Submit / Send / Request button.
7. If validation errors appear, fix them and resubmit. Do NOT touch the phone field.
8. EFFICIENCY: Fill multiple visible fields before scrolling. Do not waste turns scrolling back and forth.
${formFieldsSummary}`;

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

    // 9. Post-CUA: fix up Radix Select dropdowns if present (CUA can't reliably interact with them)
    // Only attempt if form has Radix-style "Select state" or "Select city" comboboxes specifically
    const hasRadixState = await page.getByRole('combobox').filter({ hasText: 'Select state' }).count() > 0;
    const hasRadixCity = await page.getByRole('combobox').filter({ hasText: 'Select city' }).count() > 0;
    const hasRadixDropdowns = hasRadixState || hasRadixCity;
    let stateOk = true;

    if (hasRadixDropdowns) {
      console.log(`[Form Fill] Radix dropdowns detected — pre-filling state/city with Playwright`);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 1000));

      stateOk = await prefillDropdown(page, 'Select state', state);
      console.log(`[Form Fill] State: ${stateOk ? state : 'FAILED'}`);

      if (stateOk) {
        await new Promise(r => setTimeout(r, 2000));
        const cityOk = await prefillDropdown(page, 'Select city', city);
        console.log(`[Form Fill] City: ${cityOk ? city : 'FAILED'}`);
      }

      // Check terms checkbox (Radix-style)
      await new Promise(r => setTimeout(r, 500));
      const checkbox = page.locator('button[role="checkbox"]');
      if (await checkbox.count() > 0) {
        const isChecked = await checkbox.getAttribute('data-state');
        if (isChecked !== 'checked') await checkbox.click();
        console.log(`[Form Fill] Terms checked (Radix)`);
      }

      // Submit (Radix forms — CUA was told to stop before submit)
      const submitBtn = page.locator('button:has-text("Submit")');
      if (await submitBtn.count() > 0) {
        await submitBtn.click();
        console.log(`[Form Fill] Submitted (Playwright)`);
        await new Promise(r => setTimeout(r, 5000));
      }
    } else {
      console.log(`[Form Fill] No Radix dropdowns — CUA handled the full form`);
      // CUA already filled everything and submitted (generic instruction includes submit step)
      await new Promise(r => setTimeout(r, 3000));
    }

    // ── Phase 2: On success, extract and save formConfig ──
    if (stateOk && merchantName) {
      try {
        const formConfig = await extractFormConfig(page);
        if (formConfig && formConfig.fields.length > 0) {
          await convexMutation("functions/system:saveMerchantFormConfig", {
            merchantName,
            formConfig,
          });
          console.log(`[Form Fill] 📝 Saved formConfig: ${formConfig.fields.length} fields (next run uses Tier 1)`);
        }
      } catch (e) {
        console.log(`[Form Fill] formConfig save failed (non-fatal): ${e}`);
      }
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

    // ── Phase 3: On failure, troubleshoot with Gemini vision ──
    const geminiKey = process.env.GEMINI_API_KEY;
    const merchantName = event.extractedData?.vendorName || '';
    if (geminiKey && merchantName && browser && !errorMessage.startsWith('BOT_BLOCKED')) {
      try {
        // Take diagnostic screenshot before closing browser
        const pages = browser.contexts()?.[0]?.pages();
        if (pages?.length) {
          const screenshotB64 = (await pages[0].screenshot({ type: "png" })).toString("base64");
          // Fire-and-forget — don't let troubleshooter delay error reporting
          troubleshootFailure(geminiKey, screenshotB64, errorMessage, merchantName)
            .catch(e => console.log(`[Troubleshooter] Error: ${e}`));
        }
      } catch (e) {
        console.log(`[Troubleshooter] Screenshot failed: ${e}`);
      }
    }

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

    // Wait briefly for troubleshooter to finish (it's async but we have a few seconds before Lambda exits)
    await new Promise(r => setTimeout(r, 3000));

    return { success: false, error: errorMessage, durationMs };
  }
}

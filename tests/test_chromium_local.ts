/**
 * Test: Local Chromium + Playwright for form fill
 * Tests the FamilyMart state dropdown that crashes in Browserbase.
 *
 * Run: npx tsx tests/test_chromium_local.ts
 */

import * as pw from 'playwright';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const URL = 'https://fmeinvoice.ql.com.my/?storeCode=0346&receiptNo=00000P1331000531809&transDate=2026-02-26';

async function main() {
  console.log('=== Local Chromium Form Fill Test ===\n');

  // Use Playwright's bundled Chromium (same as real Chrome, headless)
  const browser = await pw.chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('pageerror', (err: Error) => console.log('[PAGE ERROR]', err.message.substring(0, 300)));

  console.log('1. Navigating to FamilyMart form...');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  const vp = await page.evaluate(() => ({
    w: window.innerWidth, h: window.innerHeight,
  }));
  console.log(`   Viewport: ${vp.w}x${vp.h}\n`);

  // 2. Click Company
  console.log('2. Clicking Company...');
  await page.evaluate(() => window.scrollTo(0, 800));
  await new Promise(r => setTimeout(r, 500));
  await page.getByText('Company', { exact: true }).click();
  await new Promise(r => setTimeout(r, 1000));
  console.log('   Done\n');

  // 3. Fill text fields
  console.log('3. Filling text fields...');
  await page.locator('input[placeholder*="Siti"]').fill('Yee Fei Ooi');
  await page.locator('input[placeholder*="siti.aisyah"]').fill('einvoice+test@einv.hellogroot.com');
  const phoneInput = page.locator('input[type="tel"]');
  if (await phoneInput.count() > 0) {
    await phoneInput.click({ clickCount: 3 });
    await page.keyboard.type('132201176');
  }
  console.log('   Personal details filled\n');

  await page.evaluate(() => window.scrollTo(0, 1200));
  await new Promise(r => setTimeout(r, 500));
  await page.locator('input[placeholder*="ABC Sdn"]').fill('Groot Test Account');
  await page.locator('input[placeholder*="201901"]').fill('200012345X');
  await page.locator('input[placeholder*="C20830"]').fill('IG24210777100');
  await page.locator('textarea[placeholder*="unit no"]').fill('4 Jalan Selamat');
  console.log('   Company details filled\n');

  // 4. THE BIG TEST: State dropdown
  console.log('4. Selecting state (Selangor) via keyboard...');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 500));

  const stateBtn = page.getByRole('combobox').filter({ hasText: 'Select state' }).first();
  await stateBtn.focus();
  await page.keyboard.press('Space');
  await new Promise(r => setTimeout(r, 1000));

  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('ArrowDown');
    await new Promise(r => setTimeout(r, 100));
  }
  await page.keyboard.press('Space');
  await new Promise(r => setTimeout(r, 2000));

  const stateVal = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.filter(b => (b.textContent || '').includes('Selangor') || (b.textContent || '').includes('Select state'))
      .map(b => b.textContent?.trim()).join(' | ');
  });
  console.log(`   State value: ${stateVal || '(empty — crashed)'}`);

  if (stateVal.includes('Selangor')) {
    console.log('   ✅ STATE SELECTED SUCCESSFULLY!\n');

    // 5. City
    console.log('5. Selecting city...');
    await new Promise(r => setTimeout(r, 1000));
    const cityBtn = page.getByRole('combobox').filter({ hasText: 'Select city' });
    if (await cityBtn.count() > 0) {
      await cityBtn.first().focus();
      await page.keyboard.press('Space');
      await new Promise(r => setTimeout(r, 1000));
      // Type 'p' then arrow down to find Puchong
      for (let i = 0; i < 15; i++) {
        await page.keyboard.press('ArrowDown');
        await new Promise(r => setTimeout(r, 100));
      }
      await page.keyboard.press('Space');
      await new Promise(r => setTimeout(r, 1000));

      const cityVal = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        return btns.filter(b => (b.textContent || '').includes('city') || (b.textContent || '').includes('Puchong') || (b.textContent || '').includes('Petaling'))
          .map(b => b.textContent?.trim()).join(' | ');
      });
      console.log(`   City: ${cityVal}\n`);
    }

    // 6. Terms + Submit
    console.log('6. Terms + Submit...');
    const checkbox = page.locator('button[role="checkbox"]');
    if (await checkbox.count() > 0) await checkbox.click();
    await page.locator('button:has-text("Submit")').click();
    await new Promise(r => setTimeout(r, 5000));
    console.log(`   Post-submit URL: ${page.url()}\n`);
  } else {
    console.log('   ❌ STATE SELECTION FAILED\n');
  }

  const fs = await import('fs');
  const shot = await page.screenshot({ type: 'png' });
  fs.writeFileSync(path.join(__dirname, 'chromium_local_result.png'), shot);
  console.log('Screenshot saved');
  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

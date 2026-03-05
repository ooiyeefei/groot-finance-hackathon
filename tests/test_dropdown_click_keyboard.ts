/**
 * Test: Click-to-open + keyboard selection for Radix Select dropdowns
 * Mimics the exact Lambda handler approach.
 *
 * Run: npx tsx tests/test_dropdown_click_keyboard.ts
 */
import * as pw from 'playwright';

const URL = 'https://fmeinvoice.ql.com.my/?storeCode=0346&receiptNo=00000P1331000531809&transDate=2026-02-26';

async function testDropdown(page: pw.Page, triggerText: string, targetValue: string): Promise<boolean> {
  const allCombos = page.getByRole('combobox');
  const comboCount = await allCombos.count();
  const comboTexts: string[] = [];
  for (let i = 0; i < comboCount; i++) {
    const t = await allCombos.nth(i).textContent().catch(() => '?');
    comboTexts.push(t?.trim() || '(empty)');
  }
  console.log(`  Found ${comboCount} comboboxes: [${comboTexts.join(', ')}]`);

  let trigger = page.getByRole('combobox').filter({ hasText: triggerText }).first();
  if (await trigger.count() === 0) {
    console.log(`  No combobox with "${triggerText}"`);
    return false;
  }

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 500));
  await trigger.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 500));

  for (let attempt = 0; attempt < 2; attempt++) {
    console.log(`  Attempt ${attempt + 1}: focus+Space to open...`);

    // Always use focus+Space (proven working approach from test_chromium_local.ts)
    await trigger.focus({ timeout: 3000 }).catch(() => {});
    await page.keyboard.press('Space');
    await new Promise(r => setTimeout(r, 1000));

    const optionCount = await page.getByRole('option').count();
    console.log(`  Options visible: ${optionCount}`);

    if (optionCount > 0) {
      // Find the index of our target option
      const allOptionTexts = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[role="option"]')).map(el => el.textContent?.trim() || '')
      );
      console.log(`  Options: ${allOptionTexts.slice(0, 5).join(', ')}...`);
      const targetIdx = allOptionTexts.findIndex(t => t.toLowerCase().includes(targetValue.toLowerCase()));
      console.log(`  Target "${targetValue}" at index ${targetIdx}`);

      if (targetIdx >= 0) {
        // Test both counts to see which one works
        const presses = targetIdx; // NOT targetIdx+1 — Space opens with no item highlighted
        console.log(`  Pressing ArrowDown × ${presses}, then Space...`);
        for (let i = 0; i < presses; i++) {
          await page.keyboard.press('ArrowDown');
          await new Promise(r => setTimeout(r, 80));
        }
        await page.keyboard.press('Space');
        await new Promise(r => setTimeout(r, 1500));
      }

      // Verify with page.evaluate — locator filter becomes stale after text changes
      const allComboTexts = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[role="combobox"]')).map(el => el.textContent?.trim() || '')
      );
      console.log(`  After selection, combobox texts: [${allComboTexts.join(', ')}]`);
      const found = allComboTexts.some(t => t.toLowerCase().includes(targetValue.toLowerCase()));
      if (found) {
        console.log(`  ✅ Selected: "${targetValue}"`);
        return true;
      }
      console.log(`  ❌ "${targetValue}" not found in combobox texts`);
    } else {
      console.log(`  Dropdown didn't open`);
    }

    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

async function main() {
  console.log('=== Dropdown Click+Keyboard Test ===\n');

  const browser = await pw.chromium.launch({ headless: true, args: ['--no-sandbox', '--headless=new'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('1. Navigating...');
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  console.log(`   URL: ${page.url()}\n`);

  // Click Company + fill a field so dropdown section is visible
  console.log('2. Clicking Company...');
  await page.evaluate(() => window.scrollTo(0, 800));
  await new Promise(r => setTimeout(r, 500));
  await page.getByText('Company', { exact: true }).click();
  await new Promise(r => setTimeout(r, 1000));

  // Fill some text fields (minimal — just enough to see dropdowns)
  await page.locator('input[placeholder*="Siti"]').fill('Test User');
  await page.locator('input[placeholder*="ABC Sdn"]').fill('Test Company');
  console.log('   Fields filled\n');

  // Scroll to bottom
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await new Promise(r => setTimeout(r, 1000));

  // Test state dropdown
  console.log('3. Testing STATE dropdown (Selangor)...');
  const stateOk = await testDropdown(page, 'Select state', 'Selangor');
  console.log(`   State: ${stateOk ? '✅ OK' : '❌ FAILED'}\n`);

  if (stateOk) {
    await new Promise(r => setTimeout(r, 2000));
    console.log('4. Testing CITY dropdown (Puchong)...');
    const cityOk = await testDropdown(page, 'Select city', 'Puchong');
    console.log(`   City: ${cityOk ? '✅ OK' : '❌ FAILED'}\n`);
  }

  // Screenshot
  const fs = await import('fs');
  const path = await import('path');
  const shot = await page.screenshot({ type: 'png' });
  fs.writeFileSync(path.join(__dirname, 'dropdown_test_result.png'), shot);
  console.log('Screenshot saved to tests/dropdown_test_result.png');

  await browser.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });

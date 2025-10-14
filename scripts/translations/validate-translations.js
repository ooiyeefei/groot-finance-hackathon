#!/usr/bin/env node

/**
 * Translation Key Consistency Validator
 *
 * Ensures all locale files have the same translation keys as the base English file.
 * Prevents runtime errors where translation keys are missing in specific locales.
 *
 * Usage: npm run validate-translations
 */

const fs = require('fs');
const path = require('path');

const messagesDir = path.join(__dirname, '../../src/messages');
const baseLocale = 'en.json';

function getKeys(obj, prefix = '') {
  return Object.keys(obj).reduce((res, el) => {
    if (typeof obj[el] === 'object' && obj[el] !== null) {
      return [...res, ...getKeys(obj[el], prefix + el + '.')];
    }
    return [...res, prefix + el];
  }, []);
}

function validateTranslations() {
  if (!fs.existsSync(messagesDir)) {
    console.error(`❌ Messages directory not found: ${messagesDir}`);
    process.exit(1);
  }

  const baseFile = path.join(messagesDir, baseLocale);
  if (!fs.existsSync(baseFile)) {
    console.error(`❌ Base locale file not found: ${baseFile}`);
    process.exit(1);
  }

  let baseMessages;
  try {
    baseMessages = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
  } catch (error) {
    console.error(`❌ Error parsing base locale file ${baseLocale}:`, error.message);
    process.exit(1);
  }

  const baseKeys = new Set(getKeys(baseMessages));
  let hasError = false;
  const validatedFiles = [];

  console.log(`🔍 Validating translation files against base locale: ${baseLocale}`);
  console.log(`📍 Base file has ${baseKeys.size} translation keys`);

  const localeFiles = fs.readdirSync(messagesDir)
    .filter(file => file.endsWith('.json') && file !== baseLocale);

  if (localeFiles.length === 0) {
    console.log(`⚠️  No locale files found besides base ${baseLocale}`);
    return;
  }

  localeFiles.forEach(file => {
    const filePath = path.join(messagesDir, file);
    let localeMessages;

    try {
      localeMessages = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (error) {
      console.error(`❌ Error parsing ${file}:`, error.message);
      hasError = true;
      return;
    }

    const localeKeys = new Set(getKeys(localeMessages));

    // Check for missing keys
    const missingKeys = [...baseKeys].filter(key => !localeKeys.has(key));

    // Check for extra keys (not in base)
    const extraKeys = [...localeKeys].filter(key => !baseKeys.has(key));

    if (missingKeys.length > 0) {
      console.error(`\n❌ Error in ${file}: Missing ${missingKeys.length} keys:`);
      missingKeys.forEach(key => console.error(`   - ${key}`));
      hasError = true;
    }

    if (extraKeys.length > 0) {
      console.warn(`\n⚠️  Warning in ${file}: Extra ${extraKeys.length} keys not in base:`);
      extraKeys.forEach(key => console.warn(`   + ${key}`));
    }

    if (missingKeys.length === 0 && extraKeys.length === 0) {
      console.log(`✅ ${file}: Perfect match (${localeKeys.size} keys)`);
    } else if (missingKeys.length === 0) {
      console.log(`✅ ${file}: All required keys present (${localeKeys.size} keys, ${extraKeys.length} extra)`);
    }

    validatedFiles.push(file);
  });

  console.log(`\n📊 Validation Summary:`);
  console.log(`   Base locale: ${baseLocale} (${baseKeys.size} keys)`);
  console.log(`   Validated files: ${validatedFiles.length}`);

  if (hasError) {
    console.error(`\n❌ Validation failed! Fix missing keys before building.`);
    console.error(`   Run this script again after adding missing translations.`);
    process.exit(1);
  } else {
    console.log(`\n✅ All translation files are consistent!`);
    console.log(`   Safe to proceed with build.`);
  }
}

// Main execution
if (require.main === module) {
  validateTranslations();
}

module.exports = { validateTranslations };
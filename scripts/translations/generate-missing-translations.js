#!/usr/bin/env node

/**
 * Generate Missing Translations Script
 *
 * Consolidates translation generation from English (single source of truth) to target languages.
 * Uses SEALION AI API to translate missing keys automatically.
 *
 * Usage: node scripts/generate-missing-translations.js <target-language>
 * Example: node scripts/generate-missing-translations.js th
 *
 * Supported target languages: th (Thai), id (Indonesian), zh (Chinese)
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../..', '.env.local') });

// ===========================
// Configuration
// ===========================

const SEALION_ENDPOINT_URL = process.env.SEALION_ENDPOINT_URL;
const SEALION_MODEL_ID = process.env.SEALION_MODEL_ID;

// Language mapping for AI translation prompts
const LANGUAGE_MAP = {
  'th': 'Thai',
  'id': 'Indonesian',
  'zh': 'Chinese (Simplified)'
};

// Rate limiting delay (milliseconds between API calls)
const RATE_LIMIT_DELAY = 300;

// ===========================
// Environment Validation
// ===========================

if (!SEALION_ENDPOINT_URL || !SEALION_MODEL_ID) {
  console.error('❌ Error: Missing SEALION configuration in .env.local');
  console.error('   Required environment variables:');
  console.error('   - SEALION_ENDPOINT_URL');
  console.error('   - SEALION_MODEL_ID');
  process.exit(1);
}

// ===========================
// Helper Functions
// ===========================

/**
 * Translate English text to target language using SEALION AI
 */
async function translateText(englishText, targetLanguage) {
  const targetLangName = LANGUAGE_MAP[targetLanguage];

  const prompt = `Translate the following English text to ${targetLangName}. Only return the translated text, no explanations or quotes:

"${englishText}"`;

  try {
    // Ensure endpoint URL has protocol
    const endpoint = SEALION_ENDPOINT_URL.startsWith('http')
      ? `${SEALION_ENDPOINT_URL}/chat/completions`
      : `https://${SEALION_ENDPOINT_URL}/chat/completions`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: SEALION_MODEL_ID,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const translatedText = data.choices[0].message.content.trim();

    // Remove surrounding quotes if present
    return translatedText.replace(/^["']|["']$/g, '');
  } catch (error) {
    console.error(`   ⚠️  Translation API failed: ${error.message}`);
    console.error(`   📝 Falling back to English for: "${englishText}"`);
    return englishText; // Fallback to original text
  }
}

/**
 * Get nested value from object using dot notation path
 */
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current && current[key], obj);
}

/**
 * Set nested value in object using dot notation path
 */
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((current, key) => {
    if (!current[key]) current[key] = {};
    return current[key];
  }, obj);
  target[lastKey] = value;
}

/**
 * Get all keys from nested object in dot notation format
 */
function getAllKeys(obj, prefix = '') {
  let keys = [];
  for (const key in obj) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys = keys.concat(getAllKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

/**
 * Load JSON file safely
 */
function loadJsonFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Error loading file ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Save JSON file with pretty formatting
 */
function saveJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
    return true;
  } catch (error) {
    console.error(`❌ Error saving file ${filePath}:`, error.message);
    return false;
  }
}

// ===========================
// Translation Logic
// ===========================

/**
 * Translate all missing keys from English to target language
 */
async function translateMissingKeys(targetLanguage, englishTranslations, existingTranslations = {}) {
  const result = { ...existingTranslations };
  const allEnglishKeys = getAllKeys(englishTranslations);
  const existingKeys = getAllKeys(existingTranslations);
  const missingKeys = allEnglishKeys.filter(key => !existingKeys.includes(key));

  if (missingKeys.length === 0) {
    console.log('✅ All translations already exist! No work needed.');
    return result;
  }

  console.log(`\n🔄 Translating ${missingKeys.length} missing keys to ${targetLanguage.toUpperCase()}...\n`);

  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < missingKeys.length; i++) {
    const key = missingKeys[i];
    const englishValue = getNestedValue(englishTranslations, key);

    if (!englishValue) {
      console.log(`   ⚠️  [${i + 1}/${missingKeys.length}] Skipping ${key}: No English value`);
      failureCount++;
      continue;
    }

    console.log(`   🔄 [${i + 1}/${missingKeys.length}] ${key}`);
    console.log(`      EN: "${englishValue}"`);

    const translatedValue = await translateText(englishValue, targetLanguage);
    console.log(`      ${targetLanguage.toUpperCase()}: "${translatedValue}"\n`);

    setNestedValue(result, key, translatedValue);
    successCount++;

    // Rate limiting delay (except for last item)
    if (i < missingKeys.length - 1) {
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
    }
  }

  console.log(`\n📊 Translation Complete:`);
  console.log(`   ✅ Success: ${successCount}`);
  if (failureCount > 0) {
    console.log(`   ⚠️  Failures: ${failureCount}`);
  }

  return result;
}

// ===========================
// Main Execution
// ===========================

async function main() {
  console.log('🌍 FinanSEAL Translation Generator');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Validate command-line arguments
  const targetLanguage = process.argv[2];
  const supportedLanguages = Object.keys(LANGUAGE_MAP);

  if (!targetLanguage) {
    console.error('❌ Error: Missing target language argument\n');
    console.error('Usage: node scripts/generate-missing-translations.js <language>');
    console.error(`Supported languages: ${supportedLanguages.join(', ')}\n`);
    console.error('Examples:');
    console.error('  node scripts/generate-missing-translations.js th');
    console.error('  node scripts/generate-missing-translations.js id');
    process.exit(1);
  }

  if (!supportedLanguages.includes(targetLanguage)) {
    console.error(`❌ Error: Unsupported language "${targetLanguage}"\n`);
    console.error(`Supported languages: ${supportedLanguages.join(', ')}`);
    process.exit(1);
  }

  console.log(`🎯 Target Language: ${LANGUAGE_MAP[targetLanguage]} (${targetLanguage})`);
  console.log(`🤖 Translation Engine: SEALION AI`);
  console.log(`⏱️  Rate Limit Delay: ${RATE_LIMIT_DELAY}ms between calls\n`);

  // Load English translations (source of truth)
  const enPath = path.join(__dirname, '../..', 'src', 'messages', 'en.json');
  console.log(`📖 Loading English translations: ${enPath}`);

  const englishTranslations = loadJsonFile(enPath);
  if (!englishTranslations) {
    console.error('❌ Failed to load English translations. Exiting.');
    process.exit(1);
  }

  // Load existing target language translations
  const targetPath = path.join(__dirname, '../..', 'src', 'messages', `${targetLanguage}.json`);
  console.log(`📖 Loading existing ${targetLanguage.toUpperCase()} translations: ${targetPath}`);

  let existingTranslations = {};
  if (fs.existsSync(targetPath)) {
    existingTranslations = loadJsonFile(targetPath);
    if (!existingTranslations) {
      console.error(`❌ Failed to load existing ${targetLanguage.toUpperCase()} translations. Exiting.`);
      process.exit(1);
    }
  } else {
    console.log(`   ℹ️  No existing file found. Will create new file.`);
  }

  // Calculate statistics
  const allEnglishKeys = getAllKeys(englishTranslations);
  const existingKeys = getAllKeys(existingTranslations);
  const missingKeys = allEnglishKeys.filter(key => !existingKeys.includes(key));

  console.log(`\n📊 Statistics:`);
  console.log(`   📝 Total English keys: ${allEnglishKeys.length}`);
  console.log(`   ✅ Existing ${targetLanguage.toUpperCase()} keys: ${existingKeys.length}`);
  console.log(`   ❓ Missing keys to translate: ${missingKeys.length}`);
  console.log(`   📈 Coverage: ${((existingKeys.length / allEnglishKeys.length) * 100).toFixed(1)}%`);

  if (missingKeys.length === 0) {
    console.log(`\n✅ All translations complete! Nothing to do.\n`);
    return;
  }

  // Confirm before starting translation
  console.log(`\n⚠️  This will translate ${missingKeys.length} keys using SEALION AI.`);
  console.log(`⏱️  Estimated time: ~${Math.ceil((missingKeys.length * RATE_LIMIT_DELAY) / 1000 / 60)} minutes`);
  console.log(`\nStarting translation in 3 seconds... (Press Ctrl+C to cancel)\n`);

  await new Promise(resolve => setTimeout(resolve, 3000));

  // Generate translations for missing keys
  const updatedTranslations = await translateMissingKeys(
    targetLanguage,
    englishTranslations,
    existingTranslations
  );

  // Save updated translations
  console.log(`\n💾 Saving translations to: ${targetPath}`);

  if (saveJsonFile(targetPath, updatedTranslations)) {
    const finalKeys = getAllKeys(updatedTranslations);
    const newCoverage = ((finalKeys.length / allEnglishKeys.length) * 100).toFixed(1);

    console.log(`\n✅ Success! Translations saved.`);
    console.log(`\n📊 Final Statistics:`);
    console.log(`   📝 Total keys: ${finalKeys.length}/${allEnglishKeys.length}`);
    console.log(`   📈 Coverage: ${newCoverage}%`);
    console.log(`   ➕ Added: ${missingKeys.length} new translations\n`);
  } else {
    console.error('\n❌ Failed to save translations. Check file permissions.\n');
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  translateText,
  getAllKeys,
  getNestedValue,
  setNestedValue
};

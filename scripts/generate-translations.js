const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// SEALION API configuration
const SEALION_ENDPOINT_URL = process.env.SEALION_ENDPOINT_URL;
const SEALION_MODEL_ID = process.env.SEALION_MODEL_ID;

if (!SEALION_ENDPOINT_URL || !SEALION_MODEL_ID) {
  console.error('❌ SEALION_ENDPOINT_URL or SEALION_MODEL_ID not found in .env.local');
  process.exit(1);
}

async function translateText(text, targetLanguage) {
  const languageMap = {
    'th': 'Thai',
    'id': 'Indonesian'
  };

  const prompt = `Translate the following English text to ${languageMap[targetLanguage]}. Only return the translated text, no explanations:

"${text}"`;

  try {
    const response = await fetch(`${SEALION_ENDPOINT_URL}/chat/completions`, {
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
    return data.choices[0].message.content.trim().replace(/^"|"$/g, '');
  } catch (error) {
    console.error(`❌ Translation failed for "${text}" to ${targetLanguage}:`, error);
    return text; // Fallback to original text
  }
}

async function translateKeys(keys, targetLanguage, existingTranslations = {}) {
  const result = { ...existingTranslations };

  for (const key of keys) {
    // Skip if translation already exists
    if (getNestedValue(result, key)) {
      console.log(`⏭️ Skipping existing key: ${key}`);
      continue;
    }

    const englishValue = getNestedValue(await getEnglishTranslations(), key);
    if (!englishValue) {
      console.log(`⚠️ No English value found for key: ${key}`);
      continue;
    }

    console.log(`🔄 Translating: ${key} = "${englishValue}"`);
    const translatedValue = await translateText(englishValue, targetLanguage);
    console.log(`✅ Result: "${translatedValue}"`);

    setNestedValue(result, key, translatedValue);

    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return result;
}

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current && current[key], obj);
}

function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((current, key) => {
    if (!current[key]) current[key] = {};
    return current[key];
  }, obj);
  target[lastKey] = value;
}

async function getEnglishTranslations() {
  const enPath = path.join(__dirname, '..', 'src', 'messages', 'en.json');
  return JSON.parse(fs.readFileSync(enPath, 'utf8'));
}

async function getChineseTranslations() {
  const zhPath = path.join(__dirname, '..', 'src', 'messages', 'zh.json');
  return JSON.parse(fs.readFileSync(zhPath, 'utf8'));
}

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

async function main() {
  const targetLanguage = process.argv[2];
  if (!targetLanguage || !['th', 'id'].includes(targetLanguage)) {
    console.error('❌ Usage: node generate-translations.js <th|id>');
    process.exit(1);
  }

  console.log(`🚀 Generating ${targetLanguage.toUpperCase()} translations using SEALION API...`);

  // Get all keys from Chinese translations (comprehensive set)
  const chineseTranslations = await getChineseTranslations();
  const allKeys = getAllKeys(chineseTranslations);

  console.log(`📋 Found ${allKeys.length} total keys to translate`);

  // Load existing translations
  const targetPath = path.join(__dirname, '..', 'src', 'messages', `${targetLanguage}.json`);
  let existingTranslations = {};
  if (fs.existsSync(targetPath)) {
    existingTranslations = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  }

  // Filter out keys that already exist
  const existingKeys = getAllKeys(existingTranslations);
  const missingKeys = allKeys.filter(key => !existingKeys.includes(key));

  console.log(`📊 Statistics:`);
  console.log(`   - Total keys: ${allKeys.length}`);
  console.log(`   - Existing keys: ${existingKeys.length}`);
  console.log(`   - Missing keys: ${missingKeys.length}`);

  if (missingKeys.length === 0) {
    console.log('✅ All translations already exist!');
    return;
  }

  // Generate translations for missing keys
  console.log(`🔄 Translating ${missingKeys.length} missing keys...`);
  const updatedTranslations = await translateKeys(missingKeys, targetLanguage, existingTranslations);

  // Save updated translations
  fs.writeFileSync(targetPath, JSON.stringify(updatedTranslations, null, 2));
  console.log(`✅ Saved updated ${targetLanguage.toUpperCase()} translations to ${targetPath}`);
}

if (require.main === module) {
  main().catch(console.error);
}
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

async function translateText(englishText, targetLanguage) {
  const languageMap = {
    'th': 'Thai',
    'id': 'Indonesian'
  };

  const prompt = `Translate the following English text to ${languageMap[targetLanguage]}. Only return the translated text, no explanations:

"${englishText}"`;

  try {
    // Ensure the endpoint URL has protocol
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
    return data.choices[0].message.content.trim().replace(/^"|"$/g, '');
  } catch (error) {
    console.error(`❌ Translation failed for "${englishText}" to ${targetLanguage}:`, error);
    return englishText; // Fallback to original text
  }
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

async function translateMissingKeys(targetLanguage, englishTranslations, existingTranslations = {}) {
  const result = { ...existingTranslations };
  const allEnglishKeys = getAllKeys(englishTranslations);
  const existingKeys = getAllKeys(existingTranslations);
  const missingKeys = allEnglishKeys.filter(key => !existingKeys.includes(key));

  console.log(`🔄 Translating ${missingKeys.length} missing keys to ${targetLanguage.toUpperCase()}...`);

  for (const key of missingKeys) {
    const englishValue = getNestedValue(englishTranslations, key);
    if (!englishValue) {
      console.log(`⚠️ No English value found for key: ${key}`);
      continue;
    }

    console.log(`🔄 Translating: ${key} = "${englishValue}"`);
    const translatedValue = await translateText(englishValue, targetLanguage);
    console.log(`✅ Result: "${translatedValue}"`);

    setNestedValue(result, key, translatedValue);

    // Add delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return result;
}

async function main() {
  const targetLanguage = process.argv[2];
  if (!targetLanguage || !['th', 'id'].includes(targetLanguage)) {
    console.error('❌ Usage: node generate-from-english.js <th|id>');
    process.exit(1);
  }

  console.log(`🚀 Generating ${targetLanguage.toUpperCase()} translations from English using SEALION API...`);

  // Load English translations (base)
  const enPath = path.join(__dirname, '..', 'src', 'messages', 'en.json');
  const englishTranslations = JSON.parse(fs.readFileSync(enPath, 'utf8'));

  // Load existing translations
  const targetPath = path.join(__dirname, '..', 'src', 'messages', `${targetLanguage}.json`);
  let existingTranslations = {};
  if (fs.existsSync(targetPath)) {
    existingTranslations = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  }

  const allEnglishKeys = getAllKeys(englishTranslations);
  const existingKeys = getAllKeys(existingTranslations);
  const missingKeys = allEnglishKeys.filter(key => !existingKeys.includes(key));

  console.log(`📊 Statistics:`);
  console.log(`   - Total English keys: ${allEnglishKeys.length}`);
  console.log(`   - Existing ${targetLanguage.toUpperCase()} keys: ${existingKeys.length}`);
  console.log(`   - Missing keys to translate: ${missingKeys.length}`);

  if (missingKeys.length === 0) {
    console.log('✅ All translations already exist!');
    return;
  }

  // Generate translations for missing keys
  const updatedTranslations = await translateMissingKeys(targetLanguage, englishTranslations, existingTranslations);

  // Save updated translations
  fs.writeFileSync(targetPath, JSON.stringify(updatedTranslations, null, 2));
  console.log(`✅ Saved updated ${targetLanguage.toUpperCase()} translations to ${targetPath}`);
}

if (require.main === module) {
  main().catch(console.error);
}
# Translation Scripts Documentation

This directory (`scripts/translations/`) contains automation scripts for managing internationalization (i18n) translations in the FinanSEAL application.

## Overview

We maintain translation files for multiple Southeast Asian languages:
- **English (en)** - Source of truth for all translation keys
- **Thai (th)** - Thai language translations
- **Indonesian (id)** - Indonesian language translations
- **Chinese (zh)** - Simplified Chinese translations

All translation files are located in `src/messages/`.

---

## Scripts

### 1. `generate-missing-translations.js`

**Purpose**: Automatically generates missing translations by calling the SEALION AI API to translate English text to target languages.

**How it works**:
1. Compares `en.json` (source of truth) with the target language file
2. Identifies all missing translation keys
3. Uses SEALION AI to translate each missing English string
4. Adds translated keys to the target language file
5. Includes rate limiting to prevent API throttling

**Prerequisites**:
- Environment variables in `.env.local`:
  - `SEALION_ENDPOINT_URL` - SEALION API endpoint
  - `SEALION_MODEL_ID` - Model identifier for translation

**Usage**:

```bash
# Generate missing Thai translations
node scripts/translations/generate-missing-translations.js th

# Generate missing Indonesian translations
node scripts/translations/generate-missing-translations.js id

# Generate missing Chinese translations
node scripts/translations/generate-missing-translations.js zh
```

**Options**:
- `<language>` - Target language code (required)
  - `th` = Thai
  - `id` = Indonesian
  - `zh` = Chinese (Simplified)

**Output Example**:
```
🌍 FinanSEAL Translation Generator
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 Target Language: Thai (th)
🤖 Translation Engine: SEALION AI
⏱️  Rate Limit Delay: 300ms between calls

📖 Loading English translations: /path/to/en.json
📖 Loading existing TH translations: /path/to/th.json

📊 Statistics:
   📝 Total English keys: 1051
   ✅ Existing TH keys: 1020
   ❓ Missing keys to translate: 31
   📈 Coverage: 97.0%

🔄 Translating 31 missing keys to TH...

   🔄 [1/31] dashboard.newMetric
      EN: "Total Revenue"
      TH: "รายได้ทั้งหมด"

   ...

📊 Translation Complete:
   ✅ Success: 31

💾 Saving translations to: /path/to/th.json

✅ Success! Translations saved.

📊 Final Statistics:
   📝 Total keys: 1051/1051
   📈 Coverage: 100.0%
   ➕ Added: 31 new translations
```

**Features**:
- ✅ Automatic detection of missing keys
- ✅ AI-powered translation via SEALION
- ✅ Rate limiting to prevent API throttling (300ms delay)
- ✅ Fallback to English if translation fails
- ✅ Pretty-printed JSON output
- ✅ Comprehensive statistics and progress tracking
- ✅ Safe: Only adds missing keys, never overwrites existing translations

**Notes**:
- Estimated time: ~5-10 minutes for 100 keys (depends on API response time)
- The script preserves existing translations and only adds missing ones
- English (`en.json`) is always the source of truth
- Rate limit delay can be adjusted in the script if needed

---

### 2. `validate-translations.js`

**Purpose**: Validates that all language files have complete translation coverage compared to the English base file. This prevents runtime errors where translation keys are missing.

**How it works**:
1. Loads `en.json` as the base reference
2. Compares each locale file against the base
3. Reports missing keys (errors)
4. Reports extra keys not in base (warnings)
5. Exits with error code 1 if any keys are missing

**Usage**:

```bash
# Run validation manually
node scripts/translations/validate-translations.js

# Or via npm script (recommended)
npm run lint:translations
```

**Output Example - Success**:
```
🔍 Validating translation files against base locale: en.json
📍 Base file has 1051 translation keys
✅ th.json: Perfect match (1051 keys)
✅ id.json: Perfect match (1051 keys)
✅ zh.json: Perfect match (1051 keys)

📊 Validation Summary:
   Base locale: en.json (1051 keys)
   Validated files: 3

✅ All translation files are consistent!
   Safe to proceed with build.
```

**Output Example - Errors**:
```
🔍 Validating translation files against base locale: en.json
📍 Base file has 1051 translation keys

❌ Error in th.json: Missing 5 keys:
   - dashboard.newFeature
   - settings.apiKeys
   - reports.quarterly
   - navigation.help
   - common.exportPDF

⚠️  Warning in id.json: Extra 2 keys not in base:
   + legacy.oldFeature
   + deprecated.setting

📊 Validation Summary:
   Base locale: en.json (1051 keys)
   Validated files: 3

❌ Validation failed! Fix missing keys before building.
   Run this script again after adding missing translations.
```

**Features**:
- ✅ Detects missing translation keys (blocks build)
- ✅ Detects extra keys not in base (warning only)
- ✅ Clear error messages with key paths
- ✅ Exit code 1 on failure (CI-friendly)
- ✅ Can be run as pre-build check

**Return Codes**:
- `0` - All translations valid and complete
- `1` - Missing keys detected or file parsing errors

---

## CI/CD Integration

### Package.json Scripts

The validation script should be integrated into your CI/CD pipeline to catch translation issues early:

```json
{
  "scripts": {
    "lint:translations": "node scripts/translations/validate-translations.js",
    "prebuild": "npm run lint:translations",
    "build": "next build"
  }
}
```

**Recommended CI Workflow**:

```yaml
# .github/workflows/ci.yml
name: CI

on: [push, pull_request]

jobs:
  validate-translations:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run lint:translations

  build:
    needs: validate-translations
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run build
```

### Pre-commit Hook (Optional)

You can also add translation validation as a pre-commit hook using Husky:

```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm run lint:translations"
    }
  }
}
```

This ensures developers can't commit code with missing translations.

---

## Workflow: Adding New Translation Keys

When adding new features with UI text:

1. **Add English translations** to `src/messages/en.json`:
   ```json
   {
     "newFeature": {
       "title": "New Feature",
       "description": "This is a new feature"
     }
   }
   ```

2. **Generate translations** for other languages:
   ```bash
   node scripts/translations/generate-missing-translations.js th
   node scripts/translations/generate-missing-translations.js id
   node scripts/translations/generate-missing-translations.js zh
   ```

3. **Validate** all translations are complete:
   ```bash
   npm run lint:translations
   ```

4. **Review AI translations** and make manual corrections if needed

5. **Commit** all updated translation files together

---

## Best Practices

### ✅ DO:
- Always add English translations first (single source of truth)
- Use the generate script for initial translations
- Review AI-generated translations for accuracy
- Run validation before committing
- Use semantic key names (e.g., `dashboard.revenue`, not `label1`)
- Group related keys under namespaces

### ❌ DON'T:
- Don't manually copy-paste translations (error-prone)
- Don't skip validation checks
- Don't delete keys without checking usage
- Don't commit incomplete translation files
- Don't bypass CI checks for "quick fixes"

---

## Troubleshooting

### "SEALION API not configured"
**Solution**: Add `SEALION_ENDPOINT_URL` and `SEALION_MODEL_ID` to `.env.local`

### "Translation failed" errors
**Solutions**:
- Check API credentials are valid
- Verify network connectivity
- Check API rate limits
- Script will fallback to English automatically

### "Validation failed" in CI
**Solution**: Run `node scripts/translations/generate-missing-translations.js <lang>` locally and commit updated files

### Keys not translating correctly
**Solutions**:
- Check if English text is clear and unambiguous
- Manually edit the translation file for better accuracy
- Add context comments in English file for AI translator

---

## File Structure

```
scripts/
├── translations/
│   ├── CLAUDE.md                          # This documentation
│   ├── generate-missing-translations.js   # AI translation generator
│   └── validate-translations.js           # Translation validator
└── knowledge_base/
    ├── CLAUDE.md
    ├── checksums.json
    ├── ingest.py
    ├── process.py
    ├── requirements.txt
    └── sources.yaml

src/messages/
├── en.json   # English (source of truth)
├── th.json   # Thai translations
├── id.json   # Indonesian translations
└── zh.json   # Chinese translations
```

---

## Support

For questions or issues:
1. Check this documentation first
2. Review error messages carefully
3. Consult the project's main CLAUDE.md for architecture context
4. Contact the development team

---

**Last Updated**: 2025-10-13
**Maintained By**: FinanSEAL Development Team

# FinanSEAL Internationalization (i18n) Implementation

## Overview

This document outlines the comprehensive internationalization implementation for FinanSEAL using `next-intl` for UI translations and enhanced multilingual support for the LangGraph AI assistant.

## Supported Languages

- **English (en)** - Default/Base language
- **Thai (th)** - Thailand 🇹🇭
- **Indonesian (id)** - Indonesia 🇮🇩
- **Chinese (zh)** - China/Singapore 🇨🇳

## Architecture Overview

### Performance-First Design
- **Dynamic Loading**: Translation files are loaded on-demand to reduce initial bundle size
- **Static Generation**: All locale routes are pre-rendered at build time for optimal performance
- **CDN-Friendly**: Static files can be cached and served from edge locations

### URL Structure
```
/en/dashboard     # English dashboard
/th/dashboard     # Thai dashboard
/id/dashboard     # Indonesian dashboard
/zh/dashboard     # Chinese dashboard
```

### Key Components

1. **Core Configuration** (`src/i18n.ts`)
2. **Next.js Integration** (`next.config.ts`)
3. **Middleware** (`src/middleware.ts`)
4. **Layout Provider** (`src/app/[locale]/layout.tsx`)
5. **Language Switcher** (`src/components/language-switcher.tsx`)
6. **Error Boundaries** (`src/components/i18n-error-boundary.tsx`)
7. **AI Agent Integration** (`src/lib/langgraph-agent.ts`)

## File Structure

```
src/
├── i18n.ts                           # Core i18n configuration
├── middleware.ts                      # Locale detection & routing
├── messages/                          # Translation files
│   ├── en.json                       # English (base)
│   ├── th.json                       # Thai
│   ├── id.json                       # Indonesian
│   └── zh.json                       # Chinese
├── app/[locale]/                     # Localized routes
│   ├── layout.tsx                    # Locale layout with providers
│   ├── page.tsx                      # Localized pages
│   └── ...
├── components/
│   ├── language-switcher.tsx         # Language selection UI
│   └── i18n-error-boundary.tsx       # Error handling
└── lib/
    └── langgraph-agent.ts            # Multilingual AI agent
```

## Key Features

### 1. Dynamic Message Loading
```typescript
// Prevents bundling all translations into a single file
const messages = (await import(`./messages/${locale}.json`)).default;
```

### 2. Secure Locale Validation
```typescript
// Only allows valid locales to prevent security issues
const localePattern = new RegExp(`^/(${locales.join('|')})`);
```

### 3. Graceful Error Handling
- Error boundaries for translation loading failures
- Automatic fallback to English for missing translations
- User-friendly error UI with retry functionality

### 4. Multilingual AI Assistant
- Language-aware system prompts
- Automatic locale detection from chat context
- Flexible language switching during conversations

## Implementation Guide

### Adding New Translations

1. **Add new key to base English file** (`src/messages/en.json`)
2. **Update all locale files** with the same key structure
3. **Run validation** to ensure consistency:
   ```bash
   npm run validate-translations
   ```

### Using Translations in Components

```typescript
import { useTranslations } from 'next-intl';

function MyComponent() {
  const t = useTranslations('namespace');

  return <h1>{t('title')}</h1>;
}
```

### Server-Side Translations

```typescript
import { getTranslations } from 'next-intl/server';

export default async function ServerComponent() {
  const t = await getTranslations('namespace');

  return <h1>{t('title')}</h1>;
}
```

## Security Considerations

### 1. Locale Parameter Validation
- Only accepts predefined locale values (`en`, `th`, `id`, `zh`)
- Prevents open redirect attacks through URL manipulation
- Validates locale patterns using specific regex

### 2. Translation File Security
- Static JSON files served from `/src/messages/`
- No user-generated translation content
- Validation script prevents missing keys

## Performance Optimizations

### 1. Bundle Splitting
- Each locale's translations loaded separately
- Reduces initial JavaScript payload
- Improves First Contentful Paint (FCP)

### 2. Static Generation
- All locale routes pre-rendered at build time
- 109 static pages generated across 4 locales
- Zero JavaScript required for initial page load

### 3. Middleware Efficiency
- Lightweight locale detection
- Cookie-based locale persistence
- Browser language preference detection

## Error Handling

### Translation Loading Failures
1. **Primary**: Load requested locale messages
2. **Fallback**: Load English messages if primary fails
3. **Error Boundary**: Show user-friendly error UI if both fail
4. **Recovery**: Provide retry and navigation options

### Missing Translation Keys
- Validation script runs before build
- CI/CD integration prevents deployment with missing keys
- Runtime fallback to key name if translation missing

## AI Agent Multilingual Support

### Language Detection
```typescript
// Agent automatically detects user language from locale context
const userLanguage = getLanguageFromLocale(locale);
```

### Dynamic System Prompts
```typescript
// System prompts adapt based on user language
const systemPrompt = getSystemPrompt(userLanguage);
```

### Language Switching
- Users can switch languages mid-conversation
- Context preserved across language changes
- Agent responds in selected language

## Build Process

### Validation Pipeline
```bash
npm run build                    # Includes validation
npm run validate-translations    # Manual validation
npm run build:unsafe            # Skip validation (not recommended)
```

### Build Output
- ✅ 109 static pages generated
- ✅ All locale routes pre-rendered
- ✅ Translation consistency validated
- ✅ TypeScript type safety confirmed

## Maintenance

### Adding New Languages
1. Add locale to `locales` array in `src/i18n.ts`
2. Create new translation file `src/messages/{locale}.json`
3. Add language metadata to `languageOptions`
4. Update middleware and routing configuration

### Updating Translations
1. Modify base English file first
2. Update all locale files with same structure
3. Run validation script to ensure consistency
4. Test language switching functionality

### Monitoring
- Error boundaries log translation failures
- Google Analytics integration for error tracking
- Build-time validation prevents runtime issues

## Best Practices

### Translation Keys
- Use hierarchical naming: `dashboard.transactions.title`
- Keep keys semantic, not literal
- Avoid deep nesting (max 3 levels recommended)

### Content Guidelines
- Consider text expansion in different languages
- Use appropriate date/number formatting per locale
- Respect cultural context and sensitivities

### Performance
- Keep translation files under 50KB each
- Use lazy loading for large translation namespaces
- Monitor bundle size impact of new translations

## Troubleshooting

### Common Issues

1. **404 Errors for Translation Files**
   - Ensure files are in `/src/messages/` directory
   - Check file naming matches locale codes exactly
   - Verify import paths in `i18n.ts`

2. **Missing Translation Keys**
   - Run `npm run validate-translations`
   - Check console for runtime warnings
   - Verify key structure matches across files

3. **Language Switcher Not Working**
   - Check pathname manipulation logic
   - Verify locale validation patterns
   - Test with different URL structures

4. **Build Failures**
   - Ensure all translation files have consistent keys
   - Check TypeScript types for locale parameters
   - Verify middleware configuration

For additional support, refer to the [next-intl documentation](https://next-intl-docs.vercel.app/) or create an issue in the project repository.
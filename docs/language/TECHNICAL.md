# Technical Implementation Details

## Core Architecture

### Dynamic Message Loading System

The implementation uses Next.js dynamic imports to load translation files on-demand, preventing all translations from being bundled into the initial JavaScript payload.

```typescript
// src/i18n.ts
export default getRequestConfig(async ({ locale }) => {
  // Dynamically load messages for requested locale
  const messages = (await import(`./messages/${validatedLocale}.json`)).default;

  return {
    locale: validatedLocale,
    messages,
    now: new Date()
  };
});
```

### Locale Validation Pipeline

Multi-layer validation ensures only supported locales are processed:

1. **URL Pattern Validation**: Middleware checks incoming requests
2. **Layout Validation**: Layout component validates locale parameter
3. **Component Validation**: Language switcher validates locale changes

```typescript
// Middleware validation
if (!locales.includes(locale as Locale)) {
  return NextResponse.redirect(new URL(`/${defaultLocale}${pathname}`, request.url));
}

// Layout validation
if (!locales.includes(locale as Locale)) {
  notFound();
}
```

### Static Generation Strategy

The application generates static pages for all locale combinations at build time:

```typescript
// generateStaticParams for all supported locales
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}
```

**Build Output:**
- 109 total static pages generated
- 27+ pages per locale (4 locales)
- Zero runtime locale detection required
- Full CDN compatibility

## Security Implementation

### Open Redirect Prevention

The language switcher implements secure pathname manipulation to prevent open redirect attacks:

```typescript
// VULNERABLE (original):
const pathWithoutLocale = pathname.replace(/^\/[a-z]{2}/, '');

// SECURE (implemented):
const localePattern = new RegExp(`^/(${locales.join('|')})`);
const pathWithoutLocale = pathname.replace(localePattern, '');
```

This ensures only valid, predefined locales can be used in URL construction.

### Content Security

1. **Static Translation Files**: All translations stored as static JSON files
2. **No User-Generated Content**: Translation keys are compile-time constants
3. **Validation Pipeline**: Build-time validation prevents malformed translations
4. **Type Safety**: TypeScript ensures translation key consistency

## Performance Optimizations

### Bundle Splitting Analysis

```bash
# Build output showing bundle optimization
Route (app)                               Size    First Load JS
├ ● /[locale]                           118 kB         302 kB
├ ● /[locale]/dashboard                 45.2 kB        229 kB
```

**Optimization Strategies:**
1. **Lazy Loading**: Translation files loaded per-locale
2. **Tree Shaking**: Unused translation keys eliminated
3. **Static Generation**: Zero runtime translation resolution
4. **Middleware Efficiency**: Lightweight locale detection

### Loading Performance

```typescript
// Optimized loading with fallback
try {
  const messages = (await import(`./messages/${locale}.json`)).default;
  return { locale, messages };
} catch (error) {
  // Fallback to English without failing
  const fallbackMessages = (await import(`./messages/en.json`)).default;
  return { locale, messages: fallbackMessages };
}
```

## Error Handling Architecture

### Three-Layer Error Recovery

1. **Primary Loading**: Attempt to load requested locale
2. **Fallback Loading**: Load English if primary fails
3. **Error Boundary**: Show user-friendly UI if both fail

```typescript
// Error boundary implementation
export function I18nErrorBoundary({ children }) {
  return (
    <ErrorBoundary
      FallbackComponent={I18nErrorFallback}
      onError={handleError}
      onReset={handleReset}
      resetKeys={[locale]}
    >
      {children}
    </ErrorBoundary>
  );
}
```

### Error Tracking Integration

```typescript
const handleError = (error: Error) => {
  // Production error tracking
  if (typeof window !== 'undefined' && 'gtag' in window) {
    (window as any).gtag('event', 'exception', {
      description: `I18n Error: ${error.message}`,
      fatal: false,
    });
  }
};
```

## AI Agent Integration

### Language State Management

The LangGraph agent maintains language context throughout conversations:

```typescript
// Agent state with language awareness
const agentState = {
  messages: [],
  userLanguage: locale,
  systemPrompt: getSystemPrompt(locale),
  tools: getLocalizedTools(locale)
};
```

### Dynamic System Prompt Generation

```typescript
function getSystemPrompt(language: string): string {
  const prompts = {
    'en': 'You are a helpful financial assistant...',
    'th': 'คุณเป็นผู้ช่วยด้านการเงินที่เป็นประโยชน์...',
    'id': 'Anda adalah asisten keuangan yang membantu...',
    'zh': '您是一个有用的财务助手...'
  };

  return prompts[language] || prompts['en'];
}
```

### Context Preservation

Language changes preserve conversation context while adapting response language:

```typescript
// Chat API endpoint handles language switching
const response = await agent.invoke({
  messages: [...existingMessages, newMessage],
  userLanguage: request.language, // Updated language
  preserveContext: true
});
```

## Build Process Integration

### Translation Validation Pipeline

```javascript
// scripts/validate-translations.js
function validateTranslations() {
  const baseKeys = new Set(getKeys(baseMessages));

  localeFiles.forEach(file => {
    const localeKeys = new Set(getKeys(localeMessages));
    const missingKeys = [...baseKeys].filter(key => !localeKeys.has(key));

    if (missingKeys.length > 0) {
      console.error(`❌ Missing keys in ${file}:`, missingKeys);
      process.exit(1);
    }
  });
}
```

### Package.json Integration

```json
{
  "scripts": {
    "build": "npm run validate-translations && next build",
    "build:unsafe": "next build",
    "validate-translations": "node scripts/validate-translations.js"
  }
}
```

## Type Safety Implementation

### Locale Type Definitions

```typescript
// Strong typing for locale handling
export const locales = ['en', 'th', 'id', 'zh'] as const;
export type Locale = (typeof locales)[number];

// Type-safe locale validation
export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}
```

### Component Type Safety

```typescript
interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

// Next.js 15 async params compatibility
export default async function LocaleLayout({
  children,
  params
}: LocaleLayoutProps) {
  const { locale } = await params;
  // Type-safe locale processing...
}
```

## Middleware Implementation

### Locale Detection Strategy

```typescript
// src/middleware.ts
export default function middleware(request: NextRequest) {
  // 1. Check URL path for locale
  const pathname = request.nextUrl.pathname;
  const pathnameHasLocale = locales.some(
    (locale) => pathname.startsWith(`/${locale}/`) || pathname === `/${locale}`
  );

  if (pathnameHasLocale) return;

  // 2. Check user's stored preference (cookie)
  const preferredLocale = getLocaleFromCookie(request);

  // 3. Fallback to browser language detection
  const browserLocale = getBrowserLocale(request.headers.get('accept-language'));

  const locale = preferredLocale || browserLocale || defaultLocale;

  // Redirect to localized URL
  return NextResponse.redirect(
    new URL(`/${locale}${pathname}`, request.url)
  );
}
```

### Performance Considerations

- **Lightweight Processing**: Minimal computation in middleware
- **Cookie Persistence**: Avoid repeated locale detection
- **Header Parsing**: Efficient accept-language parsing
- **Regex Optimization**: Compiled patterns for path matching

## Database Integration

### User Language Preferences

While not implemented in the current version, the architecture supports storing user language preferences:

```sql
-- Future implementation
ALTER TABLE users ADD COLUMN preferred_language VARCHAR(2) DEFAULT 'en';
CREATE INDEX idx_users_preferred_language ON users(preferred_language);
```

### Localized Content Storage

For user-generated content that requires localization:

```sql
-- Example schema for multilingual content
CREATE TABLE localized_content (
  id BIGSERIAL PRIMARY KEY,
  entity_id BIGINT NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  locale VARCHAR(2) NOT NULL,
  content JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(entity_id, entity_type, locale)
);
```

## Testing Strategy

### Translation Completeness Testing

```typescript
// Test helper for translation validation
export function testTranslationCompleteness() {
  const baseTranslations = require('../src/messages/en.json');
  const baseKeys = getNestedKeys(baseTranslations);

  locales.forEach(locale => {
    if (locale === 'en') return;

    const translations = require(`../src/messages/${locale}.json`);
    const localeKeys = getNestedKeys(translations);

    expect(localeKeys).toEqual(baseKeys);
  });
}
```

### Component Testing with Locales

```typescript
// Test component rendering in different locales
import { render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

function renderWithLocale(component: React.ReactElement, locale: string = 'en') {
  const messages = require(`../src/messages/${locale}.json`);

  return render(
    <NextIntlClientProvider messages={messages} locale={locale}>
      {component}
    </NextIntlClientProvider>
  );
}
```

## Deployment Considerations

### CDN Configuration

Static translation files and generated pages are fully CDN-compatible:

```yaml
# Example CDN cache configuration
cache_control:
  - pattern: "/_next/static/**"
    headers:
      cache-control: "public, max-age=31536000, immutable"

  - pattern: "/[locale]/**"
    headers:
      cache-control: "public, max-age=3600, stale-while-revalidate=86400"
```

### Environment Configuration

```bash
# Production environment variables
NEXT_PUBLIC_DEFAULT_LOCALE=en
NEXT_PUBLIC_SUPPORTED_LOCALES=en,th,id,zh

# Development debugging
NEXT_PUBLIC_I18N_DEBUG=true (development only)
```

## Monitoring and Analytics

### Translation Performance Metrics

1. **Bundle Size Impact**: Monitor JavaScript payload per locale
2. **Loading Performance**: Track translation loading times
3. **Error Rates**: Monitor translation loading failures
4. **User Preferences**: Track language selection patterns

### Implementation Metrics

From the current build:
- ✅ 109 static pages generated successfully
- ✅ 140 translation keys validated across 4 locales
- ✅ Zero TypeScript errors in production build
- ✅ Build time: ~5 seconds with validation

## Future Enhancements

### Planned Improvements

1. **RTL Language Support**: Add Arabic/Hebrew support
2. **Pluralization Rules**: Implement ICU message format
3. **Date/Number Localization**: Add Intl API integration
4. **Translation Management**: CMS integration for non-technical updates
5. **A/B Testing**: Language-specific feature flag support

### Scalability Considerations

The current architecture supports scaling to:
- **Additional Languages**: Simple addition of new locale files
- **Larger Translation Volumes**: Dynamic namespace loading
- **Team Collaboration**: Translation file splitting by feature
- **Automated Translation**: AI-powered translation pipeline integration
import { getRequestConfig } from 'next-intl/server';
import { notFound } from 'next/navigation';

// Our supported locales
export const locales = ['en', 'th', 'id', 'zh'] as const;
export type Locale = (typeof locales)[number];

// Default locale
export const defaultLocale: Locale = 'en';

/**
 * next-intl configuration with dynamic message loading
 * This prevents bundling all translations into a single file,
 * reducing initial JavaScript payload and improving performance
 */
export default getRequestConfig(async ({ locale }) => {
  // Validate that the incoming `locale` parameter is valid using type guard
  if (!locale || locale === 'undefined' || !isValidLocale(locale)) {
    // For invalid locales, fall back to default locale instead of throwing notFound
    locale = defaultLocale;
  }

  // TypeScript now knows locale is a valid Locale type
  const validatedLocale = locale as Locale;

  try {
    // Dynamically load the messages for the requested locale
    const messages = (await import(`./messages/${validatedLocale}.json`)).default;

    return {
      locale: validatedLocale,
      messages,
      // You can add other configurations here
      timeZone: 'Asia/Bangkok', // Default to SEA timezone
      now: new Date()
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`Failed to load messages for locale: ${validatedLocale}`, errorMessage);

    // In development, show full error details
    if (process.env.NODE_ENV === 'development') {
      console.error('Full error details (dev only):', error)
    }

    // Fallback to English if the locale file doesn't exist
    const fallbackMessages = (await import(`./messages/en.json`)).default;

    return {
      locale: validatedLocale,
      messages: fallbackMessages,
      timeZone: 'Asia/Bangkok',
      now: new Date()
    };
  }
});

/**
 * Language metadata for UI display
 */
export const languageOptions = [
  {
    code: 'en' as const,
    name: 'English',
    nativeName: 'English',
    flag: '🇺🇸',
    region: 'Global'
  },
  {
    code: 'th' as const,
    name: 'Thai',
    nativeName: 'ไทย',
    flag: '🇹🇭',
    region: 'Thailand'
  },
  {
    code: 'id' as const,
    name: 'Indonesian',
    nativeName: 'Bahasa Indonesia',
    flag: '🇮🇩',
    region: 'Indonesia'
  },
  {
    code: 'zh' as const,
    name: 'Chinese',
    nativeName: '中文',
    flag: '🇨🇳',
    region: 'China/Singapore'
  }
] as const;

/**
 * Get language option by code
 */
export function getLanguageOption(code: string) {
  return languageOptions.find(option => option.code === code) || languageOptions[0];
}

/**
 * Validate locale
 */
export function isValidLocale(locale: string): locale is Locale {
  return locales.includes(locale as Locale);
}

/**
 * Get the best matching locale from browser preferences
 */
export function getBrowserLocale(): Locale {
  if (typeof window === 'undefined') return defaultLocale;

  const browserLang = navigator.language || navigator.languages?.[0] || 'en';
  const langCode = browserLang.split('-')[0].toLowerCase();

  // Map browser language codes to supported languages
  const languageMap: Record<string, Locale> = {
    'en': 'en',
    'th': 'th',
    'id': 'id',
    'ms': 'id', // Malay speakers might prefer Indonesian
    'zh': 'zh',
    'zh-cn': 'zh',
    'zh-tw': 'zh',
    'zh-hk': 'zh'
  };

  return languageMap[langCode] || languageMap[browserLang] || defaultLocale;
}
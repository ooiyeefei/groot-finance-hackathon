import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { ClerkProvider } from '@clerk/nextjs';
import { locales, type Locale } from '@/i18n';
import { notFound } from 'next/navigation';
import { I18nErrorBoundary } from '@/components/i18n-error-boundary';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { BusinessContextProvider } from '@/contexts/business-context';

interface LocaleLayoutProps {
  children: React.ReactNode;
  params: Promise<{
    locale: string;
  }>;
}

// Generate static params for all supported locales
export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

/**
 * Locale Layout - Handles internationalization and authentication providers
 * This layout provides the IntlProvider and ClerkProvider for all locale-specific routes
 */
export default async function LocaleLayout({
  children,
  params
}: LocaleLayoutProps) {
  const { locale } = await params;

  // Validate that the incoming locale parameter is valid
  if (!locales.includes(locale as Locale)) {
    notFound();
  }

  // Dynamically load messages for the current locale
  let messages;
  try {
    messages = await getMessages({ locale });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`Failed to load messages for locale: ${locale}`, errorMessage);

    // In development, show full error details
    if (process.env.NODE_ENV === 'development') {
      console.error('Full error details (dev only):', error)
    }

    // Fallback to English if locale messages fail to load
    messages = await getMessages({ locale: 'en' });
  }

  return (
    <ClerkProvider>
      <QueryProvider>
        <I18nErrorBoundary fallbackLocale={locale}>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <BusinessContextProvider>
              {children}
            </BusinessContextProvider>
          </NextIntlClientProvider>
        </I18nErrorBoundary>
      </QueryProvider>
    </ClerkProvider>
  );
}
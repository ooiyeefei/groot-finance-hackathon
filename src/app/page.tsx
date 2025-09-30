import { redirect } from 'next/navigation'
import { defaultLocale } from '@/i18n'

/**
 * Root page handler for locale-prefixed routing
 *
 * Since we use localePrefix: 'always' in our i18n configuration,
 * all routes must have a locale prefix. This page handles direct
 * access to the root path and redirects to the default locale.
 */
export default function RootPage() {
  // Redirect to default locale
  redirect(`/${defaultLocale}`)
}

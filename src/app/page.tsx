import { auth } from '@/lib/demo-server-auth'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { defaultLocale } from '@/i18n'
import LandingContent from './landing-content'

/**
 * Root page - Landing page for unauthenticated users, redirect for authenticated
 *
 * Geo-detection: Reads Vercel's x-vercel-ip-country header to determine
 * the user's country for currency display. Falls back to 'US' if unavailable.
 */
export default async function RootPage() {
  const { userId } = await auth()

  if (userId) {
    redirect(`/${defaultLocale}`)
  }

  // Detect country for geo-based currency display
  const headersList = await headers()
  const country = headersList.get('x-vercel-ip-country') || 'US'

  return <LandingContent country={country} />
}

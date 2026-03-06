import { redirect } from 'next/navigation'

interface ActionCenterPageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

/**
 * Redirect route for /[locale]/action-center
 *
 * Notification links point to /en/action-center?insight=xxx
 * This redirects to the dashboard (/{locale}) preserving the insight query param
 * so the ProactiveActionCenter can deep-link to the specific insight card.
 */
export default async function ActionCenterPage({ params, searchParams }: ActionCenterPageProps) {
  const { locale } = await params
  const resolvedSearchParams = await searchParams
  const insightId = resolvedSearchParams.insight

  const target = insightId
    ? `/${locale}?insight=${insightId}`
    : `/${locale}`

  redirect(target)
}

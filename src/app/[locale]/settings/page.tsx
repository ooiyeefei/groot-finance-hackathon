/**
 * Legacy Settings Page - Redirects to unified Settings
 * Personal settings are now the "Profile" tab in /business-settings
 */

import { redirect } from 'next/navigation'

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  redirect(`/${locale}/business-settings?tab=profile`)
}

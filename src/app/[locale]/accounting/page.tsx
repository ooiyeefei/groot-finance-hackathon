import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import AccountingEntriesClient from '@/domains/accounting-entries/components/accounting-entries-client'

export default async function AccountingPage() {
  // Server-side authentication check
  const { userId } = await auth()

  if (!userId) {
    redirect('/sign-in')
  }

  return <AccountingEntriesClient />
}
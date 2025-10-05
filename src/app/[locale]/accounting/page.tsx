import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import TransactionsClient from '@/components/transactions/transactions-client'

export default async function TransactionsPage() {
  // Server-side authentication check
  const { userId } = await auth()
  
  if (!userId) {
    redirect('/sign-in')
  }

  return <TransactionsClient />
}
'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@clerk/nextjs'
import AccountingEntriesList from '@/domains/accounting-entries/components/accounting-entries-list'
import type { AccountingEntry } from '@/domains/accounting-entries/lib/data-access'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import { ClientProviders } from '@/components/providers/client-providers'

interface AccountingPageClientProps {
  userRole: {
    employee: boolean
    manager: boolean
    finance_admin: boolean
  }
}

export default function AccountingPageClient({ userRole }: AccountingPageClientProps) {
  const { user } = useUser()
  const [transactions, setTransactions] = useState<AccountingEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Event handlers for the AccountingEntriesList component
  const handleRefresh = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/v1/accounting-entries')
      const data = await response.json()

      if (data.success) {
        setTransactions(data.data?.transactions || [])
      } else {
        setError(data.error || 'Failed to load transactions')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions')
    } finally {
      setIsLoading(false)
    }
  }

  const handleView = (transaction: AccountingEntry) => {
    // TODO: Implement view functionality
    console.log('View transaction:', transaction.id)
  }

  const handleEdit = (transaction: AccountingEntry) => {
    // TODO: Implement edit functionality
    console.log('Edit transaction:', transaction.id)
  }

  const handleDelete = async (accountingEntryId: string) => {
    try {
      // TODO: Implement API call to delete accounting entry
      // const response = await fetch(`/api/v1/accounting-entries/${accountingEntryId}`, {
      //   method: 'DELETE'
      // })

      // if (!response.ok) {
      //   throw new Error('Failed to delete transaction')
      // }

      // Remove from local state optimistically
      setTransactions(prev => prev.filter(t => t.id !== accountingEntryId))

      console.log('Delete transaction:', accountingEntryId)
    } catch (err) {
      throw err // Re-throw to let the component handle the error UI
    }
  }

  // Load transactions on mount
  useEffect(() => {
    handleRefresh()
  }, [])

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <HeaderWithUser
            title="Accounting Entries"
            subtitle="View and manage your financial transactions"
          />

          {/* Main Content Area */}
          <main className="flex-1 overflow-auto p-4 sm:p-card-padding pb-24 sm:pb-4">
            <div className="max-w-7xl mx-auto">
              <AccountingEntriesList
                transactions={transactions}
                isLoading={isLoading}
                error={error}
                onRefresh={handleRefresh}
                onView={handleView}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            </div>
          </main>
        </div>
      </div>
    </ClientProviders>
  )
}
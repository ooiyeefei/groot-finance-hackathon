'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import ActionButton from '@/components/ui/action-button'
import AccountingEntriesList from '@/domains/accounting-entries/components/accounting-entries-list'
import AccountingEntryFormModal from '@/domains/accounting-entries/components/accounting-entry-edit-modal'
import AccountingEntryDetailModal from '@/domains/accounting-entries/components/accounting-entry-view-modal'
import DocumentAnalysisModal from '@/domains/invoices/components/document-analysis-modal'
import { useAccountingEntries } from '@/domains/accounting-entries/hooks/use-accounting-entries'
import { AccountingEntry } from '@/domains/accounting-entries/types'
import { Plus } from 'lucide-react'
import { ClientProviders } from '@/components/providers/client-providers'
import { useActiveBusiness } from '@/contexts/business-context'

export default function AccountingEntriesClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { businessId } = useActiveBusiness()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingAccountingEntry, setEditingTransaction] = useState<AccountingEntry | null>(null)
  const [viewingAccountingEntry, setViewingTransaction] = useState<AccountingEntry | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<any | null>(null)
  const [highlightProcessed, setHighlightProcessed] = useState(false)

  const {
    accountingEntries,
    loading,
    refreshAccountingEntries,
    createAccountingEntry,
    updateAccountingEntry,
    deleteAccountingEntry,
    getAccountingEntryById
  } = useAccountingEntries()

  // Handle highlight parameter to auto-open transaction modal
  useEffect(() => {
    const highlightId = searchParams.get('highlight')
    if (highlightId && accountingEntries.length > 0 && !viewingAccountingEntry && !highlightProcessed) {
      const targetAccountingEntry = getAccountingEntryById(highlightId)
      if (targetAccountingEntry) {
        setViewingTransaction(targetAccountingEntry)
        setHighlightProcessed(true)
      }
    }
  }, [searchParams, accountingEntries, getAccountingEntryById, viewingAccountingEntry, highlightProcessed])

  // CRITICAL FIX: Re-fetch transactions when active business context changes
  useEffect(() => {
    if (businessId) {
      console.log('[AccountingEntriesClient] Business context changed, refreshing transactions:', businessId)
      refreshAccountingEntries()
    }
  }, [businessId, refreshAccountingEntries])

  const handleCreateTransaction = async (data: any) => {
    try {
      await createAccountingEntry(data)
      setShowCreateModal(false)
      refreshAccountingEntries()
    } catch (error) {
      console.error('Failed to create transaction:', error)
    }
  }

  const handleUpdateTransaction = async (data: any) => {
    if (!editingAccountingEntry) return
    
    try {
      await updateAccountingEntry(editingAccountingEntry.id, data)
      setEditingTransaction(null)
      refreshAccountingEntries()
    } catch (error) {
      console.error('Failed to update transaction:', error)
    }
  }

  const handleDeleteAccountingEntry = async (accountingEntryId: string) => {
    try {
      await deleteAccountingEntry(accountingEntryId)
      setViewingTransaction(null)
      refreshAccountingEntries()
    } catch (error) {
      console.error('Failed to delete transaction:', error)
    }
  }

  const handleEditFromDetail = () => {
    if (viewingAccountingEntry) {
      setEditingTransaction(viewingAccountingEntry)
      setViewingTransaction(null)
    }
  }

  const handleViewDocument = async (documentId: string) => {
    try {
      // Fetch the document by ID
      const response = await fetch(`/api/v1/invoices/${documentId}`)
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data) {
          setSelectedDocument(result.data)
          setViewingTransaction(null) // Close transaction modal
        } else {
          console.error('Failed to fetch document:', result.error)
        }
      } else {
        console.error('Failed to fetch document:', response.status, response.statusText)
      }
    } catch (error) {
      console.error('Failed to fetch document:', error)
    }
  }

  // Custom close handler that removes highlight parameter from URL
  const handleCloseAccountingEntryModal = () => {
    setViewingTransaction(null)
    setHighlightProcessed(false) // Reset the flag

    // Remove highlight parameter from URL if present
    const highlightId = searchParams.get('highlight')
    if (highlightId) {
      const url = new URL(window.location.href)
      url.searchParams.delete('highlight')
      router.push(url.pathname + url.search, { scroll: false })
    }
  }

  return (
    <ClientProviders>
      <div className="flex h-screen bg-gray-900">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <HeaderWithUser
            title="Accounting Records"
            subtitle="View and manage your financial transactions across multiple currencies"
          />

          {/* Main Content Area */}
          <main className="flex-1 overflow-auto p-6">
            <AccountingEntriesList
              transactions={accountingEntries}
              isLoading={loading}
              error={null}
              onRefresh={refreshAccountingEntries}
              onView={setViewingTransaction}
              onEdit={setEditingTransaction}
              onDelete={handleDeleteAccountingEntry}
            />
          </main>
        </div>

        {/* Modals */}
        {showCreateModal && (
          <AccountingEntryFormModal
            onClose={() => setShowCreateModal(false)}
            onSubmit={handleCreateTransaction}
          />
        )}

        {editingAccountingEntry && (
          <AccountingEntryFormModal
            transaction={editingAccountingEntry}
            onClose={() => setEditingTransaction(null)}
            onSubmit={handleUpdateTransaction}
          />
        )}

        {viewingAccountingEntry && (
          <AccountingEntryDetailModal
            transaction={viewingAccountingEntry}
            onClose={handleCloseAccountingEntryModal}
            onEdit={handleEditFromDetail}
            onDelete={() => handleDeleteAccountingEntry(viewingAccountingEntry.id)}
            onViewDocument={handleViewDocument}
          />
        )}

        {selectedDocument && (
          <DocumentAnalysisModal
            document={selectedDocument}
            onClose={() => setSelectedDocument(null)}
          />
        )}

        {/* Floating Action Button */}
        <button
          onClick={() => setShowCreateModal(true)}
          className="fixed bottom-6 right-6 z-50 bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-full shadow-lg transition-all duration-200 ease-in-out flex items-center justify-center"
          aria-label="Add new transaction"
        >
          <Plus className="w-6 h-6" />
        </button>
      </div>
    </ClientProviders>
  )
}
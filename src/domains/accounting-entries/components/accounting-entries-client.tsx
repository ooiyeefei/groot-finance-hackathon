'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useLocale } from 'next-intl'
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
  const locale = useLocale()
  const { businessId } = useActiveBusiness()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingAccountingEntry, setEditingTransaction] = useState<AccountingEntry | null>(null)
  const [viewingAccountingEntry, setViewingTransaction] = useState<AccountingEntry | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<any | null>(null)
  const [highlightProcessed, setHighlightProcessed] = useState(false)

  // Memoize empty filters to prevent unnecessary re-renders and API calls
  const accountingFilters = useMemo(() => ({}), [])

  const {
    accountingEntries,
    loading,
    refreshAccountingEntries,
    createAccountingEntry,
    updateAccountingEntry,
    deleteAccountingEntry,
    getAccountingEntryById
  } = useAccountingEntries(accountingFilters)

  // Extract highlightId as a separate memoized value to prevent useEffect from running unnecessarily
  const highlightId = useMemo(() => searchParams.get('highlight'), [searchParams])

  // Handle highlight parameter to auto-open transaction modal
  useEffect(() => {
    // Only process if we have a highlight ID, data is loaded, and we haven't processed this highlight yet
    if (highlightId && !highlightProcessed && !viewingAccountingEntry && !loading) {
      // Inline the search logic to avoid unstable function dependency
      const targetAccountingEntry = accountingEntries.find(entry => entry.id === highlightId)
      if (targetAccountingEntry) {
        setViewingTransaction(targetAccountingEntry)
        setHighlightProcessed(true)
      }
    }
  }, [highlightId, highlightProcessed, viewingAccountingEntry, loading, accountingEntries])

  // CRITICAL FIX: Re-fetch transactions when active business context changes
  useEffect(() => {
    if (businessId) {
      refreshAccountingEntries()
    }
  }, [businessId, refreshAccountingEntries])

  const handleCreateTransaction = useCallback(async (data: any) => {
    try {
      await createAccountingEntry(data)
      setShowCreateModal(false)
      refreshAccountingEntries()
    } catch (error) {
      // Creation error handled by underlying service
    }
  }, [createAccountingEntry, refreshAccountingEntries])

  const handleUpdateTransaction = useCallback(async (data: any) => {
    if (!editingAccountingEntry) return

    try {
      await updateAccountingEntry(editingAccountingEntry.id, data)
      setEditingTransaction(null)
      refreshAccountingEntries()
    } catch (error) {
      // Update error handled by underlying service
    }
  }, [editingAccountingEntry, updateAccountingEntry, refreshAccountingEntries])

  const handleDeleteAccountingEntry = useCallback(async (accountingEntryId: string) => {
    try {
      await deleteAccountingEntry(accountingEntryId)
      setViewingTransaction(null)
      refreshAccountingEntries()
    } catch (error) {
      // Delete error handled by underlying service
    }
  }, [deleteAccountingEntry, refreshAccountingEntries])

  const handleEditFromDetail = useCallback(() => {
    if (viewingAccountingEntry) {
      setEditingTransaction(viewingAccountingEntry)
      setViewingTransaction(null)
    }
  }, [viewingAccountingEntry])

  const handleViewDocument = async (documentId: string, sourceDocumentType?: string) => {
    try {
      // Route based on source document type
      if (sourceDocumentType === 'expense_claim') {
        // For expense claims, navigate to the expense claim view page
        router.push(`/${locale}/expense-claims?highlight=${documentId}`)
        setViewingTransaction(null) // Close transaction modal
        return
      }

      // For invoices or unknown types, fetch the document and show analysis modal
      const response = await fetch(`/api/v1/invoices/${documentId}`)
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data) {
          setSelectedDocument(result.data)
          setViewingTransaction(null) // Close transaction modal
        } else {
          // Document fetch failed - handled silently
        }
      } else {
        // Document fetch failed - handled silently
      }
    } catch (error) {
      // Document fetch failed - handled silently
    }
  }

  // Custom close handler that removes highlight parameter from URL
  const handleCloseAccountingEntryModal = useCallback(() => {
    setViewingTransaction(null)
    // Don't reset highlightProcessed here to avoid race condition

    // Remove highlight parameter from URL if present
    if (highlightId) {
      const url = new URL(window.location.href)
      url.searchParams.delete('highlight')
      router.push(url.pathname + url.search, { scroll: false })
    }
  }, [highlightId, router])

  // Separate effect to reset highlightProcessed when highlightId is removed
  useEffect(() => {
    if (!highlightId && highlightProcessed) {
      setHighlightProcessed(false)
    }
  }, [highlightId, highlightProcessed])

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
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
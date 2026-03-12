'use client'

import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react'
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
import type { AccountingEntry } from '@/domains/accounting-entries/lib/data-access'
import { Plus, Loader2, FileText, Landmark } from 'lucide-react'
import { ClientProviders } from '@/components/providers/client-providers'
import { useActiveBusiness } from '@/contexts/business-context'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

const BankReconTab = lazy(
  () => import('@/domains/accounting-entries/components/bank-recon/bank-recon-tab')
)

type AccountingTab = 'records' | 'bank-recon'

const TabLoading = () => (
  <div className="flex items-center justify-center py-24">
    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
  </div>
)

/**
 * Props for AccountingEntriesClient
 * Accepts server-fetched initial data to eliminate client-side fetch waterfall
 */
interface AccountingEntriesClientProps {
  initialData?: {
    transactions: AccountingEntry[]
    pagination: {
      page: number
      limit: number
      total: number
      has_more: boolean
      total_pages: number
    }
  } | null
  businessContext?: {
    business_id: string
    business_name: string
    home_currency: string
    role: 'owner' | 'admin' | 'manager' | 'employee'
  } | null
  categories?: Array<{
    id: string
    category_name: string
    is_custom: boolean
  }>
  userId: string
}

export default function AccountingEntriesClient({
  initialData,
  businessContext,
  categories,
  userId
}: AccountingEntriesClientProps) {
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

  // ⚡ PERFORMANCE: Use server-fetched initial data to seed React Query cache
  // This eliminates the initial client-side fetch, providing instant data display
  const {
    accountingEntries,
    loading,
    refreshAccountingEntries,
    createAccountingEntry,
    updateAccountingEntry,
    deleteAccountingEntry,
    getAccountingEntryById
  } = useAccountingEntries(accountingFilters, initialData)

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

  // Tab state with hash routing
  const [activeTab, setActiveTab] = useState<AccountingTab>(() => {
    if (typeof window === 'undefined') return 'records'
    const hash = window.location.hash.replace('#', '')
    return hash === 'bank-recon' ? 'bank-recon' : 'records'
  })

  useEffect(() => {
    const onHashChange = () => {
      const hash = window.location.hash.replace('#', '')
      setActiveTab(hash === 'bank-recon' ? 'bank-recon' : 'records')
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const handleTabChange = useCallback((value: string) => {
    const tab = value as AccountingTab
    setActiveTab(tab)
    window.history.replaceState(null, '', `#${tab}`)
  }, [])

  const topTriggerClassName =
    'px-4 py-2 text-sm font-medium rounded-lg transition-colors ' +
    'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground ' +
    'data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground'

  return (
    <ClientProviders>
      <div className="flex h-screen bg-background">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <HeaderWithUser
            title="Accounting"
            subtitle={activeTab === 'records'
              ? 'View and manage your financial transactions across multiple currencies'
              : 'Import bank statements and reconcile against accounting records'
            }
            actions={activeTab === 'records' ? (
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary hover:bg-primary/90 text-primary-foreground transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Transaction
              </button>
            ) : undefined}
          />

          {/* Tab Navigation */}
          <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col min-h-0">
            <div className="border-b border-border px-6 pt-2">
              <TabsList className="bg-transparent gap-1 p-0">
                <TabsTrigger value="records" className={topTriggerClassName}>
                  <FileText className="w-4 h-4 mr-1.5" />
                  Records
                </TabsTrigger>
                <TabsTrigger value="bank-recon" className={topTriggerClassName}>
                  <Landmark className="w-4 h-4 mr-1.5" />
                  Bank Reconciliation
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="records" className="flex-1 overflow-auto p-6 mt-0">
              <AccountingEntriesList
                transactions={accountingEntries}
                isLoading={loading}
                error={null}
                onRefresh={refreshAccountingEntries}
                onView={setViewingTransaction}
                onEdit={setEditingTransaction}
                onDelete={handleDeleteAccountingEntry}
              />
            </TabsContent>

            <TabsContent value="bank-recon" className="flex-1 overflow-auto mt-0">
              <Suspense fallback={<TabLoading />}>
                <BankReconTab />
              </Suspense>
            </TabsContent>
          </Tabs>
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

      </div>
    </ClientProviders>
  )
}
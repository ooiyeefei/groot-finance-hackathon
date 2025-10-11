'use client'

import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import ActionButton from '@/components/ui/action-button'
import TransactionsList from '@/components/transactions/transactions-list'
import TransactionFormModal from '@/components/transactions/transaction-form-modal'
import TransactionDetailModal from '@/components/transactions/transaction-detail-modal'
import DocumentAnalysisModal from '@/components/invoices/document-analysis-modal'
import { useTransactions } from '@/hooks/use-transactions'
import { Transaction } from '@/types/transaction'
import { Plus } from 'lucide-react'
import { ClientProviders } from '@/components/providers/client-providers'
import { useActiveBusiness } from '@/contexts/business-context'

export default function TransactionsClient() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { businessId } = useActiveBusiness()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [viewingTransaction, setViewingTransaction] = useState<Transaction | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<any | null>(null)
  const [highlightProcessed, setHighlightProcessed] = useState(false)

  const {
    transactions,
    loading,
    refreshTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    getTransactionById
  } = useTransactions()

  // Handle highlight parameter to auto-open transaction modal
  useEffect(() => {
    const highlightId = searchParams.get('highlight')
    if (highlightId && transactions.length > 0 && !viewingTransaction && !highlightProcessed) {
      const targetTransaction = getTransactionById(highlightId)
      if (targetTransaction) {
        setViewingTransaction(targetTransaction)
        setHighlightProcessed(true)
      }
    }
  }, [searchParams, transactions, getTransactionById, viewingTransaction, highlightProcessed])

  // CRITICAL FIX: Re-fetch transactions when active business context changes
  useEffect(() => {
    if (businessId) {
      console.log('[TransactionsClient] Business context changed, refreshing transactions:', businessId)
      refreshTransactions()
    }
  }, [businessId, refreshTransactions])

  const handleCreateTransaction = async (data: any) => {
    try {
      await createTransaction(data)
      setShowCreateModal(false)
      refreshTransactions()
    } catch (error) {
      console.error('Failed to create transaction:', error)
    }
  }

  const handleUpdateTransaction = async (data: any) => {
    if (!editingTransaction) return
    
    try {
      await updateTransaction(editingTransaction.id, data)
      setEditingTransaction(null)
      refreshTransactions()
    } catch (error) {
      console.error('Failed to update transaction:', error)
    }
  }

  const handleDeleteTransaction = async (transactionId: string) => {
    try {
      await deleteTransaction(transactionId)
      setViewingTransaction(null)
      refreshTransactions()
    } catch (error) {
      console.error('Failed to delete transaction:', error)
    }
  }

  const handleEditFromDetail = () => {
    if (viewingTransaction) {
      setEditingTransaction(viewingTransaction)
      setViewingTransaction(null)
    }
  }

  const handleViewDocument = async (documentId: string) => {
    try {
      // Fetch the document by ID
      const response = await fetch(`/api/invoices/${documentId}`)
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
  const handleCloseTransactionModal = () => {
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
            <TransactionsList
              transactions={transactions}
              isLoading={loading}
              error={null}
              onRefresh={refreshTransactions}
              onView={setViewingTransaction}
              onEdit={setEditingTransaction}
              onDelete={handleDeleteTransaction}
            />
          </main>
        </div>

        {/* Modals */}
        {showCreateModal && (
          <TransactionFormModal
            onClose={() => setShowCreateModal(false)}
            onSubmit={handleCreateTransaction}
          />
        )}

        {editingTransaction && (
          <TransactionFormModal
            transaction={editingTransaction}
            onClose={() => setEditingTransaction(null)}
            onSubmit={handleUpdateTransaction}
          />
        )}

        {viewingTransaction && (
          <TransactionDetailModal
            transaction={viewingTransaction}
            onClose={handleCloseTransactionModal}
            onEdit={handleEditFromDetail}
            onDelete={() => handleDeleteTransaction(viewingTransaction.id)}
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
'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import TransactionsList from '@/components/transactions/transactions-list'
import TransactionFormModal from '@/components/transactions/transaction-form-modal'
import TransactionDetailModal from '@/components/transactions/transaction-detail-modal'
import DocumentAnalysisModal from '@/components/documents/document-analysis-modal'
import { useTransactions } from '@/hooks/use-transactions'
import { Transaction } from '@/types/transaction'
import { Plus } from 'lucide-react'
import { ClientProviders } from '@/components/providers/client-providers'

export default function TransactionsClient() {
  const t = useTranslations('transactions')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [viewingTransaction, setViewingTransaction] = useState<Transaction | null>(null)
  const [selectedDocument, setSelectedDocument] = useState<any | null>(null)

  const {
    transactions,
    loading,
    refreshTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction
  } = useTransactions()

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
      const response = await fetch(`/api/documents/${documentId}`)
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

  return (
    <ClientProviders>
      <div className="flex h-screen bg-gray-900">
        {/* Sidebar */}
        <Sidebar />

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <HeaderWithUser
            title={t('title')}
            subtitle={t('subtitle')}
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
            onClose={() => setViewingTransaction(null)}
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
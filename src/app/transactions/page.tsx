'use client'

import { useEffect, useState } from 'react'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import Sidebar from '@/components/ui/sidebar'
import HeaderWithUser from '@/components/ui/header-with-user'
import TransactionsList from '@/components/transactions/transactions-list'
import TransactionFormModal from '@/components/transactions/transaction-form-modal'
import TransactionDetailModal from '@/components/transactions/transaction-detail-modal'
import { useTransactions } from '@/hooks/use-transactions'
import { Transaction } from '@/types/transaction'

export default function TransactionsPage() {
  const { userId } = useAuth()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [viewingTransaction, setViewingTransaction] = useState<Transaction | null>(null)
  
  const {
    transactions,
    loading,
    refreshTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction
  } = useTransactions()

  // Redirect if not authenticated (client-side check)
  useEffect(() => {
    if (!userId) {
      window.location.href = '/sign-in'
    }
  }, [userId])

  if (!userId) {
    return null // Will redirect
  }

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

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Sidebar */}
      <Sidebar />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <HeaderWithUser />
        
        {/* Main Content Area */}
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-6xl mx-auto">
            <div className="mb-8 flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">Transactions</h1>
                <p className="text-gray-400">
                  View and manage your financial transactions across multiple currencies
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Add Transaction
              </button>
            </div>
            
            <TransactionsList
              transactions={transactions}
              isLoading={loading}
              error={null}
              onRefresh={refreshTransactions}
              onView={setViewingTransaction}
              onEdit={setEditingTransaction}
              onDelete={handleDeleteTransaction}
            />
          </div>
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
        />
      )}
    </div>
  )
}
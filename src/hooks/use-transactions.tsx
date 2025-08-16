'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  Transaction, 
  CreateTransactionRequest, 
  UpdateTransactionRequest,
  TransactionListParams,
  SupportedCurrency
} from '@/types/transaction'

interface UseTransactionsReturn {
  transactions: Transaction[]
  loading: boolean
  creating: boolean
  updating: Set<string>
  deleting: Set<string>
  pagination: {
    page: number
    limit: number
    total: number
    has_more: boolean
    total_pages: number
  }
  // CRUD operations
  createTransaction: (data: CreateTransactionRequest) => Promise<Transaction | null>
  updateTransaction: (id: string, data: UpdateTransactionRequest) => Promise<Transaction | null>
  deleteTransaction: (id: string) => Promise<boolean>
  refreshTransactions: () => Promise<void>
  // List management
  setFilters: (filters: Partial<TransactionListParams>) => void
  clearFilters: () => void
  goToPage: (page: number) => void
  // Utility
  getTransactionById: (id: string) => Transaction | undefined
}

const DEFAULT_FILTERS: TransactionListParams = {
  page: 1,
  limit: 20,
  sort_by: 'transaction_date',
  sort_order: 'desc'
}

export function useTransactions(): UseTransactionsReturn {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [updating, setUpdating] = useState(new Set<string>())
  const [deleting, setDeleting] = useState(new Set<string>())
  const [filters, setFiltersState] = useState<TransactionListParams>(DEFAULT_FILTERS)
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    has_more: false,
    total_pages: 0
  })

  // Fetch transactions from API
  const fetchTransactions = useCallback(async (params: TransactionListParams = filters) => {
    try {
      const searchParams = new URLSearchParams()
      
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.append(key, String(value))
        }
      })

      const response = await fetch(`/api/transactions?${searchParams.toString()}`)
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      
      if (result.success) {
        setTransactions(result.data.transactions)
        setPagination(result.data.pagination)
      } else {
        console.error('Failed to fetch transactions:', result.error)
        setTransactions([])
      }
    } catch (error) {
      console.error('Error fetching transactions:', error)
      setTransactions([])
    } finally {
      setLoading(false)
    }
  }, [filters])

  // Public refresh function
  const refreshTransactions = useCallback(async () => {
    setLoading(true)
    await fetchTransactions()
  }, [fetchTransactions])

  // Create new transaction
  const createTransaction = useCallback(async (data: CreateTransactionRequest): Promise<Transaction | null> => {
    setCreating(true)
    
    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      })
      
      const result = await response.json()
      
      if (result.success) {
        const newTransaction = result.data.transaction
        
        // Add to the beginning of the list if we're on the first page
        if (filters.page === 1) {
          setTransactions(prev => [newTransaction, ...prev.slice(0, (filters.limit || 20) - 1)])
        }
        
        // Refresh to get accurate counts
        await fetchTransactions()
        
        return newTransaction
      } else {
        console.error('Failed to create transaction:', result.error)
        throw new Error(result.error || 'Failed to create transaction')
      }
    } catch (error) {
      console.error('Error creating transaction:', error)
      throw error
    } finally {
      setCreating(false)
    }
  }, [filters, fetchTransactions])

  // Update existing transaction
  const updateTransaction = useCallback(async (id: string, data: UpdateTransactionRequest): Promise<Transaction | null> => {
    setUpdating(prev => new Set(prev).add(id))
    
    try {
      const response = await fetch(`/api/transactions/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      })
      
      const result = await response.json()
      
      if (result.success) {
        const updatedTransaction = result.data.transaction
        
        // Update in local state
        setTransactions(prev => 
          prev.map(t => t.id === id ? updatedTransaction : t)
        )
        
        return updatedTransaction
      } else {
        console.error('Failed to update transaction:', result.error)
        throw new Error(result.error || 'Failed to update transaction')
      }
    } catch (error) {
      console.error('Error updating transaction:', error)
      throw error
    } finally {
      setUpdating(prev => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
    }
  }, [])

  // Delete transaction
  const deleteTransaction = useCallback(async (id: string): Promise<boolean> => {
    setDeleting(prev => new Set(prev).add(id))
    
    try {
      const response = await fetch(`/api/transactions/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      
      const result = await response.json()
      
      if (result.success) {
        // Remove from local state
        setTransactions(prev => prev.filter(t => t.id !== id))
        
        // Refresh pagination counts
        await fetchTransactions()
        
        return true
      } else {
        console.error('Failed to delete transaction:', result.error)
        throw new Error(result.error || 'Failed to delete transaction')
      }
    } catch (error) {
      console.error('Error deleting transaction:', error)
      throw error
    } finally {
      setDeleting(prev => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
    }
  }, [fetchTransactions])

  // Set filters and refetch
  const setFilters = useCallback((newFilters: Partial<TransactionListParams>) => {
    const updatedFilters = { ...filters, ...newFilters, page: 1 } // Reset to page 1 when filtering
    setFiltersState(updatedFilters)
    setLoading(true)
    fetchTransactions(updatedFilters)
  }, [filters, fetchTransactions])

  // Clear all filters
  const clearFilters = useCallback(() => {
    setFiltersState(DEFAULT_FILTERS)
    setLoading(true)
    fetchTransactions(DEFAULT_FILTERS)
  }, [fetchTransactions])

  // Navigate to specific page
  const goToPage = useCallback((page: number) => {
    const updatedFilters = { ...filters, page }
    setFiltersState(updatedFilters)
    setLoading(true)
    fetchTransactions(updatedFilters)
  }, [filters, fetchTransactions])

  // Get transaction by ID
  const getTransactionById = useCallback((id: string): Transaction | undefined => {
    return transactions.find(t => t.id === id)
  }, [transactions])

  // Initial fetch
  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  return {
    transactions,
    loading,
    creating,
    updating,
    deleting,
    pagination,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    refreshTransactions,
    setFilters,
    clearFilters,
    goToPage,
    getTransactionById
  }
}

// Utility functions for currency formatting
export function formatCurrency(amount: number, currency: SupportedCurrency): string {
  try {
    // Use explicit currency code format for better clarity (e.g., "SGD 108.61")
    return `${currency} ${amount.toFixed(2)}`
  } catch {
    // Fallback for unsupported currencies
    return `${amount.toFixed(2)} ${currency}`
  }
}

export function getTransactionTypeColor(type: string): string {
  switch (type) {
    case 'income':
      return 'text-green-400'
    case 'expense':
      return 'text-red-400'
    case 'transfer':
      return 'text-blue-400'
    case 'asset':
      return 'text-purple-400'
    case 'liability':
      return 'text-orange-400'
    case 'equity':
      return 'text-yellow-400'
    default:
      return 'text-gray-400'
  }
}

export function getTransactionTypeIcon(type: string): string {
  switch (type) {
    case 'income':
      return '↗️'
    case 'expense':
      return '↙️'
    case 'transfer':
      return '↔️'
    case 'asset':
      return '📈'
    case 'liability':
      return '📊'
    case 'equity':
      return '🏛️'
    default:
      return '💰'
  }
}
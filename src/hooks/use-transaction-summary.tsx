'use client'

import { useState, useEffect, useCallback } from 'react'
import { SupportedCurrency } from '@/types/transaction'

interface TransactionSummary {
  totalIncome: number
  totalExpense: number
  netAmount: number
  transactionCount: number
  period: string
  currency: SupportedCurrency
}

interface TransactionSummaryHook {
  summary: TransactionSummary | null
  isLoading: boolean
  error: string | null
  refreshSummary: () => Promise<void>
}

export function useTransactionSummary(
  period: 'week' | 'month' | '60days' | '90days' | '6months' | 'year' = '60days',
  homeCurrency: SupportedCurrency = 'USD'
): TransactionSummaryHook {
  const [summary, setSummary] = useState<TransactionSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSummary = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Get current date range based on period
      const now = new Date()
      const startDate = new Date()
      
      if (period === 'week') {
        startDate.setDate(now.getDate() - 7)
      } else if (period === 'month') {
        startDate.setDate(now.getDate() - 30)
      } else if (period === '60days') {
        startDate.setDate(now.getDate() - 60)
      } else if (period === '90days') {
        startDate.setDate(now.getDate() - 90)
      } else if (period === '6months') {
        startDate.setDate(now.getDate() - 180)
      } else if (period === 'year') {
        startDate.setDate(now.getDate() - 365)
      }

      // Fetch transactions in the date range
      const response = await fetch(`/api/transactions?${new URLSearchParams({
        limit: '1000', // Get enough transactions for summary
        date_from: startDate.toISOString().split('T')[0],
        date_to: now.toISOString().split('T')[0]
      })}`)

      if (!response.ok) {
        throw new Error('Failed to fetch transactions')
      }

      const result = await response.json()
      console.log('Transaction API response:', result) // Debug log
      const transactions = result.data?.transactions || [] // Fix: correct API response structure

      // Calculate summary with currency conversion
      let totalIncome = 0
      let totalExpense = 0
      const transactionCount = transactions.length

      console.log(`Processing ${transactions.length} transactions for summary`) // Debug log
      
      for (const transaction of transactions) {
        let amount = transaction.home_currency_amount || transaction.original_amount
        console.log(`Transaction: ${transaction.description}, Type: ${transaction.transaction_type}, Amount: ${amount}`) // Debug log

        // Convert to home currency if needed
        if (transaction.home_currency !== homeCurrency) {
          // If home currency differs, we'd need to convert
          // For now, use home_currency_amount as is (this should be handled by backend)
          amount = transaction.home_currency_amount || transaction.original_amount
        }

        if (transaction.transaction_type === 'income') {
          totalIncome += amount
        } else if (transaction.transaction_type === 'expense') {
          totalExpense += amount
        }
        // Note: transfers are not included in income/expense totals
      }

      const netAmount = totalIncome - totalExpense
      
      console.log(`Summary calculated: Income=${totalIncome}, Expense=${totalExpense}, Net=${netAmount}, Count=${transactionCount}`) // Debug log

      setSummary({
        totalIncome,
        totalExpense,
        netAmount,
        transactionCount,
        period,
        currency: homeCurrency
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load summary')
      setSummary(null)
    } finally {
      setIsLoading(false)
    }
  }, [period, homeCurrency])

  const refreshSummary = async () => {
    await fetchSummary()
  }

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  return {
    summary,
    isLoading,
    error,
    refreshSummary
  }
}

// Utility function to get period display name
export function getPeriodDisplayName(period: 'week' | 'month' | '60days' | '90days' | '6months' | 'year'): string {
  switch (period) {
    case 'week':
      return 'Last 7 Days'
    case 'month':
      return 'Last 30 Days'
    case '60days':
      return 'Last 60 Days'
    case '90days':
      return 'Last 90 Days'
    case '6months':
      return 'Last 6 Months'
    case 'year':
      return 'Last 12 Months'
    default:
      return 'Period'
  }
}
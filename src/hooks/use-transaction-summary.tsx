'use client'

import { useState, useEffect } from 'react'
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
  period: 'week' | 'month' | 'year' = 'month',
  homeCurrency: SupportedCurrency = 'USD'
): TransactionSummaryHook {
  const [summary, setSummary] = useState<TransactionSummary | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSummary = async () => {
    try {
      setIsLoading(true)
      setError(null)

      // Get current date range based on period
      const now = new Date()
      const startDate = new Date()
      
      if (period === 'week') {
        startDate.setDate(now.getDate() - 7)
      } else if (period === 'month') {
        startDate.setMonth(now.getMonth() - 1)
      } else if (period === 'year') {
        startDate.setFullYear(now.getFullYear() - 1)
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

      const data = await response.json()
      const transactions = data.transactions || []

      // Calculate summary with currency conversion
      let totalIncome = 0
      let totalExpense = 0
      const transactionCount = transactions.length

      for (const transaction of transactions) {
        let amount = transaction.home_amount || transaction.original_amount

        // Convert to home currency if needed
        if (transaction.home_currency !== homeCurrency) {
          // If home currency differs, we'd need to convert
          // For now, use home_amount as is (this should be handled by backend)
          amount = transaction.home_amount || transaction.original_amount
        }

        if (transaction.transaction_type === 'income') {
          totalIncome += amount
        } else if (transaction.transaction_type === 'expense') {
          totalExpense += amount
        }
        // Note: transfers are not included in income/expense totals
      }

      const netAmount = totalIncome - totalExpense

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
  }

  const refreshSummary = async () => {
    await fetchSummary()
  }

  useEffect(() => {
    fetchSummary()
  }, [period, homeCurrency])

  return {
    summary,
    isLoading,
    error,
    refreshSummary
  }
}

// Utility function to get period display name
export function getPeriodDisplayName(period: 'week' | 'month' | 'year'): string {
  switch (period) {
    case 'week':
      return 'Last 7 Days'
    case 'month':
      return 'Last 30 Days'
    case 'year':
      return 'Last 12 Months'
    default:
      return 'Period'
  }
}
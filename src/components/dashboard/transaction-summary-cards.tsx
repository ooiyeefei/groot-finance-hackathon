'use client'

import { useState } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Activity, RefreshCw } from 'lucide-react'
import { useTransactionSummary, getPeriodDisplayName } from '@/hooks/use-transaction-summary'
import { useHomeCurrency } from '@/components/settings/currency-settings'
import { SupportedCurrency } from '@/types/transaction'

interface TransactionSummaryCardsProps {
  period?: 'week' | 'month' | 'year'
}

export default function TransactionSummaryCards({
  period = 'month'
}: TransactionSummaryCardsProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | 'year'>(period)
  const homeCurrency = useHomeCurrency() // Get user's preferred currency
  const { summary, isLoading, error, refreshSummary } = useTransactionSummary(selectedPeriod, homeCurrency)

  const formatCurrency = (amount: number, currency: SupportedCurrency) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      notation: amount >= 1000000 ? 'compact' : 'standard',
      compactDisplay: 'short'
    }).format(amount)
  }

  const getNetAmountColor = (amount: number) => {
    if (amount > 0) return 'text-green-400'
    if (amount < 0) return 'text-red-400'
    return 'text-gray-400'
  }

  const getNetAmountIcon = (amount: number) => {
    if (amount > 0) return <TrendingUp className="w-5 h-5" />
    if (amount < 0) return <TrendingDown className="w-5 h-5" />
    return <Activity className="w-5 h-5" />
  }

  if (error) {
    return (
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-600/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-xl">⚠️</span>
          </div>
          <h3 className="text-lg font-medium text-white mb-2">Error Loading Summary</h3>
          <p className="text-gray-400 text-sm mb-4">{error}</p>
          <button
            onClick={refreshSummary}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Period Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Financial Overview</h2>
          <p className="text-sm text-gray-400">
            {getPeriodDisplayName(selectedPeriod)} • Displayed in {homeCurrency}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as 'week' | 'month' | 'year')}
            className="px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
            <option value="year">Last 12 Months</option>
          </select>

          {/* Refresh Button */}
          <button
            onClick={refreshSummary}
            disabled={isLoading}
            className="p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Income Card */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-600/20 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-400">Total Income</h3>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            {isLoading ? (
              <div className="h-6 bg-gray-700 rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-green-400">
                {summary ? formatCurrency(summary.totalIncome, homeCurrency) : '-'}
              </p>
            )}
            <p className="text-xs text-gray-500">
              {getPeriodDisplayName(selectedPeriod)}
            </p>
          </div>
        </div>

        {/* Total Expense Card */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-600/20 rounded-lg flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-400">Total Expenses</h3>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            {isLoading ? (
              <div className="h-6 bg-gray-700 rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-red-400">
                {summary ? formatCurrency(summary.totalExpense, homeCurrency) : '-'}
              </p>
            )}
            <p className="text-xs text-gray-500">
              {getPeriodDisplayName(selectedPeriod)}
            </p>
          </div>
        </div>

        {/* Net Amount Card */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 ${
                summary && summary.netAmount > 0 
                  ? 'bg-green-600/20' 
                  : summary && summary.netAmount < 0 
                  ? 'bg-red-600/20' 
                  : 'bg-gray-600/20'
              } rounded-lg flex items-center justify-center`}>
                {isLoading ? (
                  <DollarSign className="w-5 h-5 text-gray-400" />
                ) : (
                  summary && getNetAmountIcon(summary.netAmount)
                )}
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-400">Net Amount</h3>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            {isLoading ? (
              <div className="h-6 bg-gray-700 rounded animate-pulse"></div>
            ) : (
              <p className={`text-2xl font-bold ${summary ? getNetAmountColor(summary.netAmount) : 'text-gray-400'}`}>
                {summary ? formatCurrency(summary.netAmount, homeCurrency) : '-'}
              </p>
            )}
            <p className="text-xs text-gray-500">
              Income - Expenses
            </p>
          </div>
        </div>

        {/* Transaction Count Card */}
        <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-gray-400">Transactions</h3>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            {isLoading ? (
              <div className="h-6 bg-gray-700 rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-blue-400">
                {summary ? summary.transactionCount : '-'}
              </p>
            )}
            <p className="text-xs text-gray-500">
              {getPeriodDisplayName(selectedPeriod)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
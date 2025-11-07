'use client'

import { useState } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Activity, RefreshCw } from 'lucide-react'
import { useTransactionSummary, getPeriodDisplayName } from '@/domains/accounting-entries/hooks/use-transaction-summary'
import { useHomeCurrency } from '@/domains/users/hooks/use-home-currency'
import { SupportedCurrency } from '@/domains/accounting-entries/types'

interface TransactionSummaryCardsProps {
  period?: 'week' | 'month' | '60days' | '90days' | '6months' | 'year'
}

export default function TransactionSummaryCards({
  period = '60days'
}: TransactionSummaryCardsProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<'week' | 'month' | '60days' | '90days' | '6months' | 'year'>(period)
  const { currency: homeCurrency } = useHomeCurrency() // Get user's preferred currency
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
    if (amount > 0) return 'text-success'
    if (amount < 0) return 'text-danger'
    return 'text-muted-foreground'
  }

  const getNetAmountIcon = (amount: number) => {
    if (amount > 0) return <TrendingUp className="w-5 h-5" />
    if (amount < 0) return <TrendingDown className="w-5 h-5" />
    return <Activity className="w-5 h-5" />
  }

  if (error) {
    return (
      <div className="bg-record-layer-1 rounded-lg border border-record-border p-6">
        <div className="text-center">
          <div className="w-12 h-12 bg-danger/20 rounded-full flex items-center justify-center mx-auto mb-3">
            <span className="text-xl">⚠️</span>
          </div>
          <h3 className="text-lg font-medium text-record-title mb-2">Error Loading Summary</h3>
          <p className="text-record-supporting text-sm mb-4">{error}</p>
          <button
            onClick={refreshSummary}
            className="bg-primary hover:bg-primary/80 text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
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
          <h2 className="text-xl font-semibold text-record-title">Financial Overview</h2>
          <p className="text-sm text-record-supporting">
            {getPeriodDisplayName(selectedPeriod)} • Displayed in {homeCurrency}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value as 'week' | 'month' | '60days' | '90days' | '6months' | 'year')}
            className="px-3 py-1.5 bg-input border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
            <option value="60days">Last 60 Days</option>
            <option value="90days">Last 90 Days</option>
            <option value="6months">Last 6 Months</option>
            <option value="year">Last 12 Months</option>
          </select>

          {/* Refresh Button */}
          <button
            onClick={refreshSummary}
            disabled={isLoading}
            className="p-2 bg-record-layer-2 hover:bg-accent text-foreground rounded-lg transition-colors disabled:opacity-50"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Income Card - Translucent green for both light and dark modes */}
        <div className="bg-green-50 dark:bg-gray-800 dark:bg-green-900/10 border border-green-200 dark:border-green-700/50 rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-700 dark:text-gray-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-green-700 dark:text-gray-300">Total Income</h3>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            {isLoading ? (
              <div className="h-6 bg-record-layer-2 rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-green-900 dark:text-white">
                {summary ? formatCurrency(summary.totalIncome, homeCurrency) : '-'}
              </p>
            )}
            <p className="text-xs text-green-700 dark:text-gray-500">
              {getPeriodDisplayName(selectedPeriod)}
            </p>
          </div>
        </div>

        {/* Total Expense Card - Translucent red for both light and dark modes */}
        <div className="bg-red-50 dark:bg-gray-800 dark:bg-red-900/10 border border-red-200 dark:border-red-700/50 rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-red-700 dark:text-gray-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-red-700 dark:text-gray-300">Total Expenses</h3>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            {isLoading ? (
              <div className="h-6 bg-record-layer-2 rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-red-900 dark:text-white">
                {summary ? formatCurrency(summary.totalExpense, homeCurrency) : '-'}
              </p>
            )}
            <p className="text-xs text-red-700 dark:text-gray-500">
              {getPeriodDisplayName(selectedPeriod)}
            </p>
          </div>
        </div>

        {/* Net Amount Card - Dynamic translucent background based on positive/negative */}
        <div className={`border rounded-lg p-6 ${
          summary && summary.netAmount > 0
            ? 'bg-green-50 dark:bg-gray-800 dark:bg-green-900/10 border-green-200 dark:border-green-700/50'
            : summary && summary.netAmount < 0
            ? 'bg-red-50 dark:bg-gray-800 dark:bg-red-900/10 border-red-200 dark:border-red-700/50'
            : 'bg-record-layer-1 border-record-border'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                summary && summary.netAmount > 0
                  ? 'bg-green-100 dark:bg-green-900/30'
                  : summary && summary.netAmount < 0
                  ? 'bg-red-100 dark:bg-red-900/30'
                  : 'bg-muted/20'
              }`}>
                {isLoading ? (
                  <DollarSign className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <span className={summary && summary.netAmount > 0 ? 'text-green-700 dark:text-gray-400' : summary && summary.netAmount < 0 ? 'text-red-700 dark:text-gray-400' : 'text-muted-foreground'}>
                    {summary && getNetAmountIcon(summary.netAmount)}
                  </span>
                )}
              </div>
              <div>
                <h3 className={`text-sm font-medium ${
                  summary && summary.netAmount > 0
                    ? 'text-green-700 dark:text-gray-300'
                    : summary && summary.netAmount < 0
                    ? 'text-red-700 dark:text-gray-300'
                    : 'text-record-supporting'
                }`}>Net Amount</h3>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            {isLoading ? (
              <div className="h-6 bg-record-layer-2 rounded animate-pulse"></div>
            ) : (
              <p className={`text-2xl font-bold ${
                summary && summary.netAmount > 0
                  ? 'text-green-900 dark:text-white'
                  : summary && summary.netAmount < 0
                  ? 'text-red-900 dark:text-white'
                  : 'text-muted-foreground'
              }`}>
                {summary ? formatCurrency(summary.netAmount, homeCurrency) : '-'}
              </p>
            )}
            <p className={`text-xs ${
              summary && summary.netAmount > 0
                ? 'text-green-700 dark:text-gray-500'
                : summary && summary.netAmount < 0
                ? 'text-red-700 dark:text-gray-500'
                : 'text-muted-foreground'
            }`}>
              Income - Expenses
            </p>
          </div>
        </div>

        {/* Transaction Count Card */}
        <div className="bg-record-layer-1 rounded-lg border border-record-border p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-record-supporting">Transactions</h3>
              </div>
            </div>
          </div>
          <div className="space-y-1">
            {isLoading ? (
              <div className="h-6 bg-record-layer-2 rounded animate-pulse"></div>
            ) : (
              <p className="text-2xl font-bold text-primary">
                {summary ? summary.transactionCount : '-'}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {getPeriodDisplayName(selectedPeriod)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
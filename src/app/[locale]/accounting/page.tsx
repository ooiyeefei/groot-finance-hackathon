'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDashboardMetrics } from '@/domains/accounting/hooks/use-dashboard-metrics'
import { useFinancialStatements } from '@/domains/accounting/hooks/use-financial-statements'
import { formatCurrency } from '@/lib/utils/format-number'
import { BookOpen, FileText, Plus, TrendingUp, TrendingDown } from 'lucide-react'
import Link from 'next/link'

export default function AccountingDashboard() {
  const { metrics, isLoading: metricsLoading } = useDashboardMetrics()
  const { profitLoss, trialBalance, isLoading: statementsLoading, dateRange } = useFinancialStatements()

  const [activeTab, setActiveTab] = useState('overview')

  if (metricsLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Accounting Dashboard</h1>
        <div className="flex items-center space-x-3">
          <Link href="/en/accounting/journal-entries/new">
            <Button className="bg-primary hover:bg-primary/90">
              <Plus className="w-4 h-4 mr-2" />
              New Entry
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/en/accounting/chart-of-accounts">
          <Card className="hover:bg-card-hover cursor-pointer transition-colors">
            <CardContent className="p-6 flex items-center space-x-4">
              <div className="bg-primary/10 p-3 rounded-lg">
                <BookOpen className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Chart of Accounts</h3>
                <p className="text-sm text-muted-foreground">Manage GL accounts</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/en/accounting/journal-entries">
          <Card className="hover:bg-card-hover cursor-pointer transition-colors">
            <CardContent className="p-6 flex items-center space-x-4">
              <div className="bg-primary/10 p-3 rounded-lg">
                <FileText className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Journal Entries</h3>
                <p className="text-sm text-muted-foreground">View all entries</p>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/en/accounting/journal-entries/new">
          <Card className="hover:bg-card-hover cursor-pointer transition-colors">
            <CardContent className="p-6 flex items-center space-x-4">
              <div className="bg-primary/10 p-3 rounded-lg">
                <Plus className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">New Entry</h3>
                <p className="text-sm text-muted-foreground">Create journal entry</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground flex items-center">
              <TrendingUp className="w-4 h-4 mr-2" />
              Revenue (This Month)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              {formatCurrency(metrics?.revenue || 0, 'MYR')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground flex items-center">
              <TrendingDown className="w-4 h-4 mr-2" />
              Expenses (This Month)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">
              {formatCurrency(metrics?.expenses || 0, 'MYR')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Net Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                (metrics?.netProfit || 0) >= 0
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              }`}
            >
              {formatCurrency(metrics?.netProfit || 0, 'MYR')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">Cash Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics?.cashBalance || 0, 'MYR')}</div>
          </CardContent>
        </Card>
      </div>

      {/* Financial Statements Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 lg:w-96">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="statements">Financial Statements</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Quick Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-3 border-b border-border">
                  <span className="text-muted-foreground">Total Revenue (This Month)</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">
                    {formatCurrency(metrics?.revenue || 0, 'MYR')}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-3 border-b border-border">
                  <span className="text-muted-foreground">Total Expenses (This Month)</span>
                  <span className="font-semibold text-red-600 dark:text-red-400">
                    {formatCurrency(metrics?.expenses || 0, 'MYR')}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2">
                  <span className="font-semibold text-foreground">Net Profit/Loss</span>
                  <span
                    className={`font-bold text-lg ${
                      (metrics?.netProfit || 0) >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {formatCurrency(metrics?.netProfit || 0, 'MYR')}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="statements" className="space-y-6">
          {statementsLoading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-64 bg-muted rounded"></div>
            </div>
          ) : (
            <>
              {/* Profit & Loss Statement */}
              <Card>
                <CardHeader className="border-b border-border">
                  <div className="flex items-center justify-between">
                    <CardTitle>Profit & Loss Statement</CardTitle>
                    <span className="text-sm text-muted-foreground">
                      {dateRange.dateFrom} to {dateRange.dateTo}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  {/* Revenue Section */}
                  <div>
                    <h3 className="font-semibold text-foreground mb-3 text-lg">REVENUE</h3>
                    <div className="space-y-2">
                      {profitLoss?.revenue.lines.map((line: any) => (
                        <div key={line.accountCode} className="flex justify-between items-center pl-4">
                          <span className="text-muted-foreground">
                            {line.accountCode} - {line.accountName}
                          </span>
                          <span className="font-medium text-foreground">
                            {formatCurrency(line.amount, 'MYR')}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center pt-2 border-t border-border font-semibold">
                        <span className="text-foreground">Total Revenue</span>
                        <span className="text-green-600 dark:text-green-400">
                          {formatCurrency(profitLoss?.revenue.total || 0, 'MYR')}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Expenses Section */}
                  <div>
                    <h3 className="font-semibold text-foreground mb-3 text-lg">EXPENSES</h3>
                    <div className="space-y-2">
                      {profitLoss?.costOfGoodsSold?.lines.map((line: any) => (
                        <div key={line.accountCode} className="flex justify-between items-center pl-4">
                          <span className="text-muted-foreground">
                            {line.accountCode} - {line.accountName}
                          </span>
                          <span className="font-medium text-foreground">
                            {formatCurrency(line.amount, 'MYR')}
                          </span>
                        </div>
                      ))}
                      {profitLoss?.operatingExpenses?.lines.map((line: any) => (
                        <div key={line.accountCode} className="flex justify-between items-center pl-4">
                          <span className="text-muted-foreground">
                            {line.accountCode} - {line.accountName}
                          </span>
                          <span className="font-medium text-foreground">
                            {formatCurrency(line.amount, 'MYR')}
                          </span>
                        </div>
                      ))}
                      {profitLoss?.otherExpenses?.lines.map((line: any) => (
                        <div key={line.accountCode} className="flex justify-between items-center pl-4">
                          <span className="text-muted-foreground">
                            {line.accountCode} - {line.accountName}
                          </span>
                          <span className="font-medium text-foreground">
                            {formatCurrency(line.amount, 'MYR')}
                          </span>
                        </div>
                      ))}
                      <div className="flex justify-between items-center pt-2 border-t border-border font-semibold">
                        <span className="text-foreground">Total Expenses</span>
                        <span className="text-red-600 dark:text-red-400">
                          {formatCurrency(
                            (profitLoss?.costOfGoodsSold?.total || 0) +
                            (profitLoss?.operatingExpenses?.total || 0) +
                            (profitLoss?.otherExpenses?.total || 0),
                            'MYR'
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Net Profit */}
                  <div className="border-t-2 border-border pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-lg font-bold text-foreground">NET PROFIT / (LOSS)</span>
                      <span
                        className={`text-2xl font-bold ${
                          (profitLoss?.netProfit || 0) >= 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {formatCurrency(profitLoss?.netProfit || 0, 'MYR')}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Trial Balance */}
              <Card>
                <CardHeader className="border-b border-border">
                  <div className="flex items-center justify-between">
                    <CardTitle>Trial Balance</CardTitle>
                    <span className="text-sm text-muted-foreground">As of {dateRange.asOfDate}</span>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-muted">
                        <tr>
                          <th className="px-6 py-3 text-left text-sm font-medium text-foreground">
                            Account Code
                          </th>
                          <th className="px-6 py-3 text-left text-sm font-medium text-foreground">
                            Account Name
                          </th>
                          <th className="px-6 py-3 text-right text-sm font-medium text-foreground">
                            Debit
                          </th>
                          <th className="px-6 py-3 text-right text-sm font-medium text-foreground">
                            Credit
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {trialBalance?.lines.map((account: any) => (
                          <tr key={account.accountCode} className="border-b border-border">
                            <td className="px-6 py-3 text-sm font-mono text-foreground">
                              {account.accountCode}
                            </td>
                            <td className="px-6 py-3 text-sm text-foreground">
                              {account.accountName}
                            </td>
                            <td className="px-6 py-3 text-sm text-right text-foreground">
                              {account.debitBalance > 0
                                ? formatCurrency(account.debitBalance, 'MYR')
                                : '—'}
                            </td>
                            <td className="px-6 py-3 text-sm text-right text-foreground">
                              {account.creditBalance > 0
                                ? formatCurrency(account.creditBalance, 'MYR')
                                : '—'}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-muted font-bold">
                          <td className="px-6 py-3 text-sm text-foreground" colSpan={2}>
                            TOTAL
                          </td>
                          <td className="px-6 py-3 text-sm text-right text-foreground">
                            {formatCurrency(trialBalance?.totalDebits || 0, 'MYR')}
                          </td>
                          <td className="px-6 py-3 text-sm text-right text-foreground">
                            {formatCurrency(trialBalance?.totalCredits || 0, 'MYR')}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="p-6 bg-muted/50 border-t border-border">
                    <div className="flex items-center justify-center space-x-2">
                      {trialBalance?.balanced ? (
                        <>
                          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                          <span className="text-sm font-medium text-green-600 dark:text-green-400">
                            Trial Balance is Balanced
                          </span>
                        </>
                      ) : (
                        <>
                          <div className="w-3 h-3 bg-destructive rounded-full"></div>
                          <span className="text-sm font-medium text-destructive">
                            Trial Balance is Unbalanced (Difference:{' '}
                            {formatCurrency(
                              Math.abs(
                                (trialBalance?.totalDebits || 0) - (trialBalance?.totalCredits || 0)
                              ),
                              'MYR'
                            )}
                            )
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

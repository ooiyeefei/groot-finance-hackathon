'use client'

import { useState, useCallback } from 'react'
import { useAction } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PeriodSelector } from './period-selector'
import { TrialBalanceView } from './trial-balance-view'
import { ProfitLossView } from './profit-loss-view'
import { BalanceSheetView } from './balance-sheet-view'
import { CashFlowView } from './cash-flow-view'
import { ReportExportButtons } from './report-export-buttons'
import { HowItWorksDrawer } from './how-it-works-drawer'

interface FinancialStatementsClientProps {
  businessId: string
  businessName: string
  currency: string
}

type ReportTab = 'trial_balance' | 'pnl' | 'balance_sheet' | 'cash_flow'

export function FinancialStatementsClient({
  businessId,
  businessName,
  currency,
}: FinancialStatementsClientProps) {
  const [activeTab, setActiveTab] = useState<ReportTab>('trial_balance')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showComparison, setShowComparison] = useState(false)

  // Report data state
  const [trialBalanceData, setTrialBalanceData] = useState<any>(null)
  const [pnlData, setPnlData] = useState<any>(null)
  const [comparisonData, setComparisonData] = useState<any>(null)
  const [balanceSheetData, setBalanceSheetData] = useState<any>(null)
  const [cashFlowData, setCashFlowData] = useState<any>(null)

  // Convex actions
  const getTrialBalance = useAction(api.functions.financialStatements.getTrialBalance)
  const getProfitLoss = useAction(api.functions.financialStatements.getProfitLoss)
  const getProfitLossComparison = useAction(api.functions.financialStatements.getProfitLossComparison)
  const getBalanceSheet = useAction(api.functions.financialStatements.getBalanceSheet)
  const getCashFlow = useAction(api.functions.financialStatements.getCashFlow)

  const generateReport = useCallback(async (tab: ReportTab, from: string, to: string) => {
    if (!from || !to) return
    setIsLoading(true)
    try {
      switch (tab) {
        case 'trial_balance': {
          const result = await getTrialBalance({ businessId: businessId, asOfDate: to })
          setTrialBalanceData(result)
          break
        }
        case 'pnl': {
          const result = await getProfitLoss({ businessId: businessId, dateFrom: from, dateTo: to })
          setPnlData(result)
          // Clear comparison when period changes
          setComparisonData(null)
          break
        }
        case 'balance_sheet': {
          const result = await getBalanceSheet({ businessId: businessId, asOfDate: to })
          setBalanceSheetData(result)
          break
        }
        case 'cash_flow': {
          const result = await getCashFlow({ businessId: businessId, dateFrom: from, dateTo: to })
          setCashFlowData(result)
          break
        }
      }
    } catch (error) {
      console.error(`Failed to generate ${tab}:`, error)
    } finally {
      setIsLoading(false)
    }
  }, [businessId, getTrialBalance, getProfitLoss, getBalanceSheet, getCashFlow])

  const handlePeriodChange = useCallback((from: string, to: string) => {
    setDateFrom(from)
    setDateTo(to)
    generateReport(activeTab, from, to)
  }, [activeTab, generateReport])

  const handleTabChange = useCallback((tab: string) => {
    const newTab = tab as ReportTab
    setActiveTab(newTab)
    if (dateFrom && dateTo) {
      generateReport(newTab, dateFrom, dateTo)
    }
  }, [dateFrom, dateTo, generateReport])

  const handleToggleComparison = useCallback(async () => {
    if (showComparison) {
      setShowComparison(false)
      setComparisonData(null)
      return
    }

    if (!dateFrom || !dateTo) return

    // Calculate comparison period (same length, immediately prior)
    const fromDate = new Date(dateFrom)
    const toDate = new Date(dateTo)
    const daysDiff = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24))
    const compFrom = new Date(fromDate)
    compFrom.setDate(compFrom.getDate() - daysDiff - 1)
    const compTo = new Date(fromDate)
    compTo.setDate(compTo.getDate() - 1)

    setIsLoading(true)
    try {
      const result = await getProfitLossComparison({
        businessId: businessId,
        dateFrom,
        dateTo,
        comparisonDateFrom: compFrom.toISOString().slice(0, 10),
        comparisonDateTo: compTo.toISOString().slice(0, 10),
      })
      setComparisonData(result)
      setShowComparison(true)
    } catch (error) {
      console.error('Failed to generate comparison:', error)
    } finally {
      setIsLoading(false)
    }
  }, [showComparison, dateFrom, dateTo, businessId, getProfitLossComparison])

  const getActiveReportData = () => {
    switch (activeTab) {
      case 'trial_balance': return trialBalanceData
      case 'pnl': return pnlData
      case 'balance_sheet': return balanceSheetData
      case 'cash_flow': return cashFlowData
    }
  }

  const handleExportPdf = useCallback(() => {
    // PDF export will be handled via report-generator.ts on server side
    // For now, this is a placeholder — full implementation requires a server action
    console.log('PDF export requested for', activeTab)
  }, [activeTab])

  const periodMode = activeTab === 'balance_sheet' ? 'point-in-time' as const : 'range' as const

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PeriodSelector
          mode={periodMode}
          onPeriodChange={handlePeriodChange}
        />
        <div className="flex items-center gap-2">
          <ReportExportButtons
            reportType={activeTab}
            reportData={getActiveReportData()}
            businessName={businessName}
            currency={currency}
            periodStart={dateFrom}
            periodEnd={dateTo}
            onExportPdf={handleExportPdf}
          />
          <HowItWorksDrawer />
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="trial_balance">Trial Balance</TabsTrigger>
          <TabsTrigger value="pnl">Profit & Loss</TabsTrigger>
          <TabsTrigger value="balance_sheet">Balance Sheet</TabsTrigger>
          <TabsTrigger value="cash_flow">Cash Flow</TabsTrigger>
        </TabsList>

        <TabsContent value="trial_balance" className="mt-4">
          <TrialBalanceView data={trialBalanceData} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="pnl" className="mt-4">
          <ProfitLossView
            data={pnlData}
            comparisonData={comparisonData}
            isLoading={isLoading}
            showComparison={showComparison}
            onToggleComparison={handleToggleComparison}
          />
        </TabsContent>

        <TabsContent value="balance_sheet" className="mt-4">
          <BalanceSheetView data={balanceSheetData} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="cash_flow" className="mt-4">
          <CashFlowView data={cashFlowData} isLoading={isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

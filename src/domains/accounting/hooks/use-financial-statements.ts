'use client'

import { useState, useEffect } from 'react'
import { useAction } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { useActiveBusiness } from '@/contexts/business-context'

export function useFinancialStatements() {
  const { businessId } = useActiveBusiness()
  const getProfitLoss = useAction(api.functions.financialStatements.getProfitLoss)
  const getTrialBalance = useAction(api.functions.financialStatements.getTrialBalance)

  const [profitLoss, setProfitLoss] = useState<any>(null)
  const [trialBalance, setTrialBalance] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Current month date range
  const now = new Date()
  const dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const dateTo = now.toISOString().split('T')[0]
  const asOfDate = dateTo

  useEffect(() => {
    if (!businessId) {
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)

    Promise.all([
      getProfitLoss({ businessId, dateFrom, dateTo }),
      getTrialBalance({ businessId, asOfDate }),
    ])
      .then(([plResult, tbResult]) => {
        if (!cancelled) {
          setProfitLoss(plResult)
          setTrialBalance(tbResult)
          setIsLoading(false)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Failed to fetch financial statements:', error)
          setIsLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [businessId, dateFrom, dateTo, asOfDate, getProfitLoss, getTrialBalance])

  return {
    profitLoss,
    trialBalance,
    isLoading,
    dateRange: { dateFrom, dateTo, asOfDate },
  }
}

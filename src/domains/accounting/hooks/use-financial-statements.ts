'use client'

import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

export function useFinancialStatements() {
  const { businessId } = useActiveBusiness()

  // Current month date range
  const now = new Date()
  const dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const dateTo = now.toISOString().split('T')[0]
  const asOfDate = dateTo

  const profitLoss = useQuery(
    api.functions.financialStatements.profitLoss,
    businessId
      ? {
          businessId: businessId as Id<'businesses'>,
          dateFrom,
          dateTo,
        }
      : 'skip'
  )

  const trialBalance = useQuery(
    api.functions.financialStatements.trialBalance,
    businessId
      ? {
          businessId: businessId as Id<'businesses'>,
          asOfDate,
        }
      : 'skip'
  )

  return {
    profitLoss: profitLoss ?? null,
    trialBalance: trialBalance ?? null,
    isLoading: profitLoss === undefined || trialBalance === undefined,
    dateRange: { dateFrom, dateTo, asOfDate },
  }
}

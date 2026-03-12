'use client'

import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

/**
 * Hook for reconciliation summary (dashboard cards)
 */
export function useReconciliationSummary(options?: {
  dateFrom?: string
  dateTo?: string
}) {
  const { businessId } = useActiveBusiness()

  const result = useQuery(
    api.functions.salesOrders.getReconciliationSummary,
    businessId
      ? {
          businessId: businessId as Id<"businesses">,
          dateFrom: options?.dateFrom,
          dateTo: options?.dateTo,
        }
      : "skip"
  )

  return {
    summary: result ?? {
      totalOrders: 0,
      matched: 0,
      unmatched: 0,
      variance: 0,
      partial: 0,
      conflict: 0,
      totalGrossAmount: 0,
      totalVarianceAmount: 0,
      totalPlatformFees: 0,
    },
    isLoading: result === undefined,
  }
}

/**
 * Hook for sales orders list
 */
export function useSalesOrders(options?: {
  matchStatus?: string
  dateFrom?: string
  dateTo?: string
  sourcePlatform?: string
  importBatchId?: string
  limit?: number
}) {
  const { businessId } = useActiveBusiness()

  const result = useQuery(
    api.functions.salesOrders.list,
    businessId
      ? {
          businessId: businessId as Id<"businesses">,
          matchStatus: options?.matchStatus,
          dateFrom: options?.dateFrom,
          dateTo: options?.dateTo,
          sourcePlatform: options?.sourcePlatform,
          importBatchId: options?.importBatchId,
          limit: options?.limit,
        }
      : "skip"
  )

  return {
    orders: result?.orders ?? [],
    isLoading: result === undefined,
  }
}

/**
 * Hook for export data query
 */
export function useExportData(options?: {
  dateFrom?: string
  dateTo?: string
  matchStatus?: string
  enabled?: boolean
}) {
  const { businessId } = useActiveBusiness()

  const result = useQuery(
    api.functions.salesOrders.getExportData,
    businessId && options?.enabled !== false
      ? {
          businessId: businessId as Id<"businesses">,
          dateFrom: options?.dateFrom,
          dateTo: options?.dateTo,
          matchStatus: options?.matchStatus,
        }
      : "skip"
  )

  return {
    exportData: result?.orders ?? [],
    isLoading: result === undefined,
  }
}

/**
 * Hook for reconciliation mutations
 */
export function useReconciliationMutations() {
  const importBatch = useMutation(api.functions.salesOrders.importBatch)
  const runMatching = useMutation(api.functions.salesOrders.runMatching)
  const updateMatchStatus = useMutation(api.functions.salesOrders.updateMatchStatus)
  const reconcileLineItems = useMutation(api.functions.salesOrders.reconcileLineItems)
  const closePeriod = useMutation(api.functions.salesOrders.closePeriod)
  const reopenPeriod = useMutation(api.functions.salesOrders.reopenPeriod)

  return {
    importBatch,
    runMatching,
    updateMatchStatus,
    reconcileLineItems,
    closePeriod,
    reopenPeriod,
  }
}

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
  const approveAiMatches = useMutation(api.functions.salesOrders.approveAiMatches)
  const rejectAiMatch = useMutation(api.functions.salesOrders.rejectAiMatch)
  // NOTE: Cast to fix build — new module, types regenerate with `npx convex dev`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const createCorrection = useMutation((api.functions as any).orderMatchingCorrections.create)
  const reverseAutoMatch = useMutation(api.functions.salesOrders.reverseAutoMatch)

  return {
    importBatch,
    runMatching,
    updateMatchStatus,
    reconcileLineItems,
    closePeriod,
    reopenPeriod,
    approveAiMatches,
    rejectAiMatch,
    createCorrection,
    reverseAutoMatch,
  }
}

/**
 * Hook for auto-approval settings
 */
export function useAutoApprovalSettings() {
  const { businessId } = useActiveBusiness()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = useQuery(
    (api.functions as any).matchingSettings.getOrCreateAutoApproval,
    businessId
      ? { businessId: businessId as Id<"businesses"> }
      : "skip"
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateSettings = useMutation((api.functions as any).matchingSettings.updateAutoApproval)

  return {
    settings: result ?? {
      enableAutoApprove: false,
      autoApproveThreshold: 0.98,
      minLearningCycles: 5,
      autoApproveDisabledReason: undefined,
      autoApproveDisabledAt: undefined,
    },
    updateSettings,
    isLoading: result === undefined,
  }
}

/**
 * Hook for AI matching performance metrics
 */
export function useMatchingMetrics() {
  const { businessId } = useActiveBusiness()

  const result = useQuery(
    api.functions.salesOrders.getMatchingMetrics,
    businessId
      ? { businessId: businessId as Id<"businesses"> }
      : "skip"
  )

  return {
    metrics: result ?? {
      totalOrders: 0, tier1Matched: 0, tier2Matched: 0,
      tier2Pending: 0, tier2Rejected: 0, tier2Corrected: 0,
      totalCorrections: 0, autoMatchRate: 0, tier2Precision: 0,
      estimatedHoursSaved: 0, uniqueLearnedAliases: 0,
    },
    isLoading: result === undefined,
  }
}

// ============================================
// FEE CLASSIFICATION HOOKS
// ============================================

/**
 * Hook for fee classification rules (admin management)
 */
export function useFeeClassificationRules(platform?: string) {
  const { businessId } = useActiveBusiness()

  const result = useQuery(
    api.functions.feeClassificationRules.list,
    businessId
      ? {
          businessId: businessId as Id<"businesses">,
          platform,
        }
      : "skip"
  )

  return {
    rules: result?.rules ?? [],
    isLoading: result === undefined,
  }
}

/**
 * Hook for fee classification rule mutations
 */
export function useFeeClassificationMutations() {
  const createRule = useMutation(api.functions.feeClassificationRules.create)
  const updateRule = useMutation(api.functions.feeClassificationRules.update)
  const removeRule = useMutation(api.functions.feeClassificationRules.remove)
  const seedDefaults = useMutation(api.functions.feeClassificationRules.seedDefaults)
  const recordCorrection = useMutation(api.functions.feeClassificationCorrections.recordCorrection)
  const adjustFeeAmount = useMutation(api.functions.feeClassificationActions.adjustFeeAmount)

  return {
    createRule,
    updateRule,
    removeRule,
    seedDefaults,
    recordCorrection,
    adjustFeeAmount,
  }
}

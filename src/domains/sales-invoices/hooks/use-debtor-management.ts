'use client'

import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

/**
 * Hook for debtor list with aging analysis.
 * Wraps the payments.getDebtorList Convex query.
 */
export function useDebtorList(options?: {
  overdueOnly?: boolean
  minOutstanding?: number
  currency?: string
  sortBy?: 'outstanding' | 'daysOverdue' | 'customerName'
  sortOrder?: 'asc' | 'desc'
}) {
  const { businessId } = useActiveBusiness()

  const result = useQuery(
    api.functions.payments.getDebtorList,
    businessId
      ? {
          businessId: businessId as Id<"businesses">,
          overdueOnly: options?.overdueOnly,
          minOutstanding: options?.minOutstanding,
          currency: options?.currency,
          sortField: options?.sortBy,
          sortDirection: options?.sortOrder,
        }
      : "skip"
  )

  return {
    debtors: result?.debtors ?? [],
    summary: result?.summary ?? {
      totalDebtors: 0,
      totalOutstanding: 0,
      currency: '',
      aging: {
        current: 0,
        days1to30: 0,
        days31to60: 0,
        days61to90: 0,
        days90plus: 0,
      },
    },
    isLoading: result === undefined,
  }
}

/**
 * Hook for debtor detail with invoices and running balance.
 * Wraps the payments.getDebtorDetail Convex query.
 */
export function useDebtorDetail(customerId: string | undefined) {
  const { businessId } = useActiveBusiness()

  const result = useQuery(
    api.functions.payments.getDebtorDetail,
    customerId && businessId
      ? {
          businessId: businessId as Id<"businesses">,
          customerId: customerId as Id<"customers">,
        }
      : "skip"
  )

  return {
    detail: result ?? null,
    isLoading: result === undefined,
  }
}

/**
 * Hook for debtor statement data.
 * Wraps the payments.getDebtorStatement Convex query.
 */
export function useDebtorStatement(
  customerId: string | undefined,
  dateFrom: string | undefined,
  dateTo: string | undefined
) {
  const { businessId } = useActiveBusiness()

  const result = useQuery(
    api.functions.payments.getDebtorStatement,
    customerId && businessId && dateFrom && dateTo
      ? {
          businessId: businessId as Id<"businesses">,
          customerId: customerId as Id<"customers">,
          dateFrom,
          dateTo,
        }
      : "skip"
  )

  return {
    statement: result ?? null,
    isLoading: result === undefined,
  }
}

/**
 * Hook for AR aging report.
 * Wraps the payments.getAgingReport Convex query.
 */
export function useAgingReport(asOfDate?: string) {
  const { businessId } = useActiveBusiness()

  const result = useQuery(
    api.functions.payments.getAgingReport,
    businessId
      ? {
          businessId: businessId as Id<"businesses">,
          asOfDate,
        }
      : "skip"
  )

  return {
    report: result ?? null,
    isLoading: result === undefined,
  }
}

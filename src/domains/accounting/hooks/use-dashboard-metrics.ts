'use client'

import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

export function useDashboardMetrics() {
  const { businessId } = useActiveBusiness()

  const metrics = useQuery(
    api.functions.financialStatements.dashboardMetrics,
    businessId ? { businessId: businessId as Id<'businesses'> } : 'skip'
  )

  return {
    metrics: metrics ?? null,
    isLoading: metrics === undefined,
  }
}

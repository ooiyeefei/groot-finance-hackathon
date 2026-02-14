'use client'

import { useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

export function useSpendAnalytics() {
  const { businessId } = useActiveBusiness()
  const [periodDays, setPeriodDays] = useState<30 | 90 | 365>(90)

  const data = useQuery(
    api.functions.analytics.getVendorSpendAnalytics,
    businessId
      ? {
          businessId: businessId as Id<"businesses">,
          periodDays,
        }
      : "skip"
  )

  return {
    topVendors: data?.topVendors ?? [],
    categoryBreakdown: data?.categoryBreakdown ?? [],
    monthlyTrend: data?.monthlyTrend ?? [],
    totalSpend: data?.totalSpend ?? 0,
    periodDays,
    setPeriodDays,
    isLoading: data === undefined,
  }
}

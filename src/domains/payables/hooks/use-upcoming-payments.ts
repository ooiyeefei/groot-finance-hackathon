'use client'

import { useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

export function useUpcomingPayments() {
  const { businessId } = useActiveBusiness()
  const [periodDays, setPeriodDays] = useState<7 | 14 | 30>(14)

  const payments = useQuery(
    api.functions.analytics.getAPUpcomingPayments,
    businessId
      ? {
          businessId: businessId as Id<"businesses">,
          daysAhead: periodDays,
        }
      : "skip"
  )

  return {
    payments: payments ?? [],
    periodDays,
    setPeriodDays,
    isLoading: payments === undefined,
  }
}

'use client'

import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

export function useAccountingPeriods() {
  const { businessId } = useActiveBusiness()

  const periods = useQuery(
    api.functions.accountingPeriods.list,
    businessId ? { businessId: businessId as Id<'businesses'> } : 'skip'
  )

  const createPeriod = useMutation(api.functions.accountingPeriods.create)
  const closePeriod = useMutation(api.functions.accountingPeriods.close)
  const lockEntries = useMutation(api.functions.accountingPeriods.lockEntries)
  const reopenPeriod = useMutation(api.functions.accountingPeriods.reopen)

  return {
    businessId,
    periods: periods ?? [],
    isLoading: periods === undefined,
    createPeriod,
    closePeriod,
    lockEntries,
    reopenPeriod,
  }
}

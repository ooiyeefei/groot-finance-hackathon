'use client'

import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

export function useChartOfAccounts() {
  const { businessId } = useActiveBusiness()

  const accounts = useQuery(
    api.functions.chartOfAccounts.list,
    businessId ? { businessId: businessId as Id<'businesses'>, isActive: true } : 'skip'
  )

  const createAccount = useMutation(api.functions.chartOfAccounts.create)
  const updateAccount = useMutation(api.functions.chartOfAccounts.update)
  const deactivateAccount = useMutation(api.functions.chartOfAccounts.deactivate)

  return {
    accounts: accounts ?? [],
    isLoading: accounts === undefined,
    createAccount,
    updateAccount,
    deactivateAccount,
  }
}

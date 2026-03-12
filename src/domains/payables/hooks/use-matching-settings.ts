'use client'

import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

export function useMatchingSettings() {
  const { businessId } = useActiveBusiness()

  const settings = useQuery(
    api.functions.matchingSettings.get,
    businessId
      ? { businessId: businessId as Id<'businesses'> }
      : 'skip'
  )

  const updateMutation = useMutation(api.functions.matchingSettings.update)

  const updateSettings = async (updates: {
    quantityTolerancePercent?: number
    priceTolerancePercent?: number
    poNumberPrefix?: string
    grnNumberPrefix?: string
    autoMatchEnabled?: boolean
  }) => {
    if (!businessId) return
    await updateMutation({
      businessId: businessId as Id<'businesses'>,
      ...updates,
    })
  }

  return {
    settings: settings ?? null,
    isLoading: settings === undefined,
    updateSettings,
  }
}

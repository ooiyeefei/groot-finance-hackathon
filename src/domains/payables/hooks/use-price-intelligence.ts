'use client'

import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

interface LineItem {
  itemDescription: string
  unitPrice: number
  currency: string
}

export function usePriceIntelligence(vendorId: string | undefined, lineItems: LineItem[]) {
  const { businessId } = useActiveBusiness()

  const priceAlerts = useQuery(
    api.functions.vendorPriceHistory.detectPriceChanges,
    vendorId && lineItems.length > 0
      ? {
          vendorId: vendorId as Id<"vendors">,
          lineItems,
        }
      : "skip"
  )

  return {
    priceAlerts: priceAlerts ?? [],
    isLoading: vendorId && lineItems.length > 0 ? priceAlerts === undefined : false,
  }
}

export function useCrossVendorComparison(normalizedDescription: string | undefined) {
  const { businessId } = useActiveBusiness()

  const comparison = useQuery(
    api.functions.vendorPriceHistory.getCrossVendorComparison,
    businessId && normalizedDescription
      ? {
          businessId: businessId as Id<"businesses">,
          normalizedDescription,
        }
      : "skip"
  )

  return {
    vendors: comparison ?? [],
    isLoading: normalizedDescription ? comparison === undefined : false,
  }
}

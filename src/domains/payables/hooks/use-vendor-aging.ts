'use client'

import { useQuery } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

export function useVendorAging() {
  const { businessId } = useActiveBusiness()
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null)

  const agingData = useQuery(
    api.functions.analytics.getAgedPayablesByVendor,
    businessId
      ? { businessId: businessId as Id<"businesses"> }
      : "skip"
  )

  const drilldownData = useQuery(
    api.functions.analytics.getVendorPayablesDrilldown,
    businessId && selectedVendorId !== null
      ? {
          businessId: businessId as Id<"businesses">,
          vendorId: selectedVendorId === "__unassigned__" ? undefined : selectedVendorId,
        }
      : "skip"
  )

  return {
    vendors: agingData?.vendors ?? [],
    totals: agingData?.totals ?? { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days90plus: 0, totalOutstanding: 0 },
    drilldownEntries: drilldownData ?? [],
    selectedVendorId,
    setSelectedVendorId,
    isLoading: agingData === undefined,
    isDrilldownLoading: selectedVendorId !== null && drilldownData === undefined,
  }
}

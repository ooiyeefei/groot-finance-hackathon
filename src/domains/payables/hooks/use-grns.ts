'use client'

import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

interface GRNFilters {
  purchaseOrderId?: Id<'purchase_orders'>
  vendorId?: Id<'vendors'>
}

export function useGRNs(filters: GRNFilters = {}) {
  const { businessId } = useActiveBusiness()

  const grns = useQuery(
    api.functions.goodsReceivedNotes.list,
    businessId
      ? {
          businessId: businessId as Id<'businesses'>,
          purchaseOrderId: filters.purchaseOrderId,
          vendorId: filters.vendorId,
        }
      : 'skip'
  )

  return {
    grns: grns ?? [],
    isLoading: grns === undefined,
  }
}

export function useGRN(grnId: Id<'goods_received_notes'> | null) {
  const grn = useQuery(
    api.functions.goodsReceivedNotes.get,
    grnId ? { grnId } : 'skip'
  )

  return {
    grn: grn ?? null,
    isLoading: grnId !== null && grn === undefined,
  }
}

export function useCreateGRN() {
  const createMutation = useMutation(api.functions.goodsReceivedNotes.create)

  return {
    createGRN: createMutation,
  }
}

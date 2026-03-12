'use client'

import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

interface PurchaseOrderFilters {
  status?: 'draft' | 'issued' | 'partially_received' | 'fully_received' | 'invoiced' | 'closed' | 'cancelled'
  vendorId?: Id<'vendors'>
  dateFrom?: string
  dateTo?: string
  search?: string
}

export function usePurchaseOrders(filters: PurchaseOrderFilters = {}) {
  const { businessId } = useActiveBusiness()

  const purchaseOrders = useQuery(
    api.functions.purchaseOrders.list,
    businessId
      ? {
          businessId: businessId as Id<'businesses'>,
          status: filters.status,
          vendorId: filters.vendorId,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo,
          search: filters.search,
        }
      : 'skip'
  )

  return {
    purchaseOrders: purchaseOrders ?? [],
    isLoading: purchaseOrders === undefined,
  }
}

export function usePurchaseOrder(poId: Id<'purchase_orders'> | null) {
  const po = useQuery(
    api.functions.purchaseOrders.get,
    poId ? { poId } : 'skip'
  )

  return {
    purchaseOrder: po ?? null,
    isLoading: poId !== null && po === undefined,
  }
}

export function useNextPoNumber() {
  const { businessId } = useActiveBusiness()

  const nextNumber = useQuery(
    api.functions.purchaseOrders.getNextNumber,
    businessId
      ? { businessId: businessId as Id<'businesses'> }
      : 'skip'
  )

  return nextNumber ?? null
}

export function useCreatePurchaseOrder() {
  const createMutation = useMutation(api.functions.purchaseOrders.create)

  return {
    createPurchaseOrder: createMutation,
  }
}

export function useUpdatePurchaseOrder() {
  const updateMutation = useMutation(api.functions.purchaseOrders.update)

  return {
    updatePurchaseOrder: updateMutation,
  }
}

export function useUpdatePurchaseOrderStatus() {
  const updateStatusMutation = useMutation(api.functions.purchaseOrders.updateStatus)

  return {
    updateStatus: updateStatusMutation,
  }
}

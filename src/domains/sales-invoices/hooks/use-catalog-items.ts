'use client'

import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

/**
 * Hook for catalog item list queries
 */
export function useCatalogItems(options?: {
  status?: string
  category?: string
  search?: string
  limit?: number
}) {
  const { businessId } = useActiveBusiness()

  const items = useQuery(
    api.functions.catalogItems.list,
    businessId
      ? {
          businessId: businessId as Id<"businesses">,
          status: options?.status,
          category: options?.category,
          search: options?.search,
          limit: options?.limit,
        }
      : "skip"
  )

  return {
    items: items ?? [],
    isLoading: items === undefined,
  }
}

/**
 * Hook for catalog item autocomplete search
 */
export function useCatalogItemSearch(
  query: string,
  enabled: boolean = true,
  searchField?: 'sku' | 'name' | 'all'
) {
  const { businessId } = useActiveBusiness()

  const items = useQuery(
    api.functions.catalogItems.searchByName,
    businessId && enabled && query.length > 0
      ? {
          businessId: businessId as Id<"businesses">,
          query,
          limit: 10,
          searchField,
        }
      : "skip"
  )

  return {
    results: items ?? [],
    isLoading: items === undefined,
  }
}

/**
 * Hook for catalog item mutations
 */
export function useCatalogItemMutations() {
  const createItem = useMutation(api.functions.catalogItems.create)
  const updateItem = useMutation(api.functions.catalogItems.update)
  const deactivateItem = useMutation(api.functions.catalogItems.deactivate)
  const reactivateItem = useMutation(api.functions.catalogItems.reactivate)

  return {
    createItem,
    updateItem,
    deactivateItem,
    reactivateItem,
  }
}

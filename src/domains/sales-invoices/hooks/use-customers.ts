'use client'

import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

/**
 * Hook for customer list queries
 */
export function useCustomers(options?: {
  status?: string
  search?: string
  limit?: number
}) {
  const { businessId } = useActiveBusiness()

  const customers = useQuery(
    api.functions.customers.list,
    businessId
      ? {
          businessId: businessId as Id<"businesses">,
          status: options?.status,
          search: options?.search,
          limit: options?.limit,
        }
      : "skip"
  )

  return {
    customers: customers ?? [],
    isLoading: customers === undefined,
  }
}

/**
 * Hook for customer autocomplete search
 */
export function useCustomerSearch(query: string, enabled: boolean = true) {
  const { businessId } = useActiveBusiness()

  // When query is empty, list all active customers; otherwise search by name
  const allCustomers = useQuery(
    api.functions.customers.list,
    businessId && enabled && query.length === 0
      ? {
          businessId: businessId as Id<"businesses">,
          status: "active",
          limit: 10,
        }
      : "skip"
  )

  const searchedCustomers = useQuery(
    api.functions.customers.searchByName,
    businessId && enabled && query.length > 0
      ? {
          businessId: businessId as Id<"businesses">,
          query,
          limit: 10,
        }
      : "skip"
  )

  const customers = query.length > 0 ? searchedCustomers : allCustomers

  return {
    results: customers ?? [],
    isLoading: customers === undefined,
  }
}

/**
 * Hook for customer mutations
 */
export function useCustomerMutations() {
  const createCustomer = useMutation(api.functions.customers.create)
  const updateCustomer = useMutation(api.functions.customers.update)
  const deactivateCustomer = useMutation(api.functions.customers.deactivate)
  const reactivateCustomer = useMutation(api.functions.customers.reactivate)

  return {
    createCustomer,
    updateCustomer,
    deactivateCustomer,
    reactivateCustomer,
  }
}

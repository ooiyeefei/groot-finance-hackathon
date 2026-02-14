'use client'

import { useQuery, useMutation, useAction } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

/**
 * Hook for Stripe connection status
 */
export function useStripeConnection() {
  const { businessId } = useActiveBusiness()

  const connection = useQuery(
    api.functions.stripeIntegrations.getConnection,
    businessId
      ? { businessId: businessId as Id<"businesses"> }
      : "skip"
  )

  return {
    connection: connection ?? null,
    isConnected: connection?.status === "connected",
    isLoading: connection === undefined,
  }
}

/**
 * Hook for connecting a Stripe account (action)
 */
export function useStripeConnect() {
  const connectAction = useAction(api.functions.stripeIntegrations.connect)

  return { connect: connectAction }
}

/**
 * Hook for disconnecting a Stripe account (mutation)
 */
export function useStripeDisconnect() {
  const disconnectMutation = useMutation(api.functions.stripeIntegrations.disconnect)

  return { disconnect: disconnectMutation }
}

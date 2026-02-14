'use client'

import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'
import { useCallback } from 'react'

/**
 * Hook for Stripe connection status (real-time via Convex)
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
 * Hook for connecting a Stripe account via API route.
 * Key is validated and stored in AWS SSM — never touches Convex.
 */
export function useStripeConnect() {
  const connect = useCallback(
    async (args: { businessId: string; stripeSecretKey: string }) => {
      const response = await fetch('/api/v1/stripe-integration/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to connect Stripe')
      }
      return data.data as { accountName: string; accountId: string }
    },
    []
  )

  return { connect }
}

/**
 * Hook for disconnecting a Stripe account via API route.
 * Key is deleted from SSM, metadata updated in Convex.
 */
export function useStripeDisconnect() {
  const disconnect = useCallback(
    async (args: { businessId: string }) => {
      const response = await fetch('/api/v1/stripe-integration/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      })
      const data = await response.json()
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to disconnect Stripe')
      }
    },
    []
  )

  return { disconnect }
}

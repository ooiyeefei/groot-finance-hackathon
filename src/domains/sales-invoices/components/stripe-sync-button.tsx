'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { useStripeConnection } from '@/domains/sales-invoices/hooks/use-stripe-integration'
import { useActiveBusiness } from '@/contexts/business-context'
import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { Loader2, RefreshCw } from 'lucide-react'

export default function StripeSyncButton() {
  const { businessId } = useActiveBusiness()
  const { isConnected, connection } = useStripeConnection()
  const { addToast } = useToast()
  const [isSyncing, setIsSyncing] = useState(false)

  // Real-time sync progress
  const syncProgress = useQuery(
    api.functions.catalogItems.getSyncProgress,
    businessId && isSyncing
      ? { businessId: businessId as Id<"businesses"> }
      : "skip"
  )

  // Auto-stop syncing state when sync completes
  useEffect(() => {
    if (syncProgress && syncProgress.status !== "running" && isSyncing) {
      setIsSyncing(false)
    }
  }, [syncProgress, isSyncing])

  if (!isConnected) return null

  const handleSync = async () => {
    if (!businessId) return
    setIsSyncing(true)

    try {
      const response = await fetch('/api/v1/stripe-integration/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId }),
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to sync from Stripe')
      }

      addToast({
        type: 'success',
        title: 'Stripe Sync Complete',
        description: `${data.data.created} created, ${data.data.updated} updated, ${data.data.deactivated} deactivated`,
      })
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Sync Failed',
        description: err instanceof Error ? err.message : 'Failed to sync from Stripe',
      })
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        onClick={handleSync}
        disabled={isSyncing}
        variant="secondary"
        size="sm"
      >
        {isSyncing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            {syncProgress
              ? `Syncing ${syncProgress.processed} of ${syncProgress.total}...`
              : 'Starting sync...'}
          </>
        ) : (
          <>
            <RefreshCw className="w-4 h-4 mr-2" />
            Sync from Stripe
          </>
        )}
      </Button>
      {connection?.lastSyncAt && !isSyncing && (
        <span className="text-xs text-muted-foreground">
          Last synced: {new Date(connection.lastSyncAt).toLocaleString()}
        </span>
      )}
    </div>
  )
}

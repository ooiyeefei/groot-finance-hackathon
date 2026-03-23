'use client'

import { useState, useEffect } from 'react'
import { useAction } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import { useActiveBusiness } from '@/contexts/business-context'

export function useDashboardMetrics() {
  const { businessId } = useActiveBusiness()
  const getDashboardMetrics = useAction(api.functions.financialStatements.getDashboardMetrics)
  const [metrics, setMetrics] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!businessId) {
      setIsLoading(false)
      return
    }

    let cancelled = false
    setIsLoading(true)

    getDashboardMetrics({ businessId })
      .then((result) => {
        if (!cancelled) {
          setMetrics(result)
          setIsLoading(false)
        }
      })
      .catch((error) => {
        if (!cancelled) {
          console.error('Failed to fetch dashboard metrics:', error)
          setIsLoading(false)
        }
      })

    return () => { cancelled = true }
  }, [businessId, getDashboardMetrics])

  return {
    metrics,
    isLoading,
  }
}

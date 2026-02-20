'use client'

/**
 * useCatalog Hook
 *
 * Fetches the live product catalog from /api/v1/billing/catalog
 * with currency-resolved prices. Falls back to FALLBACK_PLANS while loading.
 */

import { useState, useEffect, useCallback } from 'react'
import { FALLBACK_PLANS, type PlanKey } from '@/lib/stripe/plans'

export interface CatalogPlan {
  name: PlanKey
  displayName: string
  price: number
  currency: string
  priceId: string | null
  features: string[]
  highlightFeatures: string[]
  ocrLimit: number
  teamLimit: number
  isCustomPricing: boolean
  interval: 'month' | 'year' | null
}

export interface UseCatalogReturn {
  plans: CatalogPlan[]
  currency: string
  availableCurrencies: string[]
  isLoading: boolean
  error: string | null
}

/** Build fallback plans array from static FALLBACK_PLANS */
function buildFallbackPlans(currency: string): CatalogPlan[] {
  const keys: PlanKey[] = ['starter', 'pro', 'enterprise']
  return keys.map((key) => {
    const plan = FALLBACK_PLANS[key]
    return {
      name: plan.planKey,
      displayName: plan.name,
      price: plan.price,
      currency: plan.currency,
      priceId: plan.priceId,
      features: plan.features,
      highlightFeatures: plan.highlightFeatures,
      ocrLimit: plan.ocrLimit,
      teamLimit: plan.teamLimit,
      isCustomPricing: plan.isCustomPricing,
      interval: plan.interval,
    }
  })
}

export function useCatalog(currency?: string): UseCatalogReturn {
  const [plans, setPlans] = useState<CatalogPlan[]>(() => buildFallbackPlans(currency || 'MYR'))
  const [resolvedCurrency, setResolvedCurrency] = useState(currency || 'MYR')
  const [availableCurrencies, setAvailableCurrencies] = useState<string[]>(['MYR'])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchCatalog = useCallback(async (cur?: string) => {
    try {
      setIsLoading(true)
      setError(null)

      const params = cur ? `?currency=${encodeURIComponent(cur)}` : ''
      const response = await fetch(`/api/v1/billing/catalog${params}`)
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to fetch catalog')
      }

      setPlans(result.data.plans)
      setResolvedCurrency(result.data.currency)
      setAvailableCurrencies(result.data.availableCurrencies)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setError(message)
      console.error('[useCatalog] Error:', message)
      // Keep fallback plans on error
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCatalog(currency)
  }, [fetchCatalog, currency])

  return {
    plans,
    currency: resolvedCurrency,
    availableCurrencies,
    isLoading,
    error,
  }
}

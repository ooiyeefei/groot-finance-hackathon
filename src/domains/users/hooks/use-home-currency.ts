/**
 * Unified Home Currency Hook
 *
 * Provides centralized currency preference management with:
 * - Singleton in-memory cache to prevent duplicate API calls
 * - localStorage fallback for instant loading
 * - Automatic cache invalidation after 30 minutes
 * - Single source of truth across all components
 */

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { SupportedCurrency } from '@/lib/types/currency'

const SUPPORTED_CURRENCIES: { code: SupportedCurrency; name: string }[] = [
  { code: 'USD', name: 'US Dollar (USD)' },
  { code: 'SGD', name: 'Singapore Dollar (SGD)' },
  { code: 'MYR', name: 'Malaysian Ringgit (MYR)' },
  { code: 'THB', name: 'Thai Baht (THB)' },
  { code: 'IDR', name: 'Indonesian Rupiah (IDR)' },
  { code: 'VND', name: 'Vietnamese Dong (VND)' },
  { code: 'PHP', name: 'Philippine Peso (PHP)' },
  { code: 'CNY', name: 'Chinese Yuan (CNY)' },
  { code: 'EUR', name: 'Euro (EUR)' },
  { code: 'INR', name: 'Indian Rupee (INR)' }
]

// Singleton cache to prevent duplicate fetches across components
let cachedCurrency: SupportedCurrency | null = null
let cacheTimestamp = 0
const CACHE_DURATION = 30 * 60 * 1000 // 30 minutes

// Custom event name for same-tab currency updates
const CURRENCY_CHANGE_EVENT = 'finanseal:currency-change'

/**
 * Hook to get and set user's home currency preference
 *
 * Features:
 * - Returns cached value immediately if available
 * - Fetches from API if cache is stale
 * - Syncs with localStorage for persistence
 * - Prevents duplicate API calls across component instances
 *
 * @returns {Object} Currency state and loading status
 */
export function useHomeCurrency() {
  const { isLoaded: isAuthLoaded, isSignedIn } = useAuth()
  const [currency, setCurrency] = useState<SupportedCurrency>(() => {
    // Priority 1: Check singleton cache first (fastest)
    if (cachedCurrency && Date.now() - cacheTimestamp < CACHE_DURATION) {
      return cachedCurrency
    }

    // Priority 2: Fallback to localStorage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('homeCurrency')
      if (stored && SUPPORTED_CURRENCIES.some(c => c.code === stored)) {
        return stored as SupportedCurrency
      }
    }

    // Priority 3: Default to MYR (matches database default for MY-focused product)
    return 'MYR'
  })

  const [isLoading, setIsLoading] = useState(!cachedCurrency)

  useEffect(() => {
    const loadCurrency = async () => {
      // Wait for Clerk auth to be ready before making API calls
      if (!isAuthLoaded || !isSignedIn) {
        return
      }

      // Skip fetch if cache is still fresh
      if (cachedCurrency && Date.now() - cacheTimestamp < CACHE_DURATION) {
        setIsLoading(false)
        return
      }

      try {
        const response = await fetch('/api/v1/users/profile')
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.data?.preferred_currency) {
            const newCurrency = data.data.preferred_currency as SupportedCurrency

            // Validate currency is supported
            if (SUPPORTED_CURRENCIES.some(c => c.code === newCurrency)) {
              // Update all caches atomically
              cachedCurrency = newCurrency
              cacheTimestamp = Date.now()

              if (typeof window !== 'undefined') {
                localStorage.setItem('homeCurrency', newCurrency)
              }

              setCurrency(newCurrency)
            }
          }
        }
      } catch (error) {
        console.error('[useHomeCurrency] Failed to load currency preference:', error)
        // Keep existing currency on error (graceful degradation)
      } finally {
        setIsLoading(false)
      }
    }

    loadCurrency()

    // Listen for changes from other tabs/windows (via storage event)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'homeCurrency' && e.newValue) {
        const newCurrency = e.newValue as SupportedCurrency
        if (SUPPORTED_CURRENCIES.some(c => c.code === newCurrency)) {
          cachedCurrency = newCurrency
          cacheTimestamp = Date.now()
          setCurrency(newCurrency)
        }
      }
    }

    // Listen for changes from same tab (via custom event)
    const handleCurrencyChange = (e: CustomEvent<SupportedCurrency>) => {
      const newCurrency = e.detail
      if (SUPPORTED_CURRENCIES.some(c => c.code === newCurrency)) {
        setCurrency(newCurrency)
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange)
      window.addEventListener(CURRENCY_CHANGE_EVENT, handleCurrencyChange as EventListener)
      return () => {
        window.removeEventListener('storage', handleStorageChange)
        window.removeEventListener(CURRENCY_CHANGE_EVENT, handleCurrencyChange as EventListener)
      }
    }
  }, [isAuthLoaded, isSignedIn])

  return {
    currency,
    isLoading,
    supportedCurrencies: SUPPORTED_CURRENCIES
  }
}

/**
 * Utility function to update currency preference
 * Updates all caches and persists to backend
 *
 * @param newCurrency - Currency code to set
 * @returns Promise resolving to success status
 */
export async function updateHomeCurrency(newCurrency: SupportedCurrency): Promise<boolean> {
  try {
    const response = await fetch('/api/v1/users/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferred_currency: newCurrency })
    })

    if (!response.ok) {
      throw new Error('Failed to update currency preference')
    }

    // Update all caches on success
    cachedCurrency = newCurrency
    cacheTimestamp = Date.now()

    if (typeof window !== 'undefined') {
      localStorage.setItem('homeCurrency', newCurrency)

      // Dispatch custom event to notify same-tab hook instances
      // (storage events only fire for other tabs)
      window.dispatchEvent(new CustomEvent(CURRENCY_CHANGE_EVENT, { detail: newCurrency }))
    }

    return true
  } catch (error) {
    console.error('[updateHomeCurrency] Failed to save currency:', error)
    return false
  }
}

/**
 * Clear currency cache (useful for testing or logout)
 */
export function clearCurrencyCache() {
  cachedCurrency = null
  cacheTimestamp = 0

  if (typeof window !== 'undefined') {
    localStorage.removeItem('homeCurrency')
  }
}

export { SUPPORTED_CURRENCIES }

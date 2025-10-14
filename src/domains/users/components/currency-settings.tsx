'use client'

import { useState, useEffect } from 'react'
import { SupportedCurrency } from '@/domains/accounting-entries/types'

const SUPPORTED_CURRENCIES: { code: SupportedCurrency; name: string }[] = [
  { code: 'USD', name: 'US Dollar (USD)' },
  { code: 'SGD', name: 'Singapore Dollar (SGD)' },
  { code: 'MYR', name: 'Malaysian Ringgit (MYR)' },
  { code: 'THB', name: 'Thai Baht (THB)' },
  { code: 'IDR', name: 'Indonesian Rupiah (IDR)' },
  { code: 'VND', name: 'Vietnamese Dong (VND)' },
  { code: 'PHP', name: 'Philippine Peso (PHP)' },
  { code: 'CNY', name: 'Chinese Yuan (CNY)' },
  { code: 'EUR', name: 'Euro (EUR)' }
]

interface CurrencySettingsProps {
  onCurrencyChange?: (currency: SupportedCurrency) => void
}

export default function CurrencySettings({ onCurrencyChange }: CurrencySettingsProps) {
  const [homeCurrency, setHomeCurrency] = useState<SupportedCurrency>('USD')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  // Load user's current currency preference
  useEffect(() => {
    loadCurrencyPreference()
  }, [])

  const loadCurrencyPreference = async () => {
    try {
      setIsLoading(true)

      // Load user's home currency from Supabase profile
      const response = await fetch('/api/v1/users/profile')
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data?.home_currency) {
          const currency = data.data.home_currency as SupportedCurrency
          if (SUPPORTED_CURRENCIES.some(c => c.code === currency)) {
            setHomeCurrency(currency)
            // Sync to localStorage for immediate access in other components
            localStorage.setItem('homeCurrency', currency)
          }
        }
      } else {
        // Fallback to localStorage if API fails
        const stored = localStorage.getItem('homeCurrency')
        if (stored && SUPPORTED_CURRENCIES.some(c => c.code === stored)) {
          setHomeCurrency(stored as SupportedCurrency)
        }
      }

    } catch (error) {
      console.error('Failed to load currency preference:', error)
      // Fallback to localStorage on error
      const stored = localStorage.getItem('homeCurrency')
      if (stored && SUPPORTED_CURRENCIES.some(c => c.code === stored)) {
        setHomeCurrency(stored as SupportedCurrency)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const saveCurrencyPreference = async (currency: SupportedCurrency) => {
    try {
      setIsSaving(true)

      // Save to Supabase database first
      const response = await fetch('/api/v1/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home_currency: currency })
      })

      if (!response.ok) {
        throw new Error('Failed to save currency preference to database')
      }

      // Save to localStorage for immediate access
      localStorage.setItem('homeCurrency', currency)

      setLastSaved(new Date())
      onCurrencyChange?.(currency)

    } catch (error) {
      console.error('Failed to save currency preference:', error)
      throw error // Re-throw to show user error
    } finally {
      setIsSaving(false)
    }
  }

  const handleCurrencyChange = async (newCurrency: SupportedCurrency) => {
    if (newCurrency === homeCurrency) return
    
    setHomeCurrency(newCurrency)
    await saveCurrencyPreference(newCurrency)
  }

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-white">Currency Preferences</h2>
        {lastSaved && (
          <span className="text-xs text-green-400">
            Saved {lastSaved.toLocaleTimeString()}
          </span>
        )}
      </div>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Home Currency
          </label>
          <p className="text-xs text-gray-400 mb-3">
            This currency will be used for dashboard summaries and conversions throughout the app.
          </p>
          <select 
            value={homeCurrency}
            onChange={(e) => handleCurrencyChange(e.target.value as SupportedCurrency)}
            disabled={isLoading || isSaving}
            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {SUPPORTED_CURRENCIES.map(currency => (
              <option key={currency.code} value={currency.code}>
                {currency.name}
              </option>
            ))}
          </select>
          
          {isSaving && (
            <p className="text-xs text-blue-400 mt-2 flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
              Saving preferences...
            </p>
          )}
        </div>

        <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 text-blue-400 mt-0.5">
              <svg fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-medium text-blue-300 mb-1">Currency Conversion</h4>
              <p className="text-sm text-blue-200">
                Transactions in other currencies will be converted to {homeCurrency} for dashboard summaries. 
                Original amounts and currencies are always preserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Hook to get current user's home currency preference
export function useHomeCurrency(): SupportedCurrency {
  const [homeCurrency, setHomeCurrency] = useState<SupportedCurrency>('SGD') // Default to SGD to match database default

  useEffect(() => {
    const loadUserCurrency = async () => {
      try {
        // Try to load from API first
        const response = await fetch('/api/v1/users/profile')
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.data?.home_currency) {
            const currency = data.data.home_currency as SupportedCurrency
            if (SUPPORTED_CURRENCIES.some(c => c.code === currency)) {
              setHomeCurrency(currency)
              // Sync to localStorage for consistency
              localStorage.setItem('homeCurrency', currency)
              return
            }
          }
        }

        // Fallback to localStorage if API fails
        const stored = localStorage.getItem('homeCurrency')
        if (stored && SUPPORTED_CURRENCIES.some(c => c.code === stored)) {
          setHomeCurrency(stored as SupportedCurrency)
        }
      } catch (error) {
        console.error('Failed to load user currency:', error)
        // Fallback to localStorage on error
        const stored = localStorage.getItem('homeCurrency')
        if (stored && SUPPORTED_CURRENCIES.some(c => c.code === stored)) {
          setHomeCurrency(stored as SupportedCurrency)
        }
      }
    }

    loadUserCurrency()

    // Listen for changes to localStorage (from other tabs or settings page)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'homeCurrency' && e.newValue) {
        const newCurrency = e.newValue as SupportedCurrency
        if (SUPPORTED_CURRENCIES.some(c => c.code === newCurrency)) {
          setHomeCurrency(newCurrency)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [])

  return homeCurrency
}
'use client'

import { useState, useEffect } from 'react'
import { User, DollarSign, CheckCircle, AlertCircle } from 'lucide-react'
import { useBusinessContext } from '@/contexts/business-context'
import { SupportedCurrency, CURRENCY_SYMBOLS } from '@/domains/accounting-entries/types'
import { useUser } from '@clerk/nextjs'
import { useToast } from '@/components/ui/toast'

interface UserProfileSectionProps {
  className?: string
}

export default function UserProfileSection({ className }: UserProfileSectionProps) {
  const { user } = useUser()
  const { profile, isLoadingProfile } = useBusinessContext()
  const { addToast } = useToast()
  const [preferredCurrency, setPreferredCurrency] = useState<SupportedCurrency>('USD')
  const [isCurrencySaving, setIsCurrencySaving] = useState(false)
  const [lastCurrencySaved, setLastCurrencySaved] = useState<Date | null>(null)
  const [allowedCurrencies, setAllowedCurrencies] = useState<SupportedCurrency[]>([])

  // Load user preferences and business allowed currencies
  useEffect(() => {
    // For now, set default values since we haven't implemented the API endpoint yet
    // This will be updated when we implement the business settings API
    setAllowedCurrencies(['USD', 'SGD', 'MYR', 'THB', 'IDR', 'VND', 'PHP', 'CNY', 'EUR'])
  }, [profile])

  // Load user's current preferred currency
  useEffect(() => {
    const loadUserPreferences = async () => {
      try {
        const response = await fetch('/api/v1/users/profile')
        if (response.ok) {
          const data = await response.json()
          setPreferredCurrency(data.preferred_currency || 'USD')
        }
      } catch (error) {
        console.error('Error loading user preferences:', error)
      }
    }

    loadUserPreferences()
  }, [profile])

  const saveCurrencyPreference = async (currency: SupportedCurrency) => {
    try {
      setIsCurrencySaving(true)

      const response = await fetch('/api/v1/users/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferred_currency: currency
        })
      })

      if (!response.ok) {
        throw new Error('Failed to save currency preference to database')
      }

      setLastCurrencySaved(new Date())
      addToast({
        type: 'success',
        title: 'Currency updated',
        description: `Preference changed to ${currency}`
      })

    } catch (error) {
      console.error('Failed to save currency preference:', error)
      addToast({
        type: 'error',
        title: 'Failed to update currency',
        description: 'Unable to save currency preference. Please try again.'
      })
    } finally {
      setIsCurrencySaving(false)
    }
  }

  const handleCurrencyChange = async (newCurrency: SupportedCurrency) => {
    if (newCurrency === preferredCurrency) return

    setPreferredCurrency(newCurrency)
    await saveCurrencyPreference(newCurrency)
  }

  if (isLoadingProfile) {
    return (
      <div className={`bg-card rounded-lg border border-border p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-muted rounded w-48 mb-4"></div>
          <div className="space-y-4">
            <div className="h-4 bg-muted rounded w-32"></div>
            <div className="h-10 bg-muted rounded w-full"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* User Profile & Currency Preferences */}
      <div className="bg-card rounded-lg border border-border p-6">
        <div className="flex items-center gap-3 mb-6">
          <DollarSign className="w-5 h-5 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">Currency Preferences</h3>
            <p className="text-sm text-muted-foreground">Choose how financial data is displayed for you</p>
          </div>
        </div>

        {/* User Info Display */}
        <div className="mb-6 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-success rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-success-foreground" />
            </div>
            <div>
              <p className="text-foreground font-medium">
                {user?.fullName || user?.firstName + ' ' + user?.lastName || 'User'}
              </p>
              <p className="text-muted-foreground text-sm">
                {user?.primaryEmailAddress?.emailAddress}
              </p>
            </div>
          </div>
        </div>

        {/* Preferred Currency */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-foreground mb-2">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Preferred Display Currency
            </div>
          </label>
          <select
            value={preferredCurrency}
            onChange={(e) => handleCurrencyChange(e.target.value as SupportedCurrency)}
            disabled={isCurrencySaving}
            className="w-full bg-background border border-input rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            {allowedCurrencies.map(currency => (
              <option key={currency} value={currency}>
                {CURRENCY_SYMBOLS[currency]} {currency} - {getCurrencyName(currency)}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1">
            All amounts will be converted and displayed in this currency for your personal dashboard
          </p>

          {isCurrencySaving && (
            <p className="text-xs text-primary mt-2 flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
              Saving preferences...
            </p>
          )}

          {lastCurrencySaved && !isCurrencySaving && (
            <p className="text-xs text-success mt-2 flex items-center gap-2">
              <CheckCircle className="w-3 h-3" />
              Saved {lastCurrencySaved.toLocaleTimeString()}
            </p>
          )}

          {/* Business Currency Context */}
          <div className="mt-2 p-2 bg-primary/10 border border-primary/20 rounded text-xs text-primary">
            <AlertCircle className="w-3 h-3 inline mr-1" />
            Business reports use the configured functional currency for consolidation
          </div>
        </div>

        {/* Currency Restrictions Info */}
        {allowedCurrencies.length < 9 && (
          <div className="mb-6 p-3 bg-warning/10 border border-warning/20 rounded">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-warning-foreground mt-0.5 flex-shrink-0" />
              <div className="text-xs text-warning-foreground">
                <strong>Available currencies:</strong> Your business administrator has configured specific currencies for operations.
                Contact your admin if you need access to additional currencies.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Profile Management (Future Enhancement) */}
      <div className="bg-card/50 rounded-lg border border-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <User className="w-5 h-5 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">Profile Management</h3>
            <p className="text-sm text-muted-foreground">Additional profile settings and preferences</p>
          </div>
        </div>
        <div className="text-center py-6">
          <AlertCircle className="w-8 h-8 text-warning-foreground mx-auto mb-2" />
          <p className="text-muted-foreground text-sm">
            Extended profile management will be available in a future update
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            Current profile information is managed through Clerk authentication
          </p>
        </div>
      </div>
    </div>
  )
}

// Helper function to get currency display names
function getCurrencyName(currency: SupportedCurrency): string {
  const names: Record<SupportedCurrency, string> = {
    USD: 'US Dollar',
    SGD: 'Singapore Dollar',
    MYR: 'Malaysian Ringgit',
    THB: 'Thai Baht',
    IDR: 'Indonesian Rupiah',
    VND: 'Vietnamese Dong',
    PHP: 'Philippine Peso',
    CNY: 'Chinese Yuan',
    EUR: 'Euro',
    INR: 'Indian Rupee'
  }
  return names[currency] || currency
}
'use client'

import { useState } from 'react'
import { DollarSign } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { useBusinessProfile } from '@/contexts/business-context'
import { SupportedCurrency } from '@/lib/types/currency'
import { SUPPORTED_CURRENCIES } from '@/domains/users/hooks/use-home-currency'

export default function CurrencyPreferences() {
  const { profile, isLoading, updateProfile } = useBusinessProfile()
  const { addToast } = useToast()
  const [isCurrencySaving, setIsCurrencySaving] = useState(false)
  const [lastCurrencySaved, setLastCurrencySaved] = useState<Date | null>(null)

  const handleCurrencyChange = async (newCurrency: SupportedCurrency) => {
    if (newCurrency === profile?.home_currency) return

    try {
      setIsCurrencySaving(true)

      const csrfResponse = await fetch('/api/v1/utils/security/csrf-token')
      if (!csrfResponse.ok) {
        throw new Error('Failed to get CSRF token')
      }
      const csrfData = await csrfResponse.json()
      if (!csrfData.success) {
        throw new Error(csrfData.error || 'Failed to get CSRF token')
      }

      const response = await fetch('/api/v1/account-management/businesses/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfData.data.csrfToken
        },
        body: JSON.stringify({
          home_currency: newCurrency
        })
      })

      const result = await response.json()

      if (result.success) {
        updateProfile(result.data)
        setLastCurrencySaved(new Date())
        addToast({
          type: 'success',
          title: 'Currency updated',
          description: `Business home currency changed to ${newCurrency}`
        })
      } else {
        throw new Error(result.error || 'Failed to update currency')
      }
    } catch (error) {
      console.error('[Currency Preferences] Failed to update currency:', error)
      addToast({
        type: 'error',
        title: 'Failed to update currency',
        description: 'Unable to save business currency'
      })
    } finally {
      setIsCurrencySaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-center space-x-3 mb-4">
        <DollarSign className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-medium text-foreground">Currency Preferences</h3>
        {lastCurrencySaved && (
          <span className="text-xs text-primary">
            Saved {lastCurrencySaved.toLocaleTimeString()}
          </span>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Home Currency</label>
        <p className="text-xs text-muted-foreground mb-3">
          This currency will be used for dashboard summaries and conversions throughout the app.
        </p>
        <select
          value={profile?.home_currency || 'MYR'}
          onChange={(e) => handleCurrencyChange(e.target.value as SupportedCurrency)}
          disabled={isLoading || isCurrencySaving}
          className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        >
          {SUPPORTED_CURRENCIES.map(currency => (
            <option key={currency.code} value={currency.code}>{currency.name}</option>
          ))}
        </select>
        {isCurrencySaving && (
          <p className="text-xs text-primary mt-2 flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
            Saving preferences...
          </p>
        )}
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-4 mt-4">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 text-primary mt-0.5">
              <svg fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
            </div>
            <div>
              <h4 className="text-sm font-medium text-foreground mb-1">Currency Conversion</h4>
              <p className="text-sm text-muted-foreground">
                Transactions in other currencies will be converted to {profile?.home_currency || 'MYR'} for dashboard summaries.
                Original amounts and currencies are always preserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

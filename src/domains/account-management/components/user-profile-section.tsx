'use client'

import { useState, useEffect } from 'react'
import { User, DollarSign, CheckCircle, AlertCircle } from 'lucide-react'
import { useBusinessContext } from '@/contexts/business-context'
import { SupportedCurrency, CURRENCY_SYMBOLS } from '@/domains/accounting-entries/types'
import { useUser } from '@clerk/nextjs'

interface UserProfileSectionProps {
  className?: string
}

export default function UserProfileSection({ className }: UserProfileSectionProps) {
  const { user } = useUser()
  const { profile, isLoadingProfile } = useBusinessContext()
  const [preferredCurrency, setPreferredCurrency] = useState<SupportedCurrency>('USD')
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
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

  const handleSave = async () => {
    try {
      setSaving(true)
      setSuccessMessage('')

      const response = await fetch('/api/v1/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          preferred_currency: preferredCurrency
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update user preferences')
      }

      setSuccessMessage('Personal preferences saved successfully!')
      setTimeout(() => setSuccessMessage(''), 3000)

    } catch (error) {
      console.error('Error saving user preferences:', error)
      alert('Failed to save preferences. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (isLoadingProfile) {
    return (
      <div className={`bg-gray-800 rounded-lg border border-gray-700 p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-48 mb-4"></div>
          <div className="space-y-4">
            <div className="h-4 bg-gray-700 rounded w-32"></div>
            <div className="h-10 bg-gray-700 rounded w-full"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {/* User Profile & Currency Preferences */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-6">
          <DollarSign className="w-5 h-5 text-gray-400" />
          <div>
            <h3 className="text-lg font-semibold text-white">Currency Preferences</h3>
            <p className="text-sm text-gray-400">Choose how financial data is displayed for you</p>
          </div>
        </div>

        {/* User Info Display */}
        <div className="mb-6 p-4 bg-gray-700/50 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-medium">
                {user?.fullName || user?.firstName + ' ' + user?.lastName || 'User'}
              </p>
              <p className="text-gray-400 text-sm">
                {user?.primaryEmailAddress?.emailAddress}
              </p>
            </div>
          </div>
        </div>

        {/* Preferred Currency */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Preferred Display Currency
            </div>
          </label>
          <select
            value={preferredCurrency}
            onChange={(e) => setPreferredCurrency(e.target.value as SupportedCurrency)}
            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {allowedCurrencies.map(currency => (
              <option key={currency} value={currency}>
                {CURRENCY_SYMBOLS[currency]} {currency} - {getCurrencyName(currency)}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            All amounts will be converted and displayed in this currency for your personal dashboard
          </p>

          {/* Business Currency Context */}
          <div className="mt-2 p-2 bg-blue-600/10 border border-blue-600/20 rounded text-xs text-blue-300">
            <AlertCircle className="w-3 h-3 inline mr-1" />
            Business reports use the configured functional currency for consolidation
          </div>
        </div>

        {/* Currency Restrictions Info */}
        {allowedCurrencies.length < 9 && (
          <div className="mb-6 p-3 bg-yellow-600/10 border border-yellow-600/20 rounded">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-yellow-300">
                <strong>Available currencies:</strong> Your business administrator has configured specific currencies for operations.
                Contact your admin if you need access to additional currencies.
              </div>
            </div>
          </div>
        )}

        {/* Save Button and Status */}
        <div className="flex items-center justify-between pt-4 border-t border-gray-700">
          <div className="flex items-center gap-2">
            {successMessage && (
              <div className="flex items-center gap-2 text-green-400 text-sm">
                <CheckCircle className="w-4 h-4" />
                {successMessage}
              </div>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving...
              </>
            ) : (
              'Save Preferences'
            )}
          </button>
        </div>
      </div>

      {/* Profile Management (Future Enhancement) */}
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <User className="w-5 h-5 text-gray-400" />
          <div>
            <h3 className="text-lg font-semibold text-white">Profile Management</h3>
            <p className="text-sm text-gray-400">Additional profile settings and preferences</p>
          </div>
        </div>
        <div className="text-center py-6">
          <AlertCircle className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">
            Extended profile management will be available in a future update
          </p>
          <p className="text-gray-500 text-xs mt-1">
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
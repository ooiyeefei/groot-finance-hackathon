'use client'

import { useState, useEffect } from 'react'
import { Building2, DollarSign, Tag, Shield, CheckCircle, AlertCircle } from 'lucide-react'
import { useBusinessContext } from '@/contexts/business-context'
import { SupportedCurrency, CURRENCY_SYMBOLS } from '@/domains/accounting-entries/types'

// Create array of supported currencies from the type
const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  'USD', 'SGD', 'MYR', 'THB', 'IDR', 'VND', 'PHP', 'CNY', 'EUR'
]

interface BusinessSettingsSectionProps {
  className?: string
}

export default function BusinessSettingsSection({ className }: BusinessSettingsSectionProps) {
  const { profile, isLoadingProfile } = useBusinessContext()
  const [allowedCurrencies, setAllowedCurrencies] = useState<SupportedCurrency[]>([])
  const [homeCurrency, setHomeCurrency] = useState<SupportedCurrency>('USD')
  const [saving, setSaving] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  // Load business settings when data is available
  useEffect(() => {
    // For now, set default values since we haven't implemented the API endpoint yet
    // This will be updated when we implement the business settings API
    setAllowedCurrencies(['USD', 'SGD', 'MYR', 'THB', 'IDR', 'VND', 'PHP', 'CNY', 'EUR'])
    setHomeCurrency('USD')
  }, [profile])

  const handleCurrencyToggle = (currency: SupportedCurrency) => {
    setAllowedCurrencies(prev => {
      if (prev.includes(currency)) {
        // Don't allow removing home currency
        if (currency === homeCurrency) {
          return prev
        }
        return prev.filter(c => c !== currency)
      } else {
        return [...prev, currency]
      }
    })
  }

  const handleHomeCurrencyChange = (newHomeCurrency: SupportedCurrency) => {
    setHomeCurrency(newHomeCurrency)
    // Ensure new home currency is in allowed currencies
    if (!allowedCurrencies.includes(newHomeCurrency)) {
      setAllowedCurrencies(prev => [...prev, newHomeCurrency])
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      setSuccessMessage('')

      const response = await fetch('/api/v1/businesses/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          home_currency: homeCurrency,
          allowed_currencies: allowedCurrencies
        })
      })

      if (!response.ok) {
        throw new Error('Failed to update business settings')
      }

      setSuccessMessage('Business settings saved successfully!')
      setTimeout(() => setSuccessMessage(''), 3000)

    } catch (error) {
      console.error('Error saving business settings:', error)
      alert('Failed to save business settings. Please try again.')
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
      {/* Business Currency Settings */}
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-6">
          <DollarSign className="w-5 h-5 text-gray-400" />
          <div>
            <h3 className="text-lg font-semibold text-white">Currency Configuration</h3>
            <p className="text-sm text-gray-400">Manage your business's functional and operational currencies</p>
          </div>
        </div>

        {/* Home Currency (Functional Currency) */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Functional Currency (Home Currency)
            </div>
          </label>
          <select
            value={homeCurrency}
            onChange={(e) => handleHomeCurrencyChange(e.target.value as SupportedCurrency)}
            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {SUPPORTED_CURRENCIES.map(currency => (
              <option key={currency} value={currency}>
                {CURRENCY_SYMBOLS[currency]} {currency} - {getCurrencyName(currency)}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            Primary currency for financial reporting and consolidation (IFRS functional currency)
          </p>
        </div>

        {/* Allowed Currencies */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-300 mb-3">
            <div className="flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Operational Currencies
            </div>
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {SUPPORTED_CURRENCIES.map(currency => {
              const isSelected = allowedCurrencies.includes(currency)
              const isHomeCurrency = currency === homeCurrency

              return (
                <button
                  key={currency}
                  onClick={() => handleCurrencyToggle(currency)}
                  disabled={isHomeCurrency}
                  className={`
                    flex items-center justify-between p-3 rounded-lg border transition-all text-sm font-medium
                    ${isSelected
                      ? 'bg-blue-600/20 border-blue-500 text-blue-300'
                      : 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600'
                    }
                    ${isHomeCurrency
                      ? 'opacity-100 cursor-default'
                      : 'cursor-pointer hover:scale-105'
                    }
                  `}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{CURRENCY_SYMBOLS[currency]}</span>
                    <span>{currency}</span>
                  </div>
                  {isSelected && (
                    <CheckCircle className={`w-4 h-4 ${isHomeCurrency ? 'text-green-400' : 'text-blue-400'}`} />
                  )}
                  {isHomeCurrency && (
                    <Shield className="w-4 h-4 text-green-400" />
                  )}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Currencies employees can use for expense submissions and transactions
            {homeCurrency && (
              <span className="block mt-1">
                <Shield className="w-3 h-3 inline mr-1 text-green-400" />
                {homeCurrency} is your functional currency and cannot be removed
              </span>
            )}
          </p>
        </div>

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
            disabled={saving || allowedCurrencies.length === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors flex items-center gap-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>

      {/* Expense Categories (Future Enhancement) */}
      <div className="bg-gray-800/50 rounded-lg border border-gray-700 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Tag className="w-5 h-5 text-gray-400" />
          <div>
            <h3 className="text-lg font-semibold text-white">Expense Categories</h3>
            <p className="text-sm text-gray-400">Configure business expense categories and approval workflows</p>
          </div>
        </div>
        <div className="text-center py-6">
          <AlertCircle className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
          <p className="text-gray-400 text-sm">
            Category management will be available in a future update
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
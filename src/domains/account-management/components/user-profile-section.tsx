'use client'

/**
 * User Profile Section
 *
 * Consolidated settings component with:
 * - Preferred Display Currency
 * - Timezone
 * - Email Notification Preferences (connected to Convex via API)
 */

import { useState, useEffect, useCallback } from 'react'
import { DollarSign, Clock, Bell, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { useBusinessContext } from '@/contexts/business-context'
import { SupportedCurrency, CURRENCY_SYMBOLS } from '@/domains/accounting-entries/types'
import { useToast } from '@/components/ui/toast'
import { NotificationPreferencesForm } from '@/domains/notifications/components/notification-preferences-form'

interface UserProfileSectionProps {
  className?: string
}

// Timezone options for Southeast Asia focus
const TIMEZONE_OPTIONS = [
  { value: 'Asia/Singapore', label: 'Singapore (GMT+8)' },
  { value: 'Asia/Bangkok', label: 'Bangkok (GMT+7)' },
  { value: 'Asia/Jakarta', label: 'Jakarta (GMT+7)' },
  { value: 'Asia/Kuala_Lumpur', label: 'Kuala Lumpur (GMT+8)' },
  { value: 'Asia/Manila', label: 'Manila (GMT+8)' },
  { value: 'Asia/Ho_Chi_Minh', label: 'Ho Chi Minh (GMT+7)' },
  { value: 'Asia/Hong_Kong', label: 'Hong Kong (GMT+8)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (GMT+9)' },
]

interface EmailPreferences {
  marketingEnabled: boolean
  onboardingTipsEnabled: boolean
  productUpdatesEnabled: boolean
  globalUnsubscribe: boolean
}

export default function UserProfileSection({ className }: UserProfileSectionProps) {
  const { profile, isLoadingProfile } = useBusinessContext()
  const { addToast } = useToast()

  // Currency state
  const [preferredCurrency, setPreferredCurrency] = useState<SupportedCurrency>('USD')
  const [isCurrencySaving, setIsCurrencySaving] = useState(false)
  const [allowedCurrencies, setAllowedCurrencies] = useState<SupportedCurrency[]>([])

  // Timezone state
  const [timezone, setTimezone] = useState<string>('Asia/Singapore')
  const [isTimezoneSaving, setIsTimezoneSaving] = useState(false)

  // Email preferences state
  const [emailPreferences, setEmailPreferences] = useState<EmailPreferences>({
    marketingEnabled: true,
    onboardingTipsEnabled: true,
    productUpdatesEnabled: true,
    globalUnsubscribe: false,
  })
  const [isEmailPrefLoading, setIsEmailPrefLoading] = useState(true)
  const [isEmailPrefSaving, setIsEmailPrefSaving] = useState(false)


  // Load allowed currencies
  useEffect(() => {
    setAllowedCurrencies(['USD', 'SGD', 'MYR', 'THB', 'IDR', 'VND', 'PHP', 'CNY', 'EUR'])
  }, [profile])

  // Load user preferences (currency and timezone)
  useEffect(() => {
    const loadUserPreferences = async () => {
      try {
        const response = await fetch('/api/v1/users/profile')
        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data) {
            const currency = result.data.preferred_currency || 'USD'
            const tz = result.data.timezone || 'Asia/Singapore'
            setPreferredCurrency(currency)
            setTimezone(tz)
          }
        }
      } catch (error) {
        console.error('Error loading user preferences:', error)
      }
    }

    loadUserPreferences()
  }, [profile])

  // Load email preferences from Convex via API
  useEffect(() => {
    const loadEmailPreferences = async () => {
      try {
        setIsEmailPrefLoading(true)
        const response = await fetch('/api/v1/email-preferences')
        if (response.ok) {
          const result = await response.json()
          if (result.success && result.data) {
            const prefs = {
              marketingEnabled: result.data.marketingEnabled ?? true,
              onboardingTipsEnabled: result.data.onboardingTipsEnabled ?? true,
              productUpdatesEnabled: result.data.productUpdatesEnabled ?? true,
              globalUnsubscribe: result.data.globalUnsubscribe ?? false,
            }
            setEmailPreferences(prefs)
          }
        }
      } catch (error) {
        console.error('Error loading email preferences:', error)
      } finally {
        setIsEmailPrefLoading(false)
      }
    }

    loadEmailPreferences()
  }, [])

  // Save currency preference
  const saveCurrencyPreference = async (currency: SupportedCurrency) => {
    try {
      setIsCurrencySaving(true)
      const response = await fetch('/api/v1/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferred_currency: currency })
      })

      if (!response.ok) {
        throw new Error('Failed to save currency preference')
      }

      addToast({
        type: 'success',
        title: 'Currency updated',
        description: `Display currency changed to ${currency}`
      })
    } catch (error) {
      console.error('Failed to save currency preference:', error)
      addToast({
        type: 'error',
        title: 'Failed to update currency',
        description: 'Please try again.'
      })
    } finally {
      setIsCurrencySaving(false)
    }
  }

  // Save timezone preference
  const saveTimezonePreference = async (tz: string) => {
    try {
      setIsTimezoneSaving(true)
      const response = await fetch('/api/v1/users/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: tz })
      })

      if (!response.ok) {
        throw new Error('Failed to save timezone preference')
      }

      addToast({
        type: 'success',
        title: 'Timezone updated',
        description: `Timezone changed to ${tz}`
      })
    } catch (error) {
      console.error('Failed to save timezone preference:', error)
      addToast({
        type: 'error',
        title: 'Failed to update timezone',
        description: 'Please try again.'
      })
    } finally {
      setIsTimezoneSaving(false)
    }
  }

  // Save email preferences to Convex via API
  const saveEmailPreference = useCallback(async (
    field: keyof EmailPreferences,
    value: boolean
  ) => {
    try {
      setIsEmailPrefSaving(true)
      const response = await fetch('/api/v1/email-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      })

      if (!response.ok) {
        throw new Error('Failed to save email preference')
      }

      addToast({
        type: 'success',
        title: 'Notification settings updated',
        description: 'Your email preferences have been saved.'
      })
    } catch (error) {
      console.error('Failed to save email preference:', error)
      // Revert the optimistic update
      setEmailPreferences(prev => ({ ...prev, [field]: !value }))
      addToast({
        type: 'error',
        title: 'Failed to update',
        description: 'Please try again.'
      })
    } finally {
      setIsEmailPrefSaving(false)
    }
  }, [addToast])

  // Handle currency change
  const handleCurrencyChange = async (newCurrency: SupportedCurrency) => {
    if (newCurrency === preferredCurrency) return
    setPreferredCurrency(newCurrency)
    await saveCurrencyPreference(newCurrency)
  }

  // Handle timezone change
  const handleTimezoneChange = async (newTimezone: string) => {
    if (newTimezone === timezone) return
    setTimezone(newTimezone)
    await saveTimezonePreference(newTimezone)
  }

  // Handle email preference toggle
  const handleEmailPrefToggle = async (field: keyof EmailPreferences) => {
    const newValue = !emailPreferences[field]
    // Optimistic update
    setEmailPreferences(prev => ({ ...prev, [field]: newValue }))
    await saveEmailPreference(field, newValue)
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
    <div className={`bg-card rounded-lg border border-border p-6 ${className}`}>
      {/* Section Header */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-foreground">Preferences</h3>
        <p className="text-sm text-muted-foreground">Customize your display and notification settings</p>
      </div>

      <div className="space-y-6">
        {/* Currency Preferences */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-muted-foreground" />
            <label className="text-sm font-medium text-foreground">
              Preferred Display Currency
            </label>
          </div>
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
          <p className="text-xs text-muted-foreground">
            All amounts will be converted and displayed in this currency
          </p>
          {isCurrencySaving && (
            <p className="text-xs text-primary flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving...
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Timezone */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <label className="text-sm font-medium text-foreground">
              Timezone
            </label>
          </div>
          <select
            value={timezone}
            onChange={(e) => handleTimezoneChange(e.target.value)}
            disabled={isTimezoneSaving}
            className="w-full bg-background border border-input rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            {TIMEZONE_OPTIONS.map(tz => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            Used for your dashboard and notification scheduling
          </p>
          {isTimezoneSaving && (
            <p className="text-xs text-primary flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving...
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Email Notification Preferences */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-muted-foreground" />
            <label className="text-sm font-medium text-foreground">
              Email Notifications
            </label>
          </div>

          {isEmailPrefLoading ? (
            <div className="flex items-center gap-2 py-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading preferences...</span>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Marketing Emails */}
              <ToggleRow
                label="Marketing & Promotions"
                description="Receive updates about new features and special offers"
                checked={emailPreferences.marketingEnabled && !emailPreferences.globalUnsubscribe}
                onChange={() => handleEmailPrefToggle('marketingEnabled')}
                disabled={isEmailPrefSaving || emailPreferences.globalUnsubscribe}
              />

              {/* Onboarding Tips */}
              <ToggleRow
                label="Onboarding Tips"
                description="Get helpful tips to make the most of FinanSEAL"
                checked={emailPreferences.onboardingTipsEnabled && !emailPreferences.globalUnsubscribe}
                onChange={() => handleEmailPrefToggle('onboardingTipsEnabled')}
                disabled={isEmailPrefSaving || emailPreferences.globalUnsubscribe}
              />

              {/* Product Updates */}
              <ToggleRow
                label="Product Updates"
                description="Stay informed about product improvements and changes"
                checked={emailPreferences.productUpdatesEnabled && !emailPreferences.globalUnsubscribe}
                onChange={() => handleEmailPrefToggle('productUpdatesEnabled')}
                disabled={isEmailPrefSaving || emailPreferences.globalUnsubscribe}
              />

              {/* Global Unsubscribe */}
              <div className="pt-2 border-t border-border">
                <ToggleRow
                  label="Unsubscribe from all marketing"
                  description="Turn off all non-essential emails (you'll still receive important account notifications)"
                  checked={emailPreferences.globalUnsubscribe}
                  onChange={() => handleEmailPrefToggle('globalUnsubscribe')}
                  disabled={isEmailPrefSaving}
                  danger
                />
              </div>

              {/* Info note */}
              <div className="mt-3 p-3 bg-muted/50 border border-border rounded-md">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-muted-foreground">
                    Transactional emails (password resets, security alerts, and billing notifications) cannot be disabled.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Notification Preferences (per-category in-app + email toggles) */}
        <NotificationPreferencesForm />
      </div>
    </div>
  )
}

// Toggle Row Component
interface ToggleRowProps {
  label: string
  description: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
  danger?: boolean
}

function ToggleRow({ label, description, checked, onChange, disabled, danger }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <p className={`text-sm font-medium ${danger ? 'text-destructive' : 'text-foreground'}`}>
          {label}
        </p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        disabled={disabled}
        className={`
          relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
          transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
          disabled:cursor-not-allowed disabled:opacity-50
          ${checked
            ? danger
              ? 'bg-destructive'
              : 'bg-primary'
            : 'bg-muted'
          }
        `}
      >
        <span
          className={`
            pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
            transition duration-200 ease-in-out
            ${checked ? 'translate-x-5' : 'translate-x-0'}
          `}
        />
      </button>
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

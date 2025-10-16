'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload, X, Camera, Building2, DollarSign } from 'lucide-react'
import Image from 'next/image'
import { useToast } from '@/components/ui/toast'
import { useBusinessProfile } from '@/contexts/business-context'
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

interface BusinessProfile {
  id: string
  name: string
  logo_url?: string
  logo_fallback_color?: string
}

export default function BusinessProfileSettings() {
  const { profile, isLoading, updateProfile } = useBusinessProfile()
  const [isUpdating, setIsUpdating] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [businessName, setBusinessName] = useState('')
  const [homeCurrency, setHomeCurrency] = useState<SupportedCurrency>('USD')
  const [isCurrencyLoading, setIsCurrencyLoading] = useState(false)
  const [isCurrencySaving, setIsCurrencySaving] = useState(false)
  const [lastCurrencySaved, setLastCurrencySaved] = useState<Date | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { addToast } = useToast()

  useEffect(() => {
    if (profile) {
      setBusinessName(profile.name || '')
    }
  }, [profile])

  // Load user's currency preference on mount
  useEffect(() => {
    loadCurrencyPreference()
  }, [])


  const updateBusinessName = async () => {
    if (!profile || !businessName.trim()) return

    try {
      setIsUpdating(true)

      // Get CSRF token first
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
          'X-CSRF-Token': csrfData.data.token
        },
        body: JSON.stringify({
          name: businessName.trim()
        })
      })

      const result = await response.json()

      if (result.success) {
        updateProfile(result.data)
        addToast({
          type: 'success',
          title: 'Business name updated',
          description: 'Your business name has been updated successfully'
        })
      } else {
        addToast({
          type: 'error',
          title: 'Failed to update name',
          description: result.error || 'Unable to update business name'
        })
      }
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Error updating name',
        description: 'Unable to connect to server'
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const loadCurrencyPreference = async () => {
    try {
      setIsCurrencyLoading(true)

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
      setIsCurrencyLoading(false)
    }
  }

  const saveCurrencyPreference = async (currency: SupportedCurrency) => {
    try {
      setIsCurrencySaving(true)

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

      setLastCurrencySaved(new Date())
      addToast({
        type: 'success',
        title: 'Currency updated',
        description: `Home currency changed to ${currency}`
      })

    } catch (error) {
      console.error('Failed to save currency preference:', error)
      addToast({
        type: 'error',
        title: 'Failed to update currency',
        description: 'Unable to save currency preference'
      })
    } finally {
      setIsCurrencySaving(false)
    }
  }

  const handleCurrencyChange = async (newCurrency: SupportedCurrency) => {
    if (newCurrency === homeCurrency) return

    setHomeCurrency(newCurrency)
    await saveCurrencyPreference(newCurrency)
  }

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !profile) return

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      addToast({
        type: 'error',
        title: 'Invalid file type',
        description: 'Please upload a JPG, PNG, or WebP image.'
      })
      return
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      addToast({
        type: 'error',
        title: 'File too large',
        description: 'Please upload an image under 5MB.'
      })
      return
    }

    try {
      setIsUploading(true)

      const formData = new FormData()
      formData.append('logo', file)

      const response = await fetch('/api/v1/account-management/businesses/profile/upload-logo', {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (result.success) {
        const updatedProfile = { ...profile, logo_url: result.data.logo_url }
        updateProfile(updatedProfile)
        addToast({
          type: 'success',
          title: 'Logo uploaded',
          description: 'Your business logo has been updated successfully'
        })
      } else {
        addToast({
          type: 'error',
          title: 'Upload failed',
          description: result.error || 'Failed to upload logo'
        })
      }
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Error uploading logo',
        description: 'Unable to connect to server'
      })
    } finally {
      setIsUploading(false)
      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const removeLogo = async () => {
    if (!profile) return

    try {
      setIsUploading(true)

      const response = await fetch('/api/v1/account-management/businesses/profile/upload-logo', {
        method: 'DELETE'
      })

      const result = await response.json()

      if (result.success) {
        const updatedProfile = { ...profile, logo_url: undefined }
        updateProfile(updatedProfile)
        addToast({
          type: 'success',
          title: 'Logo removed',
          description: 'Your business logo has been removed successfully'
        })
      } else {
        addToast({
          type: 'error',
          title: 'Remove failed',
          description: result.error || 'Failed to remove logo'
        })
      }
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Error removing logo',
        description: 'Unable to connect to server'
      })
    } finally {
      setIsUploading(false)
    }
  }

  const getBusinessInitial = () => {
    return profile?.name?.[0]?.toUpperCase() || 'B'
  }

  if (isLoading) {
    return (
      <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-700 rounded w-48 mb-4"></div>
          <div className="space-y-4">
            <div className="h-20 bg-gray-700 rounded"></div>
            <div className="h-10 bg-gray-700 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-gray-800 rounded-lg border border-gray-700 p-6">
      <div className="flex items-center space-x-3 mb-6">
        <Building2 className="w-6 h-6 text-blue-400" />
        <h2 className="text-xl font-semibold text-white">Business Profile</h2>
      </div>

      <div className="space-y-6">
        {/* Business Logo */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-3">
            Business Logo
          </label>

          <div className="flex items-center space-x-4">
            {/* Logo Display */}
            <div className="relative">
              {profile?.logo_url ? (
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-gray-700 border-2 border-gray-600">
                  <Image
                    src={profile.logo_url}
                    alt="Business Logo"
                    width={80}
                    height={80}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div
                  className="w-20 h-20 rounded-lg flex items-center justify-center text-white font-bold text-2xl border-2 border-gray-600"
                  style={{ backgroundColor: profile?.logo_fallback_color || '#3b82f6' }}
                >
                  {getBusinessInitial()}
                </div>
              )}

              {/* Remove Logo Button */}
              {profile?.logo_url && (
                <button
                  onClick={removeLogo}
                  disabled={isUploading}
                  className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center text-white transition-colors disabled:opacity-50"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Upload Button */}
            <div className="flex flex-col space-y-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 mr-2" />
                    {profile?.logo_url ? 'Change Logo' : 'Upload Logo'}
                  </>
                )}
              </button>

              <p className="text-xs text-gray-400">
                JPG, PNG or WebP. Max 5MB.
              </p>
            </div>

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              onChange={handleLogoUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* Business Name */}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Business Name
          </label>
          <div className="flex space-x-3">
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Enter your business name"
              className="flex-1 bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={updateBusinessName}
              disabled={isUpdating || businessName.trim() === profile?.name || !businessName.trim()}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
            >
              {isUpdating ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                'Update'
              )}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            This name will appear in the sidebar and throughout the application.
          </p>
        </div>

        {/* Currency Preferences */}
        <div>
          <div className="flex items-center space-x-3 mb-4">
            <DollarSign className="w-5 h-5 text-green-400" />
            <h3 className="text-lg font-medium text-white">Currency Preferences</h3>
            {lastCurrencySaved && (
              <span className="text-xs text-green-400">
                Saved {lastCurrencySaved.toLocaleTimeString()}
              </span>
            )}
          </div>

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
              disabled={isCurrencyLoading || isCurrencySaving}
              className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {SUPPORTED_CURRENCIES.map(currency => (
                <option key={currency.code} value={currency.code}>
                  {currency.name}
                </option>
              ))}
            </select>

            {isCurrencySaving && (
              <p className="text-xs text-blue-400 mt-2 flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
                Saving preferences...
              </p>
            )}

            <div className="bg-blue-900/20 border border-blue-700 rounded-lg p-4 mt-4">
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
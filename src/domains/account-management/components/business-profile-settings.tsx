'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Camera, Building2, DollarSign } from 'lucide-react'
import Image from 'next/image'
import { useToast } from '@/components/ui/toast'
import { useBusinessProfile } from '@/contexts/business-context'
import { SupportedCurrency } from '@/domains/accounting-entries/types'
import { useHomeCurrency, updateHomeCurrency } from '@/domains/users/hooks/use-home-currency'

export default function BusinessProfileSettings() {
  const { profile, isLoading, updateProfile } = useBusinessProfile()
  const [isUpdating, setIsUpdating] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [businessName, setBusinessName] = useState('')
  const [isCurrencySaving, setIsCurrencySaving] = useState(false)
  const [lastCurrencySaved, setLastCurrencySaved] = useState<Date | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { addToast } = useToast()

  const { currency: homeCurrency, isLoading: isCurrencyLoading, supportedCurrencies } = useHomeCurrency()

  useEffect(() => {
    if (profile) {
      setBusinessName(profile.name || '')
    }
  }, [profile])


  const updateBusinessName = async () => {
    if (!profile || !businessName.trim()) return

    try {
      setIsUpdating(true)

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
    } catch {
      addToast({
        type: 'error',
        title: 'Error updating name',
        description: 'Unable to connect to server'
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleCurrencyChange = async (newCurrency: SupportedCurrency) => {
    if (newCurrency === homeCurrency) return

    try {
      setIsCurrencySaving(true)

      const success = await updateHomeCurrency(newCurrency)

      if (success) {
        setLastCurrencySaved(new Date())
        addToast({
          type: 'success',
          title: 'Currency updated',
          description: `Home currency changed to ${newCurrency}`
        })
      } else {
        throw new Error('Failed to update currency')
      }
    } catch (error) {
      console.error('[Business Settings] Failed to update currency:', error)
      addToast({
        type: 'error',
        title: 'Failed to update currency',
        description: 'Unable to save currency preference'
      })
    } finally {
      setIsCurrencySaving(false)
    }
  }

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !profile) return

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      addToast({
        type: 'error',
        title: 'Invalid file type',
        description: 'Please upload a JPG, PNG, or WebP image.'
      })
      return
    }

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
    } catch {
      addToast({
        type: 'error',
        title: 'Error uploading logo',
        description: 'Unable to connect to server'
      })
    } finally {
      setIsUploading(false)
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
    } catch {
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
      <div className="bg-card rounded-lg border border-border p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-muted rounded w-48 mb-4"></div>
          <div className="space-y-4">
            <div className="h-20 bg-muted rounded"></div>
            <div className="h-10 bg-muted rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <div className="flex items-center space-x-3 mb-6">
        <Building2 className="w-6 h-6 text-primary" />
        <h2 className="text-xl font-semibold text-foreground">Business Profile</h2>
      </div>

      <div className="space-y-6">
        {/* Business Logo */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-3">
            Business Logo
          </label>

          <div className="flex items-center space-x-4">
            {/* Logo Display */}
            <div className="relative">
              {profile?.logo_url ? (
                <div className="w-20 h-20 rounded-lg overflow-hidden bg-muted border-2 border-border">
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
                  className="w-20 h-20 rounded-lg flex items-center justify-center text-primary-foreground font-bold text-2xl border-2 border-border"
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
                  className="absolute -top-2 -right-2 w-6 h-6 bg-destructive hover:bg-destructive/90 rounded-full flex items-center justify-center text-destructive-foreground transition-colors disabled:opacity-50"
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
                className="inline-flex items-center px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 mr-2" />
                    {profile?.logo_url ? 'Change Logo' : 'Upload Logo'}
                  </>
                )}
              </button>

              <p className="text-xs text-muted-foreground">
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
          <label className="block text-sm font-medium text-foreground mb-2">
            Business Name
          </label>
          <div className="flex space-x-3">
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Enter your business name"
              className="flex-1 bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
            <button
              onClick={updateBusinessName}
              disabled={isUpdating || businessName.trim() === profile?.name || !businessName.trim()}
              className="px-4 py-2 bg-action-view hover:bg-action-view/90 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed text-action-view-foreground rounded-md font-medium transition-colors"
            >
              {isUpdating ? (
                <div className="w-4 h-4 border-2 border-action-view-foreground border-t-transparent rounded-full animate-spin"></div>
              ) : (
                'Update'
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            This name will appear in the sidebar and throughout the application.
          </p>
        </div>

        {/* Currency Preferences */}
        <div>
          <div className="flex items-center space-x-3 mb-4">
            <DollarSign className="w-5 h-5 text-action-view" />
            <h3 className="text-lg font-medium text-foreground">Currency Preferences</h3>
            {lastCurrencySaved && (
              <span className="text-xs text-action-view">
                Saved {lastCurrencySaved.toLocaleTimeString()}
              </span>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Home Currency
            </label>
            <p className="text-xs text-muted-foreground mb-3">
              This currency will be used for dashboard summaries and conversions throughout the app.
            </p>
            <select
              value={homeCurrency}
              onChange={(e) => handleCurrencyChange(e.target.value as SupportedCurrency)}
              disabled={isCurrencyLoading || isCurrencySaving}
              className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              {supportedCurrencies.map(currency => (
                <option key={currency.code} value={currency.code}>
                  {currency.name}
                </option>
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
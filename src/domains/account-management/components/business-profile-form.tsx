'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { X, Camera, Building2, CheckCircle2, Mail } from 'lucide-react'
import Image from 'next/image'
import { useToast } from '@/components/ui/toast'
import { useBusinessProfile } from '@/contexts/business-context'
import { useRegisterUnsavedChanges } from '@/components/providers/unsaved-changes-provider'
import { MALAYSIAN_STATE_CODES } from '@/lib/data/state-codes'
import { COUNTRY_CODES } from '@/lib/data/country-codes'

export default function BusinessProfileForm() {
  const { profile, isLoading, updateProfile } = useBusinessProfile()
  const searchParams = useSearchParams()
  const { addToast } = useToast()
  const [isUpdating, setIsUpdating] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Profile field state
  const [businessName, setBusinessName] = useState('')
  const [businessEmail, setBusinessEmail] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [addressLine3, setAddressLine3] = useState('')
  const [city, setCity] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [countryCode, setCountryCode] = useState('MY')

  // SES email verification state
  const [sesVerifyStatus, setSesVerifyStatus] = useState<'loading' | 'unverified' | 'pending' | 'verified'>('loading')
  const [sesVerifyEmail, setSesVerifyEmail] = useState<string | null>(null)
  const [isSendingVerification, setIsSendingVerification] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Track initial values for dirty state
  const [initialValues, setInitialValues] = useState({
    businessName: '',
    businessEmail: '',
    businessPhone: '',
    addressLine1: '',
    addressLine2: '',
    addressLine3: '',
    city: '',
    stateCode: '',
    postalCode: '',
    countryCode: 'MY',
  })

  // Initialize from profile
  useEffect(() => {
    if (profile) {
      const initial = {
        businessName: profile.name || '',
        businessEmail: profile.contact_email || '',
        businessPhone: profile.contact_phone || '',
        addressLine1: profile.address_line1 || '',
        addressLine2: profile.address_line2 || '',
        addressLine3: profile.address_line3 || '',
        city: profile.city || '',
        stateCode: profile.state_code || '',
        postalCode: profile.postal_code || '',
        countryCode: profile.country_code || 'MY',
      }
      setInitialValues(initial)
      setBusinessName(initial.businessName)
      setBusinessEmail(initial.businessEmail)
      setBusinessPhone(initial.businessPhone)
      setAddressLine1(initial.addressLine1)
      setAddressLine2(initial.addressLine2)
      setAddressLine3(initial.addressLine3)
      setCity(initial.city)
      setStateCode(initial.stateCode)
      setPostalCode(initial.postalCode)
      setCountryCode(initial.countryCode)
    }
  }, [profile])

  // Dirty state
  const isDirty = useMemo(() => {
    return businessName !== initialValues.businessName ||
      businessEmail !== initialValues.businessEmail ||
      businessPhone !== initialValues.businessPhone ||
      addressLine1 !== initialValues.addressLine1 ||
      addressLine2 !== initialValues.addressLine2 ||
      addressLine3 !== initialValues.addressLine3 ||
      city !== initialValues.city ||
      stateCode !== initialValues.stateCode ||
      postalCode !== initialValues.postalCode ||
      countryCode !== initialValues.countryCode
  }, [businessName, businessEmail, businessPhone, addressLine1, addressLine2, addressLine3,
      city, stateCode, postalCode, countryCode, initialValues])

  useRegisterUnsavedChanges('business-profile-form', isDirty)

  // SES verification
  const checkSesVerification = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/users/verify-email')
      const data = await res.json()
      if (data.success) {
        const status = data.data.status as 'unverified' | 'pending' | 'verified'
        setSesVerifyStatus(status)
        setSesVerifyEmail(data.data.email || null)
        if (status === 'verified' && pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
      } else {
        setSesVerifyStatus('unverified')
      }
    } catch {
      setSesVerifyStatus('unverified')
    }
  }, [])

  useEffect(() => {
    checkSesVerification()
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [checkSesVerification])

  // Handle redirect from SES verification email link
  useEffect(() => {
    const emailVerified = searchParams.get('email_verified')
    if (emailVerified === 'success') {
      setSesVerifyStatus('verified')
      checkSesVerification()
      addToast({ type: 'success', title: 'Email verified', description: 'Your email has been verified for e-invoice forwarding.' })
      window.history.replaceState({}, '', window.location.pathname)
    } else if (emailVerified === 'failed') {
      addToast({ type: 'error', title: 'Verification failed', description: 'Email verification failed. Please try again.' })
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [searchParams, addToast, checkSesVerification])

  const handleSendVerification = async () => {
    setIsSendingVerification(true)
    try {
      const res = await fetch('/api/v1/users/verify-email', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        setSesVerifyStatus('pending')
        addToast({ type: 'success', title: 'Verification email sent', description: 'Check your inbox and click the verification link.' })
        pollingRef.current = setInterval(checkSesVerification, 5000)
      } else {
        addToast({ type: 'error', title: 'Failed to send verification', description: data.error })
      }
    } catch {
      addToast({ type: 'error', title: 'Error', description: 'Unable to send verification email' })
    } finally {
      setIsSendingVerification(false)
    }
  }

  const updateBusinessProfile = async () => {
    if (!profile || !businessName.trim()) return

    try {
      setIsUpdating(true)

      const csrfResponse = await fetch('/api/v1/utils/security/csrf-token')
      if (!csrfResponse.ok) throw new Error('Failed to get CSRF token')
      const csrfData = await csrfResponse.json()
      if (!csrfData.success) throw new Error(csrfData.error || 'Failed to get CSRF token')

      const response = await fetch('/api/v1/account-management/businesses/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfData.data.csrfToken
        },
        body: JSON.stringify({
          name: businessName.trim(),
          contact_email: businessEmail.trim(),
          contact_phone: businessPhone.trim(),
          address_line1: addressLine1.trim(),
          address_line2: addressLine2.trim(),
          address_line3: addressLine3.trim(),
          city: city.trim(),
          state_code: stateCode,
          postal_code: postalCode.trim(),
          country_code: countryCode,
        })
      })

      const result = await response.json()

      if (result.success) {
        updateProfile(result.data)
        setInitialValues({
          businessName: businessName.trim(),
          businessEmail: businessEmail.trim(),
          businessPhone: businessPhone.trim(),
          addressLine1: addressLine1.trim(),
          addressLine2: addressLine2.trim(),
          addressLine3: addressLine3.trim(),
          city: city.trim(),
          stateCode,
          postalCode: postalCode.trim(),
          countryCode,
        })
        addToast({
          type: 'success',
          title: 'Business profile updated',
          description: 'Your business details have been saved'
        })
      } else {
        addToast({
          type: 'error',
          title: 'Failed to update details',
          description: result.error || 'Unable to update business details'
        })
      }
    } catch {
      addToast({
        type: 'error',
        title: 'Error updating details',
        description: 'Unable to connect to server'
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !profile) return

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      addToast({ type: 'error', title: 'Invalid file type', description: 'Please upload a JPG, PNG, or WebP image.' })
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      addToast({ type: 'error', title: 'File too large', description: 'Please upload an image under 5MB.' })
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
        addToast({ type: 'success', title: 'Logo uploaded', description: 'Your business logo has been updated successfully' })
      } else {
        addToast({ type: 'error', title: 'Upload failed', description: result.error || 'Failed to upload logo' })
      }
    } catch {
      addToast({ type: 'error', title: 'Error uploading logo', description: 'Unable to connect to server' })
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
      const response = await fetch('/api/v1/account-management/businesses/profile/upload-logo', { method: 'DELETE' })
      const result = await response.json()

      if (result.success) {
        const updatedProfile = { ...profile, logo_url: undefined }
        updateProfile(updatedProfile)
        addToast({ type: 'success', title: 'Logo removed', description: 'Your business logo has been removed successfully' })
      } else {
        addToast({ type: 'error', title: 'Remove failed', description: result.error || 'Failed to remove logo' })
      }
    } catch {
      addToast({ type: 'error', title: 'Error removing logo', description: 'Unable to connect to server' })
    } finally {
      setIsUploading(false)
    }
  }

  const getBusinessInitial = () => {
    return profile?.name?.[0]?.toUpperCase() || 'B'
  }

  if (isLoading) {
    return (
      <div className="animate-pulse">
        <div className="h-6 bg-muted rounded w-48 mb-4"></div>
        <div className="space-y-4">
          <div className="h-20 bg-muted rounded"></div>
          <div className="h-10 bg-muted rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div>
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
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              onChange={handleLogoUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* Business Details */}
        <div>
          <p className="text-xs text-muted-foreground mb-4">
            These details will appear on your invoices and customer-facing documents.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Business Name
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Enter your business name"
                className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This name will appear in the sidebar and throughout the application.
              </p>
            </div>

            {/* Structured Address */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-foreground">
                Business Address
              </label>
              <input type="text" value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="Address Line 1 (Street address)"
                className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent" />
              <input type="text" value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)}
                placeholder="Address Line 2 (Unit, building, floor)"
                className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent" />
              <input type="text" value={addressLine3} onChange={(e) => setAddressLine3(e.target.value)}
                placeholder="Address Line 3 (Optional)"
                className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input type="text" value={city} onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent" />
                <input type="text" value={postalCode} onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="Postal Code"
                  className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select value={stateCode} onChange={(e) => setStateCode(e.target.value)}
                  className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  <option value="">Select state...</option>
                  {MALAYSIAN_STATE_CODES.map((s) => (
                    <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                  ))}
                </select>
                <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)}
                  className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Company Contact Email
                </label>
                <input type="email" value={businessEmail} onChange={(e) => setBusinessEmail(e.target.value)}
                  placeholder="billing@company.com"
                  className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent" />
                <p className="text-xs text-muted-foreground mt-1">
                  Appears on invoices and customer-facing documents.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Phone Number
                </label>
                <input type="tel" value={businessPhone} onChange={(e) => setBusinessPhone(e.target.value)}
                  placeholder="+60 12-345 6789"
                  className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent" />
              </div>
            </div>

            {/* Email Forwarding */}
            <div className="bg-muted/30 border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-foreground">Email Forwarding</span>
                {sesVerifyStatus === 'verified' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30">
                    <CheckCircle2 className="w-3 h-3" />
                    Verified
                  </span>
                )}
                {sesVerifyStatus === 'pending' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-muted text-muted-foreground border border-border">
                    Check inbox
                  </span>
                )}
                {sesVerifyStatus === 'unverified' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30">
                    Unverified
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Verify your email to enable reliable email delivery.
              </p>
              <div className="flex items-center gap-3">
                {sesVerifyEmail && (
                  <span className="text-sm text-foreground font-mono bg-input border border-input rounded px-3 py-1.5">
                    {sesVerifyEmail}
                  </span>
                )}
                {sesVerifyStatus !== 'verified' && sesVerifyStatus !== 'loading' && (
                  <button
                    type="button"
                    onClick={handleSendVerification}
                    disabled={isSendingVerification || sesVerifyStatus === 'pending'}
                    className="px-3 py-1.5 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {isSendingVerification ? (
                      <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    ) : sesVerifyStatus === 'pending' ? (
                      'Verification Sent'
                    ) : (
                      'Verify Email'
                    )}
                  </button>
                )}
              </div>
              {sesVerifyStatus === 'pending' && (
                <p className="text-xs text-primary mt-2">
                  Check your inbox for a verification email from AWS. Click the link to verify.
                </p>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={updateBusinessProfile}
                disabled={isUpdating}
                className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed text-primary-foreground rounded-md font-medium transition-colors"
              >
                {isUpdating ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  'Save Details'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

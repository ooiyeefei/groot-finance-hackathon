'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { X, Camera, Building2, DollarSign, ChevronDown, ChevronRight, FileText, CheckCircle2, Mail } from 'lucide-react'
import { ComingSoonBadge } from '@/components/ui/coming-soon-badge'
import Image from 'next/image'
import { useToast } from '@/components/ui/toast'
import { useBusinessProfile } from '@/contexts/business-context'
import { SupportedCurrency } from '@/lib/types/currency'
import { SUPPORTED_CURRENCIES } from '@/domains/users/hooks/use-home-currency'
import { useRegisterUnsavedChanges } from '@/components/providers/unsaved-changes-provider'
import { MALAYSIAN_STATE_CODES } from '@/lib/data/state-codes'
import { COUNTRY_CODES } from '@/lib/data/country-codes'
import { MSIC_CODES } from '@/lib/data/msic-codes'

interface BusinessProfileSettingsProps {
  section?: 'profile' | 'einvoice' | 'currency'
}

export default function BusinessProfileSettings({ section }: BusinessProfileSettingsProps) {
  // When section prop is provided, only render that section
  const showAll = !section
  const showProfile = showAll || section === 'profile'
  const showEInvoice = showAll || section === 'einvoice'
  const showCurrency = showAll || section === 'currency'
  const { profile, isLoading, updateProfile } = useBusinessProfile()
  const searchParams = useSearchParams()
  const [isUpdating, setIsUpdating] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [businessName, setBusinessName] = useState('')
  const [businessEmail, setBusinessEmail] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [isCurrencySaving, setIsCurrencySaving] = useState(false)
  const [lastCurrencySaved, setLastCurrencySaved] = useState<Date | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { addToast } = useToast()

  // Structured address state
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [addressLine3, setAddressLine3] = useState('')
  const [city, setCity] = useState('')
  const [stateCode, setStateCode] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [countryCode, setCountryCode] = useState('MY')

  // e-Invoice settings state
  const [lhdnTin, setLhdnTin] = useState('')
  const [businessRegistrationNumber, setBusinessRegistrationNumber] = useState('')
  const [msicCode, setMsicCode] = useState('')
  const [msicDescription, setMsicDescription] = useState('')
  const [sstRegistrationNumber, setSstRegistrationNumber] = useState('')
  const [lhdnClientId, setLhdnClientId] = useState('')
  const [lhdnClientSecret, setLhdnClientSecret] = useState('')
  const [peppolParticipantId, setPeppolParticipantId] = useState('')

  // MSIC combobox state
  const [msicSearch, setMsicSearch] = useState('')
  const [msicDropdownOpen, setMsicDropdownOpen] = useState(false)
  const msicDropdownRef = useRef<HTMLDivElement>(null)

  // LHDN self-bill auto-trigger
  const [autoSelfBillExemptVendors, setAutoSelfBillExemptVendors] = useState(false)

  // SES email verification state
  const [sesVerifyStatus, setSesVerifyStatus] = useState<'loading' | 'unverified' | 'pending' | 'verified'>('loading')
  const [isSendingVerification, setIsSendingVerification] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Collapsible section state
  const [eInvoiceSectionOpen, setEInvoiceSectionOpen] = useState(false)

  // Track initial values for dirty state detection
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
    lhdnTin: '',
    businessRegistrationNumber: '',
    msicCode: '',
    msicDescription: '',
    sstRegistrationNumber: '',
    lhdnClientId: '',
    lhdnClientSecret: '',
    peppolParticipantId: '',
    homeCurrency: 'MYR' as SupportedCurrency,
  })

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
        lhdnTin: profile.lhdn_tin || '',
        businessRegistrationNumber: profile.business_registration_number || '',
        msicCode: profile.msic_code || '',
        msicDescription: profile.msic_description || '',
        sstRegistrationNumber: profile.sst_registration_number || '',
        lhdnClientId: profile.lhdn_client_id || '',
        lhdnClientSecret: '', // Secret stored in AWS SSM, not returned from Convex
        peppolParticipantId: profile.peppol_participant_id || '',
        homeCurrency: (profile.home_currency || 'MYR') as SupportedCurrency,
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
      setLhdnTin(initial.lhdnTin)
      setBusinessRegistrationNumber(initial.businessRegistrationNumber)
      setMsicCode(initial.msicCode)
      setMsicDescription(initial.msicDescription)
      setSstRegistrationNumber(initial.sstRegistrationNumber)
      setLhdnClientId(initial.lhdnClientId)
      setLhdnClientSecret(initial.lhdnClientSecret)
      setPeppolParticipantId(initial.peppolParticipantId)
      setAutoSelfBillExemptVendors(profile.auto_self_bill_exempt_vendors === true)

      // Auto-expand e-Invoice section if any fields have data
      if (initial.lhdnTin || initial.businessRegistrationNumber || initial.msicCode ||
          initial.sstRegistrationNumber || initial.lhdnClientId || initial.peppolParticipantId) {
        setEInvoiceSectionOpen(true)
      }
    }
  }, [profile])

  // Calculate dirty state for unsaved changes warning
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
      countryCode !== initialValues.countryCode ||
      lhdnTin !== initialValues.lhdnTin ||
      businessRegistrationNumber !== initialValues.businessRegistrationNumber ||
      msicCode !== initialValues.msicCode ||
      msicDescription !== initialValues.msicDescription ||
      sstRegistrationNumber !== initialValues.sstRegistrationNumber ||
      lhdnClientId !== initialValues.lhdnClientId ||
      lhdnClientSecret !== initialValues.lhdnClientSecret ||
      peppolParticipantId !== initialValues.peppolParticipantId
  }, [businessName, businessEmail, businessPhone, addressLine1, addressLine2, addressLine3,
      city, stateCode, postalCode, countryCode, lhdnTin, businessRegistrationNumber,
      msicCode, msicDescription, sstRegistrationNumber, lhdnClientId, lhdnClientSecret, peppolParticipantId,
      initialValues])

  // Register dirty state with unsaved changes provider
  useRegisterUnsavedChanges('business-profile-settings', isDirty)

  // MSIC search filtering
  const filteredMsicCodes = useMemo(() => {
    if (!msicSearch.trim()) return MSIC_CODES.slice(0, 50)
    const q = msicSearch.toLowerCase()
    return MSIC_CODES.filter(
      (m) => m.code.includes(q) || m.description.toLowerCase().includes(q)
    ).slice(0, 50)
  }, [msicSearch])

  // Close MSIC dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (msicDropdownRef.current && !msicDropdownRef.current.contains(event.target as Node)) {
        setMsicDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // SES verification is for the user's Clerk email (used for e-invoice forwarding)
  const [sesVerifyEmail, setSesVerifyEmail] = useState<string | null>(null)

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
      // Clean up query param from URL
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
        // Start polling every 5s
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

  const updateBusinessDetails = async () => {
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
          // Structured address (send empty string to clear — undefined is a no-op in Convex patch)
          address_line1: addressLine1.trim(),
          address_line2: addressLine2.trim(),
          address_line3: addressLine3.trim(),
          city: city.trim(),
          state_code: stateCode,
          postal_code: postalCode.trim(),
          country_code: countryCode,
          // e-Invoice fields
          lhdn_tin: lhdnTin.trim(),
          business_registration_number: businessRegistrationNumber.trim(),
          msic_code: msicCode.trim(),
          msic_description: msicDescription.trim(),
          sst_registration_number: sstRegistrationNumber.trim(),
          lhdn_client_id: lhdnClientId.trim(),
          // NOTE: lhdn_client_secret is NOT sent here — stored via separate SSM API call below
          peppol_participant_id: peppolParticipantId.trim(),
          auto_self_bill_exempt_vendors: autoSelfBillExemptVendors,
        })
      })

      const result = await response.json()

      if (result.success) {
        // Save LHDN client secret to AWS SSM Parameter Store (separate from Convex)
        if (lhdnClientSecret.trim() && lhdnClientSecret !== initialValues.lhdnClientSecret) {
          try {
            await fetch('/api/v1/account-management/businesses/lhdn-secret', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ client_secret: lhdnClientSecret.trim() }),
            })
          } catch (ssmError) {
            console.error('[Business Profile] Failed to save LHDN secret to SSM:', ssmError)
            // Non-blocking — profile saved, secret save can be retried
          }
        }

        updateProfile(result.data)
        // Update initial values to match saved state, clearing dirty state
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
          lhdnTin: lhdnTin.trim(),
          businessRegistrationNumber: businessRegistrationNumber.trim(),
          msicCode: msicCode.trim(),
          msicDescription: msicDescription.trim(),
          sstRegistrationNumber: sstRegistrationNumber.trim(),
          lhdnClientId: lhdnClientId.trim(),
          lhdnClientSecret: lhdnClientSecret.trim(),
          peppolParticipantId: peppolParticipantId.trim(),
          homeCurrency: (result.data.home_currency || 'MYR') as SupportedCurrency
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
      console.error('[Business Settings] Failed to update currency:', error)
      addToast({
        type: 'error',
        title: 'Failed to update currency',
        description: 'Unable to save business currency'
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

  const handleMsicSelect = (code: string, description: string) => {
    setMsicCode(code)
    setMsicDescription(description)
    setMsicSearch('')
    setMsicDropdownOpen(false)
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

  // When section="currency", render only currency preferences
  if (showCurrency && !showProfile && !showEInvoice) {
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

  // When section="einvoice", render only e-invoice compliance fields
  // (expanded by default, no collapsible wrapper)
  if (showEInvoice && !showProfile && !showCurrency) {
    return (
      <div>
        <div className="flex items-center space-x-3 mb-6">
          <FileText className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-semibold text-foreground">e-Invoice Compliance</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">LHDN TIN (Tax Identification Number)</label>
            <input type="text" value={lhdnTin} onChange={(e) => setLhdnTin(e.target.value)} placeholder="C21638015020"
              className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">Business Registration Number (BRN)</label>
              <input type="text" value={businessRegistrationNumber} onChange={(e) => setBusinessRegistrationNumber(e.target.value)} placeholder="e.g. 202001234567"
                className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">SST Registration Number</label>
              <input type="text" value={sstRegistrationNumber} onChange={(e) => setSstRegistrationNumber(e.target.value)} placeholder="e.g. B10-1234-56789012"
                className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">MSIC Code (Business Activity)</label>
            <input type="text" value={msicCode} onChange={(e) => setMsicCode(e.target.value)} placeholder="e.g. 62021"
              className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
            {msicCode && (
              <p className="text-xs text-muted-foreground mt-1">
                {MSIC_CODES.find(m => m.code === msicCode)?.description || 'Custom code'}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Peppol Participant ID</label>
            <input type="text" value={peppolParticipantId} onChange={(e) => setPeppolParticipantId(e.target.value)} placeholder="0195:T08GA1234A"
              className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
            <input type="checkbox" id="autoSelfBill" checked={autoSelfBillExemptVendors} onChange={(e) => setAutoSelfBillExemptVendors(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-ring" />
            <div>
              <label htmlFor="autoSelfBill" className="text-sm font-medium text-foreground cursor-pointer">
                Auto-generate self-billed e-invoices for exempt vendors
              </label>
              <p className="text-xs text-muted-foreground mt-1">
                When enabled, self-billed e-invoices will be automatically generated for approved expenses and AP invoices from LHDN-exempt vendors.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={updateBusinessDetails} disabled={isUpdating}
              className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed text-primary-foreground rounded-md font-medium transition-colors">
              {isUpdating ? <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin"></div> : 'Save Details'}
            </button>
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
              <input
                type="text"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                placeholder="Address Line 1 (Street address)"
                className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
              <input
                type="text"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                placeholder="Address Line 2 (Unit, building, floor)"
                className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
              <input
                type="text"
                value={addressLine3}
                onChange={(e) => setAddressLine3(e.target.value)}
                placeholder="Address Line 3 (Optional)"
                className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City"
                  className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                />
                <input
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="Postal Code"
                  className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={stateCode}
                  onChange={(e) => setStateCode(e.target.value)}
                  className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select state...</option>
                  {MALAYSIAN_STATE_CODES.map((s) => (
                    <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                  ))}
                </select>
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
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
                <input
                  type="email"
                  value={businessEmail}
                  onChange={(e) => setBusinessEmail(e.target.value)}
                  placeholder="billing@company.com"
                  className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Appears on invoices and customer-facing documents.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={businessPhone}
                  onChange={(e) => setBusinessPhone(e.target.value)}
                  placeholder="+60 12-345 6789"
                  className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                />
              </div>
            </div>

            {/* Email Forwarding — user's personal email for receiving e-invoice copies */}
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

            {/* e-Invoice Settings (Collapsible) */}
            <div className="border border-border rounded-lg">
              <button
                type="button"
                onClick={() => setEInvoiceSectionOpen(!eInvoiceSectionOpen)}
                className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span>e-Invoice Settings</span>
                  <ComingSoonBadge />
                </div>
                {eInvoiceSectionOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {eInvoiceSectionOpen && (
                <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
                  <p className="text-xs text-muted-foreground">
                    Configure LHDN MyInvois and Peppol compliance fields for e-invoicing.
                  </p>

                  {/* LHDN TIN */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      LHDN TIN (Tax Identification Number)
                    </label>
                    <input
                      type="text"
                      value={lhdnTin}
                      onChange={(e) => setLhdnTin(e.target.value)}
                      placeholder="C21638015020"
                      className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                    />
                  </div>

                  {/* BRN + SST side by side */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        Business Registration Number (BRN)
                      </label>
                      <input
                        type="text"
                        value={businessRegistrationNumber}
                        onChange={(e) => setBusinessRegistrationNumber(e.target.value)}
                        placeholder="e.g. 202001234567"
                        className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">
                        SST Registration Number
                      </label>
                      <input
                        type="text"
                        value={sstRegistrationNumber}
                        onChange={(e) => setSstRegistrationNumber(e.target.value)}
                        placeholder="e.g. B10-1234-56789012"
                        className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* MSIC Code Combobox */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      MSIC Code (Business Activity)
                    </label>
                    <div className="relative" ref={msicDropdownRef}>
                      <input
                        type="text"
                        value={msicDropdownOpen ? msicSearch : (msicCode ? `${msicCode} - ${msicDescription}` : '')}
                        onChange={(e) => {
                          setMsicSearch(e.target.value)
                          setMsicDropdownOpen(true)
                        }}
                        onFocus={() => {
                          setMsicSearch('')
                          setMsicDropdownOpen(true)
                        }}
                        placeholder="Search by code or activity description..."
                        className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                      />
                      {msicDropdownOpen && (
                        <div className="absolute z-20 mt-1 w-full bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {filteredMsicCodes.length === 0 ? (
                            <div className="px-4 py-3 text-sm text-muted-foreground">
                              No matching MSIC codes. You can enter a custom code below.
                            </div>
                          ) : (
                            filteredMsicCodes.map((m) => (
                              <button
                                key={m.code}
                                type="button"
                                onClick={() => handleMsicSelect(m.code, m.description)}
                                className="w-full text-left px-4 py-2 hover:bg-muted/50 transition-colors text-sm border-b border-border last:border-b-0"
                              >
                                <span className="font-medium text-foreground">{m.code}</span>
                                <span className="text-muted-foreground ml-2">{m.description}</span>
                              </button>
                            ))
                          )}
                          {msicSearch.trim() && /^\d{5}$/.test(msicSearch.trim()) && (
                            <button
                              type="button"
                              onClick={() => {
                                setMsicCode(msicSearch.trim())
                                setMsicDescription('')
                                setMsicSearch('')
                                setMsicDropdownOpen(false)
                              }}
                              className="w-full text-left px-4 py-2 hover:bg-muted/50 transition-colors text-sm text-primary border-t border-border"
                            >
                              Use custom code: {msicSearch.trim()}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {msicCode && msicDescription && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Selected: {msicCode} — {msicDescription}
                      </p>
                    )}
                  </div>

                  {/* LHDN Client ID */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      LHDN Client ID
                    </label>
                    <input
                      type="text"
                      value={lhdnClientId}
                      onChange={(e) => setLhdnClientId(e.target.value)}
                      placeholder="LHDN MyInvois Client ID"
                      className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      From your MyInvois portal &gt; Manage Application.
                    </p>
                  </div>

                  {/* LHDN Client Secret */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      LHDN Client Secret
                    </label>
                    <input
                      type="password"
                      value={lhdnClientSecret}
                      onChange={(e) => setLhdnClientSecret(e.target.value)}
                      placeholder="LHDN MyInvois Client Secret"
                      className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Stored securely in AWS. Required for automatic e-invoice retrieval.
                    </p>
                  </div>

                  {/* Peppol Participant ID */}
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Peppol Participant ID
                    </label>
                    <input
                      type="text"
                      value={peppolParticipantId}
                      onChange={(e) => setPeppolParticipantId(e.target.value)}
                      placeholder="0195:T08GA1234A"
                      className="w-full bg-input border border-input rounded-md px-3 py-2 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
                    />
                  </div>

                  {/* Auto Self-Bill Setting */}
                  <div className="border-t border-border pt-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoSelfBillExemptVendors}
                        onChange={(e) => setAutoSelfBillExemptVendors(e.target.checked)}
                        className="rounded border-border text-primary focus:ring-ring h-4 w-4"
                      />
                      <div>
                        <span className="text-sm font-medium text-foreground">
                          Auto-generate self-billed e-invoices for exempt vendors
                        </span>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          When enabled, self-billed e-invoices will be automatically generated for approved expenses and AP invoices from LHDN-exempt vendors.
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={updateBusinessDetails}
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

        {/* Currency Preferences */}
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
            <label className="block text-sm font-medium text-foreground mb-2">
              Home Currency
            </label>
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
                    Transactions in other currencies will be converted to {profile?.home_currency || 'MYR'} for dashboard summaries.
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

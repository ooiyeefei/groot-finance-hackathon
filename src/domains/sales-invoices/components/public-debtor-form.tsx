'use client'

import { useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { useRef } from 'react'
import { api } from '@/convex/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, ChevronDown, ChevronRight, CheckCircle2, AlertTriangle, Clock } from 'lucide-react'
import { MALAYSIAN_STATE_CODES } from '@/lib/data/state-codes'
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from '@/lib/data/country-codes'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PublicDebtorFormProps {
  token: string
  locale: string
}

interface FormData {
  businessName: string
  contactPerson: string
  contactPersonPosition: string
  email: string
  phone: string
  phone2: string
  fax: string
  addressLine1: string
  addressLine2: string
  addressLine3: string
  city: string
  stateCode: string
  postalCode: string
  countryCode: string
  tin: string
  brn: string
  idType: string
  sstRegistration: string
  website: string
  businessNature: string
}

const ID_TYPES = [
  { value: 'BRN', label: 'Business Registration Number (BRN)' },
  { value: 'NRIC', label: 'National ID (NRIC)' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'ARMY', label: 'Army ID' },
]

const TIN_REGEX = /^(C|IG)\d+$/

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PublicDebtorForm({ token, locale }: PublicDebtorFormProps) {
  const result = useQuery((api as any).functions.debtorSelfService.getFormData, { token })
  const submitMutation = useMutation((api as any).functions.debtorSelfService.submitUpdate)
  const logAccessMutation = useMutation((api as any).functions.debtorSelfService.logFormAccess)
  const hasLoggedAccess = useRef(false)

  const [formData, setFormData] = useState<FormData | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'rate_limited' | 'error'>('idle')
  const [taxSectionOpen, setTaxSectionOpen] = useState(false)
  const [addressSectionOpen, setAddressSectionOpen] = useState(true)
  const [contactSectionOpen, setContactSectionOpen] = useState(false)

  // Log form access for audit trail (once per page load)
  useEffect(() => {
    if (result?.valid && !hasLoggedAccess.current) {
      hasLoggedAccess.current = true
      logAccessMutation({ token }).catch(() => {})
    }
  }, [result?.valid, token, logAccessMutation])

  // Initialize form data when query loads
  useEffect(() => {
    if (result?.valid && result.customer && !formData) {
      const c = result.customer
      setFormData({
        businessName: c.businessName ?? '',
        contactPerson: c.contactPerson ?? '',
        contactPersonPosition: c.contactPersonPosition ?? '',
        email: c.email ?? '',
        phone: c.phone ?? '',
        phone2: c.phone2 ?? '',
        fax: c.fax ?? '',
        addressLine1: c.addressLine1 ?? '',
        addressLine2: c.addressLine2 ?? '',
        addressLine3: c.addressLine3 ?? '',
        city: c.city ?? '',
        stateCode: c.stateCode ?? '',
        postalCode: c.postalCode ?? '',
        countryCode: c.countryCode ?? DEFAULT_COUNTRY_CODE,
        tin: c.tin ?? '',
        brn: c.brn ?? '',
        idType: c.idType ?? '',
        sstRegistration: c.sstRegistration ?? '',
        website: c.website ?? '',
        businessNature: c.businessNature ?? '',
      })
      // Auto-expand sections with data
      if (c.tin || c.brn || c.sstRegistration || c.idType) {
        setTaxSectionOpen(true)
      }
      if (c.phone2 || c.fax || c.website || c.businessNature) {
        setContactSectionOpen(true)
      }
    }
  }, [result, formData])

  const handleChange = useCallback((field: keyof FormData, value: string) => {
    setFormData((prev) => prev ? { ...prev, [field]: value } : prev)
    setErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const validate = useCallback((): boolean => {
    if (!formData) return false
    const newErrors: Partial<Record<keyof FormData, string>> = {}

    if (!formData.businessName.trim()) {
      newErrors.businessName = 'Business name is required'
    }
    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format'
    }
    if (formData.tin && !TIN_REGEX.test(formData.tin)) {
      newErrors.tin = 'TIN must start with C or IG followed by digits'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData])

  const handleSubmit = useCallback(async () => {
    if (!validate() || !formData) return

    setIsSubmitting(true)
    try {
      const result = await submitMutation({
        token,
        updates: {
          businessName: formData.businessName || undefined,
          contactPerson: formData.contactPerson || undefined,
          contactPersonPosition: formData.contactPersonPosition || undefined,
          email: formData.email || undefined,
          phone: formData.phone || undefined,
          phone2: formData.phone2 || undefined,
          fax: formData.fax || undefined,
          addressLine1: formData.addressLine1 || undefined,
          addressLine2: formData.addressLine2 || undefined,
          addressLine3: formData.addressLine3 || undefined,
          city: formData.city || undefined,
          stateCode: formData.stateCode || undefined,
          postalCode: formData.postalCode || undefined,
          countryCode: formData.countryCode || undefined,
          tin: formData.tin || undefined,
          brn: formData.brn || undefined,
          idType: formData.idType || undefined,
          sstRegistration: formData.sstRegistration || undefined,
          website: formData.website || undefined,
          businessNature: formData.businessNature || undefined,
        },
      })

      if (result.success) {
        setSubmitStatus('success')
      } else if (result.error === 'rate_limited') {
        setSubmitStatus('rate_limited')
      } else {
        setSubmitStatus('error')
      }
    } catch {
      setSubmitStatus('error')
    } finally {
      setIsSubmitting(false)
    }
  }, [formData, token, validate, submitMutation])

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (result === undefined) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-12 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading your details...</p>
        </CardContent>
      </Card>
    )
  }

  // ---------------------------------------------------------------------------
  // Error states
  // ---------------------------------------------------------------------------

  if (!result.valid) {
    const errorContent = {
      expired: {
        icon: <Clock className="h-12 w-12 text-muted-foreground" />,
        title: 'Link Expired',
        message: 'This link has expired. Please contact the business that sent you this link to request a new one.',
      },
      revoked: {
        icon: <AlertTriangle className="h-12 w-12 text-muted-foreground" />,
        title: 'Link No Longer Active',
        message: 'This link is no longer active. Please contact the business for an updated link.',
      },
      invalid: {
        icon: <AlertTriangle className="h-12 w-12 text-muted-foreground" />,
        title: 'Invalid Link',
        message: 'This link is not valid. Please check the URL or contact the business that sent it to you.',
      },
    }

    const errorKey = (result.error ?? 'invalid') as keyof typeof errorContent
    const content = errorContent[errorKey]

    return (
      <Card className="bg-card border-border">
        <CardContent className="p-12 flex flex-col items-center gap-4 text-center">
          {content.icon}
          <h2 className="text-foreground text-xl font-semibold">{content.title}</h2>
          <p className="text-muted-foreground max-w-md">{content.message}</p>
        </CardContent>
      </Card>
    )
  }

  // ---------------------------------------------------------------------------
  // Success state
  // ---------------------------------------------------------------------------

  if (submitStatus === 'success') {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-12 flex flex-col items-center gap-4 text-center">
          <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
          <h2 className="text-foreground text-xl font-semibold">Thank You!</h2>
          <p className="text-muted-foreground max-w-md">
            Your business details have been updated successfully. The changes are now reflected in {result.businessName}&apos;s records.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (submitStatus === 'rate_limited') {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-12 flex flex-col items-center gap-4 text-center">
          <Clock className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-foreground text-xl font-semibold">Daily Limit Reached</h2>
          <p className="text-muted-foreground max-w-md">
            You&apos;ve reached the maximum number of updates for today. Please try again tomorrow.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (!formData) return null

  // ---------------------------------------------------------------------------
  // Form
  // ---------------------------------------------------------------------------

  const SectionToggle = ({ label, isOpen, onToggle, count }: { label: string; isOpen: boolean; onToggle: () => void; count?: number }) => (
    <button
      type="button"
      onClick={onToggle}
      className="flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors w-full py-2"
    >
      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      {label}
      {count !== undefined && count > 0 && (
        <span className="text-xs text-muted-foreground">({count} filled)</span>
      )}
    </button>
  )

  const filledTaxCount = [formData.tin, formData.brn, formData.sstRegistration, formData.idType].filter(Boolean).length
  const filledContactCount = [formData.phone2, formData.fax, formData.website, formData.businessNature, formData.contactPersonPosition].filter(Boolean).length
  const filledAddressCount = [formData.addressLine1, formData.city, formData.postalCode, formData.stateCode].filter(Boolean).length

  return (
    <div className="space-y-6">
      {/* Header info */}
      <div className="text-center space-y-2">
        <h2 className="text-foreground text-2xl font-semibold">Update Your Business Details</h2>
        <p className="text-muted-foreground">
          {result.businessName} has requested you update your business information for e-invoice compliance.
        </p>
      </div>

      {/* Customer code (read-only) */}
      {result.customer?.customerCode && (
        <Card className="bg-muted/50 border-border">
          <CardContent className="p-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Customer Code</span>
            <span className="text-sm font-mono text-foreground">{result.customer.customerCode}</span>
          </CardContent>
        </Card>
      )}

      {/* Basic info */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-foreground text-base">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-foreground font-medium">Business Name *</Label>
            <Input
              className="bg-input border-border text-foreground"
              value={formData.businessName}
              onChange={(e) => handleChange('businessName', e.target.value)}
            />
            {errors.businessName && <p className="text-destructive text-sm">{errors.businessName}</p>}
          </div>

          <div className="space-y-2">
            <Label className="text-foreground font-medium">Contact Person</Label>
            <Input
              className="bg-input border-border text-foreground"
              value={formData.contactPerson}
              onChange={(e) => handleChange('contactPerson', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-foreground font-medium">Email *</Label>
              <Input
                type="email"
                className="bg-input border-border text-foreground"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
              />
              {errors.email && <p className="text-destructive text-sm">{errors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label className="text-foreground font-medium">Phone</Label>
              <Input
                className="bg-input border-border text-foreground"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tax & Registration (expandable) */}
      <Card className="bg-card border-border">
        <CardContent className="pt-4">
          <SectionToggle label="Tax & Registration" isOpen={taxSectionOpen} onToggle={() => setTaxSectionOpen(!taxSectionOpen)} count={filledTaxCount} />
          {taxSectionOpen && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">TIN (Tax Identification Number)</Label>
                  <Input
                    className="bg-input border-border text-foreground"
                    placeholder="e.g. C12345678"
                    value={formData.tin}
                    onChange={(e) => handleChange('tin', e.target.value)}
                  />
                  {errors.tin && <p className="text-destructive text-sm">{errors.tin}</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground font-medium">BRN (Business Registration Number)</Label>
                  <Input
                    className="bg-input border-border text-foreground"
                    value={formData.brn}
                    onChange={(e) => handleChange('brn', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">ID Type</Label>
                  <select
                    className="w-full rounded-md border border-border bg-input px-3 py-2 text-foreground text-sm"
                    value={formData.idType}
                    onChange={(e) => handleChange('idType', e.target.value)}
                  >
                    <option value="">Select ID type</option>
                    {ID_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label className="text-foreground font-medium">SST Registration</Label>
                  <Input
                    className="bg-input border-border text-foreground"
                    value={formData.sstRegistration}
                    onChange={(e) => handleChange('sstRegistration', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Address (expandable) */}
      <Card className="bg-card border-border">
        <CardContent className="pt-4">
          <SectionToggle label="Address" isOpen={addressSectionOpen} onToggle={() => setAddressSectionOpen(!addressSectionOpen)} count={filledAddressCount} />
          {addressSectionOpen && (
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="text-foreground font-medium">Address Line 1</Label>
                <Input
                  className="bg-input border-border text-foreground"
                  value={formData.addressLine1}
                  onChange={(e) => handleChange('addressLine1', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground font-medium">Address Line 2</Label>
                <Input
                  className="bg-input border-border text-foreground"
                  value={formData.addressLine2}
                  onChange={(e) => handleChange('addressLine2', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-foreground font-medium">Address Line 3</Label>
                <Input
                  className="bg-input border-border text-foreground"
                  value={formData.addressLine3}
                  onChange={(e) => handleChange('addressLine3', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">City</Label>
                  <Input
                    className="bg-input border-border text-foreground"
                    value={formData.city}
                    onChange={(e) => handleChange('city', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">Postal Code</Label>
                  <Input
                    className="bg-input border-border text-foreground"
                    value={formData.postalCode}
                    onChange={(e) => handleChange('postalCode', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">State</Label>
                  <select
                    className="w-full rounded-md border border-border bg-input px-3 py-2 text-foreground text-sm"
                    value={formData.stateCode}
                    onChange={(e) => handleChange('stateCode', e.target.value)}
                  >
                    <option value="">Select state</option>
                    {MALAYSIAN_STATE_CODES.map((s) => (
                      <option key={s.code} value={s.code}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">Country</Label>
                  <select
                    className="w-full rounded-md border border-border bg-input px-3 py-2 text-foreground text-sm"
                    value={formData.countryCode}
                    onChange={(e) => handleChange('countryCode', e.target.value)}
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Additional Contact (expandable) */}
      <Card className="bg-card border-border">
        <CardContent className="pt-4">
          <SectionToggle label="Additional Details" isOpen={contactSectionOpen} onToggle={() => setContactSectionOpen(!contactSectionOpen)} count={filledContactCount} />
          {contactSectionOpen && (
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label className="text-foreground font-medium">Position / Title</Label>
                <Input
                  className="bg-input border-border text-foreground"
                  value={formData.contactPersonPosition}
                  onChange={(e) => handleChange('contactPersonPosition', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">Phone 2</Label>
                  <Input
                    className="bg-input border-border text-foreground"
                    value={formData.phone2}
                    onChange={(e) => handleChange('phone2', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">Fax</Label>
                  <Input
                    className="bg-input border-border text-foreground"
                    value={formData.fax}
                    onChange={(e) => handleChange('fax', e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">Website</Label>
                  <Input
                    className="bg-input border-border text-foreground"
                    placeholder="https://"
                    value={formData.website}
                    onChange={(e) => handleChange('website', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-foreground font-medium">Business Nature</Label>
                  <Input
                    className="bg-input border-border text-foreground"
                    value={formData.businessNature}
                    onChange={(e) => handleChange('businessNature', e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Submit */}
      {submitStatus === 'error' && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
          <p className="text-destructive text-sm">Something went wrong. Please try again.</p>
        </div>
      )}

      <Button
        className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
        onClick={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Updating...
          </>
        ) : (
          'Update Details'
        )}
      </Button>
    </div>
  )
}

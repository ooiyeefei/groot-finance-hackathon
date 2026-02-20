'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { MALAYSIAN_STATE_CODES } from '@/lib/data/state-codes'
import { COUNTRY_CODES, DEFAULT_COUNTRY_CODE } from '@/lib/data/country-codes'
import type { Customer } from '../types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CustomerFormData {
  businessName: string
  contactPerson: string
  email: string
  phone: string
  // Tax & Registration
  tin: string
  brn: string
  sstRegistration: string
  peppolParticipantId: string
  // Structured Address
  addressLine1: string
  addressLine2: string
  addressLine3: string
  city: string
  stateCode: string
  postalCode: string
  countryCode: string
}

interface CustomerFormProps {
  mode: 'create' | 'edit'
  initialData?: Partial<Customer>
  onSubmit: (data: {
    businessName: string
    contactPerson?: string
    email: string
    phone?: string
    tin?: string
    brn?: string
    sstRegistration?: string
    peppolParticipantId?: string
    addressLine1?: string
    addressLine2?: string
    addressLine3?: string
    city?: string
    stateCode?: string
    postalCode?: string
    countryCode?: string
  }) => Promise<void>
  onCancel: () => void
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitialFormData(initialData?: Partial<Customer>): CustomerFormData {
  return {
    businessName: initialData?.businessName ?? '',
    contactPerson: initialData?.contactPerson ?? '',
    email: initialData?.email ?? '',
    phone: initialData?.phone ?? '',
    tin: initialData?.tin ?? '',
    brn: initialData?.brn ?? '',
    sstRegistration: initialData?.sstRegistration ?? '',
    peppolParticipantId: initialData?.peppolParticipantId ?? '',
    addressLine1: initialData?.addressLine1 ?? '',
    addressLine2: initialData?.addressLine2 ?? '',
    addressLine3: initialData?.addressLine3 ?? '',
    city: initialData?.city ?? '',
    stateCode: initialData?.stateCode ?? '',
    postalCode: initialData?.postalCode ?? '',
    countryCode: initialData?.countryCode ?? DEFAULT_COUNTRY_CODE,
  }
}

const TIN_REGEX = /^(C|IG)\d+$/

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CustomerForm({
  mode,
  initialData,
  onSubmit,
  onCancel,
}: CustomerFormProps) {
  const [formData, setFormData] = useState<CustomerFormData>(() =>
    getInitialFormData(initialData),
  )
  const [errors, setErrors] = useState<Partial<Record<keyof CustomerFormData, string>>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [taxSectionOpen, setTaxSectionOpen] = useState(false)
  const [addressSectionOpen, setAddressSectionOpen] = useState(false)

  // Reset form when initialData changes
  useEffect(() => {
    const data = getInitialFormData(initialData)
    setFormData(data)
    setErrors({})
    // Auto-expand sections if they have data
    if (data.tin || data.brn || data.sstRegistration || data.peppolParticipantId) {
      setTaxSectionOpen(true)
    }
    if (data.addressLine1 || data.city || data.postalCode) {
      setAddressSectionOpen(true)
    }
  }, [initialData])

  // -------------------------------------------------------------------------
  // Field change handler
  // -------------------------------------------------------------------------

  const handleChange = useCallback(
    (field: keyof CustomerFormData, value: string) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
      setErrors((prev) => {
        if (!prev[field]) return prev
        const next = { ...prev }
        delete next[field]
        return next
      })
    },
    [],
  )

  // -------------------------------------------------------------------------
  // Validation
  // -------------------------------------------------------------------------

  const validate = useCallback((): boolean => {
    const newErrors: Partial<Record<keyof CustomerFormData, string>> = {}

    if (!formData.businessName.trim()) {
      newErrors.businessName = 'Business name is required'
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.email.trim())) {
        newErrors.email = 'Please enter a valid email address'
      }
    }

    if (formData.tin.trim() && !TIN_REGEX.test(formData.tin.trim())) {
      newErrors.tin = 'TIN must start with C or IG followed by digits (e.g. C21638015020)'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData])

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!validate()) return

      setIsSubmitting(true)
      try {
        await onSubmit({
          businessName: formData.businessName.trim(),
          contactPerson: formData.contactPerson.trim() || undefined,
          email: formData.email.trim(),
          phone: formData.phone.trim() || undefined,
          tin: formData.tin.trim() || undefined,
          brn: formData.brn.trim() || undefined,
          sstRegistration: formData.sstRegistration.trim() || undefined,
          peppolParticipantId: formData.peppolParticipantId.trim() || undefined,
          addressLine1: formData.addressLine1.trim() || undefined,
          addressLine2: formData.addressLine2.trim() || undefined,
          addressLine3: formData.addressLine3.trim() || undefined,
          city: formData.city.trim() || undefined,
          stateCode: formData.stateCode || undefined,
          postalCode: formData.postalCode.trim() || undefined,
          countryCode: formData.countryCode || undefined,
        })
      } finally {
        setIsSubmitting(false)
      }
    },
    [formData, validate, onSubmit],
  )

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <Card className="border-border">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg text-foreground">
          {mode === 'create' ? 'Add Customer' : 'Edit Customer'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Business Name */}
          <div className="space-y-1.5">
            <Label htmlFor="customer-businessName" className="text-foreground">
              Business Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="customer-businessName"
              placeholder="e.g. Acme Pte Ltd"
              value={formData.businessName}
              onChange={(e) => handleChange('businessName', e.target.value)}
            />
            {errors.businessName && (
              <p className="text-sm text-destructive">{errors.businessName}</p>
            )}
          </div>

          {/* Contact Person */}
          <div className="space-y-1.5">
            <Label htmlFor="customer-contactPerson" className="text-foreground">
              Contact Person
            </Label>
            <Input
              id="customer-contactPerson"
              placeholder="e.g. John Doe"
              value={formData.contactPerson}
              onChange={(e) => handleChange('contactPerson', e.target.value)}
            />
          </div>

          {/* Email & Phone (side by side) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="customer-email" className="text-foreground">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="customer-email"
                type="email"
                placeholder="customer@example.com"
                value={formData.email}
                onChange={(e) => handleChange('email', e.target.value)}
              />
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="customer-phone" className="text-foreground">
                Phone
              </Label>
              <Input
                id="customer-phone"
                type="tel"
                placeholder="+65 1234 5678"
                value={formData.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
              />
            </div>
          </div>

          {/* Tax & Registration (Collapsible) */}
          <div className="border border-border rounded-lg">
            <button
              type="button"
              onClick={() => setTaxSectionOpen(!taxSectionOpen)}
              className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors rounded-lg"
            >
              <span>Tax & Registration</span>
              {taxSectionOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {taxSectionOpen && (
              <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="customer-tin" className="text-foreground">
                    TIN (Tax Identification Number)
                  </Label>
                  <Input
                    id="customer-tin"
                    placeholder="C21638015020"
                    value={formData.tin}
                    onChange={(e) => handleChange('tin', e.target.value)}
                  />
                  {errors.tin && (
                    <p className="text-sm text-destructive">{errors.tin}</p>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="customer-brn" className="text-foreground">
                      Business Registration Number (BRN)
                    </Label>
                    <Input
                      id="customer-brn"
                      placeholder="e.g. 202001234567"
                      value={formData.brn}
                      onChange={(e) => handleChange('brn', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="customer-sstRegistration" className="text-foreground">
                      SST Registration
                    </Label>
                    <Input
                      id="customer-sstRegistration"
                      placeholder="e.g. B10-1234-56789012"
                      value={formData.sstRegistration}
                      onChange={(e) => handleChange('sstRegistration', e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="customer-peppolParticipantId" className="text-foreground">
                    Peppol Participant ID
                  </Label>
                  <Input
                    id="customer-peppolParticipantId"
                    placeholder="0195:TXXXXXXXXX"
                    value={formData.peppolParticipantId}
                    onChange={(e) => handleChange('peppolParticipantId', e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Structured Address (Collapsible) */}
          <div className="border border-border rounded-lg">
            <button
              type="button"
              onClick={() => setAddressSectionOpen(!addressSectionOpen)}
              className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors rounded-lg"
            >
              <span>Address</span>
              {addressSectionOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {addressSectionOpen && (
              <div className="px-4 pb-4 space-y-4 border-t border-border pt-4">
                <div className="space-y-1.5">
                  <Label htmlFor="customer-addressLine1" className="text-foreground">
                    Address Line 1
                  </Label>
                  <Input
                    id="customer-addressLine1"
                    placeholder="Street address"
                    value={formData.addressLine1}
                    onChange={(e) => handleChange('addressLine1', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="customer-addressLine2" className="text-foreground">
                    Address Line 2
                  </Label>
                  <Input
                    id="customer-addressLine2"
                    placeholder="Unit, building, floor"
                    value={formData.addressLine2}
                    onChange={(e) => handleChange('addressLine2', e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="customer-addressLine3" className="text-foreground">
                    Address Line 3
                  </Label>
                  <Input
                    id="customer-addressLine3"
                    placeholder="Additional address info"
                    value={formData.addressLine3}
                    onChange={(e) => handleChange('addressLine3', e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="customer-city" className="text-foreground">
                      City
                    </Label>
                    <Input
                      id="customer-city"
                      placeholder="e.g. Kuala Lumpur"
                      value={formData.city}
                      onChange={(e) => handleChange('city', e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="customer-postalCode" className="text-foreground">
                      Postal Code
                    </Label>
                    <Input
                      id="customer-postalCode"
                      placeholder="e.g. 50000"
                      value={formData.postalCode}
                      onChange={(e) => handleChange('postalCode', e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="customer-stateCode" className="text-foreground">
                      State
                    </Label>
                    <select
                      id="customer-stateCode"
                      value={formData.stateCode}
                      onChange={(e) => handleChange('stateCode', e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <option value="">Select state...</option>
                      {MALAYSIAN_STATE_CODES.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name} ({s.code})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="customer-countryCode" className="text-foreground">
                      Country
                    </Label>
                    <select
                      id="customer-countryCode"
                      value={formData.countryCode}
                      onChange={(e) => handleChange('countryCode', e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      {COUNTRY_CODES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === 'create' ? 'Add Customer' : 'Save Changes'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

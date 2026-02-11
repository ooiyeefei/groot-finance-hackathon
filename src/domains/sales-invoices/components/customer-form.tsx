'use client'

import { useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'
import type { Customer } from '../types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CustomerFormData {
  businessName: string
  contactPerson: string
  email: string
  phone: string
  address: string
  taxId: string
}

interface CustomerFormProps {
  mode: 'create' | 'edit'
  initialData?: Partial<Customer>
  onSubmit: (data: {
    businessName: string
    contactPerson?: string
    email: string
    phone?: string
    address?: string
    taxId?: string
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
    address: initialData?.address ?? '',
    taxId: initialData?.taxId ?? '',
  }
}

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

  // Reset form when initialData changes
  useEffect(() => {
    setFormData(getInitialFormData(initialData))
    setErrors({})
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
      // Simple email regex
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.email.trim())) {
        newErrors.email = 'Please enter a valid email address'
      }
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
          address: formData.address.trim() || undefined,
          taxId: formData.taxId.trim() || undefined,
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

          {/* Address */}
          <div className="space-y-1.5">
            <Label htmlFor="customer-address" className="text-foreground">
              Address
            </Label>
            <Textarea
              id="customer-address"
              placeholder="Business address"
              rows={3}
              value={formData.address}
              onChange={(e) => handleChange('address', e.target.value)}
            />
          </div>

          {/* Tax ID */}
          <div className="space-y-1.5">
            <Label htmlFor="customer-taxId" className="text-foreground">
              Tax ID
            </Label>
            <Input
              id="customer-taxId"
              placeholder="e.g. GST registration number"
              value={formData.taxId}
              onChange={(e) => handleChange('taxId', e.target.value)}
            />
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

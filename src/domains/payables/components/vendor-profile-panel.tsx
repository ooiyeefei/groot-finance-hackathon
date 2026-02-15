'use client'

import { useState, useEffect } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'
import { Button } from '@/components/ui/button'
import { Loader2, Save, User, Globe, FileText } from 'lucide-react'
import VendorBankDetails from './vendor-bank-details'
import { PAYMENT_TERMS_OPTIONS } from '@/lib/constants/statuses'
import { formatCurrency } from '@/lib/utils/format-number'

interface VendorProfilePanelProps {
  vendorId: string
  onClose?: () => void
}

const PAYMENT_TERMS_LABELS: Record<string, string> = {
  due_on_receipt: 'Due on Receipt',
  net_15: 'Net 15',
  net_30: 'Net 30',
  net_60: 'Net 60',
  custom: 'Custom',
}

export default function VendorProfilePanel({ vendorId, onClose }: VendorProfilePanelProps) {
  const { businessId } = useActiveBusiness()
  const updateVendor = useMutation(api.functions.vendors.update)

  const context = useQuery(
    api.functions.vendors.getVendorContext,
    businessId
      ? {
          vendorId: vendorId as Id<"vendors">,
          businessId: businessId as Id<"businesses">,
        }
      : "skip"
  )

  // Fetch full vendor for editing
  const vendor = useQuery(
    api.functions.vendors.getById,
    vendorId ? { id: vendorId } : "skip"
  )

  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState({
    paymentTerms: '' as string,
    customPaymentDays: 0,
    defaultCurrency: '',
    contactPerson: '',
    website: '',
    notes: '',
    bankDetails: {
      bankName: '',
      accountNumber: '',
      routingCode: '',
      accountHolderName: '',
    },
  })

  useEffect(() => {
    if (vendor) {
      setForm({
        paymentTerms: vendor.paymentTerms ?? '',
        customPaymentDays: vendor.customPaymentDays ?? 0,
        defaultCurrency: vendor.defaultCurrency ?? '',
        contactPerson: vendor.contactPerson ?? '',
        website: vendor.website ?? '',
        notes: vendor.notes ?? '',
        bankDetails: {
          bankName: vendor.bankDetails?.bankName ?? '',
          accountNumber: vendor.bankDetails?.accountNumber ?? '',
          routingCode: vendor.bankDetails?.routingCode ?? '',
          accountHolderName: vendor.bankDetails?.accountHolderName ?? '',
        },
      })
    }
  }, [vendor])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await updateVendor({
        id: vendorId,
        paymentTerms: form.paymentTerms as typeof PAYMENT_TERMS_OPTIONS[keyof typeof PAYMENT_TERMS_OPTIONS] || undefined,
        customPaymentDays: form.paymentTerms === 'custom' ? form.customPaymentDays : undefined,
        defaultCurrency: form.defaultCurrency || undefined,
        contactPerson: form.contactPerson || undefined,
        website: form.website || undefined,
        notes: form.notes || undefined,
        bankDetails: (form.bankDetails.bankName || form.bankDetails.accountNumber)
          ? form.bankDetails
          : undefined,
      })
      setIsEditing(false)
    } catch (err) {
      console.error('Failed to update vendor:', err)
    } finally {
      setIsSaving(false)
    }
  }

  if (context === undefined || vendor === undefined) {
    return (
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="h-5 w-32 bg-muted rounded animate-pulse" />
        <div className="h-4 w-48 bg-muted rounded animate-pulse" />
        <div className="h-4 w-40 bg-muted rounded animate-pulse" />
      </div>
    )
  }

  if (!context || !vendor) return null

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{vendor.name}</h3>
        <Button
          variant={isEditing ? "primary" : "outline"}
          size="sm"
          onClick={isEditing ? handleSave : () => setIsEditing(true)}
          disabled={isSaving}
        >
          {isSaving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : isEditing ? (
            <>
              <Save className="w-3.5 h-3.5" />
              Save
            </>
          ) : (
            'Edit'
          )}
        </Button>
      </div>

      {/* Outstanding Summary */}
      {context.outstanding.entryCount > 0 && (
        <div className="bg-muted rounded-md p-3">
          <div className="text-xs text-muted-foreground">Outstanding Payables</div>
          <div className="text-lg font-semibold text-foreground">
            {formatCurrency(context.outstanding.totalAmount, vendor.defaultCurrency ?? 'SGD')}
          </div>
          <div className="text-xs text-muted-foreground">
            {context.outstanding.entryCount} unpaid bill{context.outstanding.entryCount > 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Payment Terms */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">Payment Terms</label>
        {isEditing ? (
          <div className="space-y-2">
            <select
              value={form.paymentTerms}
              onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
              className="w-full bg-input border border-border text-foreground rounded-md px-3 py-1.5 text-sm"
            >
              <option value="">Not set</option>
              {Object.entries(PAYMENT_TERMS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            {form.paymentTerms === 'custom' && (
              <input
                type="number"
                value={form.customPaymentDays}
                onChange={(e) => setForm({ ...form, customPaymentDays: parseInt(e.target.value) || 0 })}
                placeholder="Days"
                min={1}
                className="w-full bg-input border border-border text-foreground rounded-md px-3 py-1.5 text-sm"
              />
            )}
          </div>
        ) : (
          <div className="text-sm text-foreground">
            {vendor.paymentTerms
              ? PAYMENT_TERMS_LABELS[vendor.paymentTerms] + (vendor.paymentTerms === 'custom' ? ` (${vendor.customPaymentDays} days)` : '')
              : 'Not set'}
          </div>
        )}
      </div>

      {/* Contact & Metadata */}
      {isEditing ? (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Contact Person</label>
            <input
              value={form.contactPerson}
              onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
              placeholder="Contact name"
              className="w-full bg-input border border-border text-foreground rounded-md px-3 py-1.5 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Website</label>
            <input
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              placeholder="https://..."
              className="w-full bg-input border border-border text-foreground rounded-md px-3 py-1.5 text-sm mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="w-full bg-input border border-border text-foreground rounded-md px-3 py-1.5 text-sm mt-1 resize-none"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Bank Details</label>
            {['bankName', 'accountHolderName', 'accountNumber', 'routingCode'].map((field) => (
              <input
                key={field}
                value={(form.bankDetails as Record<string, string>)[field] ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    bankDetails: { ...form.bankDetails, [field]: e.target.value },
                  })
                }
                placeholder={field.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
                className="w-full bg-input border border-border text-foreground rounded-md px-3 py-1.5 text-sm"
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {vendor.contactPerson && (
            <div className="flex items-center gap-1.5 text-sm">
              <User className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-foreground">{vendor.contactPerson}</span>
            </div>
          )}
          {vendor.website && (
            <div className="flex items-center gap-1.5 text-sm">
              <Globe className="w-3.5 h-3.5 text-muted-foreground" />
              <a href={vendor.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                {vendor.website}
              </a>
            </div>
          )}
          {vendor.notes && (
            <div className="flex items-start gap-1.5 text-sm">
              <FileText className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
              <span className="text-muted-foreground">{vendor.notes}</span>
            </div>
          )}
          <VendorBankDetails bankDetails={vendor.bankDetails} />
        </div>
      )}
    </div>
  )
}

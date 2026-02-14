'use client'

import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { formatCurrency } from '@/lib/utils/format-number'
import { Building, Clock, AlertTriangle } from 'lucide-react'

const PAYMENT_TERMS_LABELS: Record<string, string> = {
  due_on_receipt: 'Due on Receipt',
  net_7: 'Net 7',
  net_14: 'Net 14',
  net_30: 'Net 30',
  net_45: 'Net 45',
  net_60: 'Net 60',
  net_90: 'Net 90',
  custom: 'Custom',
}

interface VendorContextNoteProps {
  vendorName: string
  businessId: string
  currency: string
}

export default function VendorContextNote({ vendorName, businessId, currency }: VendorContextNoteProps) {
  const bizId = businessId as Id<"businesses">

  // Search for vendor by name (case-insensitive match)
  const matchedVendors = useQuery(
    api.functions.vendors.searchByName,
    vendorName ? { businessId: bizId, searchTerm: vendorName, limit: 1 } : 'skip'
  )

  const vendor = matchedVendors?.[0]

  // Get vendor context if matched
  const vendorContext = useQuery(
    api.functions.vendors.getVendorContext,
    vendor ? { vendorId: vendor._id, businessId: bizId } : 'skip'
  )

  // Don't render if no vendor matched or context not loaded
  if (!vendor || !vendorContext) return null

  const termsLabel = vendorContext.vendor.paymentTerms
    ? PAYMENT_TERMS_LABELS[vendorContext.vendor.paymentTerms] || vendorContext.vendor.paymentTerms
    : null

  const hasOutstanding = vendorContext.outstanding.entryCount > 0

  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground bg-muted/30 rounded px-2.5 py-1.5 mt-2">
      <Building className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="font-medium text-foreground">{vendor.name}</span>
      {termsLabel && (
        <>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {termsLabel}
          </span>
        </>
      )}
      {hasOutstanding && (
        <>
          <span className="text-border">|</span>
          <span className="flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-500" />
            {vendorContext.outstanding.entryCount} unpaid — {formatCurrency(vendorContext.outstanding.totalAmount, currency)}
          </span>
        </>
      )}
    </div>
  )
}

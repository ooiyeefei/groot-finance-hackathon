'use client'

import { ArrowDownRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format-number'

interface VendorComparisonNoteProps {
  cheaperVendor: {
    vendorId: string
    vendorName: string
    price: number
    savingsPercent: number
  }
  currency: string
}

export default function VendorComparisonNote({ cheaperVendor, currency }: VendorComparisonNoteProps) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <ArrowDownRight className="w-3 h-3 text-green-600 dark:text-green-400" />
      <span>
        <span className="font-medium text-foreground">{cheaperVendor.vendorName}</span>
        {' offers this for '}
        <span className="text-green-600 dark:text-green-400 font-medium">
          {cheaperVendor.savingsPercent.toFixed(1)}% less
        </span>
        {' ('}
        {formatCurrency(cheaperVendor.price, currency)}
        {')'}
      </span>
    </span>
  )
}

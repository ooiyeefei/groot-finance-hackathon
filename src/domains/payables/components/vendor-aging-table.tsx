'use client'

import { formatCurrency } from '@/lib/utils/format-number'

interface VendorAgingRow {
  vendorId: string | null
  vendorName: string
  paymentTerms?: string
  current: number
  days1to30: number
  days31to60: number
  days61to90: number
  days90plus: number
  totalOutstanding: number
  entryCount: number
}

interface Totals {
  current: number
  days1to30: number
  days31to60: number
  days61to90: number
  days90plus: number
  totalOutstanding: number
}

interface VendorAgingTableProps {
  vendors: VendorAgingRow[]
  totals: Totals
  isLoading: boolean
  onSelectVendor: (vendorId: string | null) => void
  currency?: string
}

function getBucketColor(amount: number): string {
  if (amount <= 0) return 'text-muted-foreground'
  return 'text-foreground'
}

function getOverdueColor(amount: number): string {
  if (amount <= 0) return ''
  return 'text-destructive font-medium'
}

export default function VendorAgingTable({
  vendors,
  totals,
  isLoading,
  onSelectVendor,
  currency = 'SGD',
}: VendorAgingTableProps) {
  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="h-5 w-40 bg-muted rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-8 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (vendors.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 text-center">
        <p className="text-sm text-muted-foreground">No outstanding payables</p>
      </div>
    )
  }

  const columns = [
    { key: 'vendor', label: 'Vendor', align: 'left' as const },
    { key: 'current', label: 'Current', align: 'right' as const },
    { key: '1-30', label: '1-30 days', align: 'right' as const },
    { key: '31-60', label: '31-60 days', align: 'right' as const },
    { key: '61-90', label: '61-90 days', align: 'right' as const },
    { key: '90+', label: '90+ days', align: 'right' as const },
    { key: 'total', label: 'Total', align: 'right' as const },
  ]

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Aged Payables by Vendor</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-2 text-xs font-medium text-muted-foreground ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vendors.map((vendor) => (
              <tr
                key={vendor.vendorId ?? '__unassigned__'}
                className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
                onClick={() => onSelectVendor(vendor.vendorId ?? '__unassigned__')}
              >
                <td className="px-4 py-2.5">
                  <div className="text-foreground font-medium">{vendor.vendorName}</div>
                  <div className="text-xs text-muted-foreground">
                    {vendor.entryCount} bill{vendor.entryCount > 1 ? 's' : ''}
                  </div>
                </td>
                <td className={`px-4 py-2.5 text-right ${getBucketColor(vendor.current)}`}>
                  {vendor.current > 0 ? formatCurrency(vendor.current, currency) : '—'}
                </td>
                <td className={`px-4 py-2.5 text-right ${getBucketColor(vendor.days1to30)}`}>
                  {vendor.days1to30 > 0 ? formatCurrency(vendor.days1to30, currency) : '—'}
                </td>
                <td className={`px-4 py-2.5 text-right ${getOverdueColor(vendor.days31to60)}`}>
                  {vendor.days31to60 > 0 ? formatCurrency(vendor.days31to60, currency) : '—'}
                </td>
                <td className={`px-4 py-2.5 text-right ${getOverdueColor(vendor.days61to90)}`}>
                  {vendor.days61to90 > 0 ? formatCurrency(vendor.days61to90, currency) : '—'}
                </td>
                <td className={`px-4 py-2.5 text-right ${getOverdueColor(vendor.days90plus)}`}>
                  {vendor.days90plus > 0 ? formatCurrency(vendor.days90plus, currency) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-foreground">
                  {formatCurrency(vendor.totalOutstanding, currency)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-muted/50 font-semibold">
              <td className="px-4 py-2.5 text-foreground">Total</td>
              <td className="px-4 py-2.5 text-right text-foreground">
                {totals.current > 0 ? formatCurrency(totals.current, currency) : '—'}
              </td>
              <td className="px-4 py-2.5 text-right text-foreground">
                {totals.days1to30 > 0 ? formatCurrency(totals.days1to30, currency) : '—'}
              </td>
              <td className="px-4 py-2.5 text-right text-foreground">
                {totals.days31to60 > 0 ? formatCurrency(totals.days31to60, currency) : '—'}
              </td>
              <td className="px-4 py-2.5 text-right text-foreground">
                {totals.days61to90 > 0 ? formatCurrency(totals.days61to90, currency) : '—'}
              </td>
              <td className="px-4 py-2.5 text-right text-foreground">
                {totals.days90plus > 0 ? formatCurrency(totals.days90plus, currency) : '—'}
              </td>
              <td className="px-4 py-2.5 text-right text-foreground">
                {formatCurrency(totals.totalOutstanding, currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

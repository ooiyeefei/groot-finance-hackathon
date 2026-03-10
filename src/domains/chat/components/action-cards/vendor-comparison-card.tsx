'use client'

/**
 * Vendor Comparison Card
 *
 * Renders vendor metrics in a stacked single-column layout
 * with action buttons for navigation and follow-up.
 */

import { useRouter } from 'next/navigation'
import { Building2, ExternalLink, Star, Download } from 'lucide-react'
import { exportToCSV } from '../../lib/csv-export'
import { registerActionCard, type ActionCardProps } from './registry'

interface VendorMetrics {
  id: string
  name: string
  averagePrice?: number
  currency?: string
  onTimeRate?: number
  rating?: number
  transactionCount?: number
  totalSpend?: number
}

interface VendorComparisonData {
  vendors: VendorMetrics[]
  comparisonPeriod?: string
}

function VendorComparisonCard({ action, isHistorical }: ActionCardProps) {
  const router = useRouter()
  const data = action.data as unknown as VendorComparisonData

  if (!data?.vendors?.length) return null

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card">
      {/* Header */}
      <div className="px-3 py-2 bg-primary/5 border-b border-border flex items-center gap-2">
        <Building2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="text-xs font-medium text-foreground flex-1">
          Vendor Comparison
          {data.comparisonPeriod && (
            <span className="text-muted-foreground font-normal"> · {data.comparisonPeriod}</span>
          )}
        </span>
        <button
          onClick={() => exportToCSV(
            'vendor-comparison.csv',
            ['Vendor', 'Avg Price', 'On-Time %', 'Rating', 'Transactions', 'Total Spend'],
            data.vendors.map((v) => [
              v.name,
              v.averagePrice ?? '',
              v.onTimeRate ?? '',
              v.rating ?? '',
              v.transactionCount ?? '',
              v.totalSpend ?? '',
            ])
          )}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
          aria-label="Export CSV"
          title="Export as CSV"
        >
          <Download className="w-3 h-3" />
        </button>
      </div>

      {/* Vendor sections */}
      <div className="divide-y divide-border">
        {data.vendors.map((vendor) => (
          <div key={vendor.id} className="px-3 py-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-foreground">{vendor.name}</span>
              {vendor.rating != null && (
                <div className="flex items-center gap-0.5">
                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                  <span className="text-xs text-foreground font-medium">
                    {vendor.rating.toFixed(1)}
                  </span>
                </div>
              )}
            </div>

            {/* Metrics grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {vendor.averagePrice != null && (
                <div>
                  <span className="text-muted-foreground">Avg Price</span>
                  <p className="text-foreground font-medium">
                    {vendor.currency || 'MYR'} {vendor.averagePrice.toLocaleString()}
                  </p>
                </div>
              )}
              {vendor.onTimeRate != null && (
                <div>
                  <span className="text-muted-foreground">On-Time</span>
                  <p className="text-foreground font-medium">{vendor.onTimeRate}%</p>
                </div>
              )}
              {vendor.transactionCount != null && (
                <div>
                  <span className="text-muted-foreground">Transactions</span>
                  <p className="text-foreground font-medium">{vendor.transactionCount}</p>
                </div>
              )}
              {vendor.totalSpend != null && (
                <div>
                  <span className="text-muted-foreground">Total Spend</span>
                  <p className="text-foreground font-medium">
                    {vendor.currency || 'MYR'} {vendor.totalSpend.toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            {/* Action button */}
            {!isHistorical && (
              <button
                onClick={() => router.push(`/en/expense-claims?vendor=${vendor.id}`)}
                className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                View Vendor History
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Register the card type
registerActionCard('vendor_comparison', VendorComparisonCard)

export { VendorComparisonCard }

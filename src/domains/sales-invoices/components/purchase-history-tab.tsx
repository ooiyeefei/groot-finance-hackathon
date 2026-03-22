'use client'

import { useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Package } from 'lucide-react'
import { useActiveBusiness } from '@/contexts/business-context'
import { useCatalogVendorMappings } from '../hooks/use-catalog-vendor-mappings'
import { PriceHistoryChart } from '@/domains/vendor-intelligence/components/price-history-chart'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import MappingBanner from './mapping-banner'
import type { Id } from '../../../../convex/_generated/dataModel'

interface PurchaseHistoryTabProps {
  catalogItemId: Id<"catalog_items">
  currency: string
}

export default function PurchaseHistoryTab({ catalogItemId, currency }: PurchaseHistoryTabProps) {
  const { businessId } = useActiveBusiness()
  const { mappings, unmappedCount, isLoading } = useCatalogVendorMappings(businessId, catalogItemId)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const confirmedMappings = mappings.filter(
    (m: any) => m.matchSource === 'user-confirmed' || m.matchSource === 'user-created'
  )

  return (
    <div className="space-y-6">
      {/* Show mapping banner if no confirmed mappings but vendor data exists */}
      {confirmedMappings.length === 0 && (
        <MappingBanner catalogItemId={catalogItemId} />
      )}

      {/* Show mapped vendor items */}
      {confirmedMappings.length > 0 && (
        <>
          <div className="flex flex-wrap gap-2">
            {confirmedMappings.map((m: any) => (
              <Badge key={m._id} className="bg-muted text-muted-foreground">
                {m.vendorName}: {m.vendorItemDescription}
              </Badge>
            ))}
          </div>

          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground text-base">
                Purchase History from Vendor Intelligence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                Purchase price data is sourced from the Vendor Intelligence module.
                Visit the Vendor Intelligence page for detailed analysis, anomaly alerts, and cross-vendor comparison.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Vendor</th>
                      <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Item</th>
                      <th className="px-4 py-3 text-left text-foreground font-medium text-sm">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {confirmedMappings.map((m: any) => (
                      <tr key={m._id} className="border-b border-border hover:bg-muted/50">
                        <td className="px-4 py-3 text-foreground text-sm">{m.vendorName}</td>
                        <td className="px-4 py-3 text-foreground text-sm">{m.vendorItemDescription}</td>
                        <td className="px-4 py-3 text-sm">
                          <Badge className={
                            m.matchSource === 'user-confirmed'
                              ? 'bg-green-500/10 text-green-600 border border-green-500/30'
                              : 'bg-blue-500/10 text-blue-600 border border-blue-500/30'
                          }>
                            {m.matchSource === 'user-confirmed' ? 'Confirmed' : 'Manual'}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {confirmedMappings.length === 0 && !unmappedCount.hasData && (
        <div className="text-center py-12">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No purchase data available</h3>
          <p className="text-muted-foreground">
            Purchase prices will appear here once AP invoices with matching items are processed through Vendor Intelligence.
          </p>
        </div>
      )}
    </div>
  )
}

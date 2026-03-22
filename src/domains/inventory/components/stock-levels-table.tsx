'use client'

import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface StockLevelsTableProps {
  businessId: Id<"businesses">
  catalogItemId: Id<"catalog_items">
}

export function StockLevelsTable({ businessId, catalogItemId }: StockLevelsTableProps) {
  const stockData = useQuery(api.functions.inventoryStock.getByProduct, {
    businessId,
    catalogItemId,
  })

  if (stockData === undefined) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="animate-pulse space-y-2">
            <div className="bg-muted rounded h-4 w-1/2" />
            <div className="bg-muted rounded h-4 w-1/3" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (stockData.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-4 text-center">
          <p className="text-muted-foreground text-sm">No stock data for this item.</p>
        </CardContent>
      </Card>
    )
  }

  const totalQty = stockData.reduce((sum: number, s: any) => sum + s.stock.quantityOnHand, 0)

  return (
    <Card className="bg-card border-border">
      <CardHeader className="border-b border-border py-3 px-4">
        <CardTitle className="text-sm text-foreground flex items-center justify-between">
          <span>Stock by Location</span>
          <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30">
            Total: {totalQty}
          </Badge>
        </CardTitle>
      </CardHeader>
      <div className="divide-y divide-border">
        {stockData.map(({ location, stock }: any) => {
          const isLow = stock.reorderLevel !== undefined && stock.quantityOnHand <= stock.reorderLevel
          return (
            <div key={stock._id} className="px-4 py-2 flex items-center justify-between">
              <span className="text-foreground text-sm">{location.name}</span>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${
                  stock.quantityOnHand <= 0 ? 'text-red-600 dark:text-red-400' :
                  isLow ? 'text-yellow-600 dark:text-yellow-400' :
                  'text-foreground'
                }`}>
                  {stock.quantityOnHand}
                </span>
                {isLow && (
                  <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30 text-xs">
                    Low
                  </Badge>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

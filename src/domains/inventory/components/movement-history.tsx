'use client'

import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'

interface MovementHistoryProps {
  businessId: Id<"businesses">
  catalogItemId: Id<"catalog_items">
  limit?: number
}

export function MovementHistory({ businessId, catalogItemId, limit = 20 }: MovementHistoryProps) {
  const movements = useQuery(api.functions.inventoryMovements.listByProduct, {
    businessId,
    catalogItemId,
    limit,
  })

  const typeLabel = (type: string) => {
    switch (type) {
      case 'stock_in': return 'Stock In'
      case 'stock_out': return 'Stock Out'
      case 'adjustment': return 'Adjustment'
      case 'transfer': return 'Transfer'
      default: return type
    }
  }

  const typeBadge = (type: string) => {
    switch (type) {
      case 'stock_in':
        return 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30'
      case 'stock_out':
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30'
      case 'adjustment':
        return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30'
      default:
        return 'bg-muted text-muted-foreground border border-border'
    }
  }

  if (movements === undefined) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="animate-pulse space-y-2">
            <div className="bg-muted rounded h-4 w-full" />
            <div className="bg-muted rounded h-4 w-3/4" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (movements.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-4 text-center">
          <p className="text-muted-foreground text-sm">No movement history for this item.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="border-b border-border py-3 px-4">
        <CardTitle className="text-sm text-foreground">Movement History</CardTitle>
      </CardHeader>
      <div className="divide-y divide-border">
        {movements.map((movement: any) => (
          <div key={movement._id} className="px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge className={`${typeBadge(movement.movementType)} text-xs`}>
                {typeLabel(movement.movementType)}
              </Badge>
              <div>
                <p className="text-foreground text-sm">{movement.date}</p>
                {movement.notes && (
                  <p className="text-muted-foreground text-xs">{movement.notes}</p>
                )}
              </div>
            </div>
            <span className={`flex items-center gap-1 text-sm font-medium ${
              movement.quantity > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {movement.quantity > 0 ? (
                <ArrowDownRight className="w-3 h-3" />
              ) : (
                <ArrowUpRight className="w-3 h-3" />
              )}
              {movement.quantity > 0 ? '+' : ''}{movement.quantity}
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

'use client'

import { useState } from 'react'
import { Plus, Package } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatBusinessDate } from '@/lib/utils'
import { useGRNs } from '../hooks/use-grns'
import type { Id } from '../../../../convex/_generated/dataModel'

interface GRNListProps {
  onCreateGRN: () => void
  onSelectGRN?: (grnId: Id<'goods_received_notes'>) => void
}

export default function GRNList({ onCreateGRN, onSelectGRN }: GRNListProps) {
  const { grns, isLoading } = useGRNs()

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="h-5 w-40 bg-muted rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 bg-muted rounded animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Goods Received Notes</h3>
        <button
          onClick={onCreateGRN}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Plus className="h-4 w-4" />
          Create GRN
        </button>
      </div>

      {/* Table */}
      {grns.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <Package className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No goods received notes found</p>
          <button
            onClick={onCreateGRN}
            className="mt-3 text-sm text-primary hover:text-primary/80 font-medium"
          >
            Create your first GRN
          </button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">GRN Number</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Vendor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">PO Number</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Items</th>
                </tr>
              </thead>
              <tbody>
                {grns.map((grn: any) => (
                  <tr
                    key={grn._id}
                    className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => onSelectGRN?.(grn._id)}
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground">{grn.grnNumber}</td>
                    <td className="px-4 py-2.5 text-foreground">{grn.vendorName}</td>
                    <td className="px-4 py-2.5">
                      {grn.poNumber ? (
                        <Badge variant="info">{grn.poNumber}</Badge>
                      ) : (
                        <span className="text-muted-foreground">---</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatBusinessDate(grn.grnDate)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {grn.lineItems?.length ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

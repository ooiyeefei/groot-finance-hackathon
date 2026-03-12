'use client'

import { useState } from 'react'
import { Plus, Search, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import { usePurchaseOrders } from '../hooks/use-purchase-orders'
import type { Id } from '../../../../convex/_generated/dataModel'

interface POListProps {
  onCreatePO: () => void
  onSelectPO: (poId: Id<'purchase_orders'>) => void
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  issued: 'Issued',
  partially_received: 'Partial',
  fully_received: 'Received',
  invoiced: 'Invoiced',
  closed: 'Closed',
  cancelled: 'Cancelled',
}

const STATUS_VARIANTS: Record<string, 'info' | 'warning' | 'success' | 'error' | 'default'> = {
  draft: 'info',
  issued: 'warning',
  partially_received: 'warning',
  fully_received: 'success',
  invoiced: 'success',
  closed: 'default',
  cancelled: 'error',
}

type POStatus = 'draft' | 'issued' | 'partially_received' | 'fully_received' | 'invoiced' | 'closed' | 'cancelled'

export default function POList({ onCreatePO, onSelectPO }: POListProps) {
  const [statusFilter, setStatusFilter] = useState<POStatus | ''>('')
  const [search, setSearch] = useState('')

  const { purchaseOrders, isLoading } = usePurchaseOrders({
    status: statusFilter || undefined,
    search: search || undefined,
  })

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
        <h3 className="text-lg font-semibold text-foreground">Purchase Orders</h3>
        <button
          onClick={onCreatePO}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Plus className="h-4 w-4" />
          Create PO
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search PO number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-input border border-border text-foreground rounded-md pl-9 pr-3 py-2 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as POStatus | '')}
          className="bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {purchaseOrders.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No purchase orders found</p>
          <button
            onClick={onCreatePO}
            className="mt-3 text-sm text-primary hover:text-primary/80 font-medium"
          >
            Create your first PO
          </button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">PO Number</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Vendor</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Total Amount</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Lines</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.map((po: any) => (
                  <tr
                    key={po._id}
                    className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => onSelectPO(po._id)}
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground">{po.poNumber}</td>
                    <td className="px-4 py-2.5 text-foreground">{po.vendorName}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{formatBusinessDate(po.poDate)}</td>
                    <td className="px-4 py-2.5 text-right font-medium text-foreground">
                      {formatCurrency(po.totalAmount, po.currency)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <Badge variant={STATUS_VARIANTS[po.status] ?? 'default'}>
                        {STATUS_LABELS[po.status] ?? po.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">
                      {po.lineItems?.length ?? 0}
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

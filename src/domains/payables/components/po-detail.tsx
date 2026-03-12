'use client'

import { X, ArrowLeft, FileText, Package, Link2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import { usePurchaseOrder, useUpdatePurchaseOrderStatus } from '../hooks/use-purchase-orders'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useState } from 'react'

interface PODetailProps {
  poId: Id<'purchase_orders'>
  onClose: () => void
  onRecordGRN: (poId: Id<'purchase_orders'>) => void
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

export default function PODetail({ poId, onClose, onRecordGRN }: PODetailProps) {
  const { purchaseOrder, isLoading } = usePurchaseOrder(poId)
  const { updateStatus } = useUpdatePurchaseOrderStatus()
  const [isUpdating, setIsUpdating] = useState(false)

  if (isLoading || !purchaseOrder) {
    return (
      <div className="fixed inset-0 z-50">
        <div className="fixed inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)' }} />
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-3xl p-8">
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-6 bg-muted rounded animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const po = purchaseOrder

  const handleStatusChange = async (newStatus: 'issued' | 'cancelled') => {
    setIsUpdating(true)
    try {
      await updateStatus({ poId, status: newStatus })
    } catch (err: unknown) {
      console.error('Status update failed:', err)
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 transition-opacity"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(12px)' }}
        onClick={onClose}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-card rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[96vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h3 className="text-base font-semibold text-foreground">{po.poNumber}</h3>
                <p className="text-xs text-muted-foreground">{(po.vendor as { name?: string } | null)?.name ?? 'Unknown Vendor'}</p>
              </div>
              <Badge variant={STATUS_VARIANTS[po.status] ?? 'default'}>
                {STATUS_LABELS[po.status] ?? po.status}
              </Badge>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {/* PO Info */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted rounded-lg p-3">
              <div>
                <span className="text-xs text-muted-foreground">PO Date</span>
                <p className="text-sm font-medium text-foreground">{formatBusinessDate(po.poDate)}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Delivery Date</span>
                <p className="text-sm font-medium text-foreground">
                  {po.requiredDeliveryDate ? formatBusinessDate(po.requiredDeliveryDate) : '---'}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Currency</span>
                <p className="text-sm font-medium text-foreground">{po.currency}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Total Amount</span>
                <p className="text-sm font-semibold text-foreground">{formatCurrency(po.totalAmount, po.currency)}</p>
              </div>
            </div>

            {/* Line Items */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Line Items
              </h4>
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Item</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Qty</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Received</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Price</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {po.lineItems.map((li: { description: string; itemCode?: string; quantity: number; receivedQuantity?: number; unitPrice: number; totalAmount?: number }, idx: number) => (
                      <tr key={idx} className="border-b border-border">
                        <td className="px-3 py-2">
                          <div className="text-foreground">{li.description}</div>
                          {li.itemCode && <div className="text-xs text-muted-foreground">{li.itemCode}</div>}
                        </td>
                        <td className="px-3 py-2 text-right text-foreground">{li.quantity}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={
                            (li.receivedQuantity ?? 0) >= li.quantity
                              ? 'text-success-foreground'
                              : (li.receivedQuantity ?? 0) > 0
                                ? 'text-warning-foreground'
                                : 'text-muted-foreground'
                          }>
                            {li.receivedQuantity ?? 0}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-foreground">{formatCurrency(li.unitPrice, po.currency)}</td>
                        <td className="px-3 py-2 text-right font-medium text-foreground">
                          {formatCurrency(li.totalAmount ?? li.quantity * li.unitPrice, po.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Linked GRNs */}
            {po.grns && po.grns.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Linked GRNs ({po.grns.length})
                </h4>
                <div className="space-y-1">
                  {po.grns.map((grn: { _id: string; grnNumber: string; grnDate: string }) => (
                    <div key={grn._id} className="flex items-center justify-between bg-muted rounded-md px-3 py-2 text-sm">
                      <span className="font-medium text-foreground">{grn.grnNumber}</span>
                      <span className="text-muted-foreground">{formatBusinessDate(grn.grnDate)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Linked Matches */}
            {po.matches && po.matches.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Linked Matches ({po.matches.length})
                </h4>
                <div className="space-y-1">
                  {po.matches.map((match: { _id: string; matchType: string; status: string }) => (
                    <div key={match._id} className="flex items-center justify-between bg-muted rounded-md px-3 py-2 text-sm">
                      <span className="text-foreground">{match.matchType === 'three_way' ? '3-Way' : '2-Way'} Match</span>
                      <Badge variant={
                        match.status === 'auto_approved' || match.status === 'approved'
                          ? 'success'
                          : match.status === 'disputed'
                            ? 'error'
                            : 'warning'
                      }>
                        {match.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {po.notes && (
              <div>
                <h4 className="text-sm font-semibold text-foreground mb-1">Notes</h4>
                <p className="text-sm text-muted-foreground bg-muted rounded-md p-3">{po.notes}</p>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex gap-3 justify-end p-4 border-t border-border shrink-0">
            {po.status === 'draft' && (
              <button
                onClick={() => handleStatusChange('issued')}
                disabled={isUpdating}
                className="px-4 py-2 rounded-md text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
              >
                Issue PO
              </button>
            )}
            {['issued', 'partially_received'].includes(po.status) && (
              <button
                onClick={() => onRecordGRN(poId)}
                className="px-4 py-2 rounded-md text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Record GRN
              </button>
            )}
            {!['closed', 'cancelled'].includes(po.status) && (
              <button
                onClick={() => handleStatusChange('cancelled')}
                disabled={isUpdating}
                className="px-4 py-2 rounded-md text-sm font-medium bg-destructive hover:bg-destructive/90 text-destructive-foreground disabled:opacity-50"
              >
                Cancel PO
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

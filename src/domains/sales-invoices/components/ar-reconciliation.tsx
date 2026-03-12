'use client'

import { useState, useCallback } from 'react'
import {
  Upload,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileSpreadsheet,
  ArrowRightLeft,
  DollarSign,
  Filter,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { CsvImportModal } from '@/lib/csv-parser/components/csv-import-modal'
import type { CsvImportResult, MappedRow } from '@/lib/csv-parser/types'
import { useActiveBusiness } from '@/contexts/business-context'
import {
  useReconciliationSummary,
  useSalesOrders,
  useReconciliationMutations,
} from '../hooks/use-reconciliation'
import { useSalesInvoices } from '../hooks/use-sales-invoices'
import { formatCurrency } from '@/lib/utils/format-number'
import type { Id } from '../../../../convex/_generated/dataModel'

// Match status badge config
const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  matched: { label: 'Matched', variant: 'default' },
  unmatched: { label: 'Unmatched', variant: 'destructive' },
  variance: { label: 'Variance', variant: 'secondary' },
  partial: { label: 'Partial', variant: 'outline' },
  conflict: { label: 'Conflict', variant: 'destructive' },
}

// Platform detection from file name (simple heuristic)
function detectPlatform(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.includes('shopee')) return 'shopee'
  if (lower.includes('lazada')) return 'lazada'
  if (lower.includes('grab')) return 'grab'
  if (lower.includes('foodpanda')) return 'foodpanda'
  if (lower.includes('tiktok')) return 'tiktok'
  return 'unknown'
}

export default function ARReconciliation() {
  const { businessId } = useActiveBusiness()
  const [csvImportOpen, setCsvImportOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | undefined>()
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  const { summary, isLoading: summaryLoading } = useReconciliationSummary({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  const { orders, isLoading: ordersLoading } = useSalesOrders({
    matchStatus: statusFilter,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  const { invoices } = useSalesInvoices({
    status: undefined,
    limit: 500,
  })

  const { importBatch, runMatching, updateMatchStatus } = useReconciliationMutations()

  const selectedOrder = orders.find((o) => o._id === selectedOrderId)
  const matchedInvoice = selectedOrder?.matchedInvoiceId
    ? invoices.find((inv) => inv._id === selectedOrder.matchedInvoiceId)
    : null

  const handleImportComplete = useCallback(
    async (result: CsvImportResult) => {
      if (!businessId) return
      setIsImporting(true)

      try {
        const batchId = crypto.randomUUID()
        const platform = detectPlatform(result.sourceFileName)

        // Transform MappedRow[] to order objects
        const orderData = result.rows
          .filter((row) => row.orderReference) // Skip rows without order reference
          .map((row: MappedRow) => ({
            orderReference: String(row.orderReference ?? ''),
            orderDate: String(row.orderDate ?? new Date().toISOString().split('T')[0]),
            customerName: row.customerName ? String(row.customerName) : undefined,
            productName: row.productName ? String(row.productName) : undefined,
            productCode: row.productCode ? String(row.productCode) : undefined,
            quantity: row.quantity != null ? Number(row.quantity) : undefined,
            unitPrice: row.unitPrice != null ? Number(row.unitPrice) : undefined,
            grossAmount: Number(row.grossAmount ?? 0),
            platformFee: row.platformFee != null ? Number(row.platformFee) : undefined,
            netAmount: row.netAmount != null ? Number(row.netAmount) : undefined,
            currency: row.currency ? String(row.currency) : 'MYR',
            paymentMethod: row.paymentMethod ? String(row.paymentMethod) : undefined,
          }))

        // Import batch
        const importResult = await importBatch({
          businessId: businessId as Id<"businesses">,
          orders: orderData,
          sourcePlatform: platform,
          sourceFileName: result.sourceFileName,
          importBatchId: batchId,
        })

        // Run matching automatically
        await runMatching({
          businessId: businessId as Id<"businesses">,
          importBatchId: batchId,
        })

        setCsvImportOpen(false)
      } catch (error) {
        console.error('Import failed:', error)
      } finally {
        setIsImporting(false)
      }
    },
    [businessId, importBatch, runMatching]
  )

  const handleManualMatch = useCallback(
    async (orderId: string, invoiceId: string) => {
      try {
        await updateMatchStatus({
          orderId: orderId as Id<"sales_orders">,
          matchedInvoiceId: invoiceId as Id<"sales_invoices">,
          matchStatus: 'matched',
        })
        setSelectedOrderId(null)
      } catch (error) {
        console.error('Manual match failed:', error)
      }
    },
    [updateMatchStatus]
  )

  const handleUnmatch = useCallback(
    async (orderId: string) => {
      try {
        await updateMatchStatus({
          orderId: orderId as Id<"sales_orders">,
          matchStatus: 'unmatched',
        })
        setSelectedOrderId(null)
      } catch (error) {
        console.error('Unmatch failed:', error)
      }
    },
    [updateMatchStatus]
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            AR Reconciliation
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Import sales statements and reconcile against invoices
          </p>
        </div>
        <Button
          onClick={() => setCsvImportOpen(true)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
          disabled={isImporting}
        >
          {isImporting ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          {isImporting ? 'Importing...' : 'Import Sales Statement'}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Orders</span>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {summary.totalOrders}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Matched</span>
            </div>
            <p className="text-2xl font-bold text-emerald-500">
              {summary.matched}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="h-4 w-4 text-destructive" />
              <span className="text-xs text-muted-foreground">Unmatched</span>
            </div>
            <p className="text-2xl font-bold text-destructive">
              {summary.unmatched}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Variance</span>
            </div>
            <p className="text-2xl font-bold text-amber-500">
              {summary.variance}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Gross Total</span>
            </div>
            <p className="text-lg font-bold text-foreground">
              {formatCurrency(summary.totalGrossAmount, 'MYR')}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Platform Fees</span>
            </div>
            <p className="text-lg font-bold text-foreground">
              {formatCurrency(summary.totalPlatformFees, 'MYR')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Filters:</span>
        </div>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          placeholder="From"
          className="w-40 bg-card"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          placeholder="To"
          className="w-40 bg-card"
        />
        <div className="flex gap-1">
          {['all', 'matched', 'unmatched', 'variance', 'conflict'].map((status) => (
            <Button
              key={status}
              variant={statusFilter === (status === 'all' ? undefined : status) ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(status === 'all' ? undefined : status)}
              className="text-xs"
            >
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Orders Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-foreground">
            Imported Sales Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ordersLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12">
              <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">No sales orders imported yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Click &quot;Import Sales Statement&quot; to get started
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 pr-4 text-muted-foreground font-medium">Order Ref</th>
                    <th className="pb-2 pr-4 text-muted-foreground font-medium">Date</th>
                    <th className="pb-2 pr-4 text-muted-foreground font-medium">Product</th>
                    <th className="pb-2 pr-4 text-muted-foreground font-medium">Customer</th>
                    <th className="pb-2 pr-4 text-muted-foreground font-medium text-right">Gross</th>
                    <th className="pb-2 pr-4 text-muted-foreground font-medium text-right">Fee</th>
                    <th className="pb-2 pr-4 text-muted-foreground font-medium text-right">Net</th>
                    <th className="pb-2 pr-4 text-muted-foreground font-medium">Platform</th>
                    <th className="pb-2 text-muted-foreground font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const config = statusConfig[order.matchStatus] ?? statusConfig.unmatched
                    return (
                      <tr
                        key={order._id}
                        className="border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => setSelectedOrderId(order._id)}
                      >
                        <td className="py-2.5 pr-4 font-mono text-xs text-foreground">
                          {order.orderReference}
                        </td>
                        <td className="py-2.5 pr-4 text-foreground">
                          {order.orderDate}
                        </td>
                        <td className="py-2.5 pr-4 text-foreground max-w-[200px] truncate">
                          {order.productName ?? '—'}
                        </td>
                        <td className="py-2.5 pr-4 text-foreground max-w-[150px] truncate">
                          {order.customerName ?? '—'}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono text-foreground">
                          {formatCurrency(order.grossAmount, order.currency)}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono text-muted-foreground">
                          {order.platformFee != null ? formatCurrency(order.platformFee, order.currency) : '—'}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-mono text-foreground">
                          {order.netAmount != null ? formatCurrency(order.netAmount, order.currency) : '—'}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className="text-xs text-muted-foreground capitalize">
                            {order.sourcePlatform ?? '—'}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <Badge variant={config.variant} className="text-xs">
                            {config.label}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* CSV Import Modal */}
      <CsvImportModal
        open={csvImportOpen}
        onOpenChange={setCsvImportOpen}
        schemaType="sales_statement"
        onComplete={handleImportComplete}
        onCancel={() => setCsvImportOpen(false)}
        businessId={businessId ?? undefined}
      />

      {/* Order Detail Sheet */}
      <Sheet
        open={!!selectedOrderId}
        onOpenChange={(open) => !open && setSelectedOrderId(null)}
      >
        <SheetContent className="w-full sm:max-w-lg bg-background border-border">
          <SheetHeader>
            <SheetTitle className="text-foreground">Order Details</SheetTitle>
          </SheetHeader>

          {selectedOrder && (
            <div className="mt-6 space-y-6">
              {/* Order Info */}
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                  Sales Order
                </h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Reference:</span>
                  <span className="text-foreground font-mono">{selectedOrder.orderReference}</span>
                  <span className="text-muted-foreground">Date:</span>
                  <span className="text-foreground">{selectedOrder.orderDate}</span>
                  <span className="text-muted-foreground">Product:</span>
                  <span className="text-foreground">{selectedOrder.productName ?? '—'}</span>
                  <span className="text-muted-foreground">Customer:</span>
                  <span className="text-foreground">{selectedOrder.customerName ?? '—'}</span>
                  <span className="text-muted-foreground">Gross Amount:</span>
                  <span className="text-foreground font-mono">
                    {formatCurrency(selectedOrder.grossAmount, selectedOrder.currency)}
                  </span>
                  <span className="text-muted-foreground">Platform Fee:</span>
                  <span className="text-foreground font-mono">
                    {selectedOrder.platformFee != null
                      ? formatCurrency(selectedOrder.platformFee, selectedOrder.currency)
                      : '—'}
                  </span>
                  <span className="text-muted-foreground">Net Amount:</span>
                  <span className="text-foreground font-mono">
                    {selectedOrder.netAmount != null
                      ? formatCurrency(selectedOrder.netAmount, selectedOrder.currency)
                      : '—'}
                  </span>
                  <span className="text-muted-foreground">Platform:</span>
                  <span className="text-foreground capitalize">{selectedOrder.sourcePlatform ?? '—'}</span>
                  <span className="text-muted-foreground">Status:</span>
                  <Badge variant={statusConfig[selectedOrder.matchStatus]?.variant ?? 'outline'}>
                    {statusConfig[selectedOrder.matchStatus]?.label ?? selectedOrder.matchStatus}
                  </Badge>
                </div>
              </div>

              {/* Matched Invoice Info */}
              {matchedInvoice && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                    Matched Invoice
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">Invoice #:</span>
                    <span className="text-foreground font-mono">{matchedInvoice.invoiceNumber}</span>
                    <span className="text-muted-foreground">Date:</span>
                    <span className="text-foreground">{matchedInvoice.invoiceDate}</span>
                    <span className="text-muted-foreground">Amount:</span>
                    <span className="text-foreground font-mono">
                      {formatCurrency(matchedInvoice.totalAmount, matchedInvoice.currency)}
                    </span>
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="text-foreground">{matchedInvoice.customerSnapshot?.businessName ?? '—'}</span>
                  </div>

                  {selectedOrder.varianceAmount != null && selectedOrder.varianceAmount !== 0 && (
                    <div className="rounded-md bg-muted p-3 mt-2">
                      <p className="text-sm font-medium text-foreground">
                        Variance: {formatCurrency(selectedOrder.varianceAmount, selectedOrder.currency)}
                      </p>
                      {selectedOrder.varianceReason && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {selectedOrder.varianceReason}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t border-border">
                {(selectedOrder.matchStatus === 'matched' || selectedOrder.matchStatus === 'variance') && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUnmatch(selectedOrder._id)}
                  >
                    Unmatch
                  </Button>
                )}

                {(selectedOrder.matchStatus === 'unmatched' || selectedOrder.matchStatus === 'conflict') && (
                  <div className="w-full space-y-2">
                    <p className="text-sm text-muted-foreground">Select an invoice to match:</p>
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {invoices
                        .filter((inv) => inv.status !== 'void' && inv.status !== 'draft')
                        .slice(0, 20)
                        .map((inv) => (
                          <button
                            key={inv._id}
                            className="w-full text-left px-3 py-2 rounded-md hover:bg-muted text-sm transition-colors"
                            onClick={() => handleManualMatch(selectedOrder._id, inv._id)}
                          >
                            <span className="font-mono text-foreground">{inv.invoiceNumber}</span>
                            <span className="text-muted-foreground ml-2">
                              {formatCurrency(inv.totalAmount, inv.currency)} · {inv.invoiceDate}
                            </span>
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

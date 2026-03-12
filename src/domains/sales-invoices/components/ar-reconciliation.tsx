'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  Upload,
  ExternalLink,
  CheckCircle,
  XCircle,
  AlertTriangle,
  FileSpreadsheet,
  ArrowRightLeft,
  DollarSign,
  Filter,
  RefreshCw,
  Download,
  Lock,
  Unlock,
  ChevronDown,
  Columns2,
  Info,
  HelpCircle,
  AlertCircle as AlertCircleIcon,
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { CsvImportModal } from '@/lib/csv-parser/components/csv-import-modal'
import type { CsvImportResult, MappedRow } from '@/lib/csv-parser/types'
import { useActiveBusiness } from '@/contexts/business-context'
import {
  useReconciliationSummary,
  useSalesOrders,
  useReconciliationMutations,
  useExportData,
} from '../hooks/use-reconciliation'
import { useSalesInvoices } from '../hooks/use-sales-invoices'
import { formatCurrency } from '@/lib/utils/format-number'
import { useRouter } from 'next/navigation'
import type { Id } from '../../../../convex/_generated/dataModel'

// Match status badge config
const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; bgColor: string; textColor: string }> = {
  matched: { label: 'Matched', variant: 'default', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-600 dark:text-emerald-400' },
  unmatched: { label: 'Unmatched', variant: 'destructive', bgColor: 'bg-red-500/10', textColor: 'text-red-600 dark:text-red-400' },
  variance: { label: 'Variance', variant: 'secondary', bgColor: 'bg-amber-500/10', textColor: 'text-amber-600 dark:text-amber-400' },
  partial: { label: 'Partial', variant: 'outline', bgColor: 'bg-orange-500/10', textColor: 'text-orange-600 dark:text-orange-400' },
  conflict: { label: 'Conflict', variant: 'destructive', bgColor: 'bg-red-500/10', textColor: 'text-red-600 dark:text-red-400' },
}

// Match method badge config
const methodConfig: Record<string, { label: string; bgColor: string; textColor: string }> = {
  exact_reference: { label: 'exact reference', bgColor: 'bg-blue-500/10', textColor: 'text-blue-600 dark:text-blue-400' },
  fuzzy: { label: 'fuzzy match', bgColor: 'bg-purple-500/10', textColor: 'text-purple-600 dark:text-purple-400' },
  manual: { label: 'manual', bgColor: 'bg-gray-500/10', textColor: 'text-gray-600 dark:text-gray-400' },
  line_item: { label: 'line items', bgColor: 'bg-indigo-500/10', textColor: 'text-indigo-600 dark:text-indigo-400' },
}

// Period presets
const PERIOD_PRESETS = [
  { label: 'Today', getRange: () => { const d = new Date().toISOString().split('T')[0]; return { from: d, to: d } } },
  { label: 'This Week', getRange: () => {
    const now = new Date()
    const start = new Date(now)
    start.setDate(now.getDate() - now.getDay())
    return { from: start.toISOString().split('T')[0], to: now.toISOString().split('T')[0] }
  }},
  { label: 'This Month', getRange: () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: start.toISOString().split('T')[0], to: now.toISOString().split('T')[0] }
  }},
  { label: 'Last Month', getRange: () => {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: start.toISOString().split('T')[0], to: end.toISOString().split('T')[0] }
  }},
]

// Platform detection from file name
function detectPlatform(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.includes('shopee')) return 'shopee'
  if (lower.includes('lazada')) return 'lazada'
  if (lower.includes('grab')) return 'grab'
  if (lower.includes('foodpanda')) return 'foodpanda'
  if (lower.includes('tiktok')) return 'tiktok'
  return 'unknown'
}

// Severity badge for variance items
function VarianceSeverityBadge({ severity }: { severity: string }) {
  const config = {
    error: { label: 'Error', variant: 'destructive' as const },
    warning: { label: 'Warning', variant: 'secondary' as const },
    info: { label: 'Info', variant: 'outline' as const },
  }
  const c = config[severity as keyof typeof config] ?? config.info
  return <Badge variant={c.variant} className="text-[10px] px-1.5 py-0">{c.label}</Badge>
}

export default function ARReconciliation() {
  const { businessId } = useActiveBusiness()
  const router = useRouter()
  const [csvImportOpen, setCsvImportOpen] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<string | undefined>()
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [isClosingPeriod, setIsClosingPeriod] = useState(false)
  const [showPeriodPresets, setShowPeriodPresets] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

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

  const { exportData } = useExportData({
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    matchStatus: statusFilter,
    enabled: isExporting,
  })

  const {
    importBatch,
    runMatching,
    updateMatchStatus,
    reconcileLineItems,
    closePeriod,
    reopenPeriod,
  } = useReconciliationMutations()

  const selectedOrder = orders.find((o) => o._id === selectedOrderId)
  const matchedInvoice = selectedOrder?.matchedInvoiceId
    ? invoices.find((inv) => inv._id === selectedOrder.matchedInvoiceId)
    : null

  // CSV Export handler
  const handleExport = useCallback(() => {
    if (!exportData || exportData.length === 0) return

    const headers = [
      'Order Reference', 'Order Date', 'Customer', 'Product', 'Gross Amount',
      'Platform Fee', 'Net Amount', 'Currency', 'Platform', 'Match Status',
      'Match Method', 'Confidence', 'Matched Invoice #', 'Invoice Amount',
      'Invoice Date', 'Variance Amount', 'Period Status',
    ]

    const rows = exportData.map((o: any) => [
      o.orderReference,
      o.orderDate,
      o.customerName ?? '',
      o.productName ?? '',
      o.grossAmount,
      o.platformFee ?? '',
      o.netAmount ?? '',
      o.currency,
      o.sourcePlatform ?? '',
      o.matchStatus,
      o.matchMethod ?? '',
      o.matchConfidence ?? '',
      o.invoiceNumber ?? '',
      o.invoiceAmount ?? '',
      o.invoiceDate ?? '',
      o.varianceAmount ?? '',
      o.periodStatus ?? 'open',
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((r: any[]) =>
        r.map((v) => {
          const s = String(v)
          return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s
        }).join(',')
      ),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reconciliation-report-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setIsExporting(false)
  }, [exportData])

  // Trigger export data fetch then download
  const triggerExport = useCallback(() => {
    setIsExporting(true)
    // Export will happen via useEffect when exportData is ready
    setTimeout(() => {
      handleExport()
    }, 1000)
  }, [handleExport])

  const handleImportComplete = useCallback(
    async (result: CsvImportResult) => {
      if (!businessId) return
      setIsImporting(true)

      try {
        const batchId = crypto.randomUUID()
        const platform = detectPlatform(result.sourceFileName)

        const orderData = result.rows
          .filter((row) => row.orderReference)
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
            commissionFee: row.commissionFee != null ? Number(row.commissionFee) : undefined,
            shippingFee: row.shippingFee != null ? Number(row.shippingFee) : undefined,
            marketingFee: row.marketingFee != null ? Number(row.marketingFee) : undefined,
            refundAmount: row.refundAmount != null ? Number(row.refundAmount) : undefined,
          }))

        await importBatch({
          businessId: businessId as Id<"businesses">,
          orders: orderData,
          sourcePlatform: platform,
          sourceFileName: result.sourceFileName,
          importBatchId: batchId,
        })

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

  const handleReconcileLineItems = useCallback(
    async (orderId: string) => {
      try {
        await reconcileLineItems({
          orderId: orderId as Id<"sales_orders">,
        })
      } catch (error) {
        console.error('Line item reconciliation failed:', error)
      }
    },
    [reconcileLineItems]
  )

  const handleClosePeriod = useCallback(
    async () => {
      if (!businessId || !dateFrom || !dateTo) return
      setIsClosingPeriod(true)
      try {
        await closePeriod({
          businessId: businessId as Id<"businesses">,
          dateFrom,
          dateTo,
          closedBy: 'user',
        })
      } catch (error) {
        console.error('Close period failed:', error)
      } finally {
        setIsClosingPeriod(false)
      }
    },
    [businessId, dateFrom, dateTo, closePeriod]
  )

  const handleReopenPeriod = useCallback(
    async () => {
      if (!businessId || !dateFrom || !dateTo) return
      try {
        await reopenPeriod({
          businessId: businessId as Id<"businesses">,
          dateFrom,
          dateTo,
        })
      } catch (error) {
        console.error('Reopen period failed:', error)
      }
    },
    [businessId, dateFrom, dateTo, reopenPeriod]
  )

  // Check if any orders in current view are closed
  const hasClosedOrders = useMemo(
    () => orders.some((o) => (o as any).periodStatus === 'closed'),
    [orders]
  )

  return (
    <div className="space-y-6">
      {/* Help Banner */}
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4">
        <div className="flex items-start gap-3">
          <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">
              AR Reconciliation Workflow
            </p>
            <p className="text-blue-700 dark:text-blue-300 mb-2">
              <strong>Import behavior:</strong> New orders are appended. Existing order references are skipped (not replaced).
              To update existing orders, delete them first before re-importing.
            </p>
            <p className="text-blue-700 dark:text-blue-300">
              <strong>Standard workflow:</strong> Import → Review matches → Reconcile line items →
              Close period → Export to accounting system (Xero, QuickBooks, etc.)
            </p>
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            AR Reconciliation
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Import sales statements and reconcile against invoices
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={triggerExport}
            disabled={orders.length === 0}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
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

      {/* Filters + Period Controls */}
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

        {/* Period Presets */}
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPeriodPresets(!showPeriodPresets)}
            className="text-xs"
          >
            Period Presets
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
          {showPeriodPresets && (
            <div className="absolute top-full left-0 mt-1 bg-card border border-border rounded-md shadow-lg z-10 py-1 min-w-[140px]">
              {PERIOD_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  className="w-full text-left px-3 py-1.5 text-sm text-foreground hover:bg-muted transition-colors"
                  onClick={() => {
                    const range = preset.getRange()
                    setDateFrom(range.from)
                    setDateTo(range.to)
                    setShowPeriodPresets(false)
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Status filter pills */}
        <div className="flex gap-1">
          {['all', 'matched', 'unmatched', 'variance', 'partial', 'conflict'].map((status) => (
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

        {/* Period close/reopen */}
        {dateFrom && dateTo && (
          <div className="flex gap-1 ml-auto">
            {hasClosedOrders ? (
              <Button
                variant="outline"
                size="sm"
                onClick={handleReopenPeriod}
                className="text-xs"
              >
                <Unlock className="h-3 w-3 mr-1" />
                Reopen Period
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleClosePeriod}
                disabled={isClosingPeriod || summary.totalOrders === 0}
                className="text-xs"
              >
                {isClosingPeriod ? (
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Lock className="h-3 w-3 mr-1" />
                )}
                Close Period
              </Button>
            )}
          </div>
        )}
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
                    <th className="pb-2 pr-4 text-muted-foreground font-medium">Method</th>
                    <th className="pb-2 text-muted-foreground font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const config = statusConfig[order.matchStatus] ?? statusConfig.unmatched
                    const isClosed = (order as any).periodStatus === 'closed'
                    const lineItemCount = (order as any).lineItems?.length ?? 0
                    return (
                      <tr
                        key={order._id}
                        className={`border-b border-border/50 hover:bg-muted/50 cursor-pointer transition-colors ${isClosed ? 'opacity-60' : ''}`}
                        onClick={() => setSelectedOrderId(order._id)}
                      >
                        <td className="py-2.5 pr-4 font-mono text-xs text-foreground">
                          <div className="flex items-center gap-1">
                            {order.orderReference}
                            {lineItemCount > 1 && (
                              <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded">
                                {lineItemCount} items
                              </span>
                            )}
                            {isClosed && <Lock className="h-3 w-3 text-muted-foreground" />}
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-foreground">
                          {order.orderDate}
                        </td>
                        <td className="py-2.5 pr-4 text-foreground max-w-[200px] truncate">
                          {order.productName ?? (lineItemCount > 0 ? `${lineItemCount} items` : '—')}
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
                        <td className="py-2.5 pr-4">
                          <span className="text-xs text-muted-foreground capitalize">
                            {order.matchMethod ?? '—'}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <Badge className={`text-xs ${config.bgColor} ${config.textColor} border-0`}>
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

      {/* Order Detail Sheet — Side-by-Side Comparison */}
      <Sheet
        open={!!selectedOrderId}
        onOpenChange={(open) => !open && setSelectedOrderId(null)}
      >
        <SheetContent className="w-full sm:max-w-2xl bg-background border-border overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-foreground flex items-center gap-2">
              <Columns2 className="h-5 w-5" />
              Order vs Invoice Comparison
            </SheetTitle>
          </SheetHeader>

          {selectedOrder && (
            <div className="mt-6 space-y-6">
              {/* Side-by-Side Comparison */}
              <div className="grid grid-cols-2 gap-4">
                {/* Left: Sales Order */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    Sales Order
                  </h3>
                  <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground text-xs">Reference</span>
                      <p className="font-mono text-foreground">{selectedOrder.orderReference}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Date</span>
                      <p className="text-foreground">{selectedOrder.orderDate}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Customer</span>
                      <p className="text-foreground">{selectedOrder.customerName ?? '—'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Gross Amount</span>
                      <p className="font-mono text-foreground font-medium">
                        {formatCurrency(selectedOrder.grossAmount, selectedOrder.currency)}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Platform Fee</span>
                      <p className="font-mono text-foreground">
                        {selectedOrder.platformFee != null
                          ? formatCurrency(selectedOrder.platformFee, selectedOrder.currency)
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs">Net Amount</span>
                      <p className="font-mono text-foreground">
                        {selectedOrder.netAmount != null
                          ? formatCurrency(selectedOrder.netAmount, selectedOrder.currency)
                          : '—'}
                      </p>
                    </div>
                    {selectedOrder.matchConfidence != null && (
                      <div>
                        <span className="text-muted-foreground text-xs">Confidence</span>
                        <p className="text-foreground">{(selectedOrder.matchConfidence * 100).toFixed(0)}%</p>
                      </div>
                    )}
                  </div>

                  {/* Fee Breakdown */}
                  {(selectedOrder as any).feeBreakdown && (
                    <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                      <span className="text-muted-foreground text-xs font-medium">Fee Breakdown</span>
                      {Object.entries((selectedOrder as any).feeBreakdown).map(([key, val]) => {
                        if (!val || val === 0) return null
                        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s: string) => s.toUpperCase())
                        return (
                          <div key={key} className="flex justify-between">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="font-mono text-foreground">
                              {formatCurrency(val as number, selectedOrder.currency)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Order Line Items */}
                  {(selectedOrder as any).lineItems && (selectedOrder as any).lineItems.length > 0 && (
                    <div className="bg-muted/30 rounded-lg p-3 space-y-2">
                      <span className="text-muted-foreground text-xs font-medium">
                        Line Items ({(selectedOrder as any).lineItems.length})
                      </span>
                      {(selectedOrder as any).lineItems.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-xs border-b border-border/30 pb-1">
                          <div>
                            <p className="text-foreground">{item.productName ?? item.description ?? `Item ${idx + 1}`}</p>
                            <p className="text-muted-foreground">Qty: {item.quantity} × {formatCurrency(item.unitPrice, selectedOrder.currency)}</p>
                          </div>
                          <span className="font-mono text-foreground">{formatCurrency(item.totalAmount, selectedOrder.currency)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right: Matched Invoice */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5" />
                    Matched Invoice
                  </h3>
                  {matchedInvoice ? (
                    <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-sm relative">
                      {/* Open Invoice Link */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 right-2 h-7 w-7 p-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          router.push(`/en/invoices/${matchedInvoice._id}`)
                        }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <div>
                        <span className="text-muted-foreground text-xs">Invoice # (click icon to open)</span>
                        <p className="font-mono text-foreground">{matchedInvoice.invoiceNumber}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Date</span>
                        <p className="text-foreground">{matchedInvoice.invoiceDate}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Customer</span>
                        <p className="text-foreground">{matchedInvoice.customerSnapshot?.businessName ?? '—'}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Total Amount</span>
                        <p className="font-mono text-foreground font-medium">
                          {formatCurrency(matchedInvoice.totalAmount, matchedInvoice.currency)}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Status</span>
                        <p className="text-foreground capitalize">{matchedInvoice.status}</p>
                      </div>

                      {/* Invoice Line Items */}
                      {matchedInvoice.lineItems && matchedInvoice.lineItems.length > 0 && (
                        <div className="pt-2 space-y-2">
                          <span className="text-muted-foreground text-xs font-medium">
                            Line Items ({matchedInvoice.lineItems.length})
                          </span>
                          {matchedInvoice.lineItems.map((item: any, idx: number) => (
                            <div key={idx} className="flex justify-between text-xs border-b border-border/30 pb-1">
                              <div>
                                <p className="text-foreground">{item.description ?? `Item ${idx + 1}`}</p>
                                <p className="text-muted-foreground">Qty: {item.quantity} × {formatCurrency(item.unitPrice, matchedInvoice.currency)}</p>
                              </div>
                              <span className="font-mono text-foreground">{formatCurrency(item.totalAmount, matchedInvoice.currency)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-muted/30 rounded-lg p-6 text-center">
                      <XCircle className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">No matched invoice</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Structured Variance Details */}
              {(selectedOrder as any).matchVariances && (selectedOrder as any).matchVariances.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Variance Details
                  </h3>
                  <div className="bg-muted/30 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="px-3 py-2 text-left text-muted-foreground font-medium">Field</th>
                          <th className="px-3 py-2 text-right text-muted-foreground font-medium">Order</th>
                          <th className="px-3 py-2 text-right text-muted-foreground font-medium">Invoice</th>
                          <th className="px-3 py-2 text-right text-muted-foreground font-medium">Diff</th>
                          <th className="px-3 py-2 text-center text-muted-foreground font-medium">Severity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedOrder as any).matchVariances.map((v: any, idx: number) => (
                          <tr key={idx} className="border-b border-border/30">
                            <td className="px-3 py-2 text-foreground">{v.field}</td>
                            <td className="px-3 py-2 text-right font-mono text-foreground">{v.orderValue}</td>
                            <td className="px-3 py-2 text-right font-mono text-foreground">{v.invoiceValue}</td>
                            <td className="px-3 py-2 text-right font-mono text-foreground">
                              {v.difference != null ? (v.difference > 0 ? '+' : '') + v.difference.toFixed(2) : '—'}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <VarianceSeverityBadge severity={v.severity} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Summary variance (fallback for orders without structured variances) */}
              {selectedOrder.varianceAmount != null && selectedOrder.varianceAmount !== 0 &&
                !((selectedOrder as any).matchVariances?.length > 0) && (
                <div className="rounded-md bg-muted p-3">
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

              {/* Actions */}
              <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
                <Badge className={`text-xs ${statusConfig[selectedOrder.matchStatus]?.bgColor ?? 'bg-muted'} ${statusConfig[selectedOrder.matchStatus]?.textColor ?? 'text-foreground'} border-0`}>
                  {statusConfig[selectedOrder.matchStatus]?.label ?? selectedOrder.matchStatus}
                </Badge>
                {selectedOrder.matchMethod && (
                  <Badge className={`text-xs ${methodConfig[selectedOrder.matchMethod]?.bgColor ?? 'bg-muted'} ${methodConfig[selectedOrder.matchMethod]?.textColor ?? 'text-muted-foreground'} border-0`}>
                    via {methodConfig[selectedOrder.matchMethod]?.label ?? selectedOrder.matchMethod}
                  </Badge>
                )}

                <div className="flex-1" />

                {/* Reconcile line items button (when matched and has line items) */}
                {selectedOrder.matchedInvoiceId && (selectedOrder as any).lineItems?.length > 0 && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => handleReconcileLineItems(selectedOrder._id)}
                          className="text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                          <Columns2 className="h-3 w-3 mr-1" />
                          Reconcile Line Items
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <div className="space-y-1">
                          <p className="font-medium">Deep line-by-line comparison</p>
                          <p className="text-xs">
                            Compares quantity, unit price, and total for each product.
                            May change status to &quot;partial&quot; if discrepancies are found (e.g., missing items, quantity mismatches).
                          </p>
                          <p className="text-xs text-amber-400 flex items-center gap-1 mt-2">
                            <AlertCircleIcon className="h-3 w-3" />
                            This provides more accurate reconciliation than header-level matching
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}

                {(selectedOrder.matchStatus === 'matched' || selectedOrder.matchStatus === 'variance') && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleUnmatch(selectedOrder._id)}
                    className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  >
                    Unmatch
                  </Button>
                )}
              </div>

              {/* Manual Match (for unmatched/conflict orders) */}
              {(selectedOrder.matchStatus === 'unmatched' || selectedOrder.matchStatus === 'conflict') && (
                <div className="space-y-3 pt-4 border-t border-border">
                  <p className="text-sm font-medium text-foreground">Select an invoice to match:</p>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {invoices
                      .filter((inv) => inv.status !== 'void' && inv.status !== 'draft')
                      .slice(0, 20)
                      .map((inv) => (
                        <Button
                          key={inv._id}
                          variant="outline"
                          className="w-full justify-start h-auto py-3 px-4 hover:bg-primary/10 hover:border-primary/50"
                          onClick={() => handleManualMatch(selectedOrder._id, inv._id)}
                        >
                          <div className="flex flex-col items-start text-left w-full">
                            <span className="font-mono text-sm font-medium text-foreground">{inv.invoiceNumber}</span>
                            <span className="text-xs text-muted-foreground mt-0.5">
                              {formatCurrency(inv.totalAmount, inv.currency)} · {inv.invoiceDate}
                            </span>
                          </div>
                        </Button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

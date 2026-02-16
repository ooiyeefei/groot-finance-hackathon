'use client'

import React, { useState, useCallback } from 'react'
import Link from 'next/link'
import { useLocale } from 'next-intl'
import {
  Plus,
  FileText,
  Eye,
  Pencil,
  Send,
  CreditCard,
  Ban,
  Trash2,
  Loader2,
  Filter,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import { useConvex } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness, useBusinessProfile } from '@/contexts/business-context'
import { useSalesInvoices, useSalesInvoiceMutations } from '../hooks/use-sales-invoices'
import { InvoiceStatusBadge } from './invoice-status-badge'
import type { SalesInvoice, SalesInvoiceStatus } from '../types'
import { SALES_INVOICE_STATUSES } from '../types'

// ---------------------------------------------------------------------------
// Filter tab definitions
// ---------------------------------------------------------------------------

type FilterTab = 'all' | SalesInvoiceStatus

interface TabDefinition {
  key: FilterTab
  label: string
}

const FILTER_TABS: TabDefinition[] = [
  { key: 'all', label: 'All' },
  { key: SALES_INVOICE_STATUSES.DRAFT, label: 'Draft' },
  { key: SALES_INVOICE_STATUSES.SENT, label: 'Sent' },
  { key: SALES_INVOICE_STATUSES.OVERDUE, label: 'Overdue' },
  { key: SALES_INVOICE_STATUSES.PAID, label: 'Paid' },
  { key: SALES_INVOICE_STATUSES.VOID, label: 'Void' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SalesInvoiceList() {
  const locale = useLocale()
  const { business } = useActiveBusiness()
  const { profile: businessProfile } = useBusinessProfile()
  const [activeTab, setActiveTab] = useState<FilterTab>('all')

  const statusFilter = activeTab === 'all' ? undefined : activeTab
  const { invoices, summary, isLoading, totalCount } = useSalesInvoices({
    status: statusFilter,
  })
  const convex = useConvex()
  const { sendInvoice, voidInvoice, removeInvoice } = useSalesInvoiceMutations()

  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set())
  const [voidingIds, setVoidingIds] = useState<Set<string>>(new Set())
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleSend = useCallback(
    async (invoice: SalesInvoice) => {
      const id = invoice._id
      setSendingIds((prev) => new Set(prev).add(id))
      try {
        await sendInvoice({ id, businessId: invoice.businessId })

        // Send email to customer
        try {
          const businessName = businessProfile?.name || business?.businessName || 'Our Company'

          // Resolve stored PDF URL if available
          let pdfPayload: Record<string, unknown> = {}
          if (invoice.pdfStorageId) {
            try {
              const pdfUrl = await convex.query(api.functions.salesInvoices.getPdfUrl, {
                id: invoice._id as string,
                businessId: invoice.businessId as Id<"businesses">,
              })
              if (pdfUrl) pdfPayload = { pdfUrl }
            } catch {
              console.error('Failed to resolve PDF URL')
            }
          }

          await fetch(`/api/v1/sales-invoices/${id}/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: invoice.customerSnapshot.email,
              recipientName: invoice.customerSnapshot.contactPerson || invoice.customerSnapshot.businessName,
              invoiceNumber: invoice.invoiceNumber,
              invoiceDate: invoice.invoiceDate,
              dueDate: invoice.dueDate,
              totalAmount: invoice.totalAmount,
              currency: invoice.currency,
              balanceDue: invoice.balanceDue,
              subtotal: invoice.subtotal,
              totalTax: invoice.totalTax,
              paymentInstructions: invoice.paymentInstructions,
              businessName,
              businessAddress: businessProfile?.address || undefined,
              businessPhone: businessProfile?.contact_phone || undefined,
              businessEmail: businessProfile?.contact_email || undefined,
              lineItems: invoice.lineItems?.map((item: { itemCode?: string; description: string; quantity: number; unitPrice: number; totalAmount: number }) => ({
                itemCode: item.itemCode,
                description: item.description,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                amount: item.totalAmount,
              })),
              ...pdfPayload,
              ...((business as unknown as Record<string, unknown>)?.invoiceSettings as Record<string, unknown> | undefined)?.bccOutgoingEmails
                ? { bccEmail: businessProfile?.contact_email || (business as unknown as Record<string, unknown>)?.contactEmail as string }
                : {},
            }),
          })
        } catch (emailError) {
          console.error('Failed to send invoice email:', emailError)
        }
      } finally {
        setSendingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    },
    [sendInvoice, business, businessProfile, convex],
  )

  const handleVoid = useCallback(
    async (invoice: SalesInvoice) => {
      const id = invoice._id
      setVoidingIds((prev) => new Set(prev).add(id))
      try {
        await voidInvoice({ id, businessId: invoice.businessId })
      } finally {
        setVoidingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    },
    [voidInvoice],
  )

  const handleDeleteConfirm = useCallback(
    async (invoice: SalesInvoice) => {
      const id = invoice._id
      setDeletingIds((prev) => new Set(prev).add(id))
      try {
        await removeInvoice({ id, businessId: invoice.businessId })
      } finally {
        setConfirmDeleteId(null)
        setDeletingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    },
    [removeInvoice],
  )

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const isDraft = (status: SalesInvoiceStatus) =>
    status === SALES_INVOICE_STATUSES.DRAFT

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* ----------------------------------------------------------------- */}
      {/* Header + Create button                                            */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">
            Sales Invoices
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalCount} invoice{totalCount !== 1 ? 's' : ''} total
          </p>
        </div>

        <Link href={`/${locale}/sales-invoices/create`}>
          <Button variant="primary" size="default">
            <Plus className="h-4 w-4 mr-1.5" />
            New Invoice
          </Button>
        </Link>
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Summary cards                                                     */}
      {/* ----------------------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <SummaryCard
          label="Draft"
          value={summary.totalDraft}
          colorClass="text-blue-600 dark:text-blue-400"
        />
        <SummaryCard
          label="Sent"
          value={summary.totalSent}
          colorClass="text-purple-600 dark:text-purple-400"
        />
        <SummaryCard
          label="Overdue"
          value={summary.totalOverdue}
          colorClass="text-red-600 dark:text-red-400"
        />
        <SummaryCard
          label="Paid"
          value={summary.totalPaid}
          colorClass="text-green-600 dark:text-green-400"
        />
        <SummaryCard
          label="Outstanding"
          value={formatCurrency(summary.totalOutstanding)}
          colorClass="text-foreground"
          isCurrency
        />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Filter tabs                                                       */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border pb-px">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`
              px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors rounded-t-md
              ${
                activeTab === tab.key
                  ? 'text-primary border-b-2 border-primary bg-primary/5'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Invoice table                                                     */}
      {/* ----------------------------------------------------------------- */}
      {invoices.length === 0 ? (
        <EmptyState activeTab={activeTab} locale={locale} />
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Invoice #
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Customer
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Date
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Due Date
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((invoice) => (
                  <React.Fragment key={invoice._id}>
                  <tr
                    className="hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {invoice.invoiceNumber}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      <div className="truncate max-w-[200px]">
                        {invoice.customerSnapshot.businessName}
                      </div>
                      {invoice.customerSnapshot.email && (
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">
                          {invoice.customerSnapshot.email}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatBusinessDate(invoice.invoiceDate)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatBusinessDate(invoice.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {formatCurrency(invoice.totalAmount, invoice.currency)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <InvoiceStatusBadge status={invoice.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {/* View */}
                        <Link
                          href={`/${locale}/sales-invoices/${invoice._id}`}
                        >
                          <Button variant="ghost" size="sm" title="View" className="text-green-600 hover:text-green-700 hover:bg-green-600/10">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>

                        {/* Edit (draft only) */}
                        {isDraft(invoice.status) && (
                          <Link
                            href={`/${locale}/sales-invoices/${invoice._id}/edit`}
                          >
                            <Button variant="ghost" size="sm" title="Edit">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </Link>
                        )}

                        {/* Send (draft only) */}
                        {isDraft(invoice.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Send"
                            disabled={sendingIds.has(invoice._id)}
                            onClick={() => handleSend(invoice)}
                          >
                            {sendingIds.has(invoice._id) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4" />
                            )}
                          </Button>
                        )}

                        {/* Record Payment */}
                        {invoice.status !== SALES_INVOICE_STATUSES.PAID &&
                          invoice.status !== SALES_INVOICE_STATUSES.VOID && (
                            <Link
                              href={`/${locale}/sales-invoices/${invoice._id}/payment`}
                            >
                              <Button
                                variant="ghost"
                                size="sm"
                                title="Record Payment"
                                className="text-blue-600 hover:text-blue-700 hover:bg-blue-600/10"
                              >
                                <CreditCard className="h-4 w-4" />
                              </Button>
                            </Link>
                          )}

                        {/* Void */}
                        {invoice.status !== SALES_INVOICE_STATUSES.VOID &&
                          invoice.status !== SALES_INVOICE_STATUSES.PAID && (
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Void"
                              disabled={voidingIds.has(invoice._id)}
                              onClick={() => handleVoid(invoice)}
                            >
                              {voidingIds.has(invoice._id) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Ban className="h-4 w-4 text-destructive" />
                              )}
                            </Button>
                          )}

                        {/* Delete (draft only) */}
                        {isDraft(invoice.status) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Delete draft"
                            disabled={deletingIds.has(invoice._id)}
                            onClick={() => setConfirmDeleteId(invoice._id)}
                          >
                            {deletingIds.has(invoice._id) ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-destructive" />
                            )}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {/* Inline delete confirmation */}
                  {confirmDeleteId === invoice._id && (
                    <tr>
                      <td colSpan={7} className="px-4 py-3 bg-destructive/5 border-b border-destructive/20">
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-foreground">
                            Delete <span className="font-medium">{invoice.invoiceNumber}</span>? This draft will be permanently removed.
                          </p>
                          <div className="flex items-center gap-2 shrink-0 ml-4">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfirmDeleteId(null)}
                              className="text-xs"
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              disabled={deletingIds.has(invoice._id)}
                              onClick={() => handleDeleteConfirm(invoice)}
                              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs"
                            >
                              {deletingIds.has(invoice._id) ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5 mr-1" />
                              )}
                              Delete
                            </Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-border">
            {invoices.map((invoice) => (
              <div
                key={invoice._id}
                className="p-4 space-y-3 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-foreground">
                      {invoice.invoiceNumber}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {invoice.customerSnapshot.businessName}
                    </p>
                  </div>
                  <InvoiceStatusBadge status={invoice.status} />
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {formatBusinessDate(invoice.invoiceDate)} &mdash;{' '}
                    {formatBusinessDate(invoice.dueDate)}
                  </span>
                  <span className="font-medium text-foreground">
                    {formatCurrency(invoice.totalAmount, invoice.currency)}
                  </span>
                </div>

                <div className="flex items-center gap-1 pt-1">
                  <Link href={`/${locale}/sales-invoices/${invoice._id}`}>
                    <Button variant="ghost" size="sm" className="text-green-600 hover:text-green-700 hover:bg-green-600/10">
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </Link>

                  {isDraft(invoice.status) && (
                    <Link
                      href={`/${locale}/sales-invoices/${invoice._id}/edit`}
                    >
                      <Button variant="ghost" size="sm">
                        <Pencil className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    </Link>
                  )}

                  {isDraft(invoice.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={sendingIds.has(invoice._id)}
                      onClick={() => handleSend(invoice)}
                    >
                      {sendingIds.has(invoice._id) ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-1" />
                      )}
                      Send
                    </Button>
                  )}

                  {invoice.status !== SALES_INVOICE_STATUSES.PAID &&
                    invoice.status !== SALES_INVOICE_STATUSES.VOID && (
                      <Link
                        href={`/${locale}/sales-invoices/${invoice._id}/payment`}
                      >
                        <Button variant="ghost" size="sm" className="text-blue-600 hover:text-blue-700 hover:bg-blue-600/10">
                          <CreditCard className="h-4 w-4 mr-1" />
                          Pay
                        </Button>
                      </Link>
                    )}

                  {invoice.status !== SALES_INVOICE_STATUSES.VOID &&
                    invoice.status !== SALES_INVOICE_STATUSES.PAID && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={voidingIds.has(invoice._id)}
                        onClick={() => handleVoid(invoice)}
                      >
                        {voidingIds.has(invoice._id) ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Ban className="h-4 w-4 mr-1 text-destructive" />
                        )}
                        Void
                      </Button>
                    )}

                  {isDraft(invoice.status) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={deletingIds.has(invoice._id)}
                      onClick={() => setConfirmDeleteId(invoice._id)}
                    >
                      {deletingIds.has(invoice._id) ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-1 text-destructive" />
                      )}
                      Delete
                    </Button>
                  )}
                </div>

                {/* Inline delete confirmation */}
                {confirmDeleteId === invoice._id && (
                  <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 space-y-2">
                    <p className="text-sm text-foreground">
                      Delete <span className="font-medium">{invoice.invoiceNumber}</span>? This draft will be permanently removed.
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs"
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={deletingIds.has(invoice._id)}
                        onClick={() => handleDeleteConfirm(invoice)}
                        className="bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs"
                      >
                        {deletingIds.has(invoice._id) ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                        )}
                        Delete
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  colorClass,
  isCurrency = false,
}: {
  label: string
  value: number | string
  colorClass: string
  isCurrency?: boolean
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {label}
        </p>
        <p className={`mt-1 text-2xl font-semibold ${colorClass}`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
      </CardContent>
    </Card>
  )
}

function EmptyState({
  activeTab,
  locale,
}: {
  activeTab: FilterTab
  locale: string
}) {
  return (
    <div className="text-center py-16">
      <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
      <p className="text-muted-foreground">
        {activeTab === 'all'
          ? 'No invoices yet. Create your first invoice to get started.'
          : `No ${activeTab} invoices found.`}
      </p>
      {activeTab === 'all' && (
        <Link href={`/${locale}/sales-invoices/create`} className="mt-4 inline-block">
          <Button variant="primary" size="default">
            <Plus className="h-4 w-4 mr-1.5" />
            Create Invoice
          </Button>
        </Link>
      )}
    </div>
  )
}

'use client'

import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

/**
 * Hook for sales invoice list queries and mutations
 */
export function useSalesInvoices(options?: {
  status?: string
  customerId?: string
  dateFrom?: string
  dateTo?: string
  sortBy?: 'date' | 'amount' | 'status' | 'dueDate'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  cursor?: string
}) {
  const { businessId } = useActiveBusiness()

  const result = useQuery(
    api.functions.salesInvoices.list,
    businessId
      ? {
          businessId: businessId as Id<"businesses">,
          status: options?.status,
          customerId: options?.customerId,
          dateFrom: options?.dateFrom,
          dateTo: options?.dateTo,
          sortBy: options?.sortBy,
          sortOrder: options?.sortOrder,
          limit: options?.limit,
          cursor: options?.cursor,
        }
      : "skip"
  )

  return {
    invoices: result?.invoices ?? [],
    nextCursor: result?.nextCursor ?? null,
    totalCount: result?.totalCount ?? 0,
    summary: result?.summary ?? {
      totalDraft: 0,
      totalSent: 0,
      totalOverdue: 0,
      totalPaid: 0,
      totalOutstanding: 0,
    },
    isLoading: result === undefined,
  }
}

/**
 * Hook for a single sales invoice
 */
export function useSalesInvoice(invoiceId: string | undefined) {
  const { businessId } = useActiveBusiness()

  const invoice = useQuery(
    api.functions.salesInvoices.getById,
    invoiceId && businessId
      ? {
          id: invoiceId,
          businessId: businessId as Id<"businesses">,
        }
      : "skip"
  )

  return {
    invoice: invoice ?? null,
    isLoading: invoice === undefined,
  }
}

/**
 * Hook for the next invoice number preview
 */
export function useNextInvoiceNumber() {
  const { businessId } = useActiveBusiness()

  const number = useQuery(
    api.functions.salesInvoices.getNextInvoiceNumber,
    businessId
      ? { businessId: businessId as Id<"businesses"> }
      : "skip"
  )

  return number ?? null
}

/**
 * Hook for sales invoice mutations
 */
export function useSalesInvoiceMutations() {
  const createInvoice = useMutation(api.functions.salesInvoices.create)
  const updateInvoice = useMutation(api.functions.salesInvoices.update)
  const sendInvoice = useMutation(api.functions.salesInvoices.send)
  const recordPayment = useMutation(api.functions.payments.recordPayment)
  const voidInvoice = useMutation(api.functions.salesInvoices.voidInvoice)
  const removeInvoice = useMutation(api.functions.salesInvoices.remove)

  return {
    createInvoice,
    updateInvoice,
    sendInvoice,
    recordPayment,
    voidInvoice,
    removeInvoice,
  }
}

/**
 * Hook for payment history by invoice
 */
export function usePaymentsByInvoice(invoiceId: string | undefined) {
  const { businessId } = useActiveBusiness()

  const result = useQuery(
    api.functions.payments.listByInvoice,
    invoiceId && businessId
      ? {
          businessId: businessId as Id<"businesses">,
          invoiceId: invoiceId as Id<"sales_invoices">,
        }
      : "skip"
  )

  return {
    payments: result?.payments ?? [],
    isLoading: result === undefined,
  }
}

/**
 * Hook for payment history by customer
 */
export function usePaymentsByCustomer(
  customerId: string | undefined,
  dateFrom?: string,
  dateTo?: string
) {
  const { businessId } = useActiveBusiness()

  const result = useQuery(
    api.functions.payments.listByCustomer,
    customerId && businessId
      ? {
          businessId: businessId as Id<"businesses">,
          customerId: customerId as Id<"customers">,
          dateFrom,
          dateTo,
        }
      : "skip"
  )

  return {
    payments: result?.payments ?? [],
    totalPaid: result?.totalPaid ?? 0,
    totalReversed: result?.totalReversed ?? 0,
    isLoading: result === undefined,
  }
}

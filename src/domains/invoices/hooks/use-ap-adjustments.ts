'use client'

/**
 * 032-credit-debit-note: Hooks for AP credit/debit note operations
 */

import { useQuery, useMutation } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'

export function useAPAdjustments(invoiceId: string | undefined) {
  const { businessId } = useActiveBusiness()

  const result = useQuery(
    api.functions.invoices.getAPAdjustmentsForInvoice,
    invoiceId && businessId
      ? {
          invoiceId: invoiceId as Id<"invoices">,
          businessId: businessId as Id<"businesses">,
        }
      : "skip"
  )

  return {
    adjustments: result ?? [],
    isLoading: result === undefined,
  }
}

export function useNetPayableAmount(invoiceId: string | undefined) {
  const result = useQuery(
    api.functions.invoices.getNetPayableAmount,
    invoiceId
      ? { invoiceId: invoiceId as Id<"invoices"> }
      : "skip"
  )

  return result ?? null
}

export function useAPCreditNoteMutation() {
  const createCreditNote = useMutation(api.functions.invoices.createAPCreditNote)
  return { createCreditNote }
}

export function useAPDebitNoteMutation() {
  const createDebitNote = useMutation(api.functions.invoices.createAPDebitNote)
  return { createDebitNote }
}

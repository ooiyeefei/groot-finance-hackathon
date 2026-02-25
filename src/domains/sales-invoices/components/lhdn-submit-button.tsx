'use client'

import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useActiveBusiness } from '@/contexts/business-context'
import { useToast } from '@/components/ui/toast'
import type { SalesInvoice } from '../types'

interface LhdnSubmitButtonProps {
  invoice: SalesInvoice
}

export function LhdnSubmitButton({ invoice }: LhdnSubmitButtonProps) {
  const { businessId } = useActiveBusiness()
  const { addToast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showTinConfirm, setShowTinConfirm] = useState(false)

  // Visibility: only for "sent"/"paid"/"overdue" invoices that haven't been submitted yet, or "invalid" for resubmit
  const isEligible =
    (invoice.status === 'sent' || invoice.status === 'paid' || invoice.status === 'overdue' || invoice.status === 'partially_paid') &&
    (invoice.lhdnStatus === undefined || invoice.lhdnStatus === 'invalid')

  if (!isEligible) return null

  const handleSubmit = async (useGeneralBuyerTin = false) => {
    if (!businessId) {
      addToast({ type: 'error', title: 'No active business selected' })
      return
    }

    setIsSubmitting(true)
    setShowTinConfirm(false)

    try {
      const response = await fetch(
        `/api/v1/sales-invoices/${invoice._id}/lhdn/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessId,
            useGeneralBuyerTin,
          }),
        }
      )

      const data = await response.json()

      if (!response.ok) {
        if (data.error === 'BUYER_TIN_MISSING') {
          setShowTinConfirm(true)
          setIsSubmitting(false)
          return
        }
        throw new Error(data.error || 'Submission failed')
      }

      addToast({
        type: 'success',
        title: 'Invoice submitted to LHDN for validation',
      })
    } catch (error) {
      addToast({
        type: 'error',
        title: error instanceof Error ? error.message : 'Failed to submit to LHDN',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (showTinConfirm) {
    return (
      <div className="space-y-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3">
        <p className="text-sm text-foreground">
          The buyer does not have a TIN on file. Submit using the general public
          TIN (EI00000000000)?
        </p>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={() => handleSubmit(true)}
            disabled={isSubmitting}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Yes, Submit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowTinConfirm(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Button
      size="sm"
      onClick={() => handleSubmit(false)}
      disabled={isSubmitting}
      className="bg-primary hover:bg-primary/90 text-primary-foreground"
    >
      {isSubmitting ? (
        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
      ) : (
        <Send className="h-4 w-4 mr-1" />
      )}
      {invoice.lhdnStatus === 'invalid' ? 'Resubmit to LHDN' : 'Submit to LHDN'}
    </Button>
  )
}

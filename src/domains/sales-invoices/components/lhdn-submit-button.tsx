'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLocale } from 'next-intl'
import { Loader2, Send, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { useActiveBusiness } from '@/contexts/business-context'
import { useSalesInvoiceMutations } from '../hooks/use-sales-invoices'
import type { SalesInvoice } from '../types'
import type { Id } from '../../../../convex/_generated/dataModel'

interface LhdnSubmitButtonProps {
  invoice: SalesInvoice
}

export function LhdnSubmitButton({ invoice }: LhdnSubmitButtonProps) {
  const locale = useLocale()
  const { businessId, isOwner, role } = useActiveBusiness()
  const { addToast } = useToast()
  const { submitToLhdn, resubmitToLhdn } = useSalesInvoiceMutations()

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [useGeneralTin, setUseGeneralTin] = useState(false)

  // Visibility: only for "sent" invoices that haven't been submitted yet, or "invalid" for resubmit
  const isResubmit = invoice.lhdnStatus === 'invalid'
  const isEligible =
    invoice.status === 'sent' &&
    (invoice.lhdnStatus === undefined || invoice.lhdnStatus === 'invalid')

  if (!isEligible) return null

  // Role gate: owner or finance_admin only (using business context for reliable role data)
  if (!isOwner && role !== 'finance_admin') return null

  // Pre-flight: check business LHDN config
  // We check the invoice's business fields — these come from the Convex document
  // Since we don't have direct access to the business doc here, we rely on the server mutation to validate
  // But we can check customerSnapshot.tin for the TIN warning
  const customerTinMissing = !invoice.customerSnapshot.tin

  const handleSubmit = async () => {
    if (!businessId) return

    setIsSubmitting(true)
    try {
      if (isResubmit) {
        await resubmitToLhdn({
          invoiceId: invoice._id,
          businessId: businessId as Id<'businesses'>,
        })
      } else {
        await submitToLhdn({
          invoiceId: invoice._id,
          businessId: businessId as Id<'businesses'>,
          useGeneralTin: useGeneralTin || undefined,
        })
      }
      addToast({
        type: 'success',
        title: isResubmit ? 'Resubmitted to LHDN' : 'Submitted to LHDN',
        description: 'Invoice has been queued for LHDN e-Invoice processing.',
      })
      setShowConfirm(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Submission failed'
      addToast({
        type: 'error',
        title: 'LHDN Submission Failed',
        description: message,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  if (showConfirm) {
    return (
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm text-foreground font-medium">
            {isResubmit
              ? 'Resubmit this invoice to LHDN MyInvois?'
              : 'Submit this invoice to LHDN MyInvois?'}
          </p>
          <p className="text-sm text-muted-foreground">
            {isResubmit
              ? 'This will clear previous validation errors and resubmit the invoice for LHDN e-Invoice processing.'
              : 'This will submit the invoice for LHDN e-Invoice processing. The status will be set to "pending" while awaiting validation.'}
          </p>

          {customerTinMissing && !useGeneralTin && (
            <div className="bg-yellow-500/5 border border-yellow-500/30 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm text-foreground font-medium">Customer TIN missing</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    The customer does not have a Tax Identification Number (TIN) on file.
                    You can proceed using the general public TIN (EI00000000000) or update the customer record first.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 ml-6">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setUseGeneralTin(true)}
                  className="text-xs"
                >
                  Use General TIN
                </Button>
                <Link href={`/${locale}/sales-invoices/settings`}>
                  <Button size="sm" variant="ghost" className="text-xs">
                    Update Customer
                  </Button>
                </Link>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting || (customerTinMissing && !useGeneralTin)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              {isResubmit ? 'Yes, Resubmit' : 'Yes, Submit'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setShowConfirm(false)
                setUseGeneralTin(false)
              }}
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Button
      size="sm"
      onClick={() => setShowConfirm(true)}
      className="bg-primary hover:bg-primary/90 text-primary-foreground"
    >
      <Send className="h-4 w-4 mr-1" />
      {isResubmit ? 'Resubmit to LHDN' : 'Submit to LHDN'}
    </Button>
  )
}

'use client'

import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SalesInvoice } from '../types'

interface LhdnSubmitButtonProps {
  invoice: SalesInvoice
}

export function LhdnSubmitButton({ invoice }: LhdnSubmitButtonProps) {
  // Visibility: only for "sent" invoices that haven't been submitted yet, or "invalid" for resubmit
  const isEligible =
    invoice.status === 'sent' &&
    (invoice.lhdnStatus === undefined || invoice.lhdnStatus === 'invalid')

  if (!isEligible) return null

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">
        LHDN MyInvois integration launching soon!
      </p>
      <Button
        size="sm"
        disabled
        className="bg-primary/60 text-primary-foreground cursor-not-allowed"
      >
        <Send className="h-4 w-4 mr-1" />
        Submit to LHDN
      </Button>
    </div>
  )
}

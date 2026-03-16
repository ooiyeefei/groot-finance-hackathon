'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Send to Buyer Button Component
 * 001-einv-pdf-gen: Manual trigger for e-invoice PDF delivery to buyer
 */

interface SendToBuyerButtonProps {
  invoiceId: string
  businessId: string
  buyerEmail?: string | null
  disabled?: boolean
  onSuccess?: () => void
}

export function SendToBuyerButton({
  invoiceId,
  businessId,
  buyerEmail,
  disabled,
  onSuccess,
}: SendToBuyerButtonProps) {
  const [isSending, setIsSending] = useState(false)

  const handleSend = async () => {
    if (!buyerEmail) {
      toast.error('No buyer email address found')
      return
    }

    setIsSending(true)

    try {
      const response = await fetch(
        `/api/v1/sales-invoices/${invoiceId}/lhdn/send-to-buyer?businessId=${businessId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      const result = await response.json()

      if (result.success) {
        toast.success(`E-invoice delivered to ${buyerEmail}`)
        onSuccess?.()
      } else {
        toast.error(result.error || 'Failed to send e-invoice')
      }
    } catch (error) {
      console.error('[SendToBuyer] Error:', error)
      toast.error('Failed to send e-invoice')
    } finally {
      setIsSending(false)
    }
  }

  if (!buyerEmail) {
    return null
  }

  return (
    <Button
      size="sm"
      onClick={handleSend}
      disabled={disabled || isSending}
      className="bg-primary hover:bg-primary/90 text-primary-foreground"
    >
      {isSending ? (
        <>
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          Sending...
        </>
      ) : (
        <>
          <Send className="h-4 w-4 mr-1" />
          Send to Buyer
        </>
      )}
    </Button>
  )
}

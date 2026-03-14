'use client'

import { useMutation } from 'convex/react'
import { useState } from 'react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'

export function usePaymentRecorder() {
  const recordPaymentMutation = useMutation(api.functions.invoices.recordPayment)
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recordPayment = async (
    invoiceId: string,
    amount: number,
    paymentDate: string,
    paymentMethod: string,
    notes?: string
  ) => {
    setIsRecording(true)
    setError(null)
    try {
      const result = await recordPaymentMutation({
        invoiceId: invoiceId as Id<"invoices">,
        amount,
        paymentDate,
        paymentMethod,
        notes,
      })
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to record payment'
      setError(message)
      throw err
    } finally {
      setIsRecording(false)
    }
  }

  return {
    recordPayment,
    isRecording,
    error,
    clearError: () => setError(null),
  }
}

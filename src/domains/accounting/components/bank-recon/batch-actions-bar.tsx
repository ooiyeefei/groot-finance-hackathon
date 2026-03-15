'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import { Id } from '../../../../../convex/_generated/dataModel'
import { CheckCircle2, BookOpen, Loader2 } from 'lucide-react'

interface BatchActionsBarProps {
  businessId: Id<'businesses'>
  bankAccountId: Id<'bank_accounts'>
  highConfidenceCount: number
  classifiedCount: number
}

export default function BatchActionsBar({
  businessId,
  bankAccountId,
  highConfidenceCount,
  classifiedCount,
}: BatchActionsBarProps) {
  const batchConfirm = useMutation(api.functions.bankTransactions.batchConfirmHighConfidence)
  const batchPost = useMutation(api.functions.bankTransactions.batchPostToGL)

  const [isConfirming, setIsConfirming] = useState(false)
  const [isPosting, setIsPosting] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const handleBatchConfirm = async () => {
    setIsConfirming(true)
    setResult(null)
    try {
      const res = await batchConfirm({ businessId, bankAccountId })
      setResult(`Confirmed ${res.confirmed} transactions, created ${res.journalEntriesCreated} journal entries.`)
      setTimeout(() => setResult(null), 5000)
    } catch (err) {
      console.error('Batch confirm failed:', err)
      setResult('Batch confirm encountered an error.')
      setTimeout(() => setResult(null), 5000)
    } finally {
      setIsConfirming(false)
    }
  }

  const handleBatchPost = async () => {
    setIsPosting(true)
    setResult(null)
    try {
      const res = await batchPost({ businessId, bankAccountId })
      setResult(`Posted ${res.posted} transactions to GL.${res.errors > 0 ? ` ${res.errors} errors.` : ''}`)
      setTimeout(() => setResult(null), 5000)
    } catch (err) {
      console.error('Batch post failed:', err)
      setResult('Batch post encountered an error.')
      setTimeout(() => setResult(null), 5000)
    } finally {
      setIsPosting(false)
    }
  }

  if (highConfidenceCount === 0 && classifiedCount === 0) return null

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 flex-wrap">
      <span className="text-xs font-medium text-muted-foreground">Batch Actions:</span>

      {highConfidenceCount > 0 && (
        <button
          onClick={handleBatchConfirm}
          disabled={isConfirming || isPosting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary hover:bg-primary/90 text-primary-foreground transition-colors disabled:opacity-50"
        >
          {isConfirming ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5" />
          )}
          Confirm All High-Confidence ({highConfidenceCount})
        </button>
      )}

      {classifiedCount > 0 && (
        <button
          onClick={handleBatchPost}
          disabled={isPosting || isConfirming}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-card hover:bg-muted text-foreground transition-colors disabled:opacity-50"
        >
          {isPosting ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <BookOpen className="w-3.5 h-3.5" />
          )}
          Post All to GL ({classifiedCount})
        </button>
      )}

      {result && (
        <span className="text-xs text-emerald-500 ml-auto">{result}</span>
      )}
    </div>
  )
}

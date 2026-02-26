'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { CheckCircle, XCircle, Loader2, AlertCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'

interface MatchCandidate {
  receivedDocId: string
  supplierName: string
  total: number
  dateTimeIssued: string
  matchTier: string
  matchConfidence: number
}

interface EinvoiceMatchReviewProps {
  claimId: string
  candidates: MatchCandidate[]
  currency?: string
  onResolved?: () => void
}

/**
 * Match review UI for ambiguous (Tier 3) e-invoice matches
 * Shows candidate received documents and allows accept/reject actions
 */
export default function EinvoiceMatchReview({
  claimId,
  candidates,
  currency = 'MYR',
  onResolved,
}: EinvoiceMatchReviewProps) {
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!candidates || candidates.length === 0) return null

  const handleAction = async (receivedDocId: string, action: 'accept' | 'reject') => {
    setLoadingId(receivedDocId)
    setError(null)

    try {
      const response = await fetch(`/api/v1/expense-claims/${claimId}/resolve-match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receivedDocId, action }),
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to resolve match')
      }

      onResolved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve match')
    } finally {
      setLoadingId(null)
    }
  }

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'High'
    if (confidence >= 0.5) return 'Medium'
    return 'Low'
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <AlertCircle className="w-4 h-4 text-yellow-500" />
        <span className="text-foreground font-medium">
          {candidates.length} potential e-invoice {candidates.length === 1 ? 'match' : 'matches'} found
        </span>
      </div>
      <p className="text-muted-foreground text-xs">
        Review each match and confirm if it belongs to this expense claim.
      </p>

      {error && (
        <div className="text-destructive text-sm bg-destructive/10 rounded px-3 py-2">
          {error}
        </div>
      )}

      {candidates.map((candidate) => (
        <Card key={candidate.receivedDocId} className="bg-card border-border">
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-foreground font-medium text-sm truncate">
                  {candidate.supplierName}
                </p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
                  <span>{formatCurrency(candidate.total, currency)}</span>
                  {candidate.dateTimeIssued && (
                    <span>{formatBusinessDate(candidate.dateTimeIssued)}</span>
                  )}
                  <span className={`font-medium ${
                    candidate.matchConfidence >= 0.8 ? 'text-green-600 dark:text-green-400' :
                    candidate.matchConfidence >= 0.5 ? 'text-yellow-600 dark:text-yellow-400' :
                    'text-red-600 dark:text-red-400'
                  }`}>
                    {getConfidenceLabel(candidate.matchConfidence)} confidence
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleAction(candidate.receivedDocId, 'reject')}
                  disabled={loadingId === candidate.receivedDocId}
                  className="text-destructive hover:text-destructive"
                >
                  {loadingId === candidate.receivedDocId ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <XCircle className="w-3 h-3" />
                  )}
                  <span className="ml-1 hidden sm:inline">Reject</span>
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleAction(candidate.receivedDocId, 'accept')}
                  disabled={loadingId === candidate.receivedDocId}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                >
                  {loadingId === candidate.receivedDocId ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <CheckCircle className="w-3 h-3" />
                  )}
                  <span className="ml-1">Accept</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

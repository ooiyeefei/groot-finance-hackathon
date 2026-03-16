'use client'

import { useState } from 'react'
import { X, CheckCircle, XCircle, Pause, Loader2, Sparkles, AlertTriangle, PackageCheck, Brain } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils/format-number'
import { useMatch, useReviewMatch } from '../hooks/use-matches'
import type { Id } from '../../../../convex/_generated/dataModel'

interface MatchReviewProps {
  matchId: Id<'po_matches'>
  onClose: () => void
}

const VARIANCE_LABELS: Record<string, string> = {
  quantity_over_invoiced: 'Over Invoiced',
  quantity_under_invoiced: 'Under Invoiced',
  price_higher: 'Price Higher',
  price_lower: 'Price Lower',
  over_received: 'Over Received',
  missing_grn: 'Missing GRN',
}

export default function MatchReview({ matchId, onClose }: MatchReviewProps) {
  const { match, isLoading } = useMatch(matchId)
  const { reviewMatch } = useReviewMatch()
  const [reviewNotes, setReviewNotes] = useState('')
  const [isReviewing, setIsReviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleReview = async (action: 'approve' | 'reject' | 'hold') => {
    if ((action === 'reject' || action === 'hold') && !reviewNotes.trim()) {
      setError('Notes are required for reject and hold actions')
      return
    }

    setIsReviewing(true)
    setError(null)
    try {
      await reviewMatch({
        matchId,
        action,
        notes: reviewNotes.trim() || undefined,
      })
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Failed to review match')
    } finally {
      setIsReviewing(false)
    }
  }

  if (isLoading || !match) {
    return (
      <div className="fixed inset-0 z-50">
        <div className="fixed inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(12px)' }} />
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="bg-card rounded-xl shadow-2xl w-full max-w-4xl p-8">
            <div className="space-y-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-6 bg-muted rounded animate-pulse" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const po = match.purchaseOrder as any
  const invoice = match.invoice as any
  const grns = (match.grns ?? []) as any[]
  const vendor = match.vendor as any
  const pairings = match.lineItemPairings ?? []
  const varianceSummary = match.overallVarianceSummary
  const isThreeWay = match.matchType === 'three_way'
  const canReview = ['pending_review', 'on_hold'].includes(match.status)

  // Build GRN quantity lookup by PO line index
  const grnQtyByPoLine: Record<number, number> = {}
  if (grns.length > 0) {
    for (const grn of grns) {
      for (const li of grn.lineItems ?? []) {
        const idx = li.poLineItemIndex
        if (idx !== undefined && idx !== null) {
          grnQtyByPoLine[idx] = (grnQtyByPoLine[idx] ?? 0) + li.quantityReceived
        }
      }
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 transition-opacity"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(12px)' }}
        onClick={onClose}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-card rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[96vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
            <div>
              <h3 className="text-base font-semibold text-foreground">Match Review</h3>
              <p className="text-xs text-muted-foreground">
                {po?.poNumber ?? 'Unknown PO'} &middot; {vendor?.name ?? 'Unknown Vendor'} &middot;{' '}
                {isThreeWay ? '3-Way Match' : '2-Way Match'}
              </p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            {/* AI Tier Badge */}
            {match.aiMatchTier === 2 && (
              <div className="flex items-center gap-2">
                <Badge className="bg-primary/10 text-primary border border-primary/30 text-xs">
                  <Sparkles className="h-3 w-3 mr-1" />
                  AI-Enhanced Match (Tier 2)
                </Badge>
                {match.aiConfidenceOverall !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          match.aiConfidenceOverall >= 0.8 ? 'bg-green-500' :
                          match.aiConfidenceOverall >= 0.6 ? 'bg-yellow-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${Math.round(match.aiConfidenceOverall * 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(match.aiConfidenceOverall * 100)}% confidence
                    </span>
                  </div>
                )}
                {match.aiModelVersion && match.aiModelVersion !== 'baseline' && (
                  <span className="text-xs text-muted-foreground">
                    Optimized model
                  </span>
                )}
              </div>
            )}

            {/* Groot Insight — AI Reasoning Trace */}
            {match.aiReasoningTrace && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                <div className="flex items-start gap-2.5">
                  <div className="shrink-0 mt-0.5">
                    <Brain className="h-4 w-4 text-primary" />
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <p className="text-xs font-semibold text-primary">Groot Insight</p>
                    <p className="text-sm text-foreground leading-relaxed">
                      {match.aiReasoningTrace}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Variance Diagnosis — AI Proactive Alert */}
            {match.aiVarianceDiagnosis && (
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-4">
                <div className="flex items-start gap-2.5">
                  <div className="shrink-0 mt-0.5">
                    <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <p className="text-xs font-semibold text-yellow-600 dark:text-yellow-400">Variance Diagnosis</p>
                    <p className="text-sm text-foreground leading-relaxed">
                      {match.aiVarianceDiagnosis}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* GRN Delivery Verification — 3rd Way Depth */}
            {isThreeWay && grns.length > 0 && (() => {
              const grnIssues: string[] = []
              for (const pairing of pairings) {
                const poLine = po?.lineItems?.[pairing.poLineIndex]
                const invQty = pairing.invoiceQuantity ?? 0
                const grnQty = grnQtyByPoLine[pairing.poLineIndex] ?? 0

                if (invQty > 0 && grnQty > 0 && invQty > grnQty) {
                  grnIssues.push(
                    `"${poLine?.description ?? `Line ${pairing.poLineIndex + 1}`}": Invoice claims ${invQty} units but only ${grnQty} were received via GRN`
                  )
                }
              }

              if (grnIssues.length === 0) return (
                <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <PackageCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <p className="text-xs font-medium text-green-600 dark:text-green-400">
                      Delivery Verified — All invoice quantities confirmed by Goods Received Notes
                    </p>
                  </div>
                </div>
              )

              return (
                <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4">
                  <div className="flex items-start gap-2.5">
                    <div className="shrink-0 mt-0.5">
                      <PackageCheck className="h-4 w-4 text-destructive" />
                    </div>
                    <div className="space-y-1.5 min-w-0">
                      <p className="text-xs font-semibold text-destructive">Delivery Mismatch — Invoice exceeds received quantities</p>
                      <ul className="text-sm text-foreground space-y-1">
                        {grnIssues.map((issue, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-destructive shrink-0 mt-0.5">-</span>
                            <span>{issue}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Variance Summary */}
            {varianceSummary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-muted rounded-md p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Variances</p>
                  <p className="text-lg font-semibold text-foreground">{varianceSummary.totalVariances}</p>
                </div>
                <div className="bg-muted rounded-md p-3 text-center">
                  <p className="text-xs text-muted-foreground">Exceeds Tolerance</p>
                  <p className={`text-lg font-semibold ${
                    varianceSummary.exceedsToleranceCount > 0 ? 'text-destructive' : 'text-foreground'
                  }`}>
                    {varianceSummary.exceedsToleranceCount}
                  </p>
                </div>
                {varianceSummary.maxPriceVariancePercent !== undefined && (
                  <div className="bg-muted rounded-md p-3 text-center">
                    <p className="text-xs text-muted-foreground">Max Price Variance</p>
                    <p className="text-lg font-semibold text-foreground">{varianceSummary.maxPriceVariancePercent}%</p>
                  </div>
                )}
                {varianceSummary.maxQuantityVariancePercent !== undefined && (
                  <div className="bg-muted rounded-md p-3 text-center">
                    <p className="text-xs text-muted-foreground">Max Qty Variance</p>
                    <p className="text-lg font-semibold text-foreground">{varianceSummary.maxQuantityVariancePercent}%</p>
                  </div>
                )}
              </div>
            )}

            {/* Line Item Comparison Table */}
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Item</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">PO Qty</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">PO Price</th>
                      {isThreeWay && (
                        <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">GRN Qty</th>
                      )}
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Inv Qty</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Inv Price</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">Variances</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pairings.map((pairing: any, idx: number) => {
                      const poLine = po?.lineItems?.[pairing.poLineIndex]
                      const variances = pairing.variances ?? []
                      const hasExceeding = variances.some((v: any) => v.exceedsTolerance)

                      return (
                        <tr
                          key={idx}
                          className={`border-b border-border ${hasExceeding ? 'bg-warning/30' : ''}`}
                        >
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-foreground">{poLine?.description ?? `Line ${idx + 1}`}</span>
                              {pairing.matchMethod === 'ai_semantic' && (
                                <Sparkles className="h-3 w-3 text-primary shrink-0" />
                              )}
                            </div>
                            {poLine?.itemCode && (
                              <div className="text-xs text-muted-foreground">{poLine.itemCode}</div>
                            )}
                            {pairing.matchMethod === 'ai_semantic' && pairing.matchConfidence < 1 && (
                              <div className="text-xs text-primary/70 mt-0.5">
                                AI confidence: {Math.round(pairing.matchConfidence * 100)}%
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-foreground">{pairing.poQuantity}</td>
                          <td className="px-3 py-2 text-right text-foreground">
                            {formatCurrency(pairing.poUnitPrice, po?.currency ?? 'MYR')}
                          </td>
                          {isThreeWay && (
                            <td className={`px-3 py-2 text-right ${
                              pairing.grnQuantity !== undefined
                                ? pairing.grnQuantity !== pairing.poQuantity
                                  ? 'text-warning-foreground font-medium'
                                  : 'text-foreground'
                                : 'text-muted-foreground'
                            }`}>
                              {pairing.grnQuantity ?? '---'}
                            </td>
                          )}
                          <td className={`px-3 py-2 text-right ${
                            pairing.invoiceQuantity !== undefined
                              ? pairing.invoiceQuantity !== pairing.poQuantity
                                ? 'text-warning-foreground font-medium'
                                : 'text-foreground'
                              : 'text-muted-foreground'
                          }`}>
                            {pairing.invoiceQuantity ?? '---'}
                          </td>
                          <td className={`px-3 py-2 text-right ${
                            pairing.invoiceUnitPrice !== undefined
                              ? pairing.invoiceUnitPrice !== pairing.poUnitPrice
                                ? 'text-warning-foreground font-medium'
                                : 'text-foreground'
                              : 'text-muted-foreground'
                          }`}>
                            {pairing.invoiceUnitPrice !== undefined
                              ? formatCurrency(pairing.invoiceUnitPrice, po?.currency ?? 'MYR')
                              : '---'}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {variances.length > 0 ? (
                              <div className="space-y-0.5">
                                {variances.map((v: any, vi: number) => (
                                  <Badge
                                    key={vi}
                                    variant={v.exceedsTolerance ? 'error' : 'warning'}
                                    size="sm"
                                  >
                                    {VARIANCE_LABELS[v.type] ?? v.type} ({v.percentageDifference}%)
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-success-foreground">OK</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Review Notes */}
            {canReview && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Review Notes</label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  rows={2}
                  placeholder="Required for reject/hold actions..."
                  className="w-full bg-input border border-border text-foreground rounded-md px-3 py-2 text-sm resize-none"
                  disabled={isReviewing}
                />
              </div>
            )}

            {/* Existing review notes */}
            {match.reviewNotes && (
              <div>
                <h4 className="text-sm font-medium text-foreground mb-1">Previous Review Notes</h4>
                <p className="text-sm text-muted-foreground bg-muted rounded-md p-3">{match.reviewNotes}</p>
              </div>
            )}

            {error && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="flex gap-3 justify-end p-4 border-t border-border shrink-0">
            {canReview && (
              <>
                <button
                  onClick={() => handleReview('hold')}
                  disabled={isReviewing}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground disabled:opacity-50"
                >
                  <Pause className="h-4 w-4" />
                  Hold
                </button>
                <button
                  onClick={() => handleReview('reject')}
                  disabled={isReviewing}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-destructive hover:bg-destructive/90 text-destructive-foreground disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
                <button
                  onClick={() => handleReview('approve')}
                  disabled={isReviewing}
                  className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground disabled:opacity-50"
                >
                  {isReviewing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="h-4 w-4" />
                  )}
                  Approve
                </button>
              </>
            )}
            {!canReview && (
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-md text-sm font-medium bg-secondary hover:bg-secondary/80 text-secondary-foreground"
              >
                Close
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

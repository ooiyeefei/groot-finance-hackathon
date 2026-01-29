/**
 * Mobile Approval List Component
 *
 * Mobile-optimized list of pending expense claims for approval
 * Uses MobileApprovalCard for swipe gestures and 2-tap flow
 *
 * Features:
 * - Responsive: Uses compact cards on mobile, standard layout on desktop
 * - Empty state with friendly messaging
 * - Loading skeleton optimized for mobile
 * - Integration with UnifiedExpenseDetailsModal for full review
 */

'use client'

import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import { CheckCircle, Clock, XCircle, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { MobileApprovalCard } from './mobile-approval-card'
import { useExpenseCategories } from '../hooks/use-expense-categories'

// Lazy load the details modal (heavy component)
const UnifiedExpenseDetailsModal = lazy(() => import('./unified-expense-details-modal'))

interface MobileApprovalListProps {
  onRefreshNeeded: () => void
}

interface ExpenseClaim {
  id: string
  business_id: string
  description: string
  vendor_name: string
  total_amount: string | number
  currency: string
  home_currency_amount?: string | number
  home_currency?: string
  transaction_date: string
  expense_category?: string
  employee_name?: string
  employee?: {
    full_name?: string
  }
  employee_id?: string
  created_at: string
  status: string
}

export function MobileApprovalList({ onRefreshNeeded }: MobileApprovalListProps) {
  const [claims, setClaims] = useState<ExpenseClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processingClaims, setProcessingClaims] = useState<Set<string>>(new Set())
  const [selectedClaim, setSelectedClaim] = useState<ExpenseClaim | null>(null)

  // Fetch expense categories for displaying category names
  const { categories } = useExpenseCategories({ includeDisabled: true })

  // Fetch pending claims
  const fetchPendingClaims = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/v1/expense-claims?approver=me&status=submitted')

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()

      if (result.success) {
        // Filter to only show submitted claims (double-check on client side)
        const submittedClaims = (result.data.claims || []).filter(
          (claim: ExpenseClaim) => claim.status === 'submitted'
        )
        setClaims(submittedClaims)
        setError(null)
      } else {
        console.error('[MobileApprovalList] API error:', result.error)
        setError(result.error || 'Failed to fetch pending claims')
      }
    } catch (err) {
      console.error('[MobileApprovalList] Network error:', err)
      setError(`Network error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPendingClaims()
  }, [fetchPendingClaims])

  // Handle approval
  const handleApprove = useCallback(async (claimId: string) => {
    try {
      setProcessingClaims(prev => new Set([...prev, claimId]))

      const response = await fetch(`/api/v1/expense-claims/${claimId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' })
      })

      const result = await response.json()

      if (result.success) {
        // Remove from local list immediately for snappy UX
        setClaims(prev => prev.filter(c => c.id !== claimId))
        // Refresh parent data
        onRefreshNeeded()
      } else {
        setError(result.error || 'Failed to approve claim')
      }
    } catch (err) {
      console.error('Failed to approve claim:', err)
      setError('Network error while approving claim')
    } finally {
      setProcessingClaims(prev => {
        const newSet = new Set(prev)
        newSet.delete(claimId)
        return newSet
      })
    }
  }, [onRefreshNeeded])

  // Handle rejection
  const handleReject = useCallback(async (claimId: string) => {
    try {
      setProcessingClaims(prev => new Set([...prev, claimId]))

      const response = await fetch(`/api/v1/expense-claims/${claimId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected' })
      })

      const result = await response.json()

      if (result.success) {
        // Remove from local list immediately for snappy UX
        setClaims(prev => prev.filter(c => c.id !== claimId))
        // Refresh parent data
        onRefreshNeeded()
      } else {
        setError(result.error || 'Failed to reject claim')
      }
    } catch (err) {
      console.error('Failed to reject claim:', err)
      setError('Network error while rejecting claim')
    } finally {
      setProcessingClaims(prev => {
        const newSet = new Set(prev)
        newSet.delete(claimId)
        return newSet
      })
    }
  }, [onRefreshNeeded])

  // Handle view details
  const handleViewDetails = useCallback((claim: ExpenseClaim) => {
    setSelectedClaim(claim)
  }, [])

  // Handle approval from modal
  const handleModalApprove = useCallback(async (claimId: string, notes?: string) => {
    try {
      setProcessingClaims(prev => new Set([...prev, claimId]))

      const response = await fetch(`/api/v1/expense-claims/${claimId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved', comment: notes })
      })

      const result = await response.json()

      if (result.success) {
        setClaims(prev => prev.filter(c => c.id !== claimId))
        setSelectedClaim(null)
        onRefreshNeeded()
      } else {
        setError(result.error || 'Failed to approve claim')
      }
    } catch (err) {
      console.error('Failed to approve claim:', err)
      setError('Network error while approving claim')
    } finally {
      setProcessingClaims(prev => {
        const newSet = new Set(prev)
        newSet.delete(claimId)
        return newSet
      })
    }
  }, [onRefreshNeeded])

  // Handle rejection from modal
  const handleModalReject = useCallback(async (claimId: string, notes?: string) => {
    try {
      setProcessingClaims(prev => new Set([...prev, claimId]))

      const response = await fetch(`/api/v1/expense-claims/${claimId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'rejected', comment: notes })
      })

      const result = await response.json()

      if (result.success) {
        setClaims(prev => prev.filter(c => c.id !== claimId))
        setSelectedClaim(null)
        onRefreshNeeded()
      } else {
        setError(result.error || 'Failed to reject claim')
      }
    } catch (err) {
      console.error('Failed to reject claim:', err)
      setError('Network error while rejecting claim')
    } finally {
      setProcessingClaims(prev => {
        const newSet = new Set(prev)
        newSet.delete(claimId)
        return newSet
      })
    }
  }, [onRefreshNeeded])

  // Loading state
  if (loading) {
    return (
      <div className="space-y-3">
        {/* Mobile-optimized skeleton */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-3 animate-pulse">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-muted" />
              <div className="flex-1">
                <div className="h-4 bg-muted rounded w-24" />
              </div>
              <div className="h-5 bg-muted rounded w-16" />
            </div>
            <div className="h-3 bg-muted rounded w-full mb-2" />
            <div className="flex justify-between">
              <div className="h-3 bg-muted rounded w-20" />
              <div className="h-3 bg-muted rounded w-16" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-6 text-center">
          <XCircle className="w-8 h-8 mx-auto mb-3 text-destructive" />
          <p className="text-destructive text-sm">{error}</p>
        </CardContent>
      </Card>
    )
  }

  // Empty state
  if (claims.length === 0) {
    return (
      <Card className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-700/50">
        <CardContent className="p-8 text-center">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-500" />
          <h3 className="text-lg font-semibold text-green-900 dark:text-green-100 mb-1">
            All Caught Up!
          </h3>
          <p className="text-green-700 dark:text-green-300 text-sm">
            No expense claims pending your approval.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      {/* Mobile-optimized list */}
      <div className="space-y-3">
        {/* Swipe hint - show on first load */}
        <p className="text-xs text-muted-foreground text-center mb-1 sm:hidden">
          Swipe right to approve, left to reject
        </p>

        {claims.map((claim) => (
          <MobileApprovalCard
            key={claim.id}
            claim={claim}
            categories={categories}
            onApprove={handleApprove}
            onReject={handleReject}
            onViewDetails={handleViewDetails}
            isProcessing={processingClaims.has(claim.id)}
          />
        ))}
      </div>

      {/* Details modal */}
      {selectedClaim && (
        <Suspense
          fallback={
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          }
        >
          <UnifiedExpenseDetailsModal
            claimId={selectedClaim.id}
            businessId={selectedClaim.business_id}
            isOpen={Boolean(selectedClaim)}
            onClose={() => setSelectedClaim(null)}
            viewMode="manager"
            onApprove={handleModalApprove}
            onReject={handleModalReject}
            onRouted={() => {
              fetchPendingClaims()
              onRefreshNeeded()
            }}
            onRefreshNeeded={() => {
              fetchPendingClaims()
              onRefreshNeeded()
            }}
          />
        </Suspense>
      )}
    </>
  )
}

export default MobileApprovalList

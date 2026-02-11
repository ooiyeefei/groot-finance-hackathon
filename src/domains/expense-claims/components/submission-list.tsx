'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useExpenseSubmissions, useSubmissionMutations } from '../hooks/use-expense-submissions'
import { useActiveBusiness } from '@/contexts/business-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import {
  Plus,
  FileText,
  Loader2,
  ChevronRight,
  Send,
  Clock,
  CheckCircle,
  XCircle,
  Wallet,
  ArrowUpDown,
  Calendar,
  X,
} from 'lucide-react'
import type { CurrencyTotal } from '../types/expense-claims'

interface SubmissionListProps {
  locale: string
}

type StatusFilter = 'all' | 'draft' | 'submitted' | 'approved' | 'rejected' | 'reimbursed'
type SortOrder = 'newest' | 'oldest'

const STATUS_CONFIG: Record<string, { className: string; label: string; icon: React.ReactNode }> = {
  draft: { className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30', label: 'Draft', icon: <FileText className="h-3.5 w-3.5" /> },
  submitted: { className: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30', label: 'Pending', icon: <Clock className="h-3.5 w-3.5" /> },
  approved: { className: 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30', label: 'Approved', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  rejected: { className: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30', label: 'Rejected', icon: <XCircle className="h-3.5 w-3.5" /> },
  reimbursed: { className: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30', label: 'Reimbursed', icon: <Wallet className="h-3.5 w-3.5" /> },
}

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'submitted', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'reimbursed', label: 'Reimbursed' },
]

export default function SubmissionList({ locale }: SubmissionListProps) {
  const router = useRouter()
  const { businessId, isLoading: isBusinessLoading } = useActiveBusiness()

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const { submissions, isLoading, error } = useExpenseSubmissions({
    businessId: businessId || '',
    enabled: !!businessId,
  })
  const { createSubmission } = useSubmissionMutations()

  // Client-side filtering and sorting
  const filteredSubmissions = useMemo(() => {
    let result = [...submissions]

    if (statusFilter !== 'all') {
      result = result.filter((s: any) => s.status === statusFilter)
    }

    if (dateFrom) {
      const fromTs = new Date(dateFrom).getTime()
      result = result.filter((s: any) => s._creationTime >= fromTs)
    }
    if (dateTo) {
      const toTs = new Date(dateTo + 'T23:59:59').getTime()
      result = result.filter((s: any) => s._creationTime <= toTs)
    }

    result.sort((a: any, b: any) => {
      return sortOrder === 'newest'
        ? b._creationTime - a._creationTime
        : a._creationTime - b._creationTime
    })

    return result
  }, [submissions, statusFilter, sortOrder, dateFrom, dateTo])

  const hasActiveFilters = statusFilter !== 'all' || dateFrom !== '' || dateTo !== ''

  const clearFilters = () => {
    setStatusFilter('all')
    setDateFrom('')
    setDateTo('')
    setSortOrder('newest')
  }

  const handleCreateSubmission = async () => {
    if (!businessId) return
    try {
      // Convex create mutation returns the new submission ID directly
      const submissionId = await createSubmission.mutateAsync({ businessId })
      if (submissionId) {
        router.push(`/${locale}/expense-claims/submissions/${submissionId}`)
      }
    } catch (e: any) {
      console.error('Failed to create submission:', e)
    }
  }

  if (isBusinessLoading || isLoading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="animate-pulse h-8 bg-muted rounded w-56" />
          <div className="animate-pulse h-10 bg-muted rounded w-40" />
        </div>
        <div className="animate-pulse h-10 bg-muted rounded w-full" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse h-[76px] bg-muted/50 rounded-lg border border-border" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Expense Submissions</h2>
          <p className="text-base text-muted-foreground">
            {filteredSubmissions.length} {filteredSubmissions.length === 1 ? 'submission' : 'submissions'}
            {hasActiveFilters ? ' (filtered)' : ''}
          </p>
        </div>
        <Button
          onClick={handleCreateSubmission}
          disabled={createSubmission.isPending || !businessId}
        >
          {createSubmission.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          New Submission
        </Button>
      </div>

      {/* Status Filter Pills */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setStatusFilter(value)}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-full border transition-colors ${
              statusFilter === value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Sort & Date Range */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setSortOrder(s => s === 'newest' ? 'oldest' : 'newest')}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          {sortOrder === 'newest' ? 'Newest first' : 'Oldest first'}
        </button>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="px-2.5 py-1.5 text-sm rounded-md border border-border bg-card text-foreground"
            />
          </div>
          <span className="text-sm text-muted-foreground">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="px-2.5 py-1.5 text-sm rounded-md border border-border bg-card text-foreground"
          />
        </div>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-2.5 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Clear filters
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-base text-red-600 dark:text-red-400">{error}</p>
      )}

      {/* Submission List */}
      {filteredSubmissions.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-8">
            <div className="text-center text-muted-foreground py-8">
              <Send className="w-14 h-14 mx-auto mb-4 opacity-50" />
              {hasActiveFilters ? (
                <>
                  <p className="text-base">No submissions match your filters</p>
                  <p className="text-sm mt-1">
                    Try adjusting your filters or{' '}
                    <button onClick={clearFilters} className="text-primary underline">
                      clear all filters
                    </button>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-base">No expense submissions yet</p>
                  <p className="text-sm mt-1">Create a submission to batch upload receipts for approval</p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {filteredSubmissions.map((submission: any) => {
            const badge = STATUS_CONFIG[submission.status] || STATUS_CONFIG.draft
            const createdDate = submission._creationTime
              ? new Date(submission._creationTime).toISOString().split('T')[0]
              : null

            const totals: CurrencyTotal[] = submission.totalsByCurrency || []

            return (
              <div
                key={submission._id}
                className="flex items-center justify-between p-4 rounded-lg border border-border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => router.push(`/${locale}/expense-claims/submissions/${submission._id}`)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-1">
                    <p className="text-base font-medium text-foreground truncate">
                      {submission.title}
                    </p>
                    <Badge className={badge.className}>
                      <span className="flex items-center gap-1">
                        {badge.icon} {badge.label}
                      </span>
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm text-muted-foreground">
                      {submission.claimCount || 0}{' '}
                      {(submission.claimCount || 0) === 1 ? 'claim' : 'claims'}
                    </span>
                    {totals.length > 0 && (
                      <span className="text-sm font-medium text-foreground">
                        {totals
                          .map((t: CurrencyTotal) => formatCurrency(t.total, t.currency))
                          .join(' + ')}
                      </span>
                    )}
                    {createdDate && (
                      <span className="text-sm text-muted-foreground">
                        {formatBusinessDate(createdDate)}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-3" />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

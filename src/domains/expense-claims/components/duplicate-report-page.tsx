/**
 * Duplicate Report Page Component
 * Feature: 007-duplicate-expense-detection (User Story 3, T034)
 *
 * Finance admin dashboard for viewing and managing duplicate expense claims.
 * Features:
 * - Date range picker
 * - Status filter dropdown
 * - Export to CSV button
 * - Summary statistics
 * - Sortable/filterable table of duplicates
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { Download, Filter, Calendar, AlertTriangle, CheckCircle, XCircle, RefreshCcw, Users, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import DuplicateReportTable, { type DuplicateMatch } from './duplicate-report-table'
import { formatNumber } from '@/lib/utils/format-number'

// Summary statistics interface
interface ReportSummary {
  totalMatches: number
  pendingCount: number
  confirmedCount: number
  dismissedCount: number
  exactMatchCount: number
  strongMatchCount: number
  fuzzyMatchCount: number
  crossUserCount: number
}

// Status filter options
const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'pending', label: 'Pending Review' },
  { value: 'confirmed_duplicate', label: 'Confirmed Duplicates' },
  { value: 'dismissed', label: 'Dismissed' },
]

export default function DuplicateReportPage() {
  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')

  // Data state
  const [matches, setMatches] = useState<DuplicateMatch[]>([])
  const [summary, setSummary] = useState<ReportSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMatches, setSelectedMatches] = useState<Set<string>>(new Set())
  const [bulkActionLoading, setBulkActionLoading] = useState(false)

  // Fetch duplicate report data
  const fetchReport = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      if (statusFilter && statusFilter !== 'all') {
        params.append('status', statusFilter)
      }
      if (startDate) {
        params.append('startDate', startDate)
      }
      if (endDate) {
        params.append('endDate', endDate)
      }

      const response = await fetch(`/api/v1/expense-claims/duplicate-report?${params.toString()}`)
      const result = await response.json()

      if (result.success) {
        setMatches(result.data.matches)
        setSummary(result.data.summary)
      } else {
        setError(result.error || 'Failed to fetch duplicate report')
      }
    } catch (err) {
      console.error('[Duplicate Report] Error fetching data:', err)
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, startDate, endDate])

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchReport()
  }, [fetchReport])

  // Export to CSV
  const handleExportCSV = () => {
    if (matches.length === 0) {
      return
    }

    // Build CSV content
    const headers = [
      'Date',
      'Original Vendor',
      'Original Amount',
      'Original Currency',
      'Original Submitter',
      'Matched Vendor',
      'Matched Amount',
      'Matched Submitter',
      'Match Tier',
      'Confidence',
      'Cross User',
      'Status',
      'Resolution Reason',
    ]

    const rows = matches.map((match) => [
      match.sourceClaim?.transactionDate || '',
      match.sourceClaim?.vendorName || '',
      match.sourceClaim?.totalAmount?.toString() || '',
      match.sourceClaim?.currency || '',
      match.sourceClaim?.submitter?.fullName || '',
      match.matchedClaim?.vendorName || '',
      match.matchedClaim?.totalAmount?.toString() || '',
      match.matchedClaim?.submitter?.fullName || '',
      match.matchTier,
      `${Math.round(match.confidenceScore * 100)}%`,
      match.isCrossUser ? 'Yes' : 'No',
      match.status,
      match.overrideReason || '',
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n')

    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    link.setAttribute(
      'download',
      `duplicate-report-${new Date().toISOString().split('T')[0]}.csv`
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Handle view match (placeholder for future modal)
  const handleViewMatch = (match: DuplicateMatch) => {
    // TODO: Open detail modal or navigate to comparison view
    console.log('[Duplicate Report] View match:', match._id)
  }

  // Handle selection toggle
  const handleSelectionChange = (matchId: string, selected: boolean) => {
    setSelectedMatches(prev => {
      const newSet = new Set(prev)
      if (selected) {
        newSet.add(matchId)
      } else {
        newSet.delete(matchId)
      }
      return newSet
    })
  }

  // Handle select all pending
  const handleSelectAllPending = () => {
    const pendingIds = matches
      .filter(m => m.status === 'pending')
      .map(m => m._id)
    setSelectedMatches(new Set(pendingIds))
  }

  // Handle bulk dismiss (mark as reviewed/not duplicate)
  const handleBulkDismiss = async () => {
    if (selectedMatches.size === 0) return

    setBulkActionLoading(true)
    try {
      const dismissPromises = Array.from(selectedMatches).map(matchId =>
        fetch(`/api/v1/expense-claims/bulk/dismiss-duplicate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            matchId,
            reason: 'Bulk reviewed - Not a duplicate',
          }),
        })
      )

      await Promise.all(dismissPromises)
      setSelectedMatches(new Set())
      fetchReport() // Refresh data
    } catch (err) {
      console.error('[Duplicate Report] Bulk dismiss error:', err)
      setError('Failed to dismiss selected matches')
    } finally {
      setBulkActionLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Duplicate Expense Report</h1>
          <p className="text-muted-foreground">
            Review and manage potential duplicate expense claims for audit compliance
          </p>
        </div>
        <div className="flex gap-2">
          {selectedMatches.size > 0 && (
            <Button
              variant="secondary"
              onClick={handleBulkDismiss}
              disabled={bulkActionLoading}
            >
              {bulkActionLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Mark {selectedMatches.size} as Reviewed
                </>
              )}
            </Button>
          )}
          {summary && summary.pendingCount > 0 && selectedMatches.size === 0 && (
            <Button
              variant="ghost"
              onClick={handleSelectAllPending}
            >
              Select All Pending ({summary.pendingCount})
            </Button>
          )}
          <Button
            variant="primary"
            onClick={handleExportCSV}
            disabled={matches.length === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Statistics */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <SummaryCard
            title="Total Matches"
            value={summary.totalMatches}
            icon={<Filter className="w-4 h-4" />}
            variant="default"
          />
          <SummaryCard
            title="Pending"
            value={summary.pendingCount}
            icon={<AlertTriangle className="w-4 h-4" />}
            variant="warning"
          />
          <SummaryCard
            title="Confirmed"
            value={summary.confirmedCount}
            icon={<XCircle className="w-4 h-4" />}
            variant="error"
          />
          <SummaryCard
            title="Dismissed"
            value={summary.dismissedCount}
            icon={<CheckCircle className="w-4 h-4" />}
            variant="success"
          />
          <SummaryCard
            title="Exact"
            value={summary.exactMatchCount}
            icon={<AlertTriangle className="w-4 h-4" />}
            variant="error"
          />
          <SummaryCard
            title="Strong"
            value={summary.strongMatchCount}
            icon={<AlertTriangle className="w-4 h-4" />}
            variant="warning"
          />
          <SummaryCard
            title="Fuzzy"
            value={summary.fuzzyMatchCount}
            icon={<AlertTriangle className="w-4 h-4" />}
            variant="default"
          />
          <SummaryCard
            title="Cross-User"
            value={summary.crossUserCount}
            icon={<Users className="w-4 h-4" />}
            variant="default"
          />
        </div>
      )}

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg text-foreground flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Status Filter */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="bg-input border-border text-foreground">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Start Date */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Start Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-input border-border text-foreground pl-10"
                />
              </div>
            </div>

            {/* End Date */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">End Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-input border-border text-foreground pl-10"
                />
              </div>
            </div>

            {/* Refresh Button */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground invisible">Actions</label>
              <Button
                variant="ghost"
                onClick={fetchReport}
                disabled={loading}
                className="w-full"
              >
                <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Alert */}
      {error && (
        <Alert className="bg-destructive/10 border-destructive/30">
          <AlertDescription className="text-destructive">{error}</AlertDescription>
        </Alert>
      )}

      {/* Results Table */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground">Duplicate Matches</CardTitle>
          <CardDescription>
            {loading
              ? 'Loading...'
              : `${matches.length} potential duplicate${matches.length !== 1 ? 's' : ''} found`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DuplicateReportTable
            matches={matches}
            onViewMatch={handleViewMatch}
            loading={loading}
            selectedMatches={selectedMatches}
            onSelectionChange={handleSelectionChange}
          />
        </CardContent>
      </Card>
    </div>
  )
}

// Summary card component
function SummaryCard({
  title,
  value,
  icon,
  variant,
}: {
  title: string
  value: number
  icon: React.ReactNode
  variant: 'default' | 'success' | 'warning' | 'error'
}) {
  const variantStyles = {
    default: 'bg-primary/10 border-primary/30 text-primary',
    success: 'bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400',
    warning: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-600 dark:text-yellow-400',
    error: 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400',
  }

  return (
    <div className={`p-3 rounded-lg border ${variantStyles[variant]}`}>
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium opacity-80">{title}</span>
      </div>
      <div className="text-xl font-bold">{formatNumber(value)}</div>
    </div>
  )
}

'use client'

/**
 * Timesheet Approvals Content Component
 *
 * Displays pending timesheets for manager approval (those with anomalies).
 * Used in the Manager Approval Dashboard as a tab.
 */

import { useState } from 'react'
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronRight,
  User,
  Calendar,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useActiveBusiness } from '@/contexts/business-context'
import { usePendingTimesheets, useApproveTimesheet, useRejectTimesheet } from '../hooks/use-timesheets'
import type { DailyEntry } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert total minutes to a human-readable "X hrs Y min" string. */
function formatMinutes(totalMinutes: number): string {
  const hrs = Math.floor(Math.abs(totalMinutes) / 60)
  const mins = Math.abs(totalMinutes) % 60
  const sign = totalMinutes < 0 ? '-' : ''
  if (hrs === 0) return `${sign}${mins} min`
  if (mins === 0) return `${sign}${hrs} hrs`
  return `${sign}${hrs} hrs ${mins} min`
}

/** Format a YYYY-MM-DD date string to a short display (e.g. "Feb 20, 2026"). */
function formatPeriodDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[month - 1]} ${day}, ${year}`
}

/** Format a YYYY-MM-DD date to short display (e.g. "Feb 20"). */
function formatShortDate(dateStr: string): string {
  const [, month, day] = dateStr.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[month - 1]} ${day}`
}

/** Format an epoch-ms timestamp to HH:MM in local time. */
function formatTime(epoch?: number): string {
  if (!epoch) return '--:--'
  const d = new Date(epoch)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TimesheetApprovalsContentProps {
  onRefreshNeeded?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TimesheetApprovalsContent({ onRefreshNeeded }: TimesheetApprovalsContentProps) {
  const { businessId } = useActiveBusiness()
  const pendingTimesheets = usePendingTimesheets(businessId ?? undefined)
  const { approveTimesheet, isLoading: isApproving, error: approveError } = useApproveTimesheet()
  const { rejectTimesheet, isLoading: isRejecting, error: rejectError } = useRejectTimesheet()

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [approveNotes, setApproveNotes] = useState('')
  const [rejectReason, setRejectReason] = useState('')
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  // ---- Loading state ----
  if (pendingTimesheets === undefined) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading pending timesheets...</span>
      </div>
    )
  }

  // ---- Empty state ----
  if (!pendingTimesheets || pendingTimesheets.length === 0) {
    return (
      <Card className="bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-700/50">
        <CardContent className="p-12 text-center">
          <CheckCircle className="w-16 h-16 mx-auto mb-4 text-green-500" />
          <h3 className="text-xl font-semibold text-green-900 dark:text-white mb-2">All Caught Up!</h3>
          <p className="text-green-700 dark:text-gray-300">No pending timesheets to review.</p>
        </CardContent>
      </Card>
    )
  }

  // ---- Handlers ----
  const handleToggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
    } else {
      setExpandedId(id)
      setApproveNotes('')
      setRejectReason('')
    }
  }

  const handleApprove = async (id: string) => {
    setActionInProgress(id)
    try {
      await approveTimesheet(id, approveNotes || undefined)
      setExpandedId(null)
      setApproveNotes('')
      onRefreshNeeded?.()
    } catch (err) {
      console.error('Failed to approve timesheet:', err)
    } finally {
      setActionInProgress(null)
    }
  }

  const handleReject = async (id: string) => {
    if (!rejectReason.trim()) return
    setActionInProgress(id)
    try {
      await rejectTimesheet(id, rejectReason)
      setExpandedId(null)
      setRejectReason('')
      onRefreshNeeded?.()
    } catch (err) {
      console.error('Failed to reject timesheet:', err)
    } finally {
      setActionInProgress(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-500/10 rounded-lg">
                <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Review</p>
                <p className="text-2xl font-bold text-foreground">{pendingTimesheets.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Timesheets List */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            Pending Timesheet Approvals
          </CardTitle>
          <CardDescription>
            Review timesheets with anomalies and approve or reject them
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {pendingTimesheets.map((ts: any) => {
              const isExpanded = expandedId === ts._id
              const anomalyCount = ts.anomalySummary?.length ?? 0
              const flaggedEntries = (ts.dailyEntries ?? []).filter(
                (entry: any) => entry.flags && entry.flags.length > 0
              )

              return (
                <div
                  key={ts._id}
                  className="rounded-lg border border-border overflow-hidden"
                >
                  {/* Collapsed row */}
                  <button
                    type="button"
                    className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
                    onClick={() => handleToggleExpand(ts._id)}
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      {/* Employee name */}
                      <div className="flex items-center gap-2 min-w-0">
                        <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="text-sm font-medium text-foreground truncate">
                          {ts.user?.fullName || ts.user?.email || 'Unknown Employee'}
                        </span>
                      </div>

                      {/* Period dates */}
                      <div className="hidden sm:flex items-center gap-1 text-sm text-muted-foreground flex-shrink-0">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{formatPeriodDate(ts.periodStartDate)} - {formatPeriodDate(ts.periodEndDate)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {/* Hours summary */}
                      <div className="hidden md:flex items-center gap-2 text-sm">
                        <span className="text-foreground">{formatMinutes(ts.totalRegularMinutes)}</span>
                        {ts.totalOvertimeMinutes > 0 && (
                          <Badge variant="warning" size="sm">
                            +{formatMinutes(ts.totalOvertimeMinutes)} OT
                          </Badge>
                        )}
                      </div>

                      {/* Anomaly count */}
                      {anomalyCount > 0 && (
                        <Badge variant="error" size="sm" className="flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {anomalyCount} {anomalyCount === 1 ? 'issue' : 'issues'}
                        </Badge>
                      )}

                      {/* Chevron */}
                      <ChevronRight
                        className={`w-4 h-4 text-muted-foreground transition-transform ${
                          isExpanded ? 'rotate-90' : ''
                        }`}
                      />
                    </div>
                  </button>

                  {/* Mobile period dates (visible only on small screens) */}
                  {!isExpanded && (
                    <div className="sm:hidden px-4 pb-3 -mt-1">
                      <span className="text-xs text-muted-foreground">
                        {formatPeriodDate(ts.periodStartDate)} - {formatPeriodDate(ts.periodEndDate)}
                      </span>
                    </div>
                  )}

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-border bg-muted/30 p-4 space-y-4">
                      {/* Period info on mobile */}
                      <div className="sm:hidden text-sm text-muted-foreground">
                        {formatPeriodDate(ts.periodStartDate)} - {formatPeriodDate(ts.periodEndDate)}
                      </div>

                      {/* Hours summary for mobile */}
                      <div className="md:hidden flex items-center gap-3 text-sm">
                        <span className="text-foreground font-medium">
                          Regular: {formatMinutes(ts.totalRegularMinutes)}
                        </span>
                        {ts.totalOvertimeMinutes > 0 && (
                          <span className="text-orange-600 dark:text-orange-400 font-medium">
                            OT: {formatMinutes(ts.totalOvertimeMinutes)}
                          </span>
                        )}
                      </div>

                      {/* Anomaly summary */}
                      {ts.anomalySummary && ts.anomalySummary.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-foreground flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                            Anomalies
                          </h4>
                          <ul className="space-y-1.5 pl-1">
                            {ts.anomalySummary.map((msg: string, idx: number) => (
                              <li key={idx} className="flex items-start gap-2 text-sm text-foreground">
                                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500" />
                                {msg}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Flagged daily entries */}
                      {flaggedEntries.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-foreground">Flagged Days</h4>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-border text-left">
                                  <th className="whitespace-nowrap px-2 py-1.5 font-medium text-muted-foreground">Date</th>
                                  <th className="whitespace-nowrap px-2 py-1.5 font-medium text-muted-foreground">In</th>
                                  <th className="whitespace-nowrap px-2 py-1.5 font-medium text-muted-foreground">Out</th>
                                  <th className="whitespace-nowrap px-2 py-1.5 font-medium text-muted-foreground text-right">Regular</th>
                                  <th className="whitespace-nowrap px-2 py-1.5 font-medium text-muted-foreground text-right">OT</th>
                                  <th className="whitespace-nowrap px-2 py-1.5 font-medium text-muted-foreground">Flags</th>
                                </tr>
                              </thead>
                              <tbody>
                                {flaggedEntries.map((entry: any) => (
                                  <tr key={entry.date} className="border-b border-border last:border-b-0">
                                    <td className="whitespace-nowrap px-2 py-1.5 text-foreground font-medium">
                                      {formatShortDate(entry.date)}
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-foreground">
                                      {formatTime(entry.checkInTime)}
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-1.5 font-mono text-foreground">
                                      {formatTime(entry.checkOutTime)}
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-1.5 text-right text-foreground">
                                      {formatMinutes(entry.regularMinutes)}
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-1.5 text-right">
                                      {entry.overtimeMinutes > 0 ? (
                                        <span className="text-orange-600 dark:text-orange-400">
                                          {formatMinutes(entry.overtimeMinutes)}
                                        </span>
                                      ) : (
                                        <span className="text-muted-foreground">--</span>
                                      )}
                                    </td>
                                    <td className="px-2 py-1.5">
                                      <div className="flex flex-wrap gap-1">
                                        {entry.flags.map((flag: string) => (
                                          <Badge key={flag} variant="warning" size="sm">
                                            {flag.replace(/_/g, ' ')}
                                          </Badge>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Notes / Reason input */}
                      <div className="space-y-2">
                        <label
                          htmlFor={`notes-${ts._id}`}
                          className="text-sm font-medium text-foreground"
                        >
                          Notes / Reason
                        </label>
                        <input
                          id={`notes-${ts._id}`}
                          type="text"
                          placeholder="Add notes (optional for approve, required for reject)"
                          value={expandedId === ts._id ? (rejectReason || approveNotes) : ''}
                          onChange={(e) => {
                            setApproveNotes(e.target.value)
                            setRejectReason(e.target.value)
                          }}
                          className="w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </div>

                      {/* Error display */}
                      {(approveError || rejectError) && actionInProgress === ts._id && (
                        <p className="text-sm text-destructive">
                          {approveError || rejectError}
                        </p>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-3 pt-1">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(ts._id)}
                          disabled={actionInProgress === ts._id}
                          className="bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                          {actionInProgress === ts._id && isApproving ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                              Approving...
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-4 h-4 mr-1.5" />
                              Approve
                            </>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleReject(ts._id)}
                          disabled={actionInProgress === ts._id || !rejectReason.trim()}
                          className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                        >
                          {actionInProgress === ts._id && isRejecting ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                              Rejecting...
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4 mr-1.5" />
                              Reject
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

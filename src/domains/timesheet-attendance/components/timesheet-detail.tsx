'use client'

import { useState } from 'react'
import { Clock, AlertTriangle, CheckCircle, ArrowLeft, Send, Calendar, Timer, MinusCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useTimesheetById, useConfirmTimesheet } from '../hooks/use-timesheets'
import type { DailyEntry, OvertimeByTier, LeaveDaySummary, Timesheet } from '../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert total minutes to a human-readable "Xh Ym" string. */
function formatMinutes(totalMinutes: number): string {
  const hrs = Math.floor(Math.abs(totalMinutes) / 60)
  const mins = Math.abs(totalMinutes) % 60
  const sign = totalMinutes < 0 ? '-' : ''
  if (hrs === 0) return `${sign}${mins} min`
  if (mins === 0) return `${sign}${hrs} hrs`
  return `${sign}${hrs} hrs ${mins} min`
}

/** Format an epoch-ms timestamp to HH:MM in local time. */
function formatTime(epoch?: number): string {
  if (!epoch) return '--:--'
  const d = new Date(epoch)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

/** Format a YYYY-MM-DD date string to a short display (e.g. "Feb 20"). */
function formatShortDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[month - 1]} ${day}`
}

/** Return the short weekday name for a YYYY-MM-DD date string. */
function getWeekday(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return d.toLocaleDateString('en-US', { weekday: 'short' })
}

// ---------------------------------------------------------------------------
// Status badge config
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<Timesheet['status'], { label: string; variant: 'info' | 'warning' | 'success' | 'primary' | 'default' }> = {
  draft: { label: 'Draft', variant: 'info' },
  confirmed: { label: 'Confirmed', variant: 'warning' },
  approved: { label: 'Approved', variant: 'success' },
  finalized: { label: 'Finalized', variant: 'success' },
  locked: { label: 'Locked', variant: 'default' },
}

// ---------------------------------------------------------------------------
// Day type display config
// ---------------------------------------------------------------------------

const DAY_TYPE_LABELS: Record<DailyEntry['dayType'], { label: string; className: string }> = {
  workday: { label: 'Workday', className: 'text-foreground' },
  rest_day: { label: 'Rest Day', className: 'text-muted-foreground' },
  public_holiday: { label: 'Holiday', className: 'text-orange-600 dark:text-orange-400' },
  leave: { label: 'Leave', className: 'text-purple-600 dark:text-purple-400' },
}

// ---------------------------------------------------------------------------
// Attendance status display config
// ---------------------------------------------------------------------------

const ATTENDANCE_STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  present: { label: 'Present', className: 'text-green-600 dark:text-green-400' },
  late: { label: 'Late', className: 'text-yellow-600 dark:text-yellow-400' },
  early_departure: { label: 'Early Departure', className: 'text-orange-600 dark:text-orange-400' },
  absent: { label: 'Absent', className: 'text-red-600 dark:text-red-400' },
  rest_day: { label: 'Rest Day', className: 'text-muted-foreground' },
  public_holiday: { label: 'Holiday', className: 'text-muted-foreground' },
  leave: { label: 'Leave', className: 'text-purple-600 dark:text-purple-400' },
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TimesheetDetailProps {
  timesheetId: string
  onClose: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TimesheetDetail({ timesheetId, onClose }: TimesheetDetailProps) {
  const timesheet = useTimesheetById(timesheetId)
  const { confirmTimesheet, isLoading: isConfirming } = useConfirmTimesheet()
  const [confirmError, setConfirmError] = useState<string | null>(null)

  const isLoading = timesheet === undefined

  // ---- Loading state ----
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading timesheet...</span>
      </div>
    )
  }

  // ---- Error / not found state ----
  if (!isLoading && !timesheet) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-destructive">Failed to load timesheet.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!timesheet) return null

  const statusCfg = STATUS_CONFIG[timesheet.status]

  async function handleConfirm() {
    setConfirmError(null)
    try {
      await confirmTimesheet(timesheetId)
    } catch (err) {
      setConfirmError(
        err instanceof Error ? err.message : 'Failed to confirm timesheet.'
      )
    }
  }

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------------ */}
      {/* Header with back button                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              Timesheet: {timesheet.periodStartDate} &ndash; {timesheet.periodEndDate}
            </h2>
            <p className="text-sm text-muted-foreground">
              {timesheet.dailyEntries.length} days
            </p>
          </div>
        </div>
        <Badge variant={statusCfg.variant}>{statusCfg.label}</Badge>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Summary stat cards                                                  */}
      {/* ------------------------------------------------------------------ */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Regular Hours */}
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
              <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Regular Hours</p>
              <p className="text-lg font-semibold text-foreground">
                {formatMinutes(timesheet.totalRegularMinutes)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Overtime Hours */}
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/10">
              <Timer className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Overtime Hours</p>
              <p className="text-lg font-semibold text-foreground">
                {formatMinutes(timesheet.totalOvertimeMinutes)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Deductions */}
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-500/10">
              <MinusCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Deductions</p>
              <p className="text-lg font-semibold text-foreground">
                {formatMinutes(timesheet.attendanceDeductionMinutes)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Net Payable */}
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-500/10">
              <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Net Payable</p>
              <p className="text-lg font-semibold text-foreground">
                {formatMinutes(timesheet.netPayableMinutes)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Anomaly alerts                                                      */}
      {/* ------------------------------------------------------------------ */}
      {timesheet.hasAnomalies && timesheet.anomalySummary && timesheet.anomalySummary.length > 0 && (
        <Card className="border-yellow-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              <span className="text-yellow-600 dark:text-yellow-400">Anomalies Detected</span>
            </CardTitle>
            <CardDescription>
              The following issues were found and may require review before confirmation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {timesheet.anomalySummary.map((msg, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm text-foreground">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-yellow-500" />
                  {msg}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Daily entries table                                                 */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            Daily Entries
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="whitespace-nowrap px-3 py-2 font-medium text-muted-foreground">Date</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium text-muted-foreground">Day Type</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium text-muted-foreground">Check In</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium text-muted-foreground">Check Out</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium text-muted-foreground text-right">Regular</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium text-muted-foreground text-right">OT</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium text-muted-foreground">Flags</th>
                </tr>
              </thead>
              <tbody>
                {timesheet.dailyEntries.map((entry) => {
                  const dayTypeCfg = DAY_TYPE_LABELS[entry.dayType as DailyEntry['dayType']]
                  const attStatusCfg = ATTENDANCE_STATUS_CONFIG[entry.attendanceStatus] ?? {
                    label: entry.attendanceStatus,
                    className: 'text-muted-foreground',
                  }

                  return (
                    <tr
                      key={entry.date}
                      className="border-b border-border last:border-b-0 hover:bg-muted/50 transition-colors"
                    >
                      {/* Date */}
                      <td className="whitespace-nowrap px-3 py-2 text-foreground">
                        <div className="flex flex-col">
                          <span className="font-medium">{formatShortDate(entry.date)}</span>
                          <span className="text-xs text-muted-foreground">{getWeekday(entry.date)}</span>
                        </div>
                      </td>

                      {/* Day Type */}
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className={dayTypeCfg.className}>
                          {dayTypeCfg.label}
                          {entry.leaveType ? ` (${entry.leaveType})` : ''}
                        </span>
                      </td>

                      {/* Check In */}
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-foreground">
                        {formatTime(entry.checkInTime)}
                      </td>

                      {/* Check Out */}
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-foreground">
                        {formatTime(entry.checkOutTime)}
                      </td>

                      {/* Regular Minutes */}
                      <td className="whitespace-nowrap px-3 py-2 text-right text-foreground">
                        {formatMinutes(entry.regularMinutes)}
                      </td>

                      {/* OT Minutes */}
                      <td className="whitespace-nowrap px-3 py-2 text-right text-foreground">
                        {entry.overtimeMinutes > 0 ? (
                          <span className="text-orange-600 dark:text-orange-400">
                            {formatMinutes(entry.overtimeMinutes)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </td>

                      {/* Attendance Status */}
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className={attStatusCfg.className}>{attStatusCfg.label}</span>
                      </td>

                      {/* Flags */}
                      <td className="px-3 py-2">
                        {entry.flags.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {entry.flags.map((flag) => (
                              <Badge
                                key={flag}
                                variant="warning"
                                size="sm"
                              >
                                {flag.replace(/_/g, ' ')}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">--</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {timesheet.dailyEntries.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">No daily entries recorded.</p>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Overtime by tier                                                    */}
      {/* ------------------------------------------------------------------ */}
      {timesheet.overtimeByTier.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Timer className="h-5 w-5 text-muted-foreground" />
              Overtime by Tier
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-3 py-2 font-medium text-muted-foreground">Tier</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground text-right">Multiplier</th>
                    <th className="px-3 py-2 font-medium text-muted-foreground text-right">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {timesheet.overtimeByTier.map((tier) => (
                    <tr
                      key={tier.tierLabel}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="px-3 py-2 text-foreground">{tier.tierLabel}</td>
                      <td className="px-3 py-2 text-right text-foreground">{tier.multiplier}x</td>
                      <td className="px-3 py-2 text-right text-foreground">{formatMinutes(tier.minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Leave days summary                                                  */}
      {/* ------------------------------------------------------------------ */}
      {timesheet.leaveDays.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              Leave Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {timesheet.leaveDays.map((leave) => (
                <div
                  key={leave.leaveType}
                  className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2"
                >
                  <span className="text-sm font-medium text-foreground">{leave.leaveType}</span>
                  <Badge variant="default" size="sm">
                    {leave.days} {leave.days === 1 ? 'day' : 'days'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Action buttons                                                      */}
      {/* ------------------------------------------------------------------ */}
      {timesheet.status === 'draft' && (
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <p className="text-sm text-muted-foreground">
              Review the entries above and confirm when ready.
            </p>
            <div className="flex items-center gap-3">
              {confirmError && (
                <p className="text-sm text-destructive">{confirmError}</p>
              )}
              <Button
                variant="primary"
                onClick={handleConfirm}
                disabled={isConfirming}
              >
                {isConfirming ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Confirming...
                  </>
                ) : (
                  <>
                    <Send className="mr-2 h-4 w-4" />
                    Confirm Timesheet
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default TimesheetDetail

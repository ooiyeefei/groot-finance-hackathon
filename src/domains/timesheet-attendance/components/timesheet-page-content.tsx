'use client'

/**
 * Timesheet Page Content - Employee View
 *
 * Main timesheet page for employees showing:
 * 1. Check-in widget at the top
 * 2. My Timesheets list below with status badges
 * 3. Click to view timesheet detail inline
 */

import { useState } from 'react'
import {
  Clock,
  FileText,
  ChevronRight,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { useActiveBusiness } from '@/contexts/business-context'
import CheckInWidget from './check-in-widget'
import { useMyTrackingStatus } from '../hooks/use-attendance'
import { useMyTimesheets } from '../hooks/use-timesheets'
import TimesheetDetail from './timesheet-detail'
import type { Timesheet } from '../types'
import type { Id } from '../../../../convex/_generated/dataModel'

// ============================================
// HELPERS
// ============================================

/**
 * Format total minutes as "X hrs Y min"
 */
function formatMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0 min'

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours === 0) return `${minutes} min`
  if (minutes === 0) return `${hours} hrs`
  return `${hours} hrs ${minutes} min`
}

/**
 * Format a period range like "Jan 1 - Jan 31, 2026"
 *
 * Both dates are parsed as UTC to avoid timezone shift.
 */
function formatPeriod(startDate: string, endDate: string): string {
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]

  // Parse as UTC to avoid timezone shift
  const start = new Date(startDate + 'T00:00:00Z')
  const end = new Date(endDate + 'T00:00:00Z')

  const startMonth = monthNames[start.getUTCMonth()]
  const startDay = start.getUTCDate()
  const endMonth = monthNames[end.getUTCMonth()]
  const endDay = end.getUTCDate()
  const endYear = end.getUTCFullYear()

  // Same month: "Jan 1 - 31, 2026"
  if (
    start.getUTCMonth() === end.getUTCMonth() &&
    start.getUTCFullYear() === end.getUTCFullYear()
  ) {
    return `${startMonth} ${startDay} - ${endDay}, ${endYear}`
  }

  // Different months: "Jan 1 - Feb 15, 2026"
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${endYear}`
}

// ============================================
// STATUS BADGE CONFIG
// ============================================

const STATUS_STYLES: Record<Timesheet['status'], string> = {
  draft:
    'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30',
  confirmed:
    'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30',
  approved:
    'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30',
  finalized:
    'bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30',
  locked:
    'bg-gray-500/10 text-gray-600 dark:text-gray-400 border border-gray-500/30',
}

const STATUS_LABELS: Record<Timesheet['status'], string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  approved: 'Approved',
  finalized: 'Finalized',
  locked: 'Locked',
}

// ============================================
// COMPONENT
// ============================================

export default function TimesheetPageContent() {
  const { businessId, isLoading: isBusinessLoading } = useActiveBusiness()
  const [selectedTimesheetId, setSelectedTimesheetId] = useState<
    Id<'timesheets'> | null
  >(null)

  const trackingStatus = useMyTrackingStatus(businessId ?? undefined)
  const isTracked = trackingStatus?.isTracked ?? false

  const timesheets = useMyTimesheets(businessId ?? undefined)
  const isTimesheetsLoading = timesheets === undefined

  // ---- Loading state ----
  if (isBusinessLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ---- No business selected ----
  if (!businessId) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">
            Please select a business to view your timesheets.
          </p>
        </CardContent>
      </Card>
    )
  }

  // ---- Tracking status still loading ----
  if (trackingStatus === undefined) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ---- Attendance tracking not enabled for this employee ----
  if (!isTracked) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-center">
            <div className="rounded-full bg-muted p-3 mb-4">
              <Info className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">
              Attendance tracking is not enabled for your account
            </p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Contact your administrator to enable timesheet and attendance tracking.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* ---- Check-In Widget (only when attendance tracking is enabled) ---- */}
      {isTracked && <CheckInWidget />}

      {/* ---- My Timesheets Card ---- */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-lg text-foreground">
              My Timesheets
            </CardTitle>
          </div>
          <CardDescription>
            View your timesheet history and details
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* Loading */}
          {isTimesheetsLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">
                Loading timesheets...
              </span>
            </div>
          )}

          {/* Empty state */}
          {!isTimesheetsLoading && (!timesheets || timesheets.length === 0) && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Calendar className="h-10 w-10 text-muted-foreground/50 mb-3" />
              <p className="text-sm font-medium text-foreground">
                No timesheets yet
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Timesheets will appear here once a pay period is generated.
              </p>
            </div>
          )}

          {/* Timesheet list */}
          {!isTimesheetsLoading && timesheets && timesheets.length > 0 && (
            <div className="divide-y divide-border">
              {timesheets.map((ts) => {
                const isSelected = selectedTimesheetId === ts._id

                return (
                  <button
                    key={ts._id}
                    type="button"
                    onClick={() =>
                      setSelectedTimesheetId(isSelected ? null : ts._id)
                    }
                    className={`w-full text-left px-3 py-3 transition-colors hover:bg-muted/50 rounded-md ${
                      isSelected ? 'bg-muted/60' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      {/* Left: Period & hours */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">
                            {formatPeriod(ts.periodStartDate, ts.periodEndDate)}
                          </span>

                          {/* Anomaly indicator */}
                          {ts.hasAnomalies && (
                            <span
                              className="inline-flex items-center gap-0.5 text-xs text-yellow-600 dark:text-yellow-400"
                              title={
                                ts.anomalySummary?.join(', ') ??
                                'Has anomalies'
                              }
                            >
                              <AlertTriangle className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">
                                Anomaly
                              </span>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatMinutes(ts.totalRegularMinutes)}
                          </span>

                          {ts.totalOvertimeMinutes > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" />
                              OT: {formatMinutes(ts.totalOvertimeMinutes)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Status badge & chevron */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          className={STATUS_STYLES[ts.status]}
                        >
                          {STATUS_LABELS[ts.status]}
                        </Badge>
                        <ChevronRight
                          className={`h-4 w-4 text-muted-foreground transition-transform ${
                            isSelected ? 'rotate-90' : ''
                          }`}
                        />
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Timesheet Detail (inline below list) ---- */}
      {selectedTimesheetId && (
        <TimesheetDetail
          timesheetId={selectedTimesheetId}
          onClose={() => setSelectedTimesheetId(null)}
        />
      )}
    </div>
  )
}

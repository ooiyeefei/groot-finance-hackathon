'use client'

import { useState, useCallback } from 'react'
import {
  Plus,
  CalendarClock,
  Pause,
  Play,
  Pencil,
  Trash2,
  Loader2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatBusinessDate } from '@/lib/utils'
import {
  useRecurringSchedules,
  useRecurringScheduleMutations,
  type RecurringScheduleListItem,
} from '../hooks/use-recurring-schedules'
import RecurringScheduleForm from './recurring-schedule-form'
import { RECURRING_FREQUENCIES } from '../types'

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function ScheduleStatusBadge({ isActive }: { isActive: boolean }) {
  if (isActive) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        Active
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground border border-border">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
      Paused
    </span>
  )
}

// ---------------------------------------------------------------------------
// Frequency label helper
// ---------------------------------------------------------------------------

const FREQUENCY_DISPLAY: Record<string, string> = {
  [RECURRING_FREQUENCIES.WEEKLY]: 'Weekly',
  [RECURRING_FREQUENCIES.MONTHLY]: 'Monthly',
  [RECURRING_FREQUENCIES.QUARTERLY]: 'Quarterly',
  [RECURRING_FREQUENCIES.YEARLY]: 'Yearly',
}

// ---------------------------------------------------------------------------
// Manager Component
// ---------------------------------------------------------------------------

export default function RecurringScheduleManager() {
  const { schedules, isLoading } = useRecurringSchedules()
  const {
    createSchedule,
    pauseSchedule,
    resumeSchedule,
    deleteSchedule,
  } = useRecurringScheduleMutations()

  const [showForm, setShowForm] = useState(false)
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Create handler
  const handleCreate = useCallback(
    async (data: Record<string, unknown>) => {
      try {
        await createSchedule(data)
        setShowForm(false)
      } catch (error) {
        console.error('[RecurringScheduleManager] Create failed:', error)
      }
    },
    [createSchedule]
  )

  // Toggle active/paused
  const handleToggleActive = useCallback(
    async (schedule: RecurringScheduleListItem) => {
      setActionLoading(schedule._id)
      try {
        if (schedule.isActive) {
          await pauseSchedule(schedule._id)
        } else {
          await resumeSchedule(schedule._id)
        }
      } catch (error) {
        console.error('[RecurringScheduleManager] Toggle failed:', error)
      } finally {
        setActionLoading(null)
      }
    },
    [pauseSchedule, resumeSchedule]
  )

  // Delete handler
  const handleDelete = useCallback(
    async (scheduleId: string) => {
      if (!window.confirm('Are you sure you want to delete this recurring schedule?')) {
        return
      }
      setActionLoading(scheduleId)
      try {
        await deleteSchedule(scheduleId)
      } catch (error) {
        console.error('[RecurringScheduleManager] Delete failed:', error)
      } finally {
        setActionLoading(null)
      }
    },
    [deleteSchedule]
  )

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
      </div>
    )
  }

  // Inline create form
  if (showForm) {
    return (
      <RecurringScheduleForm
        mode="create"
        onSubmit={handleCreate}
        onCancel={() => setShowForm(false)}
      />
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <CalendarClock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Recurring Schedules</h2>
            <p className="text-sm text-muted-foreground">
              {schedules.length === 0
                ? 'No schedules configured'
                : `${schedules.length} schedule${schedules.length === 1 ? '' : 's'}`}
            </p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Schedule
        </Button>
      </div>

      {/* Empty State */}
      {schedules.length === 0 && (
        <Card className="bg-card border-border">
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <CalendarClock className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-foreground font-semibold text-lg mb-2">
              No recurring schedules yet
            </h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
              Set up recurring invoice schedules to automatically generate invoices for your
              regular customers on a weekly, monthly, quarterly, or yearly basis.
            </p>
            <Button onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Schedule
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Desktop Table */}
      {schedules.length > 0 && (
        <>
          <div className="hidden sm:block">
            <Card className="bg-card border-border">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left text-muted-foreground font-medium py-3 px-4">
                        Customer
                      </th>
                      <th className="text-left text-muted-foreground font-medium py-3 px-4">
                        Frequency
                      </th>
                      <th className="text-left text-muted-foreground font-medium py-3 px-4">
                        Next Due
                      </th>
                      <th className="text-center text-muted-foreground font-medium py-3 px-4">
                        Generated
                      </th>
                      <th className="text-center text-muted-foreground font-medium py-3 px-4">
                        Status
                      </th>
                      <th className="text-right text-muted-foreground font-medium py-3 px-4">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedules.map((schedule) => (
                      <tr key={schedule._id} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-3 px-4">
                          <div className="font-medium text-foreground">
                            {schedule.customerName}
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {schedule.customerEmail}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-foreground">
                          {FREQUENCY_DISPLAY[schedule.frequency] ?? schedule.frequency}
                        </td>
                        <td className="py-3 px-4 text-foreground">
                          {formatBusinessDate(schedule.nextGenerationDate)}
                        </td>
                        <td className="py-3 px-4 text-center text-foreground">
                          {schedule.generationCount}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <ScheduleStatusBadge isActive={schedule.isActive} />
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => setEditingScheduleId(schedule._id)}
                              title="Edit schedule"
                            >
                              <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              disabled={actionLoading === schedule._id}
                              onClick={() => handleToggleActive(schedule)}
                              title={schedule.isActive ? 'Pause schedule' : 'Resume schedule'}
                            >
                              {actionLoading === schedule._id ? (
                                <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
                              ) : schedule.isActive ? (
                                <Pause className="w-3.5 h-3.5 text-muted-foreground" />
                              ) : (
                                <Play className="w-3.5 h-3.5 text-muted-foreground" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              disabled={actionLoading === schedule._id}
                              onClick={() => handleDelete(schedule._id)}
                              title="Delete schedule"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Mobile Cards */}
          <div className="sm:hidden space-y-3">
            {schedules.map((schedule) => (
              <Card key={schedule._id} className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-medium text-foreground">
                        {schedule.customerName}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {schedule.customerEmail}
                      </div>
                    </div>
                    <ScheduleStatusBadge isActive={schedule.isActive} />
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                    <div>
                      <span className="text-muted-foreground text-xs block">Frequency</span>
                      <span className="text-foreground">
                        {FREQUENCY_DISPLAY[schedule.frequency] ?? schedule.frequency}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs block">Next Due</span>
                      <span className="text-foreground">
                        {formatBusinessDate(schedule.nextGenerationDate)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground text-xs block">Generated</span>
                      <span className="text-foreground">{schedule.generationCount}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-1 pt-2 border-t border-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingScheduleId(schedule._id)}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={actionLoading === schedule._id}
                      onClick={() => handleToggleActive(schedule)}
                    >
                      {schedule.isActive ? (
                        <>
                          <Pause className="w-3.5 h-3.5 mr-1" />
                          Pause
                        </>
                      ) : (
                        <>
                          <Play className="w-3.5 h-3.5 mr-1" />
                          Resume
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={actionLoading === schedule._id}
                      onClick={() => handleDelete(schedule._id)}
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1 text-destructive" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

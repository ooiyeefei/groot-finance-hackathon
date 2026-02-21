'use client'

import { useState } from 'react'
import { Clock, Plus, Edit2, Trash2, Save, Timer, Calendar, Settings, Loader2, AlertCircle, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { useActiveBusiness } from '@/contexts/business-context'
import {
  useWorkSchedules,
  useCreateWorkSchedule,
  useUpdateWorkSchedule,
  useDeleteWorkSchedule,
  useOvertimeRules,
  useCreateOvertimeRule,
  useUpdateOvertimeRule,
  usePayPeriodConfig,
  useCreateOrUpdatePayPeriod,
  useMembersAttendanceStatus,
  useToggleAttendanceTracking,
} from '../hooks/use-admin-config'

// ============================================
// CONSTANTS
// ============================================

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const DAY_INDICES = [0, 1, 2, 3, 4, 5, 6] as const

const APPLICABLE_ON_OPTIONS = [
  { value: 'weekday_ot', label: 'Weekday OT' },
  { value: 'rest_day', label: 'Rest Day' },
  { value: 'public_holiday', label: 'Public Holiday' },
] as const

const DEFAULT_SCHEDULE_FORM = {
  name: '',
  startTime: '09:00',
  endTime: '18:00',
  workDays: [1, 2, 3, 4, 5] as number[],
  breakMinutes: 60,
  graceMinutes: 15,
  isDefault: false,
}

const DEFAULT_OT_FORM = {
  name: '',
  calculationBasis: 'daily' as 'daily' | 'weekly' | 'both',
  dailyThresholdHours: 8,
  weeklyThresholdHours: 40,
  requiresPreApproval: false,
  rateTiers: [{ label: 'Standard OT', multiplier: 1.5, applicableOn: 'weekday_ot' }],
}

const DEFAULT_PAY_PERIOD_FORM = {
  frequency: 'monthly' as 'weekly' | 'biweekly' | 'monthly',
  startDay: 1,
  confirmationDeadlineDays: 3,
}

// ============================================
// COMPONENT
// ============================================

export default function TimesheetSettings() {
  const { businessId } = useActiveBusiness()

  // Data queries
  const schedules = useWorkSchedules(businessId ?? undefined)
  const overtimeRules = useOvertimeRules(businessId ?? undefined)
  const payPeriodConfig = usePayPeriodConfig(businessId ?? undefined)

  // Attendance tracking
  const membersStatus = useMembersAttendanceStatus(businessId ?? undefined)
  const { toggleAttendanceTracking, isLoading: isTogglingTracking } = useToggleAttendanceTracking()

  // Mutations
  const { createWorkSchedule, isLoading: isCreatingSchedule, error: createScheduleError } = useCreateWorkSchedule()
  const { updateWorkSchedule, isLoading: isUpdatingSchedule, error: updateScheduleError } = useUpdateWorkSchedule()
  const { deleteWorkSchedule, isLoading: isDeletingSchedule } = useDeleteWorkSchedule()
  const { createOvertimeRule, isLoading: isCreatingOT, error: createOTError } = useCreateOvertimeRule()
  const { updateOvertimeRule, isLoading: isUpdatingOT, error: updateOTError } = useUpdateOvertimeRule()
  const { createOrUpdatePayPeriod, isLoading: isSavingPayPeriod, error: payPeriodError } = useCreateOrUpdatePayPeriod()
  const { addToast } = useToast()

  // Schedule form state
  const [showScheduleForm, setShowScheduleForm] = useState(false)
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)
  const [scheduleForm, setScheduleForm] = useState(DEFAULT_SCHEDULE_FORM)

  // Overtime form state
  const [showOTForm, setShowOTForm] = useState(false)
  const [editingOTRuleId, setEditingOTRuleId] = useState<string | null>(null)
  const [otForm, setOTForm] = useState(DEFAULT_OT_FORM)

  // Pay period form state
  const [showPayPeriodForm, setShowPayPeriodForm] = useState(false)
  const [payPeriodForm, setPayPeriodForm] = useState(DEFAULT_PAY_PERIOD_FORM)

  // ============================================
  // SCHEDULE HANDLERS
  // ============================================

  const openScheduleForm = (schedule?: {
    _id: string
    name: string
    startTime: string
    endTime: string
    workDays: number[]
    breakMinutes: number
    graceMinutes: number
    isDefault: boolean
  }) => {
    if (schedule) {
      setEditingScheduleId(schedule._id)
      setScheduleForm({
        name: schedule.name,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        workDays: [...schedule.workDays],
        breakMinutes: schedule.breakMinutes,
        graceMinutes: schedule.graceMinutes,
        isDefault: schedule.isDefault,
      })
    } else {
      setEditingScheduleId(null)
      setScheduleForm({ ...DEFAULT_SCHEDULE_FORM, workDays: [1, 2, 3, 4, 5] })
    }
    setShowScheduleForm(true)
  }

  const closeScheduleForm = () => {
    setShowScheduleForm(false)
    setEditingScheduleId(null)
    setScheduleForm({ ...DEFAULT_SCHEDULE_FORM, workDays: [1, 2, 3, 4, 5] })
  }

  const toggleWorkDay = (dayIndex: number) => {
    setScheduleForm((prev) => ({
      ...prev,
      workDays: prev.workDays.includes(dayIndex)
        ? prev.workDays.filter((d) => d !== dayIndex)
        : [...prev.workDays, dayIndex].sort(),
    }))
  }

  const handleSaveSchedule = async () => {
    if (!businessId || !scheduleForm.name) return

    try {
      if (editingScheduleId) {
        await updateWorkSchedule(editingScheduleId, {
          name: scheduleForm.name,
          startTime: scheduleForm.startTime,
          endTime: scheduleForm.endTime,
          workDays: scheduleForm.workDays,
          breakMinutes: scheduleForm.breakMinutes,
          graceMinutes: scheduleForm.graceMinutes,
          isDefault: scheduleForm.isDefault,
        })
        addToast({ type: 'success', title: 'Work schedule updated' })
      } else {
        await createWorkSchedule({
          businessId,
          name: scheduleForm.name,
          startTime: scheduleForm.startTime,
          endTime: scheduleForm.endTime,
          workDays: scheduleForm.workDays,
          breakMinutes: scheduleForm.breakMinutes,
          graceMinutes: scheduleForm.graceMinutes,
          isDefault: scheduleForm.isDefault,
        })
        addToast({ type: 'success', title: 'Work schedule created' })
      }
      closeScheduleForm()
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Failed to save work schedule' })
    }
  }

  const handleDeleteSchedule = async (id: string) => {
    try {
      await deleteWorkSchedule(id)
      addToast({ type: 'success', title: 'Work schedule deleted' })
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Failed to delete work schedule' })
    }
  }

  // ============================================
  // OVERTIME HANDLERS
  // ============================================

  const openOTForm = (rule?: {
    _id: string
    name: string
    calculationBasis: string
    dailyThresholdHours?: number
    weeklyThresholdHours?: number
    requiresPreApproval: boolean
    rateTiers: { label: string; multiplier: number; applicableOn: string }[]
  }) => {
    if (rule) {
      setEditingOTRuleId(rule._id)
      setOTForm({
        name: rule.name,
        calculationBasis: rule.calculationBasis as 'daily' | 'weekly' | 'both',
        dailyThresholdHours: rule.dailyThresholdHours ?? 8,
        weeklyThresholdHours: rule.weeklyThresholdHours ?? 40,
        requiresPreApproval: rule.requiresPreApproval,
        rateTiers: rule.rateTiers.map((t) => ({ ...t })),
      })
    } else {
      setEditingOTRuleId(null)
      setOTForm({ ...DEFAULT_OT_FORM, rateTiers: [{ label: 'Standard OT', multiplier: 1.5, applicableOn: 'weekday_ot' }] })
    }
    setShowOTForm(true)
  }

  const closeOTForm = () => {
    setShowOTForm(false)
    setEditingOTRuleId(null)
    setOTForm({ ...DEFAULT_OT_FORM, rateTiers: [{ label: 'Standard OT', multiplier: 1.5, applicableOn: 'weekday_ot' }] })
  }

  const addRateTier = () => {
    setOTForm((prev) => ({
      ...prev,
      rateTiers: [...prev.rateTiers, { label: '', multiplier: 1.0, applicableOn: 'weekday_ot' }],
    }))
  }

  const removeRateTier = (index: number) => {
    setOTForm((prev) => ({
      ...prev,
      rateTiers: prev.rateTiers.filter((_, i) => i !== index),
    }))
  }

  const updateRateTier = (index: number, field: string, value: string | number) => {
    setOTForm((prev) => ({
      ...prev,
      rateTiers: prev.rateTiers.map((tier, i) =>
        i === index ? { ...tier, [field]: value } : tier
      ),
    }))
  }

  const handleSaveOTRule = async () => {
    if (!businessId || !otForm.name || otForm.rateTiers.length === 0) return

    try {
      if (editingOTRuleId) {
        await updateOvertimeRule(editingOTRuleId, {
          name: otForm.name,
          calculationBasis: otForm.calculationBasis,
          dailyThresholdHours: otForm.calculationBasis !== 'weekly' ? otForm.dailyThresholdHours : undefined,
          weeklyThresholdHours: otForm.calculationBasis !== 'daily' ? otForm.weeklyThresholdHours : undefined,
          requiresPreApproval: otForm.requiresPreApproval,
          rateTiers: otForm.rateTiers,
        })
        addToast({ type: 'success', title: 'Overtime rule updated' })
      } else {
        await createOvertimeRule({
          businessId,
          name: otForm.name,
          calculationBasis: otForm.calculationBasis,
          dailyThresholdHours: otForm.calculationBasis !== 'weekly' ? otForm.dailyThresholdHours : undefined,
          weeklyThresholdHours: otForm.calculationBasis !== 'daily' ? otForm.weeklyThresholdHours : undefined,
          requiresPreApproval: otForm.requiresPreApproval,
          rateTiers: otForm.rateTiers,
        })
        addToast({ type: 'success', title: 'Overtime rule created' })
      }
      closeOTForm()
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Failed to save overtime rule' })
    }
  }

  const handleDeleteOTRule = async (id: string) => {
    try {
      await updateOvertimeRule(id, { isActive: false })
      addToast({ type: 'success', title: 'Overtime rule deleted' })
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Failed to delete overtime rule' })
    }
  }

  // ============================================
  // PAY PERIOD HANDLERS
  // ============================================

  const openPayPeriodForm = () => {
    if (payPeriodConfig) {
      setPayPeriodForm({
        frequency: payPeriodConfig.frequency as 'weekly' | 'biweekly' | 'monthly',
        startDay: payPeriodConfig.startDay,
        confirmationDeadlineDays: payPeriodConfig.confirmationDeadlineDays,
      })
    }
    setShowPayPeriodForm(true)
  }

  const handleSavePayPeriod = async () => {
    if (!businessId) return

    try {
      await createOrUpdatePayPeriod({
        businessId,
        frequency: payPeriodForm.frequency,
        startDay: payPeriodForm.startDay,
        confirmationDeadlineDays: payPeriodForm.confirmationDeadlineDays,
      })
      addToast({ type: 'success', title: 'Pay period saved' })
      setShowPayPeriodForm(false)
    } catch (err) {
      addToast({ type: 'error', title: err instanceof Error ? err.message : 'Failed to save pay period' })
    }
  }

  // ============================================
  // RENDER HELPERS
  // ============================================

  const formatWorkDays = (days: number[]) =>
    days
      .sort((a, b) => a - b)
      .map((d) => DAY_LABELS[d])
      .join(', ')

  if (!businessId) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Please select a business to configure timesheet settings.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Timesheet &amp; Attendance Settings
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure work schedules, overtime rules, and pay periods for your organization
        </p>
      </div>

      {/* ================================================ */}
      {/* SECTION 0: Employee Attendance Tracking */}
      {/* ================================================ */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Employee Tracking</CardTitle>
              <CardDescription>Enable attendance tracking for team members. Only tracked employees can check in/out.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {membersStatus === undefined ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading team members...
            </div>
          ) : membersStatus.length === 0 ? (
            <div className="text-center py-6">
              <Users className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">No active team members found</p>
            </div>
          ) : (
            <div className="space-y-2">
              {membersStatus.map((member) => (
                <div
                  key={member.membershipId}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border border-border"
                >
                  <div className="space-y-0.5">
                    <p className="font-medium text-foreground text-sm">{member.fullName}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {member.email && <span>{member.email}</span>}
                      <span className="capitalize bg-muted px-1.5 py-0.5 rounded">{member.role.replace(/_/g, ' ')}</span>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <span className="text-xs text-muted-foreground">
                      {member.isAttendanceTracked ? 'Tracked' : 'Not tracked'}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={member.isAttendanceTracked}
                      disabled={isTogglingTracking}
                      onClick={async () => {
                        try {
                          await toggleAttendanceTracking(member.membershipId, !member.isAttendanceTracked)
                          addToast({ type: 'success', title: `Tracking ${!member.isAttendanceTracked ? 'enabled' : 'disabled'} for ${member.fullName}` })
                        } catch (err) {
                          addToast({ type: 'error', title: err instanceof Error ? err.message : 'Failed to update tracking' })
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                        member.isAttendanceTracked ? 'bg-primary' : 'bg-muted-foreground/30'
                      } ${isTogglingTracking ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          member.isAttendanceTracked ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================ */}
      {/* SECTION 1: Work Schedules */}
      {/* ================================================ */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-primary" />
              <div>
                <CardTitle className="text-lg">Work Schedules</CardTitle>
                <CardDescription>Define working hours, break times, and work days</CardDescription>
              </div>
            </div>
            {!showScheduleForm && (
              <Button variant="primary" size="sm" onClick={() => openScheduleForm()}>
                <Plus className="w-4 h-4 mr-1" />
                Add Schedule
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing schedules list */}
          {schedules === undefined ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading schedules...
            </div>
          ) : schedules.length === 0 && !showScheduleForm ? (
            <div className="text-center py-6">
              <Clock className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">No work schedules configured</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add a schedule to define working hours for your team
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {schedules.map((schedule: {
                _id: string
                name: string
                startTime: string
                endTime: string
                workDays: number[]
                breakMinutes: number
                graceMinutes: number
                isDefault: boolean
              }) => (
                <div
                  key={schedule._id}
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{schedule.name}</p>
                      {schedule.isDefault && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                          Default
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span>{schedule.startTime} - {schedule.endTime}</span>
                      <span>{formatWorkDays(schedule.workDays)}</span>
                      <span>Break: {schedule.breakMinutes}min</span>
                      <span>Grace: {schedule.graceMinutes}min</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openScheduleForm(schedule)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteSchedule(schedule._id)}
                      disabled={isDeletingSchedule}
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Inline schedule form */}
          {showScheduleForm && (
            <div className="p-4 bg-muted/30 rounded-lg border border-border space-y-4">
              <h4 className="font-medium text-foreground">
                {editingScheduleId ? 'Edit Schedule' : 'New Work Schedule'}
              </h4>

              {(createScheduleError || updateScheduleError) && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-500/10 p-3 rounded-lg">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {createScheduleError || updateScheduleError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="schedule-name" className="text-foreground font-medium">
                    Schedule Name *
                  </Label>
                  <Input
                    id="schedule-name"
                    placeholder="e.g., Standard Office Hours"
                    value={scheduleForm.name}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })}
                    className="bg-input border-border text-foreground"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="start-time" className="text-foreground font-medium">
                      Start Time
                    </Label>
                    <Input
                      id="start-time"
                      type="time"
                      value={scheduleForm.startTime}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })}
                      className="bg-input border-border text-foreground"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="end-time" className="text-foreground font-medium">
                      End Time
                    </Label>
                    <Input
                      id="end-time"
                      type="time"
                      value={scheduleForm.endTime}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })}
                      className="bg-input border-border text-foreground"
                    />
                  </div>
                </div>
              </div>

              {/* Work Days */}
              <div className="space-y-2">
                <Label className="text-foreground font-medium">Work Days</Label>
                <div className="flex flex-wrap gap-2">
                  {DAY_INDICES.map((dayIndex) => (
                    <button
                      key={dayIndex}
                      type="button"
                      onClick={() => toggleWorkDay(dayIndex)}
                      className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${
                        scheduleForm.workDays.includes(dayIndex)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-input text-muted-foreground border-border hover:border-primary/50'
                      }`}
                    >
                      {DAY_LABELS[dayIndex]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="break-minutes" className="text-foreground font-medium">
                    Break (minutes)
                  </Label>
                  <Input
                    id="break-minutes"
                    type="number"
                    min={0}
                    value={scheduleForm.breakMinutes}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, breakMinutes: parseInt(e.target.value) || 0 })}
                    className="bg-input border-border text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grace-minutes" className="text-foreground font-medium">
                    Grace (minutes)
                  </Label>
                  <Input
                    id="grace-minutes"
                    type="number"
                    min={0}
                    value={scheduleForm.graceMinutes}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, graceMinutes: parseInt(e.target.value) || 0 })}
                    className="bg-input border-border text-foreground"
                  />
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scheduleForm.isDefault}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, isDefault: e.target.checked })}
                      className="rounded border-border"
                    />
                    <span className="text-sm text-foreground font-medium">Default schedule</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={closeScheduleForm}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveSchedule}
                  disabled={isCreatingSchedule || isUpdatingSchedule || !scheduleForm.name}
                >
                  {(isCreatingSchedule || isUpdatingSchedule) ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-1" />
                      {editingScheduleId ? 'Update' : 'Save'} Schedule
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================ */}
      {/* SECTION 2: Overtime Rules */}
      {/* ================================================ */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Timer className="w-5 h-5 text-primary" />
              <div>
                <CardTitle className="text-lg">Overtime Rules</CardTitle>
                <CardDescription>Configure overtime calculation and rate tiers</CardDescription>
              </div>
            </div>
            {!showOTForm && (
              <Button variant="primary" size="sm" onClick={() => openOTForm()}>
                <Plus className="w-4 h-4 mr-1" />
                Add Rule
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Existing OT rules list */}
          {overtimeRules === undefined ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading overtime rules...
            </div>
          ) : overtimeRules.length === 0 && !showOTForm ? (
            <div className="text-center py-6">
              <Timer className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-muted-foreground">No overtime rules configured</p>
              <p className="text-sm text-muted-foreground mt-1">
                Add a rule to define how overtime is calculated and paid
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {overtimeRules.map((rule: {
                _id: string
                name: string
                calculationBasis: string
                dailyThresholdHours?: number
                weeklyThresholdHours?: number
                requiresPreApproval: boolean
                rateTiers: { label: string; multiplier: number; applicableOn: string }[]
              }) => (
                <div
                  key={rule._id}
                  className="p-4 bg-muted/50 rounded-lg border border-border space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{rule.name}</p>
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full capitalize">
                        {rule.calculationBasis}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openOTForm(rule)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteOTRule(rule._id)}
                        disabled={isUpdatingOT}
                        className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    {rule.dailyThresholdHours != null && (
                      <span>Daily threshold: {rule.dailyThresholdHours}h</span>
                    )}
                    {rule.weeklyThresholdHours != null && (
                      <span>Weekly threshold: {rule.weeklyThresholdHours}h</span>
                    )}
                    <span>Pre-approval: {rule.requiresPreApproval ? 'Yes' : 'No'}</span>
                  </div>
                  {rule.rateTiers.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {rule.rateTiers.map((tier, i) => (
                        <span
                          key={i}
                          className="text-xs bg-muted px-2 py-1 rounded border border-border text-foreground"
                        >
                          {tier.label}: {tier.multiplier}x ({tier.applicableOn.replace(/_/g, ' ')})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Inline OT rule form */}
          {showOTForm && (
            <div className="p-4 bg-muted/30 rounded-lg border border-border space-y-4">
              <h4 className="font-medium text-foreground">
                {editingOTRuleId ? 'Edit Overtime Rule' : 'New Overtime Rule'}
              </h4>

              {(createOTError || updateOTError) && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-500/10 p-3 rounded-lg">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {createOTError || updateOTError}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="ot-name" className="text-foreground font-medium">
                  Rule Name *
                </Label>
                <Input
                  id="ot-name"
                  placeholder="e.g., Malaysia Standard OT"
                  value={otForm.name}
                  onChange={(e) => setOTForm({ ...otForm, name: e.target.value })}
                  className="bg-input border-border text-foreground"
                />
              </div>

              {/* Calculation Basis */}
              <div className="space-y-2">
                <Label className="text-foreground font-medium">Calculation Basis</Label>
                <div className="flex gap-4">
                  {(['daily', 'weekly', 'both'] as const).map((basis) => (
                    <label key={basis} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="calculationBasis"
                        value={basis}
                        checked={otForm.calculationBasis === basis}
                        onChange={(e) => setOTForm({ ...otForm, calculationBasis: e.target.value as 'daily' | 'weekly' | 'both' })}
                        className="border-border"
                      />
                      <span className="text-sm text-foreground capitalize">{basis}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Threshold fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {otForm.calculationBasis !== 'weekly' && (
                  <div className="space-y-2">
                    <Label htmlFor="daily-threshold" className="text-foreground font-medium">
                      Daily Threshold (hours)
                    </Label>
                    <Input
                      id="daily-threshold"
                      type="number"
                      min={0}
                      step={0.5}
                      value={otForm.dailyThresholdHours}
                      onChange={(e) => setOTForm({ ...otForm, dailyThresholdHours: parseFloat(e.target.value) || 0 })}
                      className="bg-input border-border text-foreground"
                    />
                  </div>
                )}
                {otForm.calculationBasis !== 'daily' && (
                  <div className="space-y-2">
                    <Label htmlFor="weekly-threshold" className="text-foreground font-medium">
                      Weekly Threshold (hours)
                    </Label>
                    <Input
                      id="weekly-threshold"
                      type="number"
                      min={0}
                      step={0.5}
                      value={otForm.weeklyThresholdHours}
                      onChange={(e) => setOTForm({ ...otForm, weeklyThresholdHours: parseFloat(e.target.value) || 0 })}
                      className="bg-input border-border text-foreground"
                    />
                  </div>
                )}
              </div>

              {/* Pre-approval */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={otForm.requiresPreApproval}
                  onChange={(e) => setOTForm({ ...otForm, requiresPreApproval: e.target.checked })}
                  className="rounded border-border"
                />
                <span className="text-sm text-foreground font-medium">Requires pre-approval</span>
              </label>

              {/* Rate Tiers */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-foreground font-medium">Rate Tiers</Label>
                  <Button variant="ghost" size="sm" onClick={addRateTier}>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Tier
                  </Button>
                </div>

                {otForm.rateTiers.map((tier, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-[1fr_80px_1fr_auto] gap-2 items-end"
                  >
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Label</Label>
                      <Input
                        placeholder="e.g., 1.5x OT"
                        value={tier.label}
                        onChange={(e) => updateRateTier(index, 'label', e.target.value)}
                        className="bg-input border-border text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Rate</Label>
                      <Input
                        type="number"
                        min={0}
                        step={0.25}
                        value={tier.multiplier}
                        onChange={(e) => updateRateTier(index, 'multiplier', parseFloat(e.target.value) || 0)}
                        className="bg-input border-border text-foreground"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Applicable On</Label>
                      <select
                        value={tier.applicableOn}
                        onChange={(e) => updateRateTier(index, 'applicableOn', e.target.value)}
                        className="flex h-10 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {APPLICABLE_ON_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRateTier(index)}
                      disabled={otForm.rateTiers.length <= 1}
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10 mb-0.5"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={closeOTForm}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveOTRule}
                  disabled={isCreatingOT || isUpdatingOT || !otForm.name || otForm.rateTiers.length === 0}
                >
                  {(isCreatingOT || isUpdatingOT) ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-1" />
                      {editingOTRuleId ? 'Update' : 'Save'} Rule
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ================================================ */}
      {/* SECTION 3: Pay Period */}
      {/* ================================================ */}
      <Card className="bg-card border-border">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Calendar className="w-5 h-5 text-primary" />
              <div>
                <CardTitle className="text-lg">Pay Period</CardTitle>
                <CardDescription>Set payroll frequency and confirmation deadlines</CardDescription>
              </div>
            </div>
            {!showPayPeriodForm && (
              <Button variant="primary" size="sm" onClick={openPayPeriodForm}>
                <Edit2 className="w-4 h-4 mr-1" />
                {payPeriodConfig ? 'Edit' : 'Configure'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {payPeriodConfig === undefined ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading pay period configuration...
            </div>
          ) : !showPayPeriodForm ? (
            payPeriodConfig === null ? (
              <div className="text-center py-6">
                <Calendar className="w-10 h-10 mx-auto mb-2 text-muted-foreground opacity-50" />
                <p className="text-muted-foreground">Pay period not configured</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Set up your payroll frequency and confirmation deadlines
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3 bg-muted/50 rounded-lg border border-border">
                  <p className="text-sm text-muted-foreground">Frequency</p>
                  <p className="font-medium text-foreground capitalize">{payPeriodConfig.frequency}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg border border-border">
                  <p className="text-sm text-muted-foreground">Start Day</p>
                  <p className="font-medium text-foreground">Day {payPeriodConfig.startDay}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg border border-border">
                  <p className="text-sm text-muted-foreground">Confirmation Deadline</p>
                  <p className="font-medium text-foreground">{payPeriodConfig.confirmationDeadlineDays} days</p>
                </div>
              </div>
            )
          ) : (
            /* Pay period form */
            <div className="p-4 bg-muted/30 rounded-lg border border-border space-y-4">
              <h4 className="font-medium text-foreground">
                {payPeriodConfig ? 'Edit Pay Period' : 'Configure Pay Period'}
              </h4>

              {payPeriodError && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-500/10 p-3 rounded-lg">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {payPeriodError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="pay-frequency" className="text-foreground font-medium">
                    Frequency
                  </Label>
                  <select
                    id="pay-frequency"
                    value={payPeriodForm.frequency}
                    onChange={(e) => setPayPeriodForm({ ...payPeriodForm, frequency: e.target.value as 'weekly' | 'biweekly' | 'monthly' })}
                    className="flex h-10 w-full rounded-md border border-border bg-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Biweekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="start-day" className="text-foreground font-medium">
                    Start Day
                  </Label>
                  <Input
                    id="start-day"
                    type="number"
                    min={1}
                    max={payPeriodForm.frequency === 'monthly' ? 28 : 7}
                    value={payPeriodForm.startDay}
                    onChange={(e) => setPayPeriodForm({ ...payPeriodForm, startDay: parseInt(e.target.value) || 1 })}
                    className="bg-input border-border text-foreground"
                  />
                  <p className="text-xs text-muted-foreground">
                    {payPeriodForm.frequency === 'monthly'
                      ? 'Day of month (1-28)'
                      : 'Day of week (1=Mon, 7=Sun)'}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deadline-days" className="text-foreground font-medium">
                    Confirmation Deadline
                  </Label>
                  <Input
                    id="deadline-days"
                    type="number"
                    min={1}
                    max={14}
                    value={payPeriodForm.confirmationDeadlineDays}
                    onChange={(e) => setPayPeriodForm({ ...payPeriodForm, confirmationDeadlineDays: parseInt(e.target.value) || 1 })}
                    className="bg-input border-border text-foreground"
                  />
                  <p className="text-xs text-muted-foreground">
                    Days after period ends to confirm timesheets
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setShowPayPeriodForm(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSavePayPeriod}
                  disabled={isSavingPayPeriod}
                >
                  {isSavingPayPeriod ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4 mr-1" />
                      Save Pay Period
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

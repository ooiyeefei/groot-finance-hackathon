'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { useAccountingPeriods } from '@/domains/accounting/hooks/use-accounting-periods'
import { Calendar, Lock, Unlock, Plus, AlertTriangle, Eye, ChevronLeft, ChevronRight } from 'lucide-react'
import AccountingTabs from '../accounting-tabs'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import { toast } from 'sonner'
import type { Id } from '../../../../../convex/_generated/dataModel'

type PeriodAction = 'close' | 'lock' | 'reopen' | 'create' | 'detail' | null

export default function PeriodsContent() {
  const { businessId, periods, lockStatus, isLoading, canManagePeriods, createPeriod, closePeriod, lockEntries, reopenPeriod } = useAccountingPeriods()

  const [activeAction, setActiveAction] = useState<PeriodAction>(null)
  const [selectedPeriodId, setSelectedPeriodId] = useState<Id<'accounting_periods'> | null>(null)
  const [closingNotes, setClosingNotes] = useState('')
  const [reopenReason, setReopenReason] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)

  // Create period form state
  const [newPeriodDate, setNewPeriodDate] = useState('')
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear())

  const selectedPeriod = periods.find((p: any) => p._id === selectedPeriodId)

  // Derive "Locked" status using server-side lockStatus query
  const getPeriodDisplayStatus = (period: any) => {
    if (period.status === 'open') return 'Open'
    const status = lockStatus[period.periodCode]
    if (status?.allLocked) return 'Locked'
    return 'Closed'
  }

  const getStatusBadgeClass = (displayStatus: string) => {
    switch (displayStatus) {
      case 'Open':
        return 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30'
      case 'Closed':
        return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30'
      case 'Locked':
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30'
      default:
        return ''
    }
  }

  // Get entry count from lockStatus (server-side) for lock dialog
  const getEntryCount = (periodCode: string) => {
    return lockStatus[periodCode]?.totalEntries ?? 0
  }

  const openAction = (action: PeriodAction, periodId?: Id<'accounting_periods'>) => {
    setActiveAction(action)
    setSelectedPeriodId(periodId || null)
    setClosingNotes('')
    setReopenReason('')
    setNewPeriodDate('')
    setPickerYear(new Date().getFullYear())
  }

  const closeDialog = () => {
    setActiveAction(null)
    setSelectedPeriodId(null)
    setClosingNotes('')
    setReopenReason('')
    setNewPeriodDate('')
  }

  const handleClosePeriod = async () => {
    if (!selectedPeriodId) return
    setIsProcessing(true)
    try {
      await closePeriod({
        periodId: selectedPeriodId,
        closingNotes: closingNotes || undefined,
      })
      toast.success(`Period ${selectedPeriod?.periodName} closed successfully`)
      closeDialog()
    } catch (error: any) {
      toast.error(error.message || 'Failed to close period')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleLockEntries = async () => {
    if (!selectedPeriodId) return
    setIsProcessing(true)
    try {
      await lockEntries({ periodId: selectedPeriodId })
      toast.success(`Entries in ${selectedPeriod?.periodName} locked successfully`)
      closeDialog()
    } catch (error: any) {
      toast.error(error.message || 'Failed to lock entries')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReopenPeriod = async () => {
    if (!selectedPeriodId || !reopenReason.trim()) {
      toast.error('Please provide a reason for reopening')
      return
    }
    setIsProcessing(true)
    try {
      await reopenPeriod({
        periodId: selectedPeriodId,
        reason: reopenReason.trim(),
      })
      toast.success(`Period ${selectedPeriod?.periodName} reopened`)
      closeDialog()
    } catch (error: any) {
      toast.error(error.message || 'Failed to reopen period')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleCreatePeriod = async () => {
    if (!newPeriodDate || !businessId) {
      toast.error('Please select a month')
      return
    }
    setIsProcessing(true)
    try {
      const startDate = `${newPeriodDate}-01`
      const date = new Date(startDate)
      const year = date.getFullYear()
      const month = date.getMonth()
      const lastDay = new Date(year, month + 1, 0).getDate()
      const endDate = `${newPeriodDate}-${String(lastDay).padStart(2, '0')}`
      const periodName = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      const quarter = Math.ceil((month + 1) / 3)

      await createPeriod({
        businessId: businessId as Id<'businesses'>,
        periodName,
        startDate,
        endDate,
        fiscalYear: year,
        fiscalQuarter: quarter,
      })
      toast.success(`Period ${periodName} created`)
      closeDialog()
    } catch (error: any) {
      toast.error(error.message || 'Failed to create period')
    } finally {
      setIsProcessing(false)
    }
  }

  if (isLoading) {
    return (
      <div>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/4"></div>
          <div className="h-96 bg-muted rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AccountingTabs activeTab="periods" hideNewEntryButton />

      <Card>
        <CardHeader className="border-b border-border">
          <div className="flex items-center justify-between">
            <CardTitle>Accounting Periods</CardTitle>
            {canManagePeriods && (
              <Button
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={() => openAction('create')}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Period
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {periods.length === 0 ? (
            <div className="p-12 text-center">
              <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium text-foreground mb-2">No accounting periods yet</p>
              <p className="text-muted-foreground mb-6">
                Accounting periods help you manage month-end close, prevent backdating, and prepare for audits.
                {canManagePeriods ? ' Create your first period to get started.' : ' Contact your Finance Admin to create periods.'}
              </p>
              {canManagePeriods && (
                <Button
                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  onClick={() => openAction('create')}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Period
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium text-foreground">Period</th>
                    <th className="px-6 py-3 text-center text-sm font-medium text-foreground">Status</th>
                    <th className="px-6 py-3 text-right text-sm font-medium text-foreground">Entries</th>
                    <th className="px-6 py-3 text-right text-sm font-medium text-foreground">Total Debits</th>
                    <th className="px-6 py-3 text-right text-sm font-medium text-foreground">Total Credits</th>
                    <th className="px-6 py-3 text-right text-sm font-medium text-foreground">Net</th>
                    <th className="px-6 py-3 text-right text-sm font-medium text-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((period: any) => {
                    const displayStatus = getPeriodDisplayStatus(period)
                    const net = period.totalDebits - period.totalCredits
                    return (
                      <tr
                        key={period._id}
                        className="border-b border-border hover:bg-muted/50 cursor-pointer"
                        onClick={() => openAction('detail', period._id)}
                      >
                        <td className="px-6 py-4 text-sm text-foreground font-medium">
                          {period.periodName}
                          <span className="ml-2 text-xs text-muted-foreground font-mono">
                            {period.periodCode}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge className={getStatusBadgeClass(displayStatus)}>
                            {displayStatus}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-foreground">
                          {period.journalEntryCount}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-foreground">
                          {formatCurrency(period.totalDebits, 'MYR')}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-foreground">
                          {formatCurrency(period.totalCredits, 'MYR')}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-foreground font-medium">
                          {formatCurrency(Math.abs(net), 'MYR')}
                          {net !== 0 && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              {net > 0 ? 'DR' : 'CR'}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openAction('detail', period._id)}
                              title="View period details"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            {canManagePeriods && displayStatus === 'Open' && (
                              <Button
                                size="sm"
                                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                onClick={() => openAction('close', period._id)}
                                title="Close this period — prevents new entries"
                              >
                                Close
                              </Button>
                            )}
                            {canManagePeriods && displayStatus === 'Closed' && (
                              <>
                                <Button
                                  size="sm"
                                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                  onClick={() => openAction('lock', period._id)}
                                  title="Lock all entries — prevents edits, reversals, and voids"
                                >
                                  <Lock className="w-3 h-3 mr-1" />
                                  Lock
                                </Button>
                                <Button
                                  size="sm"
                                  className="bg-primary hover:bg-primary/90 text-primary-foreground"
                                  onClick={() => openAction('reopen', period._id)}
                                  title="Reopen this period — allows new entries again"
                                >
                                  <Unlock className="w-3 h-3 mr-1" />
                                  Reopen
                                </Button>
                              </>
                            )}
                            {displayStatus === 'Locked' && (
                              <TooltipProvider delayDuration={0}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-xs text-muted-foreground cursor-help">
                                      <Lock className="w-3 h-3 inline mr-1" />
                                      Locked
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    All entries are locked — no further actions available
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {!canManagePeriods && displayStatus !== 'Locked' && (
                              <span className="text-xs text-muted-foreground" title="Only Finance Admin or Owner can manage periods">
                                View only
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Period Detail Dialog */}
      <Dialog open={activeAction === 'detail'} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Period Details: {selectedPeriod?.periodName}</DialogTitle>
          </DialogHeader>
          {selectedPeriod && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Period Code</p>
                  <p className="text-foreground font-mono">{selectedPeriod.periodCode}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className={getStatusBadgeClass(getPeriodDisplayStatus(selectedPeriod))}>
                    {getPeriodDisplayStatus(selectedPeriod)}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Start Date</p>
                  <p className="text-foreground">{formatBusinessDate(selectedPeriod.startDate)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">End Date</p>
                  <p className="text-foreground">{formatBusinessDate(selectedPeriod.endDate)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fiscal Year</p>
                  <p className="text-foreground">{selectedPeriod.fiscalYear}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Fiscal Quarter</p>
                  <p className="text-foreground">Q{selectedPeriod.fiscalQuarter || '—'}</p>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <h4 className="text-sm font-medium text-foreground mb-3">Financial Summary</h4>
                <div className="bg-muted rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Journal Entries:</span>
                    <span className="text-foreground font-medium">{selectedPeriod.journalEntryCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Debits:</span>
                    <span className="text-foreground">{formatCurrency(selectedPeriod.totalDebits, 'MYR')}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Credits:</span>
                    <span className="text-foreground">{formatCurrency(selectedPeriod.totalCredits, 'MYR')}</span>
                  </div>
                  <div className="flex justify-between text-sm border-t border-border pt-2">
                    <span className="text-muted-foreground">Net:</span>
                    <span className="text-foreground font-medium">
                      {formatCurrency(Math.abs(selectedPeriod.totalDebits - selectedPeriod.totalCredits), 'MYR')}
                      {(selectedPeriod.totalDebits - selectedPeriod.totalCredits) !== 0 && (
                        <span className="ml-1 text-xs">
                          {(selectedPeriod.totalDebits - selectedPeriod.totalCredits) > 0 ? 'DR' : 'CR'}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {selectedPeriod.closedBy && (
                <div className="border-t border-border pt-4">
                  <h4 className="text-sm font-medium text-foreground mb-3">Close Information</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Closed By:</span>
                      <span className="text-foreground">{selectedPeriod.closedByName || selectedPeriod.closedBy}</span>
                    </div>
                    {selectedPeriod.closedAt && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Closed At:</span>
                        <span className="text-foreground">{new Date(selectedPeriod.closedAt).toLocaleString()}</span>
                      </div>
                    )}
                    {selectedPeriod.closingNotes && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Notes:</span>
                        <span className="text-foreground">{selectedPeriod.closingNotes}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="text-xs text-muted-foreground border-t border-border pt-3">
                Created by {selectedPeriod.createdByName || selectedPeriod.createdBy} on {new Date(selectedPeriod.createdAt).toLocaleString()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Close Period Dialog */}
      <Dialog open={activeAction === 'close'} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close Period: {selectedPeriod?.periodName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Closing this period will calculate final totals and prevent new journal entries
              from being created with dates in this period.
            </p>

            {selectedPeriod && (
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Period:</span>
                  <span className="text-foreground font-medium">{selectedPeriod.periodName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Date Range:</span>
                  <span className="text-foreground">{selectedPeriod.startDate} to {selectedPeriod.endDate}</span>
                </div>
              </div>
            )}

            <div>
              <Label>Closing Notes (optional)</Label>
              <Textarea
                placeholder="e.g., Month-end close for March 2026"
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
              onClick={closeDialog}
            >
              Cancel
            </Button>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={handleClosePeriod}
              disabled={isProcessing}
            >
              {isProcessing ? 'Closing...' : 'Close Period'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lock Entries Dialog */}
      <Dialog open={activeAction === 'lock'} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lock Entries: {selectedPeriod?.periodName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-destructive/10 border border-destructive rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">
                This will permanently lock all journal entries in this period.
                Locked entries cannot be edited, reversed, or voided.
              </p>
            </div>

            {selectedPeriod && (
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Period:</span>
                  <span className="text-foreground font-medium">{selectedPeriod.periodName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Entries to Lock:</span>
                  <span className="text-foreground font-medium">{getEntryCount(selectedPeriod.periodCode)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Debits:</span>
                  <span className="text-foreground">{formatCurrency(selectedPeriod.totalDebits, 'MYR')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Credits:</span>
                  <span className="text-foreground">{formatCurrency(selectedPeriod.totalCredits, 'MYR')}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-border pt-2">
                  <span className="text-muted-foreground">Net:</span>
                  <span className="text-foreground font-medium">
                    {formatCurrency(Math.abs(selectedPeriod.totalDebits - selectedPeriod.totalCredits), 'MYR')}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
              onClick={closeDialog}
            >
              Cancel
            </Button>
            <Button
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={handleLockEntries}
              disabled={isProcessing}
            >
              <Lock className="w-4 h-4 mr-2" />
              {isProcessing ? 'Locking...' : 'Lock All Entries'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reopen Period Dialog */}
      <Dialog open={activeAction === 'reopen'} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reopen Period: {selectedPeriod?.periodName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400 mt-0.5 shrink-0" />
              <p className="text-sm text-yellow-600 dark:text-yellow-400">
                Reopening this period allows new entries to be posted. This may affect
                previously reported financial statements.
              </p>
            </div>

            <div>
              <Label>Reason for Reopening *</Label>
              <Textarea
                placeholder="e.g., Need to add a missed invoice for March"
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
              onClick={closeDialog}
            >
              Cancel
            </Button>
            <Button
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={handleReopenPeriod}
              disabled={isProcessing || !reopenReason.trim()}
            >
              {isProcessing ? 'Reopening...' : 'Reopen Period'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Period Dialog */}
      <Dialog open={activeAction === 'create'} onOpenChange={() => closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Accounting Period</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select a month to create a new accounting period. The period code, name, and
              date range will be generated automatically.
            </p>

            {/* Year selector */}
            <div className="flex items-center justify-between px-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPickerYear(pickerYear - 1)}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold text-foreground">{pickerYear}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPickerYear(pickerYear + 1)}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Month grid */}
            <div className="grid grid-cols-4 gap-2">
              {Array.from({ length: 12 }, (_, i) => {
                const monthNum = String(i + 1).padStart(2, '0')
                const value = `${pickerYear}-${monthNum}`
                const isSelected = newPeriodDate === value
                const monthLabel = new Date(pickerYear, i).toLocaleDateString('en-US', { month: 'short' })
                const existingPeriod = periods.find((p: any) => p.periodCode === value)
                const isDisabled = !!existingPeriod

                return (
                  <Button
                    key={value}
                    variant="ghost"
                    size="sm"
                    disabled={isDisabled}
                    onClick={() => setNewPeriodDate(value)}
                    className={`h-10 text-sm font-medium rounded-lg transition-colors ${
                      isSelected
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : isDisabled
                        ? 'text-muted-foreground/40 line-through cursor-not-allowed'
                        : 'text-foreground hover:bg-muted'
                    }`}
                    title={isDisabled ? `${existingPeriod.periodName} already exists` : `Select ${monthLabel} ${pickerYear}`}
                  >
                    {monthLabel}
                  </Button>
                )
              })}
            </div>

            {newPeriodDate && (
              <div className="bg-muted rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Period Code:</span>
                  <span className="text-foreground font-mono">{newPeriodDate}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Period Name:</span>
                  <span className="text-foreground">
                    {new Date(`${newPeriodDate}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
              onClick={closeDialog}
            >
              Cancel
            </Button>
            <Button
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={handleCreatePeriod}
              disabled={isProcessing || !newPeriodDate}
            >
              {isProcessing ? 'Creating...' : 'Create Period'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { useJournalEntries, useJournalEntry } from '@/domains/accounting/hooks/use-journal-entries'
import { useAccountingPeriods } from '@/domains/accounting/hooks/use-accounting-periods'
import { Plus, Eye, CheckCircle, XCircle, Lock } from 'lucide-react'
import Link from 'next/link'
import AccountingTabs from '../accounting-tabs'
import { formatCurrency } from '@/lib/utils/format-number'
import { formatBusinessDate } from '@/lib/utils'
import { toast } from 'sonner'
import type { Id } from '../../../../../convex/_generated/dataModel'

export default function JournalEntriesContent() {
  const { entries: entriesRaw, isLoading, postEntry, reverseEntry } = useJournalEntries()
  const { periods } = useAccountingPeriods()
  const entries = (entriesRaw || []) as any[]

  const [selectedEntryId, setSelectedEntryId] = useState<Id<'journal_entries'> | null>(null)
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false)

  const { entry: selectedEntry } = useJournalEntry(selectedEntryId)

  const handlePost = async (entryId: string) => {
    if (!confirm('Are you sure you want to post this entry? Posted entries cannot be edited.')) {
      return
    }

    try {
      await postEntry({ entryId: entryId as any })
      toast.success('Journal entry posted successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to post entry')
    }
  }

  const handleReverse = async (entryId: string) => {
    const reason = prompt('Enter reason for reversal:')
    if (!reason || !reason.trim()) {
      toast.error('Reversal reason is required')
      return
    }

    if (!confirm('Are you sure you want to reverse this entry? This will create a reversing entry.')) {
      return
    }

    try {
      const reversalDate = new Date().toISOString().split('T')[0]
      await reverseEntry({
        entryId: entryId as any,
        reason: reason.trim(),
        reversalDate
      })
      toast.success('Journal entry reversed successfully')
    } catch (error: any) {
      toast.error(error.message || 'Failed to reverse entry')
    }
  }

  const openDetailDialog = (entry: any) => {
    setSelectedEntryId(entry._id)
    setIsDetailDialogOpen(true)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'posted':
        return 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30'
      case 'draft':
        return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30'
      case 'reversed':
        return 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30'
      default:
        return ''
    }
  }

  const getPeriodBadge = (entry: any) => {
    if (!entry.fiscalPeriod) return null
    const period = (periods || []).find((p: any) => p.periodCode === entry.fiscalPeriod)
    if (!period) return null

    const isLocked = entry.isPeriodLocked
    const isClosed = period.status === 'closed'

    if (isLocked) {
      return (
        <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30 text-xs">
          <Lock className="w-3 h-3 mr-1" />
          {entry.fiscalPeriod} Locked
        </Badge>
      )
    }
    if (isClosed) {
      return (
        <Badge className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30 text-xs">
          {entry.fiscalPeriod} Closed
        </Badge>
      )
    }
    return (
      <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30 text-xs">
        {entry.fiscalPeriod} Open
      </Badge>
    )
  }

  const isEntryEditable = (entry: any) => {
    if (entry.isPeriodLocked) return false
    const period = (periods || []).find((p: any) => p.periodCode === entry.fiscalPeriod)
    if (period && period.status === 'closed') return false
    return true
  }

  const getSourceTypeBadge = (sourceType?: string) => {
    if (!sourceType || sourceType === 'manual') return null

    const labels = {
      sales_invoice: 'Invoice',
      expense_claim: 'Expense',
      ar_reconciliation: 'AR Recon',
      migrated: 'Migrated',
    }

    return (
      <Badge variant="outline" className="text-xs">
        {labels[sourceType as keyof typeof labels] || sourceType}
      </Badge>
    )
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
      <AccountingTabs activeTab="journal-entries" />

      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle>All Journal Entries</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-muted-foreground mb-4">No journal entries found</p>
              <Link href="/en/accounting/journal-entries/new">
                <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Entry
                </Button>
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-medium text-foreground">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-foreground">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-medium text-foreground">
                      Source
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-medium text-foreground">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-center text-sm font-medium text-foreground">
                      Status
                    </th>
                    <th className="px-6 py-3 text-center text-sm font-medium text-foreground">
                      Period
                    </th>
                    <th className="px-6 py-3 text-right text-sm font-medium text-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry: any) => {
                    return (
                      <tr
                        key={entry._id}
                        className="border-b border-border hover:bg-muted/50"
                      >
                        <td className="px-6 py-4 text-sm text-foreground">
                          {formatBusinessDate(entry.transactionDate)}
                        </td>
                        <td className="px-6 py-4 text-sm text-foreground">
                          <div className="flex items-center space-x-2">
                            <span>{entry.description}</span>
                            {getSourceTypeBadge(entry.sourceType)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-muted-foreground">
                          {entry.sourceId ? (
                            <span className="text-xs font-mono">
                              {entry.sourceId.slice(0, 8)}...
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-right text-foreground font-medium">
                          {formatCurrency(entry.totalDebit || 0, 'MYR')}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge className={getStatusBadge(entry.status)}>
                            {entry.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {getPeriodBadge(entry)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDetailDialog(entry)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>

                            {entry.status === 'draft' && isEntryEditable(entry) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handlePost(entry._id)}
                                title="Post entry"
                              >
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              </Button>
                            )}

                            {entry.status === 'posted' && isEntryEditable(entry) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleReverse(entry._id)}
                                title="Reverse entry"
                              >
                                <XCircle className="w-4 h-4 text-destructive" />
                              </Button>
                            )}

                            {!isEntryEditable(entry) && entry.status !== 'reversed' && (
                              <TooltipProvider delayDuration={0}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-xs text-muted-foreground cursor-help">
                                      <Lock className="w-3 h-3 inline" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {entry.isPeriodLocked
                                      ? 'Period is locked — entries cannot be edited, reversed, or voided'
                                      : 'Period is closed — reopen the period to modify entries'}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
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

      {/* Entry Detail Dialog — Compact journal entry view (Xero/Zoho style) */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-lg p-0 gap-0">
          {selectedEntry && (
            <>
              {/* Header */}
              <div className="px-5 pt-5 pb-3 border-b border-border">
                <DialogTitle className="text-base font-semibold text-foreground leading-snug">
                  {selectedEntry.description}
                </DialogTitle>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-sm text-muted-foreground">
                    {formatBusinessDate(selectedEntry.transactionDate)}
                  </span>
                  {selectedEntry.sourceType && selectedEntry.sourceType !== 'manual' && (
                    <span className="text-xs text-muted-foreground capitalize">
                      &middot; {selectedEntry.sourceType.replace(/_/g, ' ')}
                    </span>
                  )}
                  <Badge className={getStatusBadge(selectedEntry.status)}>
                    {selectedEntry.status}
                  </Badge>
                  {getPeriodBadge(selectedEntry)}
                </div>

                {/* Period lock warning */}
                {!isEntryEditable(selectedEntry) && selectedEntry.status !== 'reversed' && (
                  <div className={`rounded-md p-2 mt-2.5 flex items-center gap-2 text-xs ${
                    selectedEntry.isPeriodLocked
                      ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                      : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                  }`}>
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    {selectedEntry.isPeriodLocked
                      ? 'Locked — cannot be modified'
                      : 'Period closed — reopen to modify'}
                  </div>
                )}
              </div>

              {/* Journal Lines — table format like Xero */}
              <div className="px-5 py-3">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="text-left py-1.5 font-medium">Account</th>
                      <th className="text-right py-1.5 font-medium w-28">Debit</th>
                      <th className="text-right py-1.5 font-medium w-28">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedEntry.lines?.map((line: any, index: number) => (
                      <tr key={index} className="border-b border-border last:border-0">
                        <td className="py-2.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground shrink-0">
                              {line.accountCode}
                            </span>
                            <span className="text-foreground">{line.accountName}</span>
                          </div>
                          {line.lineDescription && (
                            <p className="text-xs text-muted-foreground mt-0.5 pl-0.5">
                              {line.lineDescription}
                            </p>
                          )}
                        </td>
                        <td className="text-right py-2.5 font-medium text-foreground align-top">
                          {line.debitAmount > 0 ? formatCurrency(line.debitAmount, 'MYR') : ''}
                        </td>
                        <td className="text-right py-2.5 font-medium text-foreground align-top">
                          {line.creditAmount > 0 ? formatCurrency(line.creditAmount, 'MYR') : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-foreground/20">
                      <td className="py-2 text-xs font-medium text-muted-foreground">Total</td>
                      <td className="text-right py-2 font-semibold text-foreground">
                        {formatCurrency(
                          selectedEntry.lines?.reduce((sum: number, l: any) => sum + (l.debitAmount || 0), 0) || 0,
                          'MYR'
                        )}
                      </td>
                      <td className="text-right py-2 font-semibold text-foreground">
                        {formatCurrency(
                          selectedEntry.lines?.reduce((sum: number, l: any) => sum + (l.creditAmount || 0), 0) || 0,
                          'MYR'
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Footer */}
              <div className="px-5 py-2.5 border-t border-border bg-muted/30 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {selectedEntry.createdBy
                    ? `Created by ${selectedEntry.createdBy} on ${new Date(selectedEntry.createdAt).toLocaleDateString()}`
                    : `Created ${new Date(selectedEntry.createdAt).toLocaleDateString()}`}
                </span>
                <div className="flex items-center gap-2">
                  {selectedEntry.status === 'draft' && isEntryEditable(selectedEntry) && (
                    <Button
                      size="sm"
                      onClick={() => { handlePost(selectedEntry._id); setIsDetailDialogOpen(false) }}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                      <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                      Post
                    </Button>
                  )}
                  {selectedEntry.status === 'posted' && isEntryEditable(selectedEntry) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { handleReverse(selectedEntry._id); setIsDetailDialogOpen(false) }}
                      className="text-destructive hover:text-destructive"
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1.5" />
                      Reverse
                    </Button>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

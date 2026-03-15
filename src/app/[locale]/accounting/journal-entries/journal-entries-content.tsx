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
                              <span className="text-xs text-muted-foreground" title="Period is closed or locked">
                                <Lock className="w-3 h-3 inline" />
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

      {/* Entry Detail Dialog */}
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Journal Entry Details</DialogTitle>
          </DialogHeader>

          {selectedEntry && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="text-foreground font-medium">
                    {formatBusinessDate(selectedEntry.transactionDate)}
                  </p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge className={getStatusBadge(selectedEntry.status)}>
                    {selectedEntry.status}
                  </Badge>
                </div>

                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">Description</p>
                  <p className="text-foreground">{selectedEntry.description}</p>
                </div>

                {selectedEntry.sourceType && selectedEntry.sourceType !== 'manual' && (
                  <>
                    <div>
                      <p className="text-sm text-muted-foreground">Source Type</p>
                      <p className="text-foreground font-medium capitalize">
                        {selectedEntry.sourceType.replace('_', ' ')}
                      </p>
                    </div>

                    <div>
                      <p className="text-sm text-muted-foreground">Source ID</p>
                      <p className="text-foreground font-mono text-sm">
                        {selectedEntry.sourceId}
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div>
                <h3 className="font-semibold text-foreground mb-3">Journal Lines</h3>
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium text-foreground">
                          Account
                        </th>
                        <th className="px-4 py-2 text-left text-sm font-medium text-foreground">
                          Description
                        </th>
                        <th className="px-4 py-2 text-right text-sm font-medium text-foreground">
                          Debit
                        </th>
                        <th className="px-4 py-2 text-right text-sm font-medium text-foreground">
                          Credit
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedEntry.lines?.map((line: any, index: number) => (
                        <tr key={index} className="border-b border-border">
                          <td className="px-4 py-2 text-sm text-foreground">
                            <span className="font-mono">{line.accountCode}</span>
                            <span className="ml-2 text-muted-foreground">
                              {line.accountName}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-sm text-muted-foreground">
                            {line.lineDescription || '—'}
                          </td>
                          <td className="px-4 py-2 text-sm text-right text-foreground">
                            {line.debitAmount > 0
                              ? formatCurrency(line.debitAmount, 'MYR')
                              : '—'}
                          </td>
                          <td className="px-4 py-2 text-sm text-right text-foreground">
                            {line.creditAmount > 0
                              ? formatCurrency(line.creditAmount, 'MYR')
                              : '—'}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-muted font-semibold">
                        <td className="px-4 py-2 text-sm text-foreground" colSpan={2}>
                          TOTAL
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-foreground">
                          {formatCurrency(
                            selectedEntry.lines?.reduce(
                              (sum: number, line: any) => sum + (line.debitAmount || 0),
                              0
                            ) || 0,
                            'MYR'
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm text-right text-foreground">
                          {formatCurrency(
                            selectedEntry.lines?.reduce(
                              (sum: number, line: any) => sum + (line.creditAmount || 0),
                              0
                            ) || 0,
                            'MYR'
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedEntry.createdBy && (
                <div className="text-xs text-muted-foreground">
                  Created by {selectedEntry.createdBy} on{' '}
                  {new Date(selectedEntry.createdAt).toLocaleString()}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

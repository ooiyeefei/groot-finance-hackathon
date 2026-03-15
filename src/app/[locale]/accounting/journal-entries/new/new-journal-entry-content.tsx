'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useChartOfAccounts } from '@/domains/accounting/hooks/use-chart-of-accounts'
import { useJournalEntries } from '@/domains/accounting/hooks/use-journal-entries'
import { useAccountingPeriods } from '@/domains/accounting/hooks/use-accounting-periods'
import { Plus, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/utils/format-number'

type JournalLine = {
  id: string
  accountCode: string
  debitAmount: number
  creditAmount: number
  lineDescription: string
}

export default function NewJournalEntryContent() {
  const router = useRouter()
  const { accounts, isLoading: accountsLoading } = useChartOfAccounts()
  const { businessId, createEntry, postEntry } = useJournalEntries()
  const { periods } = useAccountingPeriods()

  const [formData, setFormData] = useState({
    transactionDate: new Date().toISOString().split('T')[0],
    description: '',
  })

  const [lines, setLines] = useState<JournalLine[]>([
    { id: '1', accountCode: '', debitAmount: 0, creditAmount: 0, lineDescription: '' },
    { id: '2', accountCode: '', debitAmount: 0, creditAmount: 0, lineDescription: '' },
  ])

  const [isSaving, setIsSaving] = useState(false)
  const [saveAndPost, setSaveAndPost] = useState(false)

  // Check if the selected date falls in a closed period
  const getClosedPeriodWarning = () => {
    if (!formData.transactionDate || !periods) return null
    const periodCode = formData.transactionDate.slice(0, 7) // YYYY-MM
    const period = periods.find((p: any) => p.periodCode === periodCode)
    if (period && period.status === 'closed') {
      return `Cannot create entry — the period for ${period.periodName} is closed`
    }
    return null
  }
  const closedPeriodWarning = getClosedPeriodWarning()

  const addLine = () => {
    setLines([
      ...lines,
      {
        id: Date.now().toString(),
        accountCode: '',
        debitAmount: 0,
        creditAmount: 0,
        lineDescription: '',
      },
    ])
  }

  const removeLine = (id: string) => {
    if (lines.length <= 2) {
      toast.error('Journal entry must have at least 2 lines')
      return
    }
    setLines(lines.filter((line) => line.id !== id))
  }

  const updateLine = (id: string, field: keyof JournalLine, value: any) => {
    setLines(
      lines.map((line) =>
        line.id === id
          ? {
              ...line,
              [field]: value,
              // Clear opposite amount when entering debit/credit
              ...(field === 'debitAmount' && value > 0 ? { creditAmount: 0 } : {}),
              ...(field === 'creditAmount' && value > 0 ? { debitAmount: 0 } : {}),
            }
          : line
      )
    )
  }

  const calculateBalance = () => {
    const totalDebits = lines.reduce((sum, line) => sum + (line.debitAmount || 0), 0)
    const totalCredits = lines.reduce((sum, line) => sum + (line.creditAmount || 0), 0)
    const difference = Math.abs(totalDebits - totalCredits)

    return {
      totalDebits,
      totalCredits,
      difference,
      isBalanced: difference < 0.01,
    }
  }

  const validateForm = () => {
    if (!formData.description.trim()) {
      toast.error('Please enter a description')
      return false
    }

    if (!formData.transactionDate) {
      toast.error('Please select a transaction date')
      return false
    }

    const validLines = lines.filter(
      (line) =>
        line.accountCode &&
        (line.debitAmount > 0 || line.creditAmount > 0)
    )

    if (validLines.length < 2) {
      toast.error('Journal entry must have at least 2 lines with amounts')
      return false
    }

    const { isBalanced } = calculateBalance()
    if (!isBalanced) {
      toast.error('Entry is not balanced. Debits must equal Credits.')
      return false
    }

    return true
  }

  const handleSubmit = async (postImmediately: boolean) => {
    if (!validateForm()) return

    setIsSaving(true)
    setSaveAndPost(postImmediately)

    try {
      const validLines = lines
        .filter(
          (line) =>
            line.accountCode &&
            (line.debitAmount > 0 || line.creditAmount > 0)
        )
        .map((line) => ({
          accountCode: line.accountCode,
          debitAmount: line.debitAmount || 0,
          creditAmount: line.creditAmount || 0,
          lineDescription: line.lineDescription || undefined,
        }))

      const { entryId } = await createEntry({
        businessId: businessId as any,
        transactionDate: formData.transactionDate,
        description: formData.description,
        lines: validLines,
      })

      if (postImmediately) {
        await postEntry({ entryId })
        toast.success('Journal entry created and posted successfully')
      } else {
        toast.success('Journal entry saved as draft')
      }

      router.push('/en/accounting/journal-entries')
    } catch (error: any) {
      toast.error(error.message || 'Failed to create journal entry')
    } finally {
      setIsSaving(false)
      setSaveAndPost(false)
    }
  }

  const balance = calculateBalance()

  if (accountsLoading) {
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
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">New Journal Entry</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Header Information */}
          <Card>
            <CardHeader>
              <CardTitle>Entry Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Transaction Date</Label>
                <Input
                  type="date"
                  value={formData.transactionDate}
                  onChange={(e) =>
                    setFormData({ ...formData, transactionDate: e.target.value })
                  }
                />
                {closedPeriodWarning && (
                  <div className="mt-2 bg-destructive/10 border border-destructive rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                    <p className="text-sm text-destructive">{closedPeriodWarning}</p>
                  </div>
                )}
              </div>

              <div>
                <Label>Description</Label>
                <Textarea
                  placeholder="e.g., Record cash sale for March 2026"
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>

          {/* Journal Lines */}
          <Card>
            <CardHeader className="border-b border-border">
              <div className="flex items-center justify-between">
                <CardTitle>Journal Lines</CardTitle>
                <Button onClick={addLine} size="sm" className="bg-secondary hover:bg-secondary/80 text-secondary-foreground">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Line
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium text-foreground w-1/3">
                        Account
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-foreground w-1/6">
                        Debit
                      </th>
                      <th className="px-4 py-3 text-right text-sm font-medium text-foreground w-1/6">
                        Credit
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-foreground w-1/4">
                        Description
                      </th>
                      <th className="px-4 py-3 text-center text-sm font-medium text-foreground w-16">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.id} className="border-b border-border">
                        <td className="px-4 py-3">
                          <Select
                            value={line.accountCode}
                            onValueChange={(value) =>
                              updateLine(line.id, 'accountCode', value)
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select account" />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts.map((account: any) => (
                                <SelectItem key={account._id} value={account.accountCode}>
                                  {account.accountCode} - {account.accountName}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={line.debitAmount || ''}
                            onChange={(e) =>
                              updateLine(
                                line.id,
                                'debitAmount',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="text-right"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={line.creditAmount || ''}
                            onChange={(e) =>
                              updateLine(
                                line.id,
                                'creditAmount',
                                parseFloat(e.target.value) || 0
                              )
                            }
                            className="text-right"
                            min="0"
                            step="0.01"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <Input
                            placeholder="Line description"
                            value={line.lineDescription}
                            onChange={(e) =>
                              updateLine(line.id, 'lineDescription', e.target.value)
                            }
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLine(line.id)}
                            disabled={lines.length <= 2}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Balance Summary */}
        <div className="space-y-6">
          <Card className={balance.isBalanced ? 'border-green-500' : 'border-destructive'}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                {balance.isBalanced ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <span>Balanced</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-5 h-5 text-destructive" />
                    <span>Unbalanced</span>
                  </>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Total Debits:</span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(balance.totalDebits, 'MYR')}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Total Credits:</span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(balance.totalCredits, 'MYR')}
                </span>
              </div>

              <div className="border-t border-border pt-4">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-foreground">Difference:</span>
                  <span
                    className={`font-bold ${
                      balance.isBalanced
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-destructive'
                    }`}
                  >
                    {formatCurrency(balance.difference, 'MYR')}
                  </span>
                </div>
              </div>

              {!balance.isBalanced && balance.difference > 0.01 && (
                <div className="bg-destructive/10 border border-destructive rounded-lg p-3">
                  <p className="text-sm text-destructive">
                    Entry must be balanced before posting. Debits must equal Credits.
                  </p>
                </div>
              )}

              {balance.isBalanced && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3">
                  <p className="text-sm text-green-600 dark:text-green-400">
                    Entry is balanced and ready to post.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <Button
                onClick={() => handleSubmit(false)}
                disabled={isSaving || !balance.isBalanced || !!closedPeriodWarning}
                className="w-full bg-secondary hover:bg-secondary/80 text-secondary-foreground"
              >
                {isSaving && !saveAndPost ? 'Saving...' : 'Save as Draft'}
              </Button>

              <Button
                onClick={() => handleSubmit(true)}
                disabled={isSaving || !balance.isBalanced || !!closedPeriodWarning}
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {isSaving && saveAndPost ? 'Posting...' : 'Save and Post'}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Posted entries are immutable and cannot be edited.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

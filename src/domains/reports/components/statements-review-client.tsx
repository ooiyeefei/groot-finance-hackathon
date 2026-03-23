'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useActiveBusiness } from '@/contexts/business-context'
import { useRouter, useParams } from 'next/navigation'
import {
  ArrowLeft,
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  Mail,
  AlertCircle,
  Settings,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { formatCurrency } from '@/lib/utils/format-number'
import { toast } from 'sonner'
import type { DebtorStatementSend } from '../lib/types'

export default function StatementsReviewClient() {
  const router = useRouter()
  const params = useParams()
  const locale = params?.locale as string ?? 'en'
  const { businessId, isLoading: isBusinessLoading } = useActiveBusiness()

  // Current period defaults to this month
  const [periodMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isSending, setIsSending] = useState(false)

  const statements = useQuery(
    api.functions.reports.listStatementSends,
    businessId ? { businessId, periodMonth } : 'skip'
  ) as DebtorStatementSend[] | undefined

  const updateStatus = useMutation(api.functions.reports.updateStatementStatus)

  const pendingStatements = useMemo(
    () => statements?.filter((s) => s.sendStatus === 'pending') ?? [],
    [statements]
  )

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === pendingStatements.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(pendingStatements.map((s) => s._id)))
    }
  }

  const handleSendSelected = async () => {
    if (selectedIds.size === 0) return
    setIsSending(true)

    try {
      // For each selected statement, mark as sent
      // (In production, this would call a send email action)
      let sent = 0
      for (const id of selectedIds) {
        const statement = statements?.find((s) => s._id === id)
        if (!statement || !statement.customerEmail) continue

        await updateStatus({
          statementId: id,
          sendStatus: 'sent',
          sentAt: Date.now(),
        })
        sent++
      }

      toast.success(`${sent} statement${sent > 1 ? 's' : ''} sent successfully`)
      setSelectedIds(new Set())
    } catch (err: any) {
      toast.error('Failed to send statements: ' + err.message)
    } finally {
      setIsSending(false)
    }
  }

  const handlePreview = async (statement: DebtorStatementSend) => {
    try {
      const res = await fetch(`/api/v1/reports/download?reportId=${statement.reportId}`)
      const data = await res.json()
      if (data.downloadUrl) {
        window.open(data.downloadUrl, '_blank')
      }
    } catch (err) {
      toast.error('Failed to load preview')
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="text-amber-600 border-amber-500/50">Pending</Badge>
      case 'sent':
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30">Sent</Badge>
      case 'auto_sent':
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30">Auto-Sent</Badge>
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>
      case 'no_email':
        return <Badge variant="outline" className="text-red-600 border-red-500/50">No Email</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  if (isBusinessLoading || !businessId) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Navigation */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push(`/${locale}/reports`)}
      >
        <ArrowLeft className="h-4 w-4 mr-1" />
        Back to Reports
      </Button>

      {/* Auto-send banner */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="py-3 px-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Settings className="h-4 w-4 text-blue-500" />
            <span>Tired of reviewing every month? Enable auto-send to deliver statements automatically.</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-blue-600"
            onClick={() => router.push(`/${locale}/business-settings`)}
          >
            Settings
          </Button>
        </CardContent>
      </Card>

      {/* Actions bar */}
      {pendingStatements.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {pendingStatements.length} statement{pendingStatements.length > 1 ? 's' : ''} pending review for {periodMonth}
          </p>
          <div className="flex gap-2">
            <Button
              className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
              size="sm"
              onClick={toggleSelectAll}
            >
              {selectedIds.size === pendingStatements.length ? 'Deselect All' : 'Select All'}
            </Button>
            <Button
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
              size="sm"
              onClick={handleSendSelected}
              disabled={selectedIds.size === 0 || isSending}
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Selected ({selectedIds.size})
            </Button>
          </div>
        </div>
      )}

      {/* Statements table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Debtor Statements — {periodMonth}</CardTitle>
        </CardHeader>
        <CardContent>
          {statements === undefined ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : statements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Mail className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">No debtor statements for this period</p>
              <p className="text-xs mt-1">Generate monthly reports to create debtor statements</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 px-3 w-8"></th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Debtor</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Email</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Outstanding</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Invoices</th>
                    <th className="text-left py-2 px-3 font-medium text-muted-foreground">Status</th>
                    <th className="text-right py-2 px-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {statements.map((stmt) => (
                    <tr key={stmt._id} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2 px-3">
                        {stmt.sendStatus === 'pending' && (
                          <Checkbox
                            checked={selectedIds.has(stmt._id)}
                            onCheckedChange={() => toggleSelect(stmt._id)}
                          />
                        )}
                      </td>
                      <td className="py-2 px-3 font-medium">{stmt.customerName}</td>
                      <td className="py-2 px-3 text-muted-foreground text-xs">
                        {stmt.customerEmail || (
                          <span className="text-red-500 flex items-center gap-1">
                            <XCircle className="h-3 w-3" /> No email
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-medium">
                        {formatCurrency(stmt.totalOutstanding, 'MYR')}
                      </td>
                      <td className="py-2 px-3 text-right text-muted-foreground">
                        {stmt.invoiceCount}
                      </td>
                      <td className="py-2 px-3">
                        {getStatusBadge(stmt.sendStatus)}
                        {stmt.hasDisclaimer && (
                          <Badge variant="outline" className="ml-1 text-xs text-amber-600 border-amber-500/50">
                            Disclaimer
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePreview(stmt)}
                          title="Preview PDF"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

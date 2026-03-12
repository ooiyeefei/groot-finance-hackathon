'use client'

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { FileText, Package, AlertCircle, ArrowUpDown } from 'lucide-react'
import { formatBusinessDate } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/format-number'
import { useUnmatched } from '../hooks/use-matches'

type UnmatchedTab = 'pos_without_invoices' | 'invoices_without_pos' | 'pos_without_grns'
type SortOption = 'newest' | 'oldest' | 'most_overdue'

const TABS: Array<{ value: UnmatchedTab; label: string; icon: React.ElementType }> = [
  { value: 'pos_without_invoices', label: 'POs without Invoices', icon: FileText },
  { value: 'invoices_without_pos', label: 'Invoices without POs', icon: AlertCircle },
  { value: 'pos_without_grns', label: 'POs without GRNs', icon: Package },
]

function getDaysAgo(dateStr?: string, creationTime?: number): number {
  const now = Date.now()
  if (dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    return Math.floor((now - d.getTime()) / (1000 * 60 * 60 * 24))
  }
  if (creationTime) {
    return Math.floor((now - creationTime) / (1000 * 60 * 60 * 24))
  }
  return 0
}

function getItemDate(item: Record<string, unknown>, tab: UnmatchedTab): string | undefined {
  if (tab === 'invoices_without_pos') {
    return item.transactionDate as string | undefined
  }
  return (item.poDate ?? item.issuedDate) as string | undefined
}

export default function UnmatchedReport() {
  const [activeTab, setActiveTab] = useState<UnmatchedTab>('pos_without_invoices')
  const [sortBy, setSortBy] = useState<SortOption>('most_overdue')
  const { items, isLoading } = useUnmatched(activeTab)

  const sortedItems = useMemo(() => {
    if (!items.length) return items
    const sorted = [...items]
    sorted.sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
      const aDays = getDaysAgo(getItemDate(a, activeTab), a._creationTime as number | undefined)
      const bDays = getDaysAgo(getItemDate(b, activeTab), b._creationTime as number | undefined)
      if (sortBy === 'most_overdue') return bDays - aDays
      if (sortBy === 'oldest') return bDays - aDays
      return aDays - bDays // newest
    })
    return sorted
  }, [items, sortBy, activeTab])

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">Unmatched Documents</h3>

      {/* Tab selector */}
      <div className="flex items-center gap-1 bg-muted rounded-lg p-1 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.value
                  ? 'bg-card text-foreground shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Sort control */}
      <div className="flex items-center gap-2">
        <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortOption)}
          className="bg-input border border-border text-foreground rounded-md px-2 py-1 text-xs"
        >
          <option value="most_overdue">Most overdue first</option>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 bg-muted rounded animate-pulse" />
            ))}
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <p className="text-sm text-muted-foreground">No unmatched documents found</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  {activeTab === 'invoices_without_pos' ? (
                    <>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Reference</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Vendor</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Amount</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Age</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Status</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">PO Number</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Vendor</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-muted-foreground">Amount</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Age</th>
                      <th className="px-4 py-2 text-center text-xs font-medium text-muted-foreground">Status</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item: Record<string, unknown>) => {
                  const days = getDaysAgo(
                    getItemDate(item, activeTab),
                    item._creationTime as number | undefined
                  )
                  const ageColor = days > 30 ? 'text-red-600 dark:text-red-400' : days > 14 ? 'text-yellow-600 dark:text-yellow-400' : 'text-muted-foreground'
                  return (
                  <tr key={item._id as string} className="border-b border-border hover:bg-muted/30 transition-colors">
                    {activeTab === 'invoices_without_pos' ? (
                      <>
                        <td className="px-4 py-2.5 font-medium text-foreground">
                          {(item.referenceNumber ?? item.description ?? '---') as string}
                        </td>
                        <td className="px-4 py-2.5 text-foreground">{(item.vendorName ?? '---') as string}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {item.transactionDate ? formatBusinessDate(item.transactionDate as string) : '---'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-foreground">
                          {item.originalAmount
                            ? formatCurrency(item.originalAmount as number, (item.originalCurrency ?? 'MYR') as string)
                            : '---'}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-xs font-medium ${ageColor}`}>{days}d</span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge variant="warning">Unmatched</Badge>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5 font-medium text-foreground">{item.poNumber as string}</td>
                        <td className="px-4 py-2.5 text-foreground">{item.vendorName as string}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{formatBusinessDate(item.poDate as string)}</td>
                        <td className="px-4 py-2.5 text-right font-medium text-foreground">
                          {formatCurrency(item.totalAmount as number, item.currency as string)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-xs font-medium ${ageColor}`}>{days}d ago</span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge variant="warning">{((item.status as string)?.replace(/_/g, ' ')) ?? 'Open'}</Badge>
                        </td>
                      </>
                    )}
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

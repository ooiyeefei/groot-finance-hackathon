'use client'

import { formatCurrency } from '@/lib/utils/format-number'

interface MonthlyData {
  month: string
  totalSpend: number
  transactionCount: number
}

interface SpendTrendProps {
  data: MonthlyData[]
  isLoading: boolean
  currency?: string
}

export default function SpendTrend({ data, isLoading, currency = 'SGD' }: SpendTrendProps) {
  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="h-5 w-36 bg-muted rounded animate-pulse mb-4" />
        <div className="h-40 bg-muted rounded animate-pulse" />
      </div>
    )
  }

  const maxSpend = Math.max(...data.map((d) => d.totalSpend), 1)

  // Format month label from "YYYY-MM" to "MMM YY"
  const formatMonth = (month: string): string => {
    const [year, monthNum] = month.split('-')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${months[parseInt(monthNum) - 1]} ${year.slice(2)}`
  }

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Monthly Spend Trend</h3>
      </div>
      <div className="p-4">
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No trend data available</p>
        ) : (
          <div className="space-y-1">
            {/* Bar chart */}
            <div className="flex items-end gap-1 h-32">
              {data.map((item) => {
                const height = maxSpend > 0 ? (item.totalSpend / maxSpend) * 100 : 0
                return (
                  <div key={item.month} className="flex-1 flex flex-col items-center gap-1 group relative">
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-foreground text-background text-xs rounded px-2 py-1 whitespace-nowrap z-10">
                      {formatCurrency(item.totalSpend, currency)}
                      <br />
                      {item.transactionCount} txns
                    </div>
                    <div
                      className="w-full bg-primary/80 hover:bg-primary rounded-t transition-all cursor-default"
                      style={{ height: `${Math.max(height, 2)}%` }}
                    />
                  </div>
                )
              })}
            </div>
            {/* X-axis labels */}
            <div className="flex gap-1">
              {data.map((item) => (
                <div key={item.month} className="flex-1 text-center text-[10px] text-muted-foreground">
                  {formatMonth(item.month)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

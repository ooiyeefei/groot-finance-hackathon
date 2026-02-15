'use client'

import { formatCurrency } from '@/lib/utils/format-number'

interface CategoryData {
  category: string
  totalSpend: number
  percentOfTotal: number
  transactionCount: number
}

interface CategoryBreakdownProps {
  categories: CategoryData[]
  isLoading: boolean
  currency?: string
}

const CATEGORY_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-orange-500', 'bg-indigo-500',
]

export default function CategoryBreakdown({
  categories,
  isLoading,
  currency = 'SGD',
}: CategoryBreakdownProps) {
  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="h-5 w-40 bg-muted rounded animate-pulse mb-4" />
        <div className="h-32 bg-muted rounded animate-pulse" />
      </div>
    )
  }

  const total = categories.reduce((sum, c) => sum + c.totalSpend, 0)

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">Spend by Category</h3>
      </div>
      <div className="p-4">
        {categories.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No category data available</p>
        ) : (
          <>
            {/* Stacked bar representation */}
            <div className="flex h-4 rounded-full overflow-hidden mb-4">
              {categories.map((cat, i) => (
                <div
                  key={cat.category}
                  className={`${CATEGORY_COLORS[i % CATEGORY_COLORS.length]} transition-all`}
                  style={{ width: `${cat.percentOfTotal}%` }}
                  title={`${cat.category}: ${cat.percentOfTotal.toFixed(1)}%`}
                />
              ))}
            </div>

            {/* Legend */}
            <div className="space-y-2">
              {categories.map((cat, i) => (
                <div key={cat.category} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${CATEGORY_COLORS[i % CATEGORY_COLORS.length]}`} />
                    <span className="text-foreground">{cat.category}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground text-xs">{cat.percentOfTotal.toFixed(1)}%</span>
                    <span className="text-foreground font-medium">{formatCurrency(cat.totalSpend, currency)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

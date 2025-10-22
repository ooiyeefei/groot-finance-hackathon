/**
 * Expense Analytics Component
 * Implements Otto's financial reporting with Mel's visualization design
 */

'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, DollarSign, PieChart } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface ExpenseAnalyticsProps {
  scope: 'personal' | 'department' | 'company'
}

interface AnalyticsData {
  monthly_trends: {
    month: string
    total_amount: number
    claims_count: number
    approved_amount: number
    approved_count: number
  }[]
  category_breakdown: {
    category: string
    category_name?: string  // Dynamic category name from admin config
    total_amount: number
    percentage: number
    claims_count: number
    approved_amount: number
  }[]
  status_summary: {
    total: number
    draft: number
    submitted: number
    approved: number
    rejected: number
    reimbursed: number
  }
  total_amount: number
  currency: string
  scope: string
  user_role: {
    employee: boolean
    manager: boolean
    admin: boolean
  }
  trends: {
    total_amount_change: number
    total_claims_change: number
    avg_claim_change: number
    pending_approval_change: number
  }
}

export default function ExpenseAnalytics({ scope }: ExpenseAnalyticsProps) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const response = await fetch(`/api/v1/expense-claims/analytics?scope=${scope}`)
        const result = await response.json()
        
        if (result.success) {
          setData(result.data)
        } else {
          console.error('Analytics API error:', result.error)
          setData(null)
        }
      } catch (error) {
        console.error('Failed to fetch analytics:', error)
        setData(null)
      } finally {
        setLoading(false)
      }
    }

    fetchAnalytics()
  }, [scope])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse bg-record-layer-2 h-32 rounded"></div>
        <div className="animate-pulse bg-record-layer-2 h-48 rounded"></div>
      </div>
    )
  }

  if (!data) {
    return (
      <Card className="bg-record-layer-1 border-record-border">
        <CardContent className="p-6 text-center text-muted-foreground">
          <PieChart className="w-12 h-12 mx-auto mb-4" />
          <p>No analytics data available</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryMetric
          title="Total Amount"
          value={`${data.currency === 'SGD' ? 'S$' : '$'}${(data.total_amount || 0).toFixed(2)}`}
          change={data.trends?.total_amount_change || 0}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <SummaryMetric
          title="Total Claims"
          value={(data.status_summary.total || 0).toString()}
          change={data.trends?.total_claims_change || 0}
          icon={<PieChart className="w-5 h-5" />}
        />
        <SummaryMetric
          title="Avg Claim"
          value={`${data.currency === 'SGD' ? 'S$' : '$'}${data.status_summary.total > 0 ? (data.total_amount / data.status_summary.total).toFixed(2) : '0.00'}`}
          change={data.trends?.avg_claim_change || 0}
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <SummaryMetric
          title="Pending Approval"
          value={(data.status_summary.submitted || 0).toString()}
          change={data.trends?.pending_approval_change || 0}
          icon={<TrendingUp className="w-5 h-5" />}
        />
      </div>

      {/* Category Breakdown */}
      <Card className="bg-record-layer-1 border-record-border">
        <CardHeader>
          <CardTitle className="text-foreground">Expense Categories</CardTitle>
          <CardDescription>
            {scope === 'personal' && 'Your expense breakdown by category'}
            {scope === 'department' && 'Department expense breakdown by category'}
            {scope === 'company' && 'Company-wide expense breakdown by category'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.category_breakdown.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <PieChart className="w-12 h-12 mx-auto mb-4" />
              <p>No category data available</p>
              <p className="text-sm">Submit some expense claims to see category breakdown</p>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-6 items-start">
              {/* Pie Chart */}
              <div className="flex-shrink-0">
                <ExpensePieChart categories={data.category_breakdown} currency={data.currency} />
              </div>

              {/* Legend */}
              <div className="flex-1 space-y-3">
                <h4 className="text-sm font-medium text-muted-foreground mb-3">Category Details</h4>
                {data.category_breakdown.map((item, index) => (
                  <div key={item.category} className="flex items-center justify-between p-2 bg-accent/50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: getPieChartColor(index) }}
                      />
                      <div>
                        <div className="text-foreground text-sm font-medium">
                          {item.category_name || item.category}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {item.claims_count} claims
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-foreground font-semibold text-sm">
                        ${item.total_amount.toFixed(2)}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        {item.percentage.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Trends */}
      <Card className="bg-record-layer-1 border-record-border">
        <CardHeader>
          <CardTitle className="text-foreground">Monthly Trends</CardTitle>
          <CardDescription>Expense trends over the last 3 months</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.monthly_trends.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <TrendingUp className="w-12 h-12 mx-auto mb-4" />
                <p>No trend data available</p>
                <p className="text-sm">Submit expense claims over multiple months to see trends</p>
              </div>
            ) : (
              data.monthly_trends.map((month, index) => (
                <div key={month.month} className="flex items-center justify-between p-3 bg-accent rounded-lg">
                  <div>
                    <div className="text-foreground font-medium">
                      {new Date(month.month + '-01').toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long' 
                      })}
                    </div>
                    <div className="text-muted-foreground text-sm">{month.claims_count} claims</div>
                  </div>

                  <div className="text-right">
                    <div className="text-foreground font-semibold">${month.total_amount.toFixed(2)}</div>
                    <div className="text-muted-foreground text-sm">
                      Approved: ${month.approved_amount.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Color palette for pie chart segments
const PIE_CHART_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#84CC16', // Lime
  '#EC4899', // Pink
  '#6B7280', // Gray
]

function getPieChartColor(index: number): string {
  return PIE_CHART_COLORS[index % PIE_CHART_COLORS.length]
}

interface ExpensePieChartProps {
  categories: {
    category: string
    category_name?: string
    total_amount: number
    percentage: number
    claims_count: number
  }[]
  currency: string
}

function ExpensePieChart({ categories, currency }: ExpensePieChartProps) {
  const size = 200
  const strokeWidth = 40
  const radius = (size - strokeWidth) / 2
  const center = size / 2

  let accumulatedPercentage = 0

  return (
    <div className="relative">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="transparent"
          stroke="hsl(var(--muted-foreground))"
          strokeWidth={strokeWidth}
        />

        {categories.map((category, index) => {
          const percentage = category.percentage
          const circumference = 2 * Math.PI * radius
          const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`
          const strokeDashoffset = -((accumulatedPercentage / 100) * circumference)

          const segment = (
            <circle
              key={category.category}
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke={getPieChartColor(index)}
              strokeWidth={strokeWidth}
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-300 hover:opacity-80"
            />
          )

          accumulatedPercentage += percentage
          return segment
        })}
      </svg>

      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-foreground text-lg font-bold">
          {currency === 'SGD' ? 'S$' : '$'}{categories.reduce((sum, cat) => sum + cat.total_amount, 0).toFixed(0)}
        </div>
        <div className="text-muted-foreground text-xs">Total</div>
      </div>
    </div>
  )
}

function SummaryMetric({ title, value, change, icon }: {
  title: string
  value: string
  change: number
  icon: React.ReactNode
}) {
  const isPositive = change >= 0

  // Determine translucent background based on content type - consistent with layer1-2-3 design
  const getCardStyle = (title: string) => {
    switch (title) {
      case 'Pending Approval':
        // Yellow translucent for pending/warning states (both light and dark)
        return 'bg-yellow-50 dark:bg-gray-800 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-700/50'
      case 'Total Amount':
      case 'Total Claims':
      case 'Avg Claim':
      default:
        // Blue translucent for neutral info (both light and dark)
        return 'bg-blue-50 dark:bg-gray-800 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-700/50'
    }
  }

  const getTextColor = (title: string) => {
    switch (title) {
      case 'Pending Approval':
        // Light mode: dark text, Dark mode: white text
        return 'text-yellow-900 dark:text-white'
      case 'Total Amount':
      case 'Total Claims':
      case 'Avg Claim':
      default:
        // Light mode: dark text, Dark mode: white text
        return 'text-blue-900 dark:text-white'
    }
  }

  const getLabelColor = (title: string) => {
    switch (title) {
      case 'Pending Approval':
        // Light mode: medium colored text, Dark mode: light gray text
        return 'text-yellow-700 dark:text-gray-300'
      case 'Total Amount':
      case 'Total Claims':
      case 'Avg Claim':
      default:
        // Light mode: medium colored text, Dark mode: light gray text
        return 'text-blue-700 dark:text-gray-300'
    }
  }

  const getIconColor = (title: string) => {
    switch (title) {
      case 'Pending Approval':
        return 'text-yellow-700 dark:text-gray-400'
      case 'Total Amount':
      case 'Total Claims':
      case 'Avg Claim':
      default:
        return 'text-blue-700 dark:text-gray-400'
    }
  }

  return (
    <Card className={getCardStyle(title)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-sm font-medium ${getLabelColor(title)}`}>{title}</p>
            <p className={`text-xl font-bold ${getTextColor(title)}`}>{value}</p>
            <div className={`flex items-center text-xs mt-1 ${
              isPositive ? 'text-success' : 'text-danger'
            }`}>
              {isPositive ? (
                <TrendingUp className="w-3 h-3 mr-1" />
              ) : (
                <TrendingDown className="w-3 h-3 mr-1" />
              )}
              {isPositive ? '+' : ''}{change.toFixed(1)}%
            </div>
          </div>
          <div className={getIconColor(title)}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
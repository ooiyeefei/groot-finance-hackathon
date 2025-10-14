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
        <div className="animate-pulse bg-gray-700 h-32 rounded"></div>
        <div className="animate-pulse bg-gray-700 h-48 rounded"></div>
      </div>
    )
  }

  if (!data) {
    return (
      <Card className="bg-gray-800 border-gray-700">
        <CardContent className="p-6 text-center text-gray-400">
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
          change={0} // No change data available in current API
          icon={<DollarSign className="w-5 h-5" />}
        />
        <SummaryMetric
          title="Total Claims"
          value={(data.status_summary.total || 0).toString()}
          change={0} // No change data available in current API
          icon={<PieChart className="w-5 h-5" />}
        />
        <SummaryMetric
          title="Avg Claim"
          value={`${data.currency === 'SGD' ? 'S$' : '$'}${data.status_summary.total > 0 ? (data.total_amount / data.status_summary.total).toFixed(2) : '0.00'}`}
          change={0} // No change data available for avg claim
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <SummaryMetric
          title="Pending Approval"
          value={(data.status_summary.submitted || 0).toString()}
          change={0}
          icon={<TrendingUp className="w-5 h-5" />}
        />
      </div>

      {/* Category Breakdown */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">Expense Categories</CardTitle>
          <CardDescription>
            {scope === 'personal' && 'Your expense breakdown by category'}
            {scope === 'department' && 'Department expense breakdown by category'}
            {scope === 'company' && 'Company-wide expense breakdown by category'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.category_breakdown.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <PieChart className="w-12 h-12 mx-auto mb-4" />
              <p>No category data available</p>
              <p className="text-sm">Submit some expense claims to see category breakdown</p>
            </div>
          ) : (
            data.category_breakdown.map((item, index) => (
              <div key={item.category} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-gray-700 text-gray-300">
                      📊 {item.category_name || item.category}
                    </Badge>
                    <span className="text-gray-400 text-sm">({item.claims_count} claims)</span>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-semibold">${item.total_amount.toFixed(2)}</div>
                    <div className="text-gray-400 text-sm">{item.percentage.toFixed(1)}%</div>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.max(item.percentage, 2)}%` }}
                  ></div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Monthly Trends */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">Monthly Trends</CardTitle>
          <CardDescription>Expense trends over the last 3 months</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.monthly_trends.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <TrendingUp className="w-12 h-12 mx-auto mb-4" />
                <p>No trend data available</p>
                <p className="text-sm">Submit expense claims over multiple months to see trends</p>
              </div>
            ) : (
              data.monthly_trends.map((month, index) => (
                <div key={month.month} className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
                  <div>
                    <div className="text-white font-medium">
                      {new Date(month.month + '-01').toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'long' 
                      })}
                    </div>
                    <div className="text-gray-400 text-sm">{month.claims_count} claims</div>
                  </div>

                  <div className="text-right">
                    <div className="text-white font-semibold">${month.total_amount.toFixed(2)}</div>
                    <div className="text-gray-400 text-sm">
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

function SummaryMetric({ title, value, change, icon }: {
  title: string
  value: string
  change: number
  icon: React.ReactNode
}) {
  const isPositive = change >= 0
  
  return (
    <Card className="bg-gray-800 border-gray-700">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm font-medium">{title}</p>
            <p className="text-white text-xl font-bold">{value}</p>
            <div className={`flex items-center text-xs mt-1 ${
              isPositive ? 'text-green-400' : 'text-red-400'
            }`}>
              {isPositive ? (
                <TrendingUp className="w-3 h-3 mr-1" />
              ) : (
                <TrendingDown className="w-3 h-3 mr-1" />
              )}
              {isPositive ? '+' : ''}{change.toFixed(1)}%
            </div>
          </div>
          <div className="text-blue-500">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
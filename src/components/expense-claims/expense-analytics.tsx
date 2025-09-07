/**
 * Expense Analytics Component
 * Implements Otto's financial reporting with Mel's visualization design
 */

'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, DollarSign, PieChart } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EXPENSE_CATEGORY_CONFIG } from '@/types/expense-claims'

interface ExpenseAnalyticsProps {
  scope: 'personal' | 'department' | 'company'
}

interface AnalyticsData {
  monthly_trends: {
    month: string
    total_amount: number
    claim_count: number
    change_percent: number
  }[]
  category_breakdown: {
    category: string
    amount: number
    percentage: number
    count: number
  }[]
  summary: {
    total_amount: number
    total_claims: number
    avg_claim_amount: number
    month_over_month_change: number
  }
}

export default function ExpenseAnalytics({ scope }: ExpenseAnalyticsProps) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        // TODO: Replace with actual API call
        // const response = await fetch(`/api/expense-claims/analytics?scope=${scope}`)
        // const result = await response.json()
        
        // Mock data for demonstration
        const mockData: AnalyticsData = {
          monthly_trends: [
            { month: '2024-01', total_amount: 2450.50, claim_count: 12, change_percent: 15.2 },
            { month: '2024-02', total_amount: 2890.75, claim_count: 15, change_percent: 18.0 },
            { month: '2024-03', total_amount: 3125.25, claim_count: 18, change_percent: 8.1 }
          ],
          category_breakdown: [
            { category: 'travel_accommodation', amount: 1200.50, percentage: 38.4, count: 5 },
            { category: 'entertainment', amount: 850.75, percentage: 27.2, count: 8 },
            { category: 'petrol', amount: 675.25, percentage: 21.6, count: 12 },
            { category: 'toll', amount: 250.50, percentage: 8.0, count: 15 },
            { category: 'other', amount: 148.25, percentage: 4.8, count: 3 }
          ],
          summary: {
            total_amount: 3125.25,
            total_claims: 43,
            avg_claim_amount: 72.68,
            month_over_month_change: 8.1
          }
        }
        
        setData(mockData)
      } catch (error) {
        console.error('Failed to fetch analytics:', error)
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
          value={`$${data.summary.total_amount.toFixed(2)}`}
          change={data.summary.month_over_month_change}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <SummaryMetric
          title="Total Claims"
          value={data.summary.total_claims.toString()}
          change={data.summary.month_over_month_change}
          icon={<PieChart className="w-5 h-5" />}
        />
        <SummaryMetric
          title="Avg Claim"
          value={`$${data.summary.avg_claim_amount.toFixed(2)}`}
          change={-2.5} // Mock negative change
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <SummaryMetric
          title="Monthly Change"
          value={`${data.summary.month_over_month_change > 0 ? '+' : ''}${data.summary.month_over_month_change.toFixed(1)}%`}
          change={data.summary.month_over_month_change}
          icon={data.summary.month_over_month_change >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
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
          {data.category_breakdown.map((item, index) => {
            const categoryConfig = EXPENSE_CATEGORY_CONFIG[item.category as keyof typeof EXPENSE_CATEGORY_CONFIG]
            
            return (
              <div key={item.category} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-gray-700 text-gray-300">
                      {categoryConfig?.icon} {categoryConfig?.label}
                    </Badge>
                    <span className="text-gray-400 text-sm">({item.count} claims)</span>
                  </div>
                  <div className="text-right">
                    <div className="text-white font-semibold">${item.amount.toFixed(2)}</div>
                    <div className="text-gray-400 text-sm">{item.percentage.toFixed(1)}%</div>
                  </div>
                </div>
                
                {/* Progress Bar */}
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${item.percentage}%` }}
                  ></div>
                </div>
              </div>
            )
          })}
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
            {data.monthly_trends.map((month, index) => (
              <div key={month.month} className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
                <div>
                  <div className="text-white font-medium">
                    {new Date(month.month + '-01').toLocaleDateString('en-US', { 
                      year: 'numeric', 
                      month: 'long' 
                    })}
                  </div>
                  <div className="text-gray-400 text-sm">{month.claim_count} claims</div>
                </div>
                
                <div className="text-right">
                  <div className="text-white font-semibold">${month.total_amount.toFixed(2)}</div>
                  <div className={`text-sm flex items-center ${
                    month.change_percent >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {month.change_percent >= 0 ? (
                      <TrendingUp className="w-3 h-3 mr-1" />
                    ) : (
                      <TrendingDown className="w-3 h-3 mr-1" />
                    )}
                    {month.change_percent > 0 ? '+' : ''}{month.change_percent.toFixed(1)}%
                  </div>
                </div>
              </div>
            ))}
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
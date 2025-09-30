/**
 * Expense Analytics Component
 * Implements Otto's financial reporting with Mel's visualization design
 */

'use client'

import { useState, useEffect } from 'react'
import { useTranslations } from 'next-intl'
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
    claim_count: number
    change_percent: number
  }[]
  category_breakdown: {
    category: string
    category_name?: string  // Dynamic category name from admin config
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
  const t = useTranslations('analytics')
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const response = await fetch(`/api/expense-claims/analytics?scope=${scope}`)
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
          <p>{t('noDataAvailable')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryMetric
          title={t('totalAmount')}
          value={`$${(data.summary.total_amount || 0).toFixed(2)}`}
          change={data.summary.month_over_month_change || 0}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <SummaryMetric
          title={t('totalClaims')}
          value={(data.summary.total_claims || 0).toString()}
          change={data.summary.month_over_month_change || 0}
          icon={<PieChart className="w-5 h-5" />}
        />
        <SummaryMetric
          title={t('avgClaim')}
          value={`$${(data.summary.avg_claim_amount || 0).toFixed(2)}`}
          change={0} // No change data available for avg claim
          icon={<TrendingUp className="w-5 h-5" />}
        />
        <SummaryMetric
          title={t('monthlyChange')}
          value={`${(data.summary.month_over_month_change || 0) > 0 ? '+' : ''}${(data.summary.month_over_month_change || 0).toFixed(1)}%`}
          change={data.summary.month_over_month_change || 0}
          icon={(data.summary.month_over_month_change || 0) >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
        />
      </div>

      {/* Category Breakdown */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-white">{t('expenseCategories')}</CardTitle>
          <CardDescription>
            {scope === 'personal' && t('personalExpenseBreakdown')}
            {scope === 'department' && t('departmentExpenseBreakdown')}
            {scope === 'company' && t('companyExpenseBreakdown')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.category_breakdown.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <PieChart className="w-12 h-12 mx-auto mb-4" />
              <p>{t('noCategoryData')}</p>
              <p className="text-sm">{t('submitClaimsToSeeCategories')}</p>
            </div>
          ) : (
            data.category_breakdown.map((item, index) => (
              <div key={item.category} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="bg-gray-700 text-gray-300">
                      📊 {item.category_name || item.category}
                    </Badge>
                    <span className="text-gray-400 text-sm">({item.count} {t('claims')})</span>
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
          <CardTitle className="text-white">{t('monthlyTrends')}</CardTitle>
          <CardDescription>{t('expenseTrendsDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {data.monthly_trends.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                <TrendingUp className="w-12 h-12 mx-auto mb-4" />
                <p>{t('noTrendData')}</p>
                <p className="text-sm">{t('submitClaimsToSeeTrends')}</p>
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
                    <div className="text-gray-400 text-sm">{month.claim_count} {t('claims')}</div>
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
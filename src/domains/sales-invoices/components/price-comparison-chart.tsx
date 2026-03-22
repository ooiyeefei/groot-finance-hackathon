'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { formatCurrency } from '@/lib/utils/format-number'

interface PriceComparisonChartProps {
  sellingData: Array<{ date: string; unitPrice: number }>
  purchaseData: Array<{ date: string; unitPrice: number }>
  currency: string
}

export default function PriceComparisonChart({
  sellingData,
  purchaseData,
  currency,
}: PriceComparisonChartProps) {
  // Merge data by date
  const dateMap = new Map<string, { sellingPrice?: number; purchaseCost?: number }>()

  for (const d of sellingData) {
    const existing = dateMap.get(d.date) || {}
    dateMap.set(d.date, { ...existing, sellingPrice: d.unitPrice })
  }

  for (const d of purchaseData) {
    const existing = dateMap.get(d.date) || {}
    dateMap.set(d.date, { ...existing, purchaseCost: d.unitPrice })
  }

  const chartData = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date,
      dateLabel: new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
      sellingPrice: values.sellingPrice,
      purchaseCost: values.purchaseCost,
    }))

  if (chartData.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        No data available for comparison chart.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
        <XAxis dataKey="dateLabel" className="text-muted-foreground" tick={{ fontSize: 12 }} />
        <YAxis
          className="text-muted-foreground"
          tick={{ fontSize: 12 }}
          tickFormatter={(v) => formatCurrency(v, currency)}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
          }}
          labelStyle={{ color: 'hsl(var(--foreground))' }}
          formatter={(value: number, name: string) => [
            formatCurrency(value, currency),
            name === 'sellingPrice' ? 'Selling Price' : 'Purchase Cost',
          ]}
        />
        <Legend
          formatter={(value) =>
            value === 'sellingPrice' ? 'Selling Price' : 'Purchase Cost'
          }
        />
        <Line
          type="monotone"
          dataKey="sellingPrice"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={{ r: 4 }}
          connectNulls
          name="sellingPrice"
        />
        <Line
          type="monotone"
          dataKey="purchaseCost"
          stroke="hsl(var(--destructive))"
          strokeWidth={2}
          dot={{ r: 4 }}
          connectNulls
          name="purchaseCost"
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

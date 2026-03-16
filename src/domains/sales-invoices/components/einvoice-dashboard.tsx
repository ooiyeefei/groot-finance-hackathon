'use client'

import { useState, useMemo } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { useActiveBusiness } from '@/contexts/business-context'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import {
  FileCheck,
  FileX,
  Clock,
  ShieldCheck,
  Download,
  AlertTriangle,
  Loader2,
  Activity,
} from 'lucide-react'

// ============================================
// Types
// ============================================

type DateRange = 'this-month' | 'last-3-months' | 'last-6-months' | 'all-time'

// ============================================
// Date range helpers
// ============================================

function getDateRange(range: DateRange): { dateFrom?: number; dateTo?: number } {
  if (range === 'all-time') return {}

  const now = new Date()
  const dateTo = now.getTime()
  let dateFrom: number

  switch (range) {
    case 'this-month':
      dateFrom = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
      break
    case 'last-3-months':
      dateFrom = new Date(now.getFullYear(), now.getMonth() - 3, 1).getTime()
      break
    case 'last-6-months':
      dateFrom = new Date(now.getFullYear(), now.getMonth() - 6, 1).getTime()
      break
    default:
      return {}
  }

  return { dateFrom, dateTo }
}

// ============================================
// CSV Export (T035)
// ============================================

function exportAnalyticsCsv(
  data: NonNullable<ReturnType<typeof useQuery<typeof api.functions.salesInvoices.getEinvoiceAnalytics>>>
) {
  const headers = [
    'Metric',
    'Value',
  ]

  const rows = [
    ['Total Submitted', String(data.totalSubmitted)],
    ['Validated', String(data.validated)],
    ['Rejected', String(data.rejected)],
    ['Invalid', String(data.invalid)],
    ['Cancelled', String(data.cancelled)],
    ['Pending', String(data.pending)],
    ['Total Eligible', String(data.totalEligible)],
    ['Compliance Score', `${(data.complianceScore * 100).toFixed(1)}%`],
    ['Avg Validation Time (ms)', data.avgValidationTimeMs ? String(Math.round(data.avgValidationTimeMs)) : 'N/A'],
    [''],
    ['--- Monthly Breakdown ---'],
    ['Month', 'Submitted', 'Validated', 'Rejected'],
    ...data.monthlyBreakdown.map((m) => [m.month, String(m.submitted), String(m.validated), String(m.rejected)]),
    [''],
    ['--- Top Errors ---'],
    ['Error Code', 'Message', 'Count'],
    ...data.topErrors.map((e) => [e.code, `"${e.message}"`, String(e.count)]),
    [''],
    ['--- Recent Activity ---'],
    ['Invoice Number', 'Event', 'Timestamp', 'Details'],
    ...data.recentActivity.map((a) => [
      a.invoiceNumber,
      a.event,
      new Date(a.timestamp).toISOString(),
      a.details ?? '',
    ]),
  ]

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `einvoice-compliance-${new Date().toISOString().split('T')[0]}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// ============================================
// Relative time helper
// ============================================

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}

// ============================================
// Chart colors
// ============================================

const STATUS_COLORS: Record<string, string> = {
  valid: '#22c55e',
  invalid: '#ef4444',
  pending: '#f59e0b',
  cancelled: '#6b7280',
  rejected: '#dc2626',
}

const BAR_COLORS = {
  submitted: '#3b82f6',
  validated: '#22c55e',
  rejected: '#ef4444',
}

// ============================================
// Main Component
// ============================================

export default function EinvoiceDashboard() {
  const { businessId } = useActiveBusiness()
  const [dateRange, setDateRange] = useState<DateRange>('last-3-months')

  const { dateFrom, dateTo } = useMemo(() => getDateRange(dateRange), [dateRange])

  const analytics = useQuery(
    api.functions.salesInvoices.getEinvoiceAnalytics,
    businessId
      ? {
          businessId: businessId as Id<'businesses'>,
          dateFrom,
          dateTo,
        }
      : 'skip'
  )

  if (!businessId) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-muted-foreground">No business selected</p>
      </div>
    )
  }

  if (analytics === undefined) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const validationRate =
    analytics.totalSubmitted > 0
      ? ((analytics.validated / analytics.totalSubmitted) * 100).toFixed(1)
      : '0.0'

  const rejectionRate =
    analytics.validated > 0
      ? ((analytics.rejected / analytics.validated) * 100).toFixed(1)
      : '0.0'

  const compliancePercent = (analytics.complianceScore * 100).toFixed(1)

  // Pie chart data
  const pieData = [
    { name: 'Valid', value: analytics.validated, color: STATUS_COLORS.valid },
    { name: 'Invalid', value: analytics.invalid, color: STATUS_COLORS.invalid },
    { name: 'Pending', value: analytics.pending, color: STATUS_COLORS.pending },
    { name: 'Cancelled', value: analytics.cancelled, color: STATUS_COLORS.cancelled },
    { name: 'Rejected', value: analytics.rejected, color: STATUS_COLORS.rejected },
  ].filter((d) => d.value > 0)

  const dateRangeOptions: { value: DateRange; label: string }[] = [
    { value: 'this-month', label: 'This Month' },
    { value: 'last-3-months', label: 'Last 3 Months' },
    { value: 'last-6-months', label: 'Last 6 Months' },
    { value: 'all-time', label: 'All Time' },
  ]

  const eventLabels: Record<string, string> = {
    submitted: 'submitted to LHDN',
    validated: 'validated by LHDN',
    rejected: 'rejected by LHDN',
    cancelled: 'cancelled',
  }

  return (
    <div className="space-y-6">
      {/* Header with date range filter and export */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">E-Invoice Compliance</h2>
          <p className="text-sm text-muted-foreground">
            LHDN MyInvois submission analytics
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Date range presets */}
          <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
            {dateRangeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDateRange(opt.value)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  dateRange === opt.value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* CSV Export */}
          <button
            onClick={() => exportAnalyticsCsv(analytics)}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium transition-colors"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon={<FileCheck className="h-5 w-5 text-blue-500" />}
          label="Total Submitted"
          value={String(analytics.totalSubmitted)}
          sublabel={`of ${analytics.totalEligible} eligible`}
        />
        <MetricCard
          icon={<ShieldCheck className="h-5 w-5 text-green-500" />}
          label="Validation Rate"
          value={`${validationRate}%`}
          sublabel={`${analytics.validated} validated`}
        />
        <MetricCard
          icon={<FileX className="h-5 w-5 text-red-500" />}
          label="Rejection Rate"
          value={`${rejectionRate}%`}
          sublabel={`${analytics.rejected} rejected`}
        />
        <MetricCard
          icon={<Clock className="h-5 w-5 text-amber-500" />}
          label="Compliance Score"
          value={`${compliancePercent}%`}
          sublabel="submitted / eligible"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Volume Bar Chart */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-foreground font-medium mb-4">Monthly Volume</h3>
          {analytics.monthlyBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={analytics.monthlyBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                />
                <YAxis
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--foreground))',
                  }}
                />
                <Bar dataKey="submitted" fill={BAR_COLORS.submitted} name="Submitted" radius={[2, 2, 0, 0]} />
                <Bar dataKey="validated" fill={BAR_COLORS.validated} name="Validated" radius={[2, 2, 0, 0]} />
                <Bar dataKey="rejected" fill={BAR_COLORS.rejected} name="Rejected" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
              No submission data for selected period
            </div>
          )}
        </div>

        {/* Status Breakdown Pie Chart */}
        <div className="bg-card border border-border rounded-lg p-6">
          <h3 className="text-foreground font-medium mb-4">Status Breakdown</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  nameKey="name"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--foreground))',
                  }}
                />
                <Legend
                  formatter={(value) => (
                    <span style={{ color: 'hsl(var(--foreground))' }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
              No submissions yet
            </div>
          )}
        </div>
      </div>

      {/* Top Errors Table + Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Errors */}
        <div className="bg-card border border-border rounded-lg">
          <div className="flex items-center gap-2 p-4 border-b border-border">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-foreground font-medium">Top Validation Errors</h3>
          </div>
          {analytics.topErrors.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Code
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Message
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Count
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.topErrors.map((err, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-border last:border-b-0 hover:bg-muted/50"
                    >
                      <td className="px-4 py-2.5 text-sm font-mono text-foreground">
                        {err.code}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-foreground max-w-xs truncate">
                        {err.message}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-foreground text-right font-medium">
                        {err.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              No validation errors recorded
            </div>
          )}
        </div>

        {/* Recent Activity Feed */}
        <div className="bg-card border border-border rounded-lg">
          <div className="flex items-center gap-2 p-4 border-b border-border">
            <Activity className="h-4 w-4 text-blue-500" />
            <h3 className="text-foreground font-medium">Recent Activity</h3>
          </div>
          {analytics.recentActivity.length > 0 ? (
            <div className="max-h-[400px] overflow-y-auto">
              {analytics.recentActivity.map((activity, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/50"
                >
                  <div
                    className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${
                      activity.event === 'validated'
                        ? 'bg-green-500'
                        : activity.event === 'rejected'
                          ? 'bg-red-500'
                          : activity.event === 'cancelled'
                            ? 'bg-gray-500'
                            : 'bg-blue-500'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{activity.invoiceNumber}</span>{' '}
                      {eventLabels[activity.event] ?? activity.event}
                    </p>
                    {activity.details && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {activity.details}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {relativeTime(activity.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
              No recent activity
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================
// Metric Card Sub-component
// ============================================

function MetricCard({
  icon,
  label,
  value,
  sublabel,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sublabel: string
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-5">
      <div className="flex items-center gap-3 mb-2">
        {icon}
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>
    </div>
  )
}

'use client'

/**
 * Rich Content Panel
 *
 * An expandable panel that slides alongside the chat window
 * for complex visualizations — charts, dashboards, data tables.
 *
 * Activated when the agent returns data suitable for visualization.
 */

import { useCallback } from 'react'
import { X, BarChart3, TrendingUp, Table2 } from 'lucide-react'

export interface RichContentData {
  type: 'chart' | 'table' | 'dashboard'
  title: string
  data: any
  chartType?: 'bar' | 'line' | 'pie'
}

interface RichContentPanelProps {
  content: RichContentData | null
  isOpen: boolean
  onClose: () => void
}

export function RichContentPanel({ content, isOpen, onClose }: RichContentPanelProps) {
  if (!isOpen || !content) return null

  return (
    <div
      className="fixed z-[60]
        inset-x-2 bottom-2 top-auto h-[70vh]
        sm:inset-auto sm:bottom-20 sm:right-[420px] sm:w-[480px] sm:h-[600px] sm:max-h-[80vh]
        bg-card border border-border rounded-xl shadow-2xl overflow-hidden
        animate-in slide-in-from-bottom-4 sm:slide-in-from-right-4 fade-in duration-200
        flex flex-col"
      role="complementary"
      aria-label="Analytics panel"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-surface border-b border-border">
        <div className="flex items-center gap-2">
          <ContentTypeIcon type={content.type} />
          <h3 className="text-sm font-semibold text-foreground truncate">
            {content.title}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
          aria-label="Close panel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {content.type === 'table' && <RichTable data={content.data} />}
        {content.type === 'chart' && (
          <RichChart data={content.data} chartType={content.chartType} />
        )}
        {content.type === 'dashboard' && <RichDashboard data={content.data} />}
      </div>
    </div>
  )
}

function ContentTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'chart':
      return <TrendingUp className="w-4 h-4 text-primary" />
    case 'table':
      return <Table2 className="w-4 h-4 text-primary" />
    case 'dashboard':
      return <BarChart3 className="w-4 h-4 text-primary" />
    default:
      return <BarChart3 className="w-4 h-4 text-primary" />
  }
}

/**
 * Table renderer for structured data
 */
function RichTable({ data }: { data: any }) {
  if (!data?.rows || !data?.columns) {
    return (
      <p className="text-sm text-muted-foreground">No table data available</p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full border border-border rounded text-sm">
        <thead className="bg-muted">
          <tr>
            {data.columns.map((col: string, i: number) => (
              <th
                key={i}
                className="px-3 py-2 text-left font-medium text-foreground border-b border-border"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row: any[], rowIndex: number) => (
            <tr key={rowIndex} className="border-b border-border hover:bg-muted/50">
              {row.map((cell: any, cellIndex: number) => (
                <td key={cellIndex} className="px-3 py-2 text-foreground">
                  {String(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Chart renderer placeholder — uses recharts (already in dependencies)
 * The actual chart rendering can be enhanced with specific chart types
 */
function RichChart({
  data,
  chartType = 'bar',
}: {
  data: any
  chartType?: string
}) {
  if (!data?.series) {
    return (
      <p className="text-sm text-muted-foreground">No chart data available</p>
    )
  }

  // Simplified visualization using colored bars
  // Full recharts integration can be added when specific chart requirements are defined
  return (
    <div className="space-y-3">
      {data.series.map((item: { label: string; value: number }, i: number) => {
        const maxValue = Math.max(...data.series.map((s: any) => s.value))
        const percentage = maxValue > 0 ? (item.value / maxValue) * 100 : 0

        return (
          <div key={i} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground truncate">{item.label}</span>
              <span className="text-muted-foreground font-mono ml-2">
                {typeof item.value === 'number'
                  ? item.value.toLocaleString()
                  : item.value}
              </span>
            </div>
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-300"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Dashboard renderer for multi-metric displays
 */
function RichDashboard({ data }: { data: any }) {
  if (!data?.metrics) {
    return (
      <p className="text-sm text-muted-foreground">No dashboard data available</p>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {data.metrics.map(
        (
          metric: { label: string; value: string | number; change?: string },
          i: number
        ) => (
          <div
            key={i}
            className="bg-muted rounded-lg p-3 border border-border"
          >
            <p className="text-xs text-muted-foreground mb-1">{metric.label}</p>
            <p className="text-lg font-semibold text-foreground">
              {typeof metric.value === 'number'
                ? metric.value.toLocaleString()
                : metric.value}
            </p>
            {metric.change && (
              <p
                className={`text-xs mt-0.5 ${
                  metric.change.startsWith('+')
                    ? 'text-green-600 dark:text-green-400'
                    : metric.change.startsWith('-')
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-muted-foreground'
                }`}
              >
                {metric.change}
              </p>
            )}
          </div>
        )
      )}
    </div>
  )
}

/**
 * Helper to detect if agent response data is suitable for rich content display
 */
export function detectRichContent(
  metadata: any
): RichContentData | null {
  if (!metadata) return null

  // Check for explicit chart data
  if (metadata.chartData) {
    return {
      type: 'chart',
      title: metadata.chartTitle || 'Analytics',
      data: metadata.chartData,
      chartType: metadata.chartType || 'bar',
    }
  }

  // Check for table data
  if (metadata.tableData) {
    return {
      type: 'table',
      title: metadata.tableTitle || 'Data',
      data: metadata.tableData,
    }
  }

  // Check for dashboard metrics
  if (metadata.dashboardData) {
    return {
      type: 'dashboard',
      title: metadata.dashboardTitle || 'Dashboard',
      data: metadata.dashboardData,
    }
  }

  return null
}

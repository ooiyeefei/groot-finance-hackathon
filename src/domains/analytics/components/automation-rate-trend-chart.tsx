'use client';

/**
 * Automation Rate Trend Chart
 * Feature: 001-surface-automation-rate (User Story 2)
 *
 * Displays weekly automation rate trend with DSPy optimization markers
 */

import { useAutomationRateTrend } from '../hooks/use-automation-rate';
import type { Id } from '@/convex/_generated/dataModel';
import { Loader2, TrendingUp } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

export interface AutomationRateTrendChartProps {
  businessId: Id<"businesses">;
  weeks?: number;
  height?: number;
  className?: string;
}

export function AutomationRateTrendChart({
  businessId,
  weeks = 8,
  height = 300,
  className = "",
}: AutomationRateTrendChartProps) {
  const { trendData, isLoading } = useAutomationRateTrend({ businessId, weeks });

  // Loading state
  if (isLoading) {
    return (
      <div className={`bg-card text-card-foreground border rounded-lg p-card-padding shadow-sm ${className}`}
        style={{ minHeight: height + 80 }}>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading trend data...</p>
          </div>
        </div>
      </div>
    );
  }

  // Not enough data
  if (!trendData || trendData.length < 2) {
    return (
      <div className={`bg-card text-card-foreground border rounded-lg p-card-padding shadow-sm ${className}`}
        style={{ minHeight: height + 80 }}>
        <div className="flex items-center space-x-2 mb-4">
          <TrendingUp className="w-5 h-5 text-muted-foreground" />
          <h3 className="text-base font-semibold text-foreground">Automation Rate Trend</h3>
        </div>
        <div className="flex items-center justify-center" style={{ height }}>
          <p className="text-muted-foreground text-center">
            Tracking automation trends — check back after 2 weeks of AI activity
          </p>
        </div>
      </div>
    );
  }

  // Collect all optimization events for reference lines
  const optimizationMarkers: Array<{ week: string; modelType: string }> = [];
  for (const point of trendData) {
    if (point.optimizationEvents && point.optimizationEvents.length > 0) {
      for (const event of point.optimizationEvents) {
        optimizationMarkers.push({
          week: point.week,
          modelType: event.modelType,
        });
      }
    }
  }

  // Chart data: replace null rates with undefined for Recharts
  const chartData = trendData.map((point) => ({
    ...point,
    rate: point.rate ?? undefined,
  }));

  return (
    <div className={`bg-card text-card-foreground border rounded-lg p-card-padding shadow-sm ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h3 className="text-base font-semibold text-foreground">Automation Rate Trend</h3>
        </div>
        <p className="text-xs text-muted-foreground">Last {weeks} weeks</p>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11 }}
            className="fill-muted-foreground"
            tickLine={false}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* Optimization event markers */}
          {optimizationMarkers.map((marker, idx) => (
            <ReferenceLine
              key={`opt-${idx}`}
              x={marker.week}
              stroke="hsl(var(--primary))"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: "Model optimized",
                position: "top",
                fill: "hsl(var(--primary))",
                fontSize: 10,
              }}
            />
          ))}

          {/* Main trend line */}
          <Line
            type="monotone"
            dataKey="rate"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ r: 4, fill: "hsl(var(--primary))" }}
            activeDot={{ r: 6 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Custom tooltip for trend chart data points
 */
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  const rate = data.rate;
  const hasActivity = rate !== null && rate !== undefined;

  return (
    <div className="bg-popover text-popover-foreground border rounded-lg p-3 shadow-md text-sm">
      <p className="font-semibold mb-1">{label}</p>
      {hasActivity ? (
        <>
          <p className="text-primary font-bold text-lg">{rate.toFixed(1)}%</p>
          <p className="text-muted-foreground text-xs">
            {data.totalDecisions} decisions, {data.decisionsReviewed} reviewed
          </p>
          {!data.hasMinimumData && (
            <p className="text-yellow-600 dark:text-yellow-400 text-xs mt-1">
              Low sample size (&lt;10 decisions)
            </p>
          )}
          {data.optimizationEvents?.length > 0 && (
            <p className="text-primary text-xs mt-1">
              Model optimized this week
            </p>
          )}
        </>
      ) : (
        <p className="text-muted-foreground">No AI activity this week</p>
      )}
    </div>
  );
}

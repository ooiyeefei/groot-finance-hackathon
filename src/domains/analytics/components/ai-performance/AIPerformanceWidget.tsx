'use client';

import { Brain, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useAIPerformance } from '../../hooks/use-ai-performance';

interface AIPerformanceWidgetProps {
  businessId: string;
}

const DONUT_COLORS = {
  noEdit: '#10b981', // green-500
  edited: '#f59e0b', // amber-500
  missing: '#ef4444', // red-500
};

export default function AIPerformanceWidget({ businessId }: AIPerformanceWidgetProps) {
  const { metrics, period, setPeriod, loading, isEmpty, refresh, lastUpdated } = useAIPerformance(businessId);

  if (loading && !metrics) {
    return (
      <div className="bg-card text-card-foreground border rounded-lg p-card-padding min-h-[280px]">
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading AI performance...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isEmpty || !metrics) {
    return (
      <div className="bg-card text-card-foreground border rounded-lg p-card-padding min-h-[280px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">AI Performance</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Brain className="w-12 h-12 text-muted-foreground mb-3" />
          <p className="text-foreground font-medium mb-2">AI Performance Metrics</p>
          <p className="text-sm text-muted-foreground max-w-md">
            Metrics will appear here once you start using AI features like AR matching, bank reconciliation, or fee classification.
          </p>
        </div>
      </div>
    );
  }

  // Donut chart data
  const chartData = [
    { name: 'No Edit', value: metrics.distribution.noEdit, color: DONUT_COLORS.noEdit },
    { name: 'Edited', value: metrics.distribution.edited, color: DONUT_COLORS.edited },
    { name: 'Missing', value: metrics.distribution.missing, color: DONUT_COLORS.missing },
  ].filter(d => d.value > 0);

  const getTrendIcon = (delta: number | null) => {
    if (delta === null || delta === 0) return null;
    return delta > 0
      ? <TrendingUp className="w-3 h-3" />
      : <TrendingDown className="w-3 h-3" />;
  };

  const getTrendColor = (delta: number | null, inverted = false) => {
    if (delta === null || delta === 0) return 'text-muted-foreground';
    const isPositive = delta > 0;
    const isGood = inverted ? !isPositive : isPositive;
    return isGood ? 'text-green-600 dark:text-green-400' : 'text-destructive';
  };

  return (
    <div className="bg-card text-card-foreground border rounded-lg p-card-padding">
      {/* Header with period selector + refresh */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-semibold">AI Performance</h3>
          {lastUpdated && (
            <span className="text-xs text-muted-foreground">
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-50"
            title="Refresh metrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
          </button>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as typeof period)}
            className="px-2 py-1 bg-muted text-foreground border rounded text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="this_month">This Month</option>
            <option value="last_3_months">Last 3 Months</option>
            <option value="all_time">All Time</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Hero metric + Donut chart */}
        <div className="lg:col-span-1 space-y-4">
          {/* Hero metric */}
          <div className="text-center">
            <p className="text-3xl font-bold text-foreground mb-1">
              {metrics.estimatedHoursSaved.toFixed(1)}h
            </p>
            <p className="text-sm text-muted-foreground">Hours Saved</p>
            <p className="text-xs text-muted-foreground mt-1">
              {metrics.totalAiDecisions} automated, {metrics.decisionsRequiringReview} needed review
            </p>
          </div>

          {/* Donut chart */}
          {chartData.length > 0 && (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width={140} height={140}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={60}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex gap-4 text-xs mt-2">
                {chartData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-muted-foreground">{entry.name}: {entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Metric cards (2x2 grid) */}
        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
          {/* Overall Confidence */}
          <div className="bg-muted/30 rounded-lg p-4">
            <p className="text-sm text-muted-foreground mb-1">Overall Confidence</p>
            <p className="text-2xl font-bold text-foreground mb-1">
              {metrics.overallConfidence.toFixed(1)}%
            </p>
            {metrics.trends && metrics.trends.confidenceDelta !== null && (
              <div className={`flex items-center gap-1 text-xs ${getTrendColor(metrics.trends.confidenceDelta)}`}>
                {getTrendIcon(metrics.trends.confidenceDelta)}
                <span>{metrics.trends.confidenceDelta > 0 ? '+' : ''}{metrics.trends.confidenceDelta.toFixed(1)}%</span>
              </div>
            )}
          </div>

          {/* Edit Rate */}
          <div className="bg-muted/30 rounded-lg p-4">
            <p className="text-sm text-muted-foreground mb-1">Edit Rate</p>
            <p className="text-2xl font-bold text-foreground mb-1">
              {metrics.editRate.toFixed(1)}%
            </p>
            {metrics.trends && metrics.trends.editRateDelta !== null && (
              <div className={`flex items-center gap-1 text-xs ${getTrendColor(metrics.trends.editRateDelta, true)}`}>
                {getTrendIcon(metrics.trends.editRateDelta)}
                <span>{metrics.trends.editRateDelta > 0 ? '+' : ''}{metrics.trends.editRateDelta.toFixed(1)}%</span>
              </div>
            )}
          </div>

          {/* No-Edit Rate */}
          <div className="bg-muted/30 rounded-lg p-4">
            <p className="text-sm text-muted-foreground mb-1">No-Edit Rate</p>
            <p className="text-2xl font-bold text-foreground mb-1">
              {metrics.noEditRate.toFixed(1)}%
            </p>
            {metrics.trends && metrics.trends.editRateDelta !== null && (
              <div className={`flex items-center gap-1 text-xs ${getTrendColor(-metrics.trends.editRateDelta)}`}>
                {getTrendIcon(-metrics.trends.editRateDelta)}
                <span>{-metrics.trends.editRateDelta > 0 ? '+' : ''}{(-metrics.trends.editRateDelta).toFixed(1)}%</span>
              </div>
            )}
          </div>

          {/* Automation Rate */}
          <div className="bg-muted/30 rounded-lg p-4">
            <p className="text-sm text-muted-foreground mb-1">Automation Rate</p>
            <p className="text-2xl font-bold text-foreground mb-1">
              {metrics.automationRate.toFixed(1)}%
            </p>
            {metrics.trends && metrics.trends.automationRateDelta !== null && (
              <div className={`flex items-center gap-1 text-xs ${getTrendColor(metrics.trends.automationRateDelta)}`}>
                {getTrendIcon(metrics.trends.automationRateDelta)}
                <span>{metrics.trends.automationRateDelta > 0 ? '+' : ''}{metrics.trends.automationRateDelta.toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

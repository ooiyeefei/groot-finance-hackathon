'use client';

/**
 * Automation Rate Hero Metric
 * Feature: 001-surface-automation-rate
 *
 * Displays current AI automation rate prominently on the dashboard
 */

import { useState } from 'react';
import { useAutomationRate } from '../hooks/use-automation-rate';
import type { Id } from '@/convex/_generated/dataModel';
import { Activity, TrendingUp, Loader2 } from 'lucide-react';

export interface AutomationRateHeroProps {
  businessId: Id<"businesses">;
  defaultPeriod?: "today" | "week" | "month";
  className?: string;
}

export function AutomationRateHero({
  businessId,
  defaultPeriod = "week",
  className = ""
}: AutomationRateHeroProps) {
  const [period, setPeriod] = useState<"today" | "week" | "month">(defaultPeriod);

  const {
    rate,
    totalDecisions,
    decisionsReviewed,
    message,
    hasMinimumData,
    isLoading
  } = useAutomationRate({
    businessId,
    period,
  });

  // Loading state
  if (isLoading) {
    return (
      <div className={`bg-card text-card-foreground border rounded-lg p-card-padding shadow-sm min-h-[140px] ${className}`}>
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Loading automation rate...</p>
          </div>
        </div>
      </div>
    );
  }

  // Message state (no activity or collecting data)
  if (message) {
    return (
      <div className={`bg-card text-card-foreground border rounded-lg p-card-padding shadow-sm min-h-[140px] ${className}`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <Activity className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">AI Automation Rate</h3>
              <p className="text-xs text-muted-foreground">
                {period === 'today' ? 'Today' : period === 'week' ? 'This week' : 'This month'}
              </p>
            </div>
          </div>

          {/* Period Selector */}
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as "today" | "week" | "month")}
            className="px-2 py-1 bg-muted text-foreground border rounded text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>

        <div className="text-center py-4">
          <p className="text-muted-foreground">{message}</p>
        </div>
      </div>
    );
  }

  // Main display with rate
  const automationRate = rate ?? 0;
  const automated = (totalDecisions ?? 0) - (decisionsReviewed ?? 0);

  // Color based on rate threshold
  const getRateColor = () => {
    if (automationRate >= 95) return 'text-green-600 dark:text-green-400';
    if (automationRate >= 80) return 'text-blue-600 dark:text-blue-400';
    if (automationRate >= 60) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getRateBg = () => {
    if (automationRate >= 95) return 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-700/50';
    if (automationRate >= 80) return 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-700/50';
    if (automationRate >= 60) return 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-700/50';
    return 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-700/50';
  };

  return (
    <div className={`border rounded-lg p-card-padding shadow-sm min-h-[140px] transition-all ${getRateBg()} ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            automationRate >= 95 ? 'bg-green-600/20' :
            automationRate >= 80 ? 'bg-blue-600/20' :
            automationRate >= 60 ? 'bg-yellow-600/20' :
            'bg-red-600/20'
          }`}>
            <TrendingUp className={`w-5 h-5 ${getRateColor()}`} />
          </div>
          <div>
            <h3 className={`text-base font-semibold ${getRateColor()}`}>AI Automation Rate</h3>
            <p className="text-xs opacity-70">
              {period === 'today' ? 'Today' : period === 'week' ? 'This week' : 'This month'}
            </p>
          </div>
        </div>

        {/* Period Selector */}
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as "today" | "week" | "month")}
          className="px-2 py-1 bg-muted text-foreground border rounded text-xs focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
        </select>
      </div>

      <div className="space-y-2">
        {/* Large Rate Display */}
        <div className="flex items-baseline space-x-2">
          <p className={`text-4xl font-bold ${getRateColor()}`}>
            {automationRate.toFixed(1)}%
          </p>
          {!hasMinimumData && (
            <span className="text-xs text-muted-foreground">(collecting data)</span>
          )}
        </div>

        {/* Summary Text */}
        <p className="text-sm opacity-80">
          <strong>{automated}</strong> of <strong>{totalDecisions}</strong> documents automated
          {decisionsReviewed && decisionsReviewed > 0 && (
            <> • <strong>{decisionsReviewed}</strong> reviewed by you</>
          )}
        </p>

        {/* ROI Context */}
        {totalDecisions && totalDecisions > 0 && (
          <p className="text-xs opacity-60">
            ~{Math.round(automated * 2)} minutes saved {period === 'today' ? 'today' : period === 'week' ? 'this week' : 'this month'}
          </p>
        )}
      </div>
    </div>
  );
}

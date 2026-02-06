'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InsightCard } from './InsightCard';
import { useInsights } from '../../hooks/useInsights';
import {
  Loader2,
  Bell,
  CheckCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type { Id } from '../../../../../convex/_generated/dataModel';

interface ProactiveActionCenterProps {
  businessId: string;
  defaultExpanded?: boolean;
}

const CARDS_PER_ROW = 3;

export function ProactiveActionCenter({ businessId, defaultExpanded = true }: ProactiveActionCenterProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<'all' | 'critical' | 'reviewed'>('all');
  const [showAll, setShowAll] = useState(false);

  // Fetch ALL insights without filters - we'll filter client-side for consistency
  const {
    insights,
    isLoading,
    pendingCount,
    summary,
    updateStatus,
    markAllReviewed,
  } = useInsights({
    businessId,
    limit: 100, // Fetch more since we're filtering client-side
  });

  const handleDismiss = async (insightId: string) => {
    await updateStatus(insightId as Id<'actionCenterInsights'>, 'dismissed');
  };

  const handleAction = async (insightId: string) => {
    await updateStatus(insightId as Id<'actionCenterInsights'>, 'actioned');
  };

  const handleReview = async (insightId: string) => {
    await updateStatus(insightId as Id<'actionCenterInsights'>, 'reviewed');
  };

  // Filter insights based on active tab
  const filteredInsights = insights.filter(insight => {
    if (activeTab === 'critical') {
      // Show critical/high priority items that are still actionable (not dismissed/actioned)
      const isCriticalOrHigh = insight.priority === 'critical' || insight.priority === 'high';
      const isActionable = insight.status === 'new' || insight.status === 'reviewed';
      return isCriticalOrHigh && isActionable;
    }
    if (activeTab === 'reviewed') return insight.status === 'reviewed';
    // 'all' tab shows new items
    return insight.status === 'new';
  });

  // Show only first row (3 cards) unless expanded
  const visibleInsights = showAll ? filteredInsights : filteredInsights.slice(0, CARDS_PER_ROW);
  const hasMoreInsights = filteredInsights.length > CARDS_PER_ROW;
  const hiddenCount = filteredInsights.length - CARDS_PER_ROW;

  // Calculate counts from the full insights array (client-side) for consistency
  // newCount: All insights with status 'new'
  const newCount = insights.filter(i => i.status === 'new').length;
  // criticalCount: Critical/high priority items that are NEW only (matches API pendingCount)
  // This ensures the header number matches the tab badge
  const criticalCount = insights.filter(i =>
    (i.priority === 'critical' || i.priority === 'high') &&
    i.status === 'new'
  ).length;
  // reviewedCount: All insights that have been reviewed
  const reviewedCount = insights.filter(i => i.status === 'reviewed').length;

  return (
    <Card className="overflow-hidden">
      {/* Header - Always visible */}
      <div
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-accent/50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              AI Action Center
              {pendingCount.count > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {pendingCount.count} new
                </Badge>
              )}
            </h2>
            <p className="text-[15px] text-muted-foreground">
              {pendingCount.byCritical > 0 && (
                <span className="text-red-500">{pendingCount.byCritical} critical</span>
              )}
              {pendingCount.byCritical > 0 && pendingCount.byHigh > 0 && ' · '}
              {pendingCount.byHigh > 0 && (
                <span className="text-orange-500">{pendingCount.byHigh} high priority</span>
              )}
              {pendingCount.byCritical === 0 && pendingCount.byHigh === 0 && 'No urgent items'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {newCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                markAllReviewed();
              }}
              className="text-xs"
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              Mark all read
            </Button>
          )}
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="border-t border-border">
          {/* Tabs */}
          <div className="px-4 pt-4">
            <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as typeof activeTab); setShowAll(false); }}>
              <TabsList className="grid w-full grid-cols-3 max-w-sm">
                <TabsTrigger value="all" className="text-xs gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  New ({newCount})
                </TabsTrigger>
                <TabsTrigger value="critical" className="text-xs gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  Critical ({criticalCount})
                </TabsTrigger>
                <TabsTrigger value="reviewed" className="text-xs gap-1">
                  <CheckCheck className="h-3.5 w-3.5" />
                  Reviewed ({reviewedCount})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Content - 3 cards in 1 row */}
          <div className="p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading insights...</span>
              </div>
            ) : filteredInsights.length === 0 ? (
              <div className="text-center py-6 space-y-2">
                <div className="p-3 rounded-full bg-muted inline-block">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {activeTab === 'all' && 'All caught up! No new insights.'}
                  {activeTab === 'critical' && 'No critical issues detected.'}
                  {activeTab === 'reviewed' && 'No reviewed insights yet.'}
                </p>
              </div>
            ) : (
              <>
                {/* Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {visibleInsights.map(insight => (
                    <InsightCard
                      key={insight._id}
                      insight={insight}
                      onDismiss={handleDismiss}
                      onAction={handleAction}
                      onReview={handleReview}
                    />
                  ))}
                </div>

                {/* Show More / Show Less Button */}
                {hasMoreInsights && (
                  <div className="mt-4 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowAll(!showAll)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {showAll ? (
                        <>
                          <ChevronUp className="h-4 w-4 mr-1" />
                          Show less
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4 mr-1" />
                          Show {hiddenCount} more insights
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Summary Footer */}
          {summary && (
            <div className="px-4 py-2 border-t border-border bg-muted/30">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex gap-4">
                  <span>Total: {summary.total}</span>
                  <span>Actioned: {summary.byStatus?.actioned ?? 0}</span>
                  <span>Dismissed: {summary.byStatus?.dismissed ?? 0}</span>
                </div>
                <span>Actionable rate: {summary.actionableRate}%</span>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

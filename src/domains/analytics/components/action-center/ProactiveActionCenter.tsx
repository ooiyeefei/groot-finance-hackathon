'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InsightCard } from './InsightCard';
import { useInsights } from '../../hooks/useInsights';
import {
  Loader2,
  Bell,
  CheckCheck,
  AlertTriangle,
  TrendingDown,
  Clock,
  Lightbulb,
  Shield,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import type { Id } from '../../../../../convex/_generated/dataModel';

interface ProactiveActionCenterProps {
  businessId: string;
  defaultExpanded?: boolean;
}

export function ProactiveActionCenter({ businessId, defaultExpanded = true }: ProactiveActionCenterProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<'all' | 'critical' | 'reviewed'>('all');

  const {
    insights,
    totalCount,
    isLoading,
    pendingCount,
    summary,
    updateStatus,
    markAllReviewed,
  } = useInsights({
    businessId,
    status: activeTab === 'reviewed' ? 'reviewed' : undefined,
    priority: activeTab === 'critical' ? 'critical' : undefined,
    limit: 20,
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
    if (activeTab === 'critical') return insight.priority === 'critical' || insight.priority === 'high';
    if (activeTab === 'reviewed') return insight.status === 'reviewed';
    return insight.status === 'new';
  });

  const newCount = insights.filter(i => i.status === 'new').length;

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
            <p className="text-sm text-muted-foreground">
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
          <div className="p-4 pb-0">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all" className="text-xs">
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  New ({newCount})
                </TabsTrigger>
                <TabsTrigger value="critical" className="text-xs">
                  <AlertTriangle className="h-4 w-4 mr-1 text-red-500" />
                  Critical
                </TabsTrigger>
                <TabsTrigger value="reviewed" className="text-xs">
                  <CheckCheck className="h-4 w-4 mr-1" />
                  Reviewed
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Content */}
          <div className="p-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading insights...</span>
              </div>
            ) : filteredInsights.length === 0 ? (
              <div className="text-center py-8 space-y-2">
                <div className="p-3 rounded-full bg-muted inline-block">
                  <Bell className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">No insights in this category</p>
                <p className="text-sm text-muted-foreground">
                  {activeTab === 'all' && 'All caught up! No new insights.'}
                  {activeTab === 'critical' && 'No critical issues detected.'}
                  {activeTab === 'reviewed' && 'No reviewed insights yet.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {filteredInsights.map(insight => (
                  <InsightCard
                    key={insight._id}
                    insight={insight}
                    onDismiss={handleDismiss}
                    onAction={handleAction}
                    onReview={handleReview}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Summary Footer */}
          {summary && (
            <div className="p-4 border-t border-border bg-muted/30">
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

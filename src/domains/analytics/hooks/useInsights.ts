'use client';

import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import type { Id, Doc } from '../../../../convex/_generated/dataModel';
import { useCallback } from 'react';

type ActionCenterInsight = Doc<'actionCenterInsights'>;
type InsightStatus = 'new' | 'reviewed' | 'dismissed' | 'actioned';
type InsightCategory = 'anomaly' | 'compliance' | 'deadline' | 'cashflow' | 'optimization' | 'categorization';
type InsightPriority = 'critical' | 'high' | 'medium' | 'low';

interface UseInsightsOptions {
  businessId: string;
  status?: InsightStatus;
  category?: InsightCategory;
  priority?: InsightPriority;
  limit?: number;
}

interface UseInsightsReturn {
  insights: ActionCenterInsight[];
  totalCount: number;
  isLoading: boolean;
  pendingCount: {
    count: number;
    byCritical: number;
    byHigh: number;
  };
  summary: {
    total: number;
    byStatus: Record<string, number>;
    byCategory: Record<string, number>;
    byPriority: Record<string, number>;
    actionableRate: number;
  } | null;
  updateStatus: (insightId: Id<'actionCenterInsights'>, status: 'reviewed' | 'dismissed' | 'actioned') => Promise<void>;
  markAllReviewed: () => Promise<void>;
}

export function useInsights(options: UseInsightsOptions): UseInsightsReturn {
  const { businessId, status, category, priority, limit } = options;

  // Query insights list
  const insightsResult = useQuery(
    api.functions.actionCenterInsights.list,
    { businessId, status, category, priority, limit }
  );

  // Query pending count
  const pendingResult = useQuery(
    api.functions.actionCenterInsights.getPendingCount,
    { businessId }
  );

  // Query summary
  const summaryResult = useQuery(
    api.functions.actionCenterInsights.getSummary,
    { businessId }
  );

  // Mutations
  const updateStatusMutation = useMutation(api.functions.actionCenterInsights.updateStatus);
  const batchMarkReviewedMutation = useMutation(api.functions.actionCenterInsights.batchMarkReviewed);

  const updateStatus = useCallback(
    async (insightId: Id<'actionCenterInsights'>, newStatus: 'reviewed' | 'dismissed' | 'actioned') => {
      await updateStatusMutation({ insightId, status: newStatus });
    },
    [updateStatusMutation]
  );

  const markAllReviewed = useCallback(async () => {
    await batchMarkReviewedMutation({ businessId });
  }, [batchMarkReviewedMutation, businessId]);

  return {
    insights: insightsResult?.insights ?? [],
    totalCount: insightsResult?.totalCount ?? 0,
    isLoading: insightsResult === undefined,
    pendingCount: pendingResult ?? { count: 0, byCritical: 0, byHigh: 0 },
    summary: summaryResult ?? null,
    updateStatus,
    markAllReviewed,
  };
}

'use client';

import { Brain } from 'lucide-react';
import { useAIPerformance } from '../../hooks/use-ai-performance';

interface CompactAIPerformanceCardProps {
  businessId: string;
  feature: 'ar' | 'bank' | 'fee';
}

const FEATURE_LABELS = {
  ar: 'AR Matching',
  bank: 'Bank Reconciliation',
  fee: 'Fee Classification',
};

export default function CompactAIPerformanceCard({ businessId, feature }: CompactAIPerformanceCardProps) {
  const { metrics, loading } = useAIPerformance(businessId);

  if (loading) {
    return (
      <div className="bg-card border rounded-lg p-3">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-muted-foreground animate-pulse" />
          <div className="h-4 w-32 bg-muted rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!metrics || metrics.isEmpty) {
    return null; // Don't show if no AI activity
  }

  const featureData = metrics.featureBreakdown[feature];

  if (featureData.total === 0) {
    return null; // Don't show if this feature has no activity
  }

  const editRate = featureData.corrections > 0
    ? ((featureData.corrections / featureData.total) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="bg-card border rounded-lg p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground">{FEATURE_LABELS[feature]} AI</span>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div>
            <span className="text-muted-foreground">Confidence: </span>
            <span className="font-medium text-foreground">{featureData.confidence.toFixed(1)}%</span>
          </div>
          <div>
            <span className="text-muted-foreground">Edit Rate: </span>
            <span className="font-medium text-foreground">{editRate}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

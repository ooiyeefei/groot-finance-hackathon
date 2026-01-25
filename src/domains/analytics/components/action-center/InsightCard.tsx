'use client';

import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingDown, Clock, CheckCircle, Lightbulb, Shield } from 'lucide-react';
import type { Doc } from '../../../../../convex/_generated/dataModel';

type ActionCenterInsight = Doc<'actionCenterInsights'>;

interface InsightCardProps {
  insight: ActionCenterInsight;
  onDismiss?: (id: string) => void;
  onAction?: (id: string) => void;
  onReview?: (id: string) => void;
}

const priorityConfig = {
  critical: {
    badgeClass: 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30',
    cardBorder: 'border-l-4 border-l-red-500'
  },
  high: {
    badgeClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30',
    cardBorder: 'border-l-4 border-l-orange-500'
  },
  medium: {
    badgeClass: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30',
    cardBorder: 'border-l-4 border-l-yellow-500'
  },
  low: {
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30',
    cardBorder: 'border-l-4 border-l-blue-500'
  }
};

const categoryConfig = {
  anomaly: { icon: AlertTriangle, label: 'Anomaly' },
  compliance: { icon: Shield, label: 'Compliance' },
  deadline: { icon: Clock, label: 'Deadline' },
  cashflow: { icon: TrendingDown, label: 'Cash Flow' },
  optimization: { icon: Lightbulb, label: 'Optimization' },
  categorization: { icon: CheckCircle, label: 'Categorization' }
};

export function InsightCard({ insight, onDismiss, onAction, onReview }: InsightCardProps) {
  const priority = priorityConfig[insight.priority];
  const category = categoryConfig[insight.category];
  const CategoryIcon = category.icon;

  const handleCardClick = () => {
    if (insight.status === 'new' && onReview) {
      onReview(insight._id);
    }
  };

  return (
    <Card
      className={`p-4 space-y-3 cursor-pointer hover:bg-accent/50 transition-colors ${priority.cardBorder}`}
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <div className="p-2 rounded-lg bg-muted">
            <CategoryIcon className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground text-sm">{insight.title}</h3>
              <Badge className={priority.badgeClass}>
                {insight.priority}
              </Badge>
              {insight.status === 'new' && (
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                  New
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{insight.description}</p>
          </div>
        </div>
      </div>

      {insight.recommendedAction && (
        <div className="ml-12 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Recommended Action:</p>
          <p className="text-sm text-foreground">{insight.recommendedAction}</p>
        </div>
      )}

      <div className="ml-12 pt-2 border-t border-border flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {new Date(insight.detectedAt).toLocaleString()}
        </p>
        <div className="flex gap-2">
          {insight.status !== 'dismissed' && onDismiss && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(insight._id);
              }}
              className="text-xs"
            >
              Dismiss
            </Button>
          )}
          {insight.status !== 'actioned' && onAction && (
            <Button
              variant="default"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onAction(insight._id);
              }}
              className="text-xs"
            >
              Take Action
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

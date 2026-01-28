'use client';

import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  TrendingDown,
  Clock,
  CheckCircle,
  Lightbulb,
  Shield,
  MessageSquare,
  X,
  Check
} from 'lucide-react';
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
    iconClass: 'text-red-500',
    borderClass: 'border-l-3 border-l-red-500'
  },
  high: {
    badgeClass: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30',
    iconClass: 'text-orange-500',
    borderClass: 'border-l-3 border-l-orange-500'
  },
  medium: {
    badgeClass: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30',
    iconClass: 'text-yellow-500',
    borderClass: 'border-l-3 border-l-yellow-500'
  },
  low: {
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30',
    iconClass: 'text-blue-500',
    borderClass: 'border-l-3 border-l-blue-500'
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
  const router = useRouter();
  const locale = useLocale();

  const priority = priorityConfig[insight.priority];
  const category = categoryConfig[insight.category];
  const CategoryIcon = category.icon;

  const handleCardClick = () => {
    if (insight.status === 'new' && onReview) {
      onReview(insight._id);
    }
  };

  const handleAskAI = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Build an optimized prompt with actionable context and insight ID for MCP lookup
    const contextMessage = `Investigate this ${insight.priority.toUpperCase()} priority Action Center alert:

[INSIGHT REFERENCE]
- Insight ID: ${insight._id}
- Type: ${category.label}
- Detected: ${new Date(insight.detectedAt).toLocaleDateString()}

[ALERT DETAILS]
${insight.title}

${insight.description}
${insight.recommendedAction ? `\nSuggested action: ${insight.recommendedAction}` : ''}

Please:
1. Look up the source data for this insight (Insight ID: ${insight._id}) to verify the alert
2. Analyze my recent transactions, invoices, or expense claims related to this issue
3. Provide specific recommendations with actionable next steps
4. Flag any related concerns I should address`;

    const encodedMessage = encodeURIComponent(contextMessage);
    router.push(`/${locale}/ai-assistant?prefill=${encodedMessage}`);
  };

  return (
    <Card
      className={`p-3 hover:bg-accent/30 transition-colors ${priority.borderClass} flex flex-col h-full`}
      onClick={handleCardClick}
    >
      {/* Header with icon and title */}
      <div className="flex items-start gap-2 mb-2">
        <div className={`p-1.5 rounded-md bg-muted shrink-0 ${priority.iconClass}`}>
          <CategoryIcon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-medium text-foreground text-sm leading-tight line-clamp-2">
              {insight.title}
            </h3>
            {insight.status === 'new' && (
              <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-muted-foreground line-clamp-2 mb-2 flex-1">
        {insight.description}
      </p>

      {/* Meta row */}
      <div className="flex items-center gap-2 mb-3">
        <Badge className={`text-[10px] px-1.5 py-0 ${priority.badgeClass}`}>
          {insight.priority}
        </Badge>
        <span className="text-[10px] text-muted-foreground">
          {category.label}
        </span>
      </div>

      {/* Action buttons - always visible */}
      <div className="flex items-center gap-1.5 pt-2 border-t border-border">
        <Button
          variant="default"
          size="sm"
          onClick={handleAskAI}
          className="text-[11px] h-7 px-2 gap-1 flex-1"
        >
          <MessageSquare className="h-3 w-3" />
          Ask AI
        </Button>

        {insight.status !== 'actioned' && onAction && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onAction(insight._id);
            }}
            className="text-[11px] h-7 px-2 gap-1"
          >
            <Check className="h-3 w-3" />
            Done
          </Button>
        )}

        {insight.status !== 'dismissed' && onDismiss && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss(insight._id);
            }}
            className="text-[11px] h-7 px-2"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </Card>
  );
}

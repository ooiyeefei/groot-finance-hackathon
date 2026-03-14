'use client';

import { useState, useEffect, useRef } from 'react';
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
  isHighlighted?: boolean;
  autoOpen?: boolean;
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

export function InsightCard({ insight, onDismiss, onAction, onReview, isHighlighted, autoOpen }: InsightCardProps) {
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const priority = priorityConfig[insight.priority];
  const category = categoryConfig[insight.category];
  const CategoryIcon = category.icon;

  // Auto-open detail modal when deep-linked
  useEffect(() => {
    if (autoOpen) {
      setIsDetailOpen(true);
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [autoOpen]);

  const handleCardClick = () => {
    setIsDetailOpen(true);
  };

  // Generate context-aware suggestion chips based on insight category
  const getQuestionChips = (): string[] => {
    switch (insight.category) {
      case 'anomaly':
        return [
          'Show me the transaction details',
          'Is this a recurring pattern?',
          "What's the financial impact?",
        ];
      case 'cashflow':
        return [
          "What's my projected runway?",
          'Show me recent income vs expenses',
          'Which invoices are overdue?',
        ];
      case 'optimization':
        return [
          'Which suppliers are affected?',
          'What are my alternatives?',
          'Show me the spending trend',
        ];
      case 'compliance':
        return [
          'What are the risk factors?',
          'What information is missing?',
          'How do I resolve this?',
        ];
      case 'deadline':
        return [
          'Show me the payment details',
          'What happens if I miss this?',
          'Can I schedule this payment?',
        ];
      default:
        return [
          'What data supports this?',
          'What should I do next?',
          "What's the financial impact?",
        ];
    }
  };

  const handleAskAI = (e: React.MouseEvent) => {
    e.stopPropagation();

    // Build a concise, human-readable draft prompt (visible + editable in chat input)
    const draftMessage = `Tell me more about: "${insight.title}". What data supports this finding and what should I do?`;

    // Also pass the full context as hidden metadata for the AI to use
    const contextMetadata = {
      insightId: insight._id,
      type: category.label,
      detected: new Date(insight.detectedAt).toLocaleDateString(),
      title: insight.title,
      description: insight.description,
      recommendedAction: insight.recommendedAction,
      priority: insight.priority,
    };

    // Open the global chat widget with editable draft + suggestion chips
    window.dispatchEvent(
      new CustomEvent('finanseal:open-chat', {
        detail: {
          draftMessage,
          suggestionChips: getQuestionChips(),
          insightContext: contextMetadata,
        },
      })
    );
  };

  return (
    <>
    <Card
      ref={cardRef}
      className={`p-3 hover:bg-accent/30 transition-colors cursor-pointer ${priority.borderClass} flex flex-col h-full ${isHighlighted ? 'ring-2 ring-primary ring-offset-2' : ''}`}
      onClick={handleCardClick}
    >
      {/* Header with icon and title */}
      <div className="flex items-start gap-2 mb-2">
        <div className={`p-1.5 rounded-md bg-muted shrink-0 ${priority.iconClass}`}>
          <CategoryIcon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-medium text-foreground text-[15px] leading-tight line-clamp-2">
              {insight.title}
            </h3>
            {insight.status === 'new' && (
              <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
            )}
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-[13px] text-muted-foreground line-clamp-2 mb-2 flex-1">
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

    {/* Detail Modal */}
    {isDetailOpen && (
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
        onClick={(e) => { if (e.target === e.currentTarget) setIsDetailOpen(false); }}
      >
        <div className="bg-card rounded-lg w-full max-w-lg border border-border m-4 shadow-lg">
          {/* Modal Header */}
          <div className={`flex items-start gap-3 p-5 border-b border-border ${priority.borderClass}`}>
            <div className={`p-2 rounded-md bg-muted shrink-0 ${priority.iconClass}`}>
              <CategoryIcon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground text-base leading-snug">
                {insight.title}
              </h3>
              <div className="flex items-center gap-2 mt-1.5">
                <Badge className={`text-[11px] px-2 py-0.5 ${priority.badgeClass}`}>
                  {insight.priority}
                </Badge>
                <span className="text-xs text-muted-foreground">{category.label}</span>
                {insight.status === 'new' && (
                  <span className="w-2 h-2 rounded-full bg-primary" />
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsDetailOpen(false)}
              className="shrink-0 h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Modal Body */}
          <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
            <div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {insight.description}
              </p>
            </div>

            {insight.recommendedAction && (
              <div className="bg-muted/50 rounded-md p-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Recommended Action</p>
                <p className="text-sm text-foreground">{insight.recommendedAction}</p>
              </div>
            )}

            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Detected: {new Date(insight.detectedAt).toLocaleDateString()}</span>
              <span>Status: {insight.status}</span>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center gap-2 p-4 border-t border-border">
            <Button
              variant="default"
              size="sm"
              onClick={handleAskAI}
              className="text-xs gap-1.5 flex-1"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Ask AI
            </Button>
            {insight.status !== 'actioned' && onAction && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onAction(insight._id); setIsDetailOpen(false); }}
                className="text-xs gap-1.5"
              >
                <Check className="h-3.5 w-3.5" />
                Done
              </Button>
            )}
            {insight.status !== 'dismissed' && onDismiss && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => { e.stopPropagation(); onDismiss(insight._id); setIsDetailOpen(false); }}
                className="text-xs"
              >
                <X className="h-3.5 w-3.5" />
                Dismiss
              </Button>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

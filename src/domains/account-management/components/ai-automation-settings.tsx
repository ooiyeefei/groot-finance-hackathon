'use client';

/**
 * AI & Automation Settings - Lifetime Statistics
 * Feature: 001-surface-automation-rate
 *
 * Displays cumulative automation statistics in business settings
 */

import { useLifetimeStats } from '@/domains/analytics/hooks/use-automation-rate';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/contexts/business-context';
import { TrendingUp, Activity, Clock, Zap, Loader2 } from 'lucide-react';

export function AIAutomationSettings() {
  const { businessId } = useActiveBusiness();

  if (!businessId) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Business context not available</p>
      </div>
    );
  }

  const {
    rate,
    totalDecisions,
    decisionsReviewed,
    firstDecisionDate,
    sources,
    timesSaved,
    isLoading
  } = useLifetimeStats({ businessId: businessId as Id<"businesses"> });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading AI automation stats...</span>
      </div>
    );
  }

  // No activity state
  if (!totalDecisions || totalDecisions === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">AI & Automation</h2>
          <p className="text-sm text-muted-foreground">
            Track how AI helps automate your financial operations
          </p>
        </div>

        <div className="bg-muted/50 rounded-lg border-2 border-dashed border-border p-8 text-center">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">Get Started with AI Automation</h3>
          <p className="text-muted-foreground mb-4">
            Start processing documents to see how AI automates your workflow
          </p>
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>• Upload sales invoices for AR reconciliation</p>
            <p>• Import bank transactions for classification</p>
            <p>• Submit expense claims with receipt OCR</p>
          </div>
        </div>
      </div>
    );
  }

  const automationRate = rate ?? 0;
  const automated = (totalDecisions ?? 0) - (decisionsReviewed ?? 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">AI & Automation</h2>
        <p className="text-sm text-muted-foreground">
          Lifetime automation statistics since {firstDecisionDate || 'you started'}
        </p>
      </div>

      {/* Summary Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Automation Rate Card */}
        <div className={`rounded-lg border p-6 transition-all ${
          automationRate >= 95
            ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-700/50'
            : automationRate >= 80
            ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-700/50'
            : 'bg-card border-border'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium opacity-80">Automation Rate</p>
            <TrendingUp className={`w-5 h-5 ${
              automationRate >= 95
                ? 'text-green-600 dark:text-green-400'
                : automationRate >= 80
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-muted-foreground'
            }`} />
          </div>
          <p className={`text-3xl font-bold ${
            automationRate >= 95
              ? 'text-green-600 dark:text-green-400'
              : automationRate >= 80
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-foreground'
          }`}>
            {automationRate.toFixed(1)}%
          </p>
          <p className="text-xs opacity-60 mt-2">
            {automated} of {totalDecisions} automated
          </p>
        </div>

        {/* Total Decisions Card */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-muted-foreground">Documents Processed</p>
            <Activity className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-3xl font-bold text-foreground">{totalDecisions.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground mt-2">
            {decisionsReviewed} reviewed by you
          </p>
        </div>

        {/* Time Saved Card */}
        <div className="bg-card rounded-lg border border-border p-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-muted-foreground">Time Saved</p>
            <Clock className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-3xl font-bold text-foreground">{timesSaved?.formatted || '0 hours'}</p>
          <p className="text-xs text-muted-foreground mt-2">
            Estimated based on manual work
          </p>
        </div>
      </div>

      {/* Source Breakdown */}
      <div className="bg-card rounded-lg border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Automation by Feature</h3>

        <div className="space-y-4">
          {sources && (
            <>
              {/* AR Reconciliation */}
              {sources.arRecon.total > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">AR Reconciliation</p>
                    <p className="text-xs text-muted-foreground">
                      Sales invoices matched to orders
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">
                      {sources.arRecon.total > 0
                        ? (((sources.arRecon.total - sources.arRecon.reviewed) / sources.arRecon.total) * 100).toFixed(1)
                        : 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {sources.arRecon.total} processed
                    </p>
                  </div>
                </div>
              )}

              {/* Bank Classification */}
              {sources.bankRecon.total > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Bank Reconciliation</p>
                    <p className="text-xs text-muted-foreground">
                      Transactions classified to GL accounts
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">
                      {sources.bankRecon.total > 0
                        ? (((sources.bankRecon.total - sources.bankRecon.reviewed) / sources.bankRecon.total) * 100).toFixed(1)
                        : 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {sources.bankRecon.total} processed
                    </p>
                  </div>
                </div>
              )}

              {/* Fee Classification */}
              {sources.feeClassification.total > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Fee Breakdown</p>
                    <p className="text-xs text-muted-foreground">
                      Sales fees categorized automatically
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">
                      {sources.feeClassification.total > 0
                        ? (((sources.feeClassification.total - sources.feeClassification.reviewed) / sources.feeClassification.total) * 100).toFixed(1)
                        : 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {sources.feeClassification.total} processed
                    </p>
                  </div>
                </div>
              )}

              {/* Expense OCR */}
              {sources.expenseOCR.total > 0 && (
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Expense OCR</p>
                    <p className="text-xs text-muted-foreground">
                      Receipt data extracted automatically
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-foreground">
                      {sources.expenseOCR.total > 0
                        ? (((sources.expenseOCR.total - sources.expenseOCR.reviewed) / sources.expenseOCR.total) * 100).toFixed(1)
                        : 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {sources.expenseOCR.total} processed
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Help Text */}
      <div className="bg-muted/50 rounded-lg p-4">
        <p className="text-sm text-muted-foreground">
          <strong>What is automation rate?</strong> The percentage of AI decisions that didn't require manual review or correction.
          A higher rate means AI is more accurately handling your financial operations.
        </p>
      </div>
    </div>
  );
}

'use client';

import { AlertTriangle, CheckCircle, XCircle, ChevronRight, HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { BusinessOverview, ToolSummary } from '../hooks/use-dspy-metrics';

const TOOL_LABELS: Record<string, string> = {
  classify_fees: 'Fee Classification',
  classify_bank_transaction: 'Bank Recon',
  match_orders: 'AR Matching',
  match_po_invoice: 'PO Matching',
  match_vendor_items: 'Vendor Items',
  chat_intent: 'Chat Intent',
  chat_tool_selector: 'Chat Tool Select',
  chat_param_extractor: 'Chat Params',
};

function ToolHealthBadge({ tool }: { tool: ToolSummary }) {
  if (tool.tier2Invocations === 0 && tool.tier1Hits === 0) {
    return <span className="text-xs text-muted-foreground">No data</span>;
  }

  if (tool.isDegraded) {
    return (
      <span className="flex items-center gap-1 text-xs text-destructive">
        <AlertTriangle className="w-3 h-3" /> Degraded
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1 text-xs text-emerald-500">
      <CheckCircle className="w-3 h-3" /> Healthy
    </span>
  );
}

function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

function formatMs(value: number | null): string {
  if (value === null) return '—';
  if (value > 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${value}ms`;
}

interface HealthOverviewProps {
  businesses: BusinessOverview[];
  onSelectBusiness: (id: string) => void;
}

export function HealthOverview({ businesses, onSelectBusiness }: HealthOverviewProps) {
  return (
    <TooltipProvider>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Health Overview</h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-xs mb-2">
                Shows performance metrics for classification tools (fee classification, bank recon, AR/PO matching, vendor items).
              </p>
              <p className="text-xs mb-2">
                <strong>Chat tools show "No data"</strong> here because they don't run classifications - they only collect corrections via thumbs-down feedback.
              </p>
              <p className="text-xs">
                <strong>Classifications</strong> = number of times the AI tool ran (e.g., classifying a fee, matching an invoice)
              </p>
            </TooltipContent>
          </Tooltip>
        </div>

      {businesses.map((biz) => {
        const totalInvocations = biz.tools.reduce((s, t) => s + t.totalClassifications, 0);
        const degradedCount = biz.tools.filter((t) => t.isDegraded).length;

        return (
          <div
            key={biz.businessId}
            onClick={() => onSelectBusiness(biz.businessId)}
            className="bg-card border rounded-lg p-4 cursor-pointer hover:border-primary/50 transition-colors"
          >
            {/* Business header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-foreground">{biz.businessName}</h4>
                {degradedCount > 0 && (
                  <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">
                    {degradedCount} degraded
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-xs">{totalInvocations} classifications</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>

            {/* Tool grid */}
            <div className="grid grid-cols-4 lg:grid-cols-8 gap-3">
              {biz.tools.map((tool) => (
                <div key={tool.tool} className="text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground truncate">{TOOL_LABELS[tool.tool] || tool.tool}</span>
                  </div>
                  <ToolHealthBadge tool={tool} />
                  {tool.tier2Invocations > 0 && (
                    <div className="space-y-0.5 text-muted-foreground">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-help">Conf: {formatPercent(tool.avgConfidence)}</div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">Average confidence score (0-100%). Higher = AI is more certain about its classifications.</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-help">Latency: {formatMs(tool.avgLatencyMs)}</div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">Average time for AI to complete classification. Lower is better.</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="cursor-help">Retry: {formatPercent(tool.refineRetryRate)}</div>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p className="text-xs">How often the AI had to retry due to constraint violations (e.g., invalid format, missing required fields). Lower is better.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
    </TooltipProvider>
  );
}

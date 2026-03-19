'use client';

import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { BusinessOverview } from '../hooks/use-dspy-metrics';

const TOOL_LABELS: Record<string, string> = {
  classify_fees: 'Fees',
  classify_bank_transaction: 'Bank',
  match_orders: 'AR',
  match_po_invoice: 'PO',
  match_vendor_items: 'Vendor',
  chat_intent: 'Chat Intent',
  chat_tool_selector: 'Chat Tool',
  chat_param_extractor: 'Chat Params',
};

function formatCost(usd: number): string {
  if (usd < 0.01) return '<$0.01';
  return `$${usd.toFixed(2)}`;
}

function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${(value * 100).toFixed(1)}%`;
}

interface CostPanelProps {
  businesses: BusinessOverview[];
}

export function CostPanel({ businesses }: CostPanelProps) {
  const totalCost = businesses.reduce(
    (sum, biz) => sum + biz.tools.reduce((s, t) => s + t.estimatedCostUsd, 0),
    0
  );

  return (
    <TooltipProvider>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Cost & Efficiency</h3>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs mb-2">
                  Tracks AI costs and efficiency metrics for classification tools.
                </p>
                <p className="text-xs">
                  <strong>Tier 1</strong> = free rule-based matching (no AI cost).
                  <strong> Tier 2</strong> = AI/LLM classification (costs money but handles edge cases).
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <span className="text-sm font-medium text-foreground">
            Total: {formatCost(totalCost)}
          </span>
        </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium text-muted-foreground">Business</th>
              <th className="text-right p-3 font-medium text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help flex items-center justify-end gap-1">
                      Tier 1 Rate <HelpCircle className="w-3 h-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">% of cases handled by free rule-based logic (no AI cost). Higher = more cost-efficient.</p>
                  </TooltipContent>
                </Tooltip>
              </th>
              <th className="text-right p-3 font-medium text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help flex items-center justify-end gap-1">
                      Tier 2 Calls <HelpCircle className="w-3 h-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">Number of AI/LLM calls (these cost money). Tier 2 handles edge cases that rules can't.</p>
                  </TooltipContent>
                </Tooltip>
              </th>
              <th className="text-right p-3 font-medium text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help flex items-center justify-end gap-1">
                      Est. Cost <HelpCircle className="w-3 h-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">Estimated Gemini API cost based on token usage (input: $0.25/M, output: $1.50/M)</p>
                  </TooltipContent>
                </Tooltip>
              </th>
              <th className="text-right p-3 font-medium text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help flex items-center justify-end gap-1">
                      Accuracy <HelpCircle className="w-3 h-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">% of classifications that didn't need manual override. Higher = AI is doing better.</p>
                  </TooltipContent>
                </Tooltip>
              </th>
              <th className="text-right p-3 font-medium text-muted-foreground">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help flex items-center justify-end gap-1">
                      Cost/Correct <HelpCircle className="w-3 h-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">Cost per correct classification (lower = more efficient). As accuracy improves, this should decrease.</p>
                  </TooltipContent>
                </Tooltip>
              </th>
            </tr>
          </thead>
          <tbody>
            {businesses.map((biz) => {
              const totalTier1 = biz.tools.reduce((s, t) => s + t.tier1Hits, 0);
              const totalTier2 = biz.tools.reduce((s, t) => s + t.tier2Invocations, 0);
              const totalAll = totalTier1 + totalTier2;
              const tier1Rate = totalAll > 0 ? totalTier1 / totalAll : null;
              const bizCost = biz.tools.reduce((s, t) => s + t.estimatedCostUsd, 0);
              const totalOverrides = biz.tools.reduce((s, t) => s + t.overrideCount, 0);
              const totalClassifications = biz.tools.reduce((s, t) => s + t.totalClassifications, 0);
              const accuracy = totalClassifications > 0 ? 1 - totalOverrides / totalClassifications : null;
              const correctCount = totalClassifications - totalOverrides;
              const costPerCorrect = correctCount > 0 ? bizCost / correctCount : null;

              return (
                <tr key={biz.businessId} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-3 font-medium text-foreground">{biz.businessName}</td>
                  <td className="p-3 text-right text-muted-foreground">{formatPercent(tier1Rate)}</td>
                  <td className="p-3 text-right text-muted-foreground">{totalTier2}</td>
                  <td className="p-3 text-right text-foreground">{formatCost(bizCost)}</td>
                  <td className="p-3 text-right text-muted-foreground">{formatPercent(accuracy)}</td>
                  <td className="p-3 text-right text-muted-foreground">
                    {costPerCorrect !== null ? formatCost(costPerCorrect) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </TooltipProvider>
  );
}

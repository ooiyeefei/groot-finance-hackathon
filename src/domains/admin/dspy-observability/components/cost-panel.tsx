'use client';

import type { BusinessOverview } from '../hooks/use-dspy-metrics';

const TOOL_LABELS: Record<string, string> = {
  classify_fees: 'Fees',
  classify_bank_transaction: 'Bank',
  match_orders: 'AR',
  match_po_invoice: 'PO',
  match_vendor_items: 'Vendor',
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Cost & Efficiency</h3>
        <span className="text-sm font-medium text-foreground">
          Total: {formatCost(totalCost)}
        </span>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left p-3 font-medium text-muted-foreground">Business</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Tier 1 Rate</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Tier 2 Calls</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Est. Cost</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Accuracy</th>
              <th className="text-right p-3 font-medium text-muted-foreground">Cost/Correct</th>
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
  );
}

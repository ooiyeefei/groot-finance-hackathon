'use client';

import type { BusinessOverview, CorrectionFunnel } from '../hooks/use-dspy-metrics';

const TOOL_LABELS: Record<string, string> = {
  classify_fees: 'Fees',
  classify_bank_transaction: 'Bank',
  match_orders: 'AR',
  match_po_invoice: 'PO',
  match_vendor_items: 'Vendor',
};

function CorrectionBar({ count, threshold }: { count: number; threshold: number }) {
  const pct = Math.min((count / threshold) * 100, 100);
  const isActive = count >= threshold;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{count} / {threshold}</span>
        {isActive && <span className="text-emerald-500 font-medium">Active</span>}
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isActive ? 'bg-emerald-500' : 'bg-primary/60'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

interface SelfImprovementPanelProps {
  businesses: BusinessOverview[];
  funnels: CorrectionFunnel[];
}

export function SelfImprovementPanel({ businesses, funnels }: SelfImprovementPanelProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        Self-Improvement — Correction Funnels
      </h3>
      <p className="text-xs text-muted-foreground">
        BootstrapFewShot activates after 20 corrections per tool. Higher bar = closer to self-improving AI.
      </p>

      <div className="grid gap-3">
        {funnels.map((biz) => (
          <div key={biz.businessId} className="bg-card border rounded-lg p-4">
            <h4 className="font-medium text-foreground mb-3">{biz.businessName}</h4>
            <div className="grid grid-cols-5 gap-4">
              {biz.tools.map((tool) => (
                <div key={tool.tool}>
                  <div className="text-xs font-medium text-foreground mb-1">
                    {TOOL_LABELS[tool.tool] || tool.tool}
                  </div>
                  <CorrectionBar count={tool.correctionCount} threshold={tool.threshold} />
                </div>
              ))}
            </div>

            {/* Confidence comparison if DSPy data available */}
            {businesses.find((b) => b.businessId === biz.businessId)?.tools.some(
              (t) => t.avgConfidenceDspy !== null && t.avgConfidenceBase !== null
            ) && (
              <div className="mt-3 pt-3 border-t">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Confidence: Base vs BootstrapFewShot
                </div>
                <div className="grid grid-cols-5 gap-4">
                  {businesses
                    .find((b) => b.businessId === biz.businessId)
                    ?.tools.map((tool) => {
                      const baseConf = tool.avgConfidenceBase;
                      const dspyConf = tool.avgConfidenceDspy;
                      const delta = baseConf !== null && dspyConf !== null ? dspyConf - baseConf : null;

                      return (
                        <div key={tool.tool} className="text-xs">
                          <div className="text-muted-foreground">
                            Base: {baseConf !== null ? `${(baseConf * 100).toFixed(0)}%` : '—'}
                          </div>
                          <div className="text-muted-foreground">
                            DSPy: {dspyConf !== null ? `${(dspyConf * 100).toFixed(0)}%` : '—'}
                          </div>
                          {delta !== null && (
                            <div className={delta > 0 ? 'text-emerald-500 font-medium' : delta < 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                              {delta > 0 ? '+' : ''}{(delta * 100).toFixed(1)}%
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

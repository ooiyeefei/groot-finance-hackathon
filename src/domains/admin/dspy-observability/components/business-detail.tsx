'use client';

import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import type { DailyMetric, TimeWindow } from '../hooks/use-dspy-metrics';

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

interface CorrectionTool {
  tool: string;
  correctionCount: number;
  threshold: number;
}

interface BusinessDetailProps {
  businessId: string;
  businessName: string;
  detail: Record<string, DailyMetric[]> | null;
  loading: boolean;
  funnels: CorrectionTool[];
  onBack: () => void;
  timeWindow: TimeWindow;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function BusinessDetail({
  businessName,
  detail,
  loading,
  funnels,
  onBack,
}: BusinessDetailProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!detail || Object.keys(detail).length === 0) {
    return (
      <div className="space-y-4">
        <Button onClick={onBack} className="bg-secondary hover:bg-secondary/80 text-secondary-foreground" size="sm">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="text-center py-12 text-muted-foreground">
          No detailed metrics available for {businessName}.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button onClick={onBack} className="bg-secondary hover:bg-secondary/80 text-secondary-foreground" size="sm">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <h3 className="text-lg font-semibold text-foreground">{businessName}</h3>
      </div>

      {/* Correction funnel for this business */}
      {funnels.length > 0 && (
        <div className="bg-card border rounded-lg p-4">
          <h4 className="text-sm font-medium text-muted-foreground mb-3">Correction Progress → BootstrapFewShot</h4>
          <div className="grid grid-cols-4 lg:grid-cols-8 gap-4">
            {funnels.map((tool) => {
              const pct = Math.min((tool.correctionCount / tool.threshold) * 100, 100);
              const isActive = tool.correctionCount >= tool.threshold;
              return (
                <div key={tool.tool}>
                  <div className="text-xs font-medium text-foreground mb-1">
                    {TOOL_LABELS[tool.tool] || tool.tool}
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{tool.correctionCount}/{tool.threshold}</span>
                    {isActive && <span className="text-emerald-500">Active</span>}
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${isActive ? 'bg-emerald-500' : 'bg-primary/60'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Per-tool confidence trend charts */}
      {Object.entries(detail).map(([toolName, series]) => {
        const chartData = series.map((d) => ({
          date: formatDate(d.date),
          avgConfidence: d.tier2Invocations > 0 ? +(d.sumConfidence / d.tier2Invocations * 100).toFixed(1) : null,
          avgConfDspy: d.dspyUsedCount > 0 ? +(d.sumConfidenceDspy / d.dspyUsedCount * 100).toFixed(1) : null,
          avgConfBase: (d.tier2Invocations - d.dspyUsedCount) > 0
            ? +(d.sumConfidenceBase / (d.tier2Invocations - d.dspyUsedCount) * 100).toFixed(1)
            : null,
          refineRetryRate: d.tier2Invocations > 0 ? +(d.totalRefineRetries / d.tier2Invocations * 100).toFixed(1) : null,
          invocations: d.tier2Invocations + d.tier1Hits,
        }));

        return (
          <div key={toolName} className="bg-card border rounded-lg p-4">
            <h4 className="font-medium text-foreground mb-3">
              {TOOL_LABELS[toolName] || toolName}
            </h4>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line type="monotone" dataKey="avgConfidence" stroke="#6366f1" name="Avg Confidence %" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="avgConfDspy" stroke="#10b981" name="DSPy Confidence %" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
                  <Line type="monotone" dataKey="avgConfBase" stroke="#94a3b8" name="Base Confidence %" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* Summary stats */}
            <div className="grid grid-cols-4 gap-4 mt-3 pt-3 border-t text-xs">
              <div>
                <span className="text-muted-foreground">Total</span>
                <div className="font-medium text-foreground">{series.reduce((s, d) => s + d.tier2Invocations + d.tier1Hits, 0)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Overrides</span>
                <div className="font-medium text-foreground">{series.reduce((s, d) => s + d.overrideCount, 0)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Refine Retries</span>
                <div className="font-medium text-foreground">{series.reduce((s, d) => s + d.totalRefineRetries, 0)}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Fallbacks</span>
                <div className="font-medium text-foreground">{series.reduce((s, d) => s + d.fallbackCount, 0)}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

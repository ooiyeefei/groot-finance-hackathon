'use client';

import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { BusinessOverview, CorrectionFunnel } from '../hooks/use-dspy-metrics';

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

const TOOL_TOOLTIPS: Record<string, string> = {
  chat_intent: 'Thumbs down when the chat agent misunderstands your question or chooses the wrong intent (e.g., you asked about expenses but it thought you meant invoices)',
  chat_tool_selector: 'Thumbs down when the chat agent calls the wrong tool or action (e.g., you wanted to search invoices but it tried to create one)',
  chat_param_extractor: 'Thumbs down when the chat agent extracts wrong parameters from your message (e.g., wrong date, wrong amount, wrong vendor name)',
  classify_fees: 'Corrections from fee breakdown classification (manual overrides when AI misclassifies expense line items)',
  classify_bank_transaction: 'Corrections from bank transaction reconciliation (overrides when AI matches wrong transactions)',
  match_orders: 'Corrections from AR matching (overrides when AI matches sales orders to wrong invoices)',
  match_po_invoice: 'Corrections from PO matching (overrides when AI matches purchase orders to wrong invoices)',
  match_vendor_items: 'Corrections from vendor item matching (overrides when AI matches wrong vendor items)',
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
    <TooltipProvider>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Self-Improvement — Correction Funnels
          </h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="font-semibold mb-1">How Corrections Work</p>
              <p className="text-xs mb-2">
                When you click thumbs-down in the chat or override an AI classification, your correction is stored here.
              </p>
              <p className="text-xs mb-2">
                After <strong>20 corrections</strong> per tool, BootstrapFewShot retrains the model weekly using your feedback as examples.
              </p>
              <p className="text-xs">
                The AI learns from your corrections and gets smarter over time — no manual retraining needed!
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-xs text-muted-foreground">
          BootstrapFewShot activates after 20 corrections per tool. Higher bar = closer to self-improving AI.
        </p>

      <div className="grid gap-3">
        {funnels.map((biz) => (
          <div key={biz.businessId} className="bg-card border rounded-lg p-4">
            <h4 className="font-medium text-foreground mb-3">{biz.businessName}</h4>
            <div className="grid grid-cols-4 lg:grid-cols-8 gap-4">
              {biz.tools.map((tool) => (
                <div key={tool.tool}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-xs font-medium text-foreground mb-1 cursor-help flex items-center gap-1">
                        {TOOL_LABELS[tool.tool] || tool.tool}
                        <HelpCircle className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs">{TOOL_TOOLTIPS[tool.tool] || 'Correction count for this tool'}</p>
                      {tool.correctionCount >= tool.threshold && (
                        <p className="text-xs mt-1 text-emerald-500 font-medium">
                          ✓ Active: Model is now using your {tool.correctionCount} corrections to self-improve!
                        </p>
                      )}
                      {tool.correctionCount > 0 && tool.correctionCount < tool.threshold && (
                        <p className="text-xs mt-1 text-muted-foreground">
                          {tool.threshold - tool.correctionCount} more corrections needed to activate BootstrapFewShot
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                  <CorrectionBar count={tool.correctionCount} threshold={tool.threshold} />
                </div>
              ))}
            </div>

            {/* Confidence comparison if DSPy data available */}
            {businesses.find((b) => b.businessId === biz.businessId)?.tools.some(
              (t) => t.avgConfidenceDspy !== null && t.avgConfidenceBase !== null
            ) && (
              <div className="mt-3 pt-3 border-t">
                <div className="flex items-center gap-2 mb-2">
                  <div className="text-xs font-medium text-muted-foreground">
                    Confidence: Base vs BootstrapFewShot
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-3 h-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs mb-1">
                        <strong>Base:</strong> Original AI confidence without your corrections
                      </p>
                      <p className="text-xs mb-1">
                        <strong>DSPy:</strong> AI confidence after learning from your corrections
                      </p>
                      <p className="text-xs text-emerald-500">
                        Green delta = AI improved after training on your feedback!
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="grid grid-cols-4 lg:grid-cols-8 gap-4">
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
    </TooltipProvider>
  );
}

'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HealthOverview } from './health-overview';
import { SelfImprovementPanel } from './self-improvement-panel';
import { CostPanel } from './cost-panel';
import { BusinessDetail } from './business-detail';
import {
  useDspyOverview,
  useCorrectionFunnels,
  useDspyBusinessDetail,
  type TimeWindow,
} from '../hooks/use-dspy-metrics';

const TIME_WINDOWS: { label: string; value: TimeWindow }[] = [
  { label: '24h', value: '24h' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
];

export default function DspyDashboard() {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('7d');
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);

  const { data: overview, loading: overviewLoading, refresh: refreshOverview } = useDspyOverview(timeWindow);
  const { data: funnels, loading: funnelsLoading, refresh: refreshFunnels } = useCorrectionFunnels();
  const { data: businessDetail, loading: detailLoading } = useDspyBusinessDetail(selectedBusinessId, timeWindow);

  const refreshAll = () => {
    refreshOverview();
    refreshFunnels();
  };

  const loading = overviewLoading || funnelsLoading;

  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading DSPy metrics...</p>
        </div>
      </div>
    );
  }

  // Filter funnels to only show businesses with at least one correction
  const funnelsWithData = (funnels || []).filter(
    (funnel) => funnel.tools.some((tool) => tool.correctionCount > 0)
  );

  // Show empty state only if BOTH overview and funnels are empty
  if ((!overview || overview.length === 0) && funnelsWithData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <span className="text-2xl">🧠</span>
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No DSPy Metrics Yet</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Metrics will appear here once DSPy tools are used. This includes chat corrections, fee classification,
          bank reconciliation, AR/PO matching, and vendor item matching.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">DSPy Observability</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Is DSPy making our AI smarter, or just burning Gemini credits?
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Time window selector */}
          <div className="flex bg-muted rounded-md p-0.5">
            {TIME_WINDOWS.map((tw) => (
              <button
                key={tw.value}
                onClick={() => setTimeWindow(tw.value)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  timeWindow === tw.value
                    ? 'bg-card text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tw.label}
              </button>
            ))}
          </div>
          <Button
            onClick={refreshAll}
            className="bg-secondary hover:bg-secondary/80 text-secondary-foreground"
            size="sm"
          >
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Drill-down or Overview */}
      {selectedBusinessId ? (
        <BusinessDetail
          businessId={selectedBusinessId}
          businessName={overview?.find((b) => b.businessId === selectedBusinessId)?.businessName || funnelsWithData.find((f) => f.businessId === selectedBusinessId)?.businessName || ''}
          detail={businessDetail}
          loading={detailLoading}
          funnels={funnels?.find((f) => f.businessId === selectedBusinessId)?.tools || []}
          onBack={() => setSelectedBusinessId(null)}
          timeWindow={timeWindow}
        />
      ) : (
        <>
          {/* Health Overview — cross-business summary (only if classification data exists) */}
          {overview && overview.length > 0 && (
            <HealthOverview
              businesses={overview}
              onSelectBusiness={setSelectedBusinessId}
            />
          )}

          {/* Self-Improvement Panel — correction funnels (always show if data exists) */}
          {funnelsWithData.length > 0 && (
            <SelfImprovementPanel
              businesses={overview || []}
              funnels={funnelsWithData}
            />
          )}

          {/* Cost Panel (only if classification data exists) */}
          {overview && overview.length > 0 && (
            <CostPanel businesses={overview} />
          )}
        </>
      )}
    </div>
  );
}

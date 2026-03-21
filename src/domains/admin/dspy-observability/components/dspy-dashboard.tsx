'use client';

import { useState, useMemo } from 'react';
import { RefreshCw, Search, Building2, ChevronDown } from 'lucide-react';
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

function BusinessSelector({
  businesses,
  selectedId,
  onSelect,
}: {
  businesses: Array<{ id: string; name: string; correctionCount: number; classificationCount: number }>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = businesses.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase())
  );

  const selected = businesses.find((b) => b.id === selectedId);
  const label = selected ? selected.name : 'All Businesses';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 bg-card border rounded-lg text-sm hover:border-primary/50 transition-colors min-w-[240px]"
      >
        <Building2 className="w-4 h-4 text-muted-foreground" />
        <span className="flex-1 text-left font-medium text-foreground truncate">{label}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setSearch(''); }} />

          {/* Dropdown */}
          <div className="absolute top-full left-0 mt-1 w-[320px] bg-card border rounded-lg shadow-lg z-20 overflow-hidden">
            {/* Search */}
            <div className="p-2 border-b">
              <div className="flex items-center gap-2 px-2 py-1.5 bg-muted rounded-md">
                <Search className="w-4 h-4 text-muted-foreground" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search businesses..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
              </div>
            </div>

            {/* Options */}
            <div className="max-h-[300px] overflow-y-auto p-1">
              {/* All Businesses option */}
              <button
                onClick={() => { onSelect(null); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                  !selectedId ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'
                }`}
              >
                <Building2 className="w-4 h-4" />
                <div className="flex-1">
                  <div className="font-medium">All Businesses</div>
                  <div className="text-xs text-muted-foreground">{businesses.length} businesses</div>
                </div>
              </button>

              {filtered.length === 0 && search && (
                <div className="px-3 py-4 text-sm text-muted-foreground text-center">
                  No businesses match &quot;{search}&quot;
                </div>
              )}

              {filtered.map((biz) => (
                <button
                  key={biz.id}
                  onClick={() => { onSelect(biz.id); setOpen(false); setSearch(''); }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-left transition-colors ${
                    selectedId === biz.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted text-foreground'
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                    {biz.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{biz.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {biz.correctionCount > 0 && <span>{biz.correctionCount} corrections</span>}
                      {biz.correctionCount > 0 && biz.classificationCount > 0 && <span> · </span>}
                      {biz.classificationCount > 0 && <span>{biz.classificationCount} classifications</span>}
                      {biz.correctionCount === 0 && biz.classificationCount === 0 && <span>No activity</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

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

  // Build unified business list from both overview and funnels
  const allBusinesses = useMemo(() => {
    const bizMap = new Map<string, { id: string; name: string; correctionCount: number; classificationCount: number }>();

    // From overview (has classification data)
    for (const biz of overview || []) {
      bizMap.set(biz.businessId, {
        id: biz.businessId,
        name: biz.businessName,
        correctionCount: 0,
        classificationCount: biz.tools.reduce((s, t) => s + t.totalClassifications, 0),
      });
    }

    // From funnels (has correction data)
    for (const funnel of funnels || []) {
      const totalCorr = funnel.tools.reduce((s, t) => s + t.correctionCount, 0);
      if (totalCorr === 0) continue; // Skip businesses with zero corrections
      const existing = bizMap.get(funnel.businessId);
      if (existing) {
        existing.correctionCount = totalCorr;
      } else {
        bizMap.set(funnel.businessId, {
          id: funnel.businessId,
          name: funnel.businessName,
          correctionCount: totalCorr,
          classificationCount: 0,
        });
      }
    }

    return Array.from(bizMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [overview, funnels]);

  // Filter funnels to only show businesses with at least one correction
  const funnelsWithData = (funnels || []).filter(
    (funnel) => funnel.tools.some((tool) => tool.correctionCount > 0)
  );

  // Filter data for selected business
  const filteredOverview = selectedBusinessId
    ? (overview || []).filter((b) => b.businessId === selectedBusinessId)
    : overview || [];

  const filteredFunnels = selectedBusinessId
    ? funnelsWithData.filter((f) => f.businessId === selectedBusinessId)
    : funnelsWithData;

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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4">
          <div>
            <h2 className="text-xl font-semibold text-foreground">DSPy Observability</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Is DSPy making our AI smarter, or just burning Gemini credits?
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Business selector */}
          <BusinessSelector
            businesses={allBusinesses}
            selectedId={selectedBusinessId}
            onSelect={setSelectedBusinessId}
          />

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

      {/* Selected business detail view or overview */}
      {selectedBusinessId && businessDetail ? (
        <BusinessDetail
          businessId={selectedBusinessId}
          businessName={allBusinesses.find((b) => b.id === selectedBusinessId)?.name || ''}
          detail={businessDetail}
          loading={detailLoading}
          funnels={funnels?.find((f) => f.businessId === selectedBusinessId)?.tools || []}
          onBack={() => setSelectedBusinessId(null)}
          timeWindow={timeWindow}
        />
      ) : (
        <>
          {/* Health Overview (only if classification data exists) */}
          {filteredOverview.length > 0 && (
            <HealthOverview
              businesses={filteredOverview}
              onSelectBusiness={setSelectedBusinessId}
            />
          )}

          {/* Self-Improvement Panel — correction funnels */}
          {filteredFunnels.length > 0 && (
            <SelfImprovementPanel
              businesses={filteredOverview}
              funnels={filteredFunnels}
            />
          )}

          {/* Cost Panel (only if classification data exists) */}
          {filteredOverview.length > 0 && (
            <CostPanel businesses={filteredOverview} />
          )}
        </>
      )}
    </div>
  );
}

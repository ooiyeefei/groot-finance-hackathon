"use client";

import { useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useState, useCallback } from "react";

/**
 * Bandwidth-safe hook for purchase price history via vendor mappings.
 * Uses action + useState (not reactive useQuery) per CLAUDE.md bandwidth rules.
 */
export function usePurchaseHistory(
  businessId: string | null | undefined,
  catalogItemId: string | null | undefined
) {
  const [records, setRecords] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [vendors, setVendors] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [trendData, setTrendData] = useState<any[]>([]);
  const [isTrendLoading, setIsTrendLoading] = useState(false);

  const fetchHistory = useAction(api.functions.sellingPriceHistory.getPurchaseHistoryByMappings);
  const fetchTrend = useAction(api.functions.sellingPriceHistory.getPurchasePriceTrend);

  const loadHistory = useCallback(
    async (filters?: {
      vendorId?: string;
      startDate?: string;
      endDate?: string;
    }) => {
      if (!businessId || !catalogItemId) return;

      setIsLoading(true);
      try {
        const result = await fetchHistory({
          businessId: businessId as Id<"businesses">,
          catalogItemId: catalogItemId as Id<"catalog_items">,
          vendorId: filters?.vendorId as Id<"vendors"> | undefined,
          startDate: filters?.startDate,
          endDate: filters?.endDate,
        });
        setRecords(result.records);
        setTotalCount(result.totalCount);
        setVendors(result.vendors);
      } catch (e) {
        console.error("[usePurchaseHistory] Fetch failed:", e);
        setRecords([]);
      } finally {
        setIsLoading(false);
      }
    },
    [businessId, catalogItemId, fetchHistory]
  );

  const loadTrend = useCallback(
    async (filters?: {
      vendorId?: string;
      startDate?: string;
      endDate?: string;
    }) => {
      if (!businessId || !catalogItemId) return;

      setIsTrendLoading(true);
      try {
        const result = await fetchTrend({
          businessId: businessId as Id<"businesses">,
          catalogItemId: catalogItemId as Id<"catalog_items">,
          vendorId: filters?.vendorId as Id<"vendors"> | undefined,
          startDate: filters?.startDate,
          endDate: filters?.endDate,
        });
        setTrendData(result.dataPoints);
      } catch (e) {
        console.error("[usePurchaseHistory] Trend fetch failed:", e);
        setTrendData([]);
      } finally {
        setIsTrendLoading(false);
      }
    },
    [businessId, catalogItemId, fetchTrend]
  );

  return {
    records,
    totalCount,
    vendors,
    isLoading,
    trendData,
    isTrendLoading,
    loadHistory,
    loadTrend,
  };
}

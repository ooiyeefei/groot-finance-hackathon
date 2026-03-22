"use client";

import { useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useState, useCallback } from "react";

/**
 * Bandwidth-safe hook for selling price history.
 * Uses action + useState (not reactive useQuery) per CLAUDE.md bandwidth rules.
 */
export function useSellingPriceHistory(
  businessId: string | null | undefined,
  catalogItemId: string | null | undefined
) {
  const [records, setRecords] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [latestPrice, setLatestPrice] = useState<{
    unitPrice: number;
    currency: string;
    date: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useAction(api.functions.sellingPriceHistory.getSalesHistory);
  const fetchTrend = useAction(api.functions.sellingPriceHistory.getSalesPriceTrend);

  const [trendData, setTrendData] = useState<any[]>([]);
  const [isTrendLoading, setIsTrendLoading] = useState(false);

  const loadHistory = useCallback(
    async (filters?: {
      customerId?: Id<"customers">;
      startDate?: string;
      endDate?: string;
    }) => {
      if (!businessId || !catalogItemId) return;

      setIsLoading(true);
      setError(null);
      try {
        const result = await fetchHistory({
          businessId: businessId as Id<"businesses">,
          catalogItemId: catalogItemId as Id<"catalog_items">,
          customerId: filters?.customerId,
          startDate: filters?.startDate,
          endDate: filters?.endDate,
        });
        setRecords(result.records);
        setTotalCount(result.totalCount);
        setLatestPrice(result.latestPrice);
      } catch (e) {
        console.error("[useSellingPriceHistory] Fetch failed:", e);
        setError("Failed to load sales history");
        setRecords([]);
      } finally {
        setIsLoading(false);
      }
    },
    [businessId, catalogItemId, fetchHistory]
  );

  const loadTrend = useCallback(
    async (filters?: {
      customerId?: Id<"customers">;
      startDate?: string;
      endDate?: string;
    }) => {
      if (!businessId || !catalogItemId) return;

      setIsTrendLoading(true);
      try {
        const result = await fetchTrend({
          businessId: businessId as Id<"businesses">,
          catalogItemId: catalogItemId as Id<"catalog_items">,
          customerId: filters?.customerId,
          startDate: filters?.startDate,
          endDate: filters?.endDate,
        });
        setTrendData(result.dataPoints);
      } catch (e) {
        console.error("[useSellingPriceHistory] Trend fetch failed:", e);
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
    latestPrice,
    isLoading,
    error,
    loadHistory,
    trendData,
    isTrendLoading,
    loadTrend,
  };
}

"use client";

import { useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useState, useCallback } from "react";

/**
 * Hook for margin summary calculation.
 * Uses action + useState (bandwidth-safe — reads from both selling + purchase tables).
 */
export function useMarginSummary(
  businessId: string | null | undefined,
  catalogItemId: string | null | undefined
) {
  const [data, setData] = useState<{
    latestSellingPrice: { unitPrice: number; currency: string; date: string; customerName: string } | null;
    latestPurchaseCost: { unitPrice: number; currency: string; date: string; vendorName: string } | null;
    marginPercent: number | null;
    homeCurrency: string;
    marginWarning: string | null;
    currencyNote: string | null;
    hasMappings: boolean;
    mappingCount: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchMargin = useAction(api.functions.sellingPriceHistory.getMarginSummary);

  const loadMargin = useCallback(async () => {
    if (!businessId || !catalogItemId) return;

    setIsLoading(true);
    try {
      const result = await fetchMargin({ businessId: businessId as Id<"businesses">, catalogItemId: catalogItemId as Id<"catalog_items"> });
      setData(result as any);
    } catch (e) {
      console.error("[useMarginSummary] Fetch failed:", e);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [businessId, catalogItemId, fetchMargin]);

  return {
    data,
    isLoading,
    loadMargin,
  };
}

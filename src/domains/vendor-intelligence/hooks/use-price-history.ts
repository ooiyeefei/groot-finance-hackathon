"use client";

import { useQuery, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useState, useEffect, useCallback } from "react";

/**
 * T020: Custom hook for price history.
 *
 * BANDWIDTH-SAFE: Uses action + useState instead of reactive useQuery.
 * Per CLAUDE.md Rule 1: vendor_price_history is a large table —
 * reactive query would re-read ALL records on every change.
 * Action runs once on mount + when filters change.
 */
export function usePriceHistory(businessId: Id<"businesses"> | undefined) {
  const [vendorId, setVendorId] = useState<Id<"vendors"> | undefined>();
  const [itemIdentifier, setItemIdentifier] = useState<string | undefined>();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [limit, setLimit] = useState(50);
  const [cursor, setCursor] = useState(0);

  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchAction = useAction(api.functions.vendorPriceHistory.listPriceHistory);

  const refresh = useCallback(async () => {
    if (!businessId) {
      setItems([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const result = await fetchAction({
        businessId,
        vendorId,
        itemIdentifier,
        includeArchived,
        limit,
        cursor,
      });
      setItems(result.items);
      setNextCursor(result.nextCursor);
    } catch (e) {
      console.error("[usePriceHistory] Fetch failed:", e);
      setItems([]);
      setNextCursor(null);
    } finally {
      setIsLoading(false);
    }
  }, [businessId, vendorId, itemIdentifier, includeArchived, limit, cursor, fetchAction]);

  // Fetch on mount and when filters change
  useEffect(() => {
    refresh();
  }, [refresh]);

  const loadMore = () => {
    if (nextCursor !== null) {
      setCursor(nextCursor);
    }
  };

  const resetFilters = () => {
    setVendorId(undefined);
    setItemIdentifier(undefined);
    setIncludeArchived(false);
    setCursor(0);
  };

  return {
    items,
    nextCursor,
    isLoading,
    // Filter setters
    setVendorId,
    setItemIdentifier,
    setIncludeArchived,
    setLimit,
    // Pagination
    loadMore,
    hasMore: nextCursor !== null,
    // Reset
    resetFilters,
    // Manual refresh (e.g., after creating a new record)
    refresh,
    // Current filters
    filters: { vendorId, itemIdentifier, includeArchived },
  };
}

/**
 * Hook for single item-vendor price timeline (for charts).
 * Uses reactive query — this is a SMALL result set (single item + vendor).
 */
export function useItemVendorTimeline(
  businessId: Id<"businesses"> | undefined,
  vendorId: Id<"vendors"> | undefined,
  itemIdentifier: string | undefined
) {
  const result = useQuery(
    api.functions.vendorPriceHistory.getItemVendorTimeline,
    businessId && vendorId && itemIdentifier
      ? { businessId, vendorId, itemIdentifier }
      : "skip"
  );

  return {
    records: result ?? [],
    isLoading: result === undefined,
  };
}

/**
 * Hook for price trend data (Recharts format).
 * Uses reactive query — this is a SMALL result set (single item + vendor).
 */
export function usePriceTrendData(
  businessId: Id<"businesses"> | undefined,
  vendorId: Id<"vendors"> | undefined,
  itemIdentifier: string | undefined
) {
  const result = useQuery(
    api.functions.vendorPriceHistory.getPriceTrendData,
    businessId && vendorId && itemIdentifier
      ? { businessId, vendorId, itemIdentifier }
      : "skip"
  );

  return {
    dataPoints: result ?? [],
    isLoading: result === undefined,
  };
}

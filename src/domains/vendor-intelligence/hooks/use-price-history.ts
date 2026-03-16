"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useState } from "react";

/**
 * T020: Custom hook for price history queries.
 * Wraps Convex useQuery with filter state and pagination.
 */
export function usePriceHistory(businessId: Id<"businesses"> | undefined) {
  const [vendorId, setVendorId] = useState<Id<"vendors"> | undefined>();
  const [itemIdentifier, setItemIdentifier] = useState<string | undefined>();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [limit, setLimit] = useState(50);
  const [cursor, setCursor] = useState(0);

  const result = useQuery(
    api.functions.vendorPriceHistory.listPriceHistory,
    businessId
      ? {
          businessId,
          vendorId,
          itemIdentifier,
          includeArchived,
          limit,
          cursor,
        }
      : "skip"
  );

  const loadMore = () => {
    if (result && result.nextCursor !== null) {
      setCursor(result.nextCursor);
    }
  };

  const resetFilters = () => {
    setVendorId(undefined);
    setItemIdentifier(undefined);
    setIncludeArchived(false);
    setCursor(0);
  };

  return {
    items: result?.items ?? [],
    nextCursor: result?.nextCursor ?? null,
    isLoading: result === undefined,
    // Filter setters
    setVendorId,
    setItemIdentifier,
    setIncludeArchived,
    setLimit,
    // Pagination
    loadMore,
    hasMore: result?.nextCursor !== null && result?.nextCursor !== undefined,
    // Reset
    resetFilters,
    // Current filters
    filters: { vendorId, itemIdentifier, includeArchived },
  };
}

/**
 * Hook for single item-vendor price timeline (for charts).
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

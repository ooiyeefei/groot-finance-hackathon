"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useState, useCallback } from "react";

/**
 * Hook for catalog vendor item mappings.
 * Uses reactive useQuery for mappings (small result set) and action for suggestions.
 */
export function useCatalogVendorMappings(
  businessId: string | null | undefined,
  catalogItemId: string | null | undefined
) {
  const mappings = useQuery(
    api.functions.catalogVendorMappings.getMappings,
    businessId && catalogItemId ? { catalogItemId: catalogItemId as Id<"catalog_items">, businessId: businessId as Id<"businesses"> } : "skip"
  );

  const unmappedCount = useQuery(
    api.functions.catalogVendorMappings.getUnmappedVendorItemCount,
    businessId && catalogItemId ? { businessId: businessId as Id<"businesses">, catalogItemId: catalogItemId as Id<"catalog_items"> } : "skip"
  );

  const confirmMappingMutation = useMutation(api.functions.catalogVendorMappings.confirmMapping);
  const rejectMappingMutation = useMutation(api.functions.catalogVendorMappings.rejectMapping);
  const suggestAction = useAction(api.functions.catalogVendorMappings.suggestMappings);

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);

  const runSuggestions = useCallback(async () => {
    if (!businessId || !catalogItemId) return;
    setIsSuggesting(true);
    try {
      const result = await suggestAction({ businessId: businessId as Id<"businesses">, catalogItemId: catalogItemId as Id<"catalog_items"> });
      setSuggestions(result.suggestions);
    } catch (e) {
      console.error("[useCatalogVendorMappings] Suggest failed:", e);
      setSuggestions([]);
    } finally {
      setIsSuggesting(false);
    }
  }, [businessId, catalogItemId, suggestAction]);

  const confirmMapping = useCallback(
    async (suggestion: any) => {
      if (!businessId || !catalogItemId) return;
      await confirmMappingMutation({
        businessId: businessId as Id<"businesses">,
        catalogItemId: catalogItemId as Id<"catalog_items">,
        vendorId: suggestion.vendorId,
        vendorItemIdentifier: suggestion.vendorItemIdentifier,
        vendorItemDescription: suggestion.vendorItemDescription,
        matchSource: "user-confirmed",
        confidenceScore: suggestion.confidenceScore,
      });
      // Remove from suggestions list
      setSuggestions((prev) =>
        prev.filter((s) => s.vendorItemIdentifier !== suggestion.vendorItemIdentifier || s.vendorId !== suggestion.vendorId)
      );
    },
    [businessId, catalogItemId, confirmMappingMutation]
  );

  const rejectMapping = useCallback(
    async (mappingId: Id<"catalog_vendor_item_mappings">) => {
      await rejectMappingMutation({ mappingId });
    },
    [rejectMappingMutation]
  );

  return {
    mappings: mappings ?? [],
    unmappedCount: unmappedCount ?? { count: 0, hasData: false },
    isLoading: mappings === undefined,
    suggestions,
    isSuggesting,
    runSuggestions,
    confirmMapping,
    rejectMapping,
  };
}

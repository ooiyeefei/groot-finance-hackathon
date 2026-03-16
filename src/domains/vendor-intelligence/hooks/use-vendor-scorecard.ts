"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

export function useVendorScorecard(
  businessId: Id<"businesses"> | undefined,
  vendorId: Id<"vendors"> | undefined
) {
  const scorecard = useQuery(
    api.functions.vendorScorecards.get,
    businessId && vendorId ? { businessId, vendorId } : "skip"
  );

  return {
    scorecard: scorecard ?? null,
    isLoading: scorecard === undefined,
  };
}

export function useVendorScorecardList(
  businessId: Id<"businesses"> | undefined
) {
  const scorecards = useQuery(
    api.functions.vendorScorecards.list,
    businessId ? { businessId } : "skip"
  );

  return {
    scorecards: scorecards ?? [],
    isLoading: scorecards === undefined,
  };
}

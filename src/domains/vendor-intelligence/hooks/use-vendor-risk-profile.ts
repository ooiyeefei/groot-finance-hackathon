"use client";

import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";

export function useVendorRiskProfile(
  businessId: Id<"businesses"> | undefined,
  vendorId: Id<"vendors"> | undefined
) {
  const profile = useQuery(
    api.functions.vendorRiskProfiles.get,
    businessId && vendorId ? { businessId, vendorId } : "skip"
  );

  return {
    profile: profile ?? null,
    isLoading: profile === undefined,
  };
}

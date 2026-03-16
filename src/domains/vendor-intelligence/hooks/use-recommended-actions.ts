"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useCallback } from "react";

export function useRecommendedActions(
  businessId: Id<"businesses"> | undefined,
  vendorId?: Id<"vendors">
) {
  const actions = useQuery(
    api.functions.vendorRecommendedActions.list,
    businessId ? { businessId, vendorId, status: "pending" as const } : "skip"
  );

  const updateStatusMutation = useMutation(
    api.functions.vendorRecommendedActions.updateStatus
  );

  const markComplete = useCallback(
    async (actionId: Id<"vendor_recommended_actions">) => {
      return updateStatusMutation({ actionId, status: "completed" });
    },
    [updateStatusMutation]
  );

  const dismissAction = useCallback(
    async (actionId: Id<"vendor_recommended_actions">) => {
      return updateStatusMutation({ actionId, status: "dismissed" });
    },
    [updateStatusMutation]
  );

  return {
    actions: actions ?? [],
    isLoading: actions === undefined,
    markComplete,
    dismissAction,
  };
}

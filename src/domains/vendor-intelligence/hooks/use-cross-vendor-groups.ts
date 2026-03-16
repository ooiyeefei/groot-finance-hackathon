"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { useCallback } from "react";

export function useCrossVendorGroups(
  businessId: Id<"businesses"> | undefined
) {
  const groups = useQuery(
    api.functions.crossVendorItemGroups.list,
    businessId ? { businessId } : "skip"
  );

  const createMutation = useMutation(
    api.functions.crossVendorItemGroups.createGroup
  );
  const updateMutation = useMutation(
    api.functions.crossVendorItemGroups.updateGroup
  );
  const deleteMutation = useMutation(
    api.functions.crossVendorItemGroups.deleteGroup
  );

  const createGroup = useCallback(
    async (params: {
      groupName: string;
      itemReferences: Array<{
        vendorId: Id<"vendors">;
        itemIdentifier: string;
      }>;
      matchSource: "ai-suggested" | "user-confirmed" | "user-created";
    }) => {
      if (!businessId) throw new Error("No business selected");
      return createMutation({ businessId, ...params });
    },
    [businessId, createMutation]
  );

  const updateGroup = useCallback(
    async (
      groupId: Id<"cross_vendor_item_groups">,
      updates: {
        groupName?: string;
        itemReferences?: Array<{
          vendorId: Id<"vendors">;
          itemIdentifier: string;
        }>;
      }
    ) => {
      return updateMutation({ groupId, ...updates });
    },
    [updateMutation]
  );

  const deleteGroup = useCallback(
    async (groupId: Id<"cross_vendor_item_groups">) => {
      return deleteMutation({ groupId });
    },
    [deleteMutation]
  );

  return {
    groups: groups ?? [],
    isLoading: groups === undefined,
    createGroup,
    updateGroup,
    deleteGroup,
  };
}

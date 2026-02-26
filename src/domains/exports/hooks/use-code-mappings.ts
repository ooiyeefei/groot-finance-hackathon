"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { useState, useCallback, useMemo } from "react";
import type { Id } from "../../../../convex/_generated/dataModel";

interface CodeMapping {
  _id: Id<"export_code_mappings">;
  mappingType: string;
  sourceValue: string;
  targetCode: string;
  isDefault?: boolean;
}

interface MappingFormEntry {
  mappingType: string;
  sourceValue: string;
  targetCode: string;
}

interface DefaultEntry {
  mappingType: string;
  targetCode: string;
}

export function useCodeMappings(
  businessId: string | undefined,
  targetSystem: string = "master-accounting"
) {
  const mappings = useQuery(
    api.functions.exportCodeMappings.getCodeMappings,
    businessId
      ? { businessId, targetSystem }
      : "skip"
  ) as CodeMapping[] | undefined;

  const upsertBatch = useMutation(
    api.functions.exportCodeMappings.upsertCodeMappingsBatch
  );

  const [isSaving, setIsSaving] = useState(false);

  const isLoading = mappings === undefined;

  const mappingsByType = useMemo(() => {
    if (!mappings) return {};
    const grouped: Record<string, CodeMapping[]> = {};
    for (const m of mappings) {
      if (!grouped[m.mappingType]) grouped[m.mappingType] = [];
      grouped[m.mappingType].push(m);
    }
    return grouped;
  }, [mappings]);

  const getTargetCode = useCallback(
    (mappingType: string, sourceValue: string): string => {
      const typeMappings = mappingsByType[mappingType] ?? [];
      const match = typeMappings.find((m) => m.sourceValue === sourceValue);
      return match?.targetCode ?? "";
    },
    [mappingsByType]
  );

  const getDefaultCode = useCallback(
    (mappingType: string): string => {
      const typeMappings = mappingsByType[mappingType] ?? [];
      const defaultMapping = typeMappings.find((m) => m.isDefault);
      return defaultMapping?.targetCode ?? "";
    },
    [mappingsByType]
  );

  const saveMappings = useCallback(
    async (entries: MappingFormEntry[], defaults?: DefaultEntry[]) => {
      if (!businessId) return;
      setIsSaving(true);
      try {
        const result = await upsertBatch({
          businessId,
          targetSystem,
          mappings: entries,
          defaults,
        });
        return result;
      } finally {
        setIsSaving(false);
      }
    },
    [businessId, targetSystem, upsertBatch]
  );

  return {
    mappings: mappings ?? [],
    mappingsByType,
    getTargetCode,
    getDefaultCode,
    saveMappings,
    isLoading,
    isSaving,
  };
}

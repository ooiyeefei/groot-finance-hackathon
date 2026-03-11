"use client";

import { useState, useCallback } from "react";
import type { AiMappingSuggestion, ColumnMapping, SchemaType } from "../types";

interface UseColumnMappingReturn {
  isLoading: boolean;
  error: string | null;
  fetchSuggestions: (
    headers: string[],
    sampleRows: Record<string, string>[],
    schemaType?: SchemaType | "auto"
  ) => Promise<AiMappingSuggestion | null>;
}

export function useColumnMapping(): UseColumnMappingReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(
    async (
      headers: string[],
      sampleRows: Record<string, string>[],
      schemaType: SchemaType | "auto" = "auto"
    ): Promise<AiMappingSuggestion | null> => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/v1/csv-parser/suggest-mappings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ headers, sampleRows, schemaType }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(
            errorData?.error ?? `AI mapping failed (${response.status})`
          );
        }

        const result = await response.json();
        if (!result.success) {
          throw new Error(result.error ?? "AI mapping failed");
        }

        return result.data as AiMappingSuggestion;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to get mapping suggestions";
        setError(message);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return { isLoading, error, fetchSuggestions };
}

/**
 * Convert AI suggestions to ColumnMapping array for the session.
 */
export function suggestionsToMappings(
  suggestion: AiMappingSuggestion
): ColumnMapping[] {
  return suggestion.mappings.map((m, i) => ({
    sourceHeader: m.sourceHeader,
    targetField: m.targetField,
    confidence: m.confidence,
    order: i,
  }));
}

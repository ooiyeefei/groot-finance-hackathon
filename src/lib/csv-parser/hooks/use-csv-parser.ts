"use client";

import { useState, useCallback } from "react";
import { parseFile, type ParseOptions } from "../lib/parser-engine";
import { isMacroEnabledFile } from "../lib/sanitizer";
import type { ParsedFileInfo } from "../types";

interface UseCsvParserReturn {
  parsedInfo: ParsedFileInfo | null;
  isLoading: boolean;
  error: string | null;
  parseUploadedFile: (file: File, options?: ParseOptions) => Promise<ParsedFileInfo | null>;
  reset: () => void;
}

export function useCsvParser(): UseCsvParserReturn {
  const [parsedInfo, setParsedInfo] = useState<ParsedFileInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseUploadedFile = useCallback(
    async (file: File, options?: ParseOptions): Promise<ParsedFileInfo | null> => {
      setIsLoading(true);
      setError(null);

      try {
        // Pre-check for macro-enabled files
        if (isMacroEnabledFile(file.name)) {
          throw new Error(
            "Macro-enabled Excel files (.xlsm) are not supported. Please re-save as .xlsx without macros."
          );
        }

        const info = await parseFile(file, options);
        setParsedInfo(info);
        return info;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to parse file";
        setError(message);
        setParsedInfo(null);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const reset = useCallback(() => {
    setParsedInfo(null);
    setIsLoading(false);
    setError(null);
  }, []);

  return { parsedInfo, isLoading, error, parseUploadedFile, reset };
}

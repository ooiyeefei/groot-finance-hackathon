"use client";

import { useState, useCallback } from "react";
import type {
  ImportSession,
  ImportSessionStatus,
  ColumnMapping,
  SchemaType,
  ParsedFileInfo,
  ValidationResult,
} from "../types";

const INITIAL_SESSION: ImportSession = {
  file: null,
  fileInfo: null,
  detectedSchemaType: null,
  columnMappings: [],
  matchedTemplateId: null,
  matchedTemplateName: null,
  validationResult: null,
  status: "parsing",
};

export function useImportSession() {
  const [session, setSession] = useState<ImportSession>(INITIAL_SESSION);

  const setFileInfo = useCallback((file: File, info: ParsedFileInfo) => {
    setSession((prev) => ({
      ...prev,
      file,
      fileInfo: info,
      status: "mapping",
    }));
  }, []);

  const setMappings = useCallback(
    (
      mappings: ColumnMapping[],
      schemaType: SchemaType,
      templateId?: string,
      templateName?: string
    ) => {
      setSession((prev) => ({
        ...prev,
        columnMappings: mappings,
        detectedSchemaType: schemaType,
        matchedTemplateId: templateId ?? null,
        matchedTemplateName: templateName ?? null,
      }));
    },
    []
  );

  const updateMapping = useCallback(
    (sourceHeader: string, targetField: string) => {
      setSession((prev) => ({
        ...prev,
        columnMappings: prev.columnMappings.map((m) =>
          m.sourceHeader === sourceHeader ? { ...m, targetField, confidence: 1 } : m
        ),
      }));
    },
    []
  );

  const setStatus = useCallback((status: ImportSessionStatus) => {
    setSession((prev) => ({ ...prev, status }));
  }, []);

  const setValidationResult = useCallback((result: ValidationResult) => {
    setSession((prev) => ({
      ...prev,
      validationResult: result,
      status: "validating",
    }));
  }, []);

  const setSelectedSheet = useCallback((sheet: string) => {
    setSession((prev) => ({ ...prev, selectedSheet: sheet }));
  }, []);

  const reset = useCallback(() => {
    setSession(INITIAL_SESSION);
  }, []);

  return {
    session,
    setFileInfo,
    setMappings,
    updateMapping,
    setStatus,
    setValidationResult,
    setSelectedSheet,
    reset,
  };
}

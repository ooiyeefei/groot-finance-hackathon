"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import type { ColumnMapping, SchemaType } from "../types";

/**
 * Hook for managing CSV import templates — list, lookup, create, update, delete.
 * Wraps Convex queries and mutations for the csv_import_templates table.
 */
export function useImportTemplates(businessId?: string) {
  // Queries
  const templatesResult = useQuery(
    api.functions.csvImportTemplates.list,
    businessId ? { businessId } : "skip"
  );

  // Mutations
  const createMutation = useMutation(api.functions.csvImportTemplates.create);
  const updateMutation = useMutation(api.functions.csvImportTemplates.update);
  const removeMutation = useMutation(api.functions.csvImportTemplates.remove);
  const touchMutation = useMutation(
    api.functions.csvImportTemplates.touchLastUsed
  );

  const templates = templatesResult?.templates ?? [];
  const isLoading = templatesResult === undefined;

  const findByFingerprint = async (fingerprint: string) => {
    // Use the list and filter client-side, since getByFingerprint is a query
    // (can't be called imperatively). For auto-detection we match by fingerprint.
    return templates.find((t) => t.headerFingerprint === fingerprint) ?? null;
  };

  const createTemplate = async (input: {
    name: string;
    schemaType: SchemaType;
    columnMappings: ColumnMapping[];
    headerFingerprint: string;
    sourceHeaders: string[];
  }) => {
    if (!businessId) throw new Error("No active business");
    return await createMutation({
      businessId,
      name: input.name,
      schemaType: input.schemaType,
      columnMappings: input.columnMappings.map((m) => ({
        sourceHeader: m.sourceHeader,
        targetField: m.targetField,
        confidence: m.confidence,
        order: m.order,
      })),
      headerFingerprint: input.headerFingerprint,
      sourceHeaders: input.sourceHeaders,
    });
  };

  const updateTemplate = async (
    templateId: Id<"csv_import_templates">,
    input: {
      name?: string;
      columnMappings?: ColumnMapping[];
      schemaType?: SchemaType;
    }
  ) => {
    const args: Parameters<typeof updateMutation>[0] = { templateId };
    if (input.name !== undefined) args.name = input.name;
    if (input.schemaType !== undefined) args.schemaType = input.schemaType;
    if (input.columnMappings !== undefined) {
      args.columnMappings = input.columnMappings.map((m) => ({
        sourceHeader: m.sourceHeader,
        targetField: m.targetField,
        confidence: m.confidence,
        order: m.order,
      }));
    }
    return await updateMutation(args);
  };

  const removeTemplate = async (templateId: Id<"csv_import_templates">) => {
    return await removeMutation({ templateId });
  };

  const touchLastUsed = async (templateId: Id<"csv_import_templates">) => {
    return await touchMutation({ templateId });
  };

  return {
    templates,
    isLoading,
    findByFingerprint,
    createTemplate,
    updateTemplate,
    removeTemplate,
    touchLastUsed,
  };
}

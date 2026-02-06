'use client';

/**
 * Export Templates Hooks
 *
 * Hooks for managing export templates (both pre-built and custom).
 */

import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import type { ExportModule, FieldMapping, ThousandSeparator } from '../types';
import {
  PREBUILT_TEMPLATES,
  getPrebuiltTemplatesByModule,
  getPrebuiltTemplateById,
} from '../lib/prebuilt-templates';

// ============================================
// TEMPLATE LIST HOOKS
// ============================================

/**
 * Get all templates (pre-built + custom) for a business
 */
export function useExportTemplates(
  businessId: string | undefined,
  module?: ExportModule
) {
  const customTemplates = useQuery(
    api.functions.exportTemplates.list,
    businessId
      ? { businessId, module }
      : 'skip'
  );

  // Combine pre-built and custom templates
  const prebuiltTemplates = module
    ? getPrebuiltTemplatesByModule(module)
    : PREBUILT_TEMPLATES;

  const isLoading = customTemplates === undefined;
  const error = null; // Convex handles errors differently

  // Transform pre-built templates to match custom template format
  const prebuiltList = prebuiltTemplates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    module: t.module,
    isPrebuilt: true,
    targetSystem: t.targetSystem,
    fieldCount: t.fieldMappings.length,
  }));

  // Transform custom templates
  const customList = (customTemplates?.templates || []).map((t) => ({
    id: t._id,
    name: t.name,
    description: t.description,
    module: t.module,
    isPrebuilt: false,
    targetSystem: undefined,
    fieldCount: t.fieldMappings.length,
  }));

  return {
    templates: [...prebuiltList, ...customList],
    prebuiltTemplates: prebuiltList,
    customTemplates: customList,
    isLoading,
    error,
  };
}

/**
 * Get a single template by ID (handles both pre-built and custom)
 * IMPORTANT: Hooks must always be called in the same order (Rules of Hooks)
 */
export function useExportTemplate(
  templateId: string | Id<'export_templates'> | undefined,
  isPrebuilt: boolean
) {
  // Always call useQuery to maintain hooks order (use 'skip' when not needed)
  const customTemplate = useQuery(
    api.functions.exportTemplates.get,
    templateId && !isPrebuilt
      ? { templateId: templateId as Id<'export_templates'> }
      : 'skip'
  );

  // For pre-built templates, get from code constants
  if (isPrebuilt && typeof templateId === 'string') {
    const prebuilt = getPrebuiltTemplateById(templateId);
    return {
      template: prebuilt
        ? {
            id: prebuilt.id,
            name: prebuilt.name,
            description: prebuilt.description,
            module: prebuilt.module,
            fieldMappings: prebuilt.fieldMappings,
            defaultDateFormat: prebuilt.defaultDateFormat,
            defaultDecimalPlaces: prebuilt.defaultDecimalPlaces,
            isPrebuilt: true,
          }
        : null,
      isLoading: false,
      error: null,
    };
  }

  // For custom templates, use the queried data
  return {
    template: customTemplate
      ? {
          id: customTemplate._id,
          name: customTemplate.name,
          description: customTemplate.description,
          module: customTemplate.module,
          fieldMappings: customTemplate.fieldMappings,
          defaultDateFormat: customTemplate.defaultDateFormat,
          defaultDecimalPlaces: customTemplate.defaultDecimalPlaces,
          defaultThousandSeparator: customTemplate.defaultThousandSeparator,
          isPrebuilt: false,
        }
      : null,
    isLoading: customTemplate === undefined && !isPrebuilt,
    error: null,
  };
}

// ============================================
// TEMPLATE MUTATION HOOKS
// ============================================

/**
 * Create a new custom template
 */
export function useCreateTemplate() {
  const createMutation = useMutation(api.functions.exportTemplates.create);

  const createTemplate = async (input: {
    businessId: string;
    name: string;
    module: ExportModule;
    fieldMappings: FieldMapping[];
    description?: string;
    defaultDateFormat?: string;
    defaultDecimalPlaces?: number;
    defaultThousandSeparator?: ThousandSeparator;
  }) => {
    return await createMutation(input);
  };

  return { createTemplate };
}

/**
 * Clone a pre-built template
 */
export function useCloneTemplate() {
  const cloneMutation = useMutation(api.functions.exportTemplates.clonePrebuilt);

  const cloneTemplate = async (input: {
    businessId: string;
    prebuiltId: string;
    name: string;
  }) => {
    return await cloneMutation(input);
  };

  return { cloneTemplate };
}

/**
 * Update a custom template
 */
export function useUpdateTemplate() {
  const updateMutation = useMutation(api.functions.exportTemplates.update);

  const updateTemplate = async (input: {
    templateId: Id<'export_templates'>;
    name?: string;
    description?: string;
    fieldMappings?: FieldMapping[];
    defaultDateFormat?: string;
    defaultDecimalPlaces?: number;
    defaultThousandSeparator?: ThousandSeparator;
  }) => {
    return await updateMutation(input);
  };

  return { updateTemplate };
}

/**
 * Delete a custom template
 */
export function useDeleteTemplate() {
  const deleteMutation = useMutation(api.functions.exportTemplates.remove);

  const deleteTemplate = async (templateId: Id<'export_templates'>) => {
    return await deleteMutation({ templateId });
  };

  return { deleteTemplate };
}

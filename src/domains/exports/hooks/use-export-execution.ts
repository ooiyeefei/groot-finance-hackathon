'use client';

/**
 * Export Execution Hooks
 *
 * Hooks for previewing and executing exports.
 * Uses the unified export engine for client-side file generation
 * supporting both flat CSV and hierarchical MASTER/DETAIL formats.
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import type { ExportModule, ExportFilters, FieldMapping, ExportFormatType } from '../types';
import { generateExport, generateFlatExport, generateExportFilename, calculateFileSize } from '../lib/export-engine';

// ============================================
// PREVIEW HOOK
// ============================================

/**
 * Preview export data before generating file
 * @param limit - Number of records to preview (default 10 for preview, up to 10000 for full export)
 */
export function useExportPreview(
  businessId: string | undefined,
  module: ExportModule | undefined,
  templateId?: Id<'export_templates'>,
  prebuiltId?: string,
  filters?: ExportFilters,
  limit: number = 10
) {
  const preview = useQuery(
    api.functions.exportJobs.preview,
    businessId && module
      ? {
          businessId,
          module,
          templateId,
          prebuiltId,
          filters: filters
            ? {
                startDate: filters.startDate,
                endDate: filters.endDate,
                statusFilter: filters.statusFilter,
                employeeIds: filters.employeeIds,
                invoiceType: filters.invoiceType,
                transactionTypeFilter: filters.transactionTypeFilter,
              }
            : undefined,
          limit,
        }
      : 'skip'
  );

  return {
    records: preview?.records || [],
    totalCount: preview?.totalCount || 0,
    previewCount: preview?.previewCount || 0,
    isLoading: preview === undefined,
    error: null,
  };
}

/**
 * Get available fields for a module
 */
export function useAvailableFields(module: ExportModule | undefined) {
  const fields = useQuery(
    api.functions.exportJobs.getAvailableFields,
    module ? { module } : 'skip'
  );

  return {
    fields: fields?.fields || [],
    isLoading: fields === undefined,
  };
}

// ============================================
// TEMPLATE CONFIG TYPE
// ============================================

/** Template config for export generation — works for both prebuilt and custom templates */
interface ExportTemplateConfig {
  name: string;
  module: ExportModule;
  formatType: ExportFormatType;
  delimiter: string;
  fileExtension: string;
  fieldMappings: FieldMapping[];
  masterFields?: FieldMapping[];
  detailFields?: FieldMapping[];
  defaultDateFormat?: string;
  defaultDecimalPlaces?: number;
}

// ============================================
// EXECUTE HOOK
// ============================================

export type ExportStatus = 'idle' | 'executing' | 'completed' | 'failed';

/**
 * Execute an export and generate file client-side using the unified export engine
 */
export function useExecuteExport() {
  const executeMutation = useMutation(api.functions.exportJobs.execute);
  const updateHistoryMutation = useMutation(api.functions.exportJobs.updateHistoryWithStorage);

  const [status, setStatus] = useState<ExportStatus>('idle');
  const [historyId, setHistoryId] = useState<Id<'export_history'> | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const executeExport = useCallback(
    async (input: {
      businessId: string;
      module: ExportModule;
      templateId?: Id<'export_templates'>;
      prebuiltId?: string;
      templateName: string;
      filters?: ExportFilters;
    }) => {
      setStatus('executing');
      setError(null);
      setDownloadUrl(null);

      try {
        const newHistoryId = await executeMutation({
          businessId: input.businessId,
          module: input.module,
          templateId: input.templateId,
          prebuiltId: input.prebuiltId,
          templateName: input.templateName,
          filters: input.filters
            ? {
                startDate: input.filters.startDate,
                endDate: input.filters.endDate,
                statusFilter: input.filters.statusFilter,
                employeeIds: input.filters.employeeIds,
                invoiceType: input.filters.invoiceType,
                transactionTypeFilter: input.filters.transactionTypeFilter,
              }
            : undefined,
        });

        setHistoryId(newHistoryId);
        setStatus('completed');

        return newHistoryId;
      } catch (err) {
        setStatus('failed');
        setError(err instanceof Error ? err.message : 'Export failed');
        throw err;
      }
    },
    [executeMutation]
  );

  /**
   * Generate export file and trigger download.
   * Uses the unified export engine — supports flat CSV and hierarchical MASTER/DETAIL.
   */
  const getDownloadUrl = useCallback(
    async (
      exportHistoryId: Id<'export_history'>,
      options?: {
        records?: Record<string, unknown>[];
        template?: ExportTemplateConfig;
        /** @deprecated Use template instead */
        fieldMappings?: FieldMapping[];
        /** @deprecated Use template instead */
        templateName?: string;
      }
    ) => {
      try {
        if (!options?.records) {
          throw new Error('Records are required for download');
        }

        let content: string;
        let filename: string;
        let mimeType: string;

        if (options.template) {
          // New path: use unified export engine with full template config
          const templateConfig = {
            ...options.template,
            id: 'export',
            description: '',
            version: '1.0.0',
            targetSystem: 'export',
          };

          content = generateExport(options.records, templateConfig);

          filename = generateExportFilename(
            options.template.module,
            options.template.name,
            options.template.fileExtension
          );

          mimeType = options.template.fileExtension === '.txt'
            ? 'text/plain;charset=utf-8;'
            : 'text/csv;charset=utf-8;';
        } else if (options.fieldMappings) {
          // Legacy fallback: flat CSV using fieldMappings directly
          content = generateFlatExport(options.records, options.fieldMappings);

          const timestamp = new Date().toISOString().split('T')[0];
          const safeName = (options.templateName || 'export')
            .replace(/[^a-zA-Z0-9]/g, '-')
            .toLowerCase();
          filename = `${safeName}-${timestamp}.csv`;
          mimeType = 'text/csv;charset=utf-8;';
        } else {
          throw new Error('Template or field mappings are required for download');
        }

        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);

        // Update history with completion status
        await updateHistoryMutation({
          historyId: exportHistoryId,
          status: 'completed',
          recordCount: options.records.length,
          fileSize: calculateFileSize(content),
        });

        setDownloadUrl(url);

        return { url, filename };
      } catch (err) {
        // Update history with failed status
        await updateHistoryMutation({
          historyId: exportHistoryId,
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'Failed to generate export file',
        });

        setError(err instanceof Error ? err.message : 'Failed to get download URL');
        throw err;
      }
    },
    [updateHistoryMutation]
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setHistoryId(null);
    setDownloadUrl(null);
    setError(null);
  }, []);

  return {
    executeExport,
    getDownloadUrl,
    reset,
    status,
    historyId,
    downloadUrl,
    error,
    isExecuting: status === 'executing',
    isCompleted: status === 'completed',
    isFailed: status === 'failed',
  };
}

// ============================================
// POLLING HOOK
// ============================================

/**
 * Poll export history status until completion
 */
export function useExportHistoryStatus(historyId: Id<'export_history'> | null) {
  const history = useQuery(
    api.functions.exportHistory.get,
    historyId ? { historyId } : 'skip'
  );

  return {
    history,
    isLoading: history === undefined,
    isProcessing: history?.status === 'processing',
    isCompleted: history?.status === 'completed',
    isFailed: history?.status === 'failed',
    canDownload: history?.canDownload || false,
  };
}

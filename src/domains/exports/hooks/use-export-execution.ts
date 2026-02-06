'use client';

/**
 * Export Execution Hooks
 *
 * Hooks for previewing and executing exports.
 * CSV generation happens client-side to avoid Convex action complexity.
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../../convex/_generated/api';
import { Id } from '../../../../convex/_generated/dataModel';
import type { ExportModule, ExportFilters, FieldMapping } from '../types';

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
// CSV GENERATION UTILITIES
// ============================================

function extractValue(record: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = record;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

function formatValue(
  value: unknown,
  mapping: { dateFormat?: string; decimalPlaces?: number }
): string {
  if (value === null || value === undefined) {
    return '';
  }

  // Format dates
  if (typeof value === 'number' && value > 1000000000000) {
    // Timestamp
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return formatDate(date, mapping.dateFormat);
    }
  }

  // Format numbers
  if (typeof value === 'number') {
    const decimals = mapping.decimalPlaces ?? 2;
    return value.toFixed(decimals);
  }

  return String(value);
}

function formatDate(date: Date, format?: string): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');

  switch (format) {
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    case 'DD-MM-YYYY':
      return `${day}-${month}-${year}`;
    case 'MM/DD/YYYY':
      return `${month}/${day}/${year}`;
    case 'YYYY-MM-DD':
    default:
      return `${year}-${month}-${day}`;
  }
}

function escapeCsv(value: string): string {
  const str = String(value);
  const needsEscaping =
    str.includes(',') ||
    str.includes('"') ||
    str.includes('\n') ||
    str.includes('\r');

  if (needsEscaping) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateCsv(
  records: Record<string, unknown>[],
  fieldMappings: FieldMapping[]
): string {
  const sortedMappings = [...fieldMappings].sort((a, b) => a.order - b.order);

  // Header row
  const headers = sortedMappings.map((m) => escapeCsv(m.targetColumn));

  // Data rows
  const rows = records.map((record) => {
    return sortedMappings
      .map((mapping) => {
        const value = extractValue(record, mapping.sourceField);
        const formatted = formatValue(value, mapping);
        return escapeCsv(formatted);
      })
      .join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

// ============================================
// EXECUTE HOOK
// ============================================

export type ExportStatus = 'idle' | 'executing' | 'completed' | 'failed';

/**
 * Execute an export and generate CSV client-side
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
   * Generate CSV and trigger download
   * This fetches records and generates CSV client-side
   */
  const getDownloadUrl = useCallback(
    async (
      exportHistoryId: Id<'export_history'>,
      options?: {
        records?: Record<string, unknown>[];
        fieldMappings?: FieldMapping[];
        templateName?: string;
      }
    ) => {
      try {
        if (!options?.records || !options?.fieldMappings) {
          throw new Error('Records and field mappings are required for download');
        }

        // Generate CSV
        const csvContent = generateCsv(options.records, options.fieldMappings);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);

        // Generate filename
        const timestamp = new Date().toISOString().split('T')[0];
        const safeName = (options.templateName || 'export')
          .replace(/[^a-zA-Z0-9]/g, '-')
          .toLowerCase();
        const filename = `${safeName}-${timestamp}.csv`;

        // Update history with completion status
        await updateHistoryMutation({
          historyId: exportHistoryId,
          status: 'completed',
          recordCount: options.records.length,
          fileSize: blob.size,
        });

        setDownloadUrl(url);

        return { url, filename };
      } catch (err) {
        // Update history with failed status
        await updateHistoryMutation({
          historyId: exportHistoryId,
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'Failed to generate CSV',
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

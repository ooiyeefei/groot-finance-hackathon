'use client';

/**
 * Export Preview Component
 *
 * Shows a preview of export data with field mappings before generating the file.
 * Uses div-based table layout instead of Table component.
 */

import { useMemo } from 'react';
import { FileDown, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FieldMapping } from '../types';

interface ExportPreviewProps {
  records: Record<string, unknown>[];
  fieldMappings: FieldMapping[];
  totalCount: number;
  previewCount: number;
  isLoading: boolean;
  onExport: () => void;
  isExporting: boolean;
  templateName: string;
}

export function ExportPreview({
  records,
  fieldMappings,
  totalCount,
  previewCount,
  isLoading,
  onExport,
  isExporting,
  templateName,
}: ExportPreviewProps) {
  // Sort field mappings by order
  const sortedMappings = useMemo(
    () => [...fieldMappings].sort((a, b) => a.order - b.order),
    [fieldMappings]
  );

  // Extract values from records based on field mappings
  const previewData = useMemo(() => {
    return records.map((record) => {
      const row: Record<string, unknown> = {};
      for (const mapping of sortedMappings) {
        row[mapping.targetColumn] = extractValue(record, mapping.sourceField);
      }
      return row;
    });
  }, [records, sortedMappings]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">Loading preview...</p>
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground/50" />
        <p className="mt-4 text-sm text-muted-foreground">
          No records match your current filters.
        </p>
        <p className="text-sm text-muted-foreground">
          Try adjusting the date range or status filter.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-foreground">Export Preview</h3>
          <p className="text-sm text-muted-foreground">
            Showing {previewCount} of {totalCount} records
          </p>
        </div>
        <Button onClick={onExport} disabled={isExporting || totalCount === 0}>
          {isExporting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <FileDown className="mr-2 h-4 w-4" />
              Export {totalCount} Records
            </>
          )}
        </Button>
      </div>

      {/* Preview Table using proper table layout */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            {/* Table Header */}
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                {sortedMappings.map((mapping) => (
                  <th
                    key={mapping.sourceField}
                    className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap"
                  >
                    {mapping.targetColumn}
                  </th>
                ))}
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-border">
              {previewData.map((row, index) => (
                <tr key={index} className="hover:bg-muted/30">
                  {sortedMappings.map((mapping) => (
                    <td
                      key={mapping.sourceField}
                      className={cn(
                        'px-4 py-3 text-foreground max-w-[200px] truncate',
                        typeof row[mapping.targetColumn] === 'number' && !isTimestamp(row[mapping.targetColumn]) && 'text-right'
                      )}
                      title={formatCellValue(row[mapping.targetColumn], mapping.sourceField)}
                    >
                      {formatCellValue(row[mapping.targetColumn], mapping.sourceField)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer info */}
      {totalCount > previewCount && (
        <p className="text-center text-sm text-muted-foreground">
          Preview limited to {previewCount} records. Full export will include all{' '}
          {totalCount} records.
        </p>
      )}

      {/* Template info */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Template:</span>
          <span className="font-medium text-foreground">{templateName}</span>
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground">{sortedMappings.length} columns</span>
        </div>
      </div>
    </div>
  );
}

// Helper function to extract nested values
function extractValue(record: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = record;

  for (const part of parts) {
    if (current === null || current === undefined) return '';
    if (typeof current !== 'object') return '';
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// Date-related field names that should be formatted as dates
const DATE_FIELDS = ['approvedAt', 'submittedAt', 'paidAt', 'createdAt', 'updatedAt', 'startDate', 'endDate', 'transactionDate'];

// Check if a number looks like a Unix timestamp (milliseconds)
function isTimestamp(value: unknown): boolean {
  if (typeof value !== 'number') return false;
  // Unix timestamps in milliseconds are typically 13 digits (Jan 2001 to ~2286)
  return value > 946684800000 && value < 9999999999999;
}

// Helper function to format cell values for display
function formatCellValue(value: unknown, fieldName?: string): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';

  // Check if this is a date field or looks like a timestamp
  if (typeof value === 'number') {
    const isDateField = fieldName && DATE_FIELDS.some(df => fieldName.includes(df));
    if (isDateField || isTimestamp(value)) {
      // Format as date
      const date = new Date(value);
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    }
    return value.toLocaleString();
  }

  if (value instanceof Date) return value.toLocaleDateString();

  // Check if string looks like an ISO date
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      });
    }
  }

  return String(value);
}

'use client';

/**
 * Export Preview Component
 *
 * Shows a preview of export data with field mappings before generating the file.
 * Uses div-based table layout instead of Table component.
 */

import { useMemo, Fragment } from 'react';
import { FileDown, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { FieldMapping, ExportFormatType } from '../types';

interface ExportPreviewProps {
  records: Record<string, unknown>[];
  fieldMappings: FieldMapping[];
  masterFields?: FieldMapping[];
  detailFields?: FieldMapping[];
  formatType?: ExportFormatType;
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
  masterFields,
  detailFields,
  formatType,
  totalCount,
  previewCount,
  isLoading,
  onExport,
  isExporting,
  templateName,
}: ExportPreviewProps) {
  const isHierarchical = formatType === 'hierarchical' && masterFields && detailFields;
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

      {/* Hierarchical format legend */}
      {isHierarchical && (
        <div className="rounded-lg border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">MASTER/DETAIL Format</p>
          <p>Each record produces a <span className="font-semibold">MASTER</span> row (header) followed by one or more <span className="font-semibold">DETAIL</span> rows (line items). Delimiter: semicolon (;)</p>
        </div>
      )}

      {/* Preview Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          {isHierarchical ? (
            <HierarchicalPreview records={records} masterFields={masterFields!} detailFields={detailFields!} />
          ) : (
            <table className="w-full text-sm">
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
          )}
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

// Hierarchical preview for MASTER/DETAIL formats
function HierarchicalPreview({
  records,
  masterFields,
  detailFields,
}: {
  records: Record<string, unknown>[];
  masterFields: FieldMapping[];
  detailFields: FieldMapping[];
}) {
  const sortedMaster = [...masterFields].sort((a, b) => a.order - b.order);
  const sortedDetail = [...detailFields].sort((a, b) => a.order - b.order);

  // Use the wider set of columns for the header
  const maxCols = Math.max(sortedMaster.length, sortedDetail.length);

  return (
    <table className="w-full text-sm">
      <thead className="bg-muted/50 border-b border-border">
        <tr>
          <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap w-20">
            Row Type
          </th>
          {Array.from({ length: maxCols }, (_, i) => (
            <th key={i} className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">
              Col {i + 1}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {records.slice(0, 5).map((record, rIdx) => {
          const lines = (record.journalLines || record.lineItems || []) as Record<string, unknown>[];
          return (
            <Fragment key={rIdx}>
              {/* MASTER row */}
              <tr className="bg-muted/40 font-semibold">
                <td className="px-4 py-2 text-primary whitespace-nowrap">MASTER</td>
                {sortedMaster.map((m, cIdx) => {
                  const val = extractValue(record, m.sourceField.replace(/^"|"$/g, ''));
                  const display = m.sourceField.startsWith('"')
                    ? m.sourceField.slice(1, -1)
                    : formatCellValue(val, m.sourceField);
                  return (
                    <td key={cIdx} className="px-4 py-2 text-foreground max-w-[150px] truncate" title={display}>
                      {display}
                    </td>
                  );
                })}
                {/* Fill remaining columns */}
                {Array.from({ length: maxCols - sortedMaster.length }, (_, i) => (
                  <td key={`mpad-${i}`} className="px-4 py-2" />
                ))}
              </tr>
              {/* DETAIL rows */}
              {lines.slice(0, 3).map((line, lIdx) => {
                const merged = { ...record, lineItem: line };
                return (
                  <tr key={`d-${rIdx}-${lIdx}`} className="hover:bg-muted/20">
                    <td className="px-4 py-2 text-muted-foreground whitespace-nowrap pl-8">DETAIL</td>
                    {sortedDetail.map((d, cIdx) => {
                      const val = extractValue(merged, d.sourceField.replace(/^"|"$/g, ''));
                      const display = d.sourceField.startsWith('"')
                        ? d.sourceField.slice(1, -1)
                        : formatCellValue(val, d.sourceField);
                      return (
                        <td key={cIdx} className="px-4 py-2 text-foreground max-w-[150px] truncate" title={display}>
                          {display}
                        </td>
                      );
                    })}
                    {Array.from({ length: maxCols - sortedDetail.length }, (_, i) => (
                      <td key={`dpad-${i}`} className="px-4 py-2" />
                    ))}
                  </tr>
                );
              })}
              {lines.length > 3 && (
                <tr>
                  <td colSpan={maxCols + 1} className="px-4 py-1 text-xs text-muted-foreground text-center">
                    ... {lines.length - 3} more detail rows
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

'use client';

/**
 * Export Filters Component
 *
 * Date range, status, and module-specific filters for export data selection.
 */

import { useCallback } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ExportFilters as ExportFiltersType, ExportModule } from '../types';

interface ExportFiltersProps {
  module: ExportModule;
  filters: ExportFiltersType;
  onChange: (filters: ExportFiltersType) => void;
  disabled?: boolean;
}

const STATUS_OPTIONS: Record<ExportModule, { value: string; label: string }[]> = {
  expense: [
    { value: 'all', label: 'All statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'submitted', label: 'Submitted (Pending)' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'reimbursed', label: 'Reimbursed' },
  ],
  leave: [
    { value: 'all', label: 'All statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'submitted', label: 'Submitted (Pending)' },
    { value: 'approved', label: 'Approved' },
    { value: 'rejected', label: 'Rejected' },
    { value: 'cancelled', label: 'Cancelled' },
  ],
  accounting: [
    { value: 'all', label: 'All statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'paid', label: 'Paid' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'cancelled', label: 'Cancelled' },
    { value: 'disputed', label: 'Disputed' },
  ],
  invoice: [
    { value: 'all', label: 'All statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'completed', label: 'Completed' },
    { value: 'paid', label: 'Paid' },
    { value: 'overdue', label: 'Overdue' },
    { value: 'draft', label: 'Draft' },
    { value: 'sent', label: 'Sent' },
  ],
  'master-data': [
    { value: 'all', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'archived', label: 'Archived' },
  ],
};

const DATE_PRESETS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last year' },
  { value: 'custom', label: 'Custom range' },
];

export function ExportFilters({
  module,
  filters,
  onChange,
  disabled,
}: ExportFiltersProps) {
  const handlePresetChange = useCallback(
    (value: string) => {
      if (value === 'custom') return;
      const days = parseInt(value, 10);
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      onChange({
        ...filters,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
      });
    },
    [filters, onChange]
  );

  const handleStartDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...filters, startDate: e.target.value || undefined });
    },
    [filters, onChange]
  );

  const handleEndDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ ...filters, endDate: e.target.value || undefined });
    },
    [filters, onChange]
  );

  const handleStatusChange = useCallback(
    (value: string) => {
      onChange({ ...filters, statusFilter: value === 'all' ? undefined : [value] });
    },
    [filters, onChange]
  );

  const handleInvoiceTypeChange = useCallback(
    (value: string) => {
      onChange({
        ...filters,
        invoiceType: value as "AP" | "AR" | "All",
      });
    },
    [filters, onChange]
  );

  const handleTransactionTypeChange = useCallback(
    (value: string) => {
      onChange({
        ...filters,
        transactionTypeFilter: value as "expense_claim" | "invoice" | "all",
      });
    },
    [filters, onChange]
  );

  const clearFilters = useCallback(() => {
    onChange({});
  }, [onChange]);

  const hasFilters =
    filters.startDate ||
    filters.endDate ||
    filters.statusFilter ||
    filters.invoiceType ||
    filters.transactionTypeFilter;

  const statusOptions = STATUS_OPTIONS[module];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Filter className="h-4 w-4" />
          Filters
        </div>
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            disabled={disabled}
            className="h-8 px-2 text-muted-foreground"
          >
            <X className="mr-1 h-3 w-3" />
            Clear
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Date Preset */}
        <div className="space-y-2">
          <Label className="text-sm">Date Range</Label>
          <Select onValueChange={handlePresetChange} disabled={disabled}>
            <SelectTrigger>
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              {DATE_PRESETS.map((preset) => (
                <SelectItem key={preset.value} value={preset.value}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Start Date */}
        <div className="space-y-2">
          <Label className="text-sm">Start Date</Label>
          <Input
            type="date"
            value={filters.startDate || ''}
            onChange={handleStartDateChange}
            disabled={disabled}
            className="bg-input"
          />
        </div>

        {/* End Date */}
        <div className="space-y-2">
          <Label className="text-sm">End Date</Label>
          <Input
            type="date"
            value={filters.endDate || ''}
            onChange={handleEndDateChange}
            disabled={disabled}
            className="bg-input"
          />
        </div>

        {/* Status Filter */}
        <div className="space-y-2">
          <Label className="text-sm">Status</Label>
          <Select
            value={filters.statusFilter?.[0] || 'all'}
            onValueChange={handleStatusChange}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Invoice Type Filter — only for invoice module */}
        {module === 'invoice' && (
          <div className="space-y-2">
            <Label className="text-sm">Invoice Type</Label>
            <Select
              value={filters.invoiceType || 'All'}
              onValueChange={handleInvoiceTypeChange}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="All invoices" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Invoices</SelectItem>
                <SelectItem value="AP">AP (Purchases)</SelectItem>
                <SelectItem value="AR">AR (Sales)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Transaction Type Filter — only for accounting module */}
        {module === 'accounting' && (
          <div className="space-y-2">
            <Label className="text-sm">Source Type</Label>
            <Select
              value={filters.transactionTypeFilter || 'all'}
              onValueChange={handleTransactionTypeChange}
              disabled={disabled}
            >
              <SelectTrigger>
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="expense_claim">Expense Claims</SelectItem>
                <SelectItem value="invoice">Invoices</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
    </div>
  );
}

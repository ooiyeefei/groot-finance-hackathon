'use client';

/**
 * Format Configuration Panel Component
 *
 * Configure default date and number formats for the export template.
 */

import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ThousandSeparator } from '../types';

interface FormatConfigPanelProps {
  defaultDateFormat?: string;
  defaultDecimalPlaces?: number;
  defaultThousandSeparator?: ThousandSeparator;
  onDateFormatChange: (format: string) => void;
  onDecimalPlacesChange: (places: number) => void;
  onThousandSeparatorChange: (separator: ThousandSeparator) => void;
  disabled?: boolean;
}

export function FormatConfigPanel({
  defaultDateFormat = 'YYYY-MM-DD',
  defaultDecimalPlaces = 2,
  defaultThousandSeparator = 'none',
  onDateFormatChange,
  onDecimalPlacesChange,
  onThousandSeparatorChange,
  disabled,
}: FormatConfigPanelProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-foreground">Default Formats</h3>
        <p className="text-sm text-muted-foreground">
          Set default formatting options for all fields (can be overridden per field)
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {/* Date Format */}
        <div className="space-y-2">
          <Label className="text-sm">Date Format</Label>
          <Select
            value={defaultDateFormat}
            onValueChange={onDateFormatChange}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="YYYY-MM-DD">YYYY-MM-DD (2024-01-15)</SelectItem>
              <SelectItem value="DD/MM/YYYY">DD/MM/YYYY (15/01/2024)</SelectItem>
              <SelectItem value="MM/DD/YYYY">MM/DD/YYYY (01/15/2024)</SelectItem>
              <SelectItem value="DD-MM-YYYY">DD-MM-YYYY (15-01-2024)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Decimal Places */}
        <div className="space-y-2">
          <Label className="text-sm">Decimal Places</Label>
          <Select
            value={String(defaultDecimalPlaces)}
            onValueChange={(value) => onDecimalPlacesChange(parseInt(value, 10))}
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0 (whole numbers)</SelectItem>
              <SelectItem value="2">2 (e.g., 1234.56)</SelectItem>
              <SelectItem value="4">4 (e.g., 1234.5678)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Thousands Separator */}
        <div className="space-y-2">
          <Label className="text-sm">Number Formatting</Label>
          <Select
            value={defaultThousandSeparator}
            onValueChange={(value) =>
              onThousandSeparatorChange(value as ThousandSeparator)
            }
            disabled={disabled}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No thousands separator</SelectItem>
              <SelectItem value="comma">Comma separator (1,234,567)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

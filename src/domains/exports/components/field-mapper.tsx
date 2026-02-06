'use client';

/**
 * Field Mapper Component
 *
 * Allows users to select fields from source data and map them to custom column names.
 * Supports drag-and-drop reordering (simplified without external library).
 */

import { useState, useCallback } from 'react';
import { GripVertical, Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { FieldMapping, FieldDefinition } from '../types';

interface FieldMapperProps {
  availableFields: FieldDefinition[];
  mappings: FieldMapping[];
  onChange: (mappings: FieldMapping[]) => void;
  disabled?: boolean;
}

export function FieldMapper({
  availableFields,
  mappings,
  onChange,
  disabled,
}: FieldMapperProps) {
  const [expandedField, setExpandedField] = useState<number | null>(null);

  // Get fields that haven't been mapped yet
  const unmappedFields = availableFields.filter(
    (field) => !mappings.some((m) => m.sourceField === field.id)
  );

  const addMapping = useCallback(() => {
    if (unmappedFields.length === 0) return;

    const newField = unmappedFields[0];
    const newMapping: FieldMapping = {
      sourceField: newField.id,
      targetColumn: newField.label,
      order: mappings.length,
    };

    onChange([...mappings, newMapping]);
  }, [mappings, unmappedFields, onChange]);

  const removeMapping = useCallback(
    (index: number) => {
      const updated = mappings
        .filter((_, i) => i !== index)
        .map((m, i) => ({ ...m, order: i }));
      onChange(updated);
    },
    [mappings, onChange]
  );

  const updateMapping = useCallback(
    (index: number, updates: Partial<FieldMapping>) => {
      const updated = mappings.map((m, i) =>
        i === index ? { ...m, ...updates } : m
      );
      onChange(updated);
    },
    [mappings, onChange]
  );

  const moveMapping = useCallback(
    (index: number, direction: 'up' | 'down') => {
      if (
        (direction === 'up' && index === 0) ||
        (direction === 'down' && index === mappings.length - 1)
      ) {
        return;
      }

      const newIndex = direction === 'up' ? index - 1 : index + 1;
      const updated = [...mappings];
      const temp = updated[index];
      updated[index] = updated[newIndex];
      updated[newIndex] = temp;

      // Update order values
      onChange(updated.map((m, i) => ({ ...m, order: i })));
    },
    [mappings, onChange]
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-foreground">Field Mappings</h3>
          <p className="text-sm text-muted-foreground">
            Select fields to include and customize column names
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={addMapping}
          disabled={disabled || unmappedFields.length === 0}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add Field
        </Button>
      </div>

      {mappings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border-2 border-dashed border-border rounded-lg">
          <p className="text-sm text-muted-foreground">No fields mapped yet.</p>
          <p className="text-sm text-muted-foreground">
            Click &quot;Add Field&quot; to start building your template.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {mappings.map((mapping, index) => {
            const fieldDef = availableFields.find(
              (f) => f.id === mapping.sourceField
            );
            const isExpanded = expandedField === index;

            return (
              <div
                key={index}
                className={cn(
                  'rounded-lg border border-border bg-card transition-all',
                  isExpanded ? 'ring-2 ring-primary/20' : ''
                )}
              >
                {/* Main Row */}
                <div className="flex items-center gap-2 p-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />

                  {/* Field selector */}
                  <div className="flex-1 min-w-0">
                    <Select
                      value={mapping.sourceField}
                      onValueChange={(value) =>
                        updateMapping(index, {
                          sourceField: value,
                          targetColumn:
                            availableFields.find((f) => f.id === value)?.label ||
                            value,
                        })
                      }
                      disabled={disabled}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent>
                        {/* Show current field plus unmapped fields */}
                        <SelectItem value={mapping.sourceField}>
                          {fieldDef?.label || mapping.sourceField}
                        </SelectItem>
                        {unmappedFields.map((field) => (
                          <SelectItem key={field.id} value={field.id}>
                            {field.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Arrow indicator */}
                  <span className="text-muted-foreground">&rarr;</span>

                  {/* Column name input */}
                  <div className="flex-1 min-w-0">
                    <Input
                      value={mapping.targetColumn}
                      onChange={(e) =>
                        updateMapping(index, { targetColumn: e.target.value })
                      }
                      placeholder="Column name"
                      className="h-9"
                      disabled={disabled}
                    />
                  </div>

                  {/* Move buttons */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => moveMapping(index, 'up')}
                      disabled={disabled || index === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                      <span className="sr-only">Move up</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => moveMapping(index, 'down')}
                      disabled={disabled || index === mappings.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                      <span className="sr-only">Move down</span>
                    </Button>
                  </div>

                  {/* Expand/Delete buttons */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    onClick={() => removeMapping(index)}
                    disabled={disabled}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Remove field</span>
                  </Button>
                </div>

                {/* Expanded format options */}
                {isExpanded && fieldDef && (
                  <div className="border-t border-border bg-muted/30 p-3">
                    <div className="grid gap-4 sm:grid-cols-3">
                      {fieldDef.type === 'date' && (
                        <div className="space-y-2">
                          <Label className="text-sm">Date Format</Label>
                          <Select
                            value={mapping.dateFormat || 'YYYY-MM-DD'}
                            onValueChange={(value) =>
                              updateMapping(index, { dateFormat: value })
                            }
                            disabled={disabled}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="YYYY-MM-DD">
                                2024-01-15
                              </SelectItem>
                              <SelectItem value="DD/MM/YYYY">
                                15/01/2024
                              </SelectItem>
                              <SelectItem value="MM/DD/YYYY">
                                01/15/2024
                              </SelectItem>
                              <SelectItem value="DD-MM-YYYY">
                                15-01-2024
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {fieldDef.type === 'number' && (
                        <>
                          <div className="space-y-2">
                            <Label className="text-sm">Decimal Places</Label>
                            <Select
                              value={String(mapping.decimalPlaces ?? 2)}
                              onValueChange={(value) =>
                                updateMapping(index, {
                                  decimalPlaces: parseInt(value, 10),
                                })
                              }
                              disabled={disabled}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">0 (1234)</SelectItem>
                                <SelectItem value="2">2 (1234.56)</SelectItem>
                                <SelectItem value="4">4 (1234.5678)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-sm">Thousands Separator</Label>
                            <Select
                              value={mapping.thousandSeparator || 'none'}
                              onValueChange={(value) =>
                                updateMapping(index, {
                                  thousandSeparator: value as 'comma' | 'none',
                                })
                              }
                              disabled={disabled}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  None (1234567)
                                </SelectItem>
                                <SelectItem value="comma">
                                  Comma (1,234,567)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Summary */}
      <div className="flex items-center justify-between text-sm text-muted-foreground border-t border-border pt-4">
        <span>
          {mappings.length} field{mappings.length !== 1 ? 's' : ''} mapped
        </span>
        <span>
          {unmappedFields.length} field{unmappedFields.length !== 1 ? 's' : ''}{' '}
          available
        </span>
      </div>
    </div>
  );
}

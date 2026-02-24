'use client';

/**
 * Template Builder Component
 *
 * Main interface for creating and editing custom export templates.
 */

import { useState, useCallback, useEffect } from 'react';
import { Save, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { ModuleSelector } from './module-selector';
import { FieldMapper } from './field-mapper';
import { FormatConfigPanel } from './format-config-panel';
import { useCreateTemplate, useUpdateTemplate } from '../hooks/use-export-templates';
import { useAvailableFields } from '../hooks/use-export-execution';
import type {
  ExportModule,
  FieldMapping,
  ThousandSeparator,
  FieldDefinition,
} from '../types';
import type { Id } from '../../../../convex/_generated/dataModel';

interface TemplateBuilderProps {
  businessId: string;
  templateId?: Id<'export_templates'>;
  initialData?: {
    name: string;
    description?: string;
    module: ExportModule;
    fieldMappings: FieldMapping[];
    defaultDateFormat?: string;
    defaultDecimalPlaces?: number;
    defaultThousandSeparator?: ThousandSeparator;
  };
  onClose: () => void;
  onSuccess: () => void;
}

export function TemplateBuilder({
  businessId,
  templateId,
  initialData,
  onClose,
  onSuccess,
}: TemplateBuilderProps) {
  const { addToast } = useToast();
  const { createTemplate } = useCreateTemplate();
  const { updateTemplate } = useUpdateTemplate();

  // Form state
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [module, setModule] = useState<ExportModule | undefined>(initialData?.module);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>(
    initialData?.fieldMappings || []
  );
  const [defaultDateFormat, setDefaultDateFormat] = useState(
    initialData?.defaultDateFormat || 'YYYY-MM-DD'
  );
  const [defaultDecimalPlaces, setDefaultDecimalPlaces] = useState(
    initialData?.defaultDecimalPlaces ?? 2
  );
  const [defaultThousandSeparator, setDefaultThousandSeparator] = useState<ThousandSeparator>(
    initialData?.defaultThousandSeparator || 'none'
  );

  const [isSaving, setIsSaving] = useState(false);

  // Get available fields for selected module
  const { fields: availableFields, isLoading: fieldsLoading } = useAvailableFields(module);

  // Reset mappings when module changes (unless editing existing template)
  useEffect(() => {
    if (!templateId && module && availableFields.length > 0 && fieldMappings.length === 0) {
      // Auto-populate with first 5 fields
      const initialMappings = availableFields.slice(0, 5).map((field, index) => ({
        sourceField: field.id,
        targetColumn: field.label,
        order: index,
      }));
      setFieldMappings(initialMappings);
    }
  }, [module, availableFields, templateId, fieldMappings.length]);

  // Handle save
  const handleSave = useCallback(async () => {
    // Validation
    if (!name.trim()) {
      addToast({
        type: 'error',
        title: 'Validation error',
        description: 'Template name is required.',
      });
      return;
    }

    if (!module) {
      addToast({
        type: 'error',
        title: 'Validation error',
        description: 'Please select an export module.',
      });
      return;
    }

    if (fieldMappings.length === 0) {
      addToast({
        type: 'error',
        title: 'Validation error',
        description: 'At least one field mapping is required.',
      });
      return;
    }

    setIsSaving(true);

    try {
      if (templateId) {
        // Update existing template
        await updateTemplate({
          templateId,
          name: name.trim(),
          description: description.trim() || undefined,
          fieldMappings,
          defaultDateFormat,
          defaultDecimalPlaces,
          defaultThousandSeparator,
        });
        addToast({
          type: 'success',
          title: 'Template updated',
          description: 'Your template has been saved.',
        });
      } else {
        // Create new template
        await createTemplate({
          businessId,
          name: name.trim(),
          module,
          fieldMappings,
          description: description.trim() || undefined,
          defaultDateFormat,
          defaultDecimalPlaces,
          defaultThousandSeparator,
        });
        addToast({
          type: 'success',
          title: 'Template created',
          description: 'Your custom template is ready to use.',
        });
      }

      onSuccess();
    } catch (error) {
      addToast({
        type: 'error',
        title: templateId ? 'Failed to update template' : 'Failed to create template',
        description: error instanceof Error ? error.message : 'Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    name,
    description,
    module,
    fieldMappings,
    defaultDateFormat,
    defaultDecimalPlaces,
    defaultThousandSeparator,
    businessId,
    templateId,
    createTemplate,
    updateTemplate,
    addToast,
    onSuccess,
  ]);

  const isEditing = !!templateId;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              {isEditing ? 'Edit Template' : 'Create Custom Template'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {isEditing
                ? 'Update your export template configuration'
                : 'Build a custom export template with your own field mappings'}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)] space-y-6">
          {/* Basic Info */}
          <Card className="bg-muted/30 border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Template Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Template Name *</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Monthly Payroll Export"
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="module">Module *</Label>
                  <ModuleSelector
                    value={module}
                    onChange={setModule}
                    disabled={isSaving || isEditing}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of this template's purpose"
                  rows={2}
                  disabled={isSaving}
                />
              </div>
            </CardContent>
          </Card>

          {/* Field Mappings */}
          {module && (
            <Card className="bg-muted/30 border-border">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Field Mappings</CardTitle>
                <CardDescription>
                  Select which fields to include and customize column names
                </CardDescription>
              </CardHeader>
              <CardContent>
                {fieldsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">
                      Loading available fields...
                    </span>
                  </div>
                ) : (
                  <>
                    <FieldMapper
                      availableFields={availableFields as FieldDefinition[]}
                      mappings={fieldMappings}
                      onChange={setFieldMappings}
                      disabled={isSaving}
                    />
                    {(module === 'accounting' || module === 'invoice') &&
                      fieldMappings.some((m) => m.sourceField.startsWith('lineItem.')) && (
                      <p className="mt-3 text-xs text-muted-foreground border-t border-border pt-3">
                        Line item fields selected — the export will produce one row per line item,
                        with header-level fields repeated on each row.
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* Format Configuration */}
          {module && (
            <Card className="bg-muted/30 border-border">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Format Configuration</CardTitle>
                <CardDescription>
                  Set default formatting options for dates and numbers
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FormatConfigPanel
                  defaultDateFormat={defaultDateFormat}
                  defaultDecimalPlaces={defaultDecimalPlaces}
                  defaultThousandSeparator={defaultThousandSeparator}
                  onDateFormatChange={setDefaultDateFormat}
                  onDecimalPlacesChange={setDefaultDecimalPlaces}
                  onThousandSeparatorChange={setDefaultThousandSeparator}
                  disabled={isSaving}
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-border bg-muted/30">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !module}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {isEditing ? 'Save Changes' : 'Create Template'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

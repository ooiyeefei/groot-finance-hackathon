'use client';

/**
 * Template List Component
 *
 * Displays available export templates (pre-built and custom) for selection.
 */

import { cn } from '@/lib/utils';
import { FileSpreadsheet, Star, Copy, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ExportModule } from '../types';
import type { Id } from '../../../../convex/_generated/dataModel';

interface TemplateItem {
  id: string | Id<'export_templates'>;
  name: string;
  description?: string;
  module: ExportModule;
  isPrebuilt: boolean;
  targetSystem?: string;
  fieldCount: number;
}

interface TemplateListProps {
  templates: TemplateItem[];
  selectedId: string | Id<'export_templates'> | undefined;
  onSelect: (id: string | Id<'export_templates'>, isPrebuilt: boolean) => void;
  onClone?: (id: string) => void;
  onDelete?: (id: Id<'export_templates'>) => void;
  isLoading?: boolean;
  emptyMessage?: string;
}

export function TemplateList({
  templates,
  selectedId,
  onSelect,
  onClone,
  onDelete,
  isLoading,
  emptyMessage = 'No templates available',
}: TemplateListProps) {
  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-14 animate-pulse rounded-lg border border-border bg-muted/30"
          />
        ))}
      </div>
    );
  }

  // Defensive check - ensure templates is an array
  const safeTemplates = templates || [];

  if (safeTemplates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileSpreadsheet className="h-12 w-12 text-muted-foreground/50" />
        <p className="mt-4 text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  // Group templates by type
  const prebuiltTemplates = safeTemplates.filter((t) => t.isPrebuilt);
  const customTemplates = safeTemplates.filter((t) => !t.isPrebuilt);

  return (
    <div className="space-y-6">
      {prebuiltTemplates.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Star className="h-4 w-4" />
            Pre-built Templates
          </h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {prebuiltTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                isSelected={selectedId === template.id}
                onSelect={() => onSelect(template.id, true)}
                onClone={onClone ? () => onClone(template.id as string) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      {customTemplates.length > 0 && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <FileSpreadsheet className="h-4 w-4" />
            Custom Templates
          </h4>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {customTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                isSelected={selectedId === template.id}
                onSelect={() => onSelect(template.id, false)}
                onDelete={
                  onDelete
                    ? () => onDelete(template.id as Id<'export_templates'>)
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface TemplateCardProps {
  template: TemplateItem;
  isSelected: boolean;
  onSelect: () => void;
  onClone?: () => void;
  onDelete?: () => void;
}

function TemplateCard({
  template,
  isSelected,
  onSelect,
  onClone,
  onDelete,
}: TemplateCardProps) {
  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 rounded-lg border-2 p-3 transition-all',
        'cursor-pointer hover:border-primary/50 hover:bg-muted/50',
        isSelected ? 'border-primary bg-primary/5' : 'border-border bg-card'
      )}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      {/* Icon */}
      <div
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg shrink-0',
          template.isPrebuilt
            ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400'
            : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
        )}
      >
        {template.isPrebuilt ? (
          <Star className="h-4 w-4" />
        ) : (
          <FileSpreadsheet className="h-4 w-4" />
        )}
      </div>

      {/* Template info - next to icon */}
      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-foreground text-sm leading-tight truncate">{template.name}</h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
          {template.targetSystem && (
            <>
              <span className="truncate">{template.targetSystem}</span>
              <span>•</span>
            </>
          )}
          <span className="whitespace-nowrap">{template.fieldCount} fields</span>
        </div>
      </div>

      {/* Action buttons */}
      <div
        className="flex items-center gap-0.5 shrink-0 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100"
        onClick={(e) => e.stopPropagation()}
      >
        {onClone && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClone}
            className="h-7 w-7 p-0"
            title="Clone template"
          >
            <Copy className="h-3.5 w-3.5" />
            <span className="sr-only">Clone template</span>
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDelete}
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            title="Delete template"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="sr-only">Delete template</span>
          </Button>
        )}
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <svg
            className="h-2.5 w-2.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </div>
  );
}

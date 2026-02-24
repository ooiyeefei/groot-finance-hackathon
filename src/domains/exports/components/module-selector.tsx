'use client';

/**
 * Module Selector Component
 *
 * Allows users to choose between expense and leave modules for export.
 */

import { cn } from '@/lib/utils';
import { Receipt, Calendar, FileText, BookOpen } from 'lucide-react';
import type { ExportModule } from '../types';

interface ModuleSelectorProps {
  value: ExportModule | undefined;
  onChange: (module: ExportModule) => void;
  disabled?: boolean;
}

const MODULES: { id: ExportModule; name: string; description: string; icon: typeof Receipt }[] = [
  {
    id: 'expense',
    name: 'Expense Claims',
    description: 'Export expense claims and reimbursements',
    icon: Receipt,
  },
  {
    id: 'invoice',
    name: 'Invoices',
    description: 'Export AP and AR invoices at all stages',
    icon: FileText,
  },
  {
    id: 'leave',
    name: 'Leave Records',
    description: 'Export leave requests, approvals, and balances',
    icon: Calendar,
  },
  {
    id: 'accounting',
    name: 'Accounting Records',
    description: 'Export posted journal entries',
    icon: BookOpen,
  },
];

export function ModuleSelector({ value, onChange, disabled }: ModuleSelectorProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {MODULES.map((module) => {
        const Icon = module.icon;
        const isSelected = value === module.id;

        return (
          <button
            key={module.id}
            type="button"
            onClick={() => onChange(module.id)}
            disabled={disabled}
            className={cn(
              'relative flex flex-col items-start gap-2 rounded-lg border-2 p-4 text-left transition-all',
              'hover:border-primary/50 hover:bg-muted/50',
              'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              isSelected
                ? 'border-primary bg-primary/5'
                : 'border-border bg-card'
            )}
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-lg',
                  isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">{module.name}</h3>
                <p className="text-sm text-muted-foreground">{module.description}</p>
              </div>
            </div>
            {isSelected && (
              <div className="absolute right-3 top-3">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

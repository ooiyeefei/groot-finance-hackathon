'use client';

import React from 'react';
import ActionButton from '@/components/ui/action-button';

interface PeriodSelectorProps {
  selectedPeriod: 'month' | 'quarter' | 'year';
  onPeriodChange: (period: 'month' | 'quarter' | 'year') => void;
  disabled?: boolean;
}

const PERIOD_OPTIONS = [
  { value: 'month' as const, label: 'Month', description: 'Current month view' },
  { value: 'quarter' as const, label: 'Quarter', description: 'Current quarter view' },
  { value: 'year' as const, label: 'Year', description: 'Current year view' }
];

export default function PeriodSelector({
  selectedPeriod,
  onPeriodChange,
  disabled = false
}: PeriodSelectorProps) {
  return (
    <div className="flex items-center bg-muted border border-border rounded-lg p-1">
      {PERIOD_OPTIONS.map((option) => {
        const isSelected = selectedPeriod === option.value;

        return (
          <button
            key={option.value}
            onClick={() => onPeriodChange(option.value)}
            disabled={disabled}
            className={`
              px-4 py-2 text-sm font-medium rounded-md transition-all duration-200
              focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background
              disabled:opacity-50 disabled:cursor-not-allowed
              ${isSelected
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }
            `}
            title={option.description}
            aria-pressed={isSelected}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
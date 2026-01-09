'use client';

import React, { useState, useEffect } from 'react';
import {
  BUSINESS_TYPE_CONFIG,
  BusinessType,
} from '@/domains/onboarding/lib/business-type-defaults';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  UtensilsCrossed,
  ShoppingBag,
  Briefcase,
  Factory,
  MoreHorizontal,
  LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface BusinessTypeStepProps {
  selectedType: BusinessType | null;
  customTypeDescription?: string;
  onSelect: (type: BusinessType) => void;
  onCustomTypeChange?: (description: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

// Icon mapping for business types
const BUSINESS_TYPE_ICONS: Record<BusinessType, LucideIcon> = {
  fnb: UtensilsCrossed,
  retail: ShoppingBag,
  services: Briefcase,
  manufacturing: Factory,
  other: MoreHorizontal,
};

export default function BusinessTypeStep({
  selectedType,
  customTypeDescription = '',
  onSelect,
  onCustomTypeChange,
  onNext,
  onBack,
  onSkip,
}: BusinessTypeStepProps) {
  const [localCustomType, setLocalCustomType] = useState(customTypeDescription);

  // Sync local state with prop
  useEffect(() => {
    setLocalCustomType(customTypeDescription);
  }, [customTypeDescription]);

  const businessTypes = Object.entries(BUSINESS_TYPE_CONFIG) as [
    BusinessType,
    typeof BUSINESS_TYPE_CONFIG[BusinessType]
  ][];

  const handleSkip = () => {
    onSelect('other');
    onSkip();
  };

  const handleCustomTypeChange = (value: string) => {
    setLocalCustomType(value);
    onCustomTypeChange?.(value);
  };

  // For "other" type, require a description
  const canContinue = selectedType !== null &&
    (selectedType !== 'other' || localCustomType.trim().length > 0);

  return (
    <div className="w-full max-w-lg mx-auto space-y-4">
      {/* Header */}
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold text-foreground">
          What type of business do you run?
        </h2>
        <p className="text-muted-foreground text-sm">
          This helps us suggest relevant categories
        </p>
      </div>

      {/* Business Type Grid */}
      <div className="grid grid-cols-2 gap-2">
        {businessTypes.map(([type, config]) => {
          const Icon = BUSINESS_TYPE_ICONS[type];
          const isSelected = selectedType === type;

          return (
            <Card
              key={type}
              className={cn(
                'cursor-pointer transition-all duration-200',
                'bg-card border-border hover:border-primary/50',
                isSelected && 'ring-2 ring-primary border-primary',
                !isSelected && 'hover:shadow-sm'
              )}
              onClick={() => onSelect(type)}
            >
              <div className="p-3 space-y-2">
                {/* Icon and Label */}
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'flex items-center justify-center w-8 h-8 rounded-md transition-colors',
                      isSelected
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-medium text-foreground">
                    {config.label}
                  </h3>
                </div>

                {/* Description */}
                <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
                  {config.description}
                </p>

                {/* Selection Indicator */}
                {isSelected && (
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs font-medium text-primary">
                      Selected
                    </span>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Custom Type Input - shown when "other" is selected */}
      {selectedType === 'other' && (
        <div className="space-y-1.5 p-3 bg-muted/50 rounded-md border border-border">
          <Label htmlFor="customType" className="text-xs font-medium text-foreground">
            Describe your business type <span className="text-destructive">*</span>
          </Label>
          <Input
            id="customType"
            type="text"
            placeholder="e.g., Consulting, Healthcare, Education..."
            value={localCustomType}
            onChange={(e) => handleCustomTypeChange(e.target.value)}
            className="bg-input border-border text-foreground h-8 text-sm"
          />
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleSkip}>
            Skip
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={onNext}
            disabled={!canContinue}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useState, KeyboardEvent } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X, Plus, Sparkles, ArrowLeft } from 'lucide-react';

interface ExpenseCategoriesStepProps {
  categories: string[];
  suggestedCategories: string[];
  onChange: (categories: string[]) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onUseDefaults: () => void;
}

const MAX_CATEGORIES = 20;

export default function ExpenseCategoriesStep({
  categories,
  suggestedCategories,
  onChange,
  onNext,
  onBack,
  onSkip,
  onUseDefaults,
}: ExpenseCategoriesStepProps) {
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  const handleAddCategory = () => {
    const trimmedValue = inputValue.trim();

    if (!trimmedValue) {
      return;
    }

    if (categories.length >= MAX_CATEGORIES) {
      setError(`Maximum ${MAX_CATEGORIES} categories allowed`);
      return;
    }

    if (categories.some(cat => cat.toLowerCase() === trimmedValue.toLowerCase())) {
      setError('Category already exists');
      return;
    }

    onChange([...categories, trimmedValue]);
    setInputValue('');
    setError('');
  };

  const handleRemoveCategory = (categoryToRemove: string) => {
    onChange(categories.filter(cat => cat !== categoryToRemove));
    setError('');
  };

  const handleAddSuggested = (suggestedCategory: string) => {
    if (categories.length >= MAX_CATEGORIES) {
      setError(`Maximum ${MAX_CATEGORIES} categories allowed`);
      return;
    }

    if (categories.some(cat => cat.toLowerCase() === suggestedCategory.toLowerCase())) {
      setError('Category already exists');
      return;
    }

    onChange([...categories, suggestedCategory]);
    setError('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCategory();
    }
  };

  const handleContinue = () => {
    if (categories.length === 0) {
      setError('Please add at least one category or skip this step');
      return;
    }
    setError('');
    onNext();
  };

  const handleUseDefaults = () => {
    onChange([...suggestedCategories]);
    setError('');
    onUseDefaults();
  };

  const handleSkip = () => {
    onChange([]);
    setError('');
    onSkip();
  };

  const availableSuggestions = suggestedCategories.filter(
    suggested => !categories.some(cat => cat.toLowerCase() === suggested.toLowerCase())
  );

  return (
    <div className="w-full max-w-lg mx-auto space-y-3">
      {/* Header */}
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold text-foreground">
          Customize expense categories
        </h2>
        <p className="text-muted-foreground text-xs">
          Add categories for operating expenses like rent, utilities, marketing
        </p>
      </div>

      {/* Main Card */}
      <Card className="bg-card border-border">
        <div className="p-3 space-y-3">
          {/* Input Section */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Add Expense Categories
            </label>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="e.g., Office Rent, Marketing..."
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setError('');
                }}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-input border-border text-foreground placeholder:text-muted-foreground focus:ring-ring h-8 text-sm"
                disabled={categories.length >= MAX_CATEGORIES}
              />
              <Button
                type="button"
                onClick={handleAddCategory}
                disabled={!inputValue.trim() || categories.length >= MAX_CATEGORIES}
                size="sm"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add
              </Button>
            </div>
            {error && (
              <p className="text-xs text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              {categories.length}/{MAX_CATEGORIES} categories
            </p>
          </div>

          {/* Current Categories */}
          {categories.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Your Categories
              </label>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((category) => (
                  <Badge
                    key={category}
                    className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 px-2 py-0.5 text-xs inline-flex items-center gap-1"
                  >
                    {category}
                    <button
                      type="button"
                      onClick={() => handleRemoveCategory(category)}
                      className="hover:bg-orange-500/20 rounded-full transition-colors"
                      aria-label={`Remove ${category}`}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Suggested Categories */}
          {availableSuggestions.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-orange-500" />
                Suggested for your business
              </label>
              <div className="flex flex-wrap gap-1.5">
                {availableSuggestions.map((suggested) => (
                  <Badge
                    key={suggested}
                    onClick={() => handleAddSuggested(suggested)}
                    className="bg-muted text-muted-foreground hover:bg-orange-500/10 hover:text-orange-600 dark:hover:text-orange-400 hover:border-orange-500/30 cursor-pointer transition-colors px-2 py-0.5 text-xs"
                  >
                    {suggested}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Footer Actions */}
      <div className="flex justify-between items-center pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="w-3.5 h-3.5 mr-1" />
          Back
        </Button>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleSkip}>
            Skip
          </Button>
          {suggestedCategories.length > 0 && (
            <Button type="button" variant="secondary" size="sm" onClick={handleUseDefaults}>
              Use Defaults
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleContinue}
            disabled={categories.length === 0}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

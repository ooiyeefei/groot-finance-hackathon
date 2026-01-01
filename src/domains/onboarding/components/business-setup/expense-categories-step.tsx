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
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-semibold text-foreground">
          Customize your expense categories
        </h2>
        <p className="text-muted-foreground">
          Add categories to track your business operating expenses like rent, utilities, marketing, and staff costs.
          These help you monitor where your money goes each month.
        </p>
      </div>

      {/* Main Card */}
      <Card className="bg-card border-border">
        <div className="p-6 space-y-6">
          {/* Input Section */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-foreground">
              Add Expense Categories
            </label>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="e.g., Office Rent, Marketing, Utilities"
                value={inputValue}
                onChange={(e) => {
                  setInputValue(e.target.value);
                  setError('');
                }}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-input border-border text-foreground placeholder:text-muted-foreground focus:ring-ring"
                disabled={categories.length >= MAX_CATEGORIES}
              />
              <Button
                type="button"
                onClick={handleAddCategory}
                disabled={!inputValue.trim() || categories.length >= MAX_CATEGORIES}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {categories.length}/{MAX_CATEGORIES} categories added
            </p>
          </div>

          {/* Current Categories */}
          {categories.length > 0 && (
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">
                Your Categories
              </label>
              <div className="flex flex-wrap gap-2">
                {categories.map((category) => (
                  <Badge
                    key={category}
                    className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/30 pl-2.5 pr-1.5 py-1 text-sm inline-flex items-center gap-1"
                  >
                    {category}
                    <button
                      type="button"
                      onClick={() => handleRemoveCategory(category)}
                      className="ml-1 hover:bg-orange-500/20 rounded-full p-0.5 transition-colors"
                      aria-label={`Remove ${category}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Suggested Categories */}
          {availableSuggestions.length > 0 && (
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground flex items-center gap-1">
                <Sparkles className="w-4 h-4 text-orange-500" />
                Suggested for your business
              </label>
              <div className="flex flex-wrap gap-2">
                {availableSuggestions.map((suggested) => (
                  <Badge
                    key={suggested}
                    onClick={() => handleAddSuggested(suggested)}
                    className="bg-muted text-muted-foreground hover:bg-orange-500/10 hover:text-orange-600 dark:hover:text-orange-400 hover:border-orange-500/30 cursor-pointer transition-colors"
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
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
        {/* Back Button */}
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="text-foreground hover:bg-muted order-1 sm:order-1"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Back
        </Button>

        {/* Right Side Actions */}
        <div className="flex flex-col sm:flex-row gap-2 order-2 sm:order-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleSkip}
            className="text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            Skip for now
          </Button>
          {suggestedCategories.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleUseDefaults}
              className="bg-secondary text-secondary-foreground hover:bg-secondary/80"
            >
              Use Defaults
            </Button>
          )}
          <Button
            type="button"
            onClick={handleContinue}
            disabled={categories.length === 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}

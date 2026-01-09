'use client'

import * as React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Plus, X, AlertCircle } from 'lucide-react'

/**
 * COGSCategoriesStep Component
 *
 * Step 3 of the onboarding wizard - allows users to customize COGS category names
 * pre-populated with suggestions based on business type selection.
 *
 * @example
 * ```tsx
 * <COGSCategoriesStep
 *   categories={currentCategories}
 *   suggestedCategories={businessTypeDefaults.suggestedCOGS}
 *   onChange={(newCategories) => setCategories(newCategories)}
 *   onNext={() => goToStep(4)}
 *   onBack={() => goToStep(2)}
 *   onSkip={() => goToStep(4)}
 *   onUseDefaults={() => {
 *     setCategories(suggestedCategories)
 *     goToStep(4)
 *   }}
 * />
 * ```
 */

interface COGSCategoriesStepProps {
  /** Current list of COGS category names */
  categories: string[]
  /** Suggested categories from business type defaults */
  suggestedCategories: string[]
  /** Callback when categories change */
  onChange: (categories: string[]) => void
  /** Callback when user clicks Continue */
  onNext: () => void
  /** Callback when user clicks Back */
  onBack: () => void
  /** Callback when user clicks Skip */
  onSkip: () => void
  /** Callback when user clicks Use Defaults */
  onUseDefaults: () => void
}

const MAX_CATEGORIES = 20

export default function COGSCategoriesStep({
  categories,
  suggestedCategories,
  onChange,
  onNext,
  onBack,
  onSkip,
  onUseDefaults,
}: COGSCategoriesStepProps) {
  const [inputValue, setInputValue] = React.useState('')
  const [showLimitWarning, setShowLimitWarning] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const handleAddCategory = () => {
    const trimmedValue = inputValue.trim()

    if (!trimmedValue) {
      return
    }

    // Check if category already exists (case-insensitive)
    if (categories.some(cat => cat.toLowerCase() === trimmedValue.toLowerCase())) {
      setInputValue('')
      return
    }

    // Check category limit
    if (categories.length >= MAX_CATEGORIES) {
      setShowLimitWarning(true)
      setTimeout(() => setShowLimitWarning(false), 3000)
      return
    }

    onChange([...categories, trimmedValue])
    setInputValue('')
  }

  const handleRemoveCategory = (categoryToRemove: string) => {
    onChange(categories.filter(cat => cat !== categoryToRemove))
    setShowLimitWarning(false)
  }

  const handleAddSuggested = (suggestedCategory: string) => {
    // Check if already added (case-insensitive)
    if (categories.some(cat => cat.toLowerCase() === suggestedCategory.toLowerCase())) {
      return
    }

    // Check category limit
    if (categories.length >= MAX_CATEGORIES) {
      setShowLimitWarning(true)
      setTimeout(() => setShowLimitWarning(false), 3000)
      return
    }

    onChange([...categories, suggestedCategory])
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddCategory()
    }
  }

  return (
    <div className="w-full max-w-lg mx-auto space-y-3">
      {/* Header */}
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold text-foreground">
          Customize COGS categories
        </h2>
        <p className="text-muted-foreground text-xs">
          Add categories for direct costs of producing your products/services
        </p>
      </div>

      {/* Category Input Card */}
      <Card className="bg-card border-border">
        <CardContent className="p-3 space-y-3">
          {/* Input Area */}
          <div className="space-y-1.5">
            <label htmlFor="category-input" className="text-foreground font-medium text-xs">
              Add new category
            </label>
            <div className="flex gap-2">
              <Input
                ref={inputRef}
                id="category-input"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type category name..."
                className="flex-1 bg-input border-border text-foreground focus:ring-ring h-8 text-sm"
              />
              <Button
                onClick={handleAddCategory}
                disabled={!inputValue.trim() || categories.length >= MAX_CATEGORIES}
                variant="primary"
                size="sm"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Add
              </Button>
            </div>
            {showLimitWarning && (
              <div className="flex items-center gap-1.5 text-warning-foreground text-xs">
                <AlertCircle className="w-3 h-3" />
                <span>Maximum {MAX_CATEGORIES} categories reached</span>
              </div>
            )}
          </div>

          {/* Current Categories */}
          {categories.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-foreground font-medium text-xs">
                Your categories ({categories.length}/{MAX_CATEGORIES})
              </label>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((category) => (
                  <Badge
                    key={category}
                    className={cn(
                      "bg-primary/10 text-primary border border-primary/30",
                      "px-2 py-0.5 text-xs font-medium",
                      "hover:bg-primary/20 transition-colors"
                    )}
                  >
                    <span>{category}</span>
                    <button
                      onClick={() => handleRemoveCategory(category)}
                      className="ml-1.5 hover:text-primary-foreground transition-colors"
                      aria-label={`Remove ${category}`}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Suggested Categories Card */}
      {suggestedCategories.length > 0 && (
        <Card className="bg-card border-border">
          <CardContent className="p-3 space-y-2">
            <label className="text-foreground font-medium text-xs">
              Suggested for your business
            </label>
            <div className="flex flex-wrap gap-1.5">
              {suggestedCategories.map((suggestion) => {
                const isAlreadyAdded = categories.some(
                  cat => cat.toLowerCase() === suggestion.toLowerCase()
                )

                return (
                  <Badge
                    key={suggestion}
                    onClick={() => !isAlreadyAdded && handleAddSuggested(suggestion)}
                    className={cn(
                      isAlreadyAdded
                        ? "bg-muted text-muted-foreground border border-border opacity-50 cursor-not-allowed"
                        : "bg-muted text-muted-foreground border border-border hover:bg-primary/10 hover:text-primary hover:border-primary/30 cursor-pointer",
                      "px-2 py-0.5 text-xs font-medium transition-all"
                    )}
                  >
                    {suggestion}
                    {isAlreadyAdded && <span className="ml-0.5">✓</span>}
                  </Badge>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer Actions */}
      <div className="flex items-center justify-between gap-2 pt-2">
        <Button onClick={onBack} variant="ghost" size="sm">
          Back
        </Button>

        <div className="flex items-center gap-2">
          <Button onClick={onSkip} variant="outline" size="sm">
            Skip
          </Button>

          {suggestedCategories.length > 0 && categories.length === 0 && (
            <Button onClick={onUseDefaults} variant="secondary" size="sm">
              Use Defaults
            </Button>
          )}

          <Button onClick={onNext} variant="primary" size="sm">
            Continue
          </Button>
        </div>
      </div>
    </div>
  )
}

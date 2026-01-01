'use client'

/**
 * Business Onboarding Modal
 *
 * Modal version of the business creation wizard that can be triggered
 * from anywhere in the app (e.g., business switcher "Create New Business")
 * without navigating away from the current page.
 *
 * Contains the same 5-step wizard:
 * 1. Business Details (name, country, currency)
 * 2. Business Type selection
 * 3. COGS Categories customization
 * 4. Expense Categories customization
 * 5. Review & Submit
 */

import React, { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2,
  ArrowLeft,
  Loader2,
  Check,
  X,
  Sparkles,
  Wand2,
  Rocket,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useBusinessContext } from '@/contexts/business-context'
import { useOnboardingFlow } from '@/domains/onboarding/hooks/use-onboarding-flow'
import BusinessTypeStep from '@/domains/onboarding/components/business-setup/business-type-step'
import COGSCategoriesStep from '@/domains/onboarding/components/business-setup/cogs-categories-step'
import ExpenseCategoriesStep from '@/domains/onboarding/components/business-setup/expense-categories-step'
import { getSuggestedCategories } from '@/domains/onboarding/lib/business-type-defaults'
import {
  getAllCountries,
  getCommonCurrencies,
  getCurrencyForCountry,
} from '@/domains/onboarding/lib/country-currency-data'
import type { BusinessType } from '@/domains/onboarding/types'
import { cn } from '@/lib/utils'

// Get comprehensive country and currency lists from library
const COUNTRIES = getAllCountries()
const CURRENCIES = getCommonCurrencies()

// Wizard step definitions
const WIZARD_STEPS = [
  { id: 1, label: 'Details', description: 'Business info' },
  { id: 2, label: 'Type', description: 'Industry' },
  { id: 3, label: 'COGS', description: 'Cost categories' },
  { id: 4, label: 'Expenses', description: 'Expense categories' },
  { id: 5, label: 'Review', description: 'Confirm setup' },
]

// Fun loading messages for the "brewing" animation
const BREWING_MESSAGES = [
  { text: 'Brewing your workspace magic...', icon: Sparkles, emoji: '✨' },
  { text: 'Setting up your financial command center...', icon: Settings, emoji: '⚙️' },
  { text: 'Configuring AI-powered features...', icon: Wand2, emoji: '🪄' },
  { text: 'Almost there! Preparing your dashboard...', icon: Rocket, emoji: '🚀' },
]

interface BusinessOnboardingModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void // Called after successful business creation
}

export default function BusinessOnboardingModal({
  isOpen,
  onClose,
  onSuccess,
}: BusinessOnboardingModalProps) {
  const router = useRouter()
  const { refreshMemberships, refreshContext } = useBusinessContext()

  // Wizard state
  const {
    currentStep,
    wizardData,
    isSubmitting,
    error,
    canProceed,
    isFirstStep,
    isLastStep,
    stepProgress,
    goToNextStep,
    goToPreviousStep,
    updateWizardData,
    skipCurrentStep,
    applyDefaults,
    resetWizard,
  } = useOnboardingFlow()

  // Local state for step 1 form
  const [homeCurrency, setHomeCurrency] = useState('SGD')
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  // Brewing animation state
  const [brewingMessageIndex, setBrewingMessageIndex] = useState(0)

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden'
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen, onClose])

  // Reset wizard when modal closes
  useEffect(() => {
    if (!isOpen) {
      resetWizard()
      setHomeCurrency('SGD')
      setSubmitError(null)
      setBrewingMessageIndex(0)
    }
  }, [isOpen, resetWizard])

  // Cycle through brewing messages during creation
  useEffect(() => {
    if (!isCreating) {
      setBrewingMessageIndex(0)
      return
    }

    const interval = setInterval(() => {
      setBrewingMessageIndex((prev) => (prev + 1) % BREWING_MESSAGES.length)
    }, 2000) // Change message every 2 seconds

    return () => clearInterval(interval)
  }, [isCreating])

  // Don't render if not open
  if (!isOpen) return null

  // Handle country selection and auto-set currency
  const handleCountryChange = (countryCode: string) => {
    updateWizardData({ countryCode })
    const currency = getCurrencyForCountry(countryCode)
    setHomeCurrency(currency)
  }

  // Final submission handler - creates business and starts trial
  const handleFinalSubmit = async () => {
    setIsCreating(true)
    setSubmitError(null)

    try {
      const selectedPlan = wizardData.selectedPlan || 'trial'

      // Step 1: Create business (synchronous call)
      console.log('[BusinessOnboardingModal] Creating business...')
      const response = await fetch('/api/v1/onboarding/initialize-business', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: wizardData.businessName,
          countryCode: wizardData.countryCode || 'SG',
          homeCurrency: homeCurrency,
          businessType: wizardData.businessType,
          customCOGSNames: wizardData.customCOGSNames || [],
          customExpenseNames: wizardData.customExpenseNames || [],
          selectedPlan: selectedPlan,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to create business')
      }

      console.log('[BusinessOnboardingModal] Business created:', result.businessId)

      // Step 2: For trial users, start the trial subscription
      if (selectedPlan === 'trial') {
        console.log('[BusinessOnboardingModal] Starting trial subscription...')
        const trialResponse = await fetch('/api/v1/onboarding/start-trial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            businessId: result.businessId,
          }),
        })

        const trialResult = await trialResponse.json()

        if (!trialResult.success) {
          // Log warning but don't fail - user can start trial later
          console.warn('[BusinessOnboardingModal] Trial start failed:', trialResult.error)
        } else {
          console.log('[BusinessOnboardingModal] Trial started successfully')
        }
      }

      // Step 3: Refresh business context and close modal
      console.log('[BusinessOnboardingModal] Refreshing business context...')
      await refreshMemberships()
      await refreshContext()

      // Call success callback if provided
      onSuccess?.()

      // Close modal
      onClose()

      // Optionally refresh the page to load new business data
      router.refresh()
    } catch (err) {
      console.error('[BusinessOnboardingModal] Error:', err)
      setSubmitError(err instanceof Error ? err.message : 'Failed to create business')
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 transition-opacity"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative w-full max-w-4xl max-h-[96vh] overflow-hidden m-4">
        <Card className="bg-card border-border shadow-2xl">
          {/* Header with close button */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  Create New Business
                </h2>
                <p className="text-sm text-muted-foreground">
                  Step {currentStep} of {WIZARD_STEPS.length}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Progress bar */}
          <div className="px-6 pt-4">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${stepProgress}%` }}
              />
            </div>
            {/* Step indicators (compact) */}
            <div className="flex justify-between mt-2">
              {WIZARD_STEPS.map((step) => {
                const isActive = step.id === currentStep
                const isCompleted = step.id < currentStep

                return (
                  <div key={step.id} className="flex items-center gap-1">
                    <div
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors',
                        isActive && 'bg-primary text-primary-foreground',
                        isCompleted && 'bg-green-500 text-white',
                        !isActive && !isCompleted && 'bg-muted text-muted-foreground'
                      )}
                    >
                      {isCompleted ? <Check className="w-3 h-3" /> : step.id}
                    </div>
                    <span
                      className={cn(
                        'text-xs hidden sm:inline',
                        isActive && 'text-primary font-medium',
                        isCompleted && 'text-green-500',
                        !isActive && !isCompleted && 'text-muted-foreground'
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Scrollable content */}
          <CardContent className="p-6 overflow-y-auto max-h-[calc(96vh-180px)]">
            {/* Step 1: Business Details */}
            {currentStep === 1 && (
              <div className="space-y-6">
                <div className="text-center space-y-2 mb-6">
                  <h3 className="text-xl font-semibold text-foreground">
                    Business Details
                  </h3>
                  <p className="text-muted-foreground">
                    Tell us about your business
                  </p>
                </div>

                {/* Business Name */}
                <div className="space-y-2">
                  <Label htmlFor="businessName" className="text-sm font-medium text-foreground">
                    Business Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="businessName"
                    type="text"
                    placeholder="e.g. Acme Trading Pte Ltd"
                    value={wizardData.businessName || ''}
                    onChange={(e) => updateWizardData({ businessName: e.target.value })}
                    className="bg-input border-border text-foreground"
                    required
                  />
                </div>

                {/* Country */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Country</Label>
                  <Select
                    value={wizardData.countryCode || 'SG'}
                    onValueChange={handleCountryChange}
                  >
                    <SelectTrigger className="bg-input border-border text-foreground">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border max-h-[250px]">
                      {COUNTRIES.map((country) => (
                        <SelectItem
                          key={country.code}
                          value={country.code}
                          className="text-foreground focus:bg-muted"
                        >
                          {country.name} ({country.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Currency */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">Home Currency</Label>
                  <Select value={homeCurrency} onValueChange={setHomeCurrency}>
                    <SelectTrigger className="bg-input border-border text-foreground">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border max-h-[250px]">
                      {CURRENCIES.map((currency) => (
                        <SelectItem
                          key={currency.code}
                          value={currency.code}
                          className="text-foreground focus:bg-muted"
                        >
                          {currency.code} - {currency.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Navigation */}
                <div className="flex justify-end pt-4">
                  <Button
                    onClick={goToNextStep}
                    disabled={!wizardData.businessName?.trim()}
                  >
                    Continue
                  </Button>
                </div>
              </div>
            )}

            {/* Step 2: Business Type */}
            {currentStep === 2 && (
              <BusinessTypeStep
                selectedType={(wizardData.businessType as BusinessType) || null}
                customTypeDescription={wizardData.customTypeDescription || ''}
                onSelect={(type) => updateWizardData({ businessType: type })}
                onCustomTypeChange={(description) => updateWizardData({ customTypeDescription: description })}
                onNext={goToNextStep}
                onBack={goToPreviousStep}
                onSkip={() => {
                  updateWizardData({ businessType: 'other' })
                  skipCurrentStep()
                }}
              />
            )}

            {/* Step 3: COGS Categories */}
            {currentStep === 3 && (
              <COGSCategoriesStep
                categories={[...(wizardData.customCOGSNames || [])]}
                suggestedCategories={
                  wizardData.businessType
                    ? [...getSuggestedCategories(wizardData.businessType, 'cogs')]
                    : []
                }
                onChange={(categories) => updateWizardData({ customCOGSNames: categories })}
                onNext={goToNextStep}
                onBack={goToPreviousStep}
                onSkip={skipCurrentStep}
                onUseDefaults={() => {
                  applyDefaults(3)
                  goToNextStep()
                }}
              />
            )}

            {/* Step 4: Expense Categories */}
            {currentStep === 4 && (
              <ExpenseCategoriesStep
                categories={[...(wizardData.customExpenseNames || [])]}
                suggestedCategories={
                  wizardData.businessType
                    ? [...getSuggestedCategories(wizardData.businessType, 'expense')]
                    : []
                }
                onChange={(categories) => updateWizardData({ customExpenseNames: categories })}
                onNext={goToNextStep}
                onBack={goToPreviousStep}
                onSkip={skipCurrentStep}
                onUseDefaults={() => {
                  applyDefaults(4)
                  goToNextStep()
                }}
              />
            )}

            {/* Step 5: Review */}
            {currentStep === 5 && (
              <div className="space-y-6 relative">
                {/* Brewing Animation Overlay */}
                {isCreating && (
                  <div className="absolute inset-0 bg-background/95 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-lg">
                    {/* Animated Icon Container */}
                    <div className="relative mb-6">
                      {/* Pulsing background ring */}
                      <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
                      <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse" />

                      {/* Icon with bounce animation */}
                      <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center">
                        {(() => {
                          const CurrentIcon = BREWING_MESSAGES[brewingMessageIndex].icon
                          return (
                            <CurrentIcon
                              className="w-10 h-10 text-primary animate-bounce"
                              style={{ animationDuration: '1s' }}
                            />
                          )
                        })()}
                      </div>
                    </div>

                    {/* Message with smooth transition */}
                    <p className="text-lg font-medium text-foreground text-center px-4 transition-all duration-300">
                      {BREWING_MESSAGES[brewingMessageIndex].text}
                    </p>

                    {/* Progress dots */}
                    <div className="flex gap-2 mt-6">
                      {BREWING_MESSAGES.map((_, idx) => (
                        <div
                          key={idx}
                          className={cn(
                            'w-2 h-2 rounded-full transition-all duration-300',
                            idx === brewingMessageIndex
                              ? 'bg-primary w-6'
                              : 'bg-muted-foreground/30'
                          )}
                        />
                      ))}
                    </div>

                    {/* Subtle loading bar */}
                    <div className="w-48 h-1 bg-muted rounded-full mt-6 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full animate-pulse"
                        style={{
                          width: `${((brewingMessageIndex + 1) / BREWING_MESSAGES.length) * 100}%`,
                          transition: 'width 0.5s ease-out'
                        }}
                      />
                    </div>
                  </div>
                )}

                <div className="text-center space-y-2 mb-6">
                  <h3 className="text-xl font-semibold text-foreground">
                    Review Your Setup
                  </h3>
                  <p className="text-muted-foreground">
                    Confirm your business details before creating
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Business Details */}
                  <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                    <h4 className="font-medium text-foreground">Business Details</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Name:</span>
                        <p className="font-medium text-foreground">{wizardData.businessName}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Type:</span>
                        <p className="font-medium text-foreground capitalize">
                          {wizardData.businessType === 'fnb' ? 'Food & Beverage' : wizardData.businessType}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Country:</span>
                        <p className="font-medium text-foreground">
                          {COUNTRIES.find((c) => c.code === wizardData.countryCode)?.name ||
                            wizardData.countryCode || 'Singapore'}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Currency:</span>
                        <p className="font-medium text-foreground">{homeCurrency}</p>
                      </div>
                    </div>
                  </div>

                  {/* COGS Categories */}
                  <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                    <h4 className="font-medium text-foreground">
                      COGS Categories ({wizardData.customCOGSNames?.length || 0})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {(wizardData.customCOGSNames || []).map((cat, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 bg-primary/10 text-primary text-sm rounded-md"
                        >
                          {cat}
                        </span>
                      ))}
                      {(!wizardData.customCOGSNames || wizardData.customCOGSNames.length === 0) && (
                        <span className="text-muted-foreground text-sm">
                          No custom categories (AI will generate defaults)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expense Categories */}
                  <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                    <h4 className="font-medium text-foreground">
                      Expense Categories ({wizardData.customExpenseNames?.length || 0})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {(wizardData.customExpenseNames || []).map((cat, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 bg-orange-500/10 text-orange-600 dark:text-orange-400 text-sm rounded-md"
                        >
                          {cat}
                        </span>
                      ))}
                      {(!wizardData.customExpenseNames || wizardData.customExpenseNames.length === 0) && (
                        <span className="text-muted-foreground text-sm">
                          No custom categories (AI will generate defaults)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Error Display */}
                {(error || submitError) && (
                  <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                    <p className="text-sm text-destructive">{error || submitError}</p>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex justify-between pt-4">
                  <Button variant="ghost" onClick={goToPreviousStep} disabled={isCreating}>
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                  </Button>
                  <Button onClick={handleFinalSubmit} disabled={isCreating || isSubmitting}>
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Setting up...
                      </>
                    ) : (
                      'Create Business'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

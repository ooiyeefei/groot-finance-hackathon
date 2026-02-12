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
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { SignOutButton } from '@clerk/nextjs'
import {
  Building2,
  ArrowLeft,
  Loader2,
  Check,
  X,
  LogOut,
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
  mode?: 'modal' | 'page' // 'modal' for sidebar trigger, 'page' for /onboarding/business
}

export default function BusinessOnboardingModal({
  isOpen,
  onClose,
  onSuccess,
  mode = 'modal',
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
      if (mode !== 'page') {
        document.body.style.overflow = 'hidden'
      }
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      if (mode !== 'page') {
        document.body.style.overflow = 'unset'
      }
    }
  }, [isOpen, onClose, mode])

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
      // forceCreateNew: true ensures we ALWAYS create a new business from the modal
      // (rather than completing an existing placeholder from webhook)
      console.log('[BusinessOnboardingModal] Creating NEW business (forceCreateNew: true)...')
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
          forceCreateNew: mode !== 'page',  // modal: always new, page: may complete placeholder
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

      // Step 3: Clear caches and handle post-creation navigation
      try {
        localStorage.removeItem('business-profile')
        localStorage.removeItem('user-role-cache')
      } catch (cacheError) {
        console.warn('[BusinessOnboardingModal] Failed to clear caches:', cacheError)
      }

      if (mode === 'page') {
        // Page mode: navigate to dashboard
        console.log('[BusinessOnboarding] Redirecting to dashboard...')
        router.push('/')
      } else {
        // Modal mode: refresh context and force full page reload
        console.log('[BusinessOnboardingModal] Refreshing business context...')
        await refreshMemberships()
        await refreshContext()
        onSuccess?.()
        onClose()
        console.log('[BusinessOnboardingModal] Triggering full page reload...')
        window.location.reload()
      }
    } catch (err) {
      console.error('[BusinessOnboardingModal] Error:', err)
      setSubmitError(err instanceof Error ? err.message : 'Failed to create business')
    } finally {
      setIsCreating(false)
    }
  }

  const content = (
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
      <div className={cn("relative w-full min-h-[85vh] max-h-[96vh] overflow-hidden m-4 flex flex-col", mode === 'page' ? 'max-w-3xl' : 'max-w-[699px]')}>
        <Card className="bg-card border-border shadow-2xl flex flex-col h-full">
          {/* Header with close button */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-primary/10 rounded-lg">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-foreground">
                  Create New Business
                </h2>
                <p className="text-base text-muted-foreground">
                  Step {currentStep} of {WIZARD_STEPS.length}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {mode === 'page' && (
                <SignOutButton redirectUrl="/en/sign-in">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <LogOut className="h-4 w-4 mr-1.5" />
                    Sign out
                  </Button>
                </SignOutButton>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="h-9 w-9 p-0"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="px-6 pt-4">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${stepProgress}%` }}
              />
            </div>
            {/* Step indicators */}
            <div className="flex justify-between mt-2 mb-2">
              {WIZARD_STEPS.map((step) => {
                const isActive = step.id === currentStep
                const isCompleted = step.id < currentStep

                return (
                  <div key={step.id} className="flex items-center gap-1.5">
                    <div
                      className={cn(
                        'w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium transition-colors',
                        isActive && 'bg-primary text-primary-foreground ring-2 ring-primary/30',
                        isCompleted && 'bg-green-500 text-white',
                        !isActive && !isCompleted && 'bg-muted text-muted-foreground'
                      )}
                    >
                      {isCompleted ? <Check className="w-3 h-3" /> : step.id}
                    </div>
                    <span
                      className={cn(
                        'text-sm hidden sm:inline',
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

          {/* Scrollable content - flex-grow to fill available space */}
          <CardContent className="px-6 py-5 overflow-y-auto flex-1 flex flex-col">
            {/* Step 1: Business Details */}
            {currentStep === 1 && (
              <div className="flex-1 flex flex-col space-y-5">
                <div className="text-center space-y-2 mb-5">
                  <h3 className="text-2xl font-semibold text-foreground">
                    Business Details
                  </h3>
                  <p className="text-base text-muted-foreground">
                    Tell us about your business
                  </p>
                </div>

                {/* Business Name */}
                <div className="space-y-2">
                  <Label htmlFor="businessName" className="text-base font-medium text-foreground">
                    Business Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="businessName"
                    type="text"
                    placeholder="e.g. Acme Trading Pte Ltd"
                    value={wizardData.businessName || ''}
                    onChange={(e) => updateWizardData({ businessName: e.target.value })}
                    className="bg-input border-border text-foreground h-10"
                    required
                  />
                </div>

                {/* Country */}
                <div className="space-y-2">
                  <Label className="text-base font-medium text-foreground">Country</Label>
                  <Select
                    value={wizardData.countryCode || 'SG'}
                    onValueChange={handleCountryChange}
                  >
                    <SelectTrigger className="bg-input border-border text-foreground h-10">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border max-h-[240px]">
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
                  <Label className="text-base font-medium text-foreground">Home Currency</Label>
                  <Select value={homeCurrency} onValueChange={setHomeCurrency}>
                    <SelectTrigger className="bg-input border-border text-foreground h-10">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border max-h-[240px]">
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

                {/* Spacer to push navigation to bottom */}
                <div className="flex-1" />

                {/* Navigation */}
                <div className="flex justify-end pt-4">
                  <Button
                    variant="primary"
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
              <div className="flex-1 flex flex-col">
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
                  className="flex-1 flex flex-col"
                />
              </div>
            )}

            {/* Step 3: COGS Categories */}
            {currentStep === 3 && (
              <div className="flex-1 flex flex-col">
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
                  className="flex-1 flex flex-col"
                />
              </div>
            )}

            {/* Step 4: Expense Categories */}
            {currentStep === 4 && (
              <div className="flex-1 flex flex-col">
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
                  className="flex-1 flex flex-col"
                />
              </div>
            )}

            {/* Step 5: Review */}
            {currentStep === 5 && (
              <div className="flex-1 flex flex-col space-y-4 relative">
                {/* Brewing Animation Overlay */}
                {isCreating && (
                  <div className="absolute inset-0 bg-background/95 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-lg">
                    {/* Animated Icon Container */}
                    <div className="relative mb-5">
                      {/* Pulsing background ring */}
                      <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
                      <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse" />

                      {/* Icon with bounce animation */}
                      <div className="relative w-18 h-18 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center" style={{ width: '72px', height: '72px' }}>
                        {(() => {
                          const CurrentIcon = BREWING_MESSAGES[brewingMessageIndex].icon
                          return (
                            <CurrentIcon
                              className="w-9 h-9 text-primary animate-bounce"
                              style={{ animationDuration: '1s' }}
                            />
                          )
                        })()}
                      </div>
                    </div>

                    {/* Message with smooth transition */}
                    <p className="text-lg font-medium text-foreground text-center px-6 transition-all duration-300">
                      {BREWING_MESSAGES[brewingMessageIndex].text}
                    </p>

                    {/* Continuous loading spinner */}
                    <div className="mt-5">
                      <Loader2 className="w-6 h-6 text-primary animate-spin" />
                    </div>
                  </div>
                )}

                <div className="text-center space-y-2 mb-4">
                  <h3 className="text-2xl font-semibold text-foreground">
                    Review Your Setup
                  </h3>
                  <p className="text-base text-muted-foreground">
                    Confirm your business details
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Business Details */}
                  <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                    <h4 className="text-base font-medium text-foreground">Business Details</h4>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-base">
                      <div>
                        <span className="text-muted-foreground">Name:</span>
                        <p className="font-medium text-foreground">{wizardData.businessName}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Type:</span>
                        <p className="font-medium text-foreground capitalize">
                          {wizardData.businessType === 'fnb' ? 'F&B' : wizardData.businessType}
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
                  <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                    <h4 className="text-base font-medium text-foreground">
                      COGS Categories ({wizardData.customCOGSNames?.length || 0})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {(wizardData.customCOGSNames || []).map((cat, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 bg-primary/10 text-primary text-base rounded"
                        >
                          {cat}
                        </span>
                      ))}
                      {(!wizardData.customCOGSNames || wizardData.customCOGSNames.length === 0) && (
                        <span className="text-muted-foreground text-base">
                          AI will generate defaults
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expense Categories */}
                  <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                    <h4 className="text-base font-medium text-foreground">
                      Expense Categories ({wizardData.customExpenseNames?.length || 0})
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {(wizardData.customExpenseNames || []).map((cat, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 bg-orange-500/10 text-orange-600 dark:text-orange-400 text-base rounded"
                        >
                          {cat}
                        </span>
                      ))}
                      {(!wizardData.customExpenseNames || wizardData.customExpenseNames.length === 0) && (
                        <span className="text-muted-foreground text-base">
                          AI will generate defaults
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Error Display */}
                {(error || submitError) && (
                  <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                    <p className="text-base text-destructive">{error || submitError}</p>
                  </div>
                )}

                {/* Spacer to push navigation to bottom */}
                <div className="flex-1" />

                {/* Navigation */}
                <div className="flex justify-between pt-3">
                  <Button variant="ghost" onClick={goToPreviousStep} disabled={isCreating}>
                    <ArrowLeft className="w-4 h-4 mr-1.5" />
                    Back
                  </Button>
                  <Button variant="primary" onClick={handleFinalSubmit} disabled={isCreating || isSubmitting}>
                    {isCreating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
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

  // Page mode: render directly, Modal mode: portal to escape sidebar's transform
  if (mode === 'page') return content
  return createPortal(content, document.body)
}

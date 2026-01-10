'use client'

/**
 * Business Creation Onboarding Wizard
 *
 * 5-step wizard for business onboarding:
 * 1. Business Details (name, country, currency)
 * 2. Business Type selection
 * 3. COGS Categories customization
 * 4. Expense Categories customization
 * 5. Review & Submit
 */

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import {
  Building2,
  ArrowLeft,
  Loader2,
  Check,
  Sparkles,
  Wand2,
  Rocket,
  Settings,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
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
  { text: 'Brewing your workspace magic...', icon: Sparkles },
  { text: 'Setting up your financial command center...', icon: Settings },
  { text: 'Configuring AI-powered features...', icon: Wand2 },
  { text: 'Almost there! Preparing your dashboard...', icon: Rocket },
]

export default function BusinessOnboarding() {
  const router = useRouter()
  const { isLoaded, isSignedIn } = useAuth()
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
  } = useOnboardingFlow()

  // Local state for step 1 form
  const [homeCurrency, setHomeCurrency] = useState('SGD')
  const [isMounted, setIsMounted] = useState(false)
  const [isCheckingExistingBusinesses, setIsCheckingExistingBusinesses] = useState(true)

  // Brewing animation state for Create Business button
  const [isCreating, setIsCreating] = useState(false)
  const [brewingMessageIndex, setBrewingMessageIndex] = useState(0)

  // Initialize currency from country
  useEffect(() => {
    setIsMounted(true)
  }, [])

  // AUTO-RECOVERY: Check if user has other businesses and switch to them
  // This handles the case where user's current business was deleted
  useEffect(() => {
    if (!isMounted || !isLoaded || !isSignedIn) return

    const checkExistingBusinesses = async () => {
      try {
        const response = await fetch('/api/v1/account-management/businesses')
        const result = await response.json()

        if (result.success && result.data?.businesses?.length > 0) {
          // User has existing businesses - switch to the first one
          const targetBusiness = result.data.businesses[0]
          console.log('[BusinessOnboarding] Found existing business, switching:', targetBusiness.name)

          // Switch to the existing business
          const switchResponse = await fetch('/api/v1/account-management/businesses/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ business_id: targetBusiness.id }),
          })

          if (switchResponse.ok) {
            // Refresh context and redirect to dashboard
            await refreshContext()
            await refreshMemberships()
            router.push('/en/expense-claims')
            return
          }
        }
      } catch (error) {
        console.error('[BusinessOnboarding] Error checking existing businesses:', error)
      } finally {
        setIsCheckingExistingBusinesses(false)
      }
    }

    checkExistingBusinesses()
  }, [isMounted, isLoaded, isSignedIn, router, refreshContext, refreshMemberships])

  useEffect(() => {
    if (isMounted && isLoaded && !isSignedIn) {
      router.push('/sign-in')
    }
  }, [isMounted, isLoaded, isSignedIn, router])

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

  // Loading state - also wait for existing business check
  if (!isMounted || !isLoaded || isCheckingExistingBusinesses) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>{isCheckingExistingBusinesses ? 'Checking account...' : 'Loading...'}</span>
        </div>
      </div>
    )
  }

  if (!isSignedIn) {
    return null
  }

  // Handle country selection and auto-set currency
  const handleCountryChange = (countryCode: string) => {
    updateWizardData({ countryCode })
    const currency = getCurrencyForCountry(countryCode)
    setHomeCurrency(currency)
  }

  // Final submission handler - creates business and starts trial if needed
  const handleFinalSubmit = async () => {
    setIsCreating(true)

    try {
      const selectedPlan = wizardData.selectedPlan || 'trial'

      // Step 1: Create business (synchronous call)
      console.log('[BusinessOnboarding] Creating business...')
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

      console.log('[BusinessOnboarding] Business created:', result.businessId)

      // Step 2: For trial users, start the trial subscription
      if (selectedPlan === 'trial') {
        console.log('[BusinessOnboarding] Starting trial subscription...')
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
          console.warn('[BusinessOnboarding] Trial start failed:', trialResult.error)
        } else {
          console.log('[BusinessOnboarding] Trial started successfully')
        }
      }

      // Step 3: Redirect to dashboard
      console.log('[BusinessOnboarding] Redirecting to dashboard...')
      router.push('/')
    } catch (err) {
      console.error('[BusinessOnboarding] Error:', err)
      setIsCreating(false)
      // Show error in UI via the hook's error state
      if (err instanceof Error) {
        // The error will be displayed via the error state from useOnboardingFlow
        console.error('[BusinessOnboarding] Submission error:', err.message)
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      style={{ margin: 0, padding: 0 }}
    >
      {/* Modal Container - Portrait oriented */}
      <div
        className="bg-card rounded-xl border border-border shadow-2xl overflow-hidden flex flex-col"
        style={{
          width: '90vw',
          height: '85vh',
          maxWidth: '580px',
          maxHeight: '750px'
        }}
      >
        {/* Modal Header - Compact */}
        <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-border bg-card">
          {/* Header */}
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center mb-2">
              <div className="p-1.5 bg-primary/10 rounded-lg">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
            </div>
            <h1 className="text-lg font-semibold text-foreground">
              Set Up Your Business
            </h1>
            <p className="text-muted-foreground text-xs">
              Complete these steps to get started
            </p>
          </div>

          {/* Progress Indicator - Compact */}
          <div className="w-full mt-3">
            {/* Progress bar */}
            <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${stepProgress}%` }}
              />
            </div>

            {/* Step indicators - Compact */}
            <div className="flex justify-between">
              {WIZARD_STEPS.map((step) => {
                const isActive = step.id === currentStep
                const isCompleted = step.id < currentStep

                return (
                  <div key={step.id} className="flex flex-col items-center">
                    <div
                      className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium transition-colors',
                        isActive &&
                          'bg-primary text-primary-foreground ring-2 ring-primary/30',
                        isCompleted && 'bg-green-500 text-white',
                        !isActive &&
                          !isCompleted &&
                          'bg-muted text-muted-foreground'
                      )}
                    >
                      {isCompleted ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        step.id
                      )}
                    </div>
                    <div className="text-center mt-0.5">
                      <div
                        className={cn(
                          'text-[10px] font-medium',
                          isActive && 'text-primary',
                          isCompleted && 'text-green-500',
                          !isActive && !isCompleted && 'text-muted-foreground'
                        )}
                      >
                        {step.label}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* Step 1: Business Details */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="text-center space-y-1 mb-4">
                  <h2 className="text-lg font-semibold text-foreground">
                    Business Details
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    Tell us about your business
                  </p>
                </div>

                {/* Business Name */}
                <div className="space-y-1.5">
                  <Label
                    htmlFor="businessName"
                    className="text-sm font-medium text-foreground"
                  >
                    Business Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="businessName"
                    type="text"
                    placeholder="e.g. Acme Trading Pte Ltd"
                    value={wizardData.businessName || ''}
                    onChange={(e) =>
                      updateWizardData({ businessName: e.target.value })
                    }
                    className="bg-input border-border text-foreground h-9"
                    required
                  />
                </div>

                {/* Country */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-foreground">
                    Country
                  </Label>
                  <Select
                    value={wizardData.countryCode || 'SG'}
                    onValueChange={handleCountryChange}
                  >
                    <SelectTrigger className="bg-input border-border text-foreground h-9">
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border max-h-[200px]">
                      {COUNTRIES.map((country) => (
                        <SelectItem
                          key={country.code}
                          value={country.code}
                          className="text-foreground focus:bg-muted text-sm"
                        >
                          {country.name} ({country.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Currency */}
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-foreground">
                    Home Currency
                  </Label>
                  <Select value={homeCurrency} onValueChange={setHomeCurrency}>
                    <SelectTrigger className="bg-input border-border text-foreground h-9">
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border max-h-[200px]">
                      {CURRENCIES.map((currency) => (
                        <SelectItem
                          key={currency.code}
                          value={currency.code}
                          className="text-foreground focus:bg-muted text-sm"
                        >
                          {currency.code} - {currency.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Navigation - No Back button on first step */}
                <div className="flex justify-end pt-4">
                  <Button
                    variant="primary"
                    size="sm"
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
                onChange={(categories) =>
                  updateWizardData({ customCOGSNames: categories })
                }
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
                onChange={(categories) =>
                  updateWizardData({ customExpenseNames: categories })
                }
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
              <div className="space-y-3 relative">
                {/* Brewing Animation Overlay */}
                {isCreating && (
                  <div className="absolute inset-0 bg-background/95 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-lg">
                    {/* Animated Icon Container */}
                    <div className="relative mb-4">
                      {/* Pulsing background ring */}
                      <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" style={{ animationDuration: '2s' }} />
                      <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse" />

                      {/* Icon with bounce animation */}
                      <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30 flex items-center justify-center">
                        {(() => {
                          const CurrentIcon = BREWING_MESSAGES[brewingMessageIndex].icon
                          return (
                            <CurrentIcon
                              className="w-7 h-7 text-primary animate-bounce"
                              style={{ animationDuration: '1s' }}
                            />
                          )
                        })()}
                      </div>
                    </div>

                    {/* Message with smooth transition */}
                    <p className="text-sm font-medium text-foreground text-center px-4 transition-all duration-300">
                      {BREWING_MESSAGES[brewingMessageIndex].text}
                    </p>

                    {/* Continuous loading spinner */}
                    <div className="mt-4">
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    </div>
                  </div>
                )}

                <div className="text-center space-y-1 mb-3">
                  <h2 className="text-lg font-semibold text-foreground">
                    Review Your Setup
                  </h2>
                  <p className="text-muted-foreground text-sm">
                    Confirm your business details
                  </p>
                </div>

                <div className="space-y-2">
                  {/* Business Details */}
                  <div className="p-3 bg-muted/50 rounded-md space-y-2">
                    <h3 className="text-sm font-medium text-foreground">
                      Business Details
                    </h3>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                      <div>
                        <span className="text-muted-foreground">Name:</span>
                        <p className="font-medium text-foreground">
                          {wizardData.businessName}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Type:</span>
                        <p className="font-medium text-foreground capitalize">
                          {wizardData.businessType === 'fnb'
                            ? 'F&B'
                            : wizardData.businessType}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Country:</span>
                        <p className="font-medium text-foreground">
                          {COUNTRIES.find((c) => c.code === wizardData.countryCode)?.name ||
                            wizardData.countryCode ||
                            'Singapore'}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Currency:</span>
                        <p className="font-medium text-foreground">
                          {homeCurrency}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* COGS Categories */}
                  <div className="p-3 bg-muted/50 rounded-md space-y-1.5">
                    <h3 className="text-sm font-medium text-foreground">
                      COGS Categories ({wizardData.customCOGSNames?.length || 0})
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {(wizardData.customCOGSNames || []).map((cat, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 bg-primary/10 text-primary text-xs rounded"
                        >
                          {cat}
                        </span>
                      ))}
                      {(!wizardData.customCOGSNames ||
                        wizardData.customCOGSNames.length === 0) && (
                        <span className="text-muted-foreground text-xs">
                          AI will generate defaults
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Expense Categories */}
                  <div className="p-3 bg-muted/50 rounded-md space-y-1.5">
                    <h3 className="text-sm font-medium text-foreground">
                      Expense Categories ({wizardData.customExpenseNames?.length || 0})
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      {(wizardData.customExpenseNames || []).map((cat, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 bg-orange-500/10 text-orange-600 dark:text-orange-400 text-xs rounded"
                        >
                          {cat}
                        </span>
                      ))}
                      {(!wizardData.customExpenseNames ||
                        wizardData.customExpenseNames.length === 0) && (
                        <span className="text-muted-foreground text-xs">
                          AI will generate defaults
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Error Display */}
                {error && (
                  <div className="p-2 bg-destructive/10 border border-destructive/30 rounded">
                    <p className="text-xs text-destructive">{error}</p>
                  </div>
                )}

                {/* Navigation */}
                <div className="flex justify-between pt-3">
                  <Button variant="ghost" size="sm" onClick={goToPreviousStep} disabled={isCreating}>
                    <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                    Back
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleFinalSubmit}
                    disabled={isCreating || isSubmitting}
                  >
                    {isCreating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                        Setting up...
                      </>
                    ) : (
                      'Create Business'
                    )}
                  </Button>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  )
}

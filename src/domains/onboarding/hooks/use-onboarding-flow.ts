'use client'

/**
 * useOnboardingFlow - Main business logic hook for onboarding wizard management
 *
 * Manages the 5-step onboarding wizard flow with state management, validation,
 * and business type defaults integration.
 *
 * Steps:
 * 1. Business Details (name, country, currency)
 * 2. Business Type selection
 * 3. COGS Categories (optional)
 * 4. Expense Categories (optional)
 * 5. Review & Submit
 */

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { OnboardingWizardData, BusinessType } from '@/domains/onboarding/types'
import { getSuggestedCategories } from '@/domains/onboarding/lib/business-type-defaults'
// BRN validation moved to activation/checkout — not needed in onboarding

// Hook return interface
export interface UseOnboardingFlowReturn {
  // Current state
  currentStep: number
  wizardData: Partial<OnboardingWizardData>
  isSubmitting: boolean
  error: string | null

  // Computed values
  canProceed: boolean
  isFirstStep: boolean
  isLastStep: boolean
  stepProgress: number

  // Navigation functions
  goToNextStep: () => void
  goToPreviousStep: () => void
  goToStep: (step: number) => void

  // Data management
  updateWizardData: (data: Partial<OnboardingWizardData>) => void
  resetWizard: () => void

  // Step-specific actions
  skipCurrentStep: () => void
  applyDefaults: (step: number) => void

  // Submission
  submitWizard: () => Promise<void>
}

// Total number of steps in the wizard
const TOTAL_STEPS = 5

// Initial wizard data
const INITIAL_WIZARD_DATA: Partial<OnboardingWizardData> = {
  businessName: '',
  businessType: undefined,
  countryCode: '',
  businessRegNumber: '',  // 019: Registration number for pricing lockdown
  customCOGSNames: [],
  customExpenseNames: [],
  selectedPlan: 'pro', // Default to Pro plan (14-day free trial)
}

/**
 * Onboarding wizard state management hook
 *
 * Provides comprehensive state management for the 5-step onboarding flow
 * with validation, navigation, and business type defaults integration.
 *
 * @example
 * ```typescript
 * const {
 *   currentStep,
 *   wizardData,
 *   canProceed,
 *   updateWizardData,
 *   goToNextStep,
 *   submitWizard
 * } = useOnboardingFlow()
 *
 * // Update business details
 * updateWizardData({
 *   businessName: "Acme Corp",
 *   businessType: "retail"
 * })
 *
 * // Navigate to next step
 * if (canProceed) {
 *   goToNextStep()
 * }
 * ```
 */
export function useOnboardingFlow(): UseOnboardingFlowReturn {
  const router = useRouter()

  // Core state
  const [currentStep, setCurrentStep] = useState(1)
  const [wizardData, setWizardData] = useState<Partial<OnboardingWizardData>>(INITIAL_WIZARD_DATA)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Validate current step to determine if user can proceed
   *
   * Step 1: Business name and type required
   * Step 2: Business type required (should already be set)
   * Steps 3-4: Optional (categories can be skipped)
   * Step 5: All previous data must be present
   */
  const validateCurrentStep = useCallback((): boolean => {
    switch (currentStep) {
      case 1: // Business Details (name, country, currency)
        // BRN not required at onboarding — collected at activation/checkout instead
        if (!wizardData.businessName?.trim()) return false
        return true

      case 2: // Business Type
        // For "other" type, require a description
        if (wizardData.businessType === 'other') {
          return !!wizardData.customTypeDescription?.trim()
        }
        return !!wizardData.businessType

      case 3: // COGS Categories (optional)
        return true

      case 4: // Expense Categories (optional)
        return true

      case 5: // Review
        return !!(
          wizardData.businessName?.trim() &&
          wizardData.businessType &&
          wizardData.countryCode &&
          wizardData.selectedPlan
        )

      default:
        return false
    }
  }, [currentStep, wizardData])

  // Computed values
  const canProceed = validateCurrentStep()
  const isFirstStep = currentStep === 1
  const isLastStep = currentStep === TOTAL_STEPS
  const stepProgress = (currentStep / TOTAL_STEPS) * 100

  /**
   * Navigate to next step
   * Only proceeds if current step validation passes
   */
  const goToNextStep = useCallback(() => {
    if (!canProceed) {
      setError('Please complete all required fields before proceeding')
      return
    }

    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(prev => prev + 1)
      setError(null)
    }
  }, [currentStep, canProceed])

  /**
   * Navigate to previous step
   */
  const goToPreviousStep = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1)
      setError(null)
    }
  }, [currentStep])

  /**
   * Jump to specific step
   *
   * @param step - Target step number (1-5)
   */
  const goToStep = useCallback((step: number) => {
    if (step >= 1 && step <= TOTAL_STEPS) {
      setCurrentStep(step)
      setError(null)
    }
  }, [])

  /**
   * Update wizard data with partial updates
   * Auto-applies business type suggestions when business type changes
   *
   * @param data - Partial wizard data to merge
   */
  const updateWizardData = useCallback((data: Partial<OnboardingWizardData>) => {
    setWizardData(prev => {
      const updated = { ...prev, ...data }

      // Auto-suggest categories when business type changes - ALWAYS update for real-time reactivity
      if (data.businessType && data.businessType !== prev.businessType) {
        const cogsSuggestions = getSuggestedCategories(data.businessType, 'cogs')
        const expenseSuggestions = getSuggestedCategories(data.businessType, 'expense')

        // Always update categories to match the new business type
        updated.customCOGSNames = [...cogsSuggestions] as readonly string[]
        updated.customExpenseNames = [...expenseSuggestions] as readonly string[]
      }

      return updated
    })
    setError(null)
  }, [])

  /**
   * Apply business type defaults for a specific step
   * Used when user clicks "Use Defaults" or "Skip" buttons
   *
   * @param step - Step number to apply defaults for
   */
  const applyDefaults = useCallback((step: number) => {
    if (!wizardData.businessType) {
      setError('Please select a business type first')
      return
    }

    switch (step) {
      case 3: // COGS Categories
        setWizardData(prev => ({
          ...prev,
          customCOGSNames: [
            ...getSuggestedCategories(wizardData.businessType!, 'cogs')
          ] as readonly string[]
        }))
        break

      case 4: // Expense Categories
        setWizardData(prev => ({
          ...prev,
          customExpenseNames: [
            ...getSuggestedCategories(wizardData.businessType!, 'expense')
          ] as readonly string[]
        }))
        break

      default:
        console.warn(`No defaults available for step ${step}`)
        return
    }

    setError(null)
  }, [wizardData.businessType])

  /**
   * Skip current step and apply defaults if applicable
   * Moves to next step automatically
   */
  const skipCurrentStep = useCallback(() => {
    // Apply defaults for category steps (3 and 4)
    if (currentStep === 3 || currentStep === 4) {
      applyDefaults(currentStep)
    }

    // Move to next step
    if (currentStep < TOTAL_STEPS) {
      setCurrentStep(prev => prev + 1)
      setError(null)
    }
  }, [currentStep, applyDefaults])

  /**
   * Reset wizard to initial state
   * Clears all data and returns to step 1
   */
  const resetWizard = useCallback(() => {
    setCurrentStep(1)
    setWizardData(INITIAL_WIZARD_DATA)
    setIsSubmitting(false)
    setError(null)
  }, [])

  /**
   * Submit final wizard data
   *
   * Note: This is a placeholder validation function. The actual submission logic
   * is implemented directly in the business setup page (handleFinalSubmit) which
   * calls POST /api/v1/onboarding/initialize-business and handles the full flow.
   *
   * This method validates the wizard data and sets submission state flags that
   * can be used by the consuming component.
   *
   * @throws Error if validation fails
   */
  const submitWizard = useCallback(async () => {
    // Final validation
    if (!canProceed) {
      setError('Please complete all required fields')
      return
    }

    try {
      setIsSubmitting(true)
      setError(null)

      console.log('[useOnboardingFlow] Wizard data validated:', wizardData)

      // Note: Actual API submission is handled by the business setup page.
      // This hook provides state management and validation only.

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to validate onboarding data'
      setError(message)
      console.error('[useOnboardingFlow] Validation error:', message)
    } finally {
      setIsSubmitting(false)
    }
  }, [wizardData, canProceed])

  return {
    // Current state
    currentStep,
    wizardData,
    isSubmitting,
    error,

    // Computed values
    canProceed,
    isFirstStep,
    isLastStep,
    stepProgress,

    // Navigation functions
    goToNextStep,
    goToPreviousStep,
    goToStep,

    // Data management
    updateWizardData,
    resetWizard,

    // Step-specific actions
    skipCurrentStep,
    applyDefaults,

    // Submission
    submitWizard,
  }
}

// Named export for convenience
export default useOnboardingFlow

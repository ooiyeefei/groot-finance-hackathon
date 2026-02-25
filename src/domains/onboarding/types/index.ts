/**
 * Onboarding Domain Types
 *
 * Type definitions for the business onboarding and plan selection flow.
 * Based on API contracts: specs/001-onboarding-plan-selection/contracts/api-contracts.md
 */

import { PlanName } from '@/lib/stripe/plans'

/**
 * Business types supported by Groot Finance
 * Used to provide industry-specific category suggestions and defaults
 */
export type BusinessType =
  | 'fnb'           // Food & Beverage
  | 'retail'        // Retail/E-commerce
  | 'services'      // Professional Services
  | 'manufacturing' // Manufacturing
  | 'other'         // Other/General

/**
 * Onboarding wizard data collected during the 5-step flow
 * This represents the complete state of user input during onboarding
 */
export interface OnboardingWizardData {
  // Step 1: Business Details
  readonly businessName: string
  readonly businessType: BusinessType
  readonly customTypeDescription?: string  // Required when businessType is 'other'
  readonly countryCode: string

  // Step 2-3: Custom Category Names (optional)
  readonly customCOGSNames?: readonly string[]     // Max 20 items
  readonly customExpenseNames?: readonly string[]  // Max 20 items

  // Step 4: Plan Selection
  readonly selectedPlan: PlanName

  // Step 5: Payment (for paid plans)
  readonly stripeCustomerId?: string
  readonly stripeSubscriptionId?: string
}

/**
 * Current state of the onboarding process
 * Used to track user progress through the wizard
 */
export interface OnboardingState {
  readonly status: 'not_started' | 'in_progress' | 'completed'
  readonly currentStep: number        // 1-5
  readonly totalSteps: number         // Always 5
  readonly wizardData: Partial<OnboardingWizardData>
  readonly completedAt?: string       // ISO timestamp
}

/**
 * Request payload for POST /api/v1/onboarding/initialize-business
 * Creates a new business for a user completing onboarding
 */
export interface InitializeBusinessPayload {
  // Business details (all optional with defaults)
  businessName?: string        // Default: "{user.full_name}'s Business"
  businessType?: BusinessType  // Default: 'other'
  countryCode?: string         // Default: 'SG' or from IP geolocation

  // Custom categories (optional, max 20 items each)
  customCOGSNames?: string[]
  customExpenseNames?: string[]

  // Plan selection (required)
  planName: PlanName

  // Stripe IDs (for paid plans only)
  stripeCustomerId?: string
  stripeSubscriptionId?: string
}

/**
 * Response from POST /api/v1/onboarding/initialize-business
 * Returns business ID and task ID for status polling
 */
export interface InitializeBusinessResult {
  readonly success: true
  readonly data: {
    readonly businessId: string        // UUID of created business
    readonly taskId: string            // Trigger.dev task ID for status polling
    readonly status: 'initializing'
    readonly estimatedCompletionMs: number  // ~5000-10000ms
  }
}

/**
 * Business initialization status while processing
 * Returned by GET /api/v1/onboarding/status?taskId={taskId}
 */
export interface InitializationStatusInProgress {
  readonly success: true
  readonly data: {
    readonly status: 'initializing' | 'generating_categories'
    readonly progress: number       // 0-100
    readonly message: string        // e.g., "Configuring categories..."
    readonly businessId: string
  }
}

/**
 * Business initialization completed successfully
 * Returned by GET /api/v1/onboarding/status?taskId={taskId}
 */
export interface InitializationStatusCompleted {
  readonly success: true
  readonly data: {
    readonly status: 'completed'
    readonly progress: 100
    readonly businessId: string
    readonly onboardingCompletedAt: string  // ISO timestamp
    readonly categoriesGenerated: {
      readonly cogs: number
      readonly expense: number
    }
    readonly redirectUrl: string  // Dashboard URL
  }
}

/**
 * Business initialization failed
 * Returned by GET /api/v1/onboarding/status?taskId={taskId}
 */
export interface InitializationStatusFailed {
  readonly success: true
  readonly data: {
    readonly status: 'failed'
    readonly error: string
    readonly businessId: string
    readonly canRetry: boolean
  }
}

/**
 * Union type for all possible initialization status responses
 */
export type InitializationStatusResponse =
  | InitializationStatusInProgress
  | InitializationStatusCompleted
  | InitializationStatusFailed

/**
 * Error response structure for validation failures
 * Returned when request body validation fails (400 Bad Request)
 */
export interface OnboardingErrorResponse {
  readonly success: false
  readonly error: string
  readonly details?: Record<string, string[]>  // Zod validation errors
}

/**
 * Request payload for POST /api/v1/billing/checkout
 * Creates a Stripe Checkout session for paid plan selection
 */
export interface CreateCheckoutRequest {
  readonly planName: Exclude<PlanName, 'trial'>  // 'starter' | 'pro' | 'enterprise'
  readonly successUrl: string   // Redirect after successful payment
  readonly cancelUrl: string    // Redirect if user cancels

  // Optional business data to pass through
  readonly businessSetup?: {
    readonly businessName?: string
    readonly businessType?: BusinessType
    readonly countryCode?: string
  }
}

/**
 * Response from POST /api/v1/billing/checkout
 * Contains Stripe Checkout URL for payment
 */
export interface CheckoutResponse {
  readonly success: true
  readonly data: {
    readonly checkoutUrl: string        // Stripe Checkout URL
    readonly sessionId: string          // Stripe session ID
    readonly customerId: string         // Stripe customer ID (created or existing)
  }
}

/**
 * Request payload for POST /api/v1/onboarding/generate-categories
 * Triggers AI generation for custom category names
 */
export interface GenerateCategoriesRequest {
  readonly businessId: string
  readonly businessType: BusinessType
  readonly categoryType: 'cogs' | 'expense'
  readonly categoryNames: readonly string[]  // User-provided names to enhance
}

/**
 * Response from POST /api/v1/onboarding/generate-categories
 * Returns task ID for polling generation status
 */
export interface GenerateCategoriesResponse {
  readonly success: true
  readonly data: {
    readonly taskId: string
    readonly categoryCount: number
  }
}

/**
 * Business type suggestion with category recommendations
 * Returned by GET /api/v1/onboarding/defaults
 */
export interface BusinessTypeSuggestion {
  readonly value: BusinessType
  readonly label: string
  readonly suggestedCOGS: readonly string[]
  readonly suggestedExpenses: readonly string[]
}

/**
 * Supported country with currency information
 * Returned by GET /api/v1/onboarding/defaults
 */
export interface SupportedCountry {
  readonly code: string      // ISO 3166-1 alpha-2
  readonly name: string
  readonly currency: string  // ISO 4217 currency code
}

/**
 * Response from GET /api/v1/onboarding/defaults
 * Provides default values and suggestions for business setup
 */
export interface OnboardingDefaultsResponse {
  readonly success: true
  readonly data: {
    readonly suggestedBusinessName: string  // "{user.full_name}'s Business"
    readonly detectedCountry: string        // From IP geolocation
    readonly detectedCurrency: string       // Based on country
    readonly businessTypes: readonly BusinessTypeSuggestion[]
    readonly supportedCountries: readonly SupportedCountry[]
  }
}

/**
 * Trial status information
 * Returned by GET /api/v1/onboarding/trial-status
 */
export interface TrialStatusResponse {
  readonly success: true
  readonly data: {
    readonly isOnTrial: boolean
    readonly daysRemaining: number
    readonly isExpired: boolean
    readonly shouldShowWarning: boolean
    readonly trialEndDate: string | null  // ISO timestamp
    readonly currentPlan: PlanName
    readonly upgradeUrl: string
  }
}

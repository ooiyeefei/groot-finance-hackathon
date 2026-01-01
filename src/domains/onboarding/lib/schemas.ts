import { z } from 'zod'

/**
 * Business Type Enum - Context for AI category generation
 */
export const businessTypeSchema = z.enum([
  'fnb',           // Food & Beverage
  'cpg_retail',    // CPG / Retail
  'services',      // Services Company
  'manufacturing', // Manufacturing
  'professional',  // Professional Services
  'other'          // General Business
], {
  errorMap: () => ({ message: 'Invalid business type. Must be one of: fnb, cpg_retail, services, manufacturing, professional, or other' })
})

/**
 * Plan Name Enum - Available subscription plans
 */
export const planNameSchema = z.enum([
  'trial',
  'starter',
  'pro',
  'enterprise'
], {
  errorMap: () => ({ message: 'Invalid plan name. Must be one of: trial, starter, pro, or enterprise' })
})

/**
 * Country Code Enum - Supported Southeast Asian countries
 */
export const countryCodeSchema = z.enum([
  'SG', // Singapore
  'MY', // Malaysia
  'TH', // Thailand
  'ID', // Indonesia
  'VN', // Vietnam
  'PH'  // Philippines
], {
  errorMap: () => ({ message: 'Invalid country code. Must be one of: SG, MY, TH, ID, VN, or PH' })
})

/**
 * Category Type Enum - For category generation
 */
export const categoryTypeSchema = z.enum(['cogs', 'expense'], {
  errorMap: () => ({ message: 'Invalid category type. Must be either "cogs" or "expense"' })
})

/**
 * Initialize Business Request Schema
 * Validates the request body for POST /api/v1/onboarding/initialize-business
 */
export const initializeBusinessSchema = z.object({
  // Business details (all optional with defaults)
  businessName: z
    .string()
    .min(1, 'Business name cannot be empty')
    .max(100, 'Business name must be 100 characters or less')
    .optional(),

  businessType: z
    .union([businessTypeSchema, z.undefined()])
    .default('other'),

  countryCode: z
    .union([countryCodeSchema, z.undefined()])
    .default('SG'),

  // Custom categories (optional, max 20 items each)
  customCOGSNames: z
    .array(
      z.string()
        .min(1, 'COGS category name cannot be empty')
        .max(50, 'COGS category name must be 50 characters or less')
    )
    .max(20, 'Cannot have more than 20 custom COGS categories')
    .default([]),

  customExpenseNames: z
    .array(
      z.string()
        .min(1, 'Expense category name cannot be empty')
        .max(50, 'Expense category name must be 50 characters or less')
    )
    .max(20, 'Cannot have more than 20 custom expense categories')
    .default([]),

  // Plan selection (required)
  planName: planNameSchema,

  // Stripe IDs (for paid plans only)
  stripeCustomerId: z
    .string()
    .startsWith('cus_', 'Stripe customer ID must start with "cus_"')
    .optional(),

  stripeSubscriptionId: z
    .string()
    .startsWith('sub_', 'Stripe subscription ID must start with "sub_"')
    .optional()
}).strict() // Disallow additional properties

/**
 * Onboarding Wizard Data Schema
 * Validates the wizard form data collected across steps
 */
export const onboardingWizardDataSchema = z.object({
  // Step 1: Business Name (optional, will use default if not provided)
  businessName: z
    .string()
    .min(1, 'Business name cannot be empty')
    .max(100, 'Business name must be 100 characters or less')
    .optional(),

  // Step 2: Business Type
  businessType: z
    .union([businessTypeSchema, z.undefined()])
    .default('other'),

  // Step 3: Location/Country
  countryCode: z
    .union([countryCodeSchema, z.undefined()])
    .default('SG'),

  // Step 4: Custom COGS Categories
  customCOGSNames: z
    .array(
      z.string()
        .min(1, 'COGS category name cannot be empty')
        .max(50, 'COGS category name must be 50 characters or less')
    )
    .max(20, 'Cannot have more than 20 custom COGS categories')
    .default([]),

  // Step 5: Custom Expense Categories
  customExpenseNames: z
    .array(
      z.string()
        .min(1, 'Expense category name cannot be empty')
        .max(50, 'Expense category name must be 50 characters or less')
    )
    .max(20, 'Cannot have more than 20 custom expense categories')
    .default([]),

  // Step 6: Plan Selection
  selectedPlan: planNameSchema,

  // Stripe data (populated after checkout for paid plans)
  stripeCustomerId: z
    .string()
    .startsWith('cus_', 'Stripe customer ID must start with "cus_"')
    .optional(),

  stripeSubscriptionId: z
    .string()
    .startsWith('sub_', 'Stripe subscription ID must start with "sub_"')
    .optional()
}).strict()

/**
 * Generate Categories Request Schema
 * Validates the request body for POST /api/v1/onboarding/generate-categories
 */
export const generateCategoriesSchema = z.object({
  businessId: z
    .string()
    .uuid('Business ID must be a valid UUID'),

  businessType: businessTypeSchema,

  categoryType: categoryTypeSchema,

  categoryNames: z
    .array(
      z.string()
        .min(1, 'Category name cannot be empty')
        .max(50, 'Category name must be 50 characters or less')
    )
    .min(1, 'At least one category name is required')
    .max(20, 'Cannot generate more than 20 categories at once')
}).strict()

/**
 * Type exports - Inferred from schemas
 */
export type BusinessType = z.infer<typeof businessTypeSchema>
export type PlanName = z.infer<typeof planNameSchema>
export type CountryCode = z.infer<typeof countryCodeSchema>
export type CategoryType = z.infer<typeof categoryTypeSchema>
export type InitializeBusinessRequest = z.infer<typeof initializeBusinessSchema>
export type OnboardingWizardData = z.infer<typeof onboardingWizardDataSchema>
export type GenerateCategoriesRequest = z.infer<typeof generateCategoriesSchema>

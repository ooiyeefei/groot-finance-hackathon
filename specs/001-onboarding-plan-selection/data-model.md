# Data Model: Onboarding & Plan Selection Flow

**Feature**: 001-onboarding-plan-selection
**Date**: 2025-12-29
**Status**: Complete

## Overview

This document defines the data models, types, and database schema changes required for the onboarding and plan selection feature.

## 1. TypeScript Types

### Plan Types

```typescript
// src/lib/stripe/plans.ts

export type PlanName = 'trial' | 'starter' | 'pro' | 'enterprise'

export interface PlanConfig {
  name: string
  displayName: string
  stripePriceId: string | null  // null for trial
  teamLimit: number             // -1 for unlimited
  ocrLimit: number              // -1 for unlimited
  features: string[]
  isDefault?: boolean
}

export const PLANS: Record<PlanName, PlanConfig> = {
  trial: {
    name: 'trial',
    displayName: '14-Day Free Trial',
    stripePriceId: null,
    teamLimit: 3,
    ocrLimit: 100,  // Pro-level during trial
    features: [
      'Full Pro features for 14 days',
      'No credit card required',
      '3 team members',
      '100 OCR scans/month',
    ],
    isDefault: true,
  },
  starter: {
    name: 'starter',
    displayName: 'Starter',
    stripePriceId: process.env.STRIPE_STARTER_PRICE_ID ?? null,
    teamLimit: 3,
    ocrLimit: 50,
    features: [
      'Full data access',
      'Basic reports',
      '50 OCR scans/month',
      '3 team members',
      'Email support',
    ],
  },
  pro: {
    name: 'pro',
    displayName: 'Pro',
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
    teamLimit: 13,
    ocrLimit: 100,
    features: [
      'Everything in Starter',
      'Advanced reports & analytics',
      '100 OCR scans/month',
      '13 team members',
      'Priority support',
      'Usage credits',
    ],
  },
  enterprise: {
    name: 'enterprise',
    displayName: 'Enterprise',
    stripePriceId: process.env.STRIPE_ENTERPRISE_PRICE_ID ?? null,
    teamLimit: -1,  // Unlimited
    ocrLimit: -1,   // Unlimited
    features: [
      'Everything in Pro',
      'Unlimited OCR scans',
      'Unlimited team members',
      'API access',
      'Custom branding',
      'Dedicated support',
    ],
  },
}
```

### Onboarding Types

```typescript
// src/domains/onboarding/types/index.ts

export type BusinessType =
  | 'fnb'           // Food & Beverage
  | 'cpg_retail'    // CPG / Retail
  | 'services'      // Services Company
  | 'manufacturing' // Manufacturing
  | 'professional'  // Professional Services
  | 'other'         // General Business

export interface OnboardingWizardData {
  // Step 1: Business Name (optional)
  businessName?: string

  // Step 2: Business Type (optional)
  businessType?: BusinessType

  // Step 3: Country (optional)
  countryCode?: string
  homeCurrency?: string  // Inferred from country

  // Step 4: Custom COGS Categories (optional)
  customCOGSNames?: string[]

  // Step 5: Custom Expense Categories (optional)
  customExpenseNames?: string[]
}

export interface OnboardingState {
  currentStep: 1 | 2 | 3 | 4 | 5 | 'complete'
  wizardData: OnboardingWizardData
  selectedPlan: PlanName
  isTrialSelected: boolean
}

export interface InitializeBusinessPayload {
  userId: string
  businessName: string
  businessType: BusinessType
  countryCode: string
  homeCurrency: string
  customCOGSNames: string[]
  customExpenseNames: string[]
  planName: PlanName
  stripeCustomerId?: string
  stripeSubscriptionId?: string
}

export interface InitializeBusinessResult {
  success: boolean
  businessId: string
  cogsCategories: number
  expenseCategories: number
  onboardingCompletedAt: string
}
```

### Category Types

```typescript
// src/domains/onboarding/types/categories.ts

// Matches existing DefaultCOGSCategory interface
export interface COGSCategory {
  id: string
  category_name: string
  category_code: string
  description: string
  cost_type: 'direct' | 'indirect'
  is_active: boolean
  ai_keywords: string[]
  vendor_patterns: string[]
  sort_order: number
  created_at: string
  updated_at: string
}

// Matches existing DefaultExpenseCategory interface
export interface ExpenseCategory {
  id: string
  category_name: string
  category_code: string
  description: string
  is_active: boolean
  is_default: boolean
  sort_order: number
  ai_keywords: string[]
  vendor_patterns: string[]
  tax_treatment: 'deductible' | 'non_deductible' | 'partial'
  requires_receipt: boolean
  receipt_threshold: number | null
  policy_limit: number | null
  requires_manager_approval: boolean
  created_at: string
  updated_at: string
}

export interface AIGeneratedCategory {
  category_name: string
  category_code: string
  description: string
  ai_keywords: string[]
  vendor_patterns: string[]
}
```

## 2. Database Schema Changes

### Migration: Add Trial and Onboarding Fields

```sql
-- Migration: 20251229_add_onboarding_fields.sql

-- Add business_type for AI category context
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS business_type text DEFAULT 'other';

-- Add trial tracking
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS trial_start_date timestamptz;

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS trial_end_date timestamptz;

-- Add onboarding completion tracking
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Update plan_name constraint to include 'trial' and 'starter'
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_plan_name_check;
ALTER TABLE businesses ADD CONSTRAINT businesses_plan_name_check
  CHECK (plan_name = ANY (ARRAY['trial'::text, 'starter'::text, 'pro'::text, 'enterprise'::text]));

-- Update subscription_status to include 'expired'
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_subscription_status_check;
ALTER TABLE businesses ADD CONSTRAINT businesses_subscription_status_check
  CHECK (subscription_status = ANY (ARRAY[
    'active'::text,
    'canceled'::text,
    'incomplete'::text,
    'incomplete_expired'::text,
    'past_due'::text,
    'paused'::text,
    'trialing'::text,
    'unpaid'::text,
    'expired'::text
  ]));

-- Add index for trial expiration queries
CREATE INDEX IF NOT EXISTS idx_businesses_trial_end_date
ON businesses (trial_end_date)
WHERE trial_end_date IS NOT NULL;

-- Add index for onboarding status queries
CREATE INDEX IF NOT EXISTS idx_businesses_onboarding_completed
ON businesses (onboarding_completed_at)
WHERE onboarding_completed_at IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN businesses.business_type IS 'Business type for AI category generation context: fnb, cpg_retail, services, manufacturing, professional, other';
COMMENT ON COLUMN businesses.trial_start_date IS 'When 14-day free trial started. NULL for non-trial users.';
COMMENT ON COLUMN businesses.trial_end_date IS 'When trial expires (start + 14 days). NULL for non-trial users.';
COMMENT ON COLUMN businesses.onboarding_completed_at IS 'When user completed the onboarding wizard. NULL means onboarding incomplete.';
```

### Updated Business Table Schema

After migration, the `businesses` table will have:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| id | uuid | gen_random_uuid() | Primary key |
| name | text | - | Business name |
| slug | text | - | URL-friendly identifier |
| country_code | text | 'SG' | ISO country code |
| home_currency | text | 'SGD' | Functional currency |
| business_type | text | 'other' | **NEW**: Type for AI context |
| owner_id | uuid | - | Business owner user ID |
| custom_cogs_categories | jsonb | '[]' | COGS category array |
| custom_expense_categories | jsonb | '[]' | Expense category array |
| stripe_customer_id | text | - | Stripe customer ID |
| stripe_subscription_id | text | - | Active subscription ID |
| stripe_product_id | text | - | Subscribed product ID |
| plan_name | text | 'trial' | **UPDATED**: trial/starter/pro/enterprise |
| subscription_status | text | 'active' | **UPDATED**: includes 'expired' |
| trial_start_date | timestamptz | - | **NEW**: Trial start |
| trial_end_date | timestamptz | - | **NEW**: Trial expiration |
| onboarding_completed_at | timestamptz | - | **NEW**: Wizard completion |
| created_at | timestamp | now() | Record creation |
| updated_at | timestamp | now() | Last update |

## 3. Zod Validation Schemas

```typescript
// src/domains/onboarding/lib/schemas.ts

import { z } from 'zod'

export const businessTypeSchema = z.enum([
  'fnb',
  'cpg_retail',
  'services',
  'manufacturing',
  'professional',
  'other'
])

export const planNameSchema = z.enum(['trial', 'starter', 'pro', 'enterprise'])

export const countryCodeSchema = z.enum([
  'SG', 'MY', 'TH', 'ID', 'VN', 'PH', 'US', 'OTHER'
])

export const onboardingWizardSchema = z.object({
  businessName: z.string().min(1).max(100).optional(),
  businessType: businessTypeSchema.optional(),
  countryCode: countryCodeSchema.optional(),
  customCOGSNames: z.array(z.string().min(1).max(50)).max(20).optional(),
  customExpenseNames: z.array(z.string().min(1).max(50)).max(20).optional(),
})

export const initializeBusinessSchema = z.object({
  businessName: z.string().min(1).max(100),
  businessType: businessTypeSchema.default('other'),
  countryCode: countryCodeSchema.default('SG'),
  customCOGSNames: z.array(z.string()).default([]),
  customExpenseNames: z.array(z.string()).default([]),
  planName: planNameSchema,
  stripeCustomerId: z.string().optional(),
  stripeSubscriptionId: z.string().optional(),
})

export type OnboardingWizardInput = z.infer<typeof onboardingWizardSchema>
export type InitializeBusinessInput = z.infer<typeof initializeBusinessSchema>
```

## 4. Country to Currency Mapping

```typescript
// src/domains/onboarding/lib/currency-mapping.ts

export const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  SG: 'SGD',  // Singapore
  MY: 'MYR',  // Malaysia
  TH: 'THB',  // Thailand
  ID: 'IDR',  // Indonesia
  VN: 'VND',  // Vietnam
  PH: 'PHP',  // Philippines
  US: 'USD',  // United States
  OTHER: 'USD', // Default
}

export function getCurrencyFromCountry(countryCode: string): string {
  return COUNTRY_CURRENCY_MAP[countryCode] ?? 'USD'
}

export const SUPPORTED_COUNTRIES = [
  { code: 'SG', name: 'Singapore', currency: 'SGD' },
  { code: 'MY', name: 'Malaysia', currency: 'MYR' },
  { code: 'TH', name: 'Thailand', currency: 'THB' },
  { code: 'ID', name: 'Indonesia', currency: 'IDR' },
  { code: 'VN', name: 'Vietnam', currency: 'VND' },
  { code: 'PH', name: 'Philippines', currency: 'PHP' },
  { code: 'US', name: 'United States', currency: 'USD' },
]
```

## 5. Business Type Defaults

```typescript
// src/domains/onboarding/lib/business-type-defaults.ts

export const BUSINESS_TYPE_CONFIG: Record<BusinessType, {
  displayName: string
  suggestedCOGS: string[]
  suggestedExpenses: string[]
}> = {
  fnb: {
    displayName: 'Food & Beverage',
    suggestedCOGS: ['Ingredients', 'Kitchen Equipment', 'Food Packaging', 'Beverages'],
    suggestedExpenses: ['Kitchen Supplies', 'Food Delivery', 'Health Permits'],
  },
  cpg_retail: {
    displayName: 'CPG / Retail',
    suggestedCOGS: ['Inventory', 'Packaging', 'Store Supplies', 'Merchandise'],
    suggestedExpenses: ['Store Rent', 'Point of Sale', 'Inventory Software'],
  },
  services: {
    displayName: 'Services Company',
    suggestedCOGS: ['Professional Fees', 'Contractors', 'Software Licenses'],
    suggestedExpenses: ['Software Subscriptions', 'Professional Development', 'Client Hosting'],
  },
  manufacturing: {
    displayName: 'Manufacturing',
    suggestedCOGS: ['Raw Materials', 'Machinery Parts', 'Production Labor', 'Quality Control'],
    suggestedExpenses: ['Equipment Maintenance', 'Safety Supplies', 'Factory Utilities'],
  },
  professional: {
    displayName: 'Professional Services',
    suggestedCOGS: ['Consulting Tools', 'Research Materials', 'Expert Fees'],
    suggestedExpenses: ['Professional Insurance', 'Continuing Education', 'Client Entertainment'],
  },
  other: {
    displayName: 'General Business',
    suggestedCOGS: [],  // Use platform defaults
    suggestedExpenses: [],  // Use platform defaults
  },
}
```

## 6. Team Limits

```typescript
// src/domains/onboarding/lib/team-limits.ts

import { PlanName, PLANS } from '@/lib/stripe/plans'

export function getTeamLimit(planName: PlanName): number {
  return PLANS[planName].teamLimit
}

export function canAddTeamMember(
  planName: PlanName,
  currentMemberCount: number
): boolean {
  const limit = getTeamLimit(planName)
  if (limit === -1) return true // Unlimited
  return currentMemberCount < limit
}

export function getRemainingSeats(
  planName: PlanName,
  currentMemberCount: number
): number | 'unlimited' {
  const limit = getTeamLimit(planName)
  if (limit === -1) return 'unlimited'
  return Math.max(0, limit - currentMemberCount)
}
```

## 7. Trial Management

```typescript
// src/domains/onboarding/lib/trial-management.ts

const TRIAL_DURATION_DAYS = 14
const TRIAL_WARNING_DAYS = 3

export function calculateTrialEndDate(startDate: Date = new Date()): Date {
  const endDate = new Date(startDate)
  endDate.setDate(endDate.getDate() + TRIAL_DURATION_DAYS)
  return endDate
}

export function getTrialDaysRemaining(trialEndDate: Date): number {
  const now = new Date()
  const diffTime = trialEndDate.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return Math.max(0, diffDays)
}

export function isTrialExpired(trialEndDate: Date | null): boolean {
  if (!trialEndDate) return false
  return new Date() > new Date(trialEndDate)
}

export function shouldShowTrialWarning(trialEndDate: Date | null): boolean {
  if (!trialEndDate) return false
  const daysRemaining = getTrialDaysRemaining(trialEndDate)
  return daysRemaining <= TRIAL_WARNING_DAYS && daysRemaining > 0
}

export interface TrialStatus {
  isOnTrial: boolean
  daysRemaining: number
  isExpired: boolean
  shouldShowWarning: boolean
  trialEndDate: Date | null
}

export function getTrialStatus(
  planName: string,
  trialEndDate: Date | null
): TrialStatus {
  const isOnTrial = planName === 'trial' && trialEndDate !== null

  return {
    isOnTrial,
    daysRemaining: trialEndDate ? getTrialDaysRemaining(trialEndDate) : 0,
    isExpired: isTrialExpired(trialEndDate),
    shouldShowWarning: shouldShowTrialWarning(trialEndDate),
    trialEndDate,
  }
}
```

## 8. Entity Relationships

```
┌─────────────────┐       ┌─────────────────────┐
│     users       │       │     businesses      │
├─────────────────┤       ├─────────────────────┤
│ id (PK)         │───┐   │ id (PK)             │
│ clerk_user_id   │   │   │ name                │
│ email           │   │   │ business_type       │◄─── NEW
│ business_id (FK)│───┼──►│ owner_id (FK)       │
│ ...             │   │   │ plan_name           │◄─── UPDATED
└─────────────────┘   │   │ trial_start_date    │◄─── NEW
                      │   │ trial_end_date      │◄─── NEW
                      │   │ onboarding_completed│◄─── NEW
                      │   │ custom_cogs_categories│
                      │   │ custom_expense_categories│
                      │   │ stripe_customer_id  │
                      │   │ stripe_subscription_id│
                      │   └─────────────────────┘
                      │              │
                      │              ▼
                      │   ┌─────────────────────┐
                      └──►│business_memberships │
                          ├─────────────────────┤
                          │ id (PK)             │
                          │ user_id (FK)        │
                          │ business_id (FK)    │
                          │ role                │
                          │ status              │
                          └─────────────────────┘
```

## 9. API Request/Response Types

See `contracts/` directory for detailed API specifications.

## References

- Plan configuration: `src/lib/stripe/plans.ts`
- COGS categories: `src/domains/invoices/lib/default-cogs-categories.ts`
- Expense categories: `src/domains/expense-claims/lib/default-expense-categories.ts`
- Spec requirements: `/specs/001-onboarding-plan-selection/spec.md`

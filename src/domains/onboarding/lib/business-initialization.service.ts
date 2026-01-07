/**
 * Business Initialization Service
 *
 * Creates business entity with AI-generated categories during user onboarding.
 * Handles: business creation, owner membership, user linking
 *
 * Note: Trial/Stripe subscription is handled separately by /api/v1/onboarding/start-trial
 *
 * ✅ MIGRATED TO CONVEX (2025-01)
 */

import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import {
  generateCategoryMetadata,
  type CategoryMetadata
} from './ai-category-generator';
import {
  getSuggestedCategories,
  type BusinessType
} from './business-type-defaults';

// Type definitions
type BusinessCategory = CategoryMetadata;

export interface InitializeBusinessInput {
  clerkUserId: string;
  businessName: string;
  country: string;
  currency: string;
  businessType?: BusinessType;
  plan: 'trial' | 'starter' | 'pro' | 'enterprise';
  allowedCurrencies?: string[];
}

export interface InitializeBusinessResult {
  success: boolean;
  businessId?: string;
  error?: string;
  categoriesGenerated?: {
    cogs: number;
    expense: number;
  };
}

// Initialize Convex HTTP client
function getConvexClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error('NEXT_PUBLIC_CONVEX_URL not configured');
  }
  return new ConvexHttpClient(url);
}

// Sanitization utilities
function sanitizeTextInput(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  return input
    .replace(/\0/g, '')
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
    .trim()
    .substring(0, 500);
}

function generateBusinessSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

/**
 * Generate AI-enhanced category metadata for business onboarding
 */
async function generateBusinessCategories(
  businessType: BusinessType
): Promise<{ cogsCategories: BusinessCategory[]; expenseCategories: BusinessCategory[] }> {
  console.log(`[BusinessInit] 🤖 AI category generation starting - businessType: ${businessType}`);

  try {
    const cogsCategoryNames = [...getSuggestedCategories(businessType, 'cogs')];
    const expenseCategoryNames = [...getSuggestedCategories(businessType, 'expense')];

    console.log(`[BusinessInit] 📋 Suggested categories - COGS: ${cogsCategoryNames.length}, Expense: ${expenseCategoryNames.length}`);

    const cogsCategories = await generateCategoryMetadata(
      businessType,
      cogsCategoryNames,
      'cogs'
    );

    const expenseCategories = await generateCategoryMetadata(
      businessType,
      expenseCategoryNames,
      'expense'
    );

    console.log(`[BusinessInit] ✅ AI generation complete - COGS: ${cogsCategories.length}, Expense: ${expenseCategories.length}`);

    return { cogsCategories, expenseCategories };

  } catch (error) {
    console.error(`[BusinessInit] ⚠️ AI category generation failed, using fallback:`, error);

    // Fallback: return basic categories without AI enhancements
    const cogsCategoryNames = [...getSuggestedCategories(businessType, 'cogs')];
    const expenseCategoryNames = [...getSuggestedCategories(businessType, 'expense')];

    return {
      cogsCategories: cogsCategoryNames.map((name, index) => ({
        category_name: name,
        description: `${name} category`,
        vendor_patterns: [],
        ai_keywords: [name.toLowerCase()],
        is_active: true,
        sort_order: index + 1
      })),
      expenseCategories: expenseCategoryNames.map((name, index) => ({
        category_name: name,
        description: `${name} category`,
        vendor_patterns: [],
        ai_keywords: [name.toLowerCase()],
        is_active: true,
        sort_order: index + 1
      }))
    };
  }
}

/**
 * Initialize a new business for a user
 *
 * Creates:
 * - Business record with AI-generated categories
 * - Owner membership record
 * - User business_id linkage
 *
 * Note: Does NOT create Stripe subscription - call /api/v1/onboarding/start-trial separately
 */
export async function initializeBusiness(
  input: InitializeBusinessInput
): Promise<InitializeBusinessResult> {
  console.log(`[BusinessInit] ========================================`);
  console.log(`[BusinessInit] Starting business initialization`);
  console.log(`[BusinessInit] Clerk User ID: ${input.clerkUserId}`);
  console.log(`[BusinessInit] Business Name: ${input.businessName}`);
  console.log(`[BusinessInit] Country: ${input.country}`);
  console.log(`[BusinessInit] Currency: ${input.currency}`);
  console.log(`[BusinessInit] Plan: ${input.plan}`);
  console.log(`[BusinessInit] ========================================`);

  try {
    // Step 1: Sanitize and validate inputs
    console.log(`[BusinessInit] 🔒 Step 1: Sanitizing inputs`);

    const sanitizedName = sanitizeTextInput(input.businessName);
    const slug = generateBusinessSlug(sanitizedName);

    if (!sanitizedName || sanitizedName.length < 2) {
      return { success: false, error: 'Business name must be at least 2 characters' };
    }

    console.log(`[BusinessInit] ✅ Business slug generated: ${slug}`);

    // Step 2: Generate AI-powered categories
    console.log(`[BusinessInit] 🤖 Step 2: Generating business categories with AI`);

    const businessType: BusinessType = input.businessType || 'other';
    const { cogsCategories, expenseCategories } = await generateBusinessCategories(businessType);

    console.log(`[BusinessInit] ✅ Categories generated - COGS: ${cogsCategories.length}, Expense: ${expenseCategories.length}`);

    // Step 3: Create business via Convex mutation
    console.log(`[BusinessInit] 🏢 Step 3: Creating business record via Convex`);

    const convex = getConvexClient();

    const businessId = await convex.mutation(
      api.functions.businesses.initializeBusinessFromOnboarding,
      {
        clerkUserId: input.clerkUserId,
        name: sanitizedName,
        slug: slug,
        countryCode: input.country.toUpperCase(),
        homeCurrency: input.currency.toUpperCase(),
        businessType: businessType,
        planName: input.plan,
        subscriptionStatus: input.plan === 'trial' ? 'trialing' : 'active',
        customCogsCategories: cogsCategories,
        customExpenseCategories: expenseCategories,
        allowedCurrencies: input.allowedCurrencies || [
          'USD', 'SGD', 'MYR', 'THB', 'IDR', 'VND', 'PHP', 'CNY', 'EUR'
        ],
      }
    );

    console.log(`[BusinessInit] ✅ Business created: ${businessId}`);

    // Success!
    console.log(`[BusinessInit] ========================================`);
    console.log(`[BusinessInit] ✅ Business initialization complete`);
    console.log(`[BusinessInit] Business ID: ${businessId}`);
    console.log(`[BusinessInit] Plan: ${input.plan}`);
    console.log(`[BusinessInit] Categories: ${cogsCategories.length} COGS, ${expenseCategories.length} Expense`);
    console.log(`[BusinessInit] ⚠️ Note: Call /api/v1/onboarding/start-trial to create Stripe subscription`);
    console.log(`[BusinessInit] ========================================`);

    return {
      success: true,
      businessId: businessId,
      categoriesGenerated: {
        cogs: cogsCategories.length,
        expense: expenseCategories.length
      }
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[BusinessInit] 💥 Critical error:`, error);

    return {
      success: false,
      error: `Business initialization failed: ${errorMsg}`
    };
  }
}

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
  email: string;  // Required for Convex user creation if webhook didn't sync
  fullName?: string;  // Optional for user creation
  businessName: string;
  country: string;
  currency: string;
  businessType?: BusinessType;
  plan: 'trial' | 'starter' | 'pro' | 'enterprise';
  allowedCurrencies?: string[];
  forceCreateNew?: boolean;  // When true, always create new business (for modal)
  customCOGSNames?: string[];  // User-provided COGS category names from onboarding wizard
  customExpenseNames?: string[];  // User-provided expense category names from onboarding wizard
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
  businessType: BusinessType,
  customCOGSNames?: string[],
  customExpenseNames?: string[],
): Promise<{ cogsCategories: BusinessCategory[]; expenseCategories: BusinessCategory[] }> {
  console.log(`[BusinessInit] 🤖 AI category generation starting - businessType: ${businessType}`);

  try {
    // Use user-provided custom names if available, otherwise fall back to defaults
    const cogsCategoryNames = customCOGSNames && customCOGSNames.length > 0
      ? [...customCOGSNames]
      : [...getSuggestedCategories(businessType, 'cogs')];
    const expenseCategoryNames = customExpenseNames && customExpenseNames.length > 0
      ? [...customExpenseNames]
      : [...getSuggestedCategories(businessType, 'expense')];

    console.log(`[BusinessInit] 📋 Categories (custom: COGS=${!!(customCOGSNames?.length)}, Expense=${!!(customExpenseNames?.length)}) - COGS: ${cogsCategoryNames.length}, Expense: ${expenseCategoryNames.length}`);

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
    // Still respect user-provided custom names
    const cogsCategoryNames = customCOGSNames && customCOGSNames.length > 0
      ? [...customCOGSNames]
      : [...getSuggestedCategories(businessType, 'cogs')];
    const expenseCategoryNames = customExpenseNames && customExpenseNames.length > 0
      ? [...customExpenseNames]
      : [...getSuggestedCategories(businessType, 'expense')];

    // Helper to generate readable category IDs: category_slug_6random
    const slugify = (name: string) => name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    const genId = (name: string) => `${slugify(name)}_${Math.random().toString(36).substring(2, 8)}`

    return {
      cogsCategories: cogsCategoryNames.map((name, index) => ({
        id: genId(name),
        category_name: name,
        description: `${name} category`,
        vendor_patterns: [],
        ai_keywords: [name.toLowerCase()],
        is_active: true,
        sort_order: index + 1
      })),
      expenseCategories: expenseCategoryNames.map((name, index) => ({
        id: genId(name),
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
  console.log(`[BusinessInit] Email: ${input.email}`);
  console.log(`[BusinessInit] Full Name: ${input.fullName || '(not provided)'}`);
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
    const { cogsCategories, expenseCategories } = await generateBusinessCategories(
      businessType,
      input.customCOGSNames,
      input.customExpenseNames,
    );

    console.log(`[BusinessInit] ✅ Categories generated - COGS: ${cogsCategories.length}, Expense: ${expenseCategories.length}`);

    // Step 3: Create business via Convex mutation (with retry for race condition)
    console.log(`[BusinessInit] 🏢 Step 3: Creating business record via Convex`);

    const convex = getConvexClient();

    // Retry logic for race condition when user hasn't synced from Clerk yet
    const MAX_RETRIES = 5;
    const RETRY_DELAY_MS = 1500; // 1.5 seconds between retries

    let businessId: string | null = null;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[BusinessInit] 🔄 Attempt ${attempt}/${MAX_RETRIES} to create business`);

        businessId = await convex.mutation(
          // @ts-ignore - Convex internal API types cause "Type instantiation is excessively deep" error
          api.functions.businesses.initializeBusinessFromOnboarding,
          {
            clerkUserId: input.clerkUserId,
            email: input.email,
            fullName: input.fullName,
            name: sanitizedName,
            slug: slug,
            countryCode: input.country.toUpperCase(),
            homeCurrency: input.currency.toUpperCase(),
            businessType: businessType,
            planName: input.plan,
            subscriptionStatus: 'trialing',
            customCogsCategories: cogsCategories,
            customExpenseCategories: expenseCategories,
            allowedCurrencies: input.allowedCurrencies || [
              'USD', 'SGD', 'MYR', 'THB', 'IDR', 'VND', 'PHP', 'CNY', 'EUR'
            ],
            forceCreateNew: input.forceCreateNew,
          }
        );

        // Success - break out of retry loop
        console.log(`[BusinessInit] ✅ Business created on attempt ${attempt}: ${businessId}`);
        break;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const errorMsg = lastError.message;

        // Check if it's a "user not synced" error - retry for these
        if (errorMsg.includes('USER_NOT_SYNCED') && attempt < MAX_RETRIES) {
          console.log(`[BusinessInit] ⏳ User not synced yet, retrying in ${RETRY_DELAY_MS}ms...`);
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          continue;
        }

        // For other errors or max retries reached, throw immediately
        console.error(`[BusinessInit] 💥 Error on attempt ${attempt}:`, errorMsg);
        throw error;
      }
    }

    if (!businessId) {
      throw lastError || new Error('Failed to create business after retries');
    }

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

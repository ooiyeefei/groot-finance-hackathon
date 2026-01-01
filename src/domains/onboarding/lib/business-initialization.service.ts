/**
 * Business Initialization Service
 *
 * Creates business entity with AI-generated categories during user onboarding.
 * Handles: business creation, owner membership, user linking
 *
 * Note: Trial/Stripe subscription is handled separately by /api/v1/onboarding/start-trial
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
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
        category_code: name.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
        description: `${name} category`,
        vendor_patterns: [],
        ai_keywords: [name.toLowerCase()],
        is_active: true,
        sort_order: index + 1
      })),
      expenseCategories: expenseCategoryNames.map((name, index) => ({
        category_name: name,
        category_code: name.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
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
  input: InitializeBusinessInput,
  supabase?: SupabaseClient
): Promise<InitializeBusinessResult> {
  console.log(`[BusinessInit] ========================================`);
  console.log(`[BusinessInit] Starting business initialization`);
  console.log(`[BusinessInit] Clerk User ID: ${input.clerkUserId}`);
  console.log(`[BusinessInit] Business Name: ${input.businessName}`);
  console.log(`[BusinessInit] Country: ${input.country}`);
  console.log(`[BusinessInit] Currency: ${input.currency}`);
  console.log(`[BusinessInit] Plan: ${input.plan}`);
  console.log(`[BusinessInit] ========================================`);

  // Create Supabase client if not provided
  if (!supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return {
        success: false,
        error: 'Supabase configuration missing'
      };
    }

    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  try {
    // Step 1: Resolve Clerk user ID to Supabase UUID
    console.log(`[BusinessInit] 🔍 Step 1: Resolving Clerk user ID to Supabase UUID`);

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, business_id, email')
      .eq('clerk_user_id', input.clerkUserId)
      .single();

    if (userError || !user) {
      const errorMsg = `User not found for Clerk ID: ${input.clerkUserId}`;
      console.error(`[BusinessInit] ❌ ${errorMsg}`, userError);
      return { success: false, error: errorMsg };
    }

    console.log(`[BusinessInit] ✅ User resolved: ${user.id} (${user.email})`);

    // Note: Users CAN create multiple businesses. The user.business_id field
    // represents their "currently active" business context, not a blocker.
    // After creating a new business, we'll switch their active context to it.
    if (user.business_id) {
      console.log(`[BusinessInit] ℹ️ User has existing business (${user.business_id}), creating additional business`);
    }

    // Step 2: Sanitize and validate inputs
    console.log(`[BusinessInit] 🔒 Step 2: Sanitizing inputs`);

    const sanitizedName = sanitizeTextInput(input.businessName);
    const slug = generateBusinessSlug(sanitizedName);

    if (!sanitizedName || sanitizedName.length < 2) {
      return { success: false, error: 'Business name must be at least 2 characters' };
    }

    console.log(`[BusinessInit] ✅ Business slug generated: ${slug}`);

    // Step 3: Generate AI-powered categories
    console.log(`[BusinessInit] 🤖 Step 3: Generating business categories with AI`);

    const businessType: BusinessType = input.businessType || 'other';
    const { cogsCategories, expenseCategories } = await generateBusinessCategories(businessType);

    console.log(`[BusinessInit] ✅ Categories generated - COGS: ${cogsCategories.length}, Expense: ${expenseCategories.length}`);

    // Step 4: Create business record
    // Note: subscription_status is 'pending' - will be updated when start-trial is called
    console.log(`[BusinessInit] 🏢 Step 4: Creating business record`);

    const businessData = {
      name: sanitizedName,
      slug: slug,
      country_code: input.country.toUpperCase(),
      home_currency: input.currency.toUpperCase(),
      business_type: businessType,
      plan_name: input.plan,
      subscription_status: input.plan === 'trial' ? 'trialing' : 'active', // Stripe-compatible status
      custom_cogs_categories: cogsCategories,
      custom_expense_categories: expenseCategories,
      allowed_currencies: input.allowedCurrencies || [
        'USD', 'SGD', 'MYR', 'THB', 'IDR', 'VND', 'PHP', 'CNY', 'EUR'
      ],
      owner_id: user.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .insert(businessData)
      .select('id')
      .single();

    if (businessError || !business) {
      const errorMsg = `Failed to create business: ${businessError?.message || 'Unknown error'}`;
      console.error(`[BusinessInit] ❌ ${errorMsg}`, businessError);
      return { success: false, error: errorMsg };
    }

    console.log(`[BusinessInit] ✅ Business created: ${business.id}`);

    // Step 5: Create owner membership record
    console.log(`[BusinessInit] 👤 Step 5: Creating owner membership`);

    const membershipData = {
      user_id: user.id,
      business_id: business.id,
      role: 'admin',
      status: 'active',
      joined_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const { error: membershipError } = await supabase
      .from('business_memberships')
      .insert(membershipData);

    if (membershipError) {
      console.error(`[BusinessInit] ⚠️ Failed to create membership:`, membershipError);
      // Non-fatal: business is created, membership can be fixed later
    } else {
      console.log(`[BusinessInit] ✅ Owner membership created`);
    }

    // Step 6: Update user's active business context to the new business
    // This switches the user's "currently active" business - they can switch back via business switcher
    console.log(`[BusinessInit] 🔗 Step 6: Switching user's active business context`);

    const { error: userUpdateError } = await supabase
      .from('users')
      .update({
        business_id: business.id,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (userUpdateError) {
      console.error(`[BusinessInit] ⚠️ Failed to update user business_id:`, userUpdateError);
      // Non-fatal: business is created, user can be linked later
    } else {
      console.log(`[BusinessInit] ✅ User linked to business`);
    }

    // Success!
    console.log(`[BusinessInit] ========================================`);
    console.log(`[BusinessInit] ✅ Business initialization complete`);
    console.log(`[BusinessInit] Business ID: ${business.id}`);
    console.log(`[BusinessInit] Plan: ${input.plan}`);
    console.log(`[BusinessInit] Categories: ${cogsCategories.length} COGS, ${expenseCategories.length} Expense`);
    console.log(`[BusinessInit] ⚠️ Note: Call /api/v1/onboarding/start-trial to create Stripe subscription`);
    console.log(`[BusinessInit] ========================================`);

    return {
      success: true,
      businessId: business.id,
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

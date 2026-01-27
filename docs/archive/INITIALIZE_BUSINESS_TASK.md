# Initialize Business Task - Implementation Summary

## Overview

Created a Trigger.dev v3 background task for business initialization during user onboarding. This task handles the complete business entity creation workflow including AI-generated categories, owner membership, user linking, and optional trial period setup.

## File Created

**Location**: `src/trigger/initialize-business.ts`

## Task Details

### Task ID
```typescript
"initialize-business"
```

### Retry Configuration
- **Max Attempts**: 3
- **Factor**: 2 (exponential backoff)
- **Min Timeout**: 1000ms
- **Max Timeout**: 10000ms
- **Randomize**: true (jitter)

### Payload Interface
```typescript
interface InitializeBusinessPayload {
  clerkUserId: string;                 // Clerk user ID to resolve to Supabase UUID
  businessName: string;                // Business name (sanitized)
  country: string;                     // ISO country code (e.g., 'SG', 'MY', 'TH')
  currency: string;                    // Home currency (e.g., 'SGD', 'USD', 'THB')
  businessType?: 'fnb' | 'cpg_retail' | 'services' | 'manufacturing' | 'professional' | 'other';
  plan: 'free' | 'trial' | 'starter' | 'pro' | 'enterprise';
  allowedCurrencies?: string[];        // Optional: defaults to 9 SEA currencies
}
```

### Return Interface
```typescript
interface InitializeBusinessResult {
  success: boolean;
  businessId?: string;                 // UUID of created business
  error?: string;                      // Error message if failed
  categoriesGenerated?: {
    cogs: number;                      // Number of COGS categories generated
    expense: number;                   // Number of expense categories generated
  };
}
```

## Implementation Steps

The task performs the following operations in sequence:

### Step 1: User ID Resolution
- Resolves Clerk user ID to internal Supabase UUID
- Validates user exists in database
- Checks user doesn't already have a business

### Step 2: Input Sanitization
- Sanitizes business name (removes control characters, null bytes)
- Generates URL-safe slug from business name
- Validates minimum name length (2 characters)

### Step 3: AI Category Generation (Placeholder)
- **Current**: Returns empty arrays (uses system defaults)
- **Future (T038)**: Will call AI service to generate:
  - Custom COGS categories based on business type
  - Custom expense categories based on business type
  - Categories include AI keywords and vendor patterns

### Step 4: Trial Period Setup
- For `plan: 'trial'`:
  - Sets `trial_start_date` to current timestamp
  - Sets `trial_end_date` to current timestamp + 14 days
  - Sets `subscription_status` to 'trialing'
- For other plans:
  - Trial dates remain NULL
  - Subscription status set to 'active'

### Step 5: Business Record Creation
Creates business record with:
```typescript
{
  name: sanitizedName,
  slug: generatedSlug,
  country_code: uppercaseCountry,
  home_currency: uppercaseCurrency,
  business_type: businessType,
  plan_name: plan,
  subscription_status: plan === 'trial' ? 'trialing' : 'active',
  custom_cogs_categories: cogsCategories,      // JSONB
  custom_expense_categories: expenseCategories, // JSONB
  allowed_currencies: allowedCurrencies,       // Array
  trial_start_date: trialStartDate,            // ISO timestamp or NULL
  trial_end_date: trialEndDate,                // ISO timestamp or NULL
  owner_id: userId,
  created_at: now,
  updated_at: now
}
```

### Step 6: Owner Membership Creation
Creates admin membership record:
```typescript
{
  user_id: userId,
  business_id: businessId,
  role: 'admin',
  status: 'active',
  joined_at: now,
  created_at: now,
  updated_at: now
}
```

**Note**: Non-fatal failure - business creation succeeds even if membership fails

### Step 7: User Business Linking
Updates user record:
```typescript
{
  business_id: businessId,
  updated_at: now
}
```

**Note**: Non-fatal failure - business creation succeeds even if linking fails

## Database Tables Modified

### 1. `businesses`
**Operation**: INSERT

**Key Fields**:
- `id` (UUID, auto-generated)
- `name` (sanitized business name)
- `slug` (URL-safe identifier)
- `country_code` (ISO code, uppercase)
- `home_currency` (ISO currency, uppercase)
- `business_type` (enum for AI category generation)
- `plan_name` (subscription tier)
- `subscription_status` ('trialing' or 'active')
- `custom_cogs_categories` (JSONB array)
- `custom_expense_categories` (JSONB array)
- `allowed_currencies` (text array)
- `trial_start_date` (timestamptz, NULL for non-trial)
- `trial_end_date` (timestamptz, NULL for non-trial)
- `owner_id` (foreign key to users.id)

### 2. `business_memberships`
**Operation**: INSERT

**Key Fields**:
- `user_id` (foreign key to users.id)
- `business_id` (foreign key to businesses.id)
- `role` (always 'admin' for owner)
- `status` (always 'active')
- `joined_at` (current timestamp)

### 3. `users`
**Operation**: UPDATE

**Key Fields**:
- `business_id` (links user to new business)
- `updated_at` (current timestamp)

## Error Handling

### Fatal Errors (Return `success: false`)
1. User not found for Clerk ID
2. User already has a business
3. Business name too short (<2 characters)
4. Business record creation failed

### Non-Fatal Errors (Log warning, return `success: true`)
1. Membership creation failed
2. User business_id update failed

## Security Features

### Supabase Service Role Client
- Uses service role key for RLS bypass (required for background tasks)
- No user session available in Trigger.dev context
- Explicit user validation before operations

### Input Sanitization
```typescript
function sanitizeTextInput(input: string): string {
  return input
    .replace(/\0/g, '')                    // Remove null bytes
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '')  // Remove control chars
    .trim()
    .substring(0, 500);                    // Length limit
}
```

### Slug Generation
```typescript
function generateBusinessSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')  // Only alphanumeric + hyphens
    .replace(/^-+|-+$/g, '')       // Trim hyphens
    .substring(0, 50);             // Length limit
}
```

## Logging

All log statements use `[InitializeBusiness]` prefix for filtering:

```
[InitializeBusiness] ========================================
[InitializeBusiness] Starting business initialization
[InitializeBusiness] Clerk User ID: user_xxx
[InitializeBusiness] Business Name: Example Corp
[InitializeBusiness] Country: SG
[InitializeBusiness] Currency: SGD
[InitializeBusiness] Plan: trial
[InitializeBusiness] ========================================
[InitializeBusiness] 🔍 Step 1: Resolving Clerk user ID to Supabase UUID
[InitializeBusiness] ✅ User resolved: xxx-xxx-xxx (user@example.com)
[InitializeBusiness] 🔒 Step 2: Sanitizing inputs
[InitializeBusiness] ✅ Business slug generated: example-corp
[InitializeBusiness] 🤖 Step 3: Generating business categories
[InitializeBusiness] ✅ Categories generated - COGS: 0, Expense: 0
[InitializeBusiness] ⏱️ Trial period: 2025-12-29T00:00:00Z → 2026-01-12T00:00:00Z
[InitializeBusiness] 🏢 Step 4: Creating business record
[InitializeBusiness] ✅ Business created: xxx-xxx-xxx
[InitializeBusiness] 👤 Step 5: Creating owner membership
[InitializeBusiness] ✅ Owner membership created
[InitializeBusiness] 🔗 Step 6: Linking user to business
[InitializeBusiness] ✅ User linked to business
[InitializeBusiness] ========================================
[InitializeBusiness] ✅ Business initialization complete
[InitializeBusiness] Business ID: xxx-xxx-xxx
[InitializeBusiness] Plan: trial
[InitializeBusiness] Categories: 0 COGS, 0 Expense
[InitializeBusiness] ========================================
```

## Usage Example

### From Next.js API Route
```typescript
import { tasks } from "@trigger.dev/sdk/v3";
import type { initializeBusiness } from "@/trigger/initialize-business";

export async function POST(request: Request) {
  const { clerkUserId, businessName, country, currency, plan } = await request.json();

  // Trigger background task (non-blocking)
  const handle = await tasks.trigger<typeof initializeBusiness>(
    "initialize-business",
    {
      clerkUserId,
      businessName,
      country,
      currency,
      plan,
      businessType: 'other',
      allowedCurrencies: ['USD', 'SGD', 'MYR', 'THB', 'IDR', 'VND', 'PHP', 'CNY', 'EUR']
    }
  );

  return Response.json({
    taskId: handle.id,
    message: "Business initialization started"
  });
}
```

### Waiting for Completion
```typescript
// Wait for task to complete and get result
const result = await tasks.triggerAndWait<typeof initializeBusiness>(
  "initialize-business",
  payload
);

if (result.ok) {
  console.log("Business created:", result.output.businessId);
  console.log("Categories generated:", result.output.categoriesGenerated);
} else {
  console.error("Business creation failed:", result.error);
}
```

## Future Enhancements (T038)

### AI Category Generation
The placeholder function will be replaced with:

```typescript
async function generateBusinessCategories(
  businessType: string,
  country: string
): Promise<{ cogsCategories: BusinessCategory[]; expenseCategories: BusinessCategory[] }> {
  // Call AI service (Gemini/Claude) with:
  // - Business type context (F&B, retail, services, etc.)
  // - Country-specific tax/accounting rules
  // - Industry best practices

  // Return structured categories with:
  // - category_name: "Office Rent", "Employee Salaries", etc.
  // - category_code: "RENT", "SALARY", etc.
  // - ai_keywords: ["rent", "lease", "landlord"]
  // - vendor_patterns: ["landlord", "property management"]
  // - is_active: true
}
```

**Benefits**:
- Context-aware categories based on business type
- Country-specific compliance (e.g., Thai VAT vs Malaysian GST)
- Automatic transaction categorization via AI keywords
- Vendor pattern matching for smart defaults

## Code Quality

### TypeScript
- ✅ Strict types (no `any`)
- ✅ Comprehensive interfaces
- ✅ Proper error handling
- ✅ No ESLint warnings

### Patterns Followed
- ✅ Lazy Supabase client initialization
- ✅ Consistent logging prefix `[InitializeBusiness]`
- ✅ Try-catch error handling
- ✅ Retry configuration matching existing tasks
- ✅ Input sanitization following security best practices
- ✅ Non-blocking design (fire-and-forget capable)

## Testing Checklist

### Unit Tests (To Be Implemented)
- [ ] User ID resolution with valid Clerk ID
- [ ] User ID resolution with invalid Clerk ID
- [ ] Business name sanitization (special chars, null bytes)
- [ ] Slug generation edge cases
- [ ] Trial date calculation (14-day period)
- [ ] Non-trial plan handling (NULL dates)
- [ ] Error handling for duplicate business
- [ ] Error handling for database failures

### Integration Tests (To Be Implemented)
- [ ] End-to-end business creation flow
- [ ] Membership record creation
- [ ] User business_id linking
- [ ] Trial period expiration logic
- [ ] Category generation (when T038 complete)

## Related Tasks

- **T037** (Current): Initialize business Trigger.dev task ✅
- **T038** (Next): AI-powered category generation
- **T039** (Future): Onboarding UI integration

## Documentation

### References
- CLAUDE.md: Trigger.dev v3 basic tasks guide
- Existing tasks: `extract-receipt-data.ts`, `classify-document.ts`
- Database schema: Supabase migrations
- User recovery: `src/lib/db/supabase-server.ts`

---

**Created**: 2025-12-29
**Author**: Claude Code Agent
**Status**: ✅ Complete - Ready for T038 AI integration

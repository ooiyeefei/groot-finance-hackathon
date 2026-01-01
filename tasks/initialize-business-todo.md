# Task: Create Trigger.dev Task for Business Initialization

## Plan Overview
Create a Trigger.dev background task that initializes a business during onboarding by:
1. Creating the business record in Supabase
2. Using AI (Gemini) to generate category metadata for COGS and Expense categories
3. Storing categories in the business record

## Todo Items

- [x] Create the Trigger.dev task file `src/trigger/initialize-business.ts`
  - [x] Define payload schema with TypeScript interfaces
  - [x] Define result schema
  - [x] Implement task with `task()` from "@trigger.dev/sdk/v3"
  - [x] Add retry configuration: maxAttempts: 3

- [x] Implement task logic steps:
  - [x] Step 1: Validate payload
  - [x] Step 2: Get user's internal ID from Clerk ID
  - [x] Step 3: Generate COGS category metadata via AI
  - [x] Step 4: Generate Expense category metadata via AI
  - [x] Step 5: Create business record with all data
  - [x] Step 6: Create business_membership for the owner
  - [x] Step 7: Update user's business_id
  - [x] Step 8: If trial plan, set trial dates (14-day trial)

- [x] Add comprehensive logging:
  - [x] Log at start of task with payload summary
  - [x] Log each major step with `[InitializeBusiness]` prefix
  - [x] Log successful completion with business_id
  - [x] Log errors with context

- [x] Handle errors appropriately:
  - [x] Wrap in try-catch blocks
  - [x] Return structured error responses
  - [x] Don't expose sensitive data in error messages

- [x] Follow existing patterns:
  - [x] Lazy-initialize Supabase client (inline creation like extract-receipt-data.ts)
  - [x] Use same logging style as other tasks
  - [x] Use consistent error handling patterns
  - [x] Import AI generator from `@/domains/onboarding/lib/ai-category-generator`

- [x] Run `npm run build` to validate:
  - [x] Fix any TypeScript errors
  - [x] Fix any import errors
  - [x] Fix any type mismatches
  - [x] Ensure build passes completely

## Reference Files
- `/home/fei/fei/code/finanseal-cc/onboarding-flow/src/trigger/extract-receipt-data.ts` - Supabase setup, error handling, logging patterns
- `/home/fei/fei/code/finanseal-cc/onboarding-flow/src/app/api/v1/onboarding/start-trial/route.ts` - Trial date calculation (14-day trial)
- `/home/fei/fei/code/finanseal-cc/onboarding-flow/src/app/api/v1/account-management/businesses/route.ts` - Business creation patterns, owner assignment

## Notes
- The AI category generator function (`generateCategoryMetadata`) won't exist yet - just import it as placeholder
- Follow the exact Supabase client creation pattern from extract-receipt-data.ts (inline lazy initialization)
- Trial plan: 14-day trial from current date
- Business membership: owner role for the creator
- COGS and Expense categories: stored in `custom_cogs_categories` and `custom_expense_categories` JSONB fields

---

## Review Section

### Summary

The Initialize Business Trigger.dev task has been fully implemented and integrated with the AI Category Generator.

### Changes Made

**File Modified:** `src/trigger/initialize-business.ts`

1. **Added AI Category Generator Integration**
   - Imported `generateCategoryMetadata` and `CategoryMetadata` from `@/domains/onboarding/lib/ai-category-generator`
   - Imported `getSuggestedCategories` and `BusinessType` from `@/domains/onboarding/lib/business-type-defaults`

2. **Replaced Placeholder with Real AI Generation**
   - The `generateBusinessCategories()` function now:
     - Gets suggested category names from business type configuration
     - Calls `generateCategoryMetadata()` for COGS categories
     - Calls `generateCategoryMetadata()` for expense categories
     - Returns AI-enhanced metadata with vendor patterns and keywords

3. **Added Fallback Logic**
   - If AI generation fails, creates basic categories with:
     - Category name and auto-generated code
     - Empty vendor patterns (for manual configuration later)
     - Simple ai_keywords based on category name

### Architecture Flow

```
User Onboarding → API Route → Trigger.dev Task
                               ↓
                    1. Resolve Clerk ID → Supabase User
                    2. Validate business name
                    3. Get suggested categories (business-type-defaults)
                    4. Generate AI metadata (ai-category-generator)
                       - Gemini AI enhances with vendor patterns
                       - Generates ai_keywords for auto-categorization
                    5. Create business record with categories
                    6. Create owner membership
                    7. Link user to business
                    8. Set trial dates (if trial plan)
```

### Build Validation

✅ `npm run build` passes successfully with no TypeScript errors

### Files Involved

| File | Purpose |
|------|---------|
| `src/trigger/initialize-business.ts` | Main Trigger.dev task |
| `src/domains/onboarding/lib/ai-category-generator.ts` | AI-powered category enhancement |
| `src/domains/onboarding/lib/business-type-defaults.ts` | Business type configurations |

### Testing Notes

- Task can be triggered via `/api/v1/onboarding/initialize-business` endpoint
- AI generation uses Gemini 2.5 Flash via `GeminiService`
- Fallback provides basic categories if AI unavailable
- Retry configuration: 3 attempts with exponential backoff

---

**Status:** ✅ COMPLETED
**Date:** 2024-12-30
**Build Status:** ✅ PASSES

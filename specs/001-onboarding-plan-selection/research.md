# Research: Onboarding & Plan Selection Flow

**Feature**: 001-onboarding-plan-selection
**Date**: 2025-12-29
**Status**: Complete

## Executive Summary

This research documents the existing codebase patterns, integration points, and technical decisions for implementing the onboarding and plan selection flow. The feature builds on established patterns from Issue #80 (Stripe subscription billing) and extends them with trial support, plan selection, and AI-powered business initialization.

## 1. Existing Subscription System Analysis

### Current Plan Structure (`src/lib/stripe/plans.ts`)

```typescript
export const PLANS = {
  free: {
    name: 'Free',
    priceId: null,
    price: 0,
    currency: 'MYR',
    ocrLimit: 5,
    features: ['Read-only financial data', 'Basic reports', '5 OCR scans/month', 'Email support'],
  },
  pro: {
    name: 'Pro',
    priceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
    price: 79,
    currency: 'MYR',
    ocrLimit: 100,
    features: ['Full data access', 'Advanced reports', '100 OCR scans/month', 'Priority support', 'Multi-currency'],
  },
  enterprise: {
    name: 'Enterprise',
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID ?? null,
    price: 199,
    currency: 'MYR',
    ocrLimit: -1, // Unlimited
    features: ['Everything in Pro', 'Unlimited OCR', 'API access', 'Custom branding', 'Dedicated support', 'Team management'],
  },
}
```

**Required Changes**:
- Remove `free` tier
- Add `trial` tier (14-day, no CC)
- Add `starter` tier (new paid plan)
- Update `pro` and `enterprise` with team limits
- Remove hardcoded prices (fetch from Stripe)

### Database Schema (`businesses` table)

Current subscription-related columns:
- `stripe_customer_id` (text, unique)
- `stripe_subscription_id` (text, unique)
- `stripe_product_id` (text)
- `plan_name` (text, CHECK: 'free'/'pro'/'enterprise')
- `subscription_status` (text, CHECK: Stripe status values)

**Missing for Trial Support**:
- `business_type` - for context-aware category generation
- `trial_start_date` - when trial began
- `trial_end_date` - when trial expires (start + 14 days)
- `onboarding_completed_at` - for analytics

### Stripe Webhook Integration

Existing handlers in `src/lib/stripe/webhook-handlers.ts`:
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

**Patterns to Follow**:
- Idempotency via `stripe_events` table
- Service role for webhook writes (bypasses RLS)
- Fire-and-forget pattern (returns 200 immediately)

## 2. Category System Analysis

### COGS Categories (`src/domains/invoices/lib/default-cogs-categories.ts`)

Interface:
```typescript
interface DefaultCOGSCategory {
  id: string
  category_name: string
  category_code: string
  description: string
  cost_type: 'direct' | 'indirect'
  is_active: boolean
  ai_keywords: string[]      // Used in DSPy extraction
  vendor_patterns: string[]  // Used in DSPy extraction
  sort_order: number
  created_at: string
  updated_at: string
}
```

Default categories: Direct Materials, Direct Labor, Subcontractor, Freight & Logistics, Manufacturing Overhead, Other Direct Costs

### Expense Categories (`src/domains/expense-claims/lib/default-expense-categories.ts`)

Interface:
```typescript
interface DefaultExpenseCategory {
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
```

Default categories: Travel, Petrol & Transportation, Entertainment & Meals, Office Supplies, Utilities, Training, Marketing, Maintenance, Other Business Expenses

### DSPy Usage of AI Keywords

**Confirmed Active Usage** in:
- `src/trigger/extract-invoice-data.ts` - Uses `ai_keywords` for category context
- `src/trigger/extract-receipt-data.ts` - Uses `ai_keywords` and `vendor_patterns`
- `src/domains/expense-claims/lib/dynamic-expense-categorizer.ts` - Pre-AI pattern matching

**Critical**: AI-generated categories MUST include `ai_keywords` and `vendor_patterns` for OCR to work correctly.

## 3. Business Entity Structure

### Current Business Creation Flow

1. User signs up via Clerk
2. `after_sign_up` webhook or first login creates user record
3. User creates business manually (current flow)
4. Business owner becomes admin of business

### Required Onboarding Flow

1. User signs up via Clerk
2. Redirect to plan selection page
3. **If trial**: Skip payment, create business with `plan_name='trial'`, set `trial_end_date`
4. **If paid**: Stripe Checkout, create subscription, create business
5. Redirect to business setup wizard (5 optional questions)
6. On completion: trigger background job for AI category generation
7. Show loading screen with progress messages
8. Redirect to dashboard

### Business Type → Currency Mapping

| Business Type | Typical Categories |
|--------------|-------------------|
| `fnb` (F&B) | Ingredients, Kitchen Equipment, Food Packaging |
| `cpg_retail` | Inventory, Packaging, Store Supplies |
| `services` | Professional Fees, Contractors, Software |
| `manufacturing` | Raw Materials, Machinery, Production Labor |
| `professional` | Consulting, Legal, Accounting Tools |
| `other` | Standard categories |

### Country → Currency Mapping

| Country | Currency |
|---------|----------|
| Singapore | SGD |
| Malaysia | MYR |
| Thailand | THB |
| Indonesia | IDR |
| Vietnam | VND |
| Philippines | PHP |
| USA | USD |
| Others | USD (default) |

## 4. Authentication Integration

### Clerk Configuration

- Sign-up: `/sign-up/[[...sign-up]]/page.tsx` (existing)
- Sign-in: `/sign-in/[[...sign-in]]/page.tsx` (existing)
- Middleware: Protects routes, redirects unauthenticated users

### Post-Signup Redirect

Current: After sign-up, user goes to dashboard or first-time setup

Required: After sign-up, redirect to `/onboarding/plan-selection`

Implementation options:
1. **Clerk redirect URL**: Configure in Clerk Dashboard
2. **Middleware check**: Check if user has completed onboarding
3. **Database flag**: `users.onboarding_completed` or `businesses.onboarding_completed_at`

Recommended: Middleware check with `onboarding_completed_at` timestamp on business

## 5. Trigger.dev Background Job Patterns

### Existing Task Structure

```typescript
// src/trigger/process-document-ocr.ts
export const processDocumentOCR = task({
  id: "process-document-ocr",
  retry: {
    maxAttempts: 3,
    factor: 1.8,
    minTimeoutInMs: 500,
    maxTimeoutInMs: 30_000,
  },
  run: async (payload: { documentId: string }) => {
    // Processing logic
    return { success: true }
  },
})
```

### Proposed Business Initialization Task

```typescript
// src/trigger/initialize-business.ts
export const initializeBusiness = task({
  id: "initialize-business",
  retry: { maxAttempts: 2, factor: 2 },
  run: async (payload: {
    businessId: string
    userId: string
    businessType: string
    customCOGSNames?: string[]
    customExpenseNames?: string[]
  }) => {
    // 1. Generate default categories based on business type
    // 2. If custom names provided, generate AI-enhanced categories
    // 3. Store in businesses.custom_cogs_categories and custom_expense_categories
    // 4. Set businesses.onboarding_completed_at
    return { success: true, categoriesGenerated: count }
  },
})
```

### AI Category Generation Pattern

For custom category names like "Ingredients", "Packaging":

1. Call Gemini API with prompt including business_type context
2. Generate full category object with:
   - `category_name`: User's input
   - `category_code`: Generated (e.g., "INGREDIENTS")
   - `description`: AI-generated
   - `ai_keywords`: AI-generated based on name + business type
   - `vendor_patterns`: AI-generated based on name + business type
3. Merge with default categories
4. Store as JSONB array

## 6. UI Component Patterns

### Design System Requirements (Constitution II)

- **Semantic tokens only**: `bg-card`, `text-foreground`, `border-border`
- **No hardcoded colors**: Never `bg-gray-700`, `text-white`
- **Layer hierarchy**: `bg-background` → `bg-surface` → `bg-card` → `bg-muted`
- **Existing components**: Check `src/components/ui/` first

### Tag Input Pattern

For custom categories, use a tag-style input:
- User types category name
- Presses Enter
- Tag appears with remove button
- Can continue adding

Similar to existing implementations in the codebase.

### Loading Screen Pattern

"Setting up your business..." screen with dynamic messages:
- "Creating your workspace..."
- "Configuring categories..."
- "Setting up AI assistance..."
- "Almost ready..."

Progress can be indicated via polling or WebSocket.

## 7. API Route Patterns

### Existing Route Structure

```
src/app/api/v1/
├── billing/
│   ├── checkout/route.ts      # Stripe Checkout session
│   ├── subscription/route.ts  # Subscription management
│   └── webhooks/route.ts      # Stripe webhooks
├── expense-claims/
│   └── [id]/status/route.ts   # Status transitions
└── invoices/
    └── [documentId]/process/route.ts  # Document processing
```

### Proposed Onboarding Routes

```
src/app/api/v1/onboarding/
├── initialize-business/route.ts  # POST: Create business + trigger background job
└── status/route.ts               # GET: Check initialization status
```

### Response Patterns

```typescript
// Fire-and-forget (returns immediately)
return NextResponse.json({
  success: true,
  data: {
    businessId: business.id,
    taskId: triggerJobId,
    status: 'initializing'
  }
}, { status: 202 })

// Synchronous success
return NextResponse.json({
  success: true,
  data: { ... }
}, { status: 200 })

// Error
return NextResponse.json({
  success: false,
  error: 'Specific error message'
}, { status: 400 })
```

## 8. Migration Strategy

### Phase 1: Database Schema

1. Add new columns to `businesses` table
2. Update CHECK constraints for `plan_name` and `subscription_status`
3. Migrate existing `free` plan users to `trial` (separate task, out of scope)

### Phase 2: Stripe Configuration

1. Create Starter product in Stripe Dashboard
2. Configure price IDs in environment variables
3. Test webhook handlers with new subscription types

### Phase 3: Code Changes

1. Update `src/lib/stripe/plans.ts` with new structure
2. Create onboarding domain (`src/domains/onboarding/`)
3. Create Trigger.dev task for business initialization
4. Build UI components following design system
5. Add API routes
6. Update middleware for onboarding redirect

### Phase 4: Testing

1. Trial signup flow (no CC)
2. Paid signup flow (Stripe Checkout)
3. Business setup wizard (all skip vs all complete)
4. AI category generation
5. Trial expiration handling

## 9. Risk Assessment

| Risk | Mitigation |
|------|------------|
| AI category generation fails | Fallback to minimal structure (name only, empty keywords) |
| Stripe webhook delays | Client polls for status, handles pending state gracefully |
| Geolocation fails | Default to Singapore (SGD) as primary SEA market |
| Long initialization time | Show engaging loading screen, <10 second target |
| Trial abuse | Rate limiting, email verification via Clerk |

## 10. Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Pricing source | Stripe-managed, no hardcoded prices |
| Trial CC requirement | No CC required for trial |
| Team limits | Trial/Starter: 3, Pro: 13, Enterprise: Unlimited |
| Category schema | Preserve existing JSONB structure with all fields |
| AI model | Gemini API (existing infrastructure) |

## References

- Spec: `/specs/001-onboarding-plan-selection/spec.md`
- Constitution: `/.specify/memory/constitution.md`
- Existing Stripe integration: Issue #80
- Default categories: `src/domains/invoices/lib/default-cogs-categories.ts`, `src/domains/expense-claims/lib/default-expense-categories.ts`

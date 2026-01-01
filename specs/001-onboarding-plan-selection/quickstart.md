# Quickstart: Onboarding & Plan Selection Flow

**Feature**: 001-onboarding-plan-selection
**Date**: 2025-12-29

## Overview

This guide provides a quick reference for implementing the onboarding and plan selection feature. Use this alongside the detailed plan.md and data-model.md documents.

## Implementation Checklist

### Phase 0: Plan Configuration Changes

- [ ] **Update `src/lib/stripe/plans.ts`**:
  ```typescript
  // REMOVE: free tier
  // ADD: trial tier (priceId: null, teamLimit: 3, ocrLimit: 100)
  // ADD: starter tier (priceId: env, teamLimit: 3, ocrLimit: 50)
  // UPDATE: pro tier (add teamLimit: 13)
  // UPDATE: enterprise tier (add teamLimit: -1)
  // REMOVE: price and currency fields (managed in Stripe)
  // ADD: displayName and teamLimit fields
  ```

- [ ] **Update helper functions**:
  - `getPlanFromPriceId()` - Add starter, change default from 'free' to 'trial'
  - `getPaidPlans()` - Add starter to list
  - ADD: `getTeamLimit()` - New function
  - ADD: `canAddTeamMember()` - New function

- [ ] **Update files referencing `PLANS.free`**:
  - `src/lib/stripe/webhook-handlers.ts`
  - `src/domains/billing/hooks/use-subscription.ts`
  - Any `planName === 'free'` checks

- [ ] **Environment Variables**: Add to `.env.local`
  ```bash
  STRIPE_STARTER_PRICE_ID=price_xxx  # Get from Stripe after creating product
  ```

- [ ] **Stripe Dashboard** (manual):
  - Create "Starter" product + monthly price
  - Verify Pro and Enterprise products exist
  - Copy price IDs to env vars

### Phase 1: Database & Backend Foundation

- [ ] **Migration**: Add onboarding fields to `businesses` table
  - `business_type`, `trial_start_date`, `trial_end_date`, `onboarding_completed_at`
  - Update `plan_name` constraint (add 'trial', 'starter')
  - Update `subscription_status` constraint (add 'expired')

### Phase 2: Onboarding Domain

- [ ] **Create domain structure**:
  ```
  src/domains/onboarding/
  ├── components/
  ├── hooks/
  ├── lib/
  ├── types/
  └── CLAUDE.md
  ```

- [ ] **Types**: Create `src/domains/onboarding/types/index.ts`
  - `BusinessType`, `OnboardingWizardData`, `OnboardingState`
  - `InitializeBusinessPayload`, `InitializeBusinessResult`

- [ ] **Utilities**: Create helper modules
  - `currency-mapping.ts` - Country to currency mapping
  - `business-type-defaults.ts` - Default categories per type
  - `trial-management.ts` - Trial calculation utilities
  - `team-limits.ts` - Plan-based team limits

### Phase 3: Background Job

- [ ] **Trigger.dev Task**: Create `src/trigger/initialize-business.ts`
  - Accept business setup data
  - Generate default categories based on business type
  - Call AI for custom category enhancement
  - Store categories in JSONB columns
  - Set `onboarding_completed_at`

### Phase 4: API Routes

- [ ] **Initialize Business**: `POST /api/v1/onboarding/initialize-business`
  - Validate request with Zod
  - Create business record
  - Trigger background job
  - Return 202 with task ID

- [ ] **Status Polling**: `GET /api/v1/onboarding/status`
  - Check Trigger.dev task status
  - Return progress and completion state

- [ ] **Defaults**: `GET /api/v1/onboarding/defaults`
  - Return suggested business name, detected country/currency
  - Return business type options with suggestions

### Phase 5: UI Components

- [ ] **Plan Selection Page**: `/onboarding/plan-selection`
  - Display paid plans (Starter/Pro/Enterprise) with Stripe pricing
  - Prominent "Start Free Trial" CTA
  - Route to Stripe Checkout (paid) or business setup (trial)

- [ ] **Business Setup Wizard**: `/onboarding/business-setup`
  - 5-step wizard (all optional)
  - Tag input for custom categories
  - Skip/Use Default buttons

- [ ] **Loading Screen**: `/onboarding/initializing`
  - Poll for initialization status
  - Dynamic progress messages
  - Redirect to dashboard on completion

### Phase 6: Middleware & Routing

- [ ] **Onboarding Check Middleware**
  - Check if user has `onboarding_completed_at`
  - Redirect incomplete users to onboarding
  - Allow access to onboarding routes

- [ ] **Post-Signup Redirect**
  - Configure Clerk to redirect to `/onboarding/plan-selection`

## Quick Code Snippets

### Plan Selection Hook

```typescript
// src/domains/onboarding/hooks/use-plan-selection.ts
export function usePlanSelection() {
  const [selectedPlan, setSelectedPlan] = useState<PlanName>('trial')

  const handleSelectPlan = async (plan: PlanName) => {
    if (plan === 'trial') {
      // Direct to business setup
      router.push('/onboarding/business-setup')
    } else if (plan === 'enterprise') {
      // Show contact sales form
      setShowContactForm(true)
    } else {
      // Create Stripe Checkout session
      const { checkoutUrl } = await createCheckoutSession(plan)
      window.location.href = checkoutUrl
    }
  }

  return { selectedPlan, setSelectedPlan, handleSelectPlan }
}
```

### Initialize Business API

```typescript
// src/app/api/v1/onboarding/initialize-business/route.ts
export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return unauthorized()

  const body = await request.json()
  const validated = initializeBusinessSchema.safeParse(body)
  if (!validated.success) return validationError(validated.error)

  // Create business
  const business = await createBusiness({
    ...validated.data,
    ownerId: userId,
    planName: validated.data.planName,
    trialStartDate: validated.data.planName === 'trial' ? new Date() : null,
    trialEndDate: validated.data.planName === 'trial'
      ? calculateTrialEndDate()
      : null,
  })

  // Trigger background initialization
  const { id: taskId } = await tasks.trigger<typeof initializeBusiness>(
    'initialize-business',
    { businessId: business.id, ...validated.data }
  )

  return Response.json({
    success: true,
    data: {
      businessId: business.id,
      taskId,
      status: 'initializing',
      estimatedCompletionMs: 5000,
    }
  }, { status: 202 })
}
```

### Trial Status Check

```typescript
// Middleware or layout check
const business = await getBusinessForUser(userId)

if (business?.plan_name === 'trial' && isTrialExpired(business.trial_end_date)) {
  // Update status and redirect
  await updateBusinessStatus(business.id, 'expired')
  redirect('/onboarding/plan-selection?reason=trial_expired')
}
```

## Testing Scenarios

1. **Trial Signup**: Sign up → Select trial → Skip all setup → Dashboard
2. **Full Setup**: Sign up → Select trial → Complete all 5 steps → Dashboard
3. **Paid Signup**: Sign up → Select Starter → Stripe payment → Setup → Dashboard
4. **Trial Expiration**: Set trial_end_date to past → Access app → See upgrade prompt

## Key Files to Reference

| File | Purpose |
|------|---------|
| `src/lib/stripe/plans.ts` | Plan configuration (MODIFY) |
| `src/lib/stripe/webhook-handlers.ts` | Webhook patterns (REFERENCE) |
| `src/domains/invoices/lib/default-cogs-categories.ts` | Category schema (REFERENCE) |
| `src/domains/expense-claims/lib/default-expense-categories.ts` | Category schema (REFERENCE) |
| `src/trigger/process-document-ocr.ts` | Trigger.dev task patterns (REFERENCE) |

## Environment Variables

```bash
# Stripe (add STARTER price)
STRIPE_STARTER_PRICE_ID=price_xxx
STRIPE_PRO_PRICE_ID=price_xxx        # existing
STRIPE_ENTERPRISE_PRICE_ID=price_xxx # existing

# Gemini (existing)
GOOGLE_AI_API_KEY=xxx
```

## Common Pitfalls

1. **Hardcoded prices**: Don't hardcode prices - fetch from Stripe
2. **Missing ai_keywords**: AI-generated categories MUST include `ai_keywords` and `vendor_patterns`
3. **Blocking initialization**: Use fire-and-forget pattern, don't block on AI generation
4. **Missing trial check**: Always check trial expiration in middleware
5. **Hardcoded colors**: Use semantic tokens only per Constitution II

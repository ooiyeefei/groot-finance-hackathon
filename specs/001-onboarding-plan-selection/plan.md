# Implementation Plan: Onboarding & Plan Selection Flow

**Branch**: `001-onboarding-plan-selection` | **Date**: 2025-12-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-onboarding-plan-selection/spec.md`

## Summary

Enable frictionless self-service onboarding with plan selection for Southeast Asian SMEs. Users sign up via Clerk, choose between paid plans (Starter/Pro/Enterprise) or 14-day free trial (no credit card required), complete a streamlined 5-question business setup wizard (all optional), and reach the dashboard. AI-powered category generation enhances custom COGS/expense categories with `ai_keywords` and `vendor_patterns` for downstream OCR matching.

**Technical Approach**: Extend existing Stripe subscription integration (Issue #80), leverage Clerk authentication, use Gemini for AI category generation via Trigger.dev background job, store categories in existing JSONB schema (`custom_cogs_categories`, `custom_expense_categories`).

## Technical Context

**Language/Version**: TypeScript 5.9+ with Next.js 15 App Router
**Primary Dependencies**: Clerk (auth), Stripe SDK + @stripe/stripe-js (billing), Supabase Client, Trigger.dev v3 (background jobs), Tailwind CSS + Radix UI (styling), Zod (validation), Gemini API (AI)
**Storage**: Supabase PostgreSQL with RLS - `businesses` table for subscription + categories, `users` table for profiles
**Testing**: Vitest (unit), Playwright (E2E)
**Target Platform**: Web application (responsive, mobile-first)
**Project Type**: Web application (Next.js App Router with domain-driven architecture)
**Performance Goals**: Complete onboarding in <3 minutes, <60 seconds if skipping all questions, AI category generation <10 seconds
**Constraints**: No credit card for trial, Stripe-managed pricing (no hardcoded prices), preserve existing JSONB category schema
**Scale/Scope**: Southeast Asian SME market, multi-currency (SGD, MYR, THB, IDR, VND, PHP, USD, EUR, CNY)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|-----------|------|--------|
| I. Domain-Driven Architecture | Feature code in `src/domains/onboarding/`? API in `/api/v1/onboarding/`? | ☑ Planned |
| II. Semantic Design System | UI uses semantic tokens only? No hardcoded colors? | ☑ Planned |
| III. Build Validation | `npm run build` passes? | ☐ Post-implementation |
| IV. Simplicity First | Minimal changes? No over-engineering? | ☑ Extend existing Stripe integration |
| V. Background Jobs | Long tasks use Trigger.dev? Fire-and-forget pattern? | ☑ AI category generation via Trigger.dev |

## Project Structure

### Documentation (this feature)

```text
specs/001-onboarding-plan-selection/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── domains/
│   └── onboarding/                    # NEW: Onboarding domain
│       ├── components/
│       │   ├── plan-selection/        # Plan selection cards, trial CTA
│       │   ├── business-setup/        # 5-step wizard, tag input
│       │   └── loading-screen/        # "Setting up your business" screen
│       ├── hooks/
│       │   ├── use-onboarding-flow.ts # Wizard state management
│       │   └── use-plan-selection.ts  # Plan/trial selection state
│       ├── lib/
│       │   ├── onboarding-service.ts  # Business initialization logic
│       │   └── ai-category-generator.ts # Gemini category generation
│       ├── types/
│       │   └── index.ts               # Onboarding-specific types
│       └── CLAUDE.md                  # Domain documentation
│
├── domains/billing/                   # EXTEND: Existing billing domain
│   ├── components/                    # Existing: payment UI
│   └── hooks/use-subscription.ts      # EXTEND: Trial state support
│
├── app/
│   ├── (auth)/
│   │   ├── sign-up/[[...sign-up]]/   # Clerk sign-up page
│   │   └── onboarding/               # NEW: Onboarding flow pages
│   │       ├── plan-selection/page.tsx
│   │       ├── business-setup/page.tsx
│   │       └── initializing/page.tsx
│   └── api/v1/
│       └── onboarding/               # NEW: Onboarding API routes
│           ├── initialize-business/route.ts
│           └── generate-categories/route.ts
│
├── trigger/
│   └── initialize-business.ts        # NEW: Background business setup task
│
└── lib/stripe/
    └── plans.ts                      # MODIFY: Add Starter tier, trial support
```

**Structure Decision**: Domain-driven architecture following constitution. New `src/domains/onboarding/` domain for feature isolation. Extends existing `src/domains/billing/` for Stripe integration. Background job in `src/trigger/` for AI category generation.

## Database Changes

### `businesses` table modifications

```sql
-- Add trial tracking fields
ALTER TABLE businesses ADD COLUMN business_type text DEFAULT 'other';
ALTER TABLE businesses ADD COLUMN trial_start_date timestamptz;
ALTER TABLE businesses ADD COLUMN trial_end_date timestamptz;
ALTER TABLE businesses ADD COLUMN onboarding_completed_at timestamptz;

-- Update plan_name constraint for new tiers
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_plan_name_check;
ALTER TABLE businesses ADD CONSTRAINT businesses_plan_name_check
  CHECK (plan_name = ANY (ARRAY['trial'::text, 'starter'::text, 'pro'::text, 'enterprise'::text]));

-- Update subscription_status to include 'expired'
ALTER TABLE businesses DROP CONSTRAINT IF EXISTS businesses_subscription_status_check;
ALTER TABLE businesses ADD CONSTRAINT businesses_subscription_status_check
  CHECK (subscription_status = ANY (ARRAY['active'::text, 'canceled'::text, 'incomplete'::text, 'incomplete_expired'::text, 'past_due'::text, 'paused'::text, 'trialing'::text, 'unpaid'::text, 'expired'::text]));
```

### Team limits by plan

| Plan | Team Limit | Implementation |
|------|------------|----------------|
| Trial | 3 users | Check `business_memberships` count |
| Starter | 3 users | Check `business_memberships` count |
| Pro | 13 users | Check `business_memberships` count |
| Enterprise | Unlimited | No check required |

## Complexity Tracking

> No constitution violations. All changes follow existing patterns.

| Aspect | Approach | Rationale |
|--------|----------|-----------|
| New domain | `src/domains/onboarding/` | Constitution I: Feature isolation |
| Stripe integration | Extend existing `src/lib/stripe/plans.ts` | Constitution IV: Minimal changes |
| AI generation | Trigger.dev background task | Constitution V: Fire-and-forget |
| Category schema | Preserve existing JSONB structure | No breaking changes |

## Code Changes: Plan Configuration

### File: `src/lib/stripe/plans.ts`

**Current State** (to be replaced):
- `free` tier with 5 OCR credits
- `pro` tier with hardcoded price RM 79
- `enterprise` tier with hardcoded price RM 199
- No trial support
- No team limits

**Target State**:
- `trial` tier (14-day, no Stripe price, team limit 3)
- `starter` tier (team limit 3)
- `pro` tier (team limit 13)
- `enterprise` tier (unlimited)
- Remove hardcoded prices (pricing from Stripe)
- Add team limits per plan

### Updated `plans.ts` Structure

```typescript
/**
 * Plan Configuration
 *
 * Defines subscription tiers with team limits and OCR limits.
 * IMPORTANT: Pricing is managed in Stripe - do not hardcode prices here.
 *
 * Plan Tiers:
 * - Trial: 14 days free, no CC required, 3 users, Pro-level features
 * - Starter: 3 users, basic features
 * - Pro: 13 users, advanced features + usage credits
 * - Enterprise: Unlimited users, all features
 */

export const PLANS = {
  trial: {
    name: 'Trial',
    displayName: '14-Day Free Trial',
    priceId: null, // No Stripe product - free trial
    teamLimit: 3,
    ocrLimit: 100, // Pro-level during trial
    features: [
      'Full Pro features for 14 days',
      'No credit card required',
      '3 team members',
      '100 OCR scans/month',
    ],
  },
  starter: {
    name: 'Starter',
    displayName: 'Starter',
    priceId: process.env.STRIPE_STARTER_PRICE_ID ?? null,
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
    name: 'Pro',
    displayName: 'Pro',
    priceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
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
    name: 'Enterprise',
    displayName: 'Enterprise',
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID ?? null,
    teamLimit: -1, // Unlimited
    ocrLimit: -1,  // Unlimited
    features: [
      'Everything in Pro',
      'Unlimited OCR scans',
      'Unlimited team members',
      'API access',
      'Custom branding',
      'Dedicated support',
    ],
  },
} as const;

export type PlanName = keyof typeof PLANS;
export type Plan = (typeof PLANS)[PlanName];
```

### Helper Functions to Update

```typescript
/**
 * Get plan from Stripe price ID
 * Updated to include 'starter' tier
 */
export function getPlanFromPriceId(priceId: string): PlanName {
  if (priceId === process.env.STRIPE_STARTER_PRICE_ID) return 'starter';
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'pro';
  if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) return 'enterprise';
  return 'trial'; // Default to trial instead of free
}

/**
 * Get team limit for a plan
 * Returns -1 for unlimited (Enterprise)
 */
export function getTeamLimit(planName: PlanName): number {
  return PLANS[planName].teamLimit;
}

/**
 * Check if team can add more members
 */
export function canAddTeamMember(planName: PlanName, currentCount: number): boolean {
  const limit = getTeamLimit(planName);
  if (limit === -1) return true; // Unlimited
  return currentCount < limit;
}

/**
 * Get all paid plans for pricing display
 * Updated to include 'starter'
 */
export function getPaidPlans(): Array<{ name: PlanName; plan: Plan }> {
  return [
    { name: 'starter', plan: PLANS.starter },
    { name: 'pro', plan: PLANS.pro },
    { name: 'enterprise', plan: PLANS.enterprise },
  ];
}
```

### Environment Variables

Add to `.env.local`:
```bash
# Stripe Price IDs (get from Stripe Dashboard after creating products)
STRIPE_STARTER_PRICE_ID=price_xxx
STRIPE_PRO_PRICE_ID=price_xxx        # existing, may need update
STRIPE_ENTERPRISE_PRICE_ID=price_xxx # existing, may need update
```

### Breaking Changes Summary

| Change | Old Value | New Value | Impact |
|--------|-----------|-----------|--------|
| Remove `free` tier | `PLANS.free` exists | Removed | Update all `free` references |
| Add `trial` tier | N/A | `PLANS.trial` | New default for signups |
| Add `starter` tier | N/A | `PLANS.starter` | New paid tier |
| Remove `price` field | Hardcoded prices | Removed | Fetch from Stripe API |
| Remove `currency` field | Hardcoded 'MYR' | Removed | Managed in Stripe |
| Add `teamLimit` field | N/A | Per-plan limits | Enforce in team invites |
| Add `displayName` field | N/A | User-friendly names | For UI display |

### Files That Reference `PLANS`

These files need updating when plans.ts changes:

1. `src/lib/stripe/webhook-handlers.ts` - Plan mapping from webhooks
2. `src/domains/billing/hooks/use-subscription.ts` - Subscription state
3. `src/domains/billing/components/*.tsx` - Plan display components
4. Any components that check `planName === 'free'`

## Stripe Dashboard Setup (Manual)

You'll need to create/update in Stripe Dashboard:

1. **Products**:
   - Create "Starter" product
   - Verify "Pro" product exists
   - Verify "Enterprise" product exists

2. **Prices**:
   - Create monthly price for Starter
   - Verify Pro price (update if needed)
   - Verify Enterprise price (update if needed)

3. **Copy Price IDs** to environment variables

## Migration Requirements

**From spec (MR-001 to MR-007):**

1. **MR-001**: Create/update Stripe products for Starter tier
2. **MR-002**: Update Stripe products for Pro tier with credits
3. **MR-003**: Remove free plan logic from codebase (update `src/lib/stripe/plans.ts`)
4. **MR-004**: Update database schema for subscription status (add 'trial', 'expired')
5. **MR-005**: Update credit usage tracking for new plan tiers
6. **MR-006**: Add `trial_start_date` and `trial_end_date` fields to businesses
7. **MR-007**: Implement trial expiration check and plan selection prompt logic

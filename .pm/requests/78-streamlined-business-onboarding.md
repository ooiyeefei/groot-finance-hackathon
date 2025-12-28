# Issue #78: Streamlined Business Onboarding Flow

**GitHub URL:** https://github.com/grootdev-ai/finanseal-mvp/issues/78
**Priority:** P1 - High Priority Enhancement
**WINNING Score:** 45/60
**Created:** 2025-12-28
**Complements:** #73 (Onboarding & Plan Selection Flow)

## Summary

Build a frictionless, multi-step onboarding flow that allows new users to quickly configure their business with custom expense/COGS categories and logo upload. All fields are **optional** with smart defaults.

## Key Features

- 4-step progressive flow (< 60 seconds total)
- Tag-style category input (Gmail label UX)
- Logo upload with drag-and-drop
- All fields optional with smart defaults
- Skip to dashboard in < 10 seconds

## Scope

- [ ] `OnboardingFlow` component with step management
- [ ] `BusinessBasicsStep` - name + currency
- [ ] `TagInput` reusable component
- [ ] `ExpenseCategoriesStep` - tag input
- [ ] `COGSCategoriesStep` - tag input
- [ ] `LogoUploadStep` - drag-and-drop
- [ ] `StepIndicator` - progress indicator
- [ ] Update business creation API
- [ ] Create Supabase bucket `business-logos`
- [ ] localStorage progress persistence

## WINNING Analysis

| Factor | Score | Rationale |
|--------|-------|-----------|
| Worth | 7/10 | Users can work without it, but setup UX is suboptimal |
| Impact | 7/10 | Better activation → better retention → revenue |
| Now | 8/10 | Before launch, improves first impression |
| Necessary | 8/10 | Core to onboarding value prop |
| Implementable | 8/10 | Schema exists, standard UX patterns |
| Notable | 4/10 | Nice differentiator, not a moat |

## Relationship to #73

- **#73 (P0)**: Plan selection, Stripe payment, subscription management
- **#78 (P1)**: Business profile setup, categories, branding

These are **sequential** in the user journey:
```
Sign Up → Plan Selection (#73) → Business Setup (#78) → Dashboard
```

## PRD Location

Full PRD: `.pm/prds/streamlined-business-onboarding.md`

## Next Steps

Implement with: `/speckit.specify #78`

# Implementation Plan: Country-Based Pricing Lockdown

**Branch**: `019-country-pricing-lock` | **Date**: 2026-02-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/019-country-pricing-lock/spec.md`

## Summary

Implement a country-based pricing lockdown that ties billing currency to business identity via verified registration numbers (UEN for Singapore, SSM for Malaysia). The currency dropdown on the pricing page is removed entirely. Authenticated businesses see only their locked currency; unauthenticated visitors see geo-IP-detected pricing. Backend enforcement rejects currency-mismatched checkouts. Existing subscribers are auto-migrated based on their current subscription/country data.

## Technical Context

**Language/Version**: TypeScript 5.9.3
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, Stripe SDK, Clerk 6.30.0, React 19.1.2
**Storage**: Convex (document database with real-time sync), Stripe (billing source of truth)
**Testing**: Manual testing + `npm run build` verification
**Target Platform**: Web (Vercel deployment)
**Project Type**: Web application (Next.js monolith with Convex backend)
**Performance Goals**: Standard web app — pricing page loads in < 2s, checkout validation in < 500ms
**Constraints**: Convex has no native unique constraints (enforce at application layer); currency immutability enforced at application layer
**Scale/Scope**: ~100s of businesses (SME market), 2 countries (SG/MY), 3 plan tiers

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution file is a template (not project-specific). No gates are defined. Proceeding with project conventions from CLAUDE.md:

| Gate | Status | Notes |
|------|--------|-------|
| Git author set to `grootdev-ai` | Pass | Will configure before commits |
| `npm run build` must pass | Pass | Will verify in Phase E |
| `npx convex deploy --yes` after schema changes | Pass | Scheduled in Phase A and E |
| No new files without approval | Pass | Only 1 new file: `src/lib/validation/registration-number.ts` (minimal, shared utility) |
| Prefer modification over creation | Pass | 13 modified files, 1 new file |
| Semantic design tokens (no hardcoded colors) | Pass | New UI follows existing patterns |

**Post-Phase 1 Re-check**: No violations. The design uses existing patterns (Convex mutations, Next.js API routes, React components) without introducing new abstractions or dependencies.

## Project Structure

### Documentation (this feature)

```text
specs/019-country-pricing-lock/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output — research decisions
├── data-model.md        # Phase 1 output — schema extensions
├── quickstart.md        # Phase 1 output — build sequence
├── contracts/           # Phase 1 output — API contracts
│   └── api-contracts.md
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── validation/
│   │   └── registration-number.ts    # NEW: UEN/SSM validation (shared)
│   └── stripe/
│       └── catalog.ts                # MODIFIED: currency resolution
├── domains/
│   ├── onboarding/
│   │   ├── components/
│   │   │   └── business-onboarding-modal.tsx  # MODIFIED: add reg number field
│   │   ├── types/
│   │   │   └── index.ts              # MODIFIED: add businessRegNumber
│   │   ├── hooks/
│   │   │   └── use-onboarding-flow.ts # MODIFIED: add validation
│   │   └── lib/
│   │       └── business-initialization.service.ts # MODIFIED: pass reg number
│   └── billing/
│       ├── components/
│       │   ├── pricing-table.tsx      # MODIFIED: remove currency dropdown
│       │   └── billing-settings-content.tsx # MODIFIED: locked currency display
│       └── hooks/
│           └── use-catalog.ts         # MODIFIED: handle currencyLocked flag
├── app/
│   ├── [locale]/
│   │   └── pricing/
│   │       └── page.tsx              # MODIFIED: remove currency switching
│   └── api/v1/
│       ├── billing/
│       │   ├── checkout/route.ts     # MODIFIED: currency mismatch validation
│       │   └── catalog/route.ts      # MODIFIED: locked currency override
│       └── onboarding/
│           ├── initialize-business/route.ts  # MODIFIED: require reg number
│           └── start-trial/route.ts  # MODIFIED: currency-matched price
convex/
├── schema.ts                          # MODIFIED: add fields + index
└── functions/
    └── businesses.ts                  # MODIFIED: extend + new mutations
```

**Structure Decision**: This feature modifies the existing Next.js + Convex monolith. No new directories or architectural patterns introduced. The only new file is a shared validation utility.

## Complexity Tracking

No complexity violations. The implementation:
- Adds 2 fields to an existing table (not a new table)
- Creates 1 new utility file (validation, no dependencies)
- Modifies existing API routes and components (no new routes)
- Uses existing patterns throughout (Convex mutations, Zod validation, React state)

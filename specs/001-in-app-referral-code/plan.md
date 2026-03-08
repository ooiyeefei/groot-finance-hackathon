# Implementation Plan: In-App Referral Code System

**Branch**: `001-in-app-referral-code` | **Date**: 2026-03-07 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-in-app-referral-code/spec.md`

## Summary

Build a universal in-app referral code system where every Groot Finance user (any role) gets a unique code (`GR-FIN-XXXXX`) to share. Referred businesses get RM 100 off annual plans; referrers earn RM 80–500 bounty. Attribution flows through Stripe Promotion Codes synced with Convex referral records. Real-time dashboard shows referral status as businesses progress through trial → paid → upgraded. Primary entry point: animated "Earn $" icon in the top header bar.

## Technical Context

**Language/Version**: TypeScript 5.9.3
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, Stripe SDK, Clerk 6.30.0, React 19.1.2
**Storage**: Convex (document database with real-time subscriptions)
**Testing**: Manual testing + UAT (existing project pattern)
**Target Platform**: Web (desktop + mobile responsive), Capacitor iOS shell
**Project Type**: Web application (Next.js + Convex)
**Performance Goals**: Referral page loads < 2s on 4G; status updates < 30s after webhook
**Constraints**: Clerk locked at 6.30.0; Stripe is billing source of truth; per-user codes (not per-business)
**Scale/Scope**: ~1000 users initially; ~100 referral codes in first quarter; 2 new Convex tables, 6 new UI components

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitution is a blank template — no project-specific gates defined. Proceeding with CLAUDE.md rules:
- [x] No screenshots/binary files in git
- [x] Prefer modification over creation (extending existing checkout, webhook, header, schema)
- [x] Semantic design tokens (bg-card, text-foreground, bg-primary)
- [x] Button styling: action buttons use bg-primary hover:bg-primary/90 text-primary-foreground
- [x] Security: Clerk auth for user-facing endpoints; internal mutations for backend-only operations
- [x] AWS-first for AWS operations: N/A (no new AWS resources needed — Stripe + Convex only)
- [x] Convex deploy required after schema/function changes

## Project Structure

### Documentation (this feature)

```text
specs/001-in-app-referral-code/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0: research findings
├── data-model.md        # Phase 1: data model design
├── quickstart.md        # Phase 1: implementation guide
├── contracts/           # Phase 1: API contracts
│   └── api.md           # Convex functions + API routes
├── checklists/
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2: task breakdown (next step)
```

### Source Code (repository root)

```text
# New files
src/domains/referral/
├── components/
│   ├── referral-dashboard.tsx       # Main dashboard: code, stats, referral list
│   ├── referral-opt-in.tsx          # One-tap opt-in card
│   ├── referral-code-display.tsx    # Code display with copy/share buttons
│   ├── referral-stats-cards.tsx     # Stats: total, trial, paid, earnings
│   ├── referral-list.tsx            # List of referred businesses with status
│   └── earn-header-button.tsx       # "Earn $" animated header icon
├── hooks/
│   └── use-referral.ts              # React hooks for referral queries
└── lib/
    └── referral-utils.ts            # Code generation, earning calculation

convex/functions/
└── referral.ts                      # All referral queries, mutations, actions

# Modified files
convex/schema.ts                     # Add referral_codes + referrals tables, extend businesses
src/components/ui/header-with-user.tsx  # Add "Earn $" button
src/app/api/v1/billing/checkout/route.ts  # Add allow_promotion_codes
src/lib/stripe/webhook-handlers-convex.ts  # Extend for referral attribution
src/app/[locale]/business-settings/...    # Add Referral tab (optional secondary access)
```

**Structure Decision**: New `src/domains/referral/` domain follows existing domain pattern (e.g., `src/domains/billing/`, `src/domains/notifications/`). Convex functions in single `referral.ts` file following existing pattern of one file per domain.

## Complexity Tracking

No constitution violations to justify — design follows existing patterns.

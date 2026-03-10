# Implementation Plan: Reseller Code System

**Branch**: `001-reseller-code-system` | **Date**: 2026-03-10 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-reseller-code-system/spec.md`

## Summary

Extend the existing referral code system to support reseller codes (`GR-RES-*`) with higher discounts (RM 200 off) and commissions (RM 300/800 vs RM 80/200). The implementation adds code-type branching to the existing commission calculation and dashboard messaging — no new tables, no schema changes.

## Technical Context

**Language/Version**: TypeScript 5.9.3
**Primary Dependencies**: Next.js 15.5.7, Convex 1.31.3, React 19.1.2
**Storage**: Convex (existing `referral_codes` and `referrals` tables — no schema changes)
**Testing**: Manual testing via Convex dashboard + production verification
**Target Platform**: Web (Next.js)
**Project Type**: Web application (monorepo)
**Performance Goals**: N/A — no new queries or endpoints
**Constraints**: < 50 resellers, manual onboarding only
**Scale/Scope**: 3 files modified, ~30 lines of code changed

## Constitution Check

*No constitution gates defined (template only). Proceeding.*

## Project Structure

### Documentation (this feature)

```text
specs/001-reseller-code-system/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Research decisions
├── data-model.md        # Entity documentation
├── quickstart.md        # Implementation quickstart
├── contracts/           # API contracts
│   ├── convex-functions.md
│   └── frontend-components.md
├── checklists/
│   └── requirements.md  # Quality checklist
└── tasks.md             # Implementation tasks (next step)
```

### Source Code (files to modify)

```text
groot-finance/
├── convex/functions/referral.ts          # Backend: commission branching
├── src/domains/referral/
│   ├── lib/referral-utils.ts             # Frontend: calculateEarning + helpers
│   └── components/
│       ├── referral-dashboard.tsx         # Pass codeType to children
│       ├── referral-code-display.tsx      # Dynamic discount amount
│       ├── referral-list.tsx              # Dynamic empty state copy
│       └── referral-opt-in.tsx            # Dynamic commission range
```

**Structure Decision**: No new files. All changes are branches within existing code.

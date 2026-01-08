# Implementation Plan: UX/UI Theme Consistency & Layout Shift Prevention

**Branch**: `005-uiux-theme-cls` | **Date**: 2026-01-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-uiux-theme-cls/spec.md`

## Summary

Fix critical UX/UI issues before soft launch: convert 80+ components from hardcoded Tailwind colors to semantic design tokens for proper light/dark theme support, and add skeleton loaders to 9+ components to achieve Lighthouse CLS score <0.1. This is a refactoring effort focused on existing components with no new features.

## Technical Context

**Language/Version**: TypeScript 5.9.3
**Primary Dependencies**: Next.js 15.5.7, React 19.1.2, Tailwind CSS, CVA (class-variance-authority)
**Storage**: N/A (no database changes - CSS/component refactoring only)
**Testing**: Vitest (unit), Playwright (E2E), Lighthouse (CLS validation)
**Target Platform**: Web (Desktop & Mobile browsers)
**Project Type**: Web application (Next.js App Router)
**Performance Goals**: CLS <0.1, FCP <1.8s
**Constraints**: WCAG AA contrast (4.5:1 minimum), no visual regressions
**Scale/Scope**: 80+ components across 5 UI files + 3 domain directories + 9 skeleton additions

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: No constitution configured for this project. Using CLAUDE.md as development guidelines.

| Gate | Status | Notes |
|------|--------|-------|
| Constitution file | N/A | Template only - no project-specific constitution |
| CLAUDE.md guidelines | ✅ PASS | Design system rules defined in `src/components/ui/CLAUDE.md` |
| Build validation | Required | Must run `npm run build` after changes per CLAUDE.md |

**No blocking gates.** Proceed with Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/005-uiux-theme-cls/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (minimal - no data changes)
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (N/A - no API changes)
├── checklists/          # Quality validation
│   └── requirements.md  # Spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks command)
```

### Source Code (repository root)

```text
src/
├── app/
│   └── globals.css          # Semantic token definitions (Layer 1)
├── components/ui/           # Shared UI components (5 files to fix)
│   ├── badge.tsx            # Priority fix
│   ├── button.tsx           # Priority fix
│   ├── action-button.tsx    # Priority fix
│   ├── role-badge.tsx       # Priority fix
│   ├── sidebar.tsx          # Priority fix
│   └── skeleton.tsx         # Existing skeleton component
├── domains/
│   ├── expense-claims/components/    # 11 files to fix
│   ├── analytics/components/         # 7 files to fix
│   └── account-management/components/ # 6 files to fix
└── ...
```

**Structure Decision**: No structural changes. This is a refactoring effort within the existing domain-driven architecture. All changes are in-place modifications to existing component files.

## Complexity Tracking

> No complexity violations. This feature follows the simplest possible approach:
> - In-place edits to existing files (no new abstractions)
> - Uses existing semantic token system (no new design patterns)
> - Leverages existing Skeleton component (no new components)

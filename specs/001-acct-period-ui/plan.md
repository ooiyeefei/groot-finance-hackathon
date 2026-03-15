# Implementation Plan: Accounting Periods UI

**Branch**: `001-acct-period-ui` | **Date**: 2026-03-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-acct-period-ui/spec.md`

## Summary

Build frontend UI for the existing accounting periods backend. Add a "Periods" tab to the Accounting page with period list, close/lock/reopen actions, confirmation dialogs, and period status badges on journal entries. Backend is already complete — this is a pure frontend feature following existing accounting module patterns.

## Technical Context

**Language/Version**: TypeScript 5.9.3, Next.js 15.5.7, React 19.1.2
**Primary Dependencies**: Convex 1.31.3, Clerk 6.30.0, Radix UI (Dialog, Badge), lucide-react, sonner (toast)
**Storage**: Convex document database (existing `accounting_periods` + `journal_entries` tables)
**Testing**: Manual UAT via build verification (`npm run build`)
**Target Platform**: Web (desktop + mobile responsive)
**Project Type**: Web application (Next.js + Convex)
**Performance Goals**: Period list loads within 2 seconds
**Constraints**: No backend changes required. Follow existing accounting module patterns exactly.
**Scale/Scope**: 4 new files, 3 modified files

## Constitution Check

*Constitution not configured for this project — no gates to enforce.*

## Project Structure

### Documentation (this feature)

```text
specs/001-acct-period-ui/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Codebase pattern research
├── data-model.md        # Entity model
└── tasks.md             # Implementation tasks
```

### Source Code (files to create/modify)

```text
# NEW FILES
src/domains/accounting/hooks/use-accounting-periods.ts      # Convex query/mutation hook
src/app/[locale]/accounting/periods/page.tsx                 # Server component (page shell)
src/app/[locale]/accounting/periods/periods-content.tsx      # Client component (periods table + dialogs)

# MODIFIED FILES
src/app/[locale]/accounting/accounting-tabs.tsx              # Add "Periods" tab
src/app/[locale]/accounting/journal-entries/journal-entries-content.tsx  # Add period badges + lock enforcement
src/app/[locale]/accounting/journal-entries/new/new-journal-entry-content.tsx  # Add inline date validation
```

**Structure Decision**: Follows existing accounting module pattern — server page shell wraps client content component, data fetched via domain hook.
